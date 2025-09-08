// client/src/App.js
import React, { useState } from 'react';
import DrawingCanvas from './components/DrawingCanvas/DrawingCanvas';
import ConnectionStatus from './components/ConnectionStatus';
import './App.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const App = () => {
  const [roomCode, setRoomCode] = useState('');
  const [username, setUsername] = useState('');
  const [joined, setJoined] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [session, setSession] = useState(null); // { token, roomId, roomCode, userId }

  // Create a new room via server API, then save token and session
  const createRoom = async () => {
    setError('');
    if (!username.trim()) {
      setError('Please enter a username before creating a room.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create room');
      const token = data.token;
      // store in sessionStorage (not localStorage)
      sessionStorage.setItem('roomToken', token);
      const sess = {
        token,
        roomId: data.roomId,
        roomCode: data.roomCode,
        userId: data.userId
      };
      setSession(sess);
      setRoomCode(data.roomCode);
      setJoined(true);
    } catch (err) {
      console.error('createRoom error', err);
      setError(err.message || 'Create room failed');
    } finally {
      setLoading(false);
    }
  };

  // Join an existing room via server API, then save token and session
  const joinRoom = async () => {
    setError('');
    if (!username.trim()) {
      setError('Please enter a username before joining a room.');
      return;
    }
    if (!roomCode || roomCode.trim().length === 0) {
      setError('Please enter a room code to join.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/rooms/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: roomCode.trim().toUpperCase(), username: username.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to join room');
      const token = data.token;
      sessionStorage.setItem('roomToken', token);
      const sess = {
        token,
        roomId: data.roomId,
        roomCode: data.roomCode,
        userId: data.userId
      };
      setSession(sess);
      setJoined(true);
    } catch (err) {
      console.error('joinRoom error', err);
      setError(err.message || 'Join room failed');
    } finally {
      setLoading(false);
    }
  };

  // Quick UI handler to leave the room (clears state)
  const leaveRoom = () => {
    sessionStorage.removeItem('roomToken');
    setSession(null);
    setJoined(false);
    setRoomCode('');
    setUsername('');
    setError('');
  };

  if (!joined) {
    return (
      <div className="app-join" style={{ padding: 24, maxWidth: 540, margin: '40px auto' }}>
        <h1 style={{ marginBottom: 12 }}>Realtime Whiteboard</h1>

        <label style={{ display: 'block', marginBottom: 8 }}>
          <small>Username</small>
          <input
            type="text"
            placeholder="Your name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{ width: '100%', padding: 8, marginTop: 6 }}
            maxLength={64}
          />
        </label>

        <label style={{ display: 'block', marginTop: 12 }}>
          <small>Room code (6 chars) — or create a new room</small>
          <input
            type="text"
            placeholder="ABC123"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            style={{ width: '100%', padding: 8, marginTop: 6, textTransform: 'uppercase' }}
            maxLength={6}
          />
        </label>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button
            onClick={joinRoom}
            disabled={loading}
            style={{ padding: '8px 12px' }}
          >
            {loading ? 'Joining…' : 'Join Room'}
          </button>

          <button
            onClick={createRoom}
            disabled={loading}
            style={{ padding: '8px 12px' }}
          >
            {loading ? 'Creating…' : 'Create Room'}
          </button>
        </div>

        {error && <div style={{ color: 'crimson', marginTop: 12 }}>{error}</div>}

        <div style={{ marginTop: 16, color: '#666', fontSize: 13 }}>
          Tip: create a room then share the 6-char code with others.
        </div>
      </div>
    );
  }

  // session must exist if joined === true
  if (!session) {
    // fallback: show loading or error
    return (
      <div style={{ padding: 24 }}>
        <div>Preparing session…</div>
        <div>
          <button onClick={leaveRoom} style={{ marginTop: 12 }}>Back</button>
        </div>
      </div>
    );
  }

  // Main whiteboard view (pass token to DrawingCanvas for socket connect)
  return (
    <>
      <ConnectionStatus roomId={session.roomCode} username={username} />
      <DrawingCanvas
        roomId={session.roomId}
        roomCode={session.roomCode}
        username={username}
        token={session.token}
        onLeave={leaveRoom}
      />
    </>
  );
};

export default App;
