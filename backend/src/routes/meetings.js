const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/schema');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

function endMeetingInternal(meetingId, io) {
  const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(meetingId);
  if (!meeting || meeting.status === 'ended') return;

  db.prepare("UPDATE meetings SET status = 'ended', ended_at = datetime('now') WHERE id = ?").run(meetingId);

  // Revert all participants presence to online
  const participants = db.prepare('SELECT user_id FROM meeting_participants WHERE meeting_id = ?').all(meetingId);
  if (io) {
    participants.forEach(p => {
      io.emit('presence:changed', { userId: p.user_id, status: 'online' });
    });
    io.to(`meeting:${meetingId}`).emit('meeting:ended', { meetingId });
  }

  // Update call message in the conversation if attached
  if (meeting.call_message_id) {
    try {
      const callMsg = db.prepare('SELECT * FROM messages WHERE id = ?').get(meeting.call_message_id);
      if (callMsg && callMsg.content.startsWith('[CALL:')) {
        const raw = callMsg.content.slice(6, -1);
        const parsed = JSON.parse(raw);
        const started = new Date(parsed.startedAt || meeting.created_at);
        const ended = new Date();
        const durationSec = Math.max(1, Math.round((ended.getTime() - started.getTime()) / 1000));
        const mins = Math.floor(durationSec / 60);
        const secs = durationSec % 60;
        const durationStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

        parsed.status = 'ended';
        parsed.duration = durationStr;
        parsed.endedAt = ended.toISOString();

        const newContent = `[CALL:${JSON.stringify(parsed)}]`;
        db.prepare('UPDATE messages SET content = ? WHERE id = ?').run(newContent, callMsg.id);

        const updatedMsg = db.prepare(`
          SELECT m.*, u.name as sender_name, u.photo_url as sender_photo
          FROM messages m JOIN users u ON m.sender_id = u.id
          WHERE m.id = ?
        `).get(callMsg.id);

        if (io && updatedMsg) {
          const payload = { ...updatedMsg, reactions: [], files: [] };
          io.to(`conv:${callMsg.conversation_id}`).emit('message:updated', payload);
          const members = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ?').all(callMsg.conversation_id);
          members.forEach(m => io.to(`user:${m.user_id}`).emit('message:updated', payload));
        }
      }
    } catch (e) {
      console.error('Failed to update call message:', e);
    }
  }
}

// POST /meetings — create a meeting
router.post('/', authenticate, (req, res) => {
  const { type = 'group', inviteeIds = [], conversationId, callMode = 'video' } = req.body;
  const allParticipants = [...new Set([req.user.id, ...inviteeIds])];
  const id = uuidv4();
  const roomName = `ghl-${id.split('-')[0]}`;

  let callMessageId = null;

  // If created inside a conversation, insert an interactive call card message
  if (conversationId) {
    callMessageId = uuidv4();
    const callData = {
      type: 'call',
      meetingId: id,
      callMode: callMode === 'audio' ? 'audio' : 'video',
      status: 'active',
      hostId: req.user.id,
      hostName: req.user.name,
      hostPhoto: req.user.photo_url || '',
      startedAt: new Date().toISOString(),
    };
    const content = `[CALL:${JSON.stringify(callData)}]`;
    db.prepare('INSERT INTO messages (id, conversation_id, sender_id, content) VALUES (?, ?, ?, ?)')
      .run(callMessageId, conversationId, req.user.id, content);
    db.prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(conversationId);
  }

  db.prepare(`
    INSERT INTO meetings (id, type, host_id, status, room_name, conversation_id, call_mode, call_message_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, type, req.user.id, 'active', roomName, conversationId || null, callMode, callMessageId);

  const insertP = db.prepare('INSERT INTO meeting_participants (meeting_id, user_id, joined_at) VALUES (?, ?, ?)');
  // Host joins immediately
  insertP.run(id, req.user.id, new Date().toISOString());
  // Invitees are initialized without joined_at until they actually answer
  inviteeIds.forEach(uid => {
    if (uid !== req.user.id) {
      insertP.run(id, uid, null);
    }
  });

  const io = req.app.get('io');
  if (io) {
    // If call card message was created, broadcast it in real-time
    if (conversationId && callMessageId) {
      const msg = db.prepare(`
        SELECT m.*, u.name as sender_name, u.photo_url as sender_photo
        FROM messages m JOIN users u ON m.sender_id = u.id
        WHERE m.id = ?
      `).get(callMessageId);
      if (msg) {
        const payload = { ...msg, reactions: [], files: [] };
        io.to(`conv:${conversationId}`).emit('message:new', payload);
        const members = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ?').all(conversationId);
        members.forEach(m => io.to(`user:${m.user_id}`).emit('message:new', payload));
      }
    }

    // Direct incoming call prompt to invitees
    inviteeIds.forEach(uid => {
      const notifId = uuidv4();
      const payload = JSON.stringify({ meetingId: id, hostName: req.user.name, roomName, type, callMode });
      db.prepare('INSERT INTO notifications (id, user_id, type, payload) VALUES (?, ?, ?, ?)').run(notifId, uid, 'meeting_invite', payload);
      
      // In-app notification
      io.to(`user:${uid}`).emit('notification:new', {
        id: notifId, type: 'meeting_invite', payload: JSON.parse(payload), read: false, created_at: new Date().toISOString()
      });

      // Real-time incoming call overlay
      io.to(`user:${uid}`).emit('call:incoming', {
        meetingId: id,
        callMode: callMode === 'audio' ? 'audio' : 'video',
        hostId: req.user.id,
        hostName: req.user.name,
        hostPhoto: req.user.photo_url || '',
        conversationId: conversationId || null,
      });
    });
  }

  return res.status(201).json({
    meetingId: id,
    roomName,
    callMode,
    conversationId,
    joinUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/meetings/${id}`
  });
});

// GET /meetings/:id
router.get('/:id', authenticate, (req, res) => {
  const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(req.params.id);
  if (!meeting) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Meeting not found' } });

  const participants = db.prepare(`
    SELECT u.id, u.name, u.photo_url, mp.joined_at, mp.left_at
    FROM users u
    JOIN meeting_participants mp ON u.id = mp.user_id
    WHERE mp.meeting_id = ?
  `).all(req.params.id);

  return res.json({ ...meeting, participants });
});

// POST /meetings/:id/join
router.post('/:id/join', authenticate, (req, res) => {
  const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(req.params.id);
  if (!meeting) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Meeting not found' } });
  if (meeting.status === 'ended') return res.status(400).json({ error: { code: 'MEETING_ENDED', message: 'Meeting has already ended' } });

  // Upsert participant
  db.prepare('INSERT OR IGNORE INTO meeting_participants (meeting_id, user_id) VALUES (?, ?)').run(req.params.id, req.user.id);
  db.prepare("UPDATE meeting_participants SET joined_at = datetime('now'), left_at = NULL WHERE meeting_id = ? AND user_id = ?").run(req.params.id, req.user.id);

  // Emit to meeting room and broadcast in-call presence
  const io = req.app.get('io');
  if (io) {
    io.to(`meeting:${req.params.id}`).emit('meeting:participant_joined', { userId: req.user.id, name: req.user.name });
    io.emit('presence:changed', { userId: req.user.id, status: 'in_call', name: req.user.name });
  }

  return res.json({ roomToken: meeting.room_name, meetingId: req.params.id, callMode: meeting.call_mode || 'video' });
});

// POST /meetings/:id/leave
router.post('/:id/leave', authenticate, (req, res) => {
  db.prepare("UPDATE meeting_participants SET left_at = datetime('now') WHERE meeting_id = ? AND user_id = ?")
    .run(req.params.id, req.user.id);

  const io = req.app.get('io');
  if (io) {
    io.to(`meeting:${req.params.id}`).emit('meeting:participant_left', { userId: req.user.id, name: req.user.name });
    io.emit('presence:changed', { userId: req.user.id, status: 'online', name: req.user.name });
  }

  const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(req.params.id);
  if (meeting && meeting.status !== 'ended') {
    // Check if any participants who actually joined remain active
    const activeJoined = db.prepare(`
      SELECT COUNT(*) as count FROM meeting_participants
      WHERE meeting_id = ? AND joined_at IS NOT NULL AND left_at IS NULL
    `).get(req.params.id);

    // If 1:1 call or host leaves, or no active joined participants remain, end the meeting
    if (meeting.type === '1:1' || meeting.host_id === req.user.id || activeJoined.count === 0) {
      endMeetingInternal(req.params.id, io);
    }
  }

  return res.status(204).send();
});

// POST /meetings/:id/end — host, admin, or participant in a 1:1 call
router.post('/:id/end', authenticate, (req, res) => {
  const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(req.params.id);
  if (!meeting) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Meeting not found' } });
  
  const isParticipant = db.prepare('SELECT 1 FROM meeting_participants WHERE meeting_id = ? AND user_id = ?').get(req.params.id, req.user.id);
  const canEnd = meeting.host_id === req.user.id || req.user.role === 'admin' || (meeting.type === '1:1' && isParticipant);

  if (!canEnd) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not authorized to end the meeting' } });
  }

  const io = req.app.get('io');
  endMeetingInternal(req.params.id, io);
  return res.status(204).send();
});

module.exports = router;
module.exports.endMeetingInternal = endMeetingInternal;
