import { api } from '../api.js';
import { getUser, setToken, setUser, getPresence, subscribe } from '../state.js';
import { getSocket } from '../socket.js';
import { createAvatar, createStatusDot, createButton } from '../ui/components.js';
import { showToast } from '../ui/toast.js';
import { showInviteModal, closeModal } from '../ui/modal.js';

let activeInviteModal = null;
let searchDebounceTimer = null;

export function renderHome(container, { onLogout, onInviteAccepted }) {
  container.innerHTML = '';

  const user = getUser();
  const socket = getSocket();

  const screen = document.createElement('div');
  screen.className = 'screen home-screen';

  screen.innerHTML = `
    <header class="home-header">
      <div class="header-logo">🔥 EMBER PONG</div>
      <div class="header-user" id="header-user"></div>
    </header>
    <main class="home-main">
      <aside class="home-sidebar">
        <div class="profile-card card" id="profile-card"></div>
        <div class="card match-history-card">
          <h3 class="card-title">Match History</h3>
          <div id="match-history-list"><p class="muted">Loading...</p></div>
        </div>
      </aside>
      <section class="home-content">
        <div class="card find-friends-card">
          <h3 class="card-title">Find Players</h3>
          <div class="search-row">
            <input id="friend-search-input" class="input" type="text" placeholder="Search by username..." maxlength="30" autocomplete="off" />
          </div>
          <div id="search-results"></div>
        </div>
        <div class="card requests-card" id="requests-section"></div>
        <div class="card friends-list-card">
          <h3 class="card-title">Friends</h3>
          <div id="friends-list"><p class="muted">Loading...</p></div>
        </div>
      </section>
    </main>
  `;

  container.appendChild(screen);

  // Render header user
  renderHeaderUser(user);
  renderProfileCard(user);
  loadMatchHistory();
  loadFriendRequests();
  loadFriendsList();

  // Search
  const searchInput = screen.querySelector('#friend-search-input');
  searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    const q = searchInput.value.trim();
    if (q.length === 0) {
      screen.querySelector('#search-results').innerHTML = '';
      return;
    }
    searchDebounceTimer = setTimeout(() => doSearch(q), 300);
  });

  // Socket events for real-time updates
  if (socket) {
    socket.on('presence:update', ({ userId, status }) => {
      // Update presence in friends list
      const dots = screen.querySelectorAll(`[data-user-id="${userId}"] .status-dot`);
      dots.forEach(dot => {
        dot.className = `status-dot status-${status}`;
      });
      const statuses = screen.querySelectorAll(`[data-user-id="${userId}"] .friend-status-text`);
      statuses.forEach(el => { el.textContent = status; });
    });

    socket.on('friend:requestReceived', ({ fromId, fromUsername }) => {
      showToast({
        message: `${fromUsername} sent you a friend request!`,
        type: 'friend',
        onClick: () => loadFriendRequests(),
      });
      loadFriendRequests();
    });

    socket.on('friend:acceptedNotif', ({ byId, byUsername }) => {
      showToast({ message: `${byUsername} accepted your friend request! 🎉`, type: 'success' });
      loadFriendsList();
    });

    socket.on('invite:received', ({ fromId, fromUsername, expiresIn }) => {
      if (activeInviteModal) activeInviteModal.close();
      activeInviteModal = showInviteModal({
        fromUsername,
        fromId,
        expiresIn,
        onAccept: () => {
          socket.emit('invite:accept', { fromId });
          activeInviteModal = null;
        },
        onDecline: () => {
          socket.emit('invite:decline', { fromId });
          activeInviteModal = null;
        },
      });
    });

    socket.on('invite:cancelled', () => {
      if (activeInviteModal) { activeInviteModal.close(); activeInviteModal = null; }
      showToast({ message: 'Invite was cancelled', type: 'info' });
    });

    socket.on('invite:expired', () => {
      if (activeInviteModal) { activeInviteModal.close(); activeInviteModal = null; }
    });

    socket.on('invite:declined', ({ byUsername }) => {
      showToast({ message: `${byUsername} declined your invite 😢`, type: 'info' });
    });

    socket.on('invite:sent', ({ targetUsername }) => {
      showToast({ message: `Invite sent to ${targetUsername}! Waiting...`, type: 'info' });
    });

    socket.on('invite:error', ({ message }) => {
      showToast({ message, type: 'error' });
    });

    socket.on('lobby:created', ({ roomId, opponent }) => {
      onInviteAccepted({ roomId, opponent });
    });

    // Get initial presence snapshot
    socket.emit('presence:getAll');
    socket.on('presence:snapshot', (presenceData) => {
      // Update all friend rows
      Object.entries(presenceData).forEach(([uid, status]) => {
        const dots = screen.querySelectorAll(`[data-user-id="${uid}"] .status-dot`);
        dots.forEach(dot => dot.className = `status-dot status-${status}`);
      });
    });
  }

  function renderHeaderUser(user) {
    const el = screen.querySelector('#header-user');
    const avatar = createAvatar(user.username, 36);
    const nameEl = document.createElement('span');
    nameEl.className = 'header-username';
    nameEl.textContent = user.username;
    const logoutBtn = createButton('Logout', 'ghost', () => {
      setToken(null);
      setUser(null);
      if (socket) socket.disconnect();
      onLogout();
    });
    logoutBtn.id = 'btn-logout';
    el.appendChild(avatar);
    el.appendChild(nameEl);
    el.appendChild(logoutBtn);
  }

  function renderProfileCard(user) {
    const card = screen.querySelector('#profile-card');
    const winRate = user.wins + user.losses > 0
      ? Math.round((user.wins / (user.wins + user.losses)) * 100)
      : 0;
    const avatar = createAvatar(user.username, 64);
    card.innerHTML = `
      <div class="profile-stats">
        <div class="stat"><span class="stat-value">${user.wins}</span><span class="stat-label">Wins</span></div>
        <div class="stat"><span class="stat-value">${user.losses}</span><span class="stat-label">Losses</span></div>
        <div class="stat"><span class="stat-value">${winRate}%</span><span class="stat-label">Win Rate</span></div>
      </div>
    `;
    const header = document.createElement('div');
    header.className = 'profile-header';
    avatar.style.marginBottom = '8px';
    const usernameEl = document.createElement('p');
    usernameEl.className = 'profile-username';
    usernameEl.textContent = user.username;
    header.appendChild(avatar);
    header.appendChild(usernameEl);
    card.insertBefore(header, card.firstChild);
  }

  async function loadMatchHistory() {
    const el = screen.querySelector('#match-history-list');
    try {
      const { matches } = await api.matches.history();
      if (!matches.length) { el.innerHTML = '<p class="muted">No matches yet</p>'; return; }
      el.innerHTML = matches.map(m => {
        const isLeft = m.player1 === user.username;
        const myScore = isLeft ? m.score1 : m.score2;
        const oppScore = isLeft ? m.score2 : m.score1;
        const opp = isLeft ? m.player2 : m.player1;
        const won = m.winner === user.username;
        return `
          <div class="match-row ${won ? 'match-win' : 'match-loss'}">
            <span class="match-result-badge">${won ? 'W' : 'L'}</span>
            <span class="match-opp">vs ${opp}</span>
            <span class="match-score">${myScore}–${oppScore}${m.forfeit ? ' (FF)' : ''}</span>
          </div>
        `;
      }).join('');
    } catch {
      el.innerHTML = '<p class="muted">Could not load history</p>';
    }
  }

  async function loadFriendRequests() {
    const section = screen.querySelector('#requests-section');
    try {
      const { requests } = await api.friends.requests();
      if (!requests.length) { section.style.display = 'none'; return; }
      section.style.display = '';
      section.innerHTML = `<h3 class="card-title">Friend Requests (${requests.length})</h3>`;
      requests.forEach(req => {
        const row = document.createElement('div');
        row.className = 'request-row';
        const avatar = createAvatar(req.username, 36);
        const name = document.createElement('span');
        name.className = 'request-name';
        name.textContent = req.username;
        const acceptBtn = createButton('Accept', 'primary', async () => {
          try {
            await api.friends.accept(req.id);
            socket?.emit('friend:accepted', { requesterId: req.user_id });
            showToast({ message: `You're now friends with ${req.username}!`, type: 'success' });
            loadFriendRequests();
            loadFriendsList();
          } catch { showToast({ message: 'Failed to accept', type: 'error' }); }
        });
        const declineBtn = createButton('Decline', 'ghost', async () => {
          try {
            await api.friends.decline(req.id);
            loadFriendRequests();
          } catch { showToast({ message: 'Failed to decline', type: 'error' }); }
        });
        row.appendChild(avatar);
        row.appendChild(name);
        row.appendChild(acceptBtn);
        row.appendChild(declineBtn);
        section.appendChild(row);
      });
    } catch {
      section.style.display = 'none';
    }
  }

  async function loadFriendsList() {
    const el = screen.querySelector('#friends-list');
    try {
      const { friends } = await api.friends.list();
      if (!friends.length) { el.innerHTML = '<p class="muted">No friends yet. Search above to find players!</p>'; return; }
      el.innerHTML = '';
      friends.forEach(f => renderFriendRow(f, el));
    } catch {
      el.innerHTML = '<p class="muted">Could not load friends</p>';
    }
  }

  function renderFriendRow(friend, container) {
    const row = document.createElement('div');
    row.className = 'friend-row';
    row.setAttribute('data-user-id', friend.id);

    const avatar = createAvatar(friend.username, 38);
    const dot = createStatusDot('offline');
    dot.style.position = 'absolute';
    dot.style.bottom = '0';
    dot.style.right = '0';
    const avatarWrap = document.createElement('div');
    avatarWrap.style.position = 'relative';
    avatarWrap.appendChild(avatar);
    avatarWrap.appendChild(dot);

    const info = document.createElement('div');
    info.className = 'friend-info';
    info.innerHTML = `
      <span class="friend-name">${friend.username}</span>
      <span class="friend-status-text muted">offline</span>
    `;

    const actions = document.createElement('div');
    actions.className = 'friend-actions';

    const inviteBtn = createButton('⚔️ Invite', 'primary', () => {
      socket?.emit('invite:send', { targetId: friend.id });
    });
    inviteBtn.className = 'btn btn-primary btn-sm';

    const removeBtn = createButton('Remove', 'ghost', async () => {
      try {
        await api.friends.remove(friend.friendshipId);
        row.remove();
        showToast({ message: `Removed ${friend.username}`, type: 'info' });
      } catch { showToast({ message: 'Failed to remove', type: 'error' }); }
    });
    removeBtn.className = 'btn btn-ghost btn-sm';

    actions.appendChild(inviteBtn);
    actions.appendChild(removeBtn);

    row.appendChild(avatarWrap);
    row.appendChild(info);
    row.appendChild(actions);
    container.appendChild(row);
  }

  async function doSearch(q) {
    const el = screen.querySelector('#search-results');
    el.innerHTML = '<p class="muted searching">Searching...</p>';
    try {
      const { users } = await api.friends.search(q);
      if (!users.length) { el.innerHTML = '<p class="muted">No players found</p>'; return; }
      el.innerHTML = '';
      users.forEach(u => {
        const row = document.createElement('div');
        row.className = 'search-result-row';
        const avatar = createAvatar(u.username, 36);
        const name = document.createElement('span');
        name.className = 'search-name';
        name.textContent = u.username;
        const addBtn = createButton('+ Add Friend', 'primary', async () => {
          try {
            await api.friends.sendRequest(u.username);
            socket?.emit('friend:requestSent', { targetId: u.id });
            showToast({ message: `Friend request sent to ${u.username}!`, type: 'success' });
            addBtn.textContent = 'Sent!';
            addBtn.disabled = true;
          } catch (err) {
            showToast({ message: err.error || 'Failed to send request', type: 'error' });
          }
        });
        addBtn.className = 'btn btn-primary btn-sm';
        row.appendChild(avatar);
        row.appendChild(name);
        row.appendChild(addBtn);
        el.appendChild(row);
      });
    } catch {
      el.innerHTML = '<p class="muted">Search failed</p>';
    }
  }

  return screen;
}
