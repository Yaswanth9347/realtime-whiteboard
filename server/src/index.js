// server/src/index.js

// Load env vars from .env if present
require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const DatabaseManager = require('./database/DatabaseManager');
const SocketManager = require('./socket/SocketManager');

console.log('Starting backend server...');

const app = express();
const server = http.createServer(app);

// Fail fast if critical secrets are missing
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set. Please set JWT_SECRET in your environment (.env or container).');
  process.exit(1);
}

// Security middleware
app.use(helmet());

// Basic JSON parsing
app.use(express.json());

// Basic HTTP rate limiter for /api endpoints
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200, // max requests per IP per windowMs (tunable)
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// Build allowed origins list from env
// Accepts either CLIENT_URL or comma-separated CORS_ORIGINS
const rawOrigins = (process.env.CORS_ORIGINS || process.env.CLIENT_URL || 'http://localhost:3000')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Add localhost for convenience if not already present (development)
if (!rawOrigins.includes('http://localhost:3000')) {
  rawOrigins.push('http://localhost:3000');
}

const allowedOrigins = Array.from(new Set(rawOrigins)); // unique

console.log('CORS allowed origins:', allowedOrigins);

// CORS configuration
const corsOptions = {
  origin: (origin, callback) => {
    // allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    console.warn(`Blocked CORS request from: ${origin}`);
    return callback(new Error('CORS policy: Origin not allowed'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
};

// Use CORS for HTTP endpoints
app.use(cors(corsOptions));

// Initialize database (pool)
const db = new DatabaseManager({
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
  database: process.env.DB_NAME || 'whiteboard_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password'
});

// Mount API routes (rooms router should live at ./routes/rooms.js)
try {
  const roomsRouter = require('./routes/rooms');
  app.use('/api/rooms', roomsRouter);
} catch (err) {
  console.warn('Warning: /routes/rooms not found or failed to load. Ensure routes/rooms.js exists if you need room HTTP APIs.', err.message);
}

// Socket.IO server with matching CORS origins
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  },
  // Connection timeout and ping settings
  pingTimeout: 60000,
  pingInterval: 25000,
  // Enable compression
  compression: true,
  // Message size limits
  maxHttpBufferSize: 1e6 // 1MB
});

// Initialize socket manager (passes the io and db)
const socketManager = new SocketManager(io, db);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    connections: io.engine.clientsCount,
    rooms: (socketManager && socketManager.rooms) ? socketManager.rooms.size : 0,
    env: process.env.NODE_ENV || 'development'
  });
});

// Generic error handler for express (returns JSON)
app.use((err, req, res, next) => {
  console.error('Express error:', err && err.message ? err.message : err);
  if (res.headersSent) return next(err);
  const status = err && err.status ? err.status : 500;
  res.status(status).json({ error: err.message || 'Internal Server Error' });
});

const PORT = process.env.PORT || 5000;

// Start listening on all network interfaces to allow Docker port mapping
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});

// Periodic cleanup of expired rooms (from DB) - runs every hour
setInterval(async () => {
  try {
    if (db && typeof db.cleanupExpiredRooms === 'function') {
      await db.cleanupExpiredRooms();
      console.log('Expired rooms cleaned up');
    }
  } catch (err) {
    console.error('Error cleaning expired rooms:', err);
  }
}, 60 * 60 * 1000); // Every hour

// Graceful shutdown
const shutdown = () => {
  console.log('Shutting down server...');
  // stop accepting new connections
  server.close(() => {
    console.log('HTTP server closed.');
    // close DB pool if available
    if (db && typeof db.pool?.end === 'function') {
      db.pool.end().then(() => {
        console.log('DB pool closed.');
        process.exit(0);
      }).catch((e) => {
        console.error('Error closing DB pool', e);
        process.exit(1);
      });
    } else {
      process.exit(0);
    }
  });

  // force exit if not closed within timeout
  setTimeout(() => {
    console.error('Forcing shutdown due to timeout.');
    process.exit(1);
  }, 30 * 1000).unref();
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Capture unhandled exceptions and rejections (log and keep running)
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  // depending on severity you may want to call shutdown()
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  // depending on severity you may want to call shutdown()
});
