// client/src/utils/networkOptimization.js

class DrawingDataBuffer {
  constructor(flushInterval = 50) { // 20fps for drawing data
    this.buffer = [];
    this.flushInterval = flushInterval;
    this.lastFlush = 0;
  }

  addPoint(point) {
    this.buffer.push(point);
    
    const now = Date.now();
    if (now - this.lastFlush >= this.flushInterval) {
      return this.flush();
    }
    
    return null;
  }

  flush() {
    if (this.buffer.length === 0) return null;
    
    const data = [...this.buffer];
    this.buffer = [];
    this.lastFlush = Date.now();
    
    return data;
  }
}

// Message compression for large drawing data
export const compressDrawingData = (data) => {
  // Simple coordinate compression
  if (data.points && Array.isArray(data.points)) {
    return {
      ...data,
      points: data.points.map(point => ({
        x: Math.round(point.x * 10) / 10, // Round to 1 decimal
        y: Math.round(point.y * 10) / 10
      }))
    };
  }
  return data;
};

export { DrawingDataBuffer };
