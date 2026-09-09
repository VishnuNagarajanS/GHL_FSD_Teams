'use client';
import { useState } from 'react';
import Link from 'next/link';
import api, { ApiError } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [devLink, setDevLink] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.forgotPassword(email);
      setSent(true);
      setMessage(res.message);
      if (res.devResetLink) setDevLink(res.devResetLink);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-bg-gradient" />
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">💬</div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>GHL Connect</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>GHL India Ventures</div>
          </div>
        </div>

        {!sent ? (
          <>
            <h1 style={{ textAlign: 'center', marginBottom: 8 }}>Reset Password</h1>
            <p className="login-subtitle">Enter your company email and we'll send a reset link.</p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-group">
                <label className="form-label" htmlFor="email">Company Email</label>
                <input
                  id="email"
                  type="email"
                  className="form-input"
                  placeholder="you@ghl.internal"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              {error && <div className="form-error"><span>⚠️</span> {error}</div>}

              <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
                {loading ? <><div className="spinner" style={{ width: 18, height: 18 }} /> Sending...</> : 'Send Reset Link'}
              </button>
            </form>
          </>
        ) : (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: '3rem' }}>📧</div>
            <h2>Check your email</h2>
            <p style={{ color: 'var(--text-secondary)' }}>{message}</p>

            {devLink && (
              <div style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
                borderRadius: 8, padding: 12, textAlign: 'left'
              }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--accent-warning)', marginBottom: 6 }}>
                  🔧 Dev Mode — Reset Link:
                </p>
                <Link href={devLink} style={{ fontSize: '0.8125rem', wordBreak: 'break-all' }}>
                  {devLink}
                </Link>
              </div>
            )}
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <Link href="/login" style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            ← Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
