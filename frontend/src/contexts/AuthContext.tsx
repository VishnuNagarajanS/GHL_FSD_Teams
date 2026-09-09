'use client';
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import api from '@/lib/api';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'employee' | 'manager' | 'admin';
  department_id: string | null;
  department_name?: string;
  designation: string;
  photo_url: string;
  contact: string;
  status: 'online' | 'offline';
  is_active: number;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  socket: Socket | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (updated: Partial<User>) => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Use current browser origin so Socket.IO goes through the Next.js proxy.
// This works on localhost AND any ngrok/external URL automatically.
function getSocketUrl() {
  if (typeof window === 'undefined') return 'http://localhost:4000';
  // If an explicit URL is set (e.g. production separate server), use it
  const explicit = process.env.NEXT_PUBLIC_SOCKET_URL;
  if (explicit) return explicit;
  // Otherwise use same origin — Next.js proxies /socket.io/* to the backend
  return window.location.origin;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const socketRef = useRef<Socket | null>(null);

  const connectSocket = useCallback((accessToken: string) => {
    // Disconnect any stale socket before creating a new one
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    const s = io(getSocketUrl(), {
      auth: { token: accessToken },
      transports: ['polling', 'websocket'],
      reconnection: true,
    });
    socketRef.current = s;
    setSocket(s);

    s.on('connect', () => console.log('[Socket] Connected'));
    s.on('disconnect', () => console.log('[Socket] Disconnected'));

    // On "Invalid token" — try refreshing the access token once, then reconnect
    s.on('connect_error', async (e) => {
      if (e.message === 'Invalid token') {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) {
          // No refresh token available — redirect to login
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('user');
          window.location.href = '/login';
          return;
        }
        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || '/api'}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });
          if (!res.ok) throw new Error('Refresh failed');
          const data = await res.json();
          // Store new tokens
          localStorage.setItem('accessToken', data.accessToken);
          if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
          // Reconnect with fresh token
          s.auth = { token: data.accessToken };
          s.connect();
        } catch {
          // Refresh failed — force logout
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('user');
          window.location.href = '/login';
        }
      } else {
        console.error('[Socket] Error:', e.message);
      }
    });
  }, []);

  useEffect(() => {
    const savedToken = localStorage.getItem('accessToken');
    const savedRefreshToken = localStorage.getItem('refreshToken');
    const savedUser = localStorage.getItem('user');

    if (!savedToken || !savedUser) {
      setIsLoading(false);
      return;
    }

    // Always try to get a fresh access token on page load (stored token may be expired)
    const initAuth = async () => {
      try {
        let activeToken = savedToken;

        // Proactively refresh the token to avoid "Invalid token" on socket connect
        if (savedRefreshToken) {
          try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || '/api'}/auth/refresh`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refreshToken: savedRefreshToken }),
            });
            if (res.ok) {
              const data = await res.json();
              activeToken = data.accessToken;
              localStorage.setItem('accessToken', data.accessToken);
              if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
            }
          } catch {
            // Refresh failed — continue with saved token (socket will handle it)
          }
        }

        const parsedUser = JSON.parse(savedUser);
        setToken(activeToken);
        setUser(parsedUser);
        connectSocket(activeToken);
      } catch {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, [connectSocket]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.login(email, password);
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('user', JSON.stringify(data.user));
    setToken(data.accessToken);
    setUser(data.user);
    connectSocket(data.accessToken);
  }, [connectSocket]);

  const logout = useCallback(() => {
    api.logout().catch(() => {});
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    socketRef.current?.disconnect();
    socketRef.current = null;
    setSocket(null);
    setUser(null);
    setToken(null);
    window.location.href = '/login';
  }, []);

  const updateUser = useCallback((updated: Partial<User>) => {
    setUser(prev => {
      if (!prev) return prev;
      const next = { ...prev, ...updated };
      localStorage.setItem('user', JSON.stringify(next));
      return next;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, socket, login, logout, updateUser, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
