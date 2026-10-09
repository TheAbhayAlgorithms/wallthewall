import { createInitialState, step } from '../game/engine.js';
import { setInMatch, setOnline, getSocketId } from './presence.js';
import { TICK_RATE, SNAPSHOT_RATE, RECONNECT_TIMEOUT_MS } from '../game/constants.js';

// Active matches: roomId -> matchState
const activeMatches = new Map();

export function setupMatch(io, socket, userId, db) {
  // Join a lobby room
  socket.on('lobby:join', ({ roomId }) => {
    if (!roomId) return;

    socket.join(roomId);

    if (!activeMatches.has(roomId)) {
      activeMatches.set(roomId, {
        roomId,
        players: {},
        ready: {},
        state: null,
        loop: null,
        snapshotLoop: null,
        lastTick: null,
        inputs: { left: 0, right: 0 },
        paused: false,
        reconnectTimers: {},
      });
    }

    const match = activeMatches.get(roomId);
    const playerInfo = db.prepare('SELECT id, username, wins, losses FROM users WHERE id = ?').get(userId);
    if (!playerInfo) return;

    // Determine which side the player is
    const sides = Object.keys(match.players);
    if (sides.length === 0) {
      match.players[userId] = { ...playerInfo, side: 'left' };
    } else if (sides.length === 1 && !match.players[userId]) {
      match.players[userId] = { ...playerInfo, side: 'right' };
    } else if (match.players[userId]) {
      // Reconnecting
      match.players[userId].socketId = socket.id;
      if (match.reconnectTimers[userId]) {
        clearTimeout(match.reconnectTimers[userId]);
        delete match.reconnectTimers[userId];
      }
      if (match.state) {
        socket.emit('match:rejoin', {
          state: match.state,
          side: match.players[userId].side,
          players: getPlayersInfo(match),
        });
        io.to(roomId).emit('match:resumed', { message: 'Player reconnected' });
        match.paused = false;
      }
      return;
    }

    match.players[userId].socketId = socket.id;
    setInMatch(userId);

    // Notify room of player join
    io.to(roomId).emit('lobby:playerJoined', {
      players: getPlayersInfo(match),
    });

    socket.emit('lobby:yourSide', { side: match.players[userId].side });

    // If both players present, emit ready prompt
    if (Object.keys(match.players).length === 2) {
      io.to(roomId).emit('lobby:bothJoined', { players: getPlayersInfo(match) });
    }
  });

  // Player signals ready
  socket.on('lobby:ready', ({ roomId }) => {
    const match = activeMatches.get(roomId);
    if (!match || !match.players[userId]) return;

    match.ready[userId] = true;
    io.to(roomId).emit('lobby:readyState', {
      ready: Object.keys(match.ready),
      players: getPlayersInfo(match),
    });

    const playerIds = Object.keys(match.players);
    if (playerIds.length === 2 && playerIds.every(id => match.ready[id])) {
      startCountdown(io, match, roomId, db);
    }
  });

  // Player leaves lobby before match starts
  socket.on('lobby:leave', ({ roomId }) => {
    const match = activeMatches.get(roomId);
    if (!match || match.state) return;
    socket.leave(roomId);
    delete match.players[userId];
    delete match.ready[userId];
    setOnline(userId, socket.id);
    io.to(roomId).emit('lobby:playerLeft', { userId });
    if (Object.keys(match.players).length === 0) {
      activeMatches.delete(roomId);
    }
  });

  // Rematch request
  socket.on('rematch:request', ({ roomId }) => {
    const match = activeMatches.get(roomId);
    if (!match) return;
    if (!match.rematch) match.rematch = {};
    match.rematch[userId] = true;

    const playerIds = Object.keys(match.players).map(Number);
    const oppId = playerIds.find(id => id !== userId);
    const oppSocket = oppId ? getSocketId(oppId) : null;

    if (oppId && match.rematch[oppId]) {
      const newRoomId = `match_${userId}_${oppId}_${Date.now()}`;
      const userPlayer = match.players[userId];
      const oppPlayer = match.players[oppId];
      socket.emit('rematch:accepted', { newRoomId, opponent: oppPlayer });
      if (oppSocket) {
        io.to(oppSocket).emit('rematch:accepted', { newRoomId, opponent: userPlayer });
      }
      activeMatches.delete(roomId);
    } else if (oppSocket) {
      io.to(oppSocket).emit('rematch:request');
    }
  });

  // Rematch decline
  socket.on('rematch:decline', ({ roomId }) => {
    const match = activeMatches.get(roomId);
    if (!match) return;
    const playerIds = Object.keys(match.players).map(Number);
    const oppId = playerIds.find(id => id !== userId);
    const oppSocket = oppId ? getSocketId(oppId) : null;
    if (oppSocket) {
      io.to(oppSocket).emit('rematch:declined');
    }
    activeMatches.delete(roomId);
  });

  // Receive input from client
  socket.on('match:input', ({ roomId, dir, seq }) => {
    const match = activeMatches.get(roomId);
    if (!match || !match.players[userId] || !match.state) return;

    const side = match.players[userId].side;
    match.inputs[side] = dir;
  });

  // Intentional forfeit / surrender
  socket.on('match:forfeit', ({ roomId }) => {
    const match = activeMatches.get(roomId);
    if (!match || !match.players[userId] || !match.state || match.state.winner) return;
    handleForfeit(io, match, roomId, userId, db);
  });

  // Handle disconnect mid-match or in lobby
  socket.on('disconnect', () => {
    // Find any match this socket was in
    for (const [roomId, match] of activeMatches.entries()) {
      if (match.players[userId]) {
        if (!match.state || match.state.winner) {
          if (!match.state) {
            delete match.players[userId];
            delete match.ready[userId];
            io.to(roomId).emit('lobby:playerLeft', { userId });
            if (Object.keys(match.players).length === 0) {
              activeMatches.delete(roomId);
            }
          }
          continue;
        }

        // Pause match and start reconnect timer
        match.paused = true;
        io.to(roomId).emit('match:paused', { message: 'Opponent disconnected. Waiting 10s...' });

        match.reconnectTimers[userId] = setTimeout(() => {
          // Forfeit
          handleForfeit(io, match, roomId, userId, db);
        }, RECONNECT_TIMEOUT_MS);
      }
    }
  });
}

function getPlayersInfo(match) {
  return Object.values(match.players).map(p => ({
    id: p.id,
    username: p.username,
    side: p.side,
    wins: p.wins,
    losses: p.losses,
  }));
}

function startCountdown(io, match, roomId, db) {
  const counts = [3, 2, 1, 'GO!'];
  let i = 0;

  io.to(roomId).emit('match:countdown', { count: counts[i] });
  i++;

  const timer = setInterval(() => {
    if (i < counts.length) {
      io.to(roomId).emit('match:countdown', { count: counts[i] });
      i++;
    } else {
      clearInterval(timer);
      startMatch(io, match, roomId, db);
    }
  }, 1000);
}

function startMatch(io, match, roomId, db) {
  // Initialize game state
  match.state = createInitialState(1); // serve to player 1 (right side)
  match.lastTick = Date.now();

  // Create DB record
  const playerIds = Object.keys(match.players).map(Number);
  const p1 = Object.values(match.players).find(p => p.side === 'left');
  const p2 = Object.values(match.players).find(p => p.side === 'right');

  try {
    const result = db.prepare('INSERT INTO matches (player1_id, player2_id) VALUES (?, ?)').run(p1.id, p2.id);
    match.dbId = result.lastInsertRowid;
  } catch (e) {
    console.error('Failed to create match record:', e);
  }

  // Emit match start
  io.to(roomId).emit('match:start', {
    state: match.state,
    players: getPlayersInfo(match),
  });

  // Game loop at 60 Hz
  match.loop = setInterval(() => {
    if (!match.paused && match.state && !match.state.winner) {
      const now = Date.now();
      const dt = (now - match.lastTick) / 1000;
      match.lastTick = now;

      const { newState, events } = step(match.state, match.inputs, Math.min(dt, 0.05));
      match.state = newState;

      // Handle events
      for (const event of events) {
        if (event.startsWith('point:')) {
          const side = event.split(':')[1];
          io.to(roomId).emit('match:point', { scorer: side, score: newState.score });
        }
        if (event.startsWith('win:')) {
          const side = event.split(':')[1];
          handleMatchEnd(io, match, roomId, side, db, false);
        }
        if (event === 'hit') {
          io.to(roomId).emit('match:hit', { ball: newState.ball });
        }
      }
    }
  }, 1000 / TICK_RATE);

  // Snapshot emission at 30 Hz
  match.snapshotLoop = setInterval(() => {
    if (match.state && !match.state.winner) {
      io.to(roomId).emit('match:state', {
        ball: match.state.ball,
        paddles: match.state.paddles,
        score: match.state.score,
        tick: match.state.tick,
        paused: match.state.paused,
      });
    }
  }, 1000 / SNAPSHOT_RATE);
}

function handleMatchEnd(io, match, roomId, winnerSide, db, forfeit) {
  if (match.ended) return;
  match.ended = true;

  clearInterval(match.loop);
  clearInterval(match.snapshotLoop);
  match.loop = null;
  match.snapshotLoop = null;

  const winner = Object.values(match.players).find(p => p.side === winnerSide);
  const loser = Object.values(match.players).find(p => p.side !== winnerSide);

  if (winner && loser && match.dbId) {
    const p1 = Object.values(match.players).find(p => p.side === 'left');
    const p2 = Object.values(match.players).find(p => p.side === 'right');
    const score1 = match.state.score.left;
    const score2 = match.state.score.right;

    try {
      db.prepare(`
        UPDATE matches SET score1=?, score2=?, winner_id=?, ended_at=datetime('now'), forfeit=? WHERE id=?
      `).run(score1, score2, winner.id, forfeit ? 1 : 0, match.dbId);

      db.prepare('UPDATE users SET wins = wins + 1 WHERE id = ?').run(winner.id);
      db.prepare('UPDATE users SET losses = losses + 1 WHERE id = ?').run(loser.id);
    } catch (e) {
      console.error('Failed to update match record:', e);
    }
  }

  // Restore presence to online
  for (const pid of Object.keys(match.players)) {
    const uid = parseInt(pid);
    const pSocketId = getSocketId(uid);
    if (pSocketId) setOnline(uid, pSocketId);
  }

  io.to(roomId).emit('match:end', {
    winner: winnerSide,
    winnerId: winner?.id,
    winnerUsername: winner?.username,
    loserId: loser?.id,
    loserUsername: loser?.username,
    score: match.state?.score || { left: 0, right: 0 },
    forfeit,
  });

  // Clean up after a delay
  setTimeout(() => {
    activeMatches.delete(roomId);
  }, 30000);
}

function handleForfeit(io, match, roomId, disconnectedUserId, db) {
  const disconnectedPlayer = match.players[disconnectedUserId];
  if (!disconnectedPlayer) return;

  const forfeitSide = disconnectedPlayer.side;
  const winningSide = forfeitSide === 'left' ? 'right' : 'left';

  // Update state winner
  if (match.state) {
    match.state.winner = winningSide;
  }

  handleMatchEnd(io, match, roomId, winningSide, db, true);
}

export { activeMatches };
