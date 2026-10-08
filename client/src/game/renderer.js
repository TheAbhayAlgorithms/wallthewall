// Canvas renderer with effects
const COURT_W = 800;
const COURT_H = 500;
const PADDLE_W = 12;
const PADDLE_H = 90;
const BALL_R = 8;
const TRAIL_LENGTH = 12;
const PARTICLE_COUNT = 12;

const ballTrail = [];
const particles = [];
let shakeAmount = 0;
let shakeDuration = 0;
let scoreFlash = { left: 0, right: 0 };
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;

export function initCanvas(canvasEl) {
  const ctx = canvasEl.getContext('2d');
  return ctx;
}

export function triggerShake(intensity = 1) {
  if (reducedMotion) return;
  shakeAmount = Math.min(intensity * 6, 10);
  shakeDuration = 120;
}

export function triggerScoreFlash(side) {
  scoreFlash[side] = 800;
}

export function spawnParticles(x, y, color) {
  if (reducedMotion) return;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const angle = (Math.random() * Math.PI * 2);
    const speed = 80 + Math.random() * 120;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1.0,
      color,
      size: 2 + Math.random() * 3,
    });
  }
}

export function render(ctx, state, mySide, dt) {
  const canvas = ctx.canvas;
  const scaleX = canvas.width / COURT_W;
  const scaleY = canvas.height / COURT_H;

  ctx.save();

  // Screen shake
  if (shakeAmount > 0 && !reducedMotion) {
    const dx = (Math.random() - 0.5) * shakeAmount;
    const dy = (Math.random() - 0.5) * shakeAmount;
    ctx.translate(dx, dy);
    shakeDuration -= dt * 1000;
    if (shakeDuration <= 0) { shakeAmount = 0; shakeDuration = 0; }
  }

  ctx.scale(scaleX, scaleY);

  // Clear
  ctx.fillStyle = '#0E0C10';
  ctx.fillRect(0, 0, COURT_W, COURT_H);

  drawCourt(ctx);

  if (!state) {
    ctx.restore();
    return;
  }

  // Update trail
  if (state.ball) {
    ballTrail.push({ x: state.ball.x, y: state.ball.y });
    if (ballTrail.length > TRAIL_LENGTH) ballTrail.shift();
  }

  // Draw trail
  drawBallTrail(ctx);

  // Draw paddles
  if (state.paddles) {
    const myColor = '#3DFFB5';    // mint = you
    const oppColor = '#FF3D9A';   // magenta = opponent

    const leftColor = mySide === 'left' ? myColor : oppColor;
    const rightColor = mySide === 'right' ? myColor : oppColor;

    drawPaddle(ctx, state.paddles.left.x, state.paddles.left.y, leftColor);
    drawPaddle(ctx, state.paddles.right.x, state.paddles.right.y, rightColor);
  }

  // Draw ball
  if (state.ball) {
    drawBall(ctx, state.ball.x, state.ball.y, state.ball.speed);
  }

  // Draw score
  if (state.score) {
    drawScore(ctx, state.score, dt);
  }

  // Update & draw particles
  updateParticles(ctx, dt);

  // Draw pause overlay
  if (state.paused) {
    drawPauseOverlay(ctx, 'Point!');
  }

  ctx.restore();
}

function drawCourt(ctx) {
  // Background subtle grid
  ctx.strokeStyle = 'rgba(255, 107, 53, 0.04)';
  ctx.lineWidth = 1;
  for (let x = 0; x < COURT_W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, COURT_H);
    ctx.stroke();
  }
  for (let y = 0; y < COURT_H; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(COURT_W, y);
    ctx.stroke();
  }

  // Center dashed line
  ctx.strokeStyle = 'rgba(255, 107, 53, 0.25)';
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 8]);
  ctx.beginPath();
  ctx.moveTo(COURT_W / 2, 0);
  ctx.lineTo(COURT_W / 2, COURT_H);
  ctx.stroke();
  ctx.setLineDash([]);

  // Court border glow
  ctx.strokeStyle = 'rgba(255, 107, 53, 0.15)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, COURT_W - 2, COURT_H - 2);

  // Radial center glow
  const grd = ctx.createRadialGradient(COURT_W / 2, COURT_H / 2, 10, COURT_W / 2, COURT_H / 2, 200);
  grd.addColorStop(0, 'rgba(255, 107, 53, 0.06)');
  grd.addColorStop(1, 'transparent');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, COURT_W, COURT_H);
}

function drawPaddle(ctx, x, y, color) {
  ctx.save();

  // Glow
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;

  // Paddle body
  const grad = ctx.createLinearGradient(x, y, x + PADDLE_W, y + PADDLE_H);
  grad.addColorStop(0, color);
  grad.addColorStop(1, color + '99');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(x, y, PADDLE_W, PADDLE_H, 4);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawBall(ctx, x, y, speed) {
  ctx.save();

  // Speed-based glow intensity
  const speedFactor = Math.min((speed - 360) / 540, 1);
  const glowSize = 12 + speedFactor * 12;

  // Outer glow
  ctx.shadowColor = '#FF6B35';
  ctx.shadowBlur = glowSize;

  // Ball body gradient
  const grad = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, BALL_R);
  grad.addColorStop(0, '#FFD4A8');
  grad.addColorStop(0.5, '#FF6B35');
  grad.addColorStop(1, '#FF3D1A');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, BALL_R, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawBallTrail(ctx) {
  for (let i = 0; i < ballTrail.length - 1; i++) {
    const t = i / ballTrail.length;
    const alpha = t * 0.4;
    const size = BALL_R * t * 0.8;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#FF6B35';
    ctx.beginPath();
    ctx.arc(ballTrail[i].x, ballTrail[i].y, Math.max(1, size), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawScore(ctx, score, dt) {
  // Score flash update
  if (scoreFlash.left > 0) scoreFlash.left -= dt * 1000;
  if (scoreFlash.right > 0) scoreFlash.right -= dt * 1000;

  const leftFlash = Math.max(0, scoreFlash.left) / 800;
  const rightFlash = Math.max(0, scoreFlash.right) / 800;

  ctx.font = 'bold 48px "Fredoka", sans-serif';
  ctx.textAlign = 'center';

  // Left score
  ctx.save();
  const ls = 1 + leftFlash * 0.4;
  ctx.translate(COURT_W / 4, 60);
  ctx.scale(ls, ls);
  ctx.fillStyle = leftFlash > 0 ? '#3DFFB5' : 'rgba(244, 239, 233, 0.85)';
  ctx.shadowColor = leftFlash > 0 ? '#3DFFB5' : 'transparent';
  ctx.shadowBlur = leftFlash > 0 ? 20 : 0;
  ctx.fillText(score.left, 0, 0);
  ctx.restore();

  // Right score
  ctx.save();
  const rs = 1 + rightFlash * 0.4;
  ctx.translate(COURT_W * 3 / 4, 60);
  ctx.scale(rs, rs);
  ctx.fillStyle = rightFlash > 0 ? '#3DFFB5' : 'rgba(244, 239, 233, 0.85)';
  ctx.shadowColor = rightFlash > 0 ? '#3DFFB5' : 'transparent';
  ctx.shadowBlur = rightFlash > 0 ? 20 : 0;
  ctx.fillText(score.right, 0, 0);
  ctx.restore();
}

function drawPauseOverlay(ctx, text) {
  ctx.fillStyle = 'rgba(18, 16, 20, 0.5)';
  ctx.fillRect(0, 0, COURT_W, COURT_H);
  ctx.font = 'bold 36px "Fredoka", sans-serif';
  ctx.fillStyle = '#FF6B35';
  ctx.textAlign = 'center';
  ctx.fillText(text, COURT_W / 2, COURT_H / 2);
}

function updateParticles(ctx, dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 150 * dt; // gravity
    p.life -= dt * 2;

    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }

    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
