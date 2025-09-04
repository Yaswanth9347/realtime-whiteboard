// components/DrawingCanvas/CanvasLayer.jsx
import React, { forwardRef, useEffect } from 'react';

const CanvasLayer = forwardRef(({
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  width = 1920,
  height = 1080
}, ref) => {

  // Prevent default touch behaviors[75]
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const preventDefault = (e) => {
      e.preventDefault();
    };

    // Disable default touch behaviors
    canvas.addEventListener('touchstart', preventDefault, { passive: false });
    canvas.addEventListener('touchmove', preventDefault, { passive: false });
    canvas.addEventListener('touchend', preventDefault, { passive: false });

    return () => {
      canvas.removeEventListener('touchstart', preventDefault);
      canvas.removeEventListener('touchmove', preventDefault);
      canvas.removeEventListener('touchend', preventDefault);
    };
  }, [ref]);

  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      className="drawing-canvas"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp} // Stop drawing when mouse leaves
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        cursor: 'crosshair',
        touchAction: 'none' // Disable browser touch handling
      }}
    />
  );
});

CanvasLayer.displayName = 'CanvasLayer';
export default CanvasLayer;
