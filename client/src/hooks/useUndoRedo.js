// client/src/hooks/useUndoRedo.js
import { useState, useCallback, useRef, useEffect } from 'react';

export const useUndoRedo = ({ socket, canvasRef, svgRef }) => {
  const undoStack = useRef([]);
  const redoStack = useRef([]);

  // Apply or revert an action on canvas/SVG
  const applyAction = useCallback((action, reverse = false) => {
    const { type, payload } = action;
    const canvas = canvasRef.current;
    const svg = svgRef.current;
    const ctx = canvas?.getContext('2d');

    // Reverse draw by clearing or re-rendering from history snapshot
    if (type === 'canvas-clear') {
      if (reverse) {
        // Reapply previous state snapshot (if saved)
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        svg.innerHTML = '';
      }
    }
    else if (type === 'shape-added') {
      if (reverse) {
        // Remove shape by ID
        const el = svg.querySelector(`[data-shape-id="${payload.id}"]`);
        el?.remove();
      } else {
        // Add shape element
        // (reuse SVGLayer logic)
      }
    }
    else if ([ 'drawing-start','drawing-data','drawing-end' ].includes(type)) {
      if (reverse) {
        // Re-render entire canvas from undoStack history snapshot
      } else {
        // Draw stroke segment or full path
      }
    }
  }, [canvasRef, svgRef]);

  // Local invoke
  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    const action = undoStack.current.pop();
    redoStack.current.push(action);
    applyAction(action, true);
    socket.emit('undo-action');
  }, [socket, applyAction]);

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    const action = redoStack.current.pop();
    undoStack.current.push(action);
    applyAction(action, false);
    socket.emit('redo-action');
  }, [socket, applyAction]);

  // Record local actions
  const recordAction = useCallback((action) => {
    undoStack.current.push(action);
    redoStack.current.length = 0;
  }, []);

  // Handle remote events
  useEffect(() => {
    if (!socket) return;
    socket.on('undo-action', ({ action }) => {
      redoStack.current.push(action);
      applyAction(action, true);
    });
    socket.on('redo-action', ({ action }) => {
      undoStack.current.push(action);
      applyAction(action, false);
    });
    return () => {
      socket.off('undo-action');
      socket.off('redo-action');
    };
  }, [socket, applyAction]);

  return { undo, redo, recordAction };
};
