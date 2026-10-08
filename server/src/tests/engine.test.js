import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialState, step } from '../game/engine.js';
import {
  COURT_WIDTH, COURT_HEIGHT, BALL_RADIUS, PADDLE_HEIGHT,
  BALL_INITIAL_SPEED, BALL_MAX_SPEED, WIN_SCORE,
  PADDLE_LEFT_X, PADDLE_RIGHT_X, PADDLE_WIDTH
} from '../game/constants.js';

describe('Game Engine', () => {
  let state;

  beforeEach(() => {
    state = createInitialState(1);
    // Force deterministic ball state for tests
    state.ball = { x: 400, y: 250, vx: 200, vy: 0, speed: 200 };
  });

  describe('Wall bounce', () => {
    it('should bounce off the top wall', () => {
      state.ball.y = BALL_RADIUS - 1;
      state.ball.vy = -100;
      const { newState } = step(state, { left: 0, right: 0 }, 0.016);
      expect(newState.ball.vy).toBeGreaterThan(0);
    });

    it('should bounce off the bottom wall', () => {
      state.ball.y = COURT_HEIGHT - BALL_RADIUS + 1;
      state.ball.vy = 100;
      const { newState } = step(state, { left: 0, right: 0 }, 0.016);
      expect(newState.ball.vy).toBeLessThan(0);
    });

    it('should keep ball within vertical bounds after wall bounce', () => {
      state.ball.y = 1;
      state.ball.vy = -500;
      const { newState } = step(state, { left: 0, right: 0 }, 0.016);
      expect(newState.ball.y).toBeGreaterThanOrEqual(BALL_RADIUS);
    });
  });

  describe('Paddle collision angle', () => {
    it('should bounce flat when hit at center', () => {
      const paddleCenter = COURT_HEIGHT / 2;
      state.paddles.left.y = paddleCenter - PADDLE_HEIGHT / 2;
      state.ball.x = PADDLE_LEFT_X + PADDLE_WIDTH + BALL_RADIUS + 1;
      state.ball.y = paddleCenter;
      state.ball.vx = -200;
      state.ball.vy = 0;
      const { newState } = step(state, { left: 0, right: 0 }, 0.016);
      // After bounce off left paddle, ball should go right
      expect(newState.ball.vx).toBeGreaterThan(0);
      // Vertical component should be very small (near-flat)
      expect(Math.abs(newState.ball.vy)).toBeLessThan(50);
    });

    it('should produce non-zero vy when hit at edge', () => {
      const paddleTop = 100;
      state.paddles.left.y = paddleTop;
      state.ball.x = PADDLE_LEFT_X + PADDLE_WIDTH + BALL_RADIUS + 1;
      state.ball.y = paddleTop + 5; // near top edge of paddle
      state.ball.vx = -200;
      state.ball.vy = 0;
      const { newState } = step(state, { left: 0, right: 0 }, 0.016);
      expect(newState.ball.vx).toBeGreaterThan(0);
      // Should have angled bounce
      expect(Math.abs(newState.ball.vy)).toBeGreaterThan(0);
    });
  });

  describe('Speed increase', () => {
    it('should increase ball speed on paddle hit', () => {
      state.paddles.left.y = COURT_HEIGHT / 2 - PADDLE_HEIGHT / 2;
      state.ball.x = PADDLE_LEFT_X + PADDLE_WIDTH + BALL_RADIUS + 1;
      state.ball.y = COURT_HEIGHT / 2;
      state.ball.vx = -200;
      state.ball.speed = 200;
      const { newState } = step(state, { left: 0, right: 0 }, 0.016);
      expect(newState.ball.speed).toBeGreaterThan(200);
    });

    it('should cap ball speed at BALL_MAX_SPEED', () => {
      state.paddles.left.y = COURT_HEIGHT / 2 - PADDLE_HEIGHT / 2;
      state.ball.x = PADDLE_LEFT_X + PADDLE_WIDTH + BALL_RADIUS + 1;
      state.ball.y = COURT_HEIGHT / 2;
      state.ball.vx = -BALL_MAX_SPEED;
      state.ball.speed = BALL_MAX_SPEED;
      const { newState } = step(state, { left: 0, right: 0 }, 0.016);
      expect(newState.ball.speed).toBeLessThanOrEqual(BALL_MAX_SPEED);
    });
  });

  describe('Miss detection', () => {
    it('should score right when ball passes left edge', () => {
      state.ball.x = BALL_RADIUS - 1;
      state.ball.vx = -200;
      const { newState, events } = step(state, { left: 0, right: 0 }, 0.016);
      expect(newState.score.right).toBe(1);
      expect(events).toContain('point:right');
    });

    it('should score left when ball passes right edge', () => {
      state.ball.x = COURT_WIDTH - BALL_RADIUS + 1;
      state.ball.vx = 200;
      const { newState, events } = step(state, { left: 0, right: 0 }, 0.016);
      expect(newState.score.left).toBe(1);
      expect(events).toContain('point:left');
    });
  });

  describe('Win condition', () => {
    it('should emit win:left when left scores 7', () => {
      state.score.left = 6;
      state.ball.x = COURT_WIDTH - BALL_RADIUS + 1;
      state.ball.vx = 200;
      const { newState, events } = step(state, { left: 0, right: 0 }, 0.016);
      expect(newState.score.left).toBe(WIN_SCORE);
      expect(events).toContain('win:left');
      expect(newState.winner).toBe('left');
    });

    it('should emit win:right when right scores 7', () => {
      state.score.right = 6;
      state.ball.x = BALL_RADIUS - 1;
      state.ball.vx = -200;
      const { newState, events } = step(state, { left: 0, right: 0 }, 0.016);
      expect(newState.score.right).toBe(WIN_SCORE);
      expect(events).toContain('win:right');
      expect(newState.winner).toBe('right');
    });

    it('should stop advancing after win', () => {
      state.winner = 'left';
      const { newState } = step(state, { left: 0, right: 0 }, 0.016);
      expect(newState).toBe(state); // same reference, no step
    });
  });

  describe('Reset after point', () => {
    it('should reset ball to center after scoring', () => {
      state.ball.x = COURT_WIDTH - BALL_RADIUS + 1;
      state.ball.vx = 200;
      const { newState } = step(state, { left: 0, right: 0 }, 0.016);
      expect(newState.ball.x).toBeCloseTo(COURT_WIDTH / 2, 0);
      expect(newState.ball.y).toBeCloseTo(COURT_HEIGHT / 2, 0);
    });

    it('should reset ball speed to BALL_INITIAL_SPEED after point', () => {
      state.ball.x = COURT_WIDTH - BALL_RADIUS + 1;
      state.ball.vx = 200;
      const { newState } = step(state, { left: 0, right: 0 }, 0.016);
      expect(newState.ball.speed).toBeCloseTo(BALL_INITIAL_SPEED, 0);
    });
  });

  describe('Initial state', () => {
    it('should create state with zero scores', () => {
      const s = createInitialState(1);
      expect(s.score.left).toBe(0);
      expect(s.score.right).toBe(0);
    });

    it('should place paddles at center height', () => {
      const s = createInitialState(1);
      const expectedY = COURT_HEIGHT / 2 - PADDLE_HEIGHT / 2;
      expect(s.paddles.left.y).toBeCloseTo(expectedY, 0);
      expect(s.paddles.right.y).toBeCloseTo(expectedY, 0);
    });
  });
});
