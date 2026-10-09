import express from 'express';
import db from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// GET /api/matches/history - last 10 matches for the authenticated user
router.get('/history', authenticateToken, (req, res) => {
  try {
    const matches = db.prepare(`
      SELECT 
        m.id, m.score1, m.score2, m.ended_at, m.forfeit,
        u1.username as player1, u2.username as player2,
        uw.username as winner
      FROM matches m
      JOIN users u1 ON m.player1_id = u1.id
      JOIN users u2 ON m.player2_id = u2.id
      LEFT JOIN users uw ON m.winner_id = uw.id
      WHERE (m.player1_id = ? OR m.player2_id = ?) AND m.ended_at IS NOT NULL
      ORDER BY m.ended_at DESC
      LIMIT 10
    `).all(req.user.id, req.user.id);

    res.json({ matches });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/leaderboard - top 10 by wins
router.get('/leaderboard', (req, res) => {
  try {
    const leaders = db.prepare(`
      SELECT id, username, wins, losses FROM users
      ORDER BY wins DESC, losses ASC
      LIMIT 10
    `).all();

    res.json({ leaderboard: leaders });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/users/:username - user profile
router.get('/user/:username', (req, res) => {
  try {
    const user = db.prepare('SELECT id, username, wins, losses, created_at FROM users WHERE username = ?')
      .get(req.params.username);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
