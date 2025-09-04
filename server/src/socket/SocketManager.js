// server/src/socket/socketManager.js
const { v4: uuidv4 } = require('uuid');
const { generateRoomToken, verifyRoomToken } = require('../utils/jwtUtils');

class SocketManager {
  constructor(io, db) {
    this.io = io;
    this.db = db;
    this.rooms = new Map();   // In-memory room state
    this.users = new Map();   // Track connected users

    // Enforce JWT auth on socket connections
    this.io.use((socket, next) => {
      const token = socket.handshake.auth.token;
      const decoded = verifyRoomToken(token, process.env.JWT_SECRET);
      if (!decoded) {
        return next(new Error('Authentication error'));
      }
      socket.roomId = decoded.roomId;
      socket.userId = decoded.userId;
      socket.role = decoded.role || 'participant'; // Default role
      next();
    });

    this.setupSocketHandlers();
  }

  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`User connected: ${socket.id}`);

      // Initialize user data
      this.users.set(socket.id, {
        id: socket.id,
        roomId: null,
        username: null,
        cursor: { x: 0, y: 0 },
        lastSeen: Date.now()
      });

      // Room Management
      socket.on('create-room', () => this.handleCreateRoom(socket));
      socket.on('join-room', (data) => this.handleJoinRoom(socket, data));
      socket.on('leave-room', () => this.handleLeaveRoom(socket));

      // Drawing Events
      socket.on('drawing-start', (data) => this.handleDrawingStart(socket, data));
      socket.on('drawing-data', (data) => this.handleDrawingData(socket, data));
      socket.on('drawing-end', (data) => this.handleDrawingEnd(socket, data));
      socket.on('shape-added', (data) => this.handleShapeAdded(socket, data));
      socket.on('canvas-clear', () => this.handleCanvasClear(socket));

      // Cursor Tracking
      socket.on('cursor-move', (data) => this.handleCursorMove(socket, data));

      // Undo/Redo Events
      socket.on('undo-action', () => this.handleUndo(socket));
      socket.on('redo-action', () => this.handleRedo(socket));

      // WebRTC Signaling
      socket.on('webrtc-offer', (data) => this.handleWebRTCOffer(socket, data));
      socket.on('webrtc-answer', (data) => this.handleWebRTCAnswer(socket, data));
      socket.on('webrtc-candidate', (data) => this.handleWebRTCCandidate(socket, data));
      socket.on('webrtc-join', (data) => this.handleWebRTCJoin(socket, data));

      // Connection Management
      socket.on('ping', () => socket.emit('pong'));
      socket.on('disconnect', () => this.handleDisconnect(socket));
    });
  }

  // Room Management
  async handleCreateRoom(socket) {
    try {
      const roomId = uuidv4();
      const roomCode = this.generateRoomCode();
      const room = await this.db.createRoom(roomId, roomCode);

      const token = generateRoomToken(roomId, socket.id, process.env.JWT_SECRET, '24h');

      this.rooms.set(roomId, {
        id: roomId,
        code: roomCode,
        users: new Set([socket.id]),
        drawingHistory: [],
        undoStack: [],
        redoStack: [],
        canvasState: null,
        createdAt: new Date()
      });

      socket.join(roomId);
      this.users.get(socket.id).roomId = roomId;

      socket.emit('room-created', { roomId, roomCode, token, isHost: true });
      console.log(`Room created: ${roomCode} by ${socket.id}`);
    } catch (err) {
      console.error('Error creating room:', err);
      socket.emit('error', { message: 'Failed to create room' });
    }
  }

  async handleJoinRoom(socket, { roomCode, username }) {
    try {
      const dbRoom = await this.db.findRoomByCode(roomCode);
      if (!dbRoom) {
        socket.emit('error', { message: 'Room not found or expired' });
        return;
      }
      const roomId = dbRoom.id;
      let roomState = this.rooms.get(roomId);

      if (roomState && roomState.users.size >= dbRoom.max_users) {
        socket.emit('error', { message: 'Room is full' });
        return;
      }

      if (!roomState) {
        roomState = {
          id: roomId,
          code: roomCode,
          users: new Set(),
          drawingHistory: [],
          undoStack: [],
          redoStack: [],
          canvasState: null,
          createdAt: dbRoom.created_at
        };
        this.rooms.set(roomId, roomState);
      }

      await this.db.addUserToRoom(roomId, socket.id);

      socket.join(roomId);
      roomState.users.add(socket.id);

      const user = this.users.get(socket.id);
      user.roomId = roomId;
      user.username = username || `User${socket.id.slice(0, 6)}`;

      const token = generateRoomToken(roomId, socket.id, process.env.JWT_SECRET, '24h');

      socket.emit('room-joined', {
        roomId,
        roomCode,
        token,
        canvasState: roomState.canvasState,
        drawingHistory: roomState.drawingHistory,
        users: Array.from(roomState.users).map((uid) => ({
          id: uid,
          username: this.users.get(uid).username || 'Unknown'
        }))
      });

      socket.to(roomId).emit('user-joined', {
        userId: socket.id,
        username: user.username
      });
      console.log(`${user.username} joined room: ${roomCode}`);
    } catch (err) {
      console.error('Error joining room:', err);
      socket.emit('error', { message: 'Failed to join room' });
    }
  }

  async handleLeaveRoom(socket) {
    const user = this.users.get(socket.id);
    if (!user || !user.roomId) return;

    await this.db.removeUserFromRoom(user.roomId, socket.id);

    const roomState = this.rooms.get(user.roomId);
    if (roomState) {
      roomState.users.delete(socket.id);
      socket.leave(user.roomId);
      socket.to(user.roomId).emit('user-left', {
        userId: socket.id,
        username: user.username
      });
      if (roomState.users.size === 0) {
        this.rooms.delete(user.roomId);
        console.log(`Room ${roomState.code} deleted (empty)`);
      }
    }
    user.roomId = null;
  }

  // Drawing
  handleDrawingStart(socket, data) {
    const user = this.users.get(socket.id);
    if (!user.roomId) return;
    const evt = { type: 'drawing-start', userId: socket.id, username: user.username, timestamp: Date.now(), ...data };
    const room = this.rooms.get(user.roomId);
    room.drawingHistory.push(evt);
    room.redoStack = [];
    socket.to(user.roomId).emit('drawing-start', evt);
  }

  handleDrawingData(socket, data) {
    const user = this.users.get(socket.id);
    if (!user.roomId) return;
    const now = Date.now();
    if (!user.lastDrawTime || now - user.lastDrawTime > 16) {
      const evt = { type: 'drawing-data', userId: socket.id, timestamp: now, ...data };
      socket.to(user.roomId).emit('drawing-data', evt);
      user.lastDrawTime = now;
    }
  }

  handleDrawingEnd(socket, data) {
    const user = this.users.get(socket.id);
    if (!user.roomId) return;
    const evt = { type: 'drawing-end', userId: socket.id, username: user.username, timestamp: Date.now(), ...data };
    const room = this.rooms.get(user.roomId);
    room.undoStack.push(evt);
    if (room.undoStack.length > 50) room.undoStack.shift();
    socket.to(user.roomId).emit('drawing-end', evt);
  }

  handleShapeAdded(socket, data) {
    const user = this.users.get(socket.id);
    if (!user.roomId) return;
    const evt = { type: 'shape-added', userId: socket.id, username: user.username, timestamp: Date.now(), ...data };
    const room = this.rooms.get(user.roomId);
    room.undoStack.push(evt);
    room.redoStack = [];
    socket.to(user.roomId).emit('shape-added', evt);
  }

  handleCanvasClear(socket) {
    const user = this.users.get(socket.id);
    if (!user.roomId) return;
    const evt = { type: 'canvas-clear', userId: socket.id, username: user.username, timestamp: Date.now() };
    const room = this.rooms.get(user.roomId);
    room.undoStack.push(evt);
    room.redoStack = [];
    this.io.to(user.roomId).emit('canvas-clear', evt);
  }

  // Cursor
  handleCursorMove(socket, { x, y }) {
    const user = this.users.get(socket.id);
    if (!user.roomId) return;
    user.cursor = { x, y };
    const now = Date.now();
    if (!user.lastCursorUpdate || now - user.lastCursorUpdate > 50) {
      socket.to(user.roomId).emit('cursor-update', { userId: socket.id, username: user.username, x, y });
      user.lastCursorUpdate = now;
    }
  }

  // Undo/Redo
  handleUndo(socket) {
    const user = this.users.get(socket.id);
    if (!user.roomId) return;
    const room = this.rooms.get(user.roomId);
    if (room.undoStack.length === 0) return;
    const action = room.undoStack.pop();
    room.redoStack.push(action);
    this.io.to(user.roomId).emit('undo-action', { action });
  }

  handleRedo(socket) {
    const user = this.users.get(socket.id);
    if (!user.roomId) return;
    const room = this.rooms.get(user.roomId);
    if (room.redoStack.length === 0) return;
    const action = room.redoStack.pop();
    room.undoStack.push(action);
    this.io.to(user.roomId).emit('redo-action', { action });
  }

  // WebRTC
  handleWebRTCJoin(socket, { roomId }) {
    socket.to(roomId).emit('user-joined', { userId: socket.id });
  }

  handleWebRTCOffer(socket, { target, offer }) {
    socket.to(target).emit('webrtc-offer', { from: socket.id, offer });
  }

  handleWebRTCAnswer(socket, { target, answer }) {
    socket.to(target).emit('webrtc-answer', { from: socket.id, answer });
  }

  handleWebRTCCandidate(socket, { target, candidate }) {
    socket.to(target).emit('webrtc-candidate', { from: socket.id, candidate });
  }

  // Disconnect
  handleDisconnect(socket) {
    const user = this.users.get(socket.id);
    if (user) {
      if (user.roomId) this.handleLeaveRoom(socket);
      this.users.delete(socket.id);
      console.log(`User disconnected: ${user.username || socket.id}`);
    }
  }

  // Cleanup
  cleanupInactiveRooms() {
    const now = Date.now();
    const TIMEOUT = 24 * 60 * 60 * 1000;
    for (const [id, room] of this.rooms) {
      if (room.users.size === 0 && now - room.createdAt.getTime() > TIMEOUT) {
        this.rooms.delete(id);
        console.log(`Cleaned up inactive room: ${room.code}`);
      }
    }
  }

  // Utility
  generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from({ length: 6 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
  }
}

module.exports = SocketManager;
