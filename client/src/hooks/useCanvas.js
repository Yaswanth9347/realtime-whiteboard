// client/src/hooks/useCanvas.js
import { useCallback, useEffect } from 'react';

/**
 * useCanvas
 * Small hook that provides DPR-aware canvas setup + helpers.
 *
 * Usage:
 *   const { setupCanvas, getCanvasContext, clearCanvas, drawLine, clientToCanvasCoords } = useCanvas(canvasRef);
 *
 * Notes:
 * - setupCanvas should be called on mount and on resize.
 * - All coordinate helpers return logical canvas coordinates (CSS pixels), scaled for DPR.
 */

export const useCanvas = (canvasRef) => {
  /**
   * Configure the canvas for high-DPI displays.
   * This is idempotent and safe to call multiple times.
   */
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef?.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    // Calculate physical pixel size
    const width = Math.round(rect.width * dpr);
    const height = Math.round(rect.height * dpr);

    // Only update if changed to avoid clearing unnecessarily
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      // keep CSS size stable (logical pixels)
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    }

    // Apply transform so drawing can use logical coordinates (CSS pixels)
    // setTransform replaces existing transform (idempotent)
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    try {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
    } catch (e) {
      // ignore browsers that don't support imageSmoothingQuality
    }
  }, [canvasRef]);

  /**
   * Return the 2D drawing context or null.
   * Caller should check for null.
   */
  const getCanvasContext = useCallback(() => {
    const canvas = canvasRef?.current;
    if (!canvas) return null;
    return canvas.getContext ? canvas.getContext('2d') : null;
  }, [canvasRef]);

  /**
   * Clear the full canvas (respects internal pixel dimensions).
   */
  const clearCanvas = useCallback(() => {
    const canvas = canvasRef?.current;
    if (!canvas) return;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // restore transform for logical coords
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, [canvasRef]);

  /**
   * Draw a simple line between two logical coordinates (CSS pixels).
   * The function handles internal DPR scaling because setupCanvas sets transform.
   */
  const drawLine = useCallback((fromX, fromY, toX, toY, color = '#000', lineWidth = 2) => {
    const ctx = getCanvasContext();
    if (!ctx) return;
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = String(color || '#000');
    ctx.lineWidth = Number(lineWidth) || 2;
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();
    ctx.restore();
  }, [getCanvasContext]);

  /**
   * Convert client (mouse/touch) coordinates to logical canvas coordinates.
   * Returns { x, y } in logical pixels (matching CSS pixels used by your drawing logic).
   *
   * If you want internal pixel coords, multiply by devicePixelRatio.
   */
  const clientToCanvasCoords = useCallback((clientX, clientY) => {
    const canvas = canvasRef?.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // Convert client coords -> canvas internal pixels, then normalize to logical (CSS) coords
    const internalX = (clientX - rect.left) * (canvas.width / rect.width);
    const internalY = (clientY - rect.top) * (canvas.height / rect.height);

    // Return logical coords (divide by DPR so code that uses logical coordinates works)
    return {
      x: internalX / dpr,
      y: internalY / dpr
    };
  }, [canvasRef]);

  // Auto-setup on mount and on window resize
  useEffect(() => {
    const canvas = canvasRef?.current;
    if (!canvas) return undefined;

    // initial setup
    setupCanvas();

    // resize handler (debounced-ish by browser)
    const onResize = () => {
      setupCanvas();
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, [canvasRef, setupCanvas]);

  return {
    setupCanvas,
    getCanvasContext,
    clearCanvas,
    drawLine,
    clientToCanvasCoords
  };
};

export default useCanvas;
