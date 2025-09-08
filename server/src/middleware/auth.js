// server/src/middleware/auth.js
const { verifyRoomToken } = require('../utils/jwtUtils');

/**
 * Middleware to protect room-related routes with JWT authentication.
 * Expects an Authorization header in the form: "Bearer <token>"
 */
const authRoom = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header missing or malformed' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Token not provided' });
    }

    const decoded = verifyRoomToken(token, process.env.JWT_SECRET);

    if (!decoded) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    // Attach safe decoded info to request
    req.room = {
      roomId: decoded.roomId,
      userId: decoded.userId,
      role: decoded.role || 'participant'
    };

    return next();
  } catch (err) {
    console.error('Auth middleware error:', err.message || err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { authRoom };
