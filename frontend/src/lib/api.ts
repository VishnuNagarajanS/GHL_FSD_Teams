const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

async function request(endpoint: string, options: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  
  const headers: Record<string, string> = {
    ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> || {}),
  };

  const res = await fetch(`${API_URL}${endpoint}`, { ...options, headers });

  // Auto token refresh
  if (res.status === 401 && token) {
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) {
      const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (refreshRes.ok) {
        const { accessToken, refreshToken: newRefresh } = await refreshRes.json();
        localStorage.setItem('accessToken', accessToken);
        if (newRefresh) localStorage.setItem('refreshToken', newRefresh);
        const retryHeaders = { ...headers, Authorization: `Bearer ${accessToken}` };
        const retry = await fetch(`${API_URL}${endpoint}`, { ...options, headers: retryHeaders });
        if (!retry.ok) {
          const err = await retry.json().catch(() => ({}));
          throw new ApiError(retry.status, err?.error?.message || retry.statusText, err?.error?.code);
        }
        return retry.json();
      } else {
        // Refresh failed — clear tokens
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
      }
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(res.status, err?.error?.message || res.statusText, err?.error?.code);
  }

  if (res.status === 204) return null;
  return res.json();
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, message: string, code = 'UNKNOWN') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const api = {
  // Auth
  login: (email: string, password: string) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  forgotPassword: (email: string) => request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token: string, newPassword: string) => request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, newPassword }) }),
  refresh: (refreshToken: string) => request('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) }),

  // Users
  getUsers: (params?: Record<string, string>) => request(`/users?${new URLSearchParams(params || {})}`),
  getUser: (id: string) => request(`/users/${id}`),
  updateUser: (id: string, data: Record<string, unknown>) => request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  createUser: (data: Record<string, unknown>) => request('/users', { method: 'POST', body: JSON.stringify(data) }),
  deleteUser: (id: string) => request(`/users/${id}`, { method: 'DELETE' }),
  setUserStatus: (id: string, active: boolean) => request(`/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ active }) }),

  // Departments
  getDepartments: () => request('/departments'),
  getDepartment: (id: string) => request(`/departments/${id}`),
  createDepartment: (name: string) => request('/departments', { method: 'POST', body: JSON.stringify({ name }) }),
  updateDepartment: (id: string, name: string) => request(`/departments/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
  deleteDepartment: (id: string, reassign_to?: string) => request(`/departments/${id}${reassign_to ? `?reassign_to=${reassign_to}` : ''}`, { method: 'DELETE' }),

  // Conversations
  getConversations: () => request('/conversations'),
  createConversation: (data: Record<string, unknown>) => request('/conversations', { method: 'POST', body: JSON.stringify(data) }),
  getMessages: (convId: string, before?: string) => request(`/conversations/${convId}/messages${before ? `?before=${before}` : ''}`),
  sendMessage: (convId: string, content: string, attachmentIds?: string[]) => request(`/conversations/${convId}/messages`, { method: 'POST', body: JSON.stringify({ content, attachmentIds }) }),
  editMessage: (msgId: string, content: string) => request(`/conversations/messages/${msgId}`, { method: 'PUT', body: JSON.stringify({ content }) }),
  deleteMessage: (msgId: string) => request(`/conversations/messages/${msgId}`, { method: 'DELETE' }),
  addReaction: (msgId: string, emoji: string) => request(`/conversations/messages/${msgId}/reactions`, { method: 'POST', body: JSON.stringify({ emoji }) }),
  markRead: (convId: string, messageId: string) => request(`/conversations/${convId}/read`, { method: 'POST', body: JSON.stringify({ messageId }) }),

  // Files
  uploadFile: (formData: FormData) => request('/files/upload', { method: 'POST', body: formData }),
  getFile: (id: string) => request(`/files/${id}`),
  downloadUrl: (id: string) => `${API_URL}/files/${id}/download`,

  // Notifications
  getNotifications: (unreadOnly?: boolean) => request(`/notifications${unreadOnly ? '?unreadOnly=true' : ''}`),
  markNotificationRead: (id: string) => request(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllNotificationsRead: () => request('/notifications/read-all', { method: 'PATCH' }),

  // Meetings
  createMeeting: (data: Record<string, unknown>) => request('/meetings', { method: 'POST', body: JSON.stringify(data) }),
  getMeeting: (id: string) => request(`/meetings/${id}`),
  joinMeeting: (id: string) => request(`/meetings/${id}/join`, { method: 'POST' }),
  leaveMeeting: (id: string) => request(`/meetings/${id}/leave`, { method: 'POST' }),
  endMeeting: (id: string) => request(`/meetings/${id}/end`, { method: 'POST' }),

  // Admin
  getAuditLogs: (params?: Record<string, string>) => request(`/admin/audit-logs?${new URLSearchParams(params || {})}`),
  getUsageStats: () => request('/admin/usage-stats'),
};

export default api;
