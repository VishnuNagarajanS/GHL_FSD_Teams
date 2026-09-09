'use client';
import React from 'react';

interface AvatarProps {
  name: string;
  photoUrl?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  online?: boolean | string;
  status?: 'online' | 'offline' | 'in_call' | string;
  className?: string;
}

const COLORS = [
  'linear-gradient(135deg, #2d6fe8, #7c3aed)',
  'linear-gradient(135deg, #06b6d4, #2d6fe8)',
  'linear-gradient(135deg, #22c55e, #06b6d4)',
  'linear-gradient(135deg, #f59e0b, #ef4444)',
  'linear-gradient(135deg, #7c3aed, #ec4899)',
  'linear-gradient(135deg, #ef4444, #f59e0b)',
];

function getColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

export function Avatar({ name, photoUrl, size = 'md', online, status, className }: AvatarProps) {
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const sizeClass = `avatar avatar-${size} ${className || ''}`;

  const currentStatus = status || (typeof online === 'string' ? online : online ? 'online' : online === false ? 'offline' : undefined);

  return (
    <div className="sidebar-item-avatar" style={{ position: 'relative', flexShrink: 0 }}>
      {photoUrl ? (
        <img src={photoUrl} alt={name} className={sizeClass} />
      ) : (
        <div
          className={sizeClass}
          style={{ background: getColor(name) }}
          title={name}
        >
          {initials}
        </div>
      )}
      {currentStatus !== undefined && (
        <span
          className={`presence-dot ${currentStatus}`}
          title={currentStatus === 'in_call' ? 'In a call' : currentStatus === 'online' ? 'Online' : 'Offline'}
        />
      )}
    </div>
  );
}

export default Avatar;
