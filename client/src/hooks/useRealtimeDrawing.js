// client/src/hooks/useRealtimeDrawing.js
import { useEffect, useCallback, useRef } from 'react';

export const useRealtimeDrawing = (socket, canvasRef, svgRef, roomState) => {
  const drawingBufferRef = useRef([]); // Buffer for network optimization[11]
  const lastEmitTime = useRef(0);
  const remoteCursors = useRef(new Map());

  // Drawing event handlers
  useEffect(() => {
    if (!socket || !roomState.isJoined) return;

    // Remote drawing events
    socket.on('drawing-start', handleRemoteDrawingStart);
    socket.on('drawing-data', handleRemoteDrawingData);
    socket.on('drawing-end', handleRemoteDrawingEnd);
    socket.on('shape-added', handleRemoteShapeAdded);
    socket.on('canvas-clear', handleRemoteCanvasClear);
    
    // Cursor events[12]
    socket.on('cursor-update', handleRemoteCursorUpdate);
    
    // Undo/Redo events
    socket.on('undo-action', handleRemoteUndo);
    socket.on('redo-action', handleRemoteRedo);

    return () => {
      socket.off('drawing-start', handleRemoteDrawingStart);
      socket.off('drawing-data', handleRemoteDrawingData);
      socket.off('drawing-end', handleRemoteDrawingEnd);
      socket.off('shape-added', handleRemoteShapeAdded);
      socket.off('canvas-clear', handleRemoteCanvasClear);
      socket.off('cursor-update', handleRemoteCursorUpdate);
      socket.off('undo-action', handleRemoteUndo);
      socket.off('redo-action', handleRemoteRedo);
    };
  }, [socket, roomState.isJoined]);

  // Remote drawing handlers
  const handleRemoteDrawingStart = useCallback((data) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(data.point.x, data.point.y);
    ctx.strokeStyle = data.color;
    ctx.lineWidth = data.lineWidth;
  }, [canvasRef]);

  const handleRemoteDrawingData = useCallback((data) => {
    const canvas = canvasRef.current;
    if (!canvas || !data.points) return;

    const ctx = canvas.getContext('2d');
    
    // Draw the points received
    data.points.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    
    ctx.stroke();
  }, [canvasRef]);

  const handleRemoteDrawingEnd = useCallback((data) => {
    // Drawing ended, can perform cleanup or add to history
    console.log('Remote drawing ended by:', data.username);
  }, []);

  const handleRemoteShapeAdded = useCallback((data) => {
    const svg = svgRef.current;
    if (!svg) return;

    // Add shape to SVG layer
    const shapeElement = document.createElementNS('http://www.w3.org/2000/svg', data.shape.type);
    
    // Set shape attributes based on type
    switch (data.shape.type) {
      case 'rect':
        shapeElement.setAttribute('x', data.shape.x);
        shapeElement.setAttribute('y', data.shape.y);
        shapeElement.setAttribute('width', data.shape.width);
        shapeElement.setAttribute('height', data.shape.height);
        break;
      case 'circle':
        shapeElement.setAttribute('cx', data.shape.x);
        shapeElement.setAttribute('cy', data.shape.y);
        shapeElement.setAttribute('r', data.shape.radius);
        break;
      // Add other shape types
    }
    
    shapeElement.setAttribute('fill', data.shape.fillColor || 'transparent');
    shapeElement.setAttribute('stroke', data.shape.strokeColor);
    shapeElement.setAttribute('stroke-width', data.shape.strokeWidth);
    shapeElement.setAttribute('data-user-id', data.userId);
    
    svg.appendChild(shapeElement);
  }, [svgRef]);

  const handleRemoteCanvasClear = useCallback(() => {
    const canvas = canvasRef.current;
    const svg = svgRef.current;
    
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    
    if (svg) {
      // Clear SVG elements (except cursor elements)
      const shapes = svg.querySelectorAll(':not(.remote-cursor)');
      shapes.forEach(shape => shape.remove());
    }
  }, [canvasRef, svgRef]);

  // Cursor tracking[12][15]
  const handleRemoteCursorUpdate = useCallback(({ userId, username, x, y }) => {
    const svg = svgRef.current;
    if (!svg) return;

    let cursorElement = svg.querySelector(`[data-cursor-user="${userId}"]`);
    
    if (!cursorElement) {
      // Create new cursor element
      const cursorGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      cursorGroup.setAttribute('data-cursor-user', userId);
      cursorGroup.setAttribute('class', 'remote-cursor');
      
      // Cursor pointer
      const cursor = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      cursor.setAttribute('points', '0,0 0,16 5,12 8,16 12,14 8,9 16,9');
      cursor.setAttribute('fill', getRandomColor(userId));
      cursor.setAttribute('stroke', '#000');
      cursor.setAttribute('stroke-width', '1');
      
      // Username label
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', '18');
      label.setAttribute('y', '10');
      label.setAttribute('fill', '#000');
      label.setAttribute('font-size', '12');
      label.setAttribute('font-family', 'Arial');
      label.textContent = username;
      
      cursorGroup.appendChild(cursor);
      cursorGroup.appendChild(label);
      svg.appendChild(cursorGroup);
      
      cursorElement = cursorGroup;
    }
    
    // Update cursor position with smooth animation
    cursorElement.setAttribute('transform', `translate(${x}, ${y})`);
    
    // Remove cursor after inactivity
    clearTimeout(remoteCursors.current.get(userId));
    remoteCursors.current.set(userId, setTimeout(() => {
      cursorElement?.remove();
      remoteCursors.current.delete(userId);
    }, 5000)); // Remove after 5 seconds of inactivity
    
  }, [svgRef]);

  // Local drawing events to emit[4]
  const emitDrawingStart = useCallback((point, color, lineWidth, tool) => {
    if (socket?.connected && roomState.isJoined) {
      socket.emit('drawing-start', {
        point,
        color,
        lineWidth,
        tool
      });
    }
  }, [socket, roomState.isJoined]);

  const emitDrawingData = useCallback((points, color, lineWidth, tool) => {
    if (!socket?.connected || !roomState.isJoined) return;

    // Throttle emissions to prevent network spam[2]
    const now = Date.now();
    if (now - lastEmitTime.current < 16) { // ~60fps
      return;
    }

    socket.emit('drawing-data', {
      points,
      color,
      lineWidth,
      tool
    });
    
    lastEmitTime.current = now;
  }, [socket, roomState.isJoined]);

  const emitDrawingEnd = useCallback((path, color, lineWidth, tool) => {
    if (socket?.connected && roomState.isJoined) {
      socket.emit('drawing-end', {
        path,
        color,
        lineWidth,
        tool
      });
    }
  }, [socket, roomState.isJoined]);

  const emitShapeAdded = useCallback((shape) => {
    if (socket?.connected && roomState.isJoined) {
      socket.emit('shape-added', { shape });
    }
  }, [socket, roomState.isJoined]);

  const emitCanvasClear = useCallback(() => {
    if (socket?.connected && roomState.isJoined) {
      socket.emit('canvas-clear');
    }
  }, [socket, roomState.isJoined]);

  const emitCursorMove = useCallback((x, y) => {
    if (socket?.connected && roomState.isJoined) {
      socket.emit('cursor-move', { x, y });
    }
  }, [socket, roomState.isJoined]);

  const emitUndo = useCallback(() => {
    if (socket?.connected && roomState.isJoined) {
      socket.emit('undo-action');
    }
  }, [socket, roomState.isJoined]);

  const emitRedo = useCallback(() => {
    if (socket?.connected && roomState.isJoined) {
      socket.emit('redo-action');
    }
  }, [socket, roomState.isJoined]);

  // Handle remote undo/redo
  const handleRemoteUndo = useCallback((data) => {
    console.log(`${data.username} undid an action`);
    // Implement undo logic based on action type
    // This would involve removing the last action from canvas/svg
  }, []);

  const handleRemoteRedo = useCallback((data) => {
    console.log(`${data.username} redid an action`);
    // Implement redo logic based on action type
  }, []);

  // Utility function for cursor colors
  const getRandomColor = (userId) => {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
      '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
    ];
    const hash = userId.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    return colors[Math.abs(hash) % colors.length];
  };

  return {
    emitDrawingStart,
    emitDrawingData,
    emitDrawingEnd,
    emitShapeAdded,
    emitCanvasClear,
    emitCursorMove,
    emitUndo,
    emitRedo,
    remoteCursors: remoteCursors.current
  };
};
