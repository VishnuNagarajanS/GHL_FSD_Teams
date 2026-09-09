const express = require('express');
const db = require('../db/schema');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /notifications
router.get('/', authenticate, (req, res) => {
  const { unreadOnly } = req.query;
  let query = 'SELECT * FROM notifications WHERE user_id = ?';
  const params = [req.user.id];
  if (unreadOnly === 'true') {
    query += ' AND is_read = 0';
  }
  query += ' ORDER BY created_at DESC LIMIT 100';
  const notifications = db.prepare(query).all(...params).map(n => ({
    ...n,
    payload: (() => { try { return JSON.parse(n.payload); } catch { return {}; } })(),
  }));
  return res.json({ notifications });
});

// PATCH /notifications/:id/read
router.patch('/:id/read', authenticate, (req, res) => {
  const notif = db.prepare('SELECT * FROM notifications WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!notif) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Notification not found' } });
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(req.params.id);
  return res.json({ ...notif, is_read: 1 });
});

// PATCH /notifications/read-all
router.patch('/read-all', authenticate, (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);
  return res.json({ message: 'All notifications marked as read' });
});

module.exports = router;
