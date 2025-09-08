// client/src/components/DrawingCanvas/RoomControls.jsx
import React, { useState } from 'react';
import './RoomControls.css';

/**
 * RoomControls
 * Basic UI for creating/joining/leaving rooms.
 *
 * Props:
 *  - roomState: from useRoom (contains roomId, roomCode, isJoined, users, isHost)
 *  - roomError: string|null
 *  - createRoom: () => void
 *  - joinRoom: (roomCode, username) => void
 *  - leaveRoom: () => void
 */
const RoomControls = ({ roomState, roomError, createRoom, joinRoom, leaveRoom }) => {
  const [username, setUsername] = useState('');
  const [roomCodeInput, setRoomCodeInput] = useState('');

  if (roomState.isJoined) {
    return (
      <div className="room-controls joined">
        <p>
          Joined room <strong>{roomState.roomCode}</strong>{' '}
          {roomState.isHost && <span className="host-badge">Host</span>}
        </p>
        <button onClick={leaveRoom} className="leave-btn">
          Leave Room
        </button>
      </div>
    );
  }

  return (
    <div className="room-controls">
      <h3>Room Controls</h3>
      {roomError && <div className="error-msg">⚠ {roomError}</div>}

      <div className="field">
        <label htmlFor="username">Username:</label>
        <input
          id="username"
          type="text"
          value={username}
          placeholder="Enter your name"
          onChange={(e) => setUsername(e.target.value)}
        />
      </div>

      <div className="actions">
        <button
          className="create-btn"
          onClick={() => {
            if (username.trim()) {
              createRoom();
            }
          }}
          disabled={!username.trim()}
        >
          ➕ Create Room
        </button>
      </div>

      <div className="join-section">
        <label htmlFor="room-code">Room Code:</label>
        <input
          id="room-code"
          type="text"
          value={roomCodeInput}
          placeholder="ABC123"
          maxLength={6}
          onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
        />
        <button
          className="join-btn"
          onClick={() => {
            if (roomCodeInput.trim() && username.trim()) {
              joinRoom(roomCodeInput, username.trim());
            }
          }}
          disabled={!roomCodeInput.trim() || !username.trim()}
        >
          🔑 Join Room
        </button>
      </div>
    </div>
  );
};

export default RoomControls;
