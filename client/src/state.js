// App-wide state (reactive via callbacks)
const state = {
  user: null,
  token: null,
  friendsPresence: {},
  currentScreen: null,
  matchData: null,
};

const listeners = {};

export function getState() {
  return state;
}

export function setState(key, value) {
  state[key] = value;
  if (listeners[key]) {
    listeners[key].forEach(fn => fn(value));
  }
}

export function subscribe(key, fn) {
  if (!listeners[key]) listeners[key] = [];
  listeners[key].push(fn);
  return () => {
    listeners[key] = listeners[key].filter(l => l !== fn);
  };
}

export function setUser(user) { setState('user', user); }
export function getUser() { return state.user; }

export function setToken(token) {
  state.token = token;
  if (token) localStorage.setItem('ember_token', token);
  else localStorage.removeItem('ember_token');
}
export function getToken() { return state.token || localStorage.getItem('ember_token'); }

export function updatePresence(userId, status) {
  state.friendsPresence[userId] = status;
  if (listeners['presence']) {
    listeners['presence'].forEach(fn => fn({ userId, status }));
  }
}

export function getPresence(userId) {
  return state.friendsPresence[userId] || 'offline';
}

export function setMatchData(data) { setState('matchData', data); }
export function getMatchData() { return state.matchData; }
