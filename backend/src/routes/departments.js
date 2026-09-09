const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/schema');
const { authenticate, requireRole } = require('../middleware/auth');
const { createAuditLog } = require('./admin');

const router = express.Router();

// GET /departments
router.get('/', authenticate, (req, res) => {
  const departments = db.prepare(`
    SELECT d.*, COUNT(u.id) as member_count
    FROM departments d
    LEFT JOIN users u ON u.department_id = d.id
    GROUP BY d.id
    ORDER BY d.name ASC
  `).all();
  return res.json({ departments });
});

// GET /departments/:id
router.get('/:id', authenticate, (req, res) => {
  const dept = db.prepare('SELECT * FROM departments WHERE id = ?').get(req.params.id);
  if (!dept) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Department not found' } });
  const members = db.prepare('SELECT id, name, email, designation, status, photo_url, role FROM users WHERE department_id = ?').all(req.params.id);
  return res.json({ ...dept, members });
});

// POST /departments — admin only
router.post('/', authenticate, requireRole('admin'), (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Department name is required' } });
  }

  const existing = db.prepare('SELECT id FROM departments WHERE name = ?').get(name.trim());
  if (existing) {
    return res.status(409).json({ error: { code: 'CONFLICT', message: 'Department name already exists' } });
  }

  const id = uuidv4();
  db.prepare('INSERT INTO departments (id, name) VALUES (?, ?)').run(id, name.trim());
  createAuditLog(req.user.id, req.user.name, 'department.create', 'department', id, name.trim());

  const dept = db.prepare('SELECT * FROM departments WHERE id = ?').get(id);
  return res.status(201).json(dept);
});

// PUT /departments/:id — admin only
router.put('/:id', authenticate, requireRole('admin'), (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Department name is required' } });
  }

  const dept = db.prepare('SELECT * FROM departments WHERE id = ?').get(req.params.id);
  if (!dept) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Department not found' } });

  db.prepare('UPDATE departments SET name = ? WHERE id = ?').run(name.trim(), req.params.id);
  createAuditLog(req.user.id, req.user.name, 'department.update', 'department', req.params.id, name.trim());

  const updated = db.prepare('SELECT * FROM departments WHERE id = ?').get(req.params.id);
  return res.json(updated);
});

// DELETE /departments/:id — admin only
router.delete('/:id', authenticate, requireRole('admin'), (req, res) => {
  const dept = db.prepare('SELECT * FROM departments WHERE id = ?').get(req.params.id);
  if (!dept) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Department not found' } });

  const { reassign_to } = req.query;
  if (reassign_to) {
    const target = db.prepare('SELECT id FROM departments WHERE id = ?').get(reassign_to);
    if (!target) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Reassign target department not found' } });
    db.prepare('UPDATE users SET department_id = ? WHERE department_id = ?').run(reassign_to, req.params.id);
  } else {
    db.prepare('UPDATE users SET department_id = NULL WHERE department_id = ?').run(req.params.id);
  }

  db.prepare('DELETE FROM departments WHERE id = ?').run(req.params.id);
  createAuditLog(req.user.id, req.user.name, 'department.delete', 'department', req.params.id, dept.name);
  return res.status(204).send();
});

module.exports = router;
