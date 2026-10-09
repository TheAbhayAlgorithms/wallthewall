import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';
import { setupSockets } from './sockets/index.js';
import authRoutes from './routes/auth.js';
import friendsRoutes from './routes/friends.js';
import matchesRoutes from './routes/matches.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

const app = express();
const httpServer = createServer(app);

// CORS - support both localhost and 127.0.0.1
app.use(cors({
  origin: (origin, callback) => {
    callback(null, true); // Permissive for local dev across 127.0.0.1 and localhost
  },
  credentials: true,
}));

app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/matches', matchesRoutes);

// User profile endpoint
app.get('/api/users/:username', (req, res) => {
  try {
    const user = db.prepare('SELECT id, username, wins, losses, created_at FROM users WHERE username = ?')
      .get(req.params.username);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Leaderboard
app.get('/api/leaderboard', (req, res) => {
  try {
    const leaders = db.prepare('SELECT id, username, wins, losses FROM users ORDER BY wins DESC, losses ASC LIMIT 10').all();
    res.json({ leaderboard: leaders });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      callback(null, true);
    },
    credentials: true,
  },
});

setupSockets(io, db);

httpServer.listen(PORT, () => {
  console.log(`🧱 WALL THE WALL server running on port ${PORT}`);
  console.log(`   CORS enabled for: ${CLIENT_URL}`);
});
