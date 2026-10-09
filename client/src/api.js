const host = (typeof window !== 'undefined' && window.location?.hostname) || 'localhost';
const BASE_URL = `http://${host}:4001/api`;

function getToken() {
  return localStorage.getItem('wall_token') || localStorage.getItem('ember_token');
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

// Auth
export const api = {
  auth: {
    register: (username, password) => request('/auth/register', { method: 'POST', body: { username, password } }),
    login: (username, password) => request('/auth/login', { method: 'POST', body: { username, password } }),
    me: () => request('/auth/me'),
  },
  friends: {
    list: () => request('/friends'),
    requests: () => request('/friends/requests'),
    search: (q) => request(`/friends/search?q=${encodeURIComponent(q)}`),
    sendRequest: (username) => request('/friends/request', { method: 'POST', body: { username } }),
    accept: (id) => request('/friends/accept', { method: 'POST', body: { id } }),
    decline: (id) => request('/friends/decline', { method: 'POST', body: { id } }),
    remove: (id) => request(`/friends/${id}`, { method: 'DELETE' }),
  },
  matches: {
    history: () => request('/matches/history'),
    leaderboard: () => request('/matches/leaderboard'),
  },
  users: {
    profile: (username) => request(`/users/${username}`),
  },
};
