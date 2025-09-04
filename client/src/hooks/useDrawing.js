// hooks/useDrawing.js
import { useState, useCallback, useRef } from 'react';

export const useDrawing = (canvasContext, svgRef, socket, roomId) => {
  const [currentTool, setCurrentTool] = useState('pen');
  const [currentColor, setCurrentColor] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(2);
  const [isDrawing, setIsDrawing] = useState(false);
  
  const lastPoint = useRef({ x: 0, y: 0 });
  const currentPath = useRef([]);

  // Get coordinates relative to canvas[75]
  const getCoordinates = useCallback((event, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX, clientY;
    
    if (event.touches && event.touches[0]) {
      // Touch event
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else {
      // Mouse event
      clientX = event.clientX;
      clientY = event.clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }, []);

  const startDrawing = useCallback((event) => {
    const canvas = event.target;
    const coords = getCoordinates(event, canvas);
    
    setIsDrawing(true);
    lastPoint.current = coords;
    currentPath.current = [coords];

    if (currentTool === 'pen') {
      const ctx = canvas.getContext('2d');
      ctx.beginPath();
      ctx.moveTo(coords.x, coords.y);
    }

    // Emit drawing start to other users
    socket?.emit('drawing-start', {
      roomId,
      tool: currentTool,
      color: currentColor,
      lineWidth,
      point: coords
    });
  }, [currentTool, currentColor, lineWidth, socket, roomId, getCoordinates]);

  const continueDrawing = useCallback((event) => {
    if (!isDrawing) return;

    const canvas = event.target;
    const coords = getCoordinates(event, canvas);
    currentPath.current.push(coords);

    if (currentTool === 'pen') {
      const ctx = canvas.getContext('2d');
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = lineWidth;
      ctx.lineTo(coords.x, coords.y);
      ctx.stroke();
    }

    // Throttle drawing data to optimize network[21]
    if (currentPath.current.length % 3 === 0) {
      socket?.emit('drawing-data', {
        roomId,
        points: currentPath.current.slice(-3),
        tool: currentTool,
        color: currentColor,
        lineWidth
      });
    }

    lastPoint.current = coords;
  }, [isDrawing, currentTool, currentColor, lineWidth, socket, roomId, getCoordinates]);

  const stopDrawing = useCallback((event) => {
    if (!isDrawing) return;

    setIsDrawing(false);

    // Emit final drawing data
    socket?.emit('drawing-end', {
      roomId,
      path: currentPath.current,
      tool: currentTool,
      color: currentColor,
      lineWidth
    });

    currentPath.current = [];
  }, [isDrawing, socket, roomId, currentTool, currentColor, lineWidth]);

  const addShape = useCallback((shapeData) => {
    // Emit shape data to other users
    socket?.emit('shape-added', {
      roomId,
      shape: shapeData
    });
  }, [socket, roomId]);

  return {
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
    addShape
  };
};
