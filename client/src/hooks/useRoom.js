// client/src/hooks/useRoom.js
import { useState, useCallback, useEffect } from 'react';

export const useRoom = (socket) => {
  const [roomState, setRoomState] = useState({
    roomId: null,
    roomCode: null,
    isHost: false,
    users: [],
    isJoined: false
  });
  const [roomError, setRoomError] = useState(null);

  // Room event handlers
  useEffect(() => {
    if (!socket) return;

    socket.on('room-created', ({ roomId, roomCode, isHost }) => {
      setRoomState({
        roomId,
        roomCode,
        isHost,
        users: [{ id: socket.id, username: 'You' }],
        isJoined: true
      });
      setRoomError(null);
    });

    socket.on('room-joined', ({ roomId, roomCode, users, canvasState, drawingHistory }) => {
      setRoomState({
        roomId,
        roomCode,
        isHost: false,
        users,
        isJoined: true
      });
      setRoomError(null);
      
      // Restore canvas state and drawing history
      if (canvasState) {
        // Trigger canvas restoration
        socket.emit('canvas-state-received', { canvasState, drawingHistory });
      }
    });

    socket.on('user-joined', ({ userId, username }) => {
      setRoomState(prev => ({
        ...prev,
        users: [...prev.users, { id: userId, username }]
      }));
    });

    socket.on('user-left', ({ userId, username }) => {
      setRoomState(prev => ({
        ...prev,
        users: prev.users.filter(user => user.id !== userId)
      }));
    });

    socket.on('error', ({ message }) => {
      setRoomError(message);
    });

    return () => {
      socket.off('room-created');
      socket.off('room-joined');
      socket.off('user-joined');
      socket.off('user-left');
      socket.off('error');
    };
  }, [socket]);

  const createRoom = useCallback(() => {
    if (socket?.connected) {
      socket.emit('create-room');
    }
  }, [socket]);

  const joinRoom = useCallback((roomCode, username) => {
    if (socket?.connected) {
      socket.emit('join-room', { roomCode, username });
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
    }
  }, [socket, roomState.isJoined]);

  return {
    roomState,
    roomError,
    createRoom,
    joinRoom,
    leaveRoom
  };
};
