const express = require('express');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const db = require('../db/schema');
const { authenticate, requireRole } = require('../middleware/auth');
const { createAuditLog } = require('./admin');

const router = express.Router();

function safeUser(u) {
  if (!u) return null;
  const { password_hash, ...safe } = u;
  try {
    const inCall = db.prepare(`
      SELECT 1 FROM meeting_participants mp
      JOIN meetings m ON mp.meeting_id = m.id
      WHERE mp.user_id = ? AND mp.left_at IS NULL AND m.status = 'active'
      LIMIT 1
    `).get(u.id);
    if (inCall) {
      safe.status = 'in_call';
    }
  } catch (_) {}
  return safe;
}

// GET /users — list all users
router.get('/', authenticate, (req, res) => {
  const { page = 1, limit = 50, department, search } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let query = 'SELECT u.*, d.name as department_name FROM users u LEFT JOIN departments d ON u.department_id = d.id WHERE 1=1';
  const params = [];

  if (department) {
    query += ' AND u.department_id = ?';
    params.push(department);
  }
  if (search) {
    query += ' AND (u.name LIKE ? OR u.email LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  const totalQuery = query.replace('SELECT u.*, d.name as department_name', 'SELECT COUNT(*) as count');
  const total = db.prepare(totalQuery).get(...params).count;

  query += ' ORDER BY u.name ASC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), offset);

  const users = db.prepare(query).all(...params).map(safeUser);
  return res.json({ users, total, page: parseInt(page), limit: parseInt(limit) });
});

// GET /users/:id
router.get('/:id', authenticate, (req, res) => {
  const user = db.prepare(
    'SELECT u.*, d.name as department_name FROM users u LEFT JOIN departments d ON u.department_id = d.id WHERE u.id = ?'
  ).get(req.params.id);
  if (!user) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
  return res.json(safeUser(user));
});

// PUT /users/:id — update own profile or admin updating another
router.put('/:id', authenticate, (req, res) => {
  const isOwnProfile = req.user.id === req.params.id;
  const isAdmin = req.user.role === 'admin';
  if (!isOwnProfile && !isAdmin) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Cannot update another user\'s profile' } });
  }

  const { name, designation, contact, photo_url, department_id } = req.body;
  const updates = [];
  const params = [];

  if (name) { updates.push('name = ?'); params.push(name); }
  if (designation !== undefined) { updates.push('designation = ?'); params.push(designation); }
  if (contact !== undefined) { updates.push('contact = ?'); params.push(contact); }
  if (photo_url !== undefined) { updates.push('photo_url = ?'); params.push(photo_url); }
  if (department_id && isAdmin) { updates.push('department_id = ?'); params.push(department_id); }

  if (updates.length === 0) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'No fields to update' } });

  updates.push("updated_at = datetime('now')");
  params.push(req.params.id);

  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  const updated = db.prepare('SELECT u.*, d.name as department_name FROM users u LEFT JOIN departments d ON u.department_id = d.id WHERE u.id = ?').get(req.params.id);
  return res.json(safeUser(updated));
});

// POST /users — admin creates employee
router.post('/', authenticate, requireRole('admin'), (req, res) => {
  const { name, email, department_id, role = 'employee', designation = '' } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Name and email are required' } });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) {
    return res.status(409).json({ error: { code: 'CONFLICT', message: 'Email already in use' } });
  }

  const tempPassword = 'Welcome@' + Math.floor(1000 + Math.random() * 9000);
  const hash = bcrypt.hashSync(tempPassword, 10);
  const id = uuidv4();

  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role, department_id, designation)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, email.toLowerCase().trim(), hash, role, department_id || null, designation);

  createAuditLog(req.user.id, req.user.name, 'user.create', 'user', id, name);

  const user = db.prepare('SELECT u.*, d.name as department_name FROM users u LEFT JOIN departments d ON u.department_id = d.id WHERE u.id = ?').get(id);
  console.log(`[DEV] New user ${email} created with temp password: ${tempPassword}`);
  return res.status(201).json({ ...safeUser(user), tempPassword });
});

// DELETE /users/:id — admin only
router.delete('/:id', authenticate, requireRole('admin'), (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Cannot delete your own account' } });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  createAuditLog(req.user.id, req.user.name, 'user.delete', 'user', req.params.id, user.name);
  return res.status(204).send();
});

// PATCH /users/:id/status — admin enables/disables account
router.patch('/:id/status', authenticate, requireRole('admin'), (req, res) => {
  const { active } = req.body;
  if (typeof active !== 'boolean') {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'active (boolean) is required' } });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });

  db.prepare('UPDATE users SET is_active = ?, updated_at = datetime(\'now\') WHERE id = ?').run(active ? 1 : 0, req.params.id);
  createAuditLog(req.user.id, req.user.name, active ? 'user.enable' : 'user.disable', 'user', req.params.id, user.name);

  const updated = db.prepare('SELECT u.*, d.name as department_name FROM users u LEFT JOIN departments d ON u.department_id = d.id WHERE u.id = ?').get(req.params.id);
  return res.json(safeUser(updated));
});

// GET /users/:id/conversations — convenience endpoint
router.get('/:id/conversations', authenticate, (req, res) => {
  if (req.user.id !== req.params.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
  }
  const convs = db.prepare(`
    SELECT c.*, cm.last_read_message_id
    FROM conversations c
    JOIN conversation_members cm ON c.id = cm.conversation_id
    WHERE cm.user_id = ?
    ORDER BY c.updated_at DESC
  `).all(req.params.id);
  return res.json({ conversations: convs });
});

module.exports = router;
