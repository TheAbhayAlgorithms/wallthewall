import jwt from 'jsonwebtoken';
import { setOnline, setOffline, getPresence, getAllPresence } from './presence.js';
import { setupInvites } from './invites.js';
import { setupMatch } from './match.js';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

export function setupSockets(io, db) {
  // Auth middleware for socket connections
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('No token'));

    try {
      const user = jwt.verify(token, JWT_SECRET);
      socket.user = user;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user.id;
    const username = socket.user.username;

    console.log(`[Socket] ${username} (${userId}) connected: ${socket.id}`);

    // Mark user as online
    setOnline(userId, socket.id);

    // Notify friends about online status
    broadcastPresenceToFriends(io, socket, userId, 'online', db);

    // Get current presence for all users (to populate friends list)
    socket.on('presence:getAll', () => {
      socket.emit('presence:snapshot', getAllPresence());
    });

    // Setup invite handlers
    setupInvites(io, socket, userId, db);

    // Setup match handlers
    setupMatch(io, socket, userId, db);

    // Friend request notifications
    socket.on('friend:requestSent', ({ targetId }) => {
      const targetPresence = getPresence(targetId);
      if (targetPresence) {
        const senderInfo = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
        io.to(targetPresence.socketId).emit('friend:requestReceived', {
          fromId: userId,
          fromUsername: senderInfo?.username,
        });
      }
    });

    socket.on('friend:accepted', ({ requesterId }) => {
      const requesterPresence = getPresence(requesterId);
      if (requesterPresence) {
        const accepterInfo = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
        io.to(requesterPresence.socketId).emit('friend:acceptedNotif', {
          byId: userId,
          byUsername: accepterInfo?.username,
        });
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] ${username} (${userId}) disconnected`);
      setOffline(userId);
      broadcastPresenceToFriends(io, socket, userId, 'offline', db);
    });
  });
}

function broadcastPresenceToFriends(io, socket, userId, status, db) {
  try {
    const friends = db.prepare(`
      SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END as friend_id
      FROM friendships WHERE (requester_id = ? OR addressee_id = ?) AND status = 'accepted'
    `).all(userId, userId, userId);

    for (const { friend_id } of friends) {
      const friendPresence = getPresence(friend_id);
      if (friendPresence) {
        io.to(friendPresence.socketId).emit('presence:update', { userId, status });
      }
    }
  } catch (e) {
    // Ignore presence broadcast errors
  }
}
