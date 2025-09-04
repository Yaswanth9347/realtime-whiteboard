// server/src/middleware/auth.js
const { verifyRoomToken } = require('../utils/jwtUtils');

const authRoom = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing token' });
  }
  const token = authHeader.split(' ')[1];
  const decoded = verifyRoomToken(token, process.env.JWT_SECRET);
  if (!decoded) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
  req.room = { roomId: decoded.roomId, userId: decoded.userId };
  next();
};

module.exports = { authRoom };
