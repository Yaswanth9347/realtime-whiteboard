// server/src/database/DatabaseManager.js
const { Pool } = require('pg');

class DatabaseManager {
  constructor(config) {
    this.pool = new Pool(config);
  }

  // Create a new room with a unique code
  async createRoom(roomId, roomCode) {
    const result = await this.pool.query(
      `INSERT INTO rooms (id, room_code) VALUES ($1, $2)
       RETURNING id, room_code, created_at, expires_at, max_users`,
      [roomId, roomCode]
    );
    return result.rows[0];
  }

  // Find room by code, ensure not expired
  async findRoomByCode(roomCode) {
    const result = await this.pool.query(
      `SELECT id, room_code, created_at, expires_at, max_users
       FROM rooms
       WHERE room_code = $1
         AND expires_at > NOW()`,
      [roomCode]
    );
    return result.rows[0];
  }

  // Add a user session when joining a room
  async addUserToRoom(roomId, userId) {
    await this.pool.query(
      `INSERT INTO room_sessions (room_id, user_id)
       VALUES ($1, $2)`,
      [roomId, userId]
    );
  }

  // Mark a user session inactive upon leaving
  async removeUserFromRoom(roomId, userId) {
    await this.pool.query(
      `UPDATE room_sessions
       SET is_active = FALSE
       WHERE room_id = $1 AND user_id = $2`,
      [roomId, userId]
    );
  }

  // Clean up expired rooms and their sessions
  async cleanupExpiredRooms() {
    await this.pool.query(
      `DELETE FROM rooms
       WHERE expires_at <= NOW()`
    );
  }
}

module.exports = DatabaseManager;
