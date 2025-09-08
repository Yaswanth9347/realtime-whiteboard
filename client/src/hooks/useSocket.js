import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

/**
 * useSocket hook
 *
 * Usage:
 *   const { socket, connectSocket, disconnectSocket, isConnected } = useSocket({ wsUrl });
 *   // after obtaining server token:
 *   connectSocket(token);
 *
 * Notes:
 * - Token must be obtained from server (POST /api/rooms or /api/rooms/join).
 * - Token is kept in sessionStorage for the session lifetime (optional).
 */
export default function useSocket({ wsUrl } = {}) {
  const socketRef = useRef(null);
  const heartbeatRef = useRef(null);
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  // Connect with a JWT token (call this AFTER you get token from server)
  const connectSocket = useCallback((token) => {
    if (!token || typeof token !== 'string') {
      throw new Error('connectSocket requires a token string');
    }

    // if already connected, no-op
    if (socketRef.current && socketRef.current.connected) {
      return socketRef.current;
    }

    // create socket with auth token
    const endpoint = wsUrl || process.env.REACT_APP_WS_URL || 'http://localhost:5000';
    const s = io(endpoint, {
      transports: ['websocket', 'polling'],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 5000,
      autoConnect: true
    });

    socketRef.current = s;
    setSocket(s);
    setConnectionError(null);

    // attach handlers
    s.on('connect', () => {
      setIsConnected(true);
      setConnectionError(null);
      setReconnectAttempts(0);
      // start heartbeat
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = setInterval(() => {
        try {
          if (socketRef.current?.connected) socketRef.current.emit('ping');
        } catch (e) {
          // ignore
        }
      }, 30000); // every 30s
    });

    s.on('disconnect', (reason) => {
      setIsConnected(false);
      // do not reveal token in logs
      console.info('Socket disconnected:', reason);
      // leave heartbeat running; it will be cleared on final cleanup
    });

    s.on('connect_error', (err) => {
      console.warn('Socket connect_error:', err?.message || err);
      setConnectionError(err?.message || 'connect_error');
      setReconnectAttempts((n) => n + 1);
    });

    s.on('reconnect', (attemptNumber) => {
      setIsConnected(true);
      setConnectionError(null);
      setReconnectAttempts(0);
      console.info('Socket reconnected after', attemptNumber, 'attempts');
    });

    s.on('reconnect_failed', () => {
      console.error('Socket failed to reconnect');
      setConnectionError('Failed to reconnect to server');
    });

    // optional: respond to server pong
    s.on('pong', () => {
      // server alive
    });

    // persist token in session for page-refresh within the same tab (optional)
    try {
      sessionStorage.setItem('roomToken', token);
    } catch (e) {
      // ignore if storage is blocked
    }

    return s;
  }, [wsUrl]);

  // disconnect & cleanup
  const disconnectSocket = useCallback(() => {
    try {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    } catch (e) {
      // ignore
    } finally {
      setSocket(null);
      setIsConnected(false);
      setConnectionError(null);
      setReconnectAttempts(0);
      try { sessionStorage.removeItem('roomToken'); } catch (e) { /* ignore */ }
    }
  }, []);

  // on mount: auto-connect if a token exists in sessionStorage
  useEffect(() => {
    const token = (() => {
      try { return sessionStorage.getItem('roomToken'); } catch (e) { return null; }
    })();
    if (token && !socketRef.current) {
      // attempt connection; ignore thrown errors here
      try { connectSocket(token); } catch (e) { /* ignore */ }
    }

    return () => {
      // cleanup on unmount
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      if (socketRef.current) {
        try { socketRef.current.disconnect(); } catch (e) { /* ignore */ }
        socketRef.current = null;
      }
    };
  }, [connectSocket]); // run once

  return {
    socket,
    isConnected,
    connectionError,
    reconnectAttempts,
    connectSocket,
    disconnectSocket
  };
}