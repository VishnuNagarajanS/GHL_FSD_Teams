'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from '@/components/Sidebar/Sidebar';
import ChatWindow, { ConvMember } from '@/components/Chat/ChatWindow';
import MeetingRoom from '@/components/Meeting/MeetingRoom';
import api from '@/lib/api';
import Avatar from '@/components/UI/Avatar';
import { Conversation } from '@/types/chat';

interface User { id: string; name: string; email: string; photo_url: string; designation: string; status: string; }
interface Notification {
  id: string; type: string; payload: Record<string, string>; is_read: number; created_at: string;
}
interface Meeting {
  id: string;
  participants: { id: string; name: string; photo_url?: string; }[];
  callMode?: 'video' | 'audio';
}

interface IncomingCall {
  meetingId: string;
  callMode: 'video' | 'audio';
  hostId: string;
  hostName: string;
  hostPhoto?: string;
  conversationId?: string;
}

export default function ChatPage() {
  const { user, socket, isLoading } = useAuth();
  const router = useRouter();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [presence, setPresence] = useState<Record<string, 'online' | 'offline' | 'in_call' | string>>({});
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showNewDM, setShowNewDM] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [activeMeeting, setActiveMeeting] = useState<Meeting | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [dmTarget, setDmTarget] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [dmSearch, setDmSearch] = useState('');

  // Redirect if not auth
  useEffect(() => {
    if (!isLoading && !user) router.push('/login');
  }, [user, isLoading, router]);

  // Load conversations
  const loadConversations = useCallback(async () => {
    try {
      const data = await api.getConversations();
      setConversations(data.conversations || []);
    } catch (e) { console.error(e); }
  }, []);

  // Load notifications
  const loadNotifications = useCallback(async () => {
    try {
      const data = await api.getNotifications();
      setNotifications(data.notifications || []);
    } catch (e) { console.error(e); }
  }, []);

  // Load users for DM/group creation
  useEffect(() => {
    if (!user) return;
    api.getUsers({ limit: '200' }).then(d => setAllUsers(d.users || [])).catch(() => {});
    loadConversations();
    loadNotifications();
  }, [user, loadConversations, loadNotifications]);

  // Socket events for presence, calls, and notifications
  useEffect(() => {
    if (!socket) return;

    const onPresence = (data: { userId: string; status: 'online' | 'offline' | 'in_call' }) => {
      setPresence(prev => ({ ...prev, [data.userId]: data.status }));
      setConversations(prev => prev.map(c => ({
        ...c,
        members: c.members.map(m => m.id === data.userId ? { ...m, status: data.status } : m)
      })));
    };

    const onNotif = (notif: Notification) => {
      setNotifications(prev => [notif, ...prev]);
    };

    const onNewMsg = () => {
      loadConversations();
    };

    const onConvNew = (conv: Conversation) => {
      setConversations(prev => {
        if (prev.some(c => c.id === conv.id)) return prev;
        return [conv, ...prev];
      });
    };

    const onIncomingCall = (data: IncomingCall) => {
      setIncomingCall(data);
    };

    const onCallDeclined = (data: { userName: string }) => {
      alert(`${data.userName} declined the call.`);
    };

    socket.on('presence:changed', onPresence);
    socket.on('notification:new', onNotif);
    socket.on('message:new', onNewMsg);
    socket.on('message:updated', loadConversations);
    socket.on('conversation:new', onConvNew);
    socket.on('call:incoming', onIncomingCall);
    socket.on('call:declined', onCallDeclined);

    return () => {
      socket.off('presence:changed', onPresence);
      socket.off('notification:new', onNotif);
      socket.off('message:new', onNewMsg);
      socket.off('message:updated', loadConversations);
      socket.off('conversation:new', onConvNew);
      socket.off('call:incoming', onIncomingCall);
      socket.off('call:declined', onCallDeclined);
    };
  }, [socket, loadConversations]);

  async function startDM() {
    const target = allUsers.find(u => u.id === dmTarget || u.email === dmSearch || u.name.toLowerCase().includes(dmSearch.toLowerCase()));
    if (!target) return;
    const conv = await api.createConversation({ type: 'dm', memberIds: [target.id] });
    setShowNewDM(false);
    setDmSearch('');
    await loadConversations();
    setActiveConv(conv);
  }

  async function startGroup() {
    if (!groupName.trim() || groupMembers.length === 0) return;
    const conv = await api.createConversation({ type: 'group', name: groupName, memberIds: groupMembers });
    setShowNewGroup(false);
    setGroupName('');
    setGroupMembers([]);
    await loadConversations();
    setActiveConv(conv);
  }

  async function startCall(convId: string, members: Conversation['members'], callMode: 'video' | 'audio' = 'video') {
    try {
      const inviteeIds = members.filter(m => m.id !== user?.id).map(m => m.id);
      const meeting = await api.createMeeting({
        type: inviteeIds.length === 1 ? '1:1' : 'group',
        inviteeIds,
        conversationId: convId,
        callMode,
      });
      await api.joinMeeting(meeting.meetingId);
      setActiveMeeting({
        id: meeting.meetingId,
        participants: members,
        callMode,
      });
    } catch (e) {
      console.error(e);
    }
  }

  async function joinCallFromCard(meetingId: string, callMode: 'video' | 'audio' = 'video') {
    try {
      const meetingData = await api.getMeeting(meetingId);
      await api.joinMeeting(meetingId);
      setActiveMeeting({
        id: meetingId,
        participants: meetingData.participants || [],
        callMode: meetingData.call_mode || callMode,
      });
    } catch (e) {
      console.error(e);
    }
  }

  async function acceptIncomingCall() {
    if (!incomingCall) return;
    const call = incomingCall;
    setIncomingCall(null);
    await joinCallFromCard(call.meetingId, call.callMode);
  }

  function declineIncomingCall() {
    if (!incomingCall) return;
    socket?.emit('call:decline', {
      meetingId: incomingCall.meetingId,
      hostId: incomingCall.hostId,
    });
    setIncomingCall(null);
  }

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const filteredUsers = allUsers.filter(u =>
    u.id !== user?.id &&
    (u.name.toLowerCase().includes(dmSearch.toLowerCase()) || u.email.toLowerCase().includes(dmSearch.toLowerCase()))
  );

  if (isLoading || !user) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    );
  }

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <Sidebar
        conversations={conversations}
        activeConvId={activeConv?.id || null}
        onSelectConv={conv => setActiveConv(conv)}
        onNewDM={() => setShowNewDM(true)}
        onNewGroup={() => setShowNewGroup(true)}
        presence={presence}
      />

      {/* Main content */}
      <div className="main-content" style={{ position: 'relative' }}>
        {/* Top bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          padding: '8px 16px',
          borderBottom: '1px solid var(--border-muted)',
          background: 'var(--bg-surface)',
          gap: 8,
          flexShrink: 0,
        }}>
          <a href="/profile" style={{
            display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none',
            color: 'var(--text-secondary)', fontSize: '0.875rem',
          }}>
            <Avatar name={user.name} photoUrl={user.photo_url} size="sm" />
            <span>{user.name}</span>
            <span className={`badge ${user.role === 'admin' ? 'badge-red' : user.role === 'manager' ? 'badge-blue' : 'badge-green'}`}>
              {user.role}
            </span>
          </a>

          {/* Notification bell */}
          <div style={{ position: 'relative' }}>
            <button
              className="btn-icon"
              onClick={() => setShowNotifications(!showNotifications)}
              style={{ position: 'relative', fontSize: '1.25rem' }}
            >
              🔔
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute', top: 2, right: 2,
                  width: 16, height: 16, borderRadius: '50%',
                  background: 'var(--accent-danger)',
                  fontSize: '0.65rem', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', border: '2px solid var(--bg-surface)',
                }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="notification-panel" onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-muted)' }}>
                  <span style={{ fontWeight: 600 }}>Notifications</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {unreadCount > 0 && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={async () => { await api.markAllNotificationsRead(); loadNotifications(); }}
                      >
                        Mark all read
                      </button>
                    )}
                    <button className="btn-icon" onClick={() => setShowNotifications(false)}>✕</button>
                  </div>
                </div>
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  {notifications.length === 0 ? (
                    <div className="empty-state" style={{ padding: '32px 16px' }}>
                      <div className="empty-state-icon">🔔</div>
                      <div className="empty-state-text">No notifications</div>
                    </div>
                  ) : notifications.map(n => (
                    <div
                      key={n.id}
                      className={`notification-item ${!n.is_read ? 'unread' : ''}`}
                      onClick={async () => {
                        if (!n.is_read) {
                          await api.markNotificationRead(n.id);
                          loadNotifications();
                        }
                        if (n.type === 'message' && n.payload.conversationId) {
                          const conv = conversations.find(c => c.id === n.payload.conversationId);
                          if (conv) setActiveConv(conv);
                        }
                        setShowNotifications(false);
                      }}
                    >
                      <span style={{ fontSize: '1.5rem' }}>
                        {n.type === 'message' ? '💬' : n.type === 'mention' ? '@️' : n.type === 'file' ? '📎' : '📹'}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: n.is_read ? 400 : 600, fontSize: '0.875rem' }}>
                          {n.type === 'message' ? `${n.payload.senderName} sent a message` :
                           n.type === 'meeting_invite' ? `${n.payload.hostName} invited you to a meeting` :
                           'New notification'}
                        </div>
                        {n.payload.preview && (
                          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {n.payload.preview}
                          </div>
                        )}
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                          {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Chat area */}
        {activeConv ? (
          <ChatWindow
            conversation={activeConv}
            presence={presence}
            onStartCall={startCall}
            onJoinCall={joinCallFromCard}
          />
        ) : (
          <div className="empty-state" style={{ flex: 1, height: 'calc(100vh - 49px)' }}>
            <div style={{ fontSize: '5rem' }}>💬</div>
            <h2 style={{ color: 'var(--text-primary)' }}>Welcome to GHL Connect</h2>
            <p style={{ color: 'var(--text-secondary)', maxWidth: 400, textAlign: 'center' }}>
              Select a conversation from the sidebar, or start a new direct message or group chat.
            </p>
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <button className="btn btn-primary" onClick={() => setShowNewDM(true)}>✉️ New Message</button>
              <button className="btn btn-secondary" onClick={() => setShowNewGroup(true)}>👥 New Group</button>
            </div>
          </div>
        )}
      </div>

      {/* Incoming Call Prompt Overlay */}
      {incomingCall && (
        <div className="incoming-call-overlay">
          <Avatar name={incomingCall.hostName} photoUrl={incomingCall.hostPhoto} size="lg" />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.9375rem' }}>
              {incomingCall.hostName}
            </div>
            <div style={{ color: '#94a3b8', fontSize: '0.8125rem' }}>
              Incoming {incomingCall.callMode === 'audio' ? 'Voice Call' : 'Video Meeting'}...
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="call-btn-accept"
              onClick={acceptIncomingCall}
              title="Accept Call"
            >
              {incomingCall.callMode === 'audio' ? '📞' : '📹'}
            </button>
            <button
              className="call-btn-decline"
              onClick={declineIncomingCall}
              title="Decline Call"
            >
              ❌
            </button>
          </div>
        </div>
      )}

      {/* Meeting room overlay */}
      {activeMeeting && (
        <MeetingRoom
          meetingId={activeMeeting.id}
          participants={activeMeeting.participants}
          callMode={activeMeeting.callMode}
          onClose={() => setActiveMeeting(null)}
        />
      )}

      {/* New DM Modal */}
      {showNewDM && (
        <div className="modal-overlay" onClick={() => setShowNewDM(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>New Direct Message</h3>
              <button className="btn-icon" onClick={() => setShowNewDM(false)}>✕</button>
            </div>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label">Search people</label>
              <div className="search-input-wrapper">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search by name or email..."
                  value={dmSearch}
                  onChange={e => setDmSearch(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
            <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {filteredUsers.slice(0, 20).map(u => (
                <div
                  key={u.id}
                  onClick={() => { setDmTarget(u.id); setDmSearch(u.name); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                    background: dmTarget === u.id ? 'var(--accent-primary-light)' : 'transparent',
                    transition: 'background 150ms',
                  }}
                  onMouseEnter={e => { if (dmTarget !== u.id) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={e => { if (dmTarget !== u.id) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <Avatar name={u.name} photoUrl={u.photo_url} size="md" online={(presence[u.id] || u.status) === 'online'} />
                  <div>
                    <div style={{ fontWeight: 500 }}>{u.name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{u.designation || u.email}</div>
                  </div>
                </div>
              ))}
              {filteredUsers.length === 0 && dmSearch && (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No users found</div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowNewDM(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={startDM} disabled={!dmTarget}>Open Chat</button>
            </div>
          </div>
        </div>
      )}

      {/* New Group Modal */}
      {showNewGroup && (
        <div className="modal-overlay" onClick={() => setShowNewGroup(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>New Group Chat</h3>
              <button className="btn-icon" onClick={() => setShowNewGroup(false)}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Group Name</label>
                <input type="text" className="form-input" placeholder="e.g. Project Alpha" value={groupName} onChange={e => setGroupName(e.target.value)} autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Add Members</label>
                <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {allUsers.filter(u => u.id !== user?.id).map(u => {
                    const selected = groupMembers.includes(u.id);
                    return (
                      <div
                        key={u.id}
                        onClick={() => setGroupMembers(prev => selected ? prev.filter(id => id !== u.id) : [...prev, u.id])}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                          background: selected ? 'var(--accent-primary-light)' : 'transparent',
                        }}
                      >
                        <div style={{
                          width: 20, height: 20, borderRadius: 6,
                          border: `2px solid ${selected ? 'var(--accent-primary)' : 'var(--border-default)'}`,
                          background: selected ? 'var(--accent-primary)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.75rem', color: '#fff', flexShrink: 0,
                        }}>
                          {selected ? '✓' : ''}
                        </div>
                        <Avatar name={u.name} photoUrl={u.photo_url} size="sm" />
                        <div>
                          <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{u.name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.designation || u.email}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {groupMembers.length > 0 && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--accent-primary)' }}>
                    {groupMembers.length} member{groupMembers.length !== 1 ? 's' : ''} selected
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowNewGroup(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={startGroup} disabled={!groupName.trim() || groupMembers.length === 0}>
                Create Group
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close notifications on outside click */}
      {showNotifications && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 499 }} onClick={() => setShowNotifications(false)} />
      )}
    </div>
  );
}
