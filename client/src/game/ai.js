import { COURT_HEIGHT, PADDLE_HEIGHT, PADDLE_SPEED } from './constants.js';

export class BotAI {
  constructor(difficulty = 'medium') {
    this.difficulty = difficulty;
    this.targetY = COURT_HEIGHT / 2;
    this.reactionTimer = 0;
    this.errorOffset = 0;
    this.setDifficulty(difficulty);
  }

  setDifficulty(difficulty) {
    this.difficulty = difficulty;
    switch (difficulty) {
      case 'easy':
        this.reactionInterval = 0.22; // reacts every 220ms
        this.maxError = 36;
        this.speedFactor = 0.65;
        this.anticipation = false;
        break;
      case 'hard':
        this.reactionInterval = 0.05; // reacts every 50ms
        this.maxError = 6;
        this.speedFactor = 1.0;
        this.anticipation = true;
        break;
      case 'medium':
      default:
        this.reactionInterval = 0.12; // reacts every 120ms
        this.maxError = 18;
        this.speedFactor = 0.82;
        this.anticipation = true;
        break;
    }
  }

  update(state, dt) {
    if (!state || !state.ball || !state.paddles) return 0;

    const ball = state.ball;
    const paddle = state.paddles.right;
    const paddleCenter = paddle.y + PADDLE_HEIGHT / 2;

    this.reactionTimer -= dt;

    if (this.reactionTimer <= 0) {
      this.reactionTimer = this.reactionInterval;
      // Re-evaluate target
      if (ball.vx > 0) {
        // Ball moving toward bot paddle
        if (this.anticipation) {
          // Simple prediction of intercept Y
          const timeToReach = (paddle.x - ball.x) / ball.vx;
          let predictedY = ball.y + ball.vy * timeToReach;

          // Handle bounces
          while (predictedY < 0 || predictedY > COURT_HEIGHT) {
            if (predictedY < 0) predictedY = -predictedY;
            else if (predictedY > COURT_HEIGHT) predictedY = 2 * COURT_HEIGHT - predictedY;
          }

          // In hard mode, try to aim with edge of paddle to curve the ball
          let strategyOffset = 0;
          if (this.difficulty === 'hard') {
            strategyOffset = Math.sin(Date.now() / 1000) * 20;
          }

          this.errorOffset = (Math.random() * 2 - 1) * this.maxError + strategyOffset;
          this.targetY = predictedY + this.errorOffset;
        } else {
          // Direct tracking with error
          this.errorOffset = (Math.random() * 2 - 1) * this.maxError;
          this.targetY = ball.y + this.errorOffset;
        }
      } else {
        // Ball moving away: return toward center
        this.targetY = COURT_HEIGHT / 2 + (Math.random() * 40 - 20);
      }
    }

    // Clamp target within court
    this.targetY = Math.max(PADDLE_HEIGHT / 2, Math.min(COURT_HEIGHT - PADDLE_HEIGHT / 2, this.targetY));

    // Determine direction
    const diff = this.targetY - paddleCenter;
    const deadzone = 8;

    if (Math.abs(diff) < deadzone) return 0;
    return diff > 0 ? 1 : -1;
  }
}
