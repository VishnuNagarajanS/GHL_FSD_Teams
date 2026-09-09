const db = require('../db/schema');

function setupSocketHandlers(io) {
  // Auth middleware for socket
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));

    try {
      const jwt = require('jsonwebtoken');
      const { JWT_SECRET } = require('../middleware/auth');
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(decoded.id);
      if (!user) return next(new Error('User not found'));
      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.user;
    console.log(`[Socket] User connected: ${user.name} (${user.id})`);

    // Join personal room
    socket.join(`user:${user.id}`);

    // Set online
    db.prepare("UPDATE users SET status = 'online' WHERE id = ?").run(user.id);
    io.emit('presence:changed', { userId: user.id, status: 'online', name: user.name });

    // Join all user's conversations
    const conversations = db.prepare(`
      SELECT conversation_id FROM conversation_members WHERE user_id = ?
    `).all(user.id);
    conversations.forEach(c => socket.join(`conv:${c.conversation_id}`));

    // Join active meetings
    const meetings = db.prepare(`
      SELECT meeting_id FROM meeting_participants WHERE user_id = ? AND left_at IS NULL
    `).all(user.id);
    meetings.forEach(m => socket.join(`meeting:${m.meeting_id}`));

    // === EVENTS ===

    // Typing indicator
    socket.on('message:typing', (data) => {
      socket.to(`conv:${data.conversationId}`).emit('message:typing', {
        conversationId: data.conversationId,
        userId: user.id,
        userName: user.name,
        isTyping: data.isTyping,
      });
    });

    // Join a conversation room
    socket.on('conv:join', (conversationId) => {
      const member = db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?')
        .get(conversationId, user.id);
      if (member) socket.join(`conv:${conversationId}`);
    });

    // Join a meeting room (WebRTC signaling)
    socket.on('meeting:join', (meetingId) => {
      socket.join(`meeting:${meetingId}`);
      socket.to(`meeting:${meetingId}`).emit('meeting:participant_joined', { userId: user.id, name: user.name });
    });

    // WebRTC signaling
    socket.on('webrtc:offer', (data) => {
      if (data.to) {
        io.to(`user:${data.to}`).emit('webrtc:offer', { ...data, from: user.id });
      } else {
        socket.to(`meeting:${data.meetingId}`).emit('webrtc:offer', { ...data, from: user.id });
      }
    });
    socket.on('webrtc:answer', (data) => {
      if (data.to) {
        io.to(`user:${data.to}`).emit('webrtc:answer', { ...data, from: user.id });
      } else {
        socket.to(`meeting:${data.meetingId}`).emit('webrtc:answer', { ...data, from: user.id });
      }
    });
    socket.on('webrtc:ice-candidate', (data) => {
      if (data.to) {
        io.to(`user:${data.to}`).emit('webrtc:ice-candidate', { ...data, from: user.id });
      } else {
        socket.to(`meeting:${data.meetingId}`).emit('webrtc:ice-candidate', { ...data, from: user.id });
      }
    });

    // Presence update from client
    socket.on('presence:update', (data) => {
      const status = data.status === 'online' ? 'online' : 'offline';
      db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, user.id);
      io.emit('presence:changed', { userId: user.id, status, name: user.name });
    });

    // Call declined by receiver
    socket.on('call:decline', (data) => {
      if (data.hostId) {
        io.to(`user:${data.hostId}`).emit('call:declined', {
          meetingId: data.meetingId,
          userId: user.id,
          userName: user.name,
        });
      }
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`[Socket] User disconnected: ${user.name} (${user.id})`);
      try {
        const activeMeetings = db.prepare(`
          SELECT mp.meeting_id, m.type, m.host_id FROM meeting_participants mp
          JOIN meetings m ON mp.meeting_id = m.id
          WHERE mp.user_id = ? AND mp.left_at IS NULL AND m.status = 'active'
        `).all(user.id);

        db.prepare("UPDATE meeting_participants SET left_at = datetime('now') WHERE user_id = ? AND left_at IS NULL").run(user.id);

        activeMeetings.forEach(am => {
          io.to(`meeting:${am.meeting_id}`).emit('meeting:participant_left', { userId: user.id, name: user.name });
          const activeJoined = db.prepare(`
            SELECT COUNT(*) as count FROM meeting_participants
            WHERE meeting_id = ? AND joined_at IS NOT NULL AND left_at IS NULL
          `).get(am.meeting_id);
          if (am.type === '1:1' || am.host_id === user.id || activeJoined.count === 0) {
            const { endMeetingInternal } = require('../routes/meetings');
            if (endMeetingInternal) endMeetingInternal(am.meeting_id, io);
          }
        });
      } catch (_) {}

      // Check if user has other active sockets
      const sockets = io.sockets.adapter.rooms.get(`user:${user.id}`);
      if (!sockets || sockets.size === 0) {
        db.prepare("UPDATE users SET status = 'offline' WHERE id = ?").run(user.id);
        io.emit('presence:changed', { userId: user.id, status: 'offline', name: user.name });
      }
    });
  });
}

module.exports = { setupSocketHandlers };
