const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/schema');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

function getConversationsForUser(userId) {
  const convs = db.prepare(`
    SELECT c.*, cm.last_read_message_id,
      (
        SELECT COUNT(*) FROM messages m
        WHERE m.conversation_id = c.id
          AND m.is_deleted = 0
          AND m.id != COALESCE(cm.last_read_message_id, '')
          AND m.sender_id != ?
          AND m.created_at > COALESCE(
            (SELECT created_at FROM messages WHERE id = cm.last_read_message_id), '1970-01-01'
          )
      ) as unread_count,
      (
        SELECT json_object('id', m2.id, 'content', m2.content, 'sender_id', m2.sender_id, 'created_at', m2.created_at, 'is_deleted', m2.is_deleted)
        FROM messages m2
        WHERE m2.conversation_id = c.id AND m2.is_deleted = 0
        ORDER BY m2.created_at DESC LIMIT 1
      ) as last_message_json
    FROM conversations c
    JOIN conversation_members cm ON c.id = cm.conversation_id AND cm.user_id = ?
    ORDER BY c.updated_at DESC
  `).all(userId, userId);

  return convs.map(c => {
    const members = db.prepare(`
      SELECT u.id, u.name, u.photo_url, u.status, u.designation
      FROM users u
      JOIN conversation_members cm ON u.id = cm.user_id
      WHERE cm.conversation_id = ?
    `).all(c.id);

    let lastMessage = null;
    try { lastMessage = JSON.parse(c.last_message_json); } catch (_) {}

    return {
      ...c,
      members,
      last_message: lastMessage,
      last_message_json: undefined,
    };
  });
}

// GET /conversations
router.get('/', authenticate, (req, res) => {
  const conversations = getConversationsForUser(req.user.id);
  return res.json({ conversations });
});

// POST /conversations
router.post('/', authenticate, (req, res) => {
  const { type, memberIds, name } = req.body;
  if (!type || !memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'type and memberIds are required' } });
  }

  const allMemberIds = [...new Set([req.user.id, ...memberIds])];

  // For DMs: check if one already exists
  if (type === 'dm') {
    if (allMemberIds.length !== 2) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'DM requires exactly one other member' } });
    }
    const [a, b] = allMemberIds;
    const existing = db.prepare(`
      SELECT c.id FROM conversations c
      JOIN conversation_members cm1 ON c.id = cm1.conversation_id AND cm1.user_id = ?
      JOIN conversation_members cm2 ON c.id = cm2.conversation_id AND cm2.user_id = ?
      WHERE c.type = 'dm'
      LIMIT 1
    `).get(a, b);
    if (existing) {
      const conv = getConversationsForUser(req.user.id).find(c => c.id === existing.id);
      return res.status(200).json(conv || existing);
    }
  }

  const id = uuidv4();
  db.prepare(`INSERT INTO conversations (id, type, name, created_by) VALUES (?, ?, ?, ?)`)
    .run(id, type, name || '', req.user.id);

  const insertMember = db.prepare('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)');
  allMemberIds.forEach(uid => insertMember.run(id, uid));

  const conv = getConversationsForUser(req.user.id).find(c => c.id === id);

  // Notify all members about the new conversation in real-time
  const io = req.app.get('io');
  if (io) {
    allMemberIds.forEach(uid => {
      const userConv = getConversationsForUser(uid).find(c => c.id === id);
      if (userConv) {
        io.to(`user:${uid}`).emit('conversation:new', userConv);
      }
    });
  }

  return res.status(201).json(conv);
});

// GET /conversations/:id/messages
router.get('/:id/messages', authenticate, (req, res) => {
  // Check membership
  const member = db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!member) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a member of this conversation' } });

  const { before, limit = 50 } = req.query;
  let query = `
    SELECT m.*, u.name as sender_name, u.photo_url as sender_photo,
      (
        SELECT json_group_array(json_object('emoji', r.emoji, 'user_id', r.user_id, 'user_name', ru.name))
        FROM reactions r JOIN users ru ON r.user_id = ru.id
        WHERE r.message_id = m.id
      ) as reactions_json,
      (
        SELECT json_group_array(json_object('id', f.id, 'original_name', f.original_name, 'mime_type', f.mime_type, 'size', f.size))
        FROM files f WHERE f.message_id = m.id
      ) as files_json
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    WHERE m.conversation_id = ?
  `;
  const params = [req.params.id];

  if (before) {
    const beforeMsg = db.prepare('SELECT created_at FROM messages WHERE id = ?').get(before);
    if (beforeMsg) {
      query += ' AND m.created_at < ?';
      params.push(beforeMsg.created_at);
    }
  }

  query += ' ORDER BY m.created_at DESC LIMIT ?';
  params.push(parseInt(limit));

  const messages = db.prepare(query).all(...params).map(m => ({
    ...m,
    reactions: (() => { try { return JSON.parse(m.reactions_json) || []; } catch { return []; } })(),
    files: (() => { try { return JSON.parse(m.files_json) || []; } catch { return []; } })(),
    reactions_json: undefined,
    files_json: undefined,
  })).reverse();

  return res.json({ messages });
});

// POST /conversations/:id/messages
router.post('/:id/messages', authenticate, (req, res) => {
  const member = db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!member) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a member of this conversation' } });

  const { content, attachmentIds } = req.body;
  if (!content && (!attachmentIds || attachmentIds.length === 0)) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Message content or attachment is required' } });
  }

  const id = uuidv4();
  db.prepare(`INSERT INTO messages (id, conversation_id, sender_id, content) VALUES (?, ?, ?, ?)`)
    .run(id, req.params.id, req.user.id, content || '');

  // Update conversation updated_at
  db.prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(req.params.id);

  // Link files
  if (attachmentIds && attachmentIds.length > 0) {
    const updateFile = db.prepare('UPDATE files SET message_id = ? WHERE id = ? AND uploaded_by = ?');
    attachmentIds.forEach(fid => updateFile.run(id, fid, req.user.id));
  }

  const msg = db.prepare(`
    SELECT m.*, u.name as sender_name, u.photo_url as sender_photo
    FROM messages m JOIN users u ON m.sender_id = u.id
    WHERE m.id = ?
  `).get(id);

  const files = db.prepare('SELECT * FROM files WHERE message_id = ?').all(id);
  const msgPayload = { ...msg, reactions: [], files };

  // Emit via socket to both the conversation room AND directly to every member's user room
  const io = req.app.get('io');
  if (io) {
    io.to(`conv:${req.params.id}`).emit('message:new', msgPayload);
    const allMembers = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ?').all(req.params.id);
    allMembers.forEach(m => {
      io.to(`user:${m.user_id}`).emit('message:new', msgPayload);
    });
  }

  // Create notifications for other members
  const members = db.prepare(`
    SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id != ?
  `).all(req.params.id, req.user.id);

  members.forEach(m => {
    const notifId = uuidv4();
    const payload = JSON.stringify({ conversationId: req.params.id, messageId: id, senderName: req.user.name, preview: (content || '').slice(0, 60) });
    db.prepare('INSERT INTO notifications (id, user_id, type, payload) VALUES (?, ?, ?, ?)').run(notifId, m.user_id, 'message', payload);
    if (io) {
      io.to(`user:${m.user_id}`).emit('notification:new', {
        id: notifId, type: 'message', payload: JSON.parse(payload), read: false, created_at: new Date().toISOString()
      });
    }
  });

  return res.status(201).json(msgPayload);
});

// PUT /messages/:id
router.put('/messages/:id', authenticate, (req, res) => {
  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id);
  if (!msg) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Message not found' } });
  if (msg.sender_id !== req.user.id) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Cannot edit another user\'s message' } });

  const { content } = req.body;
  db.prepare("UPDATE messages SET content = ?, is_edited = 1, updated_at = datetime('now') WHERE id = ?").run(content, req.params.id);

  const updated = db.prepare('SELECT m.*, u.name as sender_name FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.id = ?').get(req.params.id);
  const io = req.app.get('io');
  if (io) {
    io.to(`conv:${msg.conversation_id}`).emit('message:updated', updated);
    const allMembers = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ?').all(msg.conversation_id);
    allMembers.forEach(m => io.to(`user:${m.user_id}`).emit('message:updated', updated));
  }
  return res.json(updated);
});

// DELETE /messages/:id
router.delete('/messages/:id', authenticate, (req, res) => {
  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id);
  if (!msg) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Message not found' } });
  if (msg.sender_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Cannot delete another user\'s message' } });
  }

  db.prepare("UPDATE messages SET is_deleted = 1, content = '', updated_at = datetime('now') WHERE id = ?").run(req.params.id);

  const io = req.app.get('io');
  if (io) {
    io.to(`conv:${msg.conversation_id}`).emit('message:deleted', { id: req.params.id, conversation_id: msg.conversation_id });
    const allMembers = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ?').all(msg.conversation_id);
    allMembers.forEach(m => io.to(`user:${m.user_id}`).emit('message:deleted', { id: req.params.id, conversation_id: msg.conversation_id }));
  }
  return res.status(204).send();
});

// POST /messages/:id/reactions
router.post('/messages/:id/reactions', authenticate, (req, res) => {
  const { emoji } = req.body;
  if (!emoji) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Emoji is required' } });

  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id);
  if (!msg) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Message not found' } });

  const existing = db.prepare('SELECT id FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?').get(req.params.id, req.user.id, emoji);
  if (existing) {
    db.prepare('DELETE FROM reactions WHERE id = ?').run(existing.id);
  } else {
    db.prepare('INSERT INTO reactions (id, message_id, user_id, emoji) VALUES (?, ?, ?, ?)').run(uuidv4(), req.params.id, req.user.id, emoji);
  }

  const reactions = db.prepare(`
    SELECT r.emoji, r.user_id, u.name as user_name
    FROM reactions r JOIN users u ON r.user_id = u.id
    WHERE r.message_id = ?
  `).all(req.params.id);

  const io = req.app.get('io');
  if (io) io.to(`conv:${msg.conversation_id}`).emit('message:reaction', { messageId: req.params.id, reactions });
  return res.json({ reactions });
});

// DELETE /messages/:id/reactions/:emoji
router.delete('/messages/:id/reactions/:emoji', authenticate, (req, res) => {
  db.prepare('DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?')
    .run(req.params.id, req.user.id, req.params.emoji);
  return res.status(204).send();
});

// POST /conversations/:id/read
router.post('/:id/read', authenticate, (req, res) => {
  const { messageId } = req.body;
  db.prepare('UPDATE conversation_members SET last_read_message_id = ? WHERE conversation_id = ? AND user_id = ?')
    .run(messageId, req.params.id, req.user.id);
  const io = req.app.get('io');
  if (io) io.to(`conv:${req.params.id}`).emit('message:read', { conversationId: req.params.id, userId: req.user.id, messageId });
  return res.json({ message: 'Marked as read' });
});

// PATCH /conversations/:id — update group name/members
router.patch('/:id', authenticate, (req, res) => {
  const { name, addMemberIds, removeMemberIds } = req.body;
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id);
  if (!conv) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Conversation not found' } });

  if (name) db.prepare('UPDATE conversations SET name = ? WHERE id = ?').run(name, req.params.id);
  if (addMemberIds) {
    const insert = db.prepare('INSERT OR IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)');
    addMemberIds.forEach(uid => insert.run(req.params.id, uid));
  }
  if (removeMemberIds) {
    const remove = db.prepare('DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?');
    removeMemberIds.forEach(uid => remove.run(req.params.id, uid));
  }
  return res.json({ message: 'Updated' });
});

module.exports = router;
