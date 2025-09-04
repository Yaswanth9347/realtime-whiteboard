// utils/drawingUtils.js
export const optimizeCanvasRendering = (ctx) => {
  // Use integer coordinates to avoid sub-pixel rendering
  ctx.translate(0.5, 0.5);
  
  // Enable hardware acceleration
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  
  // Set optimal line rendering
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
};

export const batchDrawOperations = (ctx, operations) => {
  ctx.save();
  
  operations.forEach(op => {
    switch (op.type) {
      case 'line':
        ctx.beginPath();
        ctx.strokeStyle = op.color;
        ctx.lineWidth = op.width;
        ctx.moveTo(op.from.x, op.from.y);
        ctx.lineTo(op.to.x, op.to.y);
        ctx.stroke();
        break;
      // Add other operation types
    }
  });
  
  ctx.restore();
};
