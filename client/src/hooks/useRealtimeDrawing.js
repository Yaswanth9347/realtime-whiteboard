// client/src/hooks/useRealtimeDrawing.js
import { useEffect, useCallback, useRef } from 'react';
import { DrawingDataBuffer, compressDrawingData } from '../utils/networkOptimization';
import { drawPath, batchDrawOperations, configureCanvas } from '../utils/drawingUtils';

/**
 * useRealtimeDrawing
 *
 * Responsibilities:
 * - Subscribe to remote drawing/cursor/shape events and render them safely.
 * - Provide emit functions for local drawing actions (uses buffer + compression).
 * - Validate remote payloads to avoid malformed data.
 * - Maintain remote cursor elements with safe cleanup.
 *
 * Parameters:
 * - socket: socket.io client instance
 * - canvasRef: ref to <canvas> element (DPR-aware drawing)
 * - svgRef: ref to <svg> overlay for shapes and cursors
 * - roomState: object with .isJoined boolean (from useRoom)
 *
 * Returns: emit helpers and remoteCursors map reference
 */
export const useRealtimeDrawing = (socket, canvasRef, svgRef, roomState) => {
  // Local refs
  const drawingBufferRef = useRef(new DrawingDataBuffer(50, 300, false));
  const lastEmitTime = useRef(0);
  const remoteCursors = useRef(new Map());
  const remoteCursorTimeouts = useRef(new Map());

  // Ensure canvas is configured for DPR on mount/resize if needed
  useEffect(() => {
    const canvas = canvasRef?.current;
    if (!canvas) return;
    // (re)configure canvas for DPR
    configureCanvas(canvas);

    // also re-configure on window resize
    const onResize = () => configureCanvas(canvas);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, [canvasRef]);

  // ---- Incoming remote event handlers ----
  // Each handler validates payload shape and performs safe incremental rendering.

  const safeGetCanvasCtx = useCallback(() => {
    const canvas = canvasRef?.current;
    if (!canvas) return null;
    const ctx = canvas.getContext && canvas.getContext('2d');
    return ctx || null;
  }, [canvasRef]);

  // DRAWING START
  const handleRemoteDrawingStart = useCallback((data) => {
    try {
      if (!data || !data.userId || !data.point) return;
      const ctx = safeGetCanvasCtx();
      if (!ctx) return;

      // basic color/width defaults and sanitization
      ctx.save();
      ctx.beginPath();
      ctx.lineWidth = Number(data.lineWidth) || 2;
      ctx.strokeStyle = typeof data.color === 'string' ? data.color : '#000';
      const p = data.point;
      if (typeof p.x !== 'number' || typeof p.y !== 'number') {
        ctx.restore();
        return;
      }
      ctx.moveTo(p.x, p.y);
      ctx.restore();
    } catch (e) {
      // swallow; avoid crashing UI
      // console.warn('handleRemoteDrawingStart error', e);
    }
  }, [safeGetCanvasCtx]);

  // DRAWING DATA (batched points)
  const handleRemoteDrawingData = useCallback((data) => {
    try {
      if (!data || !Array.isArray(data.points) || data.points.length === 0) return;
      const ctx = safeGetCanvasCtx();
      if (!ctx) return;

      // validate points array quickly
      const pts = data.points.filter(p => p && typeof p.x === 'number' && typeof p.y === 'number');
      if (pts.length === 0) return;

      // Use drawPath helper for smooth rendering
      drawPath(ctx, {
        points: pts,
        color: typeof data.color === 'string' ? data.color : '#000',
        width: Number(data.lineWidth) || 2
      });
    } catch (e) {
      // console.warn('handleRemoteDrawingData error', e);
    }
  }, [safeGetCanvasCtx]);

  // DRAWING END
  const handleRemoteDrawingEnd = useCallback((data) => {
    try {
      // nothing heavy here, server may broadcast to allow other clients to add to history
      // we keep minimal footprint: maybe draw final path if provided
      const ctx = safeGetCanvasCtx();
      if (!ctx) return;
      if (data && Array.isArray(data.points) && data.points.length > 0) {
        drawPath(ctx, {
          points: data.points.filter(p => typeof p.x === 'number' && typeof p.y === 'number'),
          color: data.color || '#000',
          width: Number(data.lineWidth) || 2
        });
      }
      // else ignore - drawing likely already rendered via 'drawing-data'
    } catch (e) {
      // ignore
    }
  }, [safeGetCanvasCtx]);

  // SHAPE ADDED (render on SVG if available, fallback to canvas)
  const handleRemoteShapeAdded = useCallback((data) => {
    try {
      if (!data || !data.shape || !data.userId) return;
      const shape = data.shape;
      const svg = svgRef?.current;
      const canvas = canvasRef?.current;

      // sanitize shape.type
      const type = String(shape.type || '').toLowerCase();
      if (!['rect', 'circle', 'path'].includes(type)) {
        // unsupported shape -> ignore
        return;
      }

      if (svg) {
        // create elements with safe attributes
        if (type === 'rect') {
          const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          rect.setAttribute('x', String(Number(shape.x || 0)));
          rect.setAttribute('y', String(Number(shape.y || 0)));
          rect.setAttribute('width', String(Number(shape.w || 0)));
          rect.setAttribute('height', String(Number(shape.h || 0)));
          rect.setAttribute('fill', shape.fill ? (shape.fillColor || '#000') : 'none');
          rect.setAttribute('stroke', shape.strokeColor || (shape.fill ? '#000' : '#000'));
          rect.setAttribute('stroke-width', String(Number(shape.strokeWidth || 1)));
          rect.setAttribute('data-shape-id', String(data.id || `shape-${Date.now()}`));
          svg.appendChild(rect);
        } else if (type === 'circle') {
          const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          c.setAttribute('cx', String(Number(shape.cx || 0)));
          c.setAttribute('cy', String(Number(shape.cy || 0)));
          c.setAttribute('r', String(Number(shape.r || 0)));
          c.setAttribute('fill', shape.fill ? (shape.fillColor || '#000') : 'none');
          c.setAttribute('stroke', shape.strokeColor || '#000');
          c.setAttribute('stroke-width', String(Number(shape.strokeWidth || 1)));
          c.setAttribute('data-shape-id', String(data.id || `shape-${Date.now()}`));
          svg.appendChild(c);
        } else if (type === 'path' && Array.isArray(shape.points)) {
          const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          // convert points to path d safely
          const validPts = shape.points.filter(p => p && typeof p.x === 'number' && typeof p.y === 'number');
          if (validPts.length === 0) return;
          const d = validPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
          pathEl.setAttribute('d', d);
          pathEl.setAttribute('fill', 'none');
          pathEl.setAttribute('stroke', shape.strokeColor || '#000');
          pathEl.setAttribute('stroke-width', String(Number(shape.strokeWidth || 1)));
          pathEl.setAttribute('data-shape-id', String(data.id || `shape-${Date.now()}`));
          svg.appendChild(pathEl);
        }
      } else if (canvas && canvas.getContext) {
        // fallback: render simple bounding rect or path on canvas
        const ctx = canvas.getContext('2d');
        if (type === 'rect') {
          batchDrawOperations(ctx, [{
            type: 'rect',
            x: Number(shape.x || 0),
            y: Number(shape.y || 0),
            w: Number(shape.w || 0),
            h: Number(shape.h || 0),
            color: shape.strokeColor || '#000',
            fill: !!shape.fill
          }]);
        } else if (type === 'path') {
          drawPath(ctx, { points: shape.points || [], color: shape.strokeColor || '#000', width: shape.strokeWidth || 1 });
        }
      }
    } catch (e) {
      // ignore errors
    }
  }, [svgRef, canvasRef]);

  // CANVAS CLEAR
  const handleRemoteCanvasClear = useCallback(() => {
    try {
      const canvas = canvasRef?.current;
      const svg = svgRef?.current;
      if (canvas && canvas.getContext) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const dpr = window.devicePixelRatio || 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      if (svg) {
        // remove all non-cursor elements
        const children = Array.from(svg.children);
        children.forEach((el) => {
          if (!el.classList || !el.classList.contains('remote-cursor')) {
            svg.removeChild(el);
          }
        });
      }
    } catch (e) {
      // ignore
    }
  }, [canvasRef, svgRef]);

  // CURSOR UPDATE (render small cursor in SVG overlay)
  const handleRemoteCursorUpdate = useCallback(({ userId, username, x, y }) => {
    try {
      if (!userId || typeof x !== 'number' || typeof y !== 'number') return;
      const svg = svgRef?.current;
      if (!svg) return;

      const id = `cursor-${userId}`;
      let cursorGroup = svg.querySelector(`[data-cursor-user="${id}"]`);

      if (!cursorGroup) {
        cursorGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        cursorGroup.setAttribute('data-cursor-user', id);
        cursorGroup.setAttribute('class', 'remote-cursor');
        // arrow pointer
        const pointer = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        pointer.setAttribute('points', '0,0 8,16 6,18 10,22 0,22');
        pointer.setAttribute('fill', getColorForUser(userId));
        pointer.setAttribute('stroke', '#000');
        pointer.setAttribute('stroke-width', '0.5');
        // label
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', '14');
        label.setAttribute('y', '12');
        label.setAttribute('font-size', '12');
        label.setAttribute('fill', '#000');
        label.textContent = username || 'Guest';
        cursorGroup.appendChild(pointer);
        cursorGroup.appendChild(label);
        svg.appendChild(cursorGroup);
      }

      cursorGroup.setAttribute('transform', `translate(${x}, ${y})`);

      // reset timeout to remove on inactivity
      if (remoteCursorTimeouts.current.has(userId)) {
        clearTimeout(remoteCursorTimeouts.current.get(userId));
      }
      const t = setTimeout(() => {
        try {
          cursorGroup.remove();
        } catch (e) { /* ignore */ }
        remoteCursorTimeouts.current.delete(userId);
      }, 5000);
      remoteCursorTimeouts.current.set(userId, t);

    } catch (e) {
      // ignore
    }
  }, [svgRef]);

  // Helper: deterministic color per user
  const getColorForUser = (userId) => {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'];
    if (!userId) return colors[0];
    let hash = 0;
    for (let i = 0; i < userId.length; i += 1) {
      hash = ((hash << 5) - hash) + userId.charCodeAt(i);
      hash |= 0;
    }
    return colors[Math.abs(hash) % colors.length];
  };

  // ---- Wire up socket listeners ----
  useEffect(() => {
    if (!socket || !roomState?.isJoined) return undefined;

    // register handlers
    socket.on('drawing-start', handleRemoteDrawingStart);
    socket.on('drawing-data', handleRemoteDrawingData);
    socket.on('drawing-end', handleRemoteDrawingEnd);
    socket.on('shape-added', handleRemoteShapeAdded);
    socket.on('canvas-clear', handleRemoteCanvasClear);
    socket.on('cursor-update', handleRemoteCursorUpdate);
    socket.on('undo-action', () => { /* server authoritative undo will be applied via separate hook (useUndoRedo) */ });
    socket.on('redo-action', () => { /* handled elsewhere */ });

    return () => {
      // detach handlers safely
      if (!socket) return;
      socket.off('drawing-start', handleRemoteDrawingStart);
      socket.off('drawing-data', handleRemoteDrawingData);
      socket.off('drawing-end', handleRemoteDrawingEnd);
      socket.off('shape-added', handleRemoteShapeAdded);
      socket.off('canvas-clear', handleRemoteCanvasClear);
      socket.off('cursor-update', handleRemoteCursorUpdate);
      socket.off('undo-action');
      socket.off('redo-action');
    };
  }, [
    socket,
    roomState?.isJoined,
    handleRemoteDrawingStart,
    handleRemoteDrawingData,
    handleRemoteDrawingEnd,
    handleRemoteShapeAdded,
    handleRemoteCanvasClear,
    handleRemoteCursorUpdate
  ]);

  // ---- Local emit helpers (use buffer + compression for drawing-data) ----
  const emitDrawingStart = useCallback((point, color = '#000', lineWidth = 2, tool = 'pen') => {
    try {
      if (!socket?.connected || !roomState?.isJoined) return;
      if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') return;
      socket.emit('drawing-start', { point, color, lineWidth, tool });
    } catch (e) {
      // ignore
    }
  }, [socket, roomState]);

  const emitDrawingData = useCallback((point, color = '#000', lineWidth = 2, tool = 'pen') => {
    try {
      if (!socket?.connected || !roomState?.isJoined) return;
      if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') return;

      // add to buffer; flush returns batch when condition met
      const batch = drawingBufferRef.current.addPoint(point);
      if (batch && batch.length > 0) {
        const payload = {
          points: batch,
          color,
          lineWidth,
          tool
        };
        const compressed = compressDrawingData(payload);
        // throttle to >= 12ms (approx 80fps) just in case
        const now = Date.now();
        if (now - lastEmitTime.current >= 12) {
          socket.emit('drawing-data', compressed);
          lastEmitTime.current = now;
        }
      }
    } catch (e) {
      // ignore
    }
  }, [socket, roomState]);

  const emitDrawingEnd = useCallback((points, color = '#000', lineWidth = 2, tool = 'pen', meta = {}) => {
    try {
      if (!socket?.connected || !roomState?.isJoined) return;
      const sanitizedPts = Array.isArray(points) ? points.filter(p => p && typeof p.x === 'number' && typeof p.y === 'number') : [];
      const payload = { points: sanitizedPts, color, lineWidth, tool, meta };
      // compress final payload
      const compressed = compressDrawingData(payload);
      socket.emit('drawing-end', compressed);
    } catch (e) {
      // ignore
    }
  }, [socket, roomState]);

  const emitShapeAdded = useCallback((shape) => {
    try {
      if (!socket?.connected || !roomState?.isJoined) return;
      if (!shape || !shape.type) return;
      // sanitize minimal shape fields before emitting
      socket.emit('shape-added', { shape });
    } catch (e) {
      // ignore
    }
  }, [socket, roomState]);

  const emitCanvasClear = useCallback(() => {
    try {
      if (!socket?.connected || !roomState?.isJoined) return;
      socket.emit('canvas-clear');
    } catch (e) {
      // ignore
    }
  }, [socket, roomState]);

  const emitCursorMove = useCallback((x, y) => {
    try {
      if (!socket?.connected || !roomState?.isJoined) return;
      if (typeof x !== 'number' || typeof y !== 'number') return;
      // throttle cursor emissions (50ms)
      const now = Date.now();
      const last = remoteCursors.current.get('__last_emit') || 0;
      if (now - last < 50) return;
      remoteCursors.current.set('__last_emit', now);
      socket.emit('cursor-move', { x, y });
    } catch (e) {
      // ignore
    }
  }, [socket, roomState]);

  const emitUndo = useCallback(() => {
    try {
      if (!socket?.connected || !roomState?.isJoined) return;
      socket.emit('undo-action');
    } catch (e) { /* ignore */ }
  }, [socket, roomState]);

  const emitRedo = useCallback(() => {
    try {
      if (!socket?.connected || !roomState?.isJoined) return;
      socket.emit('redo-action');
    } catch (e) { /* ignore */ }
  }, [socket, roomState]);

  // Cleanup timeouts and buffer on unmount
  useEffect(() => {
    return () => {
      try {
        // clear cursor timeouts
        for (const t of remoteCursorTimeouts.current.values()) {
          clearTimeout(t);
        }
        remoteCursorTimeouts.current.clear();
        // dispose buffer
        const buf = drawingBufferRef.current;
        if (buf && typeof buf.dispose === 'function') buf.dispose();
      } catch (e) { /* ignore */ }
    };
  }, []);

  // Public API
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

export default useRealtimeDrawing;
