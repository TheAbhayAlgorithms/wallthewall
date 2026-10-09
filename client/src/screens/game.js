import { getUser } from '../state.js';
import { getSocket } from '../socket.js';
import { initInput, destroyInput } from '../game/input.js';
import { addSnapshot, getInterpolatedState, clearSnapshots } from '../game/interpolation.js';
import {
  render, triggerShake, triggerScoreFlash, spawnParticles, clearEffects,
  triggerPaddleHit, triggerWallBounce, triggerFloatingText, checkRallyMilestone
} from '../game/renderer.js';
import { audio, isMuted, toggleMute } from '../audio.js';
import { createInitialState, step } from '../game/engine.js';
import { BotAI } from '../game/ai.js';
import { showModal } from '../ui/modal.js';

let animFrameId = null;
let lastTime = null;

export function renderGame(container, {
  roomId,
  side = 'left',
  initialState,
  players = [],
  isPractice = false,
  difficulty = 'medium',
  onMatchEnd,
  onExit,
}) {
  container.innerHTML = '';

  const socket = getSocket();
  const user = getUser() || { id: 0, username: 'Player' };
  let mySide = side;

  clearSnapshots();
  clearEffects();

  let rallyCount = 0;
  let maxRally = 0;

  const screen = document.createElement('div');
  screen.className = 'screen game-screen';

  // Determine player info
  let leftName = 'Player 1';
  let rightName = 'Player 2';

  if (isPractice) {
    leftName = `${user.username} (You)`;
    const diffLabel = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
    rightName = `🤖 WallBot (${diffLabel})`;
  } else {
    const leftPlayer = players.find(p => p.side === 'left');
    const rightPlayer = players.find(p => p.side === 'right');
    leftName = leftPlayer ? (leftPlayer.id === user.id ? `${leftPlayer.username} (You)` : leftPlayer.username) : 'Left Player';
    rightName = rightPlayer ? (rightPlayer.id === user.id ? `${rightPlayer.username} (You)` : rightPlayer.username) : 'Right Player';
  }

  screen.innerHTML = `
    <div class="game-hud">
      <div class="hud-player hud-left">
        <span class="hud-name ${mySide === 'left' ? 'hud-you' : ''}">${leftName}</span>
      </div>
      <div class="hud-center">
        <div class="hud-stats-group">
          <span class="hud-badge rally-badge" id="hud-rally">🔥 Rally: 0</span>
          <span class="hud-badge speed-badge" id="hud-speed">⚡ 360 px/s</span>
          <span class="hud-badge mode-badge">${isPractice ? 'Practice' : 'Target: 7'}</span>
        </div>
        <div class="hud-controls-group">
          <button id="btn-mute" class="btn btn-ghost btn-sm" title="Toggle Sound">🔊</button>
          <button id="btn-forfeit" class="btn btn-ghost btn-sm btn-danger-ghost" title="${isPractice ? 'Exit Practice' : 'Forfeit Match'}">
            ${isPractice ? 'Leave' : '🏳️ Forfeit'}
          </button>
        </div>
      </div>
      <div class="hud-player hud-right">
        <span class="hud-name ${mySide === 'right' ? 'hud-you' : ''}">${rightName}</span>
      </div>
    </div>
    <div class="canvas-wrapper">
      <canvas id="game-canvas" width="800" height="500"></canvas>
      <div id="game-overlay" class="game-overlay hidden"></div>
    </div>
    <div class="game-controls-hint">
      <span>↑ / W — Move Up &nbsp;·&nbsp; ↓ / S — Move Down &nbsp;·&nbsp; First to 7 Wins</span>
    </div>
  `;

  container.appendChild(screen);

  const canvas = screen.querySelector('#game-canvas');
  const ctx = canvas.getContext('2d');
  const overlay = screen.querySelector('#game-overlay');
  const muteBtn = screen.querySelector('#btn-mute');
  const forfeitBtn = screen.querySelector('#btn-forfeit');
  const rallyEl = screen.querySelector('#hud-rally');
  const speedEl = screen.querySelector('#hud-speed');

  function resizeCanvas() {
    const wrapper = canvas.parentElement;
    if (!wrapper) return;
    const maxW = wrapper.clientWidth - 24;
    const maxH = window.innerHeight - 160;
    const ratio = 800 / 500;
    let w = Math.min(maxW, maxH * ratio);
    let h = w / ratio;
    canvas.style.width = `${Math.floor(w)}px`;
    canvas.style.height = `${Math.floor(h)}px`;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  muteBtn.textContent = isMuted() ? '🔇' : '🔊';
  muteBtn.addEventListener('click', () => {
    const nowMuted = toggleMute();
    muteBtn.textContent = nowMuted ? '🔇' : '🔊';
  });

  // Forfeit / Exit confirm
  forfeitBtn.addEventListener('click', () => {
    showModal({
      title: isPractice ? 'Leave Practice?' : '🏳️ Forfeit Match?',
      content: isPractice
        ? 'Are you sure you want to exit back to the home screen?'
        : 'If you forfeit now, your opponent will immediately win the match. Are you sure?',
      buttons: [
        {
          text: isPractice ? 'Exit' : 'Yes, Forfeit',
          variant: 'primary',
          onClick: () => {
            if (isPractice) {
              cleanup();
              if (onExit) onExit();
              else onMatchEnd({
                winner: 'right',
                winnerUsername: 'EmberBot',
                loserUsername: user.username,
                score: { left: 0, right: 7 },
                forfeit: true,
                isPractice: true,
              });
            } else if (socket && roomId) {
              socket.emit('match:forfeit', { roomId });
            }
          },
        },
        { text: 'Keep Playing', variant: 'secondary' },
      ],
    });
  });

  // ==========================================
  // PRACTICE MODE (LOCAL CLIENT-SIDE ENGINE)
  // ==========================================
  if (isPractice) {
    let localState = createInitialState(1);
    const bot = new BotAI(difficulty);
    let myInput = 0;
    let gameEnded = false;

    initInput(({ dir }) => {
      myInput = dir;
    });

    function practiceLoop(timestamp) {
      if (gameEnded) return;

      const dt = lastTime ? Math.min((timestamp - lastTime) / 1000, 0.05) : 0.016;
      lastTime = timestamp;

      const botInput = bot.update(localState, dt);
      const inputs = { left: myInput, right: botInput };

      const { newState, events } = step(localState, inputs, dt);
      localState = newState;

      // Handle events
      for (const event of events) {
        if (event === 'hit') {
          rallyCount++;
          if (rallyCount > maxRally) maxRally = rallyCount;
          rallyEl.textContent = `🔥 Rally: ${rallyCount}`;
          checkRallyMilestone(rallyCount);

          const hitSide = localState.ball.vx > 0 ? 'left' : 'right';
          const hitColor = hitSide === 'left' ? '#3DFFB5' : '#FF3D9A';
          triggerPaddleHit(hitSide, localState.ball.x, localState.ball.y, hitColor);

          const speedFactor = Math.min((localState.ball.speed - 360) / 540, 1);
          triggerShake(0.3 + speedFactor * 0.8, hitSide === 'left' ? 1 : -1, 0);
          audio.hit();
        } else if (event === 'wall') {
          triggerWallBounce(localState.ball.x, localState.ball.y);
          audio.wallBounce();
        } else if (event.startsWith('point:')) {
          rallyCount = 0;
          rallyEl.textContent = `🔥 Rally: 0`;
          checkRallyMilestone(0);

          const scorer = event.split(':')[1];
          triggerScoreFlash(scorer);
          audio.score();

          const isMe = scorer === 'left';
          triggerFloatingText(isMe ? '+1 POINT!' : 'POINT', isMe ? 220 : 580, 140, isMe ? '#3DFFB5' : '#FF3D9A', 28);
          overlay.textContent = isMe ? '🎉 You scored!' : '🤖 WallBot scored!';
          overlay.className = 'game-overlay show';
          setTimeout(() => { if (!gameEnded) overlay.className = 'game-overlay hidden'; }, 900);
        } else if (event.startsWith('win:')) {
          gameEnded = true;
          const winnerSide = event.split(':')[1];
          const isWinner = winnerSide === 'left';
          const matchResult = {
            winner: winnerSide,
            winnerId: isWinner ? user.id : -1,
            winnerUsername: isWinner ? user.username : 'WallBot',
            loserId: isWinner ? -1 : user.id,
            loserUsername: isWinner ? 'WallBot' : user.username,
            score: localState.score,
            forfeit: false,
            isPractice: true,
            difficulty,
            maxRally,
          };
          cleanup();
          onMatchEnd(matchResult);
          return;
        }
      }

      if (localState.ball) {
        speedEl.textContent = `⚡ ${Math.round(localState.ball.speed)} px/s`;
      }

      render(ctx, localState, mySide, dt);
      animFrameId = requestAnimationFrame(practiceLoop);
    }

    animFrameId = requestAnimationFrame(practiceLoop);

    function cleanup() {
      gameEnded = true;
      if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
      lastTime = null;
      destroyInput();
      window.removeEventListener('resize', resizeCanvas);
    }

    return { cleanup };
  }

  // ==========================================
  // MULTIPLAYER MODE (SOCKET.IO NETWORKED)
  // ==========================================
  initInput(({ dir, seq }) => {
    if (socket && roomId) {
      socket.emit('match:input', { roomId, dir, seq });
    }
  });

  if (initialState) addSnapshot(initialState);

  function gameLoop(timestamp) {
    const dt = lastTime ? Math.min((timestamp - lastTime) / 1000, 0.05) : 0.016;
    lastTime = timestamp;

    const state = getInterpolatedState();
    if (state && state.ball) {
      speedEl.textContent = `⚡ ${Math.round(state.ball.speed || 360)} px/s`;
    }

    render(ctx, state, mySide, dt);
    animFrameId = requestAnimationFrame(gameLoop);
  }

  animFrameId = requestAnimationFrame(gameLoop);

  // Socket events
  socket.on('match:state', (snapshot) => {
    addSnapshot(snapshot);
  });

  socket.on('match:hit', ({ ball }) => {
    rallyCount++;
    if (rallyCount > maxRally) maxRally = rallyCount;
    rallyEl.textContent = `🔥 Rally: ${rallyCount}`;
    checkRallyMilestone(rallyCount);

    const hitSide = (ball?.vx || 0) > 0 ? 'left' : 'right';
    const hitColor = hitSide === mySide ? '#3DFFB5' : '#FF3D9A';
    triggerPaddleHit(hitSide, ball?.x || 400, ball?.y || 250, hitColor);

    const speedFactor = ball ? Math.min((ball.speed - 360) / 540, 1) : 0;
    triggerShake(0.3 + speedFactor * 0.8, hitSide === 'left' ? 1 : -1, 0);
    audio.hit();
  });

  socket.on('match:point', ({ scorer }) => {
    rallyCount = 0;
    rallyEl.textContent = `🔥 Rally: 0`;
    checkRallyMilestone(0);
    triggerScoreFlash(scorer);
    audio.score();

    const isMe = scorer === mySide;
    triggerFloatingText(isMe ? '+1 POINT!' : 'POINT', isMe ? 220 : 580, 140, isMe ? '#3DFFB5' : '#FF3D9A', 28);
    overlay.textContent = isMe ? '🎉 You scored!' : '😬 Ball dropped!';
    overlay.className = 'game-overlay show';
    setTimeout(() => { overlay.className = 'game-overlay hidden'; }, 1000);
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
    onMatchEnd({ ...result, maxRally });
  });

  function cleanup() {
    if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
    lastTime = null;
    destroyInput();
    window.removeEventListener('resize', resizeCanvas);
    if (socket) {
      socket.off('match:state');
      socket.off('match:hit');
      socket.off('match:point');
      socket.off('match:paused');
      socket.off('match:resumed');
      socket.off('match:end');
    }
  }

  return { cleanup };
}
