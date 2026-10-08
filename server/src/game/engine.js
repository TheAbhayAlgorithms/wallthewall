import {
  COURT_WIDTH, COURT_HEIGHT, PADDLE_WIDTH, PADDLE_HEIGHT, BALL_RADIUS,
  PADDLE_SPEED, BALL_INITIAL_SPEED, BALL_SPEED_INCREASE, BALL_MAX_SPEED,
  MAX_BOUNCE_ANGLE, SERVE_ANGLE_SPREAD, WIN_SCORE,
  PADDLE_LEFT_X, PADDLE_RIGHT_X
} from './constants.js';

const DEG = Math.PI / 180;

/**
 * Create initial game state
 */
export function createInitialState(serveToPlayer = 1) {
  return {
    ball: createBall(serveToPlayer),
    paddles: {
      left: createPaddle('left'),
      right: createPaddle('right'),
    },
    score: { left: 0, right: 0 },
    tick: 0,
    paused: false,
    pauseUntil: 0,
    winner: null,
  };
}

function createPaddle(side) {
  return {
    x: side === 'left' ? PADDLE_LEFT_X : PADDLE_RIGHT_X,
    y: COURT_HEIGHT / 2 - PADDLE_HEIGHT / 2,
    dy: 0,
  };
}

function createBall(serveToPlayer) {
  // Random angle within ±SERVE_ANGLE_SPREAD degrees
  const angle = (Math.random() * SERVE_ANGLE_SPREAD * 2 - SERVE_ANGLE_SPREAD) * DEG;
  // Direction: toward player who lost (player 1 = right side, player 2 = left side)
  const dirX = serveToPlayer === 1 ? 1 : -1;
  return {
    x: COURT_WIDTH / 2,
    y: COURT_HEIGHT / 2,
    vx: Math.cos(angle) * BALL_INITIAL_SPEED * dirX,
    vy: Math.sin(angle) * BALL_INITIAL_SPEED,
    speed: BALL_INITIAL_SPEED,
  };
}

/**
 * Step the game engine by dt seconds
 * Returns { newState, events[] } where events are 'point:left'|'point:right'|'win:left'|'win:right'
 */
export function step(state, inputs, dt) {
  if (!state || state.winner) return { newState: state, events: [] };

  const now = Date.now();
  if (state.paused && now < state.pauseUntil) {
    return { newState: { ...state, tick: state.tick + 1 }, events: [] };
  }

  const newState = deepCloneState(state);
  newState.paused = false;
  newState.tick++;

  const events = [];

  // Apply paddle inputs
  applyInputs(newState, inputs, dt);

  // Move ball
  newState.ball.x += newState.ball.vx * dt;
  newState.ball.y += newState.ball.vy * dt;

  // Wall bounce (top & bottom)
  if (newState.ball.y - BALL_RADIUS <= 0) {
    newState.ball.y = BALL_RADIUS;
    newState.ball.vy = Math.abs(newState.ball.vy);
  } else if (newState.ball.y + BALL_RADIUS >= COURT_HEIGHT) {
    newState.ball.y = COURT_HEIGHT - BALL_RADIUS;
    newState.ball.vy = -Math.abs(newState.ball.vy);
  }

  // Paddle collision
  const hitLeft = checkPaddleCollision(newState.ball, newState.paddles.left, 'left');
  if (hitLeft) {
    applyPaddleBounce(newState.ball, newState.paddles.left, 'left');
    events.push('hit');
  }

  const hitRight = checkPaddleCollision(newState.ball, newState.paddles.right, 'right');
  if (hitRight) {
    applyPaddleBounce(newState.ball, newState.paddles.right, 'right');
    events.push('hit');
  }

  // Miss detection
  if (newState.ball.x - BALL_RADIUS < 0) {
    // Left player missed, right scores
    newState.score.right++;
    events.push('point:right');
    if (newState.score.right >= WIN_SCORE) {
      newState.winner = 'right';
      events.push('win:right');
    } else {
      resetAfterPoint(newState, 1); // serve toward left player
    }
  } else if (newState.ball.x + BALL_RADIUS > COURT_WIDTH) {
    // Right player missed, left scores
    newState.score.left++;
    events.push('point:left');
    if (newState.score.left >= WIN_SCORE) {
      newState.winner = 'left';
      events.push('win:left');
    } else {
      resetAfterPoint(newState, 2); // serve toward right player
    }
  }

  return { newState, events };
}

function applyInputs(state, inputs, dt) {
  // inputs: { left: dir, right: dir } where dir is -1, 0, or 1
  const moveAmount = PADDLE_SPEED * dt;

  if (inputs.left !== undefined && inputs.left !== 0) {
    state.paddles.left.y += inputs.left * moveAmount;
  }
  if (inputs.right !== undefined && inputs.right !== 0) {
    state.paddles.right.y += inputs.right * moveAmount;
  }

  // Clamp paddles within court
  state.paddles.left.y = Math.max(0, Math.min(COURT_HEIGHT - PADDLE_HEIGHT, state.paddles.left.y));
  state.paddles.right.y = Math.max(0, Math.min(COURT_HEIGHT - PADDLE_HEIGHT, state.paddles.right.y));
}

function checkPaddleCollision(ball, paddle, side) {
  // Check if ball overlaps the paddle rectangle
  const ballLeft = ball.x - BALL_RADIUS;
  const ballRight = ball.x + BALL_RADIUS;
  const ballTop = ball.y - BALL_RADIUS;
  const ballBottom = ball.y + BALL_RADIUS;

  const paddleRight = paddle.x + PADDLE_WIDTH;
  const paddleBottom = paddle.y + PADDLE_HEIGHT;

  const overlap = ballRight >= paddle.x && ballLeft <= paddleRight &&
    ballBottom >= paddle.y && ballTop <= paddleBottom;

  if (!overlap) return false;

  // Only collide if ball is moving toward the paddle
  if (side === 'left' && ball.vx >= 0) return false;
  if (side === 'right' && ball.vx <= 0) return false;

  return true;
}

function applyPaddleBounce(ball, paddle, side) {
  // Relative hit position: -1 (top) to 1 (bottom)
  const paddleCenter = paddle.y + PADDLE_HEIGHT / 2;
  const relHit = (ball.y - paddleCenter) / (PADDLE_HEIGHT / 2);
  const clampedHit = Math.max(-1, Math.min(1, relHit));

  // Bounce angle: 0 at center, max at edges
  const bounceAngle = clampedHit * MAX_BOUNCE_ANGLE * DEG;

  // Increase speed
  ball.speed = Math.min(ball.speed * BALL_SPEED_INCREASE, BALL_MAX_SPEED);

  // Set velocity based on bounce angle and side
  const dirX = side === 'left' ? 1 : -1;
  ball.vx = Math.cos(bounceAngle) * ball.speed * dirX;
  ball.vy = Math.sin(bounceAngle) * ball.speed;

  // Push ball out of paddle to prevent re-collision
  if (side === 'left') {
    ball.x = paddle.x + PADDLE_WIDTH + BALL_RADIUS + 1;
  } else {
    ball.x = paddle.x - BALL_RADIUS - 1;
  }
}

function resetAfterPoint(state, serveToPlayer) {
  state.ball = createBall(serveToPlayer);
  state.paddles.left.y = COURT_HEIGHT / 2 - PADDLE_HEIGHT / 2;
  state.paddles.right.y = COURT_HEIGHT / 2 - PADDLE_HEIGHT / 2;
  state.paused = true;
  state.pauseUntil = Date.now() + 1000; // 1s pause
}

function deepCloneState(state) {
  return {
    ball: { ...state.ball },
    paddles: {
      left: { ...state.paddles.left },
      right: { ...state.paddles.right },
    },
    score: { ...state.score },
    tick: state.tick,
    paused: state.paused,
    pauseUntil: state.pauseUntil,
    winner: state.winner,
  };
}

export { createBall, createPaddle, resetAfterPoint, applyPaddleBounce, checkPaddleCollision };
