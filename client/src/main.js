import './styles/theme.css';
import './styles/animations.css';
import { api } from './api.js';
import { connectSocket, disconnectSocket, getSocket } from './socket.js';
import { setUser, setToken, getToken, getUser } from './state.js';
import { navigate, addRoute } from './router.js';
import { renderAuth } from './screens/auth.js';
import { renderHome } from './screens/home.js';
import { renderLobby } from './screens/lobby.js';
import { renderGame } from './screens/game.js';
import { renderResult } from './screens/result.js';
import { showToast } from './ui/toast.js';

let activeScreenCleanup = null;

function setCleanup(cleanupFn) {
  if (activeScreenCleanup) {
    try { activeScreenCleanup(); } catch (e) { console.error('Screen cleanup error:', e); }
    activeScreenCleanup = null;
  }
  activeScreenCleanup = cleanupFn;
}

// Register routes
addRoute('auth', (container) => {
  setCleanup(null);
  renderAuth(container, (user, token) => {
    setUser(user);
    setToken(token);
    const socket = connectSocket(token);
    setupGlobalSocketEvents(socket);
    navigate('home');
  });
});

addRoute('home', (container) => {
  const res = renderHome(container, {
    onLogout: () => {
      setCleanup(null);
      disconnectSocket();
      navigate('auth');
    },
    onInviteAccepted: ({ roomId, opponent }) => {
      navigate('lobby', { roomId, opponent });
    },
    onStartPractice: (difficulty) => {
      navigate('game', { isPractice: true, difficulty, side: 'left' });
    },
  });
  setCleanup(res?.cleanup);
});

addRoute('lobby', (container, { roomId, opponent }) => {
  const res = renderLobby(container, {
    roomId,
    opponent,
    onMatchStart: (matchData, rid) => {
      const { state, players } = matchData;
      const user = getUser();
      const me = players.find(p => p.id === user?.id);
      const currentSide = me ? me.side : 'left';
      navigate('game', { roomId: rid, side: currentSide, initialState: state, players });
    },
    onCancel: () => navigate('home'),
  });
  setCleanup(res?.cleanup);
});

addRoute('game', (container, { roomId, side, initialState, players, isPractice, difficulty }) => {
  const res = renderGame(container, {
    roomId,
    side: side || 'left',
    initialState,
    players: players || [],
    isPractice: !!isPractice,
    difficulty: difficulty || 'medium',
    onExit: () => navigate('home'),
    onMatchEnd: (matchResult) => {
      navigate('result', { result: matchResult, roomId, mySide: side || 'left' });
    },
  });
  setCleanup(res?.cleanup);
});

addRoute('result', (container, { result, roomId, mySide }) => {
  const res = renderResult(container, {
    result,
    roomId,
    mySide: mySide || 'left',
    onHome: () => navigate('home'),
    onPlayAgainPractice: (diff) => {
      navigate('game', { isPractice: true, difficulty: diff, side: 'left' });
    },
    onRematch: ({ roomId: newRoomId, opponent }) => {
      navigate('lobby', { roomId: newRoomId, opponent });
    },
  });
  setCleanup(res?.cleanup);
});

function setupGlobalSocketEvents(socket) {
  socket.on('connect_error', (err) => {
    showToast({ message: `Connection error: ${err.message}`, type: 'error' });
  });

  socket.on('disconnect', (reason) => {
    if (reason === 'io server disconnect') {
      showToast({ message: 'Disconnected from server', type: 'error' });
    }
  });

  socket.on('match:rejoin', ({ state, side, players }) => {
    navigate('game', { side, initialState: state, players });
  });
}

// App bootstrap
async function init() {
  const token = getToken();

  if (token) {
    try {
      const data = await api.auth.me();
      setUser(data.user);
      setToken(token);
      const socket = connectSocket(token);
      setupGlobalSocketEvents(socket);
      navigate('home');
    } catch {
      setToken(null);
      navigate('auth');
    }
  } else {
    navigate('auth');
  }
}

init();
