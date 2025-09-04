// hooks/useTouchEvents.js
import { useCallback } from 'react';

export const useTouchEvents = ({
  startDrawing,
  continueDrawing,
  stopDrawing,
  canvasRef
}) => {

  const handleTouchStart = useCallback((event) => {
    event.preventDefault(); // Prevent scrolling[75]
    startDrawing(event);
  }, [startDrawing]);

  const handleTouchMove = useCallback((event) => {
    event.preventDefault(); // Prevent scrolling
    continueDrawing(event);
  }, [continueDrawing]);

  const handleTouchEnd = useCallback((event) => {
    event.preventDefault();
    stopDrawing(event);
  }, [stopDrawing]);

  return {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd
  };
};
