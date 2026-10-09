import { io } from 'socket.io-client';

let socket = null;

export function getSocket() {
  return socket;
}

export function connectSocket(token) {
  if (socket) {
    socket.disconnect();
  }

  const host = (typeof window !== 'undefined' && window.location?.hostname) || 'localhost';
  socket = io(`http://${host}:4001`, {
    auth: { token },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5,
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
