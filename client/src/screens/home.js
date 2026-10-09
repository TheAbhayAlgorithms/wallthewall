import { api } from '../api.js';
import { getUser, setToken, setUser, getPresence } from '../state.js';
import { getSocket } from '../socket.js';
import { createAvatar, createStatusDot, createButton } from '../ui/components.js';
import { showToast } from '../ui/toast.js';
import { showInviteModal, showModal } from '../ui/modal.js';

let activeInviteModal = null;
let searchDebounceTimer = null;

export function renderHome(container, { onLogout, onInviteAccepted, onStartPractice }) {
  container.innerHTML = '';

  let user = getUser() || { id: 0, username: 'Player', wins: 0, losses: 0 };
  const socket = getSocket();

  const screen = document.createElement('div');
  screen.className = 'screen home-screen';

  screen.innerHTML = `
    <header class="home-header">
      <div class="header-logo">🧱 WALL THE WALL</div>
      <div class="header-user" id="header-user"></div>
    </header>
    <main class="home-main">
      <aside class="home-sidebar">
        <div class="profile-card card" id="profile-card"></div>
        <div class="card practice-card">
          <div class="practice-card-content">
            <span class="practice-icon">🤖</span>
            <div>
              <h3 class="card-title" style="margin-bottom:2px;color:var(--text)">Solo Practice</h3>
              <p class="muted" style="font-size:0.8rem">Sharpen your reflexes vs WallBot</p>
            </div>
          </div>
          <button id="btn-practice-launch" class="btn btn-primary btn-full" style="margin-top:12px">
            Play vs WallBot 🤖
          </button>
        </div>
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
        <div class="card requests-card" id="requests-section" style="display:none"></div>
        <div class="card community-card">
          <div class="community-tabs tab-bar">
            <button id="tab-friends" class="tab-btn tab-active">Friends</button>
            <button id="tab-leaderboard" class="tab-btn">🏆 Leaderboard</button>
          </div>
          <div id="tab-content-friends">
            <div id="friends-list"><p class="muted">Loading...</p></div>
          </div>
          <div id="tab-content-leaderboard" style="display:none">
            <div id="leaderboard-list"><p class="muted">Loading leaderboard...</p></div>
          </div>
        </div>
      </section>
    </main>
  `;

  container.appendChild(screen);

  // Render header and initial profile
  renderHeaderUser(user);
  renderProfileCard(user);

  // Refresh user profile stats from server
  api.auth.me().then(res => {
    if (res && res.user) {
      user = res.user;
      setUser(user);
      renderProfileCard(user);
    }
  }).catch(() => {});

  loadMatchHistory();
  loadFriendRequests();
  loadFriendsList();

  // Tab switching (Friends vs Leaderboard)
  const tabFriends = screen.querySelector('#tab-friends');
  const tabLeaderboard = screen.querySelector('#tab-leaderboard');
  const contentFriends = screen.querySelector('#tab-content-friends');
  const contentLeaderboard = screen.querySelector('#tab-content-leaderboard');

  tabFriends.addEventListener('click', () => {
    tabFriends.classList.add('tab-active');
    tabLeaderboard.classList.remove('tab-active');
    contentFriends.style.display = '';
    contentLeaderboard.style.display = 'none';
    loadFriendsList();
  });

  tabLeaderboard.addEventListener('click', () => {
    tabLeaderboard.classList.add('tab-active');
    tabFriends.classList.remove('tab-active');
    contentLeaderboard.style.display = '';
    contentFriends.style.display = 'none';
    loadLeaderboard();
  });

  // Practice button click
  const practiceBtn = screen.querySelector('#btn-practice-launch');
  practiceBtn.addEventListener('click', () => {
    openPracticeDifficultyModal();
  });

  // Search input
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

  // Setup socket events
  if (socket) {
    socket.on('presence:update', ({ userId, status }) => {
      const dots = screen.querySelectorAll(`[data-user-id="${userId}"] .status-dot`);
      dots.forEach(dot => { dot.className = `status-dot status-${status}`; });
      const statuses = screen.querySelectorAll(`[data-user-id="${userId}"] .friend-status-text`);
      statuses.forEach(el => { el.textContent = status; });
    });

    socket.on('friend:requestReceived', ({ fromUsername }) => {
      showToast({
        message: `${fromUsername} sent you a friend request!`,
        type: 'friend',
        onClick: () => loadFriendRequests(),
      });
      loadFriendRequests();
    });

    socket.on('friend:acceptedNotif', ({ byUsername }) => {
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
      cleanup();
      onInviteAccepted({ roomId, opponent });
    });

    socket.emit('presence:getAll');
    socket.on('presence:snapshot', (presenceData) => {
      Object.entries(presenceData).forEach(([uid, status]) => {
        const dots = screen.querySelectorAll(`[data-user-id="${uid}"] .status-dot`);
        dots.forEach(dot => dot.className = `status-dot status-${status}`);
        const statuses = screen.querySelectorAll(`[data-user-id="${uid}"] .friend-status-text`);
        statuses.forEach(el => { el.textContent = status; });
      });
    });
  }

  function renderHeaderUser(u) {
    const el = screen.querySelector('#header-user');
    el.innerHTML = '';
    const avatar = createAvatar(u.username, 36);

    const userPill = document.createElement('div');
    userPill.className = 'header-user-pill';
    userPill.innerHTML = `
      <span class="header-username">${u.username}</span>
      <span class="user-id-badge" title="Your permanent Login ID">ID #${u.id}</span>
    `;

    const logoutBtn = createButton('Logout', 'ghost', () => {
      setToken(null);
      setUser(null);
      if (socket) socket.disconnect();
      cleanup();
      onLogout();
    });
    logoutBtn.id = 'btn-logout';
    el.appendChild(avatar);
    el.appendChild(userPill);
    el.appendChild(logoutBtn);
  }

  function renderProfileCard(u) {
    const card = screen.querySelector('#profile-card');
    const total = (u.wins || 0) + (u.losses || 0);
    const winRate = total > 0 ? Math.round((u.wins / total) * 100) : 0;
    const avatar = createAvatar(u.username, 64);

    card.innerHTML = `
      <div class="profile-header">
        <p class="profile-username">${u.username}</p>
        <button id="copy-id-btn" class="profile-id-chip" title="Click to copy your login ID">
          <span>Login ID: <strong>#${u.id}</strong></span>
          <span class="copy-icon">📋</span>
        </button>
      </div>
      <div class="profile-stats">
        <div class="stat"><span class="stat-value">${u.wins || 0}</span><span class="stat-label">Wins</span></div>
        <div class="stat"><span class="stat-value">${u.losses || 0}</span><span class="stat-label">Losses</span></div>
        <div class="stat"><span class="stat-value">${winRate}%</span><span class="stat-label">Win Rate</span></div>
      </div>
    `;
    const header = card.querySelector('.profile-header');
    avatar.style.marginBottom = '8px';
    header.insertBefore(avatar, header.firstChild);

    // Copy ID on click
    const copyBtn = card.querySelector('#copy-id-btn');
    copyBtn.addEventListener('click', () => {
      navigator.clipboard?.writeText(String(u.id));
      showToast({ message: `Copied User ID #${u.id} to clipboard!`, type: 'info' });
      copyBtn.querySelector('.copy-icon').textContent = '✓';
      setTimeout(() => { copyBtn.querySelector('.copy-icon').textContent = '📋'; }, 2000);
    });
  }

  async function loadMatchHistory() {
    const el = screen.querySelector('#match-history-list');
    try {
      const { matches } = await api.matches.history();
      if (!matches || !matches.length) { el.innerHTML = '<p class="muted">No matches yet</p>'; return; }
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
      if (!requests || !requests.length) { section.style.display = 'none'; return; }
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
        acceptBtn.className = 'btn btn-primary btn-sm';
        const declineBtn = createButton('Decline', 'ghost', async () => {
          try {
            await api.friends.decline(req.id);
            loadFriendRequests();
          } catch { showToast({ message: 'Failed to decline', type: 'error' }); }
        });
        declineBtn.className = 'btn btn-ghost btn-sm';
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
      if (!friends || !friends.length) {
        el.innerHTML = '<p class="muted" style="padding:12px 0">No friends yet. Search above to find players and challenge them!</p>';
        return;
      }
      el.innerHTML = '';
      friends.forEach(f => renderFriendRow(f, el));
    } catch {
      el.innerHTML = '<p class="muted">Could not load friends</p>';
    }
  }

  function renderFriendRow(friend, listEl) {
    const row = document.createElement('div');
    row.className = 'friend-row';
    row.setAttribute('data-user-id', friend.id);

    const avatar = createAvatar(friend.username, 38);
    avatar.style.cursor = 'pointer';
    avatar.addEventListener('click', () => openUserProfileModal(friend.username));

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
      <span class="friend-name" style="cursor:pointer">${friend.username}</span>
      <span class="friend-status-text muted">offline</span>
    `;
    info.querySelector('.friend-name').addEventListener('click', () => openUserProfileModal(friend.username));

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
    listEl.appendChild(row);
  }

  async function loadLeaderboard() {
    const el = screen.querySelector('#leaderboard-list');
    try {
      const { leaderboard } = await api.matches.leaderboard();
      if (!leaderboard || !leaderboard.length) {
        el.innerHTML = '<p class="muted">No players yet</p>';
        return;
      }
      el.innerHTML = '';
      leaderboard.forEach((player, idx) => {
        const row = document.createElement('div');
        row.className = 'leaderboard-row';
        const rank = idx + 1;
        const rankMedal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
        const total = (player.wins || 0) + (player.losses || 0);
        const winPct = total > 0 ? Math.round((player.wins / total) * 100) : 0;
        const isMe = player.id === user.id;

        const avatar = createAvatar(player.username, 34);

        row.innerHTML = `
          <span class="leaderboard-rank ${rank <= 3 ? 'rank-podium' : ''}">${rankMedal}</span>
          <div class="leaderboard-avatar-wrap"></div>
          <span class="leaderboard-name ${isMe ? 'leaderboard-me' : ''}">${player.username} ${isMe ? '(You)' : ''}</span>
          <span class="leaderboard-stats"><strong>${player.wins}W</strong> / ${player.losses}L (${winPct}%)</span>
        `;
        row.querySelector('.leaderboard-avatar-wrap').appendChild(avatar);
        row.style.cursor = 'pointer';
        row.addEventListener('click', () => openUserProfileModal(player.username));
        el.appendChild(row);
      });
    } catch {
      el.innerHTML = '<p class="muted">Failed to load leaderboard</p>';
    }
  }

  async function doSearch(q) {
    const el = screen.querySelector('#search-results');
    el.innerHTML = '<p class="muted searching">Searching...</p>';
    try {
      const { users } = await api.friends.search(q);
      if (!users || !users.length) { el.innerHTML = '<p class="muted">No players found</p>'; return; }
      el.innerHTML = '';
      users.forEach(u => {
        const row = document.createElement('div');
        row.className = 'search-result-row';
        const avatar = createAvatar(u.username, 36);
        const name = document.createElement('span');
        name.className = 'search-name';
        name.textContent = u.username;

        let actionBtn;
        if (u.relation === 'friends') {
          actionBtn = document.createElement('span');
          actionBtn.className = 'badge-tag tag-friends';
          actionBtn.textContent = 'Friends ✓';
        } else if (u.relation === 'pending_sent') {
          actionBtn = document.createElement('span');
          actionBtn.className = 'badge-tag tag-pending';
          actionBtn.textContent = 'Request Sent';
        } else if (u.relation === 'pending_received') {
          actionBtn = createButton('Accept', 'primary', async () => {
            try {
              if (u.friendshipId) await api.friends.accept(u.friendshipId);
              showToast({ message: `Added ${u.username}!`, type: 'success' });
              doSearch(q);
              loadFriendsList();
            } catch { showToast({ message: 'Error', type: 'error' }); }
          });
          actionBtn.className = 'btn btn-primary btn-sm';
        } else {
          actionBtn = createButton('+ Add Friend', 'primary', async () => {
            try {
              await api.friends.sendRequest(u.username);
              socket?.emit('friend:requestSent', { targetId: u.id });
              showToast({ message: `Friend request sent to ${u.username}!`, type: 'success' });
              actionBtn.textContent = 'Sent!';
              actionBtn.disabled = true;
            } catch (err) {
              showToast({ message: err.error || 'Failed to send request', type: 'error' });
            }
          });
          actionBtn.className = 'btn btn-primary btn-sm';
        }

        row.appendChild(avatar);
        row.appendChild(name);
        row.appendChild(actionBtn);
        el.appendChild(row);
      });
    } catch {
      el.innerHTML = '<p class="muted">Search failed</p>';
    }
  }

  function openPracticeDifficultyModal() {
    const modalContent = document.createElement('div');
    modalContent.className = 'practice-modal-body';
    modalContent.innerHTML = `
      <p class="muted" style="margin-bottom:16px">Choose AI Bot challenge level:</p>
      <div class="difficulty-options">
        <button class="diff-btn" data-diff="easy">
          <span class="diff-title">🟢 Casual</span>
          <span class="diff-desc">Gentle rally pace, forgiving margin</span>
        </button>
        <button class="diff-btn diff-selected" data-diff="medium">
          <span class="diff-title">🟡 Challenger</span>
          <span class="diff-desc">Balanced speed and responsive defense</span>
        </button>
        <button class="diff-btn" data-diff="hard">
          <span class="diff-title">🔴 Ember Beast</span>
          <span class="diff-desc">Relentless precision, maximum velocity</span>
        </button>
      </div>
    `;

    let selectedDifficulty = 'medium';
    modalContent.querySelectorAll('.diff-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        modalContent.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('diff-selected'));
        btn.classList.add('diff-selected');
        selectedDifficulty = btn.getAttribute('data-diff');
      });
    });

    showModal({
      title: '🤖 Select Difficulty',
      content: modalContent,
      buttons: [
        {
          text: 'Start Match 🔥',
          variant: 'primary',
          onClick: () => {
            cleanup();
            if (onStartPractice) onStartPractice(selectedDifficulty);
          },
        },
        { text: 'Cancel', variant: 'secondary' },
      ],
    });
  }

  async function openUserProfileModal(username) {
    try {
      const data = await api.users.profile(username);
      const targetUser = data.user;
      const total = (targetUser.wins || 0) + (targetUser.losses || 0);
      const winRate = total > 0 ? Math.round((targetUser.wins / total) * 100) : 0;
      const modalBody = document.createElement('div');
      modalBody.className = 'user-profile-modal';
      modalBody.innerHTML = `
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px">
          ${createAvatar(targetUser.username, 54).outerHTML}
          <div>
            <h3 style="margin-bottom:2px">${targetUser.username}</h3>
            <p class="muted" style="font-size:0.8rem">Member since: ${targetUser.created_at ? targetUser.created_at.split(' ')[0] : 'Recently'}</p>
          </div>
        </div>
        <div class="profile-stats" style="margin-top:16px">
          <div class="stat"><span class="stat-value">${targetUser.wins}</span><span class="stat-label">Wins</span></div>
          <div class="stat"><span class="stat-value">${targetUser.losses}</span><span class="stat-label">Losses</span></div>
          <div class="stat"><span class="stat-value">${winRate}%</span><span class="stat-label">Win Rate</span></div>
        </div>
      `;
      showModal({
        title: 'Player Card',
        content: modalBody,
        buttons: [{ text: 'Close', variant: 'secondary' }],
      });
    } catch {
      showToast({ message: 'Could not load player profile', type: 'error' });
    }
  }

  function cleanup() {
    clearTimeout(searchDebounceTimer);
    if (activeInviteModal) { activeInviteModal.close(); activeInviteModal = null; }
    if (socket) {
      socket.off('presence:update');
      socket.off('friend:requestReceived');
      socket.off('friend:acceptedNotif');
      socket.off('invite:received');
      socket.off('invite:cancelled');
      socket.off('invite:expired');
      socket.off('invite:declined');
      socket.off('invite:sent');
      socket.off('invite:error');
      socket.off('lobby:created');
      socket.off('presence:snapshot');
    }
  }

  return { cleanup };
}
