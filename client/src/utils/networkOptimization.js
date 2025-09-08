// client/src/utils/networkOptimization.js

/**
 * DrawingDataBuffer
 * Buffers points locally and flushes them in batches to reduce network spam.
 * Optional auto-flush interval ensures stale points are sent out.
 */
class DrawingDataBuffer {
  /**
   * @param {number} flushInterval - min ms between flushes
   * @param {number} maxBufferSize - max points before forced flush
   * @param {boolean} autoFlush - whether to auto-flush on interval
   */
  constructor(flushInterval = 50, maxBufferSize = 200, autoFlush = false) {
    this.buffer = [];
    this.flushInterval = flushInterval;
    this.maxBufferSize = maxBufferSize;
    this.lastFlush = 0;
    this.autoFlush = autoFlush;
    this._interval = null;

    if (this.autoFlush) {
      this._interval = setInterval(() => this.flush(), this.flushInterval);
    }
  }

  /**
   * Add a point to the buffer.
   * Returns a batch if flush conditions met, else null.
   */
  addPoint(point) {
    if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') {
      return null;
    }
    this.buffer.push(point);

    const now = Date.now();
    if (
      this.buffer.length >= this.maxBufferSize ||
      now - this.lastFlush >= this.flushInterval
    ) {
      return this.flush();
    }
    return null;
  }

  /**
   * Flush buffered points as a new array.
   * Returns null if nothing to flush.
   */
  flush() {
    if (this.buffer.length === 0) return null;
    const data = [...this.buffer];
    this.buffer = [];
    this.lastFlush = Date.now();
    return data;
  }

  /**
   * Stop auto-flush timer (call on component unmount).
   */
  dispose() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }
}

/**
 * Compress drawing data (round coordinates, drop extra precision).
 * @param {object} data - {points: [{x,y,...}]}
 * @param {number} tolerance - decimal precision, default 1 (0.1 units)
 * @returns {object}
 */
export const compressDrawingData = (data, tolerance = 1) => {
  if (data && Array.isArray(data.points)) {
    return {
      ...data,
      points: data.points.map((p) => ({
        ...p,
        x: Math.round(p.x * 10 ** tolerance) / 10 ** tolerance,
        y: Math.round(p.y * 10 ** tolerance) / 10 ** tolerance
      }))
    };
  }
  return data;
};

/**
 * Decompress drawing data (currently passthrough).
 * Could restore higher-precision values if stored separately.
 */
export const decompressDrawingData = (data) => {
  return data;
};

export { DrawingDataBuffer };
