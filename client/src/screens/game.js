import { getUser } from '../state.js';
import { getSocket } from '../socket.js';
import { initInput, destroyInput } from '../game/input.js';
import { addSnapshot, getInterpolatedState, clearSnapshots } from '../game/interpolation.js';
import { render, triggerShake, triggerScoreFlash, spawnParticles } from '../game/renderer.js';
import { audio, isMuted, toggleMute } from '../audio.js';

let animFrameId = null;
let lastTime = null;

export function renderGame(container, { roomId, side, initialState, players, onMatchEnd }) {
  container.innerHTML = '';

  const socket = getSocket();
  const user = getUser();

  let mySide = side;

  clearSnapshots();

  const screen = document.createElement('div');
  screen.className = 'screen game-screen';

  // Find opponent and me
  const me = players.find(p => p.id === user.id);
  const opp = players.find(p => p.id !== user.id);

  const leftPlayer = players.find(p => p.side === 'left');
  const rightPlayer = players.find(p => p.side === 'right');

  screen.innerHTML = `
    <div class="game-hud">
      <div class="hud-player hud-left">
        <span class="hud-name ${leftPlayer?.id === user.id ? 'hud-you' : ''}">${leftPlayer?.username || 'Player 1'}</span>
      </div>
      <div class="hud-center">
        <button id="btn-mute" class="btn btn-ghost btn-sm" title="Toggle Sound">🔊</button>
      </div>
      <div class="hud-player hud-right">
        <span class="hud-name ${rightPlayer?.id === user.id ? 'hud-you' : ''}">${rightPlayer?.username || 'Player 2'}</span>
      </div>
    </div>
    <div class="canvas-wrapper">
      <canvas id="game-canvas" width="800" height="500"></canvas>
      <div id="game-overlay" class="game-overlay hidden"></div>
    </div>
    <div class="game-controls-hint">
      <span>↑/W — Move Up &nbsp;·&nbsp; ↓/S — Move Down</span>
    </div>
  `;

  container.appendChild(screen);

  const canvas = screen.querySelector('#game-canvas');
  const ctx = canvas.getContext('2d');
  const overlay = screen.querySelector('#game-overlay');
  const muteBtn = screen.querySelector('#btn-mute');

  // Responsive canvas scaling
  function resizeCanvas() {
    const wrapper = canvas.parentElement;
    const maxW = wrapper.clientWidth;
    const maxH = window.innerHeight - 150; // account for HUD and hint
    const ratio = 800 / 500;
    let w = Math.min(maxW, maxH * ratio);
    let h = w / ratio;
    canvas.style.width = `${Math.floor(w)}px`;
    canvas.style.height = `${Math.floor(h)}px`;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Mute toggle
  muteBtn.textContent = isMuted() ? '🔇' : '🔊';
  muteBtn.addEventListener('click', () => {
    const nowMuted = toggleMute();
    muteBtn.textContent = nowMuted ? '🔇' : '🔊';
  });

  // Input
  initInput(({ dir, seq }) => {
    socket.emit('match:input', { roomId, dir, seq });
  });

  // Load initial state
  if (initialState) addSnapshot(initialState);

  // Game loop
  function gameLoop(timestamp) {
    const dt = lastTime ? Math.min((timestamp - lastTime) / 1000, 0.05) : 0.016;
    lastTime = timestamp;

    const state = getInterpolatedState();
    render(ctx, state, mySide, dt);

    animFrameId = requestAnimationFrame(gameLoop);
  }

  animFrameId = requestAnimationFrame(gameLoop);

  // Socket events
  socket.on('match:state', (snapshot) => {
    addSnapshot(snapshot);
  });

  socket.on('match:hit', ({ ball }) => {
    const speedFactor = ball ? Math.min((ball.speed - 360) / 540, 1) : 0;
    triggerShake(0.3 + speedFactor * 0.7);
    if (ball) spawnParticles(ball.x * (canvas.width / 800), ball.y * (canvas.height / 500), '#FF6B35');
    audio.hit();
  });

  socket.on('match:point', ({ scorer, score }) => {
    triggerScoreFlash(scorer);
    audio.score();
    const isMe = scorer === mySide;
    overlay.textContent = isMe ? '🎉 You scored!' : '😬 Ball dropped!';
    overlay.className = 'game-overlay show';
    setTimeout(() => { overlay.className = 'game-overlay hidden'; }, 1500);
  });

  socket.on('match:paused', ({ message }) => {
    overlay.textContent = message;
    overlay.className = 'game-overlay show';
  });

  socket.on('match:resumed', () => {
    overlay.className = 'game-overlay hidden';
  });

  socket.on('match:end', (result) => {
    cleanup();
    onMatchEnd(result);
  });

  function cleanup() {
    if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
    lastTime = null;
    destroyInput();
    window.removeEventListener('resize', resizeCanvas);
    socket.off('match:state');
    socket.off('match:hit');
    socket.off('match:point');
    socket.off('match:paused');
    socket.off('match:resumed');
    socket.off('match:end');
  }

  return { cleanup };
}
