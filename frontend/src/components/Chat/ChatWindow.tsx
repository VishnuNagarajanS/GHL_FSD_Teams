'use client';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Avatar from '@/components/UI/Avatar';
import api from '@/lib/api';

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🔥', '👏', '✅', '💯', '🙏', '😊'];

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  sender_photo?: string;
  content: string;
  is_deleted: number;
  is_edited: number;
  created_at: string;
  reactions: { emoji: string; user_id: string; user_name: string; }[];
  files: { id: string; original_name: string; mime_type: string; size: number; }[];
}

import { Conversation, ConversationMember } from '@/types/chat';
export type ConvMember = ConversationMember;

interface ChatWindowProps {
  conversation: Conversation;
  presence: Record<string, 'online' | 'offline' | 'in_call' | string>;
  onStartCall: (convId: string, members: ConvMember[], callMode: 'video' | 'audio') => void;
  onJoinCall?: (meetingId: string, callMode?: 'video' | 'audio') => void;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function fileIcon(mime: string) {
  if (mime.startsWith('image/')) return '🖼️';
  if (mime === 'application/pdf') return '📄';
  if (mime.includes('word')) return '📝';
  if (mime.includes('excel') || mime.includes('spreadsheet')) return '📊';
  if (mime.includes('powerpoint') || mime.includes('presentation')) return '📎';
  if (mime.startsWith('video/')) return '🎥';
  return '📁';
}

export default function ChatWindow({ conversation, presence, onStartCall, onJoinCall }: ChatWindowProps) {
  const { user, socket } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const [showEmoji, setShowEmoji] = useState<string | null>(null); // messageId for reaction picker
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<{ id: string; name: string; size: number; }[]>([]);
  const [uploading, setUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load messages
  useEffect(() => {
    setMessages([]);
    setLoading(true);
    api.getMessages(conversation.id).then(data => {
      setMessages(data.messages || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [conversation.id]);

  // Socket events
  useEffect(() => {
    if (!socket) return;
    socket.emit('conv:join', conversation.id);

    const onNewMsg = (msg: Message) => {
      if (msg.conversation_id === conversation.id) {
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        // Mark as read
        api.markRead(conversation.id, msg.id).catch(() => {});
      }
    };

    const onUpdated = (msg: Message) => {
      if (msg.conversation_id === conversation.id) {
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, ...msg } : m));
      }
    };

    const onDeleted = ({ id }: { id: string }) => {
      setMessages(prev => prev.map(m => m.id === id ? { ...m, is_deleted: 1, content: '' } : m));
    };

    const onReaction = ({ messageId, reactions }: { messageId: string; reactions: Message['reactions'] }) => {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions } : m));
    };

    const onTyping = ({ userId, userName, isTyping, conversationId }: { userId: string; userName: string; isTyping: boolean; conversationId: string }) => {
      if (conversationId !== conversation.id || userId === user?.id) return;
      setTypingUsers(prev => {
        if (isTyping) return { ...prev, [userId]: userName };
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    };

    socket.on('message:new', onNewMsg);
    socket.on('message:updated', onUpdated);
    socket.on('message:deleted', onDeleted);
    socket.on('message:reaction', onReaction);
    socket.on('message:typing', onTyping);

    return () => {
      socket.off('message:new', onNewMsg);
      socket.off('message:updated', onUpdated);
      socket.off('message:deleted', onDeleted);
      socket.off('message:reaction', onReaction);
      socket.off('message:typing', onTyping);
    };
  }, [socket, conversation.id, user?.id]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Mark as read on open
  useEffect(() => {
    if (messages.length > 0) {
      api.markRead(conversation.id, messages[messages.length - 1].id).catch(() => {});
    }
  }, [conversation.id, messages]);

  function handleTyping() {
    socket?.emit('message:typing', { conversationId: conversation.id, isTyping: true });
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      socket?.emit('message:typing', { conversationId: conversation.id, isTyping: false });
    }, 2000);
  }

  async function sendMessage() {
    const content = input.trim();
    if (!content && uploadedFiles.length === 0) return;
    setSending(true);
    try {
      const attachmentIds = uploadedFiles.map(f => f.id);
      const newMsg = await api.sendMessage(conversation.id, content, attachmentIds);
      if (newMsg && newMsg.id) {
        setMessages(prev => {
          if (prev.some(m => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      }
      setInput('');
      setUploadedFiles([]);
      socket?.emit('message:typing', { conversationId: conversation.id, isTyping: false });
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('conversationId', conversation.id);
      const res = await api.uploadFile(fd);
      setUploadedFiles(prev => [...prev, { id: res.id, name: res.original_name, size: res.size }]);
    } catch (err: unknown) {
      alert((err as Error).message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleReaction(msgId: string, emoji: string) {
    setShowEmoji(null);
    await api.addReaction(msgId, emoji);
  }

  async function handleEdit(msg: Message) {
    setEditingId(msg.id);
    setEditContent(msg.content);
  }

  async function submitEdit() {
    if (!editingId) return;
    await api.editMessage(editingId, editContent);
    setEditingId(null);
  }

  async function handleDelete(msgId: string) {
    if (!confirm('Delete this message?')) return;
    await api.deleteMessage(msgId);
  }

  const getConvTitle = () => {
    if (conversation.type === 'dm') {
      const other = conversation.members.find(m => m.id !== user?.id);
      return other?.name || 'Direct Message';
    }
    return conversation.name || 'Group Chat';
  };

  const getConvMember = () => conversation.type === 'dm' ? conversation.members.find(m => m.id !== user?.id) : null;
  const otherMember = getConvMember();
  const otherStatus = otherMember ? (presence[otherMember.id] || otherMember.status) : 'offline';
  const isOtherOnline = otherStatus === 'online';
  const isOtherInCall = otherStatus === 'in_call';

  const typingNames = Object.values(typingUsers);

  // Group consecutive messages by sender
  const groupedMessages: { messages: Message[]; senderId: string; senderName: string; senderPhoto?: string; }[] = [];
  messages.forEach(msg => {
    const last = groupedMessages[groupedMessages.length - 1];
    if (last && last.senderId === msg.sender_id && !msg.is_deleted && !msg.content.startsWith('[CALL:')) {
      last.messages.push(msg);
    } else {
      groupedMessages.push({ messages: [msg], senderId: msg.sender_id, senderName: msg.sender_name, senderPhoto: msg.sender_photo });
    }
  });

  return (
    <div className="chat-container" onClick={() => setShowEmoji(null)}>
      {/* Header */}
      <div className="chat-header">
        {conversation.type === 'dm' && otherMember ? (
          <Avatar name={otherMember.name} photoUrl={otherMember.photo_url} size="md" status={otherStatus} />
        ) : (
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #7c3aed, #2d6fe8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.125rem' }}>👥</div>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: '1rem' }}>{getConvTitle()}</div>
          {conversation.type === 'dm' ? (
            isOtherInCall ? (
              <div style={{ fontSize: '0.8rem', color: '#f59e0b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span>📞</span> In a call
              </div>
            ) : isOtherOnline ? (
              <div style={{ fontSize: '0.8rem', color: 'var(--status-online)' }}>● Online</div>
            ) : (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>○ Offline</div>
            )
          ) : (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {conversation.members.length} members · {conversation.members.filter(m => (presence[m.id] || m.status) === 'online').length} online
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className="btn-icon"
            title="Start Voice Call"
            onClick={() => onStartCall(conversation.id, conversation.members, 'audio')}
            style={{ fontSize: '1.2rem', padding: '6px 8px' }}
          >
            📞
          </button>
          <button
            className="btn-icon"
            title="Start Video Meeting"
            onClick={() => onStartCall(conversation.id, conversation.members, 'video')}
            style={{ fontSize: '1.2rem', padding: '6px 8px' }}
          >
            📹
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
            <div className="spinner" />
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="empty-state" style={{ flex: 1 }}>
            <div className="empty-state-icon">💬</div>
            <div className="empty-state-text">No messages yet</div>
            <div className="empty-state-subtext">Say hello to start the conversation!</div>
          </div>
        )}

        {groupedMessages.map((group, gi) => {
          const isOwn = group.senderId === user?.id;
          return (
            <div key={gi} className={`message-group ${isOwn ? 'own' : ''}`}>
              {!isOwn && (
                <Avatar name={group.senderName} photoUrl={group.senderPhoto} size="md" />
              )}
              <div className="message-content-wrapper">
                {!isOwn && (
                  <div className="message-meta">
                    <span className="message-sender-name">{group.senderName}</span>
                  </div>
                )}
                {group.messages.map((msg) => (
                  <div key={msg.id} style={{ position: 'relative' }}>
                    {/* Call Card rendering */}
                    {msg.content.startsWith('[CALL:') ? (
                      (() => {
                        try {
                          const callData = JSON.parse(msg.content.slice(6, -1));
                          const isAudio = callData.callMode === 'audio';
                          const isActive = callData.status === 'active';
                          return (
                            <div className={`call-card ${isActive ? 'active' : ''}`}>
                              <div className={`call-card-icon ${isAudio ? 'audio' : ''}`}>
                                {isAudio ? '📞' : '📹'}
                              </div>
                              <div className="call-card-body">
                                <div className="call-card-title">
                                  <span>{isAudio ? 'Voice Call' : 'Video Meeting'}</span>
                                  {isActive && (
                                    <span style={{ fontSize: '0.68rem', background: '#10b981', color: '#fff', padding: '2px 6px', borderRadius: 4, fontWeight: 700, letterSpacing: '0.5px' }}>
                                      LIVE
                                    </span>
                                  )}
                                </div>
                                <div className="call-card-meta">
                                  {isActive
                                    ? `Started by ${callData.hostName || group.senderName}`
                                    : `Call ended · ${callData.duration || '0s'}`}
                                </div>
                              </div>
                              {isActive && onJoinCall && (
                                <button
                                  className="call-card-join-btn"
                                  onClick={() => onJoinCall(callData.meetingId, callData.callMode)}
                                >
                                  Join Call
                                </button>
                              )}
                            </div>
                          );
                        } catch {
                          return <div className="message-bubble other">{msg.content}</div>;
                        }
                      })()
                    ) : editingId === msg.id ? (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                        <textarea
                          className="form-input"
                          value={editContent}
                          onChange={e => setEditContent(e.target.value)}
                          style={{ resize: 'none', minHeight: 40 }}
                          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), submitEdit())}
                          autoFocus
                        />
                        <button className="btn btn-primary btn-sm" onClick={submitEdit}>Save</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                      </div>
                    ) : (
                      <div
                        className={`message-bubble ${isOwn ? 'own' : 'other'} ${msg.is_deleted ? 'deleted' : ''} ${msg.is_edited && !msg.is_deleted ? 'edited' : ''}`}
                        onMouseEnter={() => {}}
                        style={{ cursor: 'default' }}
                      >
                        {msg.is_deleted ? 'This message was deleted' : msg.content}

                        {/* File attachments */}
                        {msg.files && msg.files.length > 0 && !msg.is_deleted && (
                          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {msg.files.map(f => (
                              <a
                                key={f.id}
                                href={api.downloadUrl(f.id)}
                                className="file-attachment"
                                target="_blank"
                                rel="noreferrer"
                                style={{ textDecoration: 'none', color: 'inherit' }}
                              >
                                <span className="file-attachment-icon">{fileIcon(f.mime_type)}</span>
                                <span className="file-attachment-name">{f.original_name}</span>
                                <span className="file-attachment-size">{formatFileSize(f.size)}</span>
                                <span>⬇️</span>
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Timestamp + actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, justifyContent: isOwn ? 'flex-end' : 'flex-start' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{formatTime(msg.created_at)}</span>
                      {!msg.is_deleted && !msg.content.startsWith('[CALL:') && (
                        <div style={{ display: 'flex', gap: 2, opacity: 0, transition: 'opacity 150ms' }}
                          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                          onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
                          className="msg-actions"
                        >
                          <button
                            className="btn-icon"
                            style={{ padding: '2px 4px', fontSize: '0.8rem' }}
                            onClick={e => { e.stopPropagation(); setShowEmoji(showEmoji === msg.id ? null : msg.id); }}
                          >😊</button>
                          {isOwn && (
                            <>
                              <button className="btn-icon" style={{ padding: '2px 4px', fontSize: '0.8rem' }} onClick={() => handleEdit(msg)}>✏️</button>
                              <button className="btn-icon" style={{ padding: '2px 4px', fontSize: '0.8rem' }} onClick={() => handleDelete(msg.id)}>🗑️</button>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Inline emoji picker */}
                    {showEmoji === msg.id && (
                      <div
                        onClick={e => e.stopPropagation()}
                        style={{
                          position: 'absolute',
                          [isOwn ? 'right' : 'left']: 0,
                          bottom: 'calc(100% + 4px)',
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border-default)',
                          borderRadius: 12,
                          padding: 8,
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 4,
                          width: 200,
                          boxShadow: 'var(--shadow-md)',
                          zIndex: 100,
                        }}
                      >
                        {EMOJIS.map(em => (
                          <button key={em} className="emoji-btn" onClick={() => handleReaction(msg.id, em)}>{em}</button>
                        ))}
                      </div>
                    )}

                    {/* Reactions */}
                    {msg.reactions && msg.reactions.length > 0 && !msg.is_deleted && (
                      <div className="message-reactions">
                        {Object.entries(
                          msg.reactions.reduce<Record<string, { count: number; myReaction: boolean }>>((acc, r) => {
                            if (!acc[r.emoji]) acc[r.emoji] = { count: 0, myReaction: false };
                            acc[r.emoji].count++;
                            if (r.user_id === user?.id) acc[r.emoji].myReaction = true;
                            return acc;
                          }, {})
                        ).map(([emoji, { count, myReaction }]) => (
                          <button
                            key={emoji}
                            className={`reaction-badge ${myReaction ? 'active' : ''}`}
                            onClick={() => handleReaction(msg.id, emoji)}
                          >
                            {emoji} <span style={{ fontSize: '0.75rem' }}>{count}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {isOwn && (
                <Avatar name={user?.name || 'U'} photoUrl={user?.photo_url} size="md" />
              )}
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Typing indicator */}
      <div className="typing-indicator">
        {typingNames.length > 0 && (
          <>
            <div className="typing-dots">
              <div className="typing-dot" />
              <div className="typing-dot" />
              <div className="typing-dot" />
            </div>
            <span>
              {typingNames.length === 1
                ? `${typingNames[0]} is typing...`
                : `${typingNames.slice(0, 2).join(', ')} are typing...`}
            </span>
          </>
        )}
      </div>

      {/* Message input */}
      <div className="message-input-area">
        {/* Uploaded files preview */}
        {uploadedFiles.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            {uploadedFiles.map(f => (
              <div key={f.id} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', background: 'var(--bg-elevated)',
                border: '1px solid var(--accent-primary)', borderRadius: 20,
                fontSize: '0.8125rem'
              }}>
                <span>📎</span>
                <span style={{ color: 'var(--text-primary)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                <span style={{ color: 'var(--text-muted)' }}>{formatFileSize(f.size)}</span>
                <button
                  style={{ border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem' }}
                  onClick={() => setUploadedFiles(prev => prev.filter(x => x.id !== f.id))}
                >✕</button>
              </div>
            ))}
          </div>
        )}

        <div className="message-input-box">
          <input
            ref={fileInputRef}
            type="file"
            style={{ display: 'none' }}
            onChange={handleFileUpload}
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
          />
          <button
            className="btn-icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            title="Attach file"
            style={{ fontSize: '1.125rem', flexShrink: 0 }}
          >
            {uploading ? <div className="spinner" style={{ width: 16, height: 16 }} /> : '📎'}
          </button>

          <textarea
            ref={textareaRef}
            className="message-textarea"
            placeholder={`Message ${getConvTitle()}...`}
            value={input}
            onChange={e => {
              setInput(e.target.value);
              handleTyping();
              // Auto-resize
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onKeyDown={handleKeyDown}
            rows={1}
          />

          <button
            className="btn-icon"
            onClick={sendMessage}
            disabled={sending || (!input.trim() && uploadedFiles.length === 0)}
            style={{
              fontSize: '1.125rem', flexShrink: 0,
              color: (input.trim() || uploadedFiles.length > 0) ? 'var(--accent-primary)' : 'var(--text-muted)',
              transform: (input.trim() || uploadedFiles.length > 0) ? 'scale(1.1)' : 'scale(1)',
              transition: 'all 150ms',
            }}
          >
            {sending ? <div className="spinner" style={{ width: 16, height: 16 }} /> : '📨'}
          </button>
        </div>
      </div>

      <style>{`
        .message-group:hover .msg-actions { opacity: 1 !important; }
      `}</style>
    </div>
  );
}
