const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const db = require('../db/schema');
const { generateTokens, JWT_SECRET, authenticate } = require('../middleware/auth');
const { createAuditLog } = require('./admin');

const router = express.Router();

// POST /auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Email and password are required' } });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user) {
    return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
  }

  if (!user.is_active) {
    return res.status(401).json({ error: { code: 'ACCOUNT_DISABLED', message: 'Your account has been disabled. Contact an administrator.' } });
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
  }

  const { accessToken, refreshToken } = generateTokens(user);

  // Store refresh token
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO refresh_tokens (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)')
    .run(uuidv4(), user.id, refreshToken, expiresAt);

  // Audit log
  try {
    createAuditLog(user.id, user.name, 'user.login', 'user', user.id, user.name);
  } catch (_) {}

  const { password_hash, ...safeUser } = user;
  return res.json({ accessToken, refreshToken, user: safeUser });
});

// POST /auth/logout
router.post('/logout', authenticate, (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];
  // Optionally delete all refresh tokens for user on logout
  db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(req.user.id);
  // Set user offline
  db.prepare("UPDATE users SET status = 'offline' WHERE id = ?").run(req.user.id);
  return res.status(204).send();
});

// POST /auth/forgot-password
router.post('/forgot-password', (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Email is required' } });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  // Always return success to avoid user enumeration
  if (!user) {
    return res.json({ message: 'Reset link sent if account exists' });
  }

  // Generate reset token
  const token = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

  // Invalidate previous tokens
  db.prepare('DELETE FROM reset_tokens WHERE user_id = ?').run(user.id);
  db.prepare('INSERT INTO reset_tokens (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)')
    .run(uuidv4(), user.id, token, expiresAt);

  // In production: send email. For MVP, return token in response (dev mode)
  const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
  console.log(`[DEV] Password reset link for ${email}: ${resetLink}`);

  return res.json({ message: 'Reset link sent if account exists', ...(process.env.NODE_ENV === 'development' ? { devResetLink: resetLink } : {}) });
});

// POST /auth/reset-password
router.post('/reset-password', (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Token and new password are required' } });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Password must be at least 8 characters' } });
  }

  const resetRecord = db.prepare('SELECT * FROM reset_tokens WHERE token = ? AND used = 0').get(token);
  if (!resetRecord) {
    return res.status(400).json({ error: { code: 'INVALID_TOKEN', message: 'Invalid or expired reset token' } });
  }

  if (new Date(resetRecord.expires_at) < new Date()) {
    return res.status(400).json({ error: { code: 'TOKEN_EXPIRED', message: 'Reset token has expired' } });
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, resetRecord.user_id);
  db.prepare('UPDATE reset_tokens SET used = 1 WHERE id = ?').run(resetRecord.id);
  db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(resetRecord.user_id);

  return res.json({ message: 'Password updated successfully' });
});

// POST /auth/refresh
router.post('/refresh', (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Refresh token required' } });
  }

  try {
    const decoded = jwt.verify(refreshToken, JWT_SECRET + '_refresh');
    const stored = db.prepare('SELECT * FROM refresh_tokens WHERE token = ? AND user_id = ?').get(refreshToken, decoded.id);
    if (!stored || new Date(stored.expires_at) < new Date()) {
      return res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Invalid or expired refresh token' } });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(decoded.id);
    if (!user) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'User not found or disabled' } });
    }

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);
    // Rotate refresh token
    db.prepare('DELETE FROM refresh_tokens WHERE token = ?').run(refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO refresh_tokens (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)')
      .run(uuidv4(), user.id, newRefreshToken, expiresAt);

    return res.json({ accessToken, refreshToken: newRefreshToken });
  } catch (err) {
    return res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Invalid refresh token' } });
  }
});

module.exports = router;
