// client/src/hooks/useSocket.js
import { useEffect, useRef, useCallback, useState } from 'react';
import { io } from 'socket.io-client';

export const useSocket = () => {
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  // Connection management
  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;

    // Retrieve JWT token from localStorage or your auth context/state
    const token = localStorage.getItem('jwtToken'); // Adjust if you use a different storage or method

    socketRef.current = io(process.env.REACT_APP_WS_URL || 'http://localhost:5000', {
      transports: ['websocket', 'polling'],
      timeout: 5000,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      compression: true,
      autoConnect: true,
      auth: {
        token,  // Attach the JWT token here for backend authentication
      }
    });

    // Connection event handlers
    socketRef.current.on('connect', () => {
      console.log('Connected to server');
      setIsConnected(true);
      setConnectionError(null);
      setReconnectAttempts(0);
    });

    socketRef.current.on('disconnect', (reason) => {
      console.log('Disconnected:', reason);
      setIsConnected(false);

      if (reason === 'io server disconnect') {
        // Server disconnected, try to reconnect manually
        socketRef.current.connect();
      }
    });

    socketRef.current.on('connect_error', (error) => {
      console.error('Connection error:', error);
      setConnectionError(error.message);
      setReconnectAttempts(prev => prev + 1);
    });

    socketRef.current.on('reconnect', (attemptNumber) => {
      console.log('Reconnected after', attemptNumber, 'attempts');
      setIsConnected(true);
      setConnectionError(null);
    });

    socketRef.current.on('reconnect_failed', () => {
      console.error('Failed to reconnect');
      setConnectionError('Failed to reconnect to server');
    });

    // Heartbeat to maintain connection
    const heartbeat = setInterval(() => {
      if (socketRef.current?.connected) {
        socketRef.current.emit('ping');
      }
    }, 30000); // Every 30 seconds

    socketRef.current.on('pong', () => {
      // Server responded to ping
    });

    return () => {
      clearInterval(heartbeat);
    };

  }, []);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    }
  }, []);

  // Auto connect on mount
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    socket: socketRef.current,
    isConnected,
    connectionError,
    reconnectAttempts,
    connect,
    disconnect
  };
};
