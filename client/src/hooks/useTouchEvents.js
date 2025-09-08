// client/src/hooks/useTouchEvents.js
import { useCallback } from 'react';

/**
 * Hook to normalize touch events into {x,y} canvas coords.
 * Calls your drawing handlers with {x,y}.
 */
export const useTouchEvents = ({
  startDrawing,
  continueDrawing,
  stopDrawing,
  canvasRef
}) => {
  // helper: extract logical coords from touch event
  const getTouchPos = (evt) => {
    const canvas = canvasRef?.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const touch = evt.touches[0] || evt.changedTouches[0];
    if (!touch) return null;
    const dpr = window.devicePixelRatio || 1;
    const x = (touch.clientX - rect.left) * dpr;
    const y = (touch.clientY - rect.top) * dpr;
    return { x, y };
  };

  const handleTouchStart = useCallback(
    (event) => {
      const pos = getTouchPos(event);
      if (!pos) return;
      // prevent default only inside canvas to stop page scroll
      event.preventDefault();
      startDrawing(pos);
    },
    [startDrawing, canvasRef]
  );

  const handleTouchMove = useCallback(
    (event) => {
      const pos = getTouchPos(event);
      if (!pos) return;
      event.preventDefault();
      continueDrawing(pos);
    },
    [continueDrawing, canvasRef]
  );

  const handleTouchEnd = useCallback(
    (event) => {
      const pos = getTouchPos(event);
      if (!pos) return;
      event.preventDefault();
      stopDrawing(pos);
    },
    [stopDrawing, canvasRef]
  );

  return {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd
  };
};
