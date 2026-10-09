import express from 'express';
import db from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// GET /api/friends - list accepted friends with presence
router.get('/', authenticateToken, (req, res) => {
  try {
    const friends = db.prepare(`
      SELECT 
        f.id as friendship_id,
        CASE WHEN f.requester_id = ? THEN u.id ELSE u2.id END as user_id,
        CASE WHEN f.requester_id = ? THEN u.username ELSE u2.username END as username,
        CASE WHEN f.requester_id = ? THEN u.wins ELSE u2.wins END as wins,
        CASE WHEN f.requester_id = ? THEN u.losses ELSE u2.losses END as losses
      FROM friendships f
      JOIN users u ON f.addressee_id = u.id
      JOIN users u2 ON f.requester_id = u2.id
      WHERE (f.requester_id = ? OR f.addressee_id = ?) AND f.status = 'accepted'
    `).all(req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id);

    // Deduplicate and clean up
    const result = friends.map(f => ({
      friendshipId: f.friendship_id,
      id: f.user_id,
      username: f.username,
      wins: f.wins,
      losses: f.losses,
    }));

    res.json({ friends: result });
  } catch (err) {
    console.error('Friends list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/friends/requests - incoming pending requests
router.get('/requests', authenticateToken, (req, res) => {
  try {
    const requests = db.prepare(`
      SELECT f.id, u.id as user_id, u.username, f.created_at
      FROM friendships f
      JOIN users u ON f.requester_id = u.id
      WHERE f.addressee_id = ? AND f.status = 'pending'
      ORDER BY f.created_at DESC
    `).all(req.user.id);

    res.json({ requests });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/friends/search?q=query - search users
router.get('/search', authenticateToken, (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 1) return res.json({ users: [] });

    const users = db.prepare(`
      SELECT 
        u.id, u.username, u.wins, u.losses,
        f.id as friendship_id,
        f.status as friendship_status,
        f.requester_id
      FROM users u
      LEFT JOIN friendships f ON (
        (f.requester_id = ? AND f.addressee_id = u.id) OR
        (f.requester_id = u.id AND f.addressee_id = ?)
      )
      WHERE u.username LIKE ? AND u.id != ?
      LIMIT 10
    `).all(req.user.id, req.user.id, `%${q}%`, req.user.id);

    const enriched = users.map(u => {
      let relation = 'none';
      if (u.friendship_status === 'accepted') {
        relation = 'friends';
      } else if (u.friendship_status === 'pending') {
        relation = u.requester_id === req.user.id ? 'pending_sent' : 'pending_received';
      }
      return {
        id: u.id,
        username: u.username,
        wins: u.wins,
        losses: u.losses,
        relation,
        friendshipId: u.friendship_id,
      };
    });

    res.json({ users: enriched });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/friends/request - send friend request
router.post('/request', authenticateToken, (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: 'Username required' });

  try {
    const target = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.id === req.user.id) return res.status(400).json({ error: 'Cannot friend yourself' });

    // Check if already friends or pending
    const existing = db.prepare(`
      SELECT id, status FROM friendships 
      WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)
    `).get(req.user.id, target.id, target.id, req.user.id);

    if (existing) {
      if (existing.status === 'accepted') return res.status(409).json({ error: 'Already friends' });
      return res.status(409).json({ error: 'Friend request already pending' });
    }

    const result = db.prepare(
      'INSERT INTO friendships (requester_id, addressee_id, status) VALUES (?, ?, ?)'
    ).run(req.user.id, target.id, 'pending');

    res.status(201).json({ id: result.lastInsertRowid, message: 'Friend request sent' });
  } catch (err) {
    console.error('Friend request error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/friends/accept
router.post('/accept', authenticateToken, (req, res) => {
  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: 'Request ID required' });

  try {
    const friendship = db.prepare('SELECT * FROM friendships WHERE id = ? AND addressee_id = ? AND status = ?')
      .get(id, req.user.id, 'pending');
    if (!friendship) return res.status(404).json({ error: 'Request not found' });

    db.prepare('UPDATE friendships SET status = ? WHERE id = ?').run('accepted', id);
    res.json({ message: 'Friend request accepted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/friends/decline
router.post('/decline', authenticateToken, (req, res) => {
  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: 'Request ID required' });

  try {
    const result = db.prepare(
      'DELETE FROM friendships WHERE id = ? AND addressee_id = ? AND status = ?'
    ).run(id, req.user.id, 'pending');

    if (result.changes === 0) return res.status(404).json({ error: 'Request not found' });
    res.json({ message: 'Request declined' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/friends/:id - remove a friend
router.delete('/:id', authenticateToken, (req, res) => {
  const friendshipId = parseInt(req.params.id);

  try {
    const result = db.prepare(
      'DELETE FROM friendships WHERE id = ? AND (requester_id = ? OR addressee_id = ?)'
    ).run(friendshipId, req.user.id, req.user.id);

    if (result.changes === 0) return res.status(404).json({ error: 'Friendship not found' });
    res.json({ message: 'Friend removed' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
