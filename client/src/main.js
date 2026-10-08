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

let currentSide = null;
let currentRoomId = null;
let currentPlayers = null;
let currentGameCleanup = null;

// Register routes
addRoute('auth', (container) => {
  renderAuth(container, (user, token) => {
    setUser(user);
    setToken(token);
    const socket = connectSocket(token);
    setupGlobalSocketEvents(socket);
    navigate('home');
  });
});

addRoute('home', (container) => {
  renderHome(container, {
    onLogout: () => {
      disconnectSocket();
      navigate('auth');
    },
    onInviteAccepted: ({ roomId, opponent }) => {
      currentRoomId = roomId;
      navigate('lobby', { roomId, opponent });
    },
  });
});

addRoute('lobby', (container, { roomId, opponent }) => {
  renderLobby(container, {
    roomId,
    opponent,
    onMatchStart: (matchData, rid) => {
      const { state, players } = matchData;
      // Determine my side
      const user = getUser();
      const me = players.find(p => p.id === user.id);
      currentSide = me ? me.side : 'left';
      currentRoomId = rid;
      currentPlayers = players;
      navigate('game', { roomId: rid, side: currentSide, initialState: state, players });
    },
    onCancel: () => navigate('home'),
  });
});

addRoute('game', (container, { roomId, side, initialState, players }) => {
  if (currentGameCleanup) { currentGameCleanup(); currentGameCleanup = null; }
  const result = renderGame(container, {
    roomId,
    side,
    initialState,
    players,
    onMatchEnd: (matchResult) => {
      if (currentGameCleanup) { currentGameCleanup(); currentGameCleanup = null; }
      navigate('result', { result: matchResult, roomId, mySide: side });
    },
  });
  currentGameCleanup = result ? result.cleanup : null;
});

addRoute('result', (container, { result, roomId, mySide }) => {
  renderResult(container, {
    result,
    roomId,
    mySide,
    onHome: () => navigate('home'),
    onRematch: ({ roomId: newRoomId, opponent }) => {
      navigate('lobby', { roomId: newRoomId, opponent });
    },
  });
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
