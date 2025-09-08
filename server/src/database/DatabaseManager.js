// server/src/database/DatabaseManager.js
const { Pool } = require('pg');

class DatabaseManager {
  /**
   * @param {object} config - pg Pool config (host, port, user, password, database)
   */
  constructor(config = {}) {
    this.pool = new Pool({
      max: config.max || 10,
      idleTimeoutMillis: config.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: config.connectionTimeoutMillis || 2000,
      ...config
    });

    // Optional basic health check (non-blocking)
    this.pool.on('error', (err) => {
      console.error('Unexpected Postgres error on idle client', err);
    });
  }

  /**
   * Close the pool gracefully
   */
  async close() {
    try {
      await this.pool.end();
      console.log('Database pool has ended');
    } catch (err) {
      console.error('Error closing DB pool', err);
    }
  }

  /**
   * Create a new room with a unique code.
   * If the table has columns `expires_at` or `max_users`, they will be returned.
   *
   * @param {string} roomId
   * @param {string} roomCode
   * @param {number} [maxUsers]
   * @param {string|Date} [expiresAt] - optional expiry (ISO string or Date). If omitted, DB default should handle it.
   * @returns {object|null} inserted row or null on failure
   */
  async createRoom(roomId, roomCode, maxUsers = 20, expiresAt = null) {
    if (!roomId || !roomCode) {
      throw new Error('createRoom requires roomId and roomCode');
    }

    const columns = ['id', 'room_code', 'max_users'];
    const placeholders = ['$1', '$2', '$3'];
    const values = [roomId, roomCode, maxUsers];

    if (expiresAt) {
      columns.push('expires_at');
      placeholders.push('$4');
      values.push(expiresAt);
    }

    const sql = `
      INSERT INTO rooms (${columns.join(',')})
      VALUES (${placeholders.join(',')})
      RETURNING id, room_code, created_at, expires_at, max_users
    `;

    try {
      const result = await this.pool.query(sql, values);
      return result.rows[0] || null;
    } catch (err) {
      console.error('createRoom error:', err.message || err);
      throw err; // bubble up so callers know creation failed
    }
  }

  /**
   * Find a room by its code (ensures not expired).
   * @param {string} roomCode
   * @returns {object|null}
   */
  async findRoomByCode(roomCode) {
    if (!roomCode) return null;
    try {
      const result = await this.pool.query(
        `SELECT id, room_code, created_at, expires_at, max_users
         FROM rooms
         WHERE room_code = $1
           AND (expires_at IS NULL OR expires_at > NOW())
         LIMIT 1`,
        [roomCode]
      );
      return result.rows[0] || null;
    } catch (err) {
      console.error('findRoomByCode error:', err.message || err);
      return null;
    }
  }

  /**
   * Find a room by its id (ensures not expired).
   * @param {string} roomId
   * @returns {object|null}
   */
  async findRoomById(roomId) {
    if (!roomId) return null;
    try {
      const result = await this.pool.query(
        `SELECT id, room_code, created_at, expires_at, max_users
         FROM rooms
         WHERE id = $1
           AND (expires_at IS NULL OR expires_at > NOW())
         LIMIT 1`,
        [roomId]
      );
      return result.rows[0] || null;
    } catch (err) {
      console.error('findRoomById error:', err.message || err);
      return null;
    }
  }

  /**
   * Add a user session when joining a room. Marks is_active = true.
   * Uses upsert to avoid duplicate sessions (based on room_id + user_id).
   * @param {string} roomId
   * @param {string} userId
   */
  async addUserToRoom(roomId, userId) {
    if (!roomId || !userId) {
      throw new Error('addUserToRoom requires roomId and userId');
    }

    try {
      // Try insert; if constraint exists, update is_active to true and joined_at
      await this.pool.query(
        `
        INSERT INTO room_sessions (room_id, user_id, joined_at, is_active)
        VALUES ($1, $2, NOW(), TRUE)
        ON CONFLICT (room_id, user_id)
        DO UPDATE SET is_active = TRUE, joined_at = NOW()
        `,
        [roomId, userId]
      );
    } catch (err) {
      // If table or constraint doesn't exist, bubble up so caller can handle or log
      console.error('addUserToRoom error:', err.message || err);
      throw err;
    }
  }

  /**
   * Mark a user session inactive upon leaving
   * @param {string} roomId
   * @param {string} userId
   */
  async removeUserFromRoom(roomId, userId) {
    if (!roomId || !userId) return;
    try {
      await this.pool.query(
        `UPDATE room_sessions
         SET is_active = FALSE, left_at = NOW()
         WHERE room_id = $1 AND user_id = $2`,
        [roomId, userId]
      );
    } catch (err) {
      console.error('removeUserFromRoom error:', err.message || err);
    }
  }

  /**
   * Get active users in a room (from room_sessions)
   * @param {string} roomId
   * @returns {Array<{user_id: string, joined_at: Date}>}
   */
  async getActiveUsersInRoom(roomId) {
    if (!roomId) return [];
    try {
      const res = await this.pool.query(
        `SELECT user_id, joined_at FROM room_sessions
         WHERE room_id = $1 AND is_active = TRUE`,
        [roomId]
      );
      return res.rows || [];
    } catch (err) {
      console.error('getActiveUsersInRoom error:', err.message || err);
      return [];
    }
  }

  /**
   * Clean up expired rooms and their sessions
   * Deletes rooms where expires_at <= NOW()
   */
  async cleanupExpiredRooms() {
    try {
      await this.pool.query(
        `DELETE FROM room_sessions
         WHERE room_id IN (SELECT id FROM rooms WHERE expires_at <= NOW())`
      );
      await this.pool.query(
        `DELETE FROM rooms
         WHERE expires_at <= NOW()`
      );
    } catch (err) {
      console.error('cleanupExpiredRooms error:', err.message || err);
    }
  }
}

module.exports = DatabaseManager;
