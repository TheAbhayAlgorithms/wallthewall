import { getUser } from '../state.js';
import { getSocket } from '../socket.js';
import { createAvatar, createButton } from '../ui/components.js';
import { audio } from '../audio.js';

export function renderResult(container, { result, roomId, mySide, onRematch, onHome }) {
  container.innerHTML = '';

  const user = getUser();
  const socket = getSocket();

  const myId = user?.id;
  const isWinner = result.winnerId === myId || (result.winner === mySide);

  const screen = document.createElement('div');
  screen.className = `screen result-screen ${isWinner ? 'result-win' : 'result-lose'}`;

  const score = result.score || { left: 0, right: 0 };
  const myScore = mySide === 'left' ? score.left : score.right;
  const oppScore = mySide === 'left' ? score.right : score.left;

  screen.innerHTML = `
    <div class="result-inner">
      <div class="result-badge ${isWinner ? 'badge-win' : 'badge-lose'}">
        ${isWinner ? '🏆 VICTORY!' : '💀 DEFEATED'}
      </div>
      <h1 class="result-title ${isWinner ? 'text-win' : 'text-lose'}">
        ${isWinner ? 'You crushed it!' : 'Better luck next time!'}
      </h1>
      <div class="result-score-display">
        <div class="result-score-num ${isWinner ? 'score-green' : ''}">${myScore}</div>
        <div class="result-score-divider">—</div>
        <div class="result-score-num ${!isWinner ? 'score-red' : ''}">${oppScore}</div>
      </div>
      ${result.forfeit ? '<p class="result-forfeit muted">Match ended by forfeit</p>' : ''}
      <div class="result-players">
        <div class="result-player">
          <div id="result-avatar-you"></div>
          <span>${result.winner === mySide ? result.winnerUsername : result.loserUsername}</span>
        </div>
        <span class="result-vs">vs</span>
        <div class="result-player">
          <div id="result-avatar-opp"></div>
          <span>${result.winner !== mySide ? result.winnerUsername : result.loserUsername}</span>
        </div>
      </div>
      <div class="result-actions">
        <div id="rematch-status" class="muted"></div>
      </div>
    </div>
  `;

  container.appendChild(screen);

  // Add avatars
  const youUsername = result.winner === mySide ? result.winnerUsername : result.loserUsername;
  const oppUsername = result.winner !== mySide ? result.winnerUsername : result.loserUsername;
  screen.querySelector('#result-avatar-you').appendChild(createAvatar(youUsername || 'P', 48));
  screen.querySelector('#result-avatar-opp').appendChild(createAvatar(oppUsername || 'P', 48));

  const actionsEl = screen.querySelector('.result-actions');
  const statusEl = screen.querySelector('#rematch-status');

  // Confetti for winner
  if (isWinner) {
    spawnConfetti(screen);
    audio.win();
  } else {
    audio.lose();
  }

  // Buttons
  const rematchBtn = createButton('🔄 Rematch', 'primary', () => {
    socket.emit('rematch:request', { roomId });
    rematchBtn.disabled = true;
    rematchBtn.textContent = 'Waiting for opponent...';
    statusEl.textContent = 'Waiting for opponent to accept...';
  });
  rematchBtn.id = 'btn-rematch';
  rematchBtn.className = 'btn btn-primary btn-lg';

  const homeBtn = createButton('🏠 Back to Home', 'secondary', onHome);
  homeBtn.id = 'btn-home';
  homeBtn.className = 'btn btn-secondary btn-lg';

  actionsEl.appendChild(rematchBtn);
  actionsEl.appendChild(homeBtn);

  // Socket events for rematch
  socket.on('rematch:accepted', ({ newRoomId, opponent }) => {
    onRematch({ roomId: newRoomId, opponent });
  });

  socket.on('rematch:request', () => {
    statusEl.textContent = '⚔️ Opponent wants a rematch!';
    rematchBtn.textContent = 'Accept Rematch';
    rematchBtn.disabled = false;
  });

  socket.on('rematch:declined', () => {
    statusEl.textContent = 'Opponent declined the rematch.';
    rematchBtn.style.display = 'none';
  });

  return screen;
}

function spawnConfetti(container) {
  const colors = ['#FF6B35', '#3DFFB5', '#FF3D9A', '#FFB830', '#F4EFE9'];
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-canvas';
  canvas.width = container.clientWidth || 800;
  canvas.height = container.clientHeight || 600;
  canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const pieces = Array.from({ length: 80 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * 100,
    vx: (Math.random() - 0.5) * 3,
    vy: 2 + Math.random() * 4,
    rotation: Math.random() * 360,
    rotationSpeed: (Math.random() - 0.5) * 8,
    color: colors[Math.floor(Math.random() * colors.length)],
    size: 6 + Math.random() * 8,
    shape: Math.random() > 0.5 ? 'rect' : 'circle',
  }));

  let running = true;
  let frame;

  function loop() {
    if (!running) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let alive = 0;
    for (const p of pieces) {
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotationSpeed;
      if (p.y < canvas.height + 20) alive++;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, 1 - p.y / canvas.height);
      if (p.shape === 'rect') {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    if (alive > 0) {
      frame = requestAnimationFrame(loop);
    } else {
      canvas.remove();
    }
  }

  frame = requestAnimationFrame(loop);
  setTimeout(() => {
    running = false;
    cancelAnimationFrame(frame);
    canvas.remove();
  }, 6000);
}
