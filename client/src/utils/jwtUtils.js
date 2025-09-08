// client/src/utils/jwtUtils.js
import jwtDecode from 'jwt-decode';

/**
 * Decode a JWT payload (no verification — just base64 decode).
 * Use server for all signing/verifying.
 * 
 * @param {string} token 
 * @returns {object|null} decoded payload or null
 */
export const decodeRoomToken = (token) => {
  if (!token || typeof token !== 'string') return null;
  try {
    const decoded = jwtDecode(token);
    return decoded;
  } catch (err) {
    console.warn('Failed to decode JWT:', err.message || err);
    return null;
  }
};
