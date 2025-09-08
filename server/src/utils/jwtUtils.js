// server/src/utils/jwtUtils.js

const jwt = require('jsonwebtoken');

/**
 * Generate a room access JWT token.
 * @param {string} roomId - Unique room identifier
 * @param {string} userId - Unique user identifier
 * @param {string} secret - JWT signing secret (from env)
 * @param {string} [expiresIn] - Expiry string, defaults to process.env.JWT_EXPIRY or '24h'
 * @returns {string} Signed JWT token
 */
const generateRoomToken = (roomId, userId, secret, expiresIn) => {
  if (!roomId || !userId) {
    throw new Error('Missing roomId or userId for JWT generation');
  }
  if (!secret) {
    throw new Error('JWT secret is missing. Set JWT_SECRET in your environment.');
  }

  const payload = {
    roomId,
    userId,
    type: 'room_access'
  };

  const expiry = expiresIn || process.env.JWT_EXPIRY || '24h';

  return jwt.sign(payload, secret, { expiresIn: expiry });
};

/**
 * Verify a room access JWT token.
 * @param {string} token - The JWT token to verify
 * @param {string} secret - JWT secret (from env)
 * @returns {object|null} Decoded payload if valid, otherwise null
 */
const verifyRoomToken = (token, secret) => {
  if (!token) {
    console.warn('JWT Verify: No token provided');
    return null;
  }
  if (!secret) {
    console.error('JWT Verify: Missing secret');
    return null;
  }

  try {
    const decoded = jwt.verify(token, secret);

    if (!decoded || decoded.type !== 'room_access') {
      console.warn('JWT Verify: Invalid token type or empty payload');
      return null;
    }

    return decoded;
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      console.warn('JWT verification failed: token expired');
    } else if (err.name === 'JsonWebTokenError') {
      console.warn('JWT verification failed: invalid token');
    } else {
      console.error('JWT verification failed:', err.message);
    }
    return null;
  }
};

module.exports = {
  generateRoomToken,
  verifyRoomToken
};
