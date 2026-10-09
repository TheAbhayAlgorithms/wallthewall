import { getUser } from '../state.js';
import { getSocket } from '../socket.js';
import { createAvatar, createButton } from '../ui/components.js';
import { audio } from '../audio.js';

export function renderLobby(container, { roomId, opponent, onMatchStart, onCancel }) {
  container.innerHTML = '';
  const user = getUser();
  const socket = getSocket();

  const screen = document.createElement('div');
  screen.className = 'screen lobby-screen';

  screen.innerHTML = `
    <div class="lobby-inner">
      <h1 class="lobby-title">⚔️ Battle Lobby</h1>
      <p class="lobby-subtitle">First to 7 points wins the match!</p>
      <div class="lobby-players">
        <div class="lobby-player" id="player-you"></div>
        <div class="lobby-vs">VS</div>
        <div class="lobby-player" id="player-opponent"></div>
      </div>
      <div id="lobby-status" class="lobby-status muted">Waiting for both players...</div>
      <div id="lobby-countdown" class="lobby-countdown hidden"></div>
      <div id="lobby-actions" class="lobby-actions"></div>
    </div>
  `;

  container.appendChild(screen);

  // Render initial player cards
  renderPlayerCard('player-you', user, true, false);
  renderPlayerCard('player-opponent', opponent || { username: 'Waiting...' }, false, false);

  const actionsEl = screen.querySelector('#lobby-actions');
  const statusEl = screen.querySelector('#lobby-status');
  const countdownEl = screen.querySelector('#lobby-countdown');

  // Join the room
  if (socket) {
    socket.emit('lobby:join', { roomId });
  }

  // Ready button
  const readyBtn = createButton('✓ I\'m Ready!', 'primary', () => {
    if (socket) {
      socket.emit('lobby:ready', { roomId });
      readyBtn.disabled = true;
      readyBtn.textContent = 'Waiting for opponent...';
    }
  });
  readyBtn.id = 'btn-lobby-ready';
  readyBtn.className = 'btn btn-primary btn-lg';

  // Leave Lobby button
  const leaveBtn = createButton('Leave Lobby', 'ghost', () => {
    if (socket) {
      socket.emit('lobby:leave', { roomId });
    }
    cleanup();
    onCancel();
  });
  leaveBtn.id = 'btn-lobby-leave';
  leaveBtn.className = 'btn btn-ghost btn-lg';

  actionsEl.appendChild(readyBtn);
  actionsEl.appendChild(leaveBtn);

  if (socket) {
    socket.on('lobby:yourSide', ({ side }) => {
      const playerEl = screen.querySelector('#player-you');
      if (playerEl) {
        const sideTag = playerEl.querySelector('.player-side');
        if (sideTag) sideTag.textContent = side === 'left' ? '← Left Paddle' : 'Right Paddle →';
      }
    });

    socket.on('lobby:bothJoined', ({ players }) => {
      statusEl.textContent = 'Both players connected! Click Ready when you\'re set.';
      players.forEach(p => {
        const isMe = p.id === user.id;
        renderPlayerCard(isMe ? 'player-you' : 'player-opponent', p, isMe, false);
      });
    });

    socket.on('lobby:readyState', ({ ready, players }) => {
      const allReady = ready.length >= 2;
      statusEl.textContent = allReady ? '🚀 Both ready! Starting soon...' : `${ready.length}/2 players ready`;

      players.forEach(p => {
        const isMe = p.id === user.id;
        const isReady = ready.includes(String(p.id)) || ready.includes(p.id);
        renderPlayerCard(isMe ? 'player-you' : 'player-opponent', p, isMe, isReady);
      });
    });

    socket.on('match:countdown', ({ count }) => {
      statusEl.textContent = '';
      readyBtn.style.display = 'none';
      leaveBtn.style.display = 'none';
      countdownEl.classList.remove('hidden');
      countdownEl.textContent = count;
      countdownEl.className = `lobby-countdown countdown-${count === 'GO!' ? 'go' : 'number'}`;

      if (count === 'GO!') {
        audio.countdownGo();
      } else {
        audio.countdownTick();
      }

      // Animate
      countdownEl.style.transform = 'scale(2)';
      countdownEl.style.opacity = '0';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          countdownEl.style.transition = 'transform 0.8s ease-out, opacity 0.8s ease-out';
          countdownEl.style.transform = 'scale(1)';
          countdownEl.style.opacity = '1';
        });
      });
    });

    socket.on('match:start', (matchData) => {
      cleanup();
      onMatchStart(matchData, roomId);
    });

    socket.on('lobby:playerLeft', () => {
      statusEl.textContent = 'Opponent left the lobby 😢';
      readyBtn.disabled = true;
      setTimeout(() => {
        cleanup();
        onCancel();
      }, 2500);
    });
  }

  function renderPlayerCard(elementId, playerData, isMe, isReady) {
    const el = screen.querySelector(`#${elementId}`);
    if (!el) return;
    el.innerHTML = '';

    const avatar = createAvatar(playerData.username || '?', 64);
    const name = document.createElement('p');
    name.className = 'player-name';
    name.textContent = playerData.username || 'Waiting...';

    const stats = document.createElement('p');
    stats.className = 'player-stats muted';
    stats.textContent = `${playerData.wins || 0}W / ${playerData.losses || 0}L`;

    const sideTag = document.createElement('span');
    sideTag.className = 'player-side';
    sideTag.textContent = isMe ? 'You' : 'Opponent';

    const readyBadge = document.createElement('span');
    readyBadge.className = `ready-badge ${isReady ? 'ready-yes' : 'ready-no'}`;
    readyBadge.textContent = isReady ? '✓ Ready' : 'Not Ready';

    el.appendChild(avatar);
    el.appendChild(name);
    el.appendChild(stats);
    el.appendChild(sideTag);
    el.appendChild(readyBadge);
  }

  function cleanup() {
    if (socket) {
      socket.off('lobby:yourSide');
      socket.off('lobby:bothJoined');
      socket.off('lobby:readyState');
      socket.off('match:countdown');
      socket.off('match:start');
      socket.off('lobby:playerLeft');
    }
  }

  return { cleanup };
}
