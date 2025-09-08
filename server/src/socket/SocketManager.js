// server/src/socket/SocketManager.js
const { v4: uuidv4 } = require('uuid');
const { generateRoomToken, verifyRoomToken } = require('../utils/jwtUtils');

/**
 * SocketManager
 *
 * Responsibilities:
 * - Authenticate socket connections (JWT)
 * - Manage in-memory room state and user sessions
 * - Validate and throttle drawing-related events to mitigate abuse
 * - Handle WebRTC signaling forwarding
 * - Provide undo/redo and canvas management
 */
class SocketManager {
  constructor(io, db) {
    this.io = io;
    this.db = db;

    // In-memory state
    this.rooms = new Map();   // roomId -> roomState
    this.users = new Map();   // socketId -> userState

    // Rate limiting / abuse protection
    this.rateTracker = new Map(); // socketId -> { pointsInWindow, lastWindowStart }
    this.MAX_POINTS_PER_MSG = 1000;        // maximum points allowed per drawing-data message
    this.POINTS_RATE_LIMIT = 8000;         // max points per minute per socket (tunable)
    this.CURSOR_RATE_MS = 50;              // throttle cursor updates (ms)
    this.DRAW_THROTTLE_MS = 16;            // throttle drawing-data events (ms)
    this.UNDO_STACK_LIMIT = 200;           // limit undo stack length per room

    // Enforce JWT auth on socket connections
    this.io.use((socket, next) => {
      try {
        const token = socket.handshake?.auth?.token;
        if (!token) {
          // No token provided: reject
          return next(new Error('Authentication error: token required'));
        }
        // Verify token using server-side secret
        const decoded = verifyRoomToken(token, process.env.JWT_SECRET);
        if (!decoded) {
          return next(new Error('Authentication error: invalid token'));
        }
        socket.roomId = decoded.roomId;
        socket.userId = decoded.userId;
        socket.role = decoded.role || 'participant';
        return next();
      } catch (err) {
        console.error('Socket auth failure:', err?.message || err);
        return next(new Error('Authentication error'));
      }
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
        lastSeen: Date.now(),
        lastDrawTime: 0,
        lastCursorUpdate: 0
      });

      // Room Management (legacy socket-driven create/join are still supported,
      // but recommended approach is to use HTTP /api/rooms endpoints to obtain tokens)
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

      // Undo/Redo
      socket.on('undo-action', () => this.handleUndo(socket));
      socket.on('redo-action', () => this.handleRedo(socket));

      // WebRTC Signaling
      socket.on('webrtc-offer', (data) => this.handleWebRTCOffer(socket, data));
      socket.on('webrtc-answer', (data) => this.handleWebRTCAnswer(socket, data));
      socket.on('webrtc-candidate', (data) => this.handleWebRTCCandidate(socket, data));
      socket.on('webrtc-join', (data) => this.handleWebRTCJoin(socket, data));

      // Misc
      socket.on('ping', () => socket.emit('pong'));
      socket.on('disconnect', (reason) => this.handleDisconnect(socket, reason));
    });
  }

  // ---------- Rate tracking helpers ----------
  _resetRateWindow(socketId) {
    this.rateTracker.set(socketId, { pointsInWindow: 0, lastWindowStart: Date.now() });
  }

  _trackPoints(socketId, nPoints) {
    if (!this.rateTracker.has(socketId)) {
      this._resetRateWindow(socketId);
    }
    const now = Date.now();
    const t = this.rateTracker.get(socketId);

    // if window expired (1 minute)
    if (!t.lastWindowStart || now - t.lastWindowStart > 60 * 1000) {
      t.pointsInWindow = 0;
      t.lastWindowStart = now;
    }

    t.pointsInWindow += nPoints;
    this.rateTracker.set(socketId, t);

    if (t.pointsInWindow > this.POINTS_RATE_LIMIT) return false;
    return true;
  }

  // ---------- Room management ----------
  async handleCreateRoom(socket) {
    try {
      const roomId = uuidv4();
      const roomCode = this.generateRoomCode();

      // Create in DB (if DB supports it)
      let room = null;
      try {
        room = await this.db.createRoom(roomId, roomCode);
      } catch (dbErr) {
        console.warn('DB createRoom failed, continuing with in-memory room. Error:', dbErr.message || dbErr);
      }

      // Generate a token for this socket user (note: token generation can be handled via HTTP route instead)
      const token = generateRoomToken(roomId, socket.id, process.env.JWT_SECRET, process.env.JWT_EXPIRY || '24h');

      // Create in-memory room state
      this.rooms.set(roomId, {
        id: roomId,
        code: roomCode,
        users: new Set([socket.id]),
        drawingHistory: [],
        undoStack: [],
        redoStack: [],
        canvasState: null,
        createdAt: room?.created_at ? new Date(room.created_at) : new Date()
      });

      socket.join(roomId);
      const userState = this.users.get(socket.id);
      userState.roomId = roomId;

      socket.emit('room-created', { roomId, roomCode, token, isHost: true });
      console.log(`Room created: ${roomCode} by ${socket.id}`);
    } catch (err) {
      console.error('Error creating room:', err);
      socket.emit('error', { message: 'Failed to create room' });
    }
  }

  async handleJoinRoom(socket, data) {
    try {
      // Validate input
      const roomCode = data && data.roomCode;
      const username = data && data.username;
      if (!roomCode || typeof roomCode !== 'string') {
        socket.emit('error', { message: 'Invalid room code' });
        return;
      }

      const dbRoom = await this.db.findRoomByCode(roomCode);
      if (!dbRoom) {
        socket.emit('error', { message: 'Room not found or expired' });
        return;
      }

      const roomId = dbRoom.id;
      let roomState = this.rooms.get(roomId);

      // Enforce max users if known
      if (roomState && dbRoom.max_users && roomState.users.size >= dbRoom.max_users) {
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
          createdAt: dbRoom.created_at ? new Date(dbRoom.created_at) : new Date()
        };
        this.rooms.set(roomId, roomState);
      }

      // Add session in DB (best-effort)
      try {
        await this.db.addUserToRoom(roomId, socket.id);
      } catch (dbErr) {
        console.warn('DB addUserToRoom failed (non-fatal):', dbErr.message || dbErr);
      }

      socket.join(roomId);
      roomState.users.add(socket.id);

      const user = this.users.get(socket.id);
      user.roomId = roomId;
      user.username = (username && String(username).slice(0, 64)) || `User${socket.id.slice(0, 6)}`;

      // Emit a fresh token for this session (optional)
      const token = generateRoomToken(roomId, socket.id, process.env.JWT_SECRET, process.env.JWT_EXPIRY || '24h');

      socket.emit('room-joined', {
        roomId,
        roomCode,
        token,
        canvasState: roomState.canvasState,
        drawingHistory: roomState.drawingHistory,
        users: Array.from(roomState.users).map((uid) => ({
          id: uid,
          username: this.users.get(uid)?.username || 'Unknown'
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
    try {
      const user = this.users.get(socket.id);
      if (!user || !user.roomId) return;

      try {
        await this.db.removeUserFromRoom(user.roomId, socket.id);
      } catch (dbErr) {
        console.warn('DB removeUserFromRoom failed (non-fatal):', dbErr.message || dbErr);
      }

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
    } catch (err) {
      console.error('Error leaving room:', err);
    }
  }

  // ---------- Drawing handlers with validation ----------
  handleDrawingStart(socket, data) {
    try {
      const user = this.users.get(socket.id);
      if (!user?.roomId) return;

      // Note: minimal validation for the start event
      const evt = {
        type: 'drawing-start',
        id: data && data.id ? String(data.id) : uuidv4(),
        userId: socket.id,
        username: user.username,
        timestamp: Date.now(),
        meta: data && data.meta ? data.meta : {}
      };

      const room = this.rooms.get(user.roomId);
      if (!room) return;

      room.drawingHistory.push(evt);
      room.redoStack = [];
      socket.to(user.roomId).emit('drawing-start', evt);
    } catch (err) {
      console.warn('handleDrawingStart error:', err);
    }
  }

  handleDrawingData(socket, data) {
    try {
      const user = this.users.get(socket.id);
      if (!user?.roomId) return;

      // Basic shape validation
      if (!data || !Array.isArray(data.points)) return;

      const nPoints = data.points.length;
      if (nPoints === 0) return;

      if (nPoints > this.MAX_POINTS_PER_MSG) {
        socket.emit('error', { message: 'Too many points in drawing message' });
        return;
      }

      // Rate limit check
      if (!this._trackPoints(socket.id, nPoints)) {
        socket.emit('error', { message: 'Drawing rate limit exceeded' });
        return;
      }

      // Validate point structure and ranges (avoid NaN / extreme values)
      for (let i = 0; i < data.points.length; i++) {
        const p = data.points[i];
        if (!p || typeof p.x !== 'number' || typeof p.y !== 'number' || !isFinite(p.x) || !isFinite(p.y)) {
          socket.emit('error', { message: 'Invalid point data' });
          return;
        }
        // optional range checks (reasonable canvas coordinates)
        if (Math.abs(p.x) > 100000 || Math.abs(p.y) > 100000) {
          socket.emit('error', { message: 'Point value out of range' });
          return;
        }
      }

      const now = Date.now();
      if (!user.lastDrawTime || now - user.lastDrawTime > this.DRAW_THROTTLE_MS) {
        const evt = {
          type: 'drawing-data',
          id: data.id || null,
          userId: socket.id,
          timestamp: now,
          points: data.points
        };
        socket.to(user.roomId).emit('drawing-data', evt);
        user.lastDrawTime = now;
      }
    } catch (err) {
      console.warn('handleDrawingData error:', err);
    }
  }

  handleDrawingEnd(socket, data) {
    try {
      const user = this.users.get(socket.id);
      if (!user?.roomId) return;

      const evt = {
        type: 'drawing-end',
        id: data && data.id ? String(data.id) : uuidv4(),
        userId: socket.id,
        username: user.username,
        timestamp: Date.now(),
        meta: data && data.meta ? data.meta : {}
      };

      const room = this.rooms.get(user.roomId);
      if (!room) return;

      room.undoStack.push(evt);
      if (room.undoStack.length > this.UNDO_STACK_LIMIT) room.undoStack.shift();
      // clear redo on new action
      room.redoStack = [];
      socket.to(user.roomId).emit('drawing-end', evt);
    } catch (err) {
      console.warn('handleDrawingEnd error:', err);
    }
  }

  handleShapeAdded(socket, data) {
    try {
      const user = this.users.get(socket.id);
      if (!user?.roomId) return;

      // Ensure shape has an ID (client may or may not provide)
      const shapeId = data && data.id ? String(data.id) : uuidv4();

      const evt = {
        type: 'shape-added',
        id: shapeId,
        userId: socket.id,
        username: user.username,
        timestamp: Date.now(),
        shape: data && data.shape ? data.shape : {}
      };

      const room = this.rooms.get(user.roomId);
      if (!room) return;

      room.undoStack.push(evt);
      if (room.undoStack.length > this.UNDO_STACK_LIMIT) room.undoStack.shift();
      room.redoStack = [];
      socket.to(user.roomId).emit('shape-added', evt);
    } catch (err) {
      console.warn('handleShapeAdded error:', err);
    }
  }

  handleCanvasClear(socket) {
    try {
      const user = this.users.get(socket.id);
      if (!user?.roomId) return;

      const evt = {
        type: 'canvas-clear',
        userId: socket.id,
        username: user.username,
        timestamp: Date.now()
      };

      const room = this.rooms.get(user.roomId);
      if (!room) return;

      room.undoStack.push(evt);
      if (room.undoStack.length > this.UNDO_STACK_LIMIT) room.undoStack.shift();
      room.redoStack = [];
      this.io.to(user.roomId).emit('canvas-clear', evt);
    } catch (err) {
      console.warn('handleCanvasClear error:', err);
    }
  }

  // ---------- Cursor ----------
  handleCursorMove(socket, payload) {
    try {
      const user = this.users.get(socket.id);
      if (!user?.roomId) return;
      if (!payload || typeof payload.x !== 'number' || typeof payload.y !== 'number') return;

      const now = Date.now();
      if (!user.lastCursorUpdate || now - user.lastCursorUpdate > this.CURSOR_RATE_MS) {
        user.cursor = { x: payload.x, y: payload.y };
        socket.to(user.roomId).emit('cursor-update', {
          userId: socket.id,
          username: user.username,
          x: payload.x,
          y: payload.y
        });
        user.lastCursorUpdate = now;
      }
    } catch (err) {
      console.warn('handleCursorMove error:', err);
    }
  }

  // ---------- Undo/Redo ----------
  handleUndo(socket) {
    try {
      const user = this.users.get(socket.id);
      if (!user?.roomId) return;

      const room = this.rooms.get(user.roomId);
      if (!room || !room.undoStack || room.undoStack.length === 0) return;

      const action = room.undoStack.pop();
      room.redoStack.push(action);
      this.io.to(user.roomId).emit('undo-action', { action });
    } catch (err) {
      console.warn('handleUndo error:', err);
    }
  }

  handleRedo(socket) {
    try {
      const user = this.users.get(socket.id);
      if (!user?.roomId) return;

      const room = this.rooms.get(user.roomId);
      if (!room || !room.redoStack || room.redoStack.length === 0) return;

      const action = room.redoStack.pop();
      room.undoStack.push(action);
      this.io.to(user.roomId).emit('redo-action', { action });
    } catch (err) {
      console.warn('handleRedo error:', err);
    }
  }

  // ---------- WebRTC signaling ----------
  handleWebRTCJoin(socket, { roomId }) {
    try {
      if (!roomId) return;
      socket.to(roomId).emit('user-joined', { userId: socket.id });
    } catch (err) {
      console.warn('handleWebRTCJoin error:', err);
    }
  }

  handleWebRTCOffer(socket, { target, offer }) {
    try {
      if (!target || !offer) return;
      socket.to(target).emit('webrtc-offer', { from: socket.id, offer });
    } catch (err) {
      console.warn('handleWebRTCOffer error:', err);
    }
  }

  handleWebRTCAnswer(socket, { target, answer }) {
    try {
      if (!target || !answer) return;
      socket.to(target).emit('webrtc-answer', { from: socket.id, answer });
    } catch (err) {
      console.warn('handleWebRTCAnswer error:', err);
    }
  }

  handleWebRTCCandidate(socket, { target, candidate }) {
    try {
      if (!target || !candidate) return;
      socket.to(target).emit('webrtc-candidate', { from: socket.id, candidate });
    } catch (err) {
      console.warn('handleWebRTCCandidate error:', err);
    }
  }

  // ---------- Disconnect ----------
  handleDisconnect(socket, reason) {
    try {
      const user = this.users.get(socket.id);
      if (user) {
        if (user.roomId) this.handleLeaveRoom(socket);
        this.users.delete(socket.id);
        this.rateTracker.delete(socket.id);
        console.log(`User disconnected: ${user.username || socket.id}`, reason ? `reason=${reason}` : '');
      }
    } catch (err) {
      console.warn('handleDisconnect error:', err);
    }
  }

  // ---------- Cleanup ----------
  cleanupInactiveRooms() {
    try {
      const now = Date.now();
      const TIMEOUT = 24 * 60 * 60 * 1000;
      for (const [id, room] of this.rooms) {
        const createdAt = room.createdAt instanceof Date ? room.createdAt.getTime() : (new Date(room.createdAt)).getTime();
        if ((room.users.size === 0) && (now - createdAt > TIMEOUT)) {
          this.rooms.delete(id);
          console.log(`Cleaned up inactive room: ${room.code}`);
        }
      }
    } catch (err) {
      console.warn('cleanupInactiveRooms error:', err);
    }
  }

  // ---------- Utility ----------
  generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from({ length: 6 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
  }
}

module.exports = SocketManager;
