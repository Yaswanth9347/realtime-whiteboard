// client/src/hooks/useDrawing.js
import { useState, useCallback, useRef, useEffect } from 'react';
import { DrawingDataBuffer, compressDrawingData } from '../utils/networkOptimization';
import { configureCanvas, drawPath } from '../utils/drawingUtils';

/**
 * useDrawing
 *
 * @param {object} canvasRef - React ref pointing to the <canvas> element
 * @param {object} svgRef - React ref to SVG overlay (optional)
 * @param {object} socket - socket.io client instance
 * @param {string} roomId - room identifier (optional; socket already authenticates via token)
 *
 * Returns drawing state and handlers:
 *  - currentTool, setCurrentTool
 *  - currentColor, setCurrentColor
 *  - lineWidth, setLineWidth
 *  - isDrawing
 *  - startDrawing(posOrEvent), continueDrawing(posOrEvent), stopDrawing(posOrEvent)
 *  - addShape(shapeData)
 *
 * Notes:
 *  - Accepts both raw pointer-like objects {clientX, clientY} or normalized {x,y} in logical canvas coords.
 *  - Caller (DrawingCanvas) should pass the canvasRef element and forward pointer/touch normalized coords OR raw DOM events.
 */
export const useDrawing = (canvasRef, svgRef, socket, roomId) => {
  const [currentTool, setCurrentTool] = useState('pen');
  const [currentColor, setCurrentColor] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(2);
  const [isDrawing, setIsDrawing] = useState(false);

  // mutable refs
  const lastPoint = useRef({ x: 0, y: 0 });
  const currentPath = useRef([]); // array of {x,y}
  const drawingBuffer = useRef(new DrawingDataBuffer(50, 400, false));
  const rafRef = useRef(null);

  // Ensure canvas configured for DPR
  useEffect(() => {
    const canvas = canvasRef?.current;
    if (!canvas) return;
    configureCanvas(canvas);

    const onResize = () => configureCanvas(canvas);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      // dispose buffer if needed
      if (drawingBuffer.current?.dispose) drawingBuffer.current.dispose();
    };
  }, [canvasRef]);

  // helper: convert event or normalized pos to canvas logical coords
  const normalizePos = useCallback((posOrEvent) => {
    const canvas = canvasRef?.current;
    if (!canvas) return null;

    // if already normalized {x,y} in logical canvas coords, accept it
    if (posOrEvent && typeof posOrEvent.x === 'number' && typeof posOrEvent.y === 'number' && !posOrEvent.clientX) {
      return { x: posOrEvent.x, y: posOrEvent.y };
    }

    // else assume DOM event (mouse or touch)
    const rect = canvas.getBoundingClientRect();
    let clientX = null;
    let clientY = null;

    // touch event
    if (posOrEvent && posOrEvent.touches && posOrEvent.touches[0]) {
      clientX = posOrEvent.touches[0].clientX;
      clientY = posOrEvent.touches[0].clientY;
    } else if (posOrEvent && posOrEvent.changedTouches && posOrEvent.changedTouches[0]) {
      clientX = posOrEvent.changedTouches[0].clientX;
      clientY = posOrEvent.changedTouches[0].clientY;
    } else if (posOrEvent && typeof posOrEvent.clientX === 'number' && typeof posOrEvent.clientY === 'number') {
      // mouse event
      clientX = posOrEvent.clientX;
      clientY = posOrEvent.clientY;
    } else if (posOrEvent && typeof posOrEvent.x === 'number' && typeof posOrEvent.y === 'number') {
      // fallback: supplied as client coords
      clientX = posOrEvent.x;
      clientY = posOrEvent.y;
    } else {
      return null;
    }

    const dpr = window.devicePixelRatio || 1;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    // x,y are in internal pixel space; because we use configureCanvas with setTransform(dpr...), components can operate in logical coords if desired
    // keep returned coords in canvas internal pixels (consistent with drawing utilities)
    return { x, y };
  }, [canvasRef]);

  // internal incremental draw (runs in RAF to avoid blocking)
  const _drawToCanvas = useCallback((pts, color, width) => {
    const canvas = canvasRef?.current;
    if (!canvas || !Array.isArray(pts) || pts.length === 0) return;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return;

    // defer to drawPath helper for consistent rendering
    drawPath(ctx, { points: pts, color: color || currentColor, width: width || lineWidth });
  }, [canvasRef, currentColor, lineWidth]);

  // ---- Public handlers ----

  const startDrawing = useCallback((posOrEvent) => {
    const pos = normalizePos(posOrEvent);
    if (!pos) return;

    setIsDrawing(true);
    lastPoint.current = pos;
    currentPath.current = [pos];

    // immediate local begin path for snappy UX
    const canvas = canvasRef?.current;
    if (canvas) {
      const ctx = canvas.getContext && canvas.getContext('2d');
      if (ctx) {
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
      }
    }

    // emit drawing-start to server
    try {
      if (socket?.connected && roomId) {
        socket.emit('drawing-start', {
          point: { x: pos.x, y: pos.y },
          color: String(currentColor || '#000'),
          lineWidth: Number(lineWidth) || 2,
          tool: String(currentTool || 'pen'),
          roomId
        });
      }
    } catch (e) {
      // ignore emit errors
    }
  }, [normalizePos, canvasRef, socket, roomId, currentColor, lineWidth, currentTool]);

  const continueDrawing = useCallback((posOrEvent) => {
    if (!isDrawing) return;
    const pos = normalizePos(posOrEvent);
    if (!pos) return;

    currentPath.current.push(pos);
    lastPoint.current = pos;

    // Immediate incremental local render on RAF
    if (rafRef.current) {
      // already scheduled - no-op
    } else {
      rafRef.current = requestAnimationFrame(() => {
        _drawToCanvas(currentPath.current.slice(-64), currentColor, lineWidth); // draw recent segment only
        rafRef.current = null;
      });
    }

    // add to network buffer and flush when necessary
    try {
      const batch = drawingBuffer.current.addPoint({ x: pos.x, y: pos.y });
      if (batch && batch.length > 0) {
        const payload = {
          points: batch,
          color: String(currentColor || '#000'),
          lineWidth: Number(lineWidth) || 2,
          tool: String(currentTool || 'pen'),
          roomId
        };
        const compressed = compressDrawingData(payload);
        // rate-limit emit: allow a small spacing (>=12ms)
        const now = Date.now();
        if (!lastPoint.current._lastEmitAt || now - lastPoint.current._lastEmitAt >= 12) {
          if (socket?.connected) socket.emit('drawing-data', compressed);
          lastPoint.current._lastEmitAt = now;
        }
      }
    } catch (e) {
      // ignore network issues
    }
  }, [isDrawing, normalizePos, _drawToCanvas, currentColor, lineWidth, currentTool, canvasRef, socket, roomId]);

  const stopDrawing = useCallback((posOrEvent) => {
    if (!isDrawing) return;
    const pos = normalizePos(posOrEvent);
    if (pos) {
      currentPath.current.push(pos);
    }

    setIsDrawing(false);

    // finalize: send remaining buffer + drawing-end with whole path snapshot
    try {
      // flush any remaining buffered points
      const leftover = drawingBuffer.current.flush ? drawingBuffer.current.flush() : null;
      if (leftover && leftover.length > 0) {
        const compressed = compressDrawingData({
          points: leftover,
          color: String(currentColor || '#000'),
          lineWidth: Number(lineWidth) || 2,
          tool: String(currentTool || 'pen'),
          roomId
        });
        if (socket?.connected) socket.emit('drawing-data', compressed);
      }

      // emit final path snapshot
      const sanitizedPath = Array.isArray(currentPath.current) ? currentPath.current.filter(p => p && typeof p.x === 'number' && typeof p.y === 'number') : [];
      const finalPayload = {
        points: sanitizedPath,
        color: String(currentColor || '#000'),
        lineWidth: Number(lineWidth) || 2,
        tool: String(currentTool || 'pen'),
        roomId
      };
      const compressedFinal = compressDrawingData(finalPayload);
      if (socket?.connected) socket.emit('drawing-end', compressedFinal);
    } catch (e) {
      // ignore
    } finally {
      currentPath.current = [];
    }
  }, [isDrawing, normalizePos, currentColor, lineWidth, currentTool, socket, roomId]);

  const addShape = useCallback((shapeData) => {
    try {
      if (!shapeData || !shapeData.type) return;
      // minimal sanitization
      const shape = { ...shapeData };
      if (shape.type === 'rect') {
        shape.x = Number(shape.x || 0);
        shape.y = Number(shape.y || 0);
        shape.w = Number(shape.w || 0);
        shape.h = Number(shape.h || 0);
      }
      if (socket?.connected) {
        socket.emit('shape-added', { shape, roomId });
      }
    } catch (e) {
      // ignore
    }
  }, [socket, roomId]);

  // optional: expose a function to clear local canvas (and notify others)
  const clearCanvas = useCallback(() => {
    const canvas = canvasRef?.current;
    if (canvas && canvas.getContext) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    if (socket?.connected && roomId) {
      try { socket.emit('canvas-clear', { roomId }); } catch (e) { /* ignore */ }
    }
  }, [canvasRef, socket, roomId]);

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
    addShape,
    clearCanvas
  };
};

export default useDrawing;
