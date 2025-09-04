// client/src/components/DrawingCanvas/DrawingCanvas.jsx
import React, { useRef, useEffect } from 'react';
import { useSocket } from '../../hooks/useSocket';
import { useRoom } from '../../hooks/useRoom';
import { useRealtimeDrawing } from '../../hooks/useRealtimeDrawing';
import { useCanvas } from '../../hooks/useCanvas';
import { useDrawing } from '../../hooks/useDrawing';
import ConnectionStatus from '../ConnectionStatus';
import RoomControls from './RoomControls';
// import UserList from '../UserList';
import CanvasLayer from './CanvasLayer';
import SVGLayer from './SVGLayer';
import DrawingTools from './DrawingTools';

const DrawingCanvas = () => {
  const canvasRef = useRef(null);
  const svgRef = useRef(null);
  
  // Socket connection
  const { socket, isConnected, connectionError } = useSocket();
  
  // Room management
  const { roomState, roomError, createRoom, joinRoom, leaveRoom } = useRoom(socket);
  
  // Canvas operations
  const { setupCanvas, clearCanvas } = useCanvas(canvasRef);
  
  // Real-time synchronization
  const {
    emitDrawingStart,
    emitDrawingData,
    emitDrawingEnd,
    emitShapeAdded,
    emitCanvasClear,
    emitCursorMove,
    emitUndo,
    emitRedo
  } = useRealtimeDrawing(socket, canvasRef, svgRef, roomState);
  
  // Enhanced drawing with real-time events
  const {
    currentTool,
    setCurrentTool,
    currentColor,
    setCurrentColor,
    lineWidth,
    setLineWidth,
    startDrawing,
    continueDrawing,
    stopDrawing,
    addShape,
    undo,
    redo
  } = useDrawing(
    canvasRef,
    svgRef,
    {
      onDrawingStart: emitDrawingStart,
      onDrawingData: emitDrawingData,
      onDrawingEnd: emitDrawingEnd,
      onShapeAdded: emitShapeAdded,
      onUndo: emitUndo,
      onRedo: emitRedo
    }
  );

  // Mouse tracking for cursor synchronization
  const handleMouseMove = (event) => {
    if (!roomState.isJoined) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Throttle cursor updates
    emitCursorMove(x, y);
  };

  const handleCanvasClear = () => {
    clearCanvas();
    emitCanvasClear();
  };

  useEffect(() => {
    if (canvasRef.current && svgRef.current) {
      setupCanvas();
    }
  }, [setupCanvas]);

  // Show connection screen if not connected to a room
  if (!roomState.isJoined) {
    return (
      <div className="drawing-app">
        <ConnectionStatus 
          isConnected={isConnected}
          connectionError={connectionError}
          roomError={roomError}
        />
        <RoomControls
          onCreateRoom={createRoom}
          onJoinRoom={joinRoom}
          disabled={!isConnected}
        />
      </div>
    );
  }

  return (
    <div className="drawing-app">
      {/* Header */}
      <div className="app-header">
        <div className="room-info">
          <span>Room: <strong>{roomState.roomCode}</strong></span>
          {roomState.isHost && <span className="host-badge">Host</span>}
        </div>
        <ConnectionStatus 
          isConnected={isConnected}
          connectionError={connectionError}
        />
        <UserList users={roomState.users} />
        <button onClick={leaveRoom} className="leave-room-btn">
          Leave Room
        </button>
      </div>

      <div className="drawing-canvas-container">
        {/* Drawing Tools */}
        <DrawingTools 
          currentTool={currentTool}
          setCurrentTool={setCurrentTool}
          currentColor={currentColor}
          setCurrentColor={setCurrentColor}
          lineWidth={lineWidth}
          setLineWidth={setLineWidth}
          onClear={handleCanvasClear}
          onUndo={undo}
          onRedo={redo}
        />
        
        {/* Drawing Surface */}
        <div 
          className="drawing-surface"
          onMouseMove={handleMouseMove}
        >
          <CanvasLayer
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={continueDrawing}
            onMouseUp={stopDrawing}
          />
          
          <SVGLayer
            ref={svgRef}
            onShapeAdd={addShape}
          />
        </div>
      </div>
    </div>
  );
};

export default DrawingCanvas;
