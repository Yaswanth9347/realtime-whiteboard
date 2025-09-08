// server/routes/rooms.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const validator = require('validator');
const DatabaseManager = require('../database/DatabaseManager');
const { generateRoomToken } = require('../utils/jwtUtils');

const router = express.Router();
const db = new DatabaseManager({
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
  database: process.env.DB_NAME || 'whiteboard_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password'
});

/**
 * Utility: generate a human-friendly 6-char room code
 */
function makeRoomCode() {
  return (Math.random().toString(36).slice(2, 8)).toUpperCase();
}

/**
 * Safe sanitize username: trim, escape, cap length
 */
function sanitizeUsername(raw) {
  if (!raw && raw !== '') return null;
  let s = String(raw).trim().slice(0, 64); // cap to 64 chars
  s = validator.escape(s); // escape HTML chars
  // collapse whitespace
  s = s.replace(/\s+/g, ' ');
  if (s.length === 0) return null;
  return s;
}

/**
 * Create room
 * - retries a few times to handle rare room_code collisions
 */
router.post('/', async (req, res) => {
  try {
    const maxAttempts = 5;
    let attempts = 0;
    let createdRoom = null;

    while (attempts < maxAttempts && !createdRoom) {
      attempts += 1;
      const roomId = uuidv4();
      const roomCode = makeRoomCode();

      try {
        const room = await db.createRoom(roomId, roomCode);
        createdRoom = room || { id: roomId, room_code: roomCode };
      } catch (err) {
        // If unique violation on room_code, retry. Otherwise abort.
        // Postgres unique violation code is '23505'
        const isUniqueViolation = err && (err.code === '23505' || (err.message && err.message.toLowerCase().includes('unique')));
        if (!isUniqueViolation) {
          console.error('Create room DB error:', err);
          return res.status(500).json({ error: 'Failed to create room' });
        }
        // else collision: loop and try again
      }
    }

    if (!createdRoom) {
      return res.status(500).json({ error: 'Could not generate unique room code' });
    }

    // create a temporary userId for the creator session
    const userId = uuidv4();
    const token = generateRoomToken(createdRoom.id || uuidv4(), userId, process.env.JWT_SECRET, process.env.JWT_EXPIRY || '24h');

    return res.status(201).json({
      roomId: createdRoom.id || null,
      roomCode: createdRoom.room_code,
      token,
      userId
    });
  } catch (err) {
    console.error('Create room error:', err);
    return res.status(500).json({ error: 'failed to create room' });
  }
});

/**
 * Join room
 * Expect body: { roomCode: string, username?: string }
 */
router.post('/join', async (req, res) => {
  try {
    const rawRoomCode = req.body && req.body.roomCode ? String(req.body.roomCode).trim().toUpperCase() : '';
    const rawUsername = req.body && typeof req.body.username !== 'undefined' ? req.body.username : '';

    if (!rawRoomCode) {
      return res.status(400).json({ error: 'roomCode is required' });
    }

    // Validate room code format (alphanumeric, reasonable length)
    if (!validator.isAlphanumeric(rawRoomCode) || rawRoomCode.length > 10) {
      return res.status(400).json({ error: 'invalid room code' });
    }

    const dbRoom = await db.findRoomByCode(rawRoomCode);
    if (!dbRoom) {
      return res.status(404).json({ error: 'Room not found or expired' });
    }

    // Sanitize username
    let safeUsername = sanitizeUsername(rawUsername) || `Guest${uuidv4().slice(0, 6)}`;

    const userId = uuidv4();
    const token = generateRoomToken(dbRoom.id, userId, process.env.JWT_SECRET, process.env.JWT_EXPIRY || '24h');

    // Best-effort: add session to DB, but don't block join if DB fails.
    try {
      await db.addUserToRoom(dbRoom.id, userId);
    } catch (dbErr) {
      console.warn('Non-fatal: addUserToRoom failed:', dbErr?.message || dbErr);
    }

    return res.status(200).json({
      roomId: dbRoom.id,
      roomCode: dbRoom.room_code,
      token,
      userId,
      username: safeUsername,
      createdAt: dbRoom.created_at
    });
  } catch (err) {
    console.error('Join room error:', err);
    return res.status(500).json({ error: 'failed to join room' });
  }
});

module.exports = router;
