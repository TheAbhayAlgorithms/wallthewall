import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');
const DB_PATH = path.join(DATA_DIR, 'wallthewall.db');
const OLD_DB_PATH = path.join(DATA_DIR, 'ember_pong.db');

// Ensure data directory exists
fs.mkdirSync(DATA_DIR, { recursive: true });

// Migrate from old DB if exists and new DB doesn't exist yet
if (fs.existsSync(OLD_DB_PATH) && !fs.existsSync(DB_PATH)) {
  try {
    fs.copyFileSync(OLD_DB_PATH, DB_PATH);
    console.log('📦 Migrated existing database to wallthewall.db');
  } catch (err) {
    console.warn('Could not copy old db:', err);
  }
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS friendships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK(status IN ('pending','accepted')) DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(requester_id, addressee_id)
  );

  CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player1_id INTEGER NOT NULL REFERENCES users(id),
    player2_id INTEGER NOT NULL REFERENCES users(id),
    score1 INTEGER DEFAULT 0,
    score2 INTEGER DEFAULT 0,
    winner_id INTEGER REFERENCES users(id),
    ended_at TEXT,
    forfeit INTEGER DEFAULT 0
  );
`);

export default db;
