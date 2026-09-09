'use client';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import api, { ApiError } from '@/lib/api';

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setError('');
    setLoading(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('An error occurred.');
    } finally {
      setLoading(false);
    }
  }

  if (!token) return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ color: 'var(--accent-danger)' }}>Invalid or missing reset token.</p>
      <Link href="/forgot-password" className="btn btn-secondary" style={{ marginTop: 16 }}>Request New Link</Link>
    </div>
  );

  return done ? (
    <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: '3rem' }}>✅</div>
      <h2>Password Updated!</h2>
      <p style={{ color: 'var(--text-secondary)' }}>Your password has been reset successfully.</p>
      <button className="btn btn-primary btn-lg" onClick={() => router.push('/login')}>Sign In Now</button>
    </div>
  ) : (
    <>
      <h1 style={{ textAlign: 'center', marginBottom: 8 }}>Set New Password</h1>
      <p className="login-subtitle">Choose a strong new password.</p>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="form-group">
          <label className="form-label">New Password</label>
          <input type="password" className="form-input" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
        </div>
        <div className="form-group">
          <label className="form-label">Confirm Password</label>
          <input type="password" className="form-input" placeholder="••••••••" value={confirm} onChange={e => setConfirm(e.target.value)} required />
        </div>
        {error && <div className="form-error"><span>⚠️</span> {error}</div>}
        <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
          {loading ? <><div className="spinner" style={{ width: 18, height: 18 }} /> Updating...</> : 'Update Password'}
        </button>
      </form>
      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <Link href="/login" style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>← Back to sign in</Link>
      </div>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="login-page">
      <div className="login-bg-gradient" />
      <div className="login-card">
        <div className="login-logo" style={{ marginBottom: 24 }}>
          <div className="login-logo-icon">💬</div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>GHL Connect</div>
          </div>
        </div>
        <Suspense fallback={<div className="spinner" />}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
