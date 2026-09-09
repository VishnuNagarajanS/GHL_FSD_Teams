'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Avatar from '@/components/UI/Avatar';
import api, { ApiError } from '@/lib/api';

interface Department { id: string; name: string; }

export default function ProfilePage() {
  const { user, updateUser, isLoading, logout } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [designation, setDesignation] = useState('');
  const [contact, setContact] = useState('');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) router.push('/login');
    if (user) {
      setName(user.name || '');
      setDesignation(user.designation || '');
      setContact(user.contact || '');
    }
    api.getDepartments().then(d => setDepartments(d.departments || [])).catch(() => {});
  }, [user, isLoading, router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const updated = await api.updateUser(user!.id, { name, designation, contact });
      updateUser(updated);
      setSuccess('Profile updated successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Failed to update profile');
    } finally {
      setSaving(false);
    }
  }

  const dept = departments.find(d => d.id === user?.department_id);

  if (isLoading || !user) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 560 }}>
        {/* Back button */}
        <button onClick={() => router.push('/chat')} className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }}>
          ← Back to Chat
        </button>

        <div className="card" style={{ borderRadius: 20, overflow: 'hidden', border: '1px solid var(--border-default)' }}>
          {/* Header banner */}
          <div style={{
            height: 100,
            background: 'linear-gradient(135deg, #1a237e, #2d6fe8, #7c3aed)',
            margin: -20,
            marginBottom: 0,
          }} />

          {/* Avatar overlapping banner */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, padding: '0 24px', marginTop: -36, marginBottom: 16 }}>
            <div style={{ border: '4px solid var(--bg-surface)', borderRadius: '50%' }}>
              <Avatar name={user.name} photoUrl={user.photo_url} size="xl" />
            </div>
            <div style={{ paddingBottom: 4 }}>
              <h2 style={{ marginBottom: 2 }}>{user.name}</h2>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className={`badge ${user.role === 'admin' ? 'badge-red' : user.role === 'manager' ? 'badge-blue' : 'badge-green'}`}>
                  {user.role}
                </span>
                {dept && <span className="badge badge-purple">{dept.name}</span>}
              </div>
            </div>
          </div>

          <div style={{ padding: '0 24px 24px' }}>
            <div className="divider" />

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input type="text" className="form-input" value={name} onChange={e => setName(e.target.value)} required />
              </div>

              <div className="form-group">
                <label className="form-label">Email</label>
                <input type="email" className="form-input" value={user.email} disabled style={{ opacity: 0.6 }} />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Contact admin to change email</span>
              </div>

              <div className="form-group">
                <label className="form-label">Designation / Title</label>
                <input type="text" className="form-input" placeholder="e.g. Senior Developer" value={designation} onChange={e => setDesignation(e.target.value)} />
              </div>

              <div className="form-group">
                <label className="form-label">Contact Info</label>
                <input type="text" className="form-input" placeholder="e.g. +91 98765 43210" value={contact} onChange={e => setContact(e.target.value)} />
              </div>

              {error && <div className="form-error"><span>⚠️</span> {error}</div>}
              {success && (
                <div style={{ color: 'var(--accent-success)', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                  ✅ {success}
                </div>
              )}

              <div style={{ display: 'flex', gap: 12 }}>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <><div className="spinner" style={{ width: 16, height: 16 }} /> Saving...</> : '💾 Save Changes'}
                </button>
                {user.role === 'admin' && (
                  <a href="/admin" className="btn btn-secondary" style={{ textDecoration: 'none' }}>⚙️ Admin Panel</a>
                )}
                <button type="button" className="btn btn-danger" onClick={logout} style={{ marginLeft: 'auto' }}>
                  🚪 Sign Out
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
