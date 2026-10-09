import { describe, it, expect } from 'vitest';
import db from '../db.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

describe('Server Database & Models', () => {
  it('should create and retrieve users correctly', async () => {
    const testUser = `test_${Date.now()}`;
    const hash = await bcrypt.hash('password123', 10);
    const res = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(testUser, hash);

    const user = db.prepare('SELECT id, username, wins, losses FROM users WHERE id = ?').get(res.lastInsertRowid);
    expect(user).toBeDefined();
    expect(user.username.toLowerCase()).toBe(testUser.toLowerCase());
    expect(user.wins).toBe(0);
    expect(user.losses).toBe(0);

    // Verify lookup by numeric ID
    const userById = db.prepare('SELECT id, username FROM users WHERE id = ?').get(user.id);
    expect(userById).toBeDefined();
    expect(userById.id).toBe(user.id);

    // Verify user is persistent and not deleted
    const count = db.prepare('SELECT count(*) as count FROM users WHERE id = ?').get(user.id);
    expect(count.count).toBe(1);
  });

  it('should sign and verify valid JWT tokens', () => {
    const token = jwt.sign({ id: 999, username: 'tester' }, JWT_SECRET, { expiresIn: '1h' });
    const decoded = jwt.verify(token, JWT_SECRET);
    expect(decoded.id).toBe(999);
    expect(decoded.username).toBe('tester');
  });

  it('should query leaderboard ordered by wins descending', () => {
    const leaders = db.prepare('SELECT id, username, wins, losses FROM users ORDER BY wins DESC, losses ASC LIMIT 5').all();
    expect(Array.isArray(leaders)).toBe(true);
    if (leaders.length >= 2) {
      expect(leaders[0].wins).toBeGreaterThanOrEqual(leaders[1].wins);
    }
  });

  it('should insert and query matches', () => {
    // create two dummy users
    const u1 = `p1_${Date.now()}`;
    const u2 = `p2_${Date.now()}`;
    const hash = 'dummy_hash';
    const r1 = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(u1, hash);
    const r2 = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(u2, hash);

    const mRes = db.prepare('INSERT INTO matches (player1_id, player2_id) VALUES (?, ?)').run(r1.lastInsertRowid, r2.lastInsertRowid);
    expect(mRes.lastInsertRowid).toBeGreaterThan(0);

    // update with winner
    db.prepare(`
      UPDATE matches SET score1 = 7, score2 = 4, winner_id = ?, ended_at = datetime('now') WHERE id = ?
    `).run(r1.lastInsertRowid, mRes.lastInsertRowid);

    const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(mRes.lastInsertRowid);
    expect(match.score1).toBe(7);
    expect(match.score2).toBe(4);
    expect(match.winner_id).toBe(r1.lastInsertRowid);
  });
});
