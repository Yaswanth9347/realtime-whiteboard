// client/src/hooks/useRoom.js
import { useState, useCallback, useEffect, useRef } from 'react';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export const useRoom = (socket) => {
  const [roomState, setRoomState] = useState({
    roomId: null,
    roomCode: null,
    isHost: false,
    users: [],
    isJoined: false
  });
  const [roomError, setRoomError] = useState(null);
  const handlersRef = useRef({});

  // ---------- Socket event handlers (stable references) ----------
  useEffect(() => {
    if (!socket) return;

    // define handlers and save references for removal
    const onRoomCreated = ({ roomId, roomCode, isHost, token }) => {
      setRoomState({
        roomId,
        roomCode,
        isHost: Boolean(isHost),
        users: [{ id: socket.id, username: 'You' }],
        isJoined: true
      });
      setRoomError(null);
      // token may be provided; caller should handle storing/connecting if needed
    };

    const onRoomJoined = ({ roomId, roomCode, users = [], canvasState = null, drawingHistory = [] }) => {
      setRoomState({
        roomId,
        roomCode,
        isHost: false,
        users: Array.isArray(users) ? users : [],
        isJoined: true
      });
      setRoomError(null);

      // If server provided canvas state/history, emit local events for other hooks/components to consume
      // Keep this minimal: do not apply canvas here; UI components should listen for 'room-joined' as well.
      // socket.emit('canvas-state-received', { canvasState, drawingHistory });
    };

    const onUserJoined = ({ userId, username }) => {
      setRoomState((prev) => {
        // avoid duplicates
        const exists = prev.users.some(u => u.id === userId);
        if (exists) return prev;
        return {
          ...prev,
          users: [...prev.users, { id: userId, username }]
        };
      });
    };

    const onUserLeft = ({ userId }) => {
      setRoomState((prev) => ({
        ...prev,
        users: prev.users.filter(user => user.id !== userId)
      }));
    };

    const onError = (payload) => {
      // payload could be string or object { message }
      const message = payload && typeof payload === 'object' ? (payload.message || JSON.stringify(payload)) : String(payload);
      setRoomError(message);
    };

    handlersRef.current = {
      onRoomCreated,
      onRoomJoined,
      onUserJoined,
      onUserLeft,
      onError
    };

    // Attach listeners
    socket.on('room-created', onRoomCreated);
    socket.on('room-joined', onRoomJoined);
    socket.on('user-joined', onUserJoined);
    socket.on('user-left', onUserLeft);
    socket.on('error', onError);

    return () => {
      // Detach listeners cleanly using saved refs
      if (!socket) return;
      const h = handlersRef.current || {};
      socket.off('room-created', h.onRoomCreated);
      socket.off('room-joined', h.onRoomJoined);
      socket.off('user-joined', h.onUserJoined);
      socket.off('user-left', h.onUserLeft);
      socket.off('error', h.onError);
    };
  }, [socket]);

  // ---------- Socket action helpers (backwards-compatible) ----------
  const createRoom = useCallback(() => {
    if (socket?.connected) {
      socket.emit('create-room');
    } else {
      setRoomError('Socket not connected');
    }
  }, [socket]);

  const joinRoom = useCallback((roomCode, username) => {
    if (!roomCode || typeof roomCode !== 'string') {
      setRoomError('Invalid room code');
      return;
    }
    if (socket?.connected) {
      socket.emit('join-room', { roomCode: String(roomCode).trim().toUpperCase(), username: String(username || '').slice(0, 64) });
    } else {
      setRoomError('Socket not connected');
    }
  }, [socket]);

  const leaveRoom = useCallback(() => {
    if (socket?.connected && roomState.isJoined) {
      socket.emit('leave-room');
      setRoomState({
        roomId: null,
        roomCode: null,
        isHost: false,
        users: [],
        isJoined: false
      });
      setRoomError(null);
    } else {
      // local clear if not connected
      setRoomState({
        roomId: null,
        roomCode: null,
        isHost: false,
        users: [],
        isJoined: false
      });
      setRoomError(null);
    }
  }, [socket, roomState.isJoined]);

  // ---------- HTTP helpers: call server to create/join room and return session info ----------
  const createRoomApi = useCallback(async () => {
    setRoomError(null);
    try {
      const res = await fetch(`${API_BASE}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data?.error || 'Failed to create room';
        setRoomError(msg);
        throw new Error(msg);
      }
      // data: { roomId, roomCode, token, userId }
      return {
        roomId: data.roomId,
        roomCode: data.roomCode,
        token: data.token,
        userId: data.userId
      };
    } catch (err) {
      const message = err?.message || 'Create room API error';
      setRoomError(message);
      throw err;
    }
  }, []);

  const joinRoomApi = useCallback(async (roomCode, username) => {
    setRoomError(null);
    if (!roomCode || typeof roomCode !== 'string') {
      const msg = 'roomCode is required';
      setRoomError(msg);
      throw new Error(msg);
    }
    try {
      const res = await fetch(`${API_BASE}/api/rooms/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: String(roomCode).trim().toUpperCase(), username: String(username || '').slice(0, 64) })
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data?.error || 'Failed to join room';
        setRoomError(msg);
        throw new Error(msg);
      }
      // data: { roomId, roomCode, token, userId, username }
      return {
        roomId: data.roomId,
        roomCode: data.roomCode,
        token: data.token,
        userId: data.userId,
        username: data.username || null
      };
    } catch (err) {
      const message = err?.message || 'Join room API error';
      setRoomError(message);
      throw err;
    }
  }, []);

  return {
    roomState,
    roomError,
    createRoom,
    joinRoom,
    leaveRoom,
    // API helpers (call these from UI to obtain token, then call connectSocket(token))
    createRoomApi,
    joinRoomApi
  };
};
