// server/src/index.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const DatabaseManager = require('./database/DatabaseManager');
const SocketManager = require('./socket/SocketManager');

const app = express();
const server = http.createServer(app);

// CORS configuration
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  },
  // Connection timeout and ping settings[17]
  pingTimeout: 60000,
  pingInterval: 25000,
  // Enable compression[8]
  compression: true,
  // Message size limits
  maxHttpBufferSize: 1e6 // 1MB
});

// Middleware
app.use(cors());
app.use(express.json());

// Initialize database
const db = new DatabaseManager({
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'whiteboard_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password'
});

// Initialize socket manager
const socketManager = new SocketManager(io, db);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    connections: io.engine.clientsCount,
    rooms: socketManager.rooms.size 
  });
});

// Start server
const PORT = process.env.PORT || 5000;
// server/src/index.js (after server.listen)
setInterval(async () => {
  try {
    await db.cleanupExpiredRooms();
    console.log('Expired rooms cleaned up');
  } catch (err) {
    console.error('Error cleaning expired rooms:', err);
  }
}, 60 * 60 * 1000); // Every hour

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  server.close();
  process.exit(0);
});
