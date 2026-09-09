'use client';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth, User } from '@/contexts/AuthContext';
import Avatar from '@/components/UI/Avatar';
import api from '@/lib/api';
import { Conversation, ConversationMember } from '@/types/chat';

interface SidebarProps {
  conversations: Conversation[];
  activeConvId: string | null;
  onSelectConv: (conv: Conversation) => void;
  onNewDM: () => void;
  onNewGroup: () => void;
  presence: Record<string, 'online' | 'offline' | 'in_call' | string>;
}

export default function Sidebar({
  conversations, activeConvId, onSelectConv, onNewDM, onNewGroup, presence
}: SidebarProps) {
  const { user, logout } = useAuth();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'dms' | 'groups'>('all');

  const filtered = conversations.filter(c => {
    const name = c.type === 'dm'
      ? c.members.find(m => m.id !== user?.id)?.name || 'Unknown'
      : c.name;
    const matchSearch = name.toLowerCase().includes(search.toLowerCase());
    const matchTab = activeTab === 'all' || c.type === (activeTab === 'dms' ? 'dm' : 'group');
    return matchSearch && matchTab;
  });

  function getConvName(conv: Conversation) {
    if (conv.type === 'dm') {
      return conv.members.find(m => m.id !== user?.id)?.name || 'Unknown';
    }
    return conv.name || 'Group Chat';
  }

  function getConvMember(conv: Conversation) {
    return conv.members.find(m => m.id !== user?.id);
  }

  function formatLastMsg(conv: Conversation) {
    if (!conv.last_message) return 'No messages yet';
    if (conv.last_message.is_deleted) return '🗑️ Message deleted';
    const content = conv.last_message.content || '';
    if (content.startsWith('[CALL:')) {
      try {
        const call = JSON.parse(content.slice(6, -1));
        return call.callMode === 'audio' ? '📞 Voice Call' : '📹 Video Meeting';
      } catch {
        return '📞 Call';
      }
    }
    return content.slice(0, 40) || '📎 File attachment';
  }

  return (
    <div className="sidebar">
      {/* Header */}
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="logo-icon">💬</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.9375rem' }}>GHL Connect</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>GHL India Ventures</div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '8px 12px' }}>
        <div className="search-input-wrapper">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Search conversations..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Tab filter */}
      <div style={{ display: 'flex', padding: '0 12px 8px' }}>
        {(['all', 'dms', 'groups'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              padding: '4px 0',
              border: 'none',
              background: activeTab === tab ? 'var(--accent-primary-light)' : 'transparent',
              color: activeTab === tab ? 'var(--accent-primary-hover)' : 'var(--text-muted)',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: '0.8125rem',
              fontWeight: activeTab === tab ? 600 : 400,
              fontFamily: 'var(--font-sans)',
              transition: 'all 150ms',
            }}
          >
            {tab === 'all' ? 'All' : tab === 'dms' ? 'Direct' : 'Groups'}
          </button>
        ))}
      </div>

      {/* Conversations list */}
      <div className="sidebar-body">
        {/* Direct Messages section */}
        <div className="sidebar-section">
          <div className="sidebar-section-header">
            <span>Messages</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn-icon" onClick={onNewDM} title="New Direct Message" style={{ padding: 4, fontSize: '0.875rem' }}>✉️</button>
              <button className="btn-icon" onClick={onNewGroup} title="New Group" style={{ padding: 4, fontSize: '0.875rem' }}>👥</button>
            </div>
          </div>

          {filtered.length === 0 && (
            <div className="empty-state" style={{ padding: '24px 16px' }}>
              <div className="empty-state-icon" style={{ fontSize: '2rem' }}>💬</div>
              <div className="empty-state-text" style={{ fontSize: '0.875rem' }}>No conversations</div>
            </div>
          )}

          {filtered.map(conv => {
            const name = getConvName(conv);
            const member = conv.type === 'dm' ? getConvMember(conv) : null;
            const memberStatus = member ? (presence[member.id] || member.status) : 'offline';
            const isActive = conv.id === activeConvId;
            const hasUnread = conv.unread_count > 0;

            return (
              <div
                key={conv.id}
                className={`sidebar-item ${isActive ? 'active' : ''}`}
                onClick={() => onSelectConv(conv)}
              >
                {conv.type === 'dm' ? (
                  <Avatar
                    name={name}
                    photoUrl={member?.photo_url}
                    size="md"
                    status={memberStatus}
                  />
                ) : (
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    background: 'linear-gradient(135deg, #7c3aed, #2d6fe8)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1rem'
                  }}>
                    👥
                  </div>
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    fontWeight: hasUnread ? 600 : 400,
                    color: hasUnread ? 'var(--text-primary)' : undefined,
                  }}>
                    <span className="truncate" style={{ flex: 1 }}>{name}</span>
                    {conv.unread_count > 0 && (
                      <span className="sidebar-item-badge">{conv.unread_count > 99 ? '99+' : conv.unread_count}</span>
                    )}
                  </div>
                  <div className="truncate" style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 1 }}>
                    {formatLastMsg(conv)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer — user profile */}
      <div className="sidebar-footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar name={user?.name || 'U'} photoUrl={user?.photo_url} size="md" online={true} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.name}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--status-online)' }}>● Online</div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {user?.role === 'admin' && (
              <a href="/admin" className="btn-icon" title="Admin Panel" style={{ fontSize: '1rem', textDecoration: 'none' }}>⚙️</a>
            )}
            <a href="/profile" className="btn-icon" title="Profile" style={{ fontSize: '1rem', textDecoration: 'none' }}>👤</a>
            <button className="btn-icon" title="Sign Out" onClick={logout} style={{ fontSize: '1rem' }}>🚪</button>
          </div>
        </div>
      </div>
    </div>
  );
}
