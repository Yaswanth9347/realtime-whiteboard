// server/src/utils/jwtUtils.js
const jwt = require('jsonwebtoken');

const generateRoomToken = (roomId, userId, secret, expiresIn = '24h') => {
  const payload = { roomId, userId, type: 'room_access' };
  return jwt.sign(payload, secret, { expiresIn });
};

const verifyRoomToken = (token, secret) => {
  try {
    const decoded = jwt.verify(token, secret);
    if (decoded.type !== 'room_access') throw new Error('Invalid token type');
    return decoded;
  } catch (err) {
    return null;
  }
};

module.exports = { generateRoomToken, verifyRoomToken };
