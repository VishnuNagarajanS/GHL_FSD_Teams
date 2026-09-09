'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Avatar from '@/components/UI/Avatar';
import api, { ApiError } from '@/lib/api';

interface User {
  id: string; name: string; email: string; role: string; designation: string;
  department_id: string | null; department_name?: string; status: string; is_active: number;
}
interface Department { id: string; name: string; member_count: number; }
interface AuditLog { id: string; actor_name: string; action: string; target_name: string; created_at: string; }
interface Stats {
  activeUsersToday: number; totalUsers: number; activeUsers: number; onlineUsers: number;
  totalMessages: number; totalFiles: number; totalMeetings: number; totalDepartments: number;
  storageUsed: number; recentLogins: { actor_name: string; created_at: string; designation?: string; }[];
}

export default function AdminPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<'dashboard' | 'employees' | 'departments' | 'audit'>('dashboard');
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState('');

  // Modals
  const [showAddUser, setShowAddUser] = useState(false);
  const [showAddDept, setShowAddDept] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editingDept, setEditingDept] = useState<Department | null>(null);

  // Form states
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState('employee');
  const [newUserDept, setNewUserDept] = useState('');
  const [newUserDesig, setNewUserDesig] = useState('');
  const [newDeptName, setNewDeptName] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!isLoading && (!user || user.role !== 'admin')) router.push('/chat');
  }, [user, isLoading, router]);

  const loadAll = useCallback(async () => {
    try {
      const [usersData, deptsData, statsData, logsData] = await Promise.all([
        api.getUsers({ limit: '500' }),
        api.getDepartments(),
        api.getUsageStats(),
        api.getAuditLogs({ limit: '50' }),
      ]);
      setUsers(usersData.users || []);
      setDepartments(deptsData.departments || []);
      setStats(statsData);
      setAuditLogs(logsData.logs || []);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    if (user?.role === 'admin') loadAll();
  }, [user, loadAll]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  async function handleCreateUser() {
    setFormError('');
    try {
      await api.createUser({ name: newUserName, email: newUserEmail, role: newUserRole, department_id: newUserDept || undefined, designation: newUserDesig });
      setShowAddUser(false);
      setNewUserName(''); setNewUserEmail(''); setNewUserRole('employee'); setNewUserDept(''); setNewUserDesig('');
      showToast('✅ Employee created successfully');
      loadAll();
    } catch (err) {
      if (err instanceof ApiError) setFormError(err.message);
      else setFormError('Failed to create user');
    }
  }

  async function handleToggleUser(u: User) {
    await api.setUserStatus(u.id, !u.is_active);
    showToast(u.is_active ? '🔒 Account disabled' : '✅ Account enabled');
    loadAll();
  }

  async function handleDeleteUser(u: User) {
    if (!confirm(`Delete ${u.name}? This cannot be undone.`)) return;
    await api.deleteUser(u.id);
    showToast('🗑️ Employee removed');
    loadAll();
  }

  async function handleCreateDept() {
    setFormError('');
    try {
      await api.createDepartment(newDeptName);
      setShowAddDept(false);
      setNewDeptName('');
      showToast('✅ Department created');
      loadAll();
    } catch (err) {
      if (err instanceof ApiError) setFormError(err.message);
      else setFormError('Failed to create department');
    }
  }

  async function handleEditDept() {
    if (!editingDept) return;
    await api.updateDepartment(editingDept.id, editingDept.name);
    setEditingDept(null);
    showToast('✅ Department updated');
    loadAll();
  }

  async function handleDeleteDept(dept: Department) {
    if (!confirm(`Delete department "${dept.name}"? Members will be unassigned.`)) return;
    await api.deleteDepartment(dept.id);
    showToast('🗑️ Department deleted');
    loadAll();
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  const filteredUsers = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  if (isLoading || !user) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>;

  return (
    <div className="admin-layout">
      {/* Header */}
      <div className="admin-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <a href="/chat" style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem' }}>
              ← Back to Chat
            </a>
            <span style={{ color: 'var(--border-default)' }}>|</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #ef4444, #f59e0b)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>⚙️</div>
              <h2 style={{ margin: 0 }}>Admin Panel</h2>
              <span className="badge badge-red">Admin</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Avatar name={user.name} photoUrl={user.photo_url} size="sm" />
            <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{user.name}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ padding: '0 32px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-muted)' }}>
        <div className="tabs" style={{ borderBottom: 'none', marginBottom: 0 }}>
          {([['dashboard', '📊 Dashboard'], ['employees', '👥 Employees'], ['departments', '🏢 Departments'], ['audit', '📋 Audit Logs']] as const).map(([key, label]) => (
            <button
              key={key}
              className={`tab-btn ${tab === key ? 'active' : ''}`}
              onClick={() => setTab(key as typeof tab)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="admin-content">
        {/* DASHBOARD TAB */}
        {tab === 'dashboard' && stats && (
          <>
            <h3 style={{ marginBottom: 20 }}>Platform Overview</h3>
            <div className="stats-grid">
              {[
                { icon: '👥', label: 'Total Employees', value: stats.totalUsers, color: '#2d6fe8', bg: 'rgba(45,111,232,0.1)' },
                { icon: '🟢', label: 'Online Now', value: stats.onlineUsers, color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
                { icon: '📅', label: 'Active Today', value: stats.activeUsersToday, color: '#06b6d4', bg: 'rgba(6,182,212,0.1)' },
                { icon: '💬', label: 'Total Messages', value: stats.totalMessages, color: '#7c3aed', bg: 'rgba(124,58,237,0.1)' },
                { icon: '📹', label: 'Meetings Held', value: stats.totalMeetings, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
                { icon: '📦', label: 'Storage Used', value: formatBytes(stats.storageUsed), color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
                { icon: '📁', label: 'Files Shared', value: stats.totalFiles, color: '#ec4899', bg: 'rgba(236,72,153,0.1)' },
                { icon: '🏢', label: 'Departments', value: stats.totalDepartments, color: '#f97316', bg: 'rgba(249,115,22,0.1)' },
              ].map(s => (
                <div key={s.label} className="stat-card">
                  <div className="stat-icon" style={{ background: s.bg }}>
                    <span>{s.icon}</span>
                  </div>
                  <div className="stat-info">
                    <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
                    <div className="stat-label">{s.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Recent logins */}
            {stats.recentLogins.length > 0 && (
              <>
                <h3 style={{ marginBottom: 16 }}>Recent Logins</h3>
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Designation</th>
                        <th>Login Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.recentLogins.map((l, i) => (
                        <tr key={i}>
                          <td style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Avatar name={l.actor_name} size="sm" />
                            {l.actor_name}
                          </td>
                          <td style={{ color: 'var(--text-muted)' }}>{l.designation || '—'}</td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                            {new Date(l.created_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}

        {/* EMPLOYEES TAB */}
        {tab === 'employees' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3>Employee Directory</h3>
              <button className="btn btn-primary" onClick={() => { setShowAddUser(true); setFormError(''); }}>
                ➕ Add Employee
              </button>
            </div>
            <div className="search-input-wrapper" style={{ maxWidth: 360, marginBottom: 16 }}>
              <span className="search-icon">🔍</span>
              <input type="text" className="search-input" placeholder="Search employees..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Role</th>
                    <th>Department</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(u => (
                    <tr key={u.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar name={u.name} size="sm" online={u.status === 'online'} />
                          <div>
                            <div style={{ fontWeight: 500 }}>{u.name}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${u.role === 'admin' ? 'badge-red' : u.role === 'manager' ? 'badge-blue' : 'badge-green'}`}>
                          {u.role}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{u.department_name || '—'}</td>
                      <td>
                        <span className={`badge ${u.is_active ? 'badge-green' : 'badge-red'}`}>
                          {u.is_active ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            className={`btn btn-sm ${u.is_active ? 'btn-secondary' : 'btn-primary'}`}
                            onClick={() => handleToggleUser(u)}
                            disabled={u.id === user.id}
                          >
                            {u.is_active ? '🔒 Disable' : '✅ Enable'}
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDeleteUser(u)}
                            disabled={u.id === user.id}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* DEPARTMENTS TAB */}
        {tab === 'departments' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3>Departments</h3>
              <button className="btn btn-primary" onClick={() => { setShowAddDept(true); setNewDeptName(''); setFormError(''); }}>
                ➕ Add Department
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {departments.map(dept => (
                <div key={dept.id} className="stat-card" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="stat-icon" style={{ background: 'rgba(45,111,232,0.1)', width: 40, height: 40 }}>🏢</div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{dept.name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{dept.member_count} member{dept.member_count !== 1 ? 's' : ''}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn-icon" title="Edit" onClick={() => setEditingDept(dept)}>✏️</button>
                      <button className="btn-icon" title="Delete" onClick={() => handleDeleteDept(dept)}>🗑️</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* AUDIT LOG TAB */}
        {tab === 'audit' && (
          <>
            <h3 style={{ marginBottom: 20 }}>Audit Logs</h3>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Target</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map(log => (
                    <tr key={log.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Avatar name={log.actor_name} size="sm" />
                          {log.actor_name}
                        </div>
                      </td>
                      <td>
                        <code style={{ background: 'var(--bg-elevated)', padding: '2px 8px', borderRadius: 4, fontSize: '0.8125rem', color: 'var(--accent-primary-hover)' }}>
                          {log.action}
                        </code>
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{log.target_name || '—'}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  {auditLogs.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                        No audit logs yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ADD USER MODAL */}
      {showAddUser && (
        <div className="modal-overlay" onClick={() => setShowAddUser(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Employee</h3>
              <button className="btn-icon" onClick={() => setShowAddUser(false)}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input type="text" className="form-input" placeholder="e.g. Priya Sharma" value={newUserName} onChange={e => setNewUserName(e.target.value)} autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Company Email *</label>
                <input type="email" className="form-input" placeholder="e.g. priya@ghl.internal" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Role</label>
                <select className="form-input" value={newUserRole} onChange={e => setNewUserRole(e.target.value)} style={{ cursor: 'pointer' }}>
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Department</label>
                <select className="form-input" value={newUserDept} onChange={e => setNewUserDept(e.target.value)} style={{ cursor: 'pointer' }}>
                  <option value="">None</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Designation</label>
                <input type="text" className="form-input" placeholder="e.g. Frontend Developer" value={newUserDesig} onChange={e => setNewUserDesig(e.target.value)} />
              </div>
              {formError && <div className="form-error"><span>⚠️</span> {formError}</div>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAddUser(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreateUser} disabled={!newUserName || !newUserEmail}>
                Create Employee
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD DEPT MODAL */}
      {showAddDept && (
        <div className="modal-overlay" onClick={() => setShowAddDept(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Department</h3>
              <button className="btn-icon" onClick={() => setShowAddDept(false)}>✕</button>
            </div>
            <div className="form-group">
              <label className="form-label">Department Name</label>
              <input type="text" className="form-input" placeholder="e.g. Product Design" value={newDeptName} onChange={e => setNewDeptName(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && handleCreateDept()} />
            </div>
            {formError && <div className="form-error" style={{ marginTop: 8 }}><span>⚠️</span> {formError}</div>}
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAddDept(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreateDept} disabled={!newDeptName.trim()}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT DEPT MODAL */}
      {editingDept && (
        <div className="modal-overlay" onClick={() => setEditingDept(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Department</h3>
              <button className="btn-icon" onClick={() => setEditingDept(null)}>✕</button>
            </div>
            <div className="form-group">
              <label className="form-label">Department Name</label>
              <input type="text" className="form-input" value={editingDept.name} onChange={e => setEditingDept({ ...editingDept, name: e.target.value })} autoFocus />
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEditingDept(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleEditDept}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="toast-container">
          <div className="toast toast-success">{toast}</div>
        </div>
      )}
    </div>
  );
}
