// In-memory presence store: userId -> { socketId, status: 'online'|'in-match' }
const presence = new Map();

export function setOnline(userId, socketId) {
  presence.set(userId, { socketId, status: 'online' });
}

export function setInMatch(userId) {
  const p = presence.get(userId);
  if (p) presence.set(userId, { ...p, status: 'in-match' });
}

export function setOffline(userId) {
  presence.delete(userId);
}

export function getPresence(userId) {
  return presence.get(userId) || null;
}

export function getSocketId(userId) {
  return presence.get(userId)?.socketId || null;
}

export function isOnline(userId) {
  const p = presence.get(userId);
  return p?.status === 'online';
}

export function isInMatch(userId) {
  const p = presence.get(userId);
  return p?.status === 'in-match';
}

export function getAllPresence() {
  const result = {};
  for (const [userId, data] of presence.entries()) {
    result[userId] = data.status;
  }
  return result;
}
