import { getSocketId, isOnline, isInMatch } from './presence.js';
import { INVITE_TIMEOUT_MS } from '../game/constants.js';

// pending invites: inviterId -> { targetId, timer }
const pendingInvites = new Map();

export function setupInvites(io, socket, userId, db) {
  // Send an invite to a friend
  socket.on('invite:send', ({ targetId }) => {
    // Validate targetId is a number
    const tid = parseInt(targetId);
    if (!tid || isNaN(tid)) return socket.emit('invite:error', { message: 'Invalid target' });

    // Check friendship
    const friendship = db.prepare(`
      SELECT id FROM friendships 
      WHERE status = 'accepted' AND 
        ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))
    `).get(userId, tid, tid, userId);
    if (!friendship) return socket.emit('invite:error', { message: 'Not friends with that player' });

    // Check target is online
    if (!isOnline(tid)) return socket.emit('invite:error', { message: 'Player is offline' });
    if (isInMatch(tid)) return socket.emit('invite:error', { message: 'Player is in a match' });

    // Check inviter isn't already in match
    if (isInMatch(userId)) return socket.emit('invite:error', { message: 'You are already in a match' });

    // Cancel any existing outgoing invite
    if (pendingInvites.has(userId)) {
      const old = pendingInvites.get(userId);
      clearTimeout(old.timer);
      const oldTargetSocket = getSocketId(old.targetId);
      if (oldTargetSocket) io.to(oldTargetSocket).emit('invite:cancelled', { fromId: userId });
    }

    // Get inviter username
    const inviter = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
    const target = db.prepare('SELECT username FROM users WHERE id = ?').get(tid);
    if (!inviter || !target) return socket.emit('invite:error', { message: 'User not found' });

    // Set expiration timer
    const timer = setTimeout(() => {
      pendingInvites.delete(userId);
      socket.emit('invite:expired', { targetId: tid, targetUsername: target.username });
      const targetSocket = getSocketId(tid);
      if (targetSocket) io.to(targetSocket).emit('invite:expired', { fromId: userId });
    }, INVITE_TIMEOUT_MS);

    pendingInvites.set(userId, { targetId: tid, timer });

    // Notify target
    const targetSocket = getSocketId(tid);
    if (targetSocket) {
      io.to(targetSocket).emit('invite:received', {
        fromId: userId,
        fromUsername: inviter.username,
        expiresIn: INVITE_TIMEOUT_MS,
      });
    }

    socket.emit('invite:sent', { targetId: tid, targetUsername: target.username });
  });

  // Accept an invite
  socket.on('invite:accept', ({ fromId }, callback) => {
    const fid = parseInt(fromId);
    if (!fid) return;

    const invite = pendingInvites.get(fid);
    if (!invite || invite.targetId !== userId) {
      return socket.emit('invite:error', { message: 'No pending invite from that player' });
    }

    clearTimeout(invite.timer);
    pendingInvites.delete(fid);

    // Notify both to proceed to lobby
    const inviterSocket = getSocketId(fid);
    const accepterInfo = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId);
    const inviterInfo = db.prepare('SELECT id, username FROM users WHERE id = ?').get(fid);

    if (callback) callback({ success: true });

    // Create lobby room - emit to both sockets
    const roomId = `match_${fid}_${userId}_${Date.now()}`;
    socket.emit('lobby:created', { roomId, opponent: inviterInfo });
    if (inviterSocket) io.to(inviterSocket).emit('lobby:created', { roomId, opponent: accepterInfo });
  });

  // Decline an invite
  socket.on('invite:decline', ({ fromId }) => {
    const fid = parseInt(fromId);
    const invite = pendingInvites.get(fid);
    if (!invite || invite.targetId !== userId) return;

    clearTimeout(invite.timer);
    pendingInvites.delete(fid);

    const inviterSocket = getSocketId(fid);
    const declinerInfo = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
    if (inviterSocket) {
      io.to(inviterSocket).emit('invite:declined', {
        byId: userId,
        byUsername: declinerInfo?.username,
      });
    }
  });

  // Cancel own outgoing invite
  socket.on('invite:cancel', () => {
    const invite = pendingInvites.get(userId);
    if (!invite) return;

    clearTimeout(invite.timer);
    pendingInvites.delete(userId);

    const targetSocket = getSocketId(invite.targetId);
    if (targetSocket) io.to(targetSocket).emit('invite:cancelled', { fromId: userId });
  });

  // On disconnect, cancel any outgoing invites
  socket.on('disconnect', () => {
    const invite = pendingInvites.get(userId);
    if (invite) {
      clearTimeout(invite.timer);
      pendingInvites.delete(userId);
      const targetSocket = getSocketId(invite.targetId);
      if (targetSocket) io.to(targetSocket).emit('invite:cancelled', { fromId: userId });
    }
  });
}
