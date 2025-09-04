// hooks/useCanvas.js
import { useCallback, useEffect } from 'react';

export const useCanvas = (canvasRef) => {
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    // High DPI display support[64][70]
    const devicePixelRatio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * devicePixelRatio;
    canvas.height = rect.height * devicePixelRatio;
    
    ctx.scale(devicePixelRatio, devicePixelRatio);
    
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    
    // Optimize canvas for drawing[70][72]
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
  }, [canvasRef]);

  const getCanvasContext = useCallback(() => {
    return canvasRef.current?.getContext('2d');
  }, [canvasRef]);

  const clearCanvas = useCallback(() => {
    const ctx = getCanvasContext();
    if (!ctx || !canvasRef.current) return;
    
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  }, [canvasRef, getCanvasContext]);

  const drawLine = useCallback((fromX, fromY, toX, toY, color, lineWidth) => {
    const ctx = getCanvasContext();
    if (!ctx) return;

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();
  }, [getCanvasContext]);

  return {
    canvasContext: getCanvasContext(),
    setupCanvas,
    clearCanvas,
    drawLine,
    getCanvasContext
  };
};
