// client/src/components/DrawingCanvas/CanvasLayer.jsx
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

  // Prevent default touch behaviors
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const preventDefault = (e) => e.preventDefault();

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

  // Auto-resize canvas to container with devicePixelRatio support
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas.parentElement);

    return () => {
      resizeObserver.disconnect();
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
        touchAction: 'none', // Disable browser touch handling
        display: 'block'
      }}
      role="presentation"
      aria-label="Whiteboard drawing surface"
    />
  );
});

CanvasLayer.displayName = 'CanvasLayer';
export default CanvasLayer;
