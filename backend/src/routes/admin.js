const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/schema');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

function createAuditLog(actorId, actorName, action, targetType, targetId, targetName, metadata = {}) {
  db.prepare(`
    INSERT INTO audit_logs (id, actor_id, actor_name, action, target_type, target_id, target_name, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), actorId, actorName, action, targetType || '', targetId || '', targetName || '', JSON.stringify(metadata));
}

// GET /admin/audit-logs
router.get('/audit-logs', authenticate, requireRole('admin'), (req, res) => {
  const { from, to, userId, limit = 100, page = 1 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let query = 'SELECT * FROM audit_logs WHERE 1=1';
  const params = [];

  if (from) { query += ' AND created_at >= ?'; params.push(from); }
  if (to) { query += ' AND created_at <= ?'; params.push(to); }
  if (userId) { query += ' AND actor_id = ?'; params.push(userId); }

  const total = db.prepare(query.replace('SELECT *', 'SELECT COUNT(*) as count')).get(...params).count;
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), offset);

  const logs = db.prepare(query).all(...params).map(l => ({
    ...l,
    metadata: (() => { try { return JSON.parse(l.metadata); } catch { return {}; } })(),
  }));

  return res.json({ logs, total, page: parseInt(page), limit: parseInt(limit) });
});

// GET /admin/usage-stats
router.get('/usage-stats', authenticate, requireRole('admin'), (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  const activeUsersToday = db.prepare(`
    SELECT COUNT(DISTINCT actor_id) as count FROM audit_logs
    WHERE action = 'user.login' AND created_at >= ?
  `).get(today + 'T00:00:00').count;

  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const activeUsers = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_active = 1').get().count;
  const onlineUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE status = 'online'").get().count;
  const totalMessages = db.prepare('SELECT COUNT(*) as count FROM messages WHERE is_deleted = 0').get().count;
  const totalFiles = db.prepare('SELECT COUNT(*) as count FROM files').get().count;
  const totalMeetings = db.prepare('SELECT COUNT(*) as count FROM meetings').get().count;
  const totalDepartments = db.prepare('SELECT COUNT(*) as count FROM departments').get().count;
  const recentLogins = db.prepare(`
    SELECT al.actor_name, al.actor_id, al.created_at, u.designation
    FROM audit_logs al
    LEFT JOIN users u ON al.actor_id = u.id
    WHERE al.action = 'user.login'
    ORDER BY al.created_at DESC LIMIT 10
  `).all();
  const storageUsed = db.prepare('SELECT COALESCE(SUM(size), 0) as total FROM files').get().total;

  return res.json({
    activeUsersToday,
    totalUsers,
    activeUsers,
    onlineUsers,
    totalMessages,
    totalFiles,
    totalMeetings,
    totalDepartments,
    recentLogins,
    storageUsed,
  });
});

module.exports = router;
module.exports.createAuditLog = createAuditLog;
