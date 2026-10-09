// Canvas renderer with high-intensity visual animations and VFX
const COURT_W = 800;
const COURT_H = 500;
const PADDLE_W = 12;
const PADDLE_H = 90;
const BALL_R = 8;
const MAX_TRAIL_LENGTH = 22;

const ballTrail = [];
const particles = [];
const shockwaves = [];
const wallFlashes = [];
const floatingTexts = [];

let shakeAmount = 0;
let shakeDuration = 0;
let shakeDirX = 0;
let shakeDirY = 0;
let scoreFlash = { left: 0, right: 0 };
let paddleFlash = { left: 0, right: 0 };
let lastRallyMilestone = 0;

const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;

export function initCanvas(canvasEl) {
  return canvasEl.getContext('2d');
}

export function triggerShake(intensity = 1, dirX = 0, dirY = 0) {
  if (reducedMotion) return;
  shakeAmount = Math.min(intensity * 7, 12);
  shakeDuration = 140;
  shakeDirX = dirX;
  shakeDirY = dirY;
}

export function triggerScoreFlash(side) {
  scoreFlash[side] = 800;
}

export function triggerPaddleHit(side, x, y, color) {
  paddleFlash[side] = 200; // ms flash
  spawnShockwave(x, y, color || '#3DFFB5');
  spawnParticles(x, y, color || '#FF6B35', 18);
}

export function triggerWallBounce(x, y) {
  wallFlashes.push({
    x,
    y,
    life: 1.0,
    isTop: y <= COURT_H / 2,
  });
  spawnParticles(x, y, '#FFB830', 8);
}

export function triggerFloatingText(text, x, y, color = '#3DFFB5', size = 24) {
  if (reducedMotion) return;
  floatingTexts.push({
    text,
    x,
    y,
    vy: -45,
    life: 1.0,
    color,
    size,
  });
}

export function checkRallyMilestone(rally) {
  if (rally >= 15 && lastRallyMilestone < 15) {
    lastRallyMilestone = 15;
    triggerFloatingText('💥 15x GODLIKE RALLY! 💥', COURT_W / 2, COURT_H / 2 - 40, '#FF3D9A', 32);
    triggerShake(1.4);
  } else if (rally >= 10 && lastRallyMilestone < 10) {
    lastRallyMilestone = 10;
    triggerFloatingText('⚡ 10x ULTRA RALLY! ⚡', COURT_W / 2, COURT_H / 2 - 40, '#3DFFB5', 28);
    triggerShake(1.1);
  } else if (rally >= 5 && lastRallyMilestone < 5) {
    lastRallyMilestone = 5;
    triggerFloatingText('🔥 5x RALLY! 🔥', COURT_W / 2, COURT_H / 2 - 40, '#FFB830', 26);
    triggerShake(0.8);
  } else if (rally === 0) {
    lastRallyMilestone = 0;
  }
}

export function spawnShockwave(x, y, color) {
  if (reducedMotion) return;
  shockwaves.push({
    x,
    y,
    radius: 6,
    maxRadius: 65,
    color,
    life: 1.0,
  });
}

export function spawnParticles(x, y, color, count = 14) {
  if (reducedMotion) return;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 70 + Math.random() * 160;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1.0,
      color,
      size: 2 + Math.random() * 3.5,
      decay: 1.5 + Math.random() * 1.5,
    });
  }
}

export function clearEffects() {
  ballTrail.length = 0;
  particles.length = 0;
  shockwaves.length = 0;
  wallFlashes.length = 0;
  floatingTexts.length = 0;
  shakeAmount = 0;
  shakeDuration = 0;
  scoreFlash = { left: 0, right: 0 };
  paddleFlash = { left: 0, right: 0 };
  lastRallyMilestone = 0;
}

export function render(ctx, state, mySide, dt) {
  const canvas = ctx.canvas;
  const scaleX = canvas.width / COURT_W;
  const scaleY = canvas.height / COURT_H;
  const now = Date.now();

  ctx.save();

  // Screen shake with directional recoil
  if (shakeAmount > 0 && !reducedMotion) {
    const randomX = (Math.random() - 0.5) * shakeAmount;
    const randomY = (Math.random() - 0.5) * shakeAmount;
    const kickX = shakeDirX * (shakeAmount * 0.4);
    const kickY = shakeDirY * (shakeAmount * 0.4);
    ctx.translate(randomX + kickX, randomY + kickY);

    shakeDuration -= dt * 1000;
    if (shakeDuration <= 0) {
      shakeAmount = 0;
      shakeDuration = 0;
      shakeDirX = 0;
      shakeDirY = 0;
    }
  }

  ctx.scale(scaleX, scaleY);

  // Clear court with deep futuristic dark palette
  ctx.fillStyle = '#0E0C10';
  ctx.fillRect(0, 0, COURT_W, COURT_H);

  // Draw animated court
  drawAnimatedCourt(ctx, state?.ball, now);

  if (!state) {
    ctx.restore();
    return;
  }

  // Update ball trail length proportionally to speed
  const currentSpeed = state.ball?.speed || 360;
  const targetTrailLength = Math.min(MAX_TRAIL_LENGTH, Math.floor(8 + ((currentSpeed - 360) / 540) * 14));

  if (state.ball) {
    ballTrail.push({
      x: state.ball.x,
      y: state.ball.y,
      speed: currentSpeed,
    });
    while (ballTrail.length > targetTrailLength) ballTrail.shift();

    // High speed dynamic flame sparks shedding in flight
    if (currentSpeed > 520 && !reducedMotion && Math.random() < 0.6) {
      particles.push({
        x: state.ball.x + (Math.random() - 0.5) * 6,
        y: state.ball.y + (Math.random() - 0.5) * 6,
        vx: -state.ball.vx * 0.15 + (Math.random() - 0.5) * 40,
        vy: -state.ball.vy * 0.15 + (Math.random() - 0.5) * 40,
        life: 0.7,
        color: currentSpeed > 720 ? '#FF3D9A' : '#FF6B35',
        size: 1.5 + Math.random() * 2,
        decay: 2.2,
      });
    }
  }

  // Draw ball motion trail
  drawBallTrail(ctx);

  // Draw wall flash impacts
  updateWallFlashes(ctx, dt);

  // Draw shockwave expanding rings
  updateShockwaves(ctx, dt);

  // Draw paddles with flex & flash
  if (state.paddles) {
    const myColor = '#3DFFB5';
    const oppColor = '#FF3D9A';
    const leftColor = mySide === 'left' ? myColor : oppColor;
    const rightColor = mySide === 'right' ? myColor : oppColor;

    drawPaddle(ctx, state.paddles.left.x, state.paddles.left.y, leftColor, paddleFlash.left, dt, 'left');
    drawPaddle(ctx, state.paddles.right.x, state.paddles.right.y, rightColor, paddleFlash.right, dt, 'right');
  }

  // Draw ball with multi-layer glow
  if (state.ball) {
    drawBall(ctx, state.ball.x, state.ball.y, state.ball.speed, now);
  }

  // Draw score display
  if (state.score) {
    drawScore(ctx, state.score, dt);
  }

  // Update & draw flying particles
  updateParticles(ctx, dt);

  // Update & draw floating combat text
  updateFloatingTexts(ctx, dt);

  // Draw pause overlay
  if (state.paused) {
    drawPauseOverlay(ctx, 'Point Scored!');
  }

  ctx.restore();
}

function drawAnimatedCourt(ctx, ball, now) {
  const pulse = Math.sin(now / 500) * 0.5 + 0.5;

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

  // Center line electric pulse
  ctx.save();
  ctx.strokeStyle = `rgba(255, 107, 53, ${0.2 + pulse * 0.15})`;
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 8]);
  ctx.lineDashOffset = -((now / 50) % 20);
  ctx.beginPath();
  ctx.moveTo(COURT_W / 2, 0);
  ctx.lineTo(COURT_W / 2, COURT_H);
  ctx.stroke();
  ctx.restore();

  // Center court circle with rotating reticle
  ctx.save();
  ctx.strokeStyle = `rgba(255, 107, 53, ${0.12 + pulse * 0.08})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(COURT_W / 2, COURT_H / 2, 60, 0, Math.PI * 2);
  ctx.stroke();

  // Subtle rotating crosshair
  const rotAngle = now / 3000;
  ctx.translate(COURT_W / 2, COURT_H / 2);
  ctx.rotate(rotAngle);
  ctx.strokeStyle = 'rgba(255, 107, 53, 0.08)';
  ctx.beginPath();
  ctx.moveTo(-15, 0);
  ctx.lineTo(15, 0);
  ctx.moveTo(0, -15);
  ctx.lineTo(0, 15);
  ctx.stroke();
  ctx.restore();

  // Court border neon glow
  ctx.strokeStyle = `rgba(255, 107, 53, ${0.18 + pulse * 0.1})`;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, COURT_W - 2, COURT_H - 2);

  // Radial center aura
  const grd = ctx.createRadialGradient(COURT_W / 2, COURT_H / 2, 10, COURT_W / 2, COURT_H / 2, 220);
  grd.addColorStop(0, `rgba(255, 107, 53, ${0.05 + pulse * 0.03})`);
  grd.addColorStop(1, 'transparent');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, COURT_W, COURT_H);
}

function drawPaddle(ctx, x, y, color, flashMs, dt, side) {
  ctx.save();

  // Hit flash intensity
  const isFlashing = flashMs > 0;
  const flashRatio = Math.min(flashMs / 200, 1);

  if (side === 'left' && paddleFlash.left > 0) paddleFlash.left -= dt * 1000;
  if (side === 'right' && paddleFlash.right > 0) paddleFlash.right -= dt * 1000;

  // Squish flex animation on hit
  let squishScaleX = 1 + flashRatio * 0.35;
  let offsetX = x + PADDLE_W / 2;
  let offsetY = y + PADDLE_H / 2;

  ctx.translate(offsetX, offsetY);
  ctx.scale(squishScaleX, 1);
  ctx.translate(-offsetX, -offsetY);

  // Glowing shadow
  ctx.shadowColor = isFlashing ? '#FFFFFF' : color;
  ctx.shadowBlur = 16 + flashRatio * 20;

  // Body gradient
  const grad = ctx.createLinearGradient(x, y, x + PADDLE_W, y + PADDLE_H);
  if (isFlashing) {
    grad.addColorStop(0, '#FFFFFF');
    grad.addColorStop(0.5, color);
    grad.addColorStop(1, '#FFFFFF');
  } else {
    grad.addColorStop(0, color);
    grad.addColorStop(1, color + 'AA');
  }

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(x, y, PADDLE_W, PADDLE_H, 5);
  ctx.fill();

  // High-intensity core line inside paddle
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.fillRect(x + PADDLE_W / 2 - 1, y + 8, 2, PADDLE_H - 16);

  ctx.restore();
}

function drawBall(ctx, x, y, speed, now) {
  ctx.save();

  const speedFactor = Math.min((speed - 360) / 540, 1);
  const glowSize = 14 + speedFactor * 18;
  const pulseScale = 1 + Math.sin(now / 80) * 0.08 * (0.5 + speedFactor);

  // Outer Neon Glow
  ctx.shadowColor = speedFactor > 0.6 ? '#FF3D9A' : '#FF6B35';
  ctx.shadowBlur = glowSize;

  // Scale pulse
  ctx.translate(x, y);
  ctx.scale(pulseScale, pulseScale);
  ctx.translate(-x, -y);

  // Ball body radial gradient: Hot core to fiery edge
  const grad = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, BALL_R);
  if (speedFactor > 0.7) {
    grad.addColorStop(0, '#FFFFFF');
    grad.addColorStop(0.3, '#FFD4A8');
    grad.addColorStop(0.7, '#FF3D9A');
    grad.addColorStop(1, '#CC0066');
  } else {
    grad.addColorStop(0, '#FFFFFF');
    grad.addColorStop(0.4, '#FFD4A8');
    grad.addColorStop(0.8, '#FF6B35');
    grad.addColorStop(1, '#CC3300');
  }

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, BALL_R, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawBallTrail(ctx) {
  for (let i = 0; i < ballTrail.length - 1; i++) {
    const t = i / ballTrail.length;
    const alpha = t * 0.45;
    const speed = ballTrail[i].speed || 360;
    const speedRatio = Math.min((speed - 360) / 540, 1);
    const size = BALL_R * t * (0.8 + speedRatio * 0.3);

    ctx.globalAlpha = alpha;
    ctx.fillStyle = speedRatio > 0.6 ? '#FF3D9A' : '#FF6B35';
    ctx.beginPath();
    ctx.arc(ballTrail[i].x, ballTrail[i].y, Math.max(1, size), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function updateShockwaves(ctx, dt) {
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const sw = shockwaves[i];
    sw.radius += (sw.maxRadius - sw.radius) * dt * 14;
    sw.life -= dt * 2.2;

    if (sw.life <= 0 || sw.radius >= sw.maxRadius) {
      shockwaves.splice(i, 1);
      continue;
    }

    ctx.save();
    ctx.globalAlpha = Math.max(0, sw.life * 0.8);
    ctx.strokeStyle = sw.color;
    ctx.lineWidth = Math.max(1, 3 * sw.life);
    ctx.shadowColor = sw.color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function updateWallFlashes(ctx, dt) {
  for (let i = wallFlashes.length - 1; i >= 0; i--) {
    const wf = wallFlashes[i];
    wf.life -= dt * 4;

    if (wf.life <= 0) {
      wallFlashes.splice(i, 1);
      continue;
    }

    ctx.save();
    ctx.globalAlpha = Math.max(0, wf.life);
    const width = 80 * (1.5 - wf.life * 0.5);
    const grad = ctx.createLinearGradient(wf.x - width / 2, wf.y, wf.x + width / 2, wf.y);
    grad.addColorStop(0, 'transparent');
    grad.addColorStop(0.5, '#FFB830');
    grad.addColorStop(1, 'transparent');

    ctx.fillStyle = grad;
    ctx.fillRect(wf.x - width / 2, wf.isTop ? 0 : COURT_H - 4, width, 4);
    ctx.restore();
  }
}

function updateFloatingTexts(ctx, dt) {
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i];
    ft.y += ft.vy * dt;
    ft.life -= dt * 1.1;

    if (ft.life <= 0) {
      floatingTexts.splice(i, 1);
      continue;
    }

    ctx.save();
    ctx.globalAlpha = Math.max(0, ft.life);
    ctx.font = `bold ${ft.size}px "Fredoka", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = ft.color;
    ctx.shadowColor = ft.color;
    ctx.shadowBlur = 18;
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  }
}

function drawScore(ctx, score, dt) {
  if (scoreFlash.left > 0) scoreFlash.left -= dt * 1000;
  if (scoreFlash.right > 0) scoreFlash.right -= dt * 1000;

  const leftFlash = Math.max(0, scoreFlash.left) / 800;
  const rightFlash = Math.max(0, scoreFlash.right) / 800;

  ctx.font = 'bold 52px "Fredoka", sans-serif';
  ctx.textAlign = 'center';

  // Left score
  ctx.save();
  const ls = 1 + leftFlash * 0.35;
  ctx.translate(COURT_W / 4, 65);
  ctx.scale(ls, ls);
  ctx.fillStyle = leftFlash > 0 ? '#3DFFB5' : 'rgba(244, 239, 233, 0.85)';
  ctx.shadowColor = leftFlash > 0 ? '#3DFFB5' : 'transparent';
  ctx.shadowBlur = leftFlash > 0 ? 22 : 0;
  ctx.fillText(score.left, 0, 0);
  ctx.restore();

  // Right score
  ctx.save();
  const rs = 1 + rightFlash * 0.35;
  ctx.translate(COURT_W * 3 / 4, 65);
  ctx.scale(rs, rs);
  ctx.fillStyle = rightFlash > 0 ? '#3DFFB5' : 'rgba(244, 239, 233, 0.85)';
  ctx.shadowColor = rightFlash > 0 ? '#3DFFB5' : 'transparent';
  ctx.shadowBlur = rightFlash > 0 ? 22 : 0;
  ctx.fillText(score.right, 0, 0);
  ctx.restore();
}

function drawPauseOverlay(ctx, text) {
  ctx.fillStyle = 'rgba(18, 16, 20, 0.55)';
  ctx.fillRect(0, 0, COURT_W, COURT_H);
  ctx.font = 'bold 36px "Fredoka", sans-serif';
  ctx.fillStyle = '#FF6B35';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#FF6B35';
  ctx.shadowBlur = 18;
  ctx.fillText(text, COURT_W / 2, COURT_H / 2);
}

function updateParticles(ctx, dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 140 * dt; // gravity
    p.life -= dt * (p.decay || 2.0);

    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }

    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.5, p.size * p.life), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
