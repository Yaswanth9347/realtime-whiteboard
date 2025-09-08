import React, { useRef, useEffect, useCallback, useState } from 'react';
import useSocket from '../../hooks/useSocket';
import { useRoom } from '../../hooks/useRoom';
import useRealtimeDrawing from '../../hooks/useRealtimeDrawing';
import useCanvas from '../../hooks/useCanvas';
import useDrawing from '../../hooks/useDrawing';
import { useUndoRedo } from '../../hooks/useUndoRedo';

import ConnectionStatus from '../ConnectionStatus';
import RoomControls from './RoomControls';
import UserList from './UserList';
import CanvasLayer from './CanvasLayer';
import SVGLayer from './SVGLayer';
import DrawingTools from './DrawingTools';
import VideoGrid from '../VideoGrid';

import './DrawingCanvas.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const DrawingCanvas = ({ initialToken = null }) => {
  // refs
  const canvasRef = useRef(null);
  const svgRef = useRef(null);

  // socket hook (default export)
  const {
    socket,
    connectSocket,
    disconnectSocket,
    isConnected,
    connectionError,
    reconnectAttempts
  } = useSocket();

  // room hook: pass the socket instance for real-time events
  const {
    roomState,
    roomError,
    createRoom,    // socket-based create (emits 'create-room' when connected)
    joinRoom,      // socket-based join (emits 'join-room' when connected)
    leaveRoom,
    createRoomApi, // API helper -> returns { token, roomId, roomCode, userId }
    joinRoomApi    // API helper -> returns { token, roomId, roomCode, userId }
  } = useRoom(socket);

  // canvas utilities (DPR handling)
  const {
    setupCanvas,
    getCanvasContext,
    clearCanvas,
    drawLine,
    clientToCanvasCoords
  } = useCanvas(canvasRef);

  // local drawing hook - handles local drawing, buffering and emits via socket
  // signature: useDrawing(canvasRef, svgRef, socket, roomId)
  const {
    currentTool,
    setCurrentTool,
    currentColor,
    setCurrentColor,
    lineWidth,
    setLineWidth,
    isDrawing,
    startDrawing,
    continueDrawing,
    stopDrawing,
    addShape,
    clearCanvas: clearLocalCanvas
  } = useDrawing(canvasRef, svgRef, socket, roomState.roomId);

  // realtime drawing: listens to remote events and exposes cursor emissions etc
  const {
    emitCursorMove,
    emitCanvasClear,
    emitShapeAdded,
    emitUndo,
    emitRedo
  } = useRealtimeDrawing(socket, canvasRef, svgRef, roomState);

  // undo/redo hook (server authoritative)
  const { undo, redo, recordAction } = useUndoRedo({ socket, canvasRef, svgRef });

  // Local UI state for create/join flows (to avoid racing)
  const [processing, setProcessing] = useState(false);

  // If an initialToken is supplied (optional), connect automatically
  useEffect(() => {
    if (initialToken && !socket) {
      try {
        sessionStorage.setItem('roomToken', initialToken);
      } catch (e) { /* ignore */ }
      try {
        connectSocket(initialToken);
      } catch (e) { /* ignore */ }
    }
  }, [initialToken, connectSocket]);

  // Ensure canvas is setup on mount and when container resizes
  useEffect(() => {
    if (!canvasRef.current) return;
    setupCanvas();
    const onResize = () => setupCanvas();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [setupCanvas, canvasRef]);

  // If we get a token in sessionStorage (from earlier), auto-connect
  useEffect(() => {
    if (socket || !connectSocket) return;
    try {
      const token = sessionStorage.getItem('roomToken');
      if (token) {
        connectSocket(token);
      }
    } catch (e) {
      // ignore storage errors
    }
  }, [socket, connectSocket]);

  // When socket connects and there's a pending "create/join intent" in sessionStorage,
  // perform the final socket emit to actually join/create the in-memory socket room.
  // We use session keys to coordinate:
  useEffect(() => {
    if (!socket || !socket.connected) return;

    // If the UI previously stored a pending operation, execute it.
    // (createIntent: 'create' | 'join', createRoomCode, createUsername)
    try {
      const intentRaw = sessionStorage.getItem('roomIntent');
      if (!intentRaw) return;
      const intent = JSON.parse(intentRaw);
      if (!intent) return;

      if (intent.type === 'create') {
        socket.emit('create-room');
      } else if (intent.type === 'join' && intent.roomCode && intent.username) {
        socket.emit('join-room', { roomCode: intent.roomCode, username: intent.username });
      }
      // clear intent
      sessionStorage.removeItem('roomIntent');
    } catch (e) {
      // ignore JSON errors
    }
  }, [socket]);

  // Mouse move handler -> normalize coords and emit cursor update (throttled by hook)
  const handleMouseMove = useCallback((ev) => {
    if (!roomState.isJoined || !canvasRef.current) return;
    const coords = clientToCanvasCoords(ev.clientX, ev.clientY);
    if (!coords) return;
    // coords are logical pixels; pass them to emitter
    emitCursorMove(coords.x, coords.y);
  }, [roomState.isJoined, clientToCanvasCoords, emitCursorMove]);

  // Canvas clear handler (local + remote)
  const handleCanvasClear = useCallback(() => {
    clearLocalCanvas();
    emitCanvasClear();
  }, [clearLocalCanvas, emitCanvasClear]);

  // Wiring create/join flows (API first to get token, then connect, then socket emit)
  const handleCreateRoomFlow = useCallback(async () => {
    setProcessing(true);
    try {
      // Call server API to create room and receive a token for this session
      const info = await createRoomApi();
      if (!info || !info.token) throw new Error('No token returned from API');
      // Persist token for the tab session
      sessionStorage.setItem('roomToken', info.token);
      // set an intent so once socket connects it will emit create-room
      sessionStorage.setItem('roomIntent', JSON.stringify({ type: 'create' }));
      // connect socket with token
      connectSocket(info.token);
    } catch (err) {
      console.error('createRoom flow error', err);
      // set a user-facing error through useRoom's hook (it sets roomError)
    } finally {
      setProcessing(false);
    }
  }, [createRoomApi, connectSocket]);

  const handleJoinRoomFlow = useCallback(async (roomCode, username) => {
    setProcessing(true);
    try {
      const info = await joinRoomApi(roomCode, username);
      if (!info || !info.token) throw new Error('No token returned from API');
      sessionStorage.setItem('roomToken', info.token);
      // save join intent with roomCode + username so socket emits join-room on connect
      sessionStorage.setItem('roomIntent', JSON.stringify({ type: 'join', roomCode: info.roomCode, username }));
      connectSocket(info.token);
    } catch (err) {
      console.error('joinRoom flow error', err);
    } finally {
      setProcessing(false);
    }
  }, [joinRoomApi, connectSocket]);

  // Leave room handler (cleans up socket + session)
  const handleLeave = useCallback(() => {
    try {
      // notify server
      if (socket && socket.connected) {
        socket.emit('leave-room');
      }
    } catch (e) { /* ignore */ }

    // clear persistent session token & intent
    try { sessionStorage.removeItem('roomToken'); } catch (e) { /* ignore */ }
    try { sessionStorage.removeItem('roomIntent'); } catch (e) { /* ignore */ }

    // disconnect socket client-side
    try { disconnectSocket(); } catch (e) { /* ignore */ }

    // call room leave to reset local state
    try { leaveRoom(); } catch (e) { /* ignore */ }
  }, [socket, disconnectSocket, leaveRoom]);

  // Render join/create UI when not in a room
  if (!roomState.isJoined) {
    return (
      <div className="drawing-app">
        <ConnectionStatus
          isConnected={isConnected}
          connectionError={connectionError}
          reconnectAttempts={reconnectAttempts}
        />

        <RoomControls
          roomState={roomState}
          roomError={roomError}
          createRoom={() => handleCreateRoomFlow()}
          joinRoom={(roomCode, username) => handleJoinRoomFlow(roomCode, username)}
          leaveRoom={handleLeave}
          disabled={processing || !isConnected}
        />

        {/* Helpful debug / quick actions */}
        <div style={{ marginTop: 12, fontSize: 13, color: '#666' }}>
          <div>Tip: create a room or join with a 6-character code.</div>
          {processing && <div style={{ marginTop: 6 }}>Working…</div>}
        </div>
      </div>
    );
  }

  // When joined, render the whole whiteboard
  return (
    <div className="drawing-app">
      <div className="app-header">
        <div className="room-info">
          <span>Room: <strong>{roomState.roomCode}</strong></span>
          {roomState.isHost && <span className="host-badge">Host</span>}
        </div>

        <ConnectionStatus
          isConnected={isConnected}
          connectionError={connectionError}
          reconnectAttempts={reconnectAttempts}
        />

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <UserList users={roomState.users} localUserId={socket?.id} />
          <button onClick={handleLeave} className="leave-room-btn">Leave Room</button>
        </div>
      </div>

      <div className="drawing-canvas-container">
        <DrawingTools
          currentTool={currentTool}
          onToolChange={setCurrentTool}
          currentColor={currentColor}
          onColorChange={setCurrentColor}
          lineWidth={lineWidth}
          onLineWidthChange={setLineWidth}
          onClear={handleCanvasClear}
          onUndo={undo}
          onRedo={redo}
          undoDisabled={false}
          redoDisabled={false}
        />

        <div
          className="drawing-surface"
          onMouseMove={handleMouseMove}
          style={{ position: 'relative', flex: 1 }}
        >
          <CanvasLayer
            ref={canvasRef}
            onMouseDown={(e) => startDrawing(e)}
            onMouseMove={(e) => continueDrawing(e)}
            onMouseUp={(e) => stopDrawing(e)}
            onTouchStart={(e) => startDrawing(e)}
            onTouchMove={(e) => continueDrawing(e)}
            onTouchEnd={(e) => stopDrawing(e)}
          />

          <SVGLayer
            ref={svgRef}
            onShapeAdd={(shape) => {
              // local add + emit
              addShape(shape);
              emitShapeAdded(shape);
            }}
          />
        </div>

        {/* Optional video grid (if using WebRTC) */}
        {/* <VideoGrid localStream={localStream} remoteStreams={remoteStreams} /> */}
      </div>
    </div>
  );
};

export default DrawingCanvas;