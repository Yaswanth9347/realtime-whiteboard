const { generateRoomToken, verifyRoomToken } = require('../src/utils/jwtUtils');

describe('jwtUtils', () => {
  it('generates and verifies token', () => {
    const secret = 'test-secret';
    const token = generateRoomToken('room1', 'user1', secret, '1h');
    const decoded = verifyRoomToken(token, secret);
    expect(decoded).toBeTruthy();
    expect(decoded.roomId).toBe('room1');
    expect(decoded.userId).toBe('user1');
  });
});
