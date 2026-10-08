import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import db from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';
const BCRYPT_ROUNDS = 10;

// Rate limiting map (simple in-memory)
const loginAttempts = new Map();
function rateLimit(ip) {
  const now = Date.now();
  const attempts = loginAttempts.get(ip) || [];
  const recent = attempts.filter(t => now - t < 60000); // last 1 min
  if (recent.length >= 10) return true; // blocked
  recent.push(now);
  loginAttempts.set(ip, recent);
  return false;
}

// Validation helpers
function validateUsername(username) {
  if (!username || typeof username !== 'string') return 'Username is required';
  if (username.length < 3 || username.length > 16) return 'Username must be 3-16 characters';
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return 'Username can only contain letters, numbers, and underscores';
  return null;
}

function validatePassword(password) {
  if (!password || typeof password !== 'string') return 'Password is required';
  if (password.length < 8) return 'Password must be at least 8 characters';
  return null;
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const ip = req.ip;
  if (rateLimit(ip)) return res.status(429).json({ error: 'Too many requests. Try again later.' });

  const { username, password } = req.body || {};

  const usernameError = validateUsername(username);
  if (usernameError) return res.status(400).json({ error: usernameError, field: 'username' });

  const passwordError = validatePassword(password);
  if (passwordError) return res.status(400).json({ error: passwordError, field: 'password' });

  try {
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) return res.status(409).json({ error: 'Username already taken', field: 'username' });

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);

    const token = jwt.sign({ id: result.lastInsertRowid, username }, JWT_SECRET, { expiresIn: '7d' });
    const user = db.prepare('SELECT id, username, wins, losses, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({ token, user });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const ip = req.ip;
  if (rateLimit(ip)) return res.status(429).json({ error: 'Too many requests. Try again later.' });

  const { username, password } = req.body || {};

  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  try {
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    const safeUser = { id: user.id, username: user.username, wins: user.wins, losses: user.losses, created_at: user.created_at };

    res.json({ token, user: safeUser });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, (req, res) => {
  try {
    const user = db.prepare('SELECT id, username, wins, losses, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
