// client/src/App.js
import React, { useState } from 'react';
import DrawingCanvas from './components/DrawingCanvas/DrawingCanvas';
import ConnectionStatus from './components/ConnectionStatus';
import './App.css'; // Optional styling

const App = () => {
  const [roomId, setRoomId] = useState(null);
  const [username, setUsername] = useState('');
  const [joined, setJoined] = useState(false);

  // Handle join room
  const handleJoinRoom = (id) => {
    if (id && username.trim()) {
      setRoomId(id.toUpperCase());
      setJoined(true);
    }
  };

  if (!joined) {
    // Simple room join/create UI
    return (
      <div className="app-join">
        <h1>Realtime Whiteboard</h1>
        <input
          type="text"
          placeholder="Enter username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          type="text"
          placeholder="Enter room code"
          onChange={(e) => setRoomId(e.target.value.toUpperCase())}
          value={roomId || ''}
          maxLength={6}
          style={{ textTransform: 'uppercase' }}
        />
        <button
          disabled={!roomId || !username.trim()}
          onClick={() => handleJoinRoom(roomId)}
        >
          Join Room
        </button>
      </div>
    );
  }

  // Main whiteboard view when joined
  return (
    <>
      <ConnectionStatus roomId={roomId} username={username} />
      <DrawingCanvas roomId={roomId} username={username} />
    </>
  );
};

export default App;
