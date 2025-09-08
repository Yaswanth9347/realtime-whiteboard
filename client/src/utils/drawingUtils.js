// client/src/utils/drawingUtils.js
// Drawing helpers: safe, DPR-aware, defensive utilities for canvas rendering.

/**
 * Configure the canvas element for high-DPI devices and return its 2D context.
 * This sets the canvas.width/height (physical pixels) and CSS size (logical pixels),
 * then applies a transform so subsequent drawing may use logical coordinates.
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {CanvasRenderingContext2D|null}
 */
export function configureCanvas(canvas) {
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) return null;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  // Set the internal pixel size to match DPR
  const width = Math.round(rect.width * dpr);
  const height = Math.round(rect.height * dpr);

  // Only update if changed (avoids clearing canvas every frame unnecessarily)
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Reset transform and scale so drawing can be done in logical coordinates
  // setTransform(a, b, c, d, e, f) replaces the current transform matrix; this is idempotent.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Recommended defaults for crisp lines
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  return ctx;
}

/**
 * Tweak canvas context rendering options. Safe to call multiple times.
 * @param {CanvasRenderingContext2D} ctx
 */
export const optimizeCanvasRendering = (ctx) => {
  if (!ctx || typeof ctx !== 'object') return;

  // idempotent property sets
  ctx.lineCap = ctx.lineCap || 'round';
  ctx.lineJoin = ctx.lineJoin || 'round';
  ctx.imageSmoothingEnabled = typeof ctx.imageSmoothingEnabled === 'boolean'
    ? ctx.imageSmoothingEnabled
    : true;
  try {
    // Some browsers allow imageSmoothingQuality, others ignore it
    ctx.imageSmoothingQuality = ctx.imageSmoothingQuality || 'high';
  } catch (e) {
    // ignore
  }
};

/**
 * Draw a path (array of points) with a single stroke.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} opts - { points: [{x,y}], color, width, compositeOp }
 */
export const drawPath = (ctx, opts = {}) => {
  if (!ctx || !opts || !Array.isArray(opts.points) || opts.points.length === 0) return;

  const { points, color = '#000', width = 2, compositeOp } = opts;

  ctx.save();
  if (compositeOp) ctx.globalCompositeOperation = compositeOp;
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;

  const first = points[0];
  ctx.moveTo(first.x, first.y);

  for (let i = 1; i < points.length; i += 1) {
    const p = points[i];
    if (typeof p.x !== 'number' || typeof p.y !== 'number') continue;
    ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.restore();
};

/**
 * Batch apply drawing operations. Supported op types:
 * - { type: 'line', from: {x,y}, to: {x,y}, color, width }
 * - { type: 'path', points: [{x,y},...], color, width }
 * - { type: 'rect', x, y, w, h, color, width, fill }
 * - { type: 'circle', cx, cy, r, color, width, fill }
 * - { type: 'clear' }  --> clears full canvas (logical coords)
 *
 * This function is defensive: ignores invalid ops and never throws.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<Object>} operations
 */
export const batchDrawOperations = (ctx, operations) => {
  if (!ctx || !Array.isArray(operations)) return;

  ctx.save();
  try {
    for (let i = 0; i < operations.length; i += 1) {
      const op = operations[i];
      if (!op || typeof op.type !== 'string') continue;

      switch (op.type) {
        case 'line': {
          const { from, to, color = '#000', width = 2, compositeOp } = op;
          if (!from || !to) break;
          ctx.save();
          if (compositeOp) ctx.globalCompositeOperation = compositeOp;
          ctx.beginPath();
          ctx.strokeStyle = color;
          ctx.lineWidth = width;
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
          ctx.stroke();
          ctx.restore();
          break;
        }

        case 'path': {
          // path is array of points
          drawPath(ctx, { points: op.points || [], color: op.color, width: op.width, compositeOp: op.compositeOp });
          break;
        }

        case 'rect': {
          const { x, y, w, h, color = '#000', width = 1, fill = false, compositeOp } = op;
          if (typeof x !== 'number' || typeof y !== 'number' || typeof w !== 'number' || typeof h !== 'number') break;
          ctx.save();
          if (compositeOp) ctx.globalCompositeOperation = compositeOp;
          if (fill) {
            ctx.fillStyle = color;
            ctx.fillRect(x, y, w, h);
          } else {
            ctx.strokeStyle = color;
            ctx.lineWidth = width;
            ctx.strokeRect(x, y, w, h);
          }
          ctx.restore();
          break;
        }

        case 'circle': {
          const { cx, cy, r, color = '#000', width = 1, fill = false, compositeOp } = op;
          if (typeof cx !== 'number' || typeof cy !== 'number' || typeof r !== 'number') break;
          ctx.save();
          if (compositeOp) ctx.globalCompositeOperation = compositeOp;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          if (fill) {
            ctx.fillStyle = color;
            ctx.fill();
          } else {
            ctx.strokeStyle = color;
            ctx.lineWidth = width;
            ctx.stroke();
          }
          ctx.restore();
          break;
        }

        case 'clear': {
          // clear entire canvas using logical dimensions; assume transform is set to DPR
          const canvas = ctx.canvas;
          if (canvas) {
            const rect = canvas.getBoundingClientRect();
            // clear full pixel area (uses internal width/height)
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            // reset transform so logical coordinate system persists
            const dpr = window.devicePixelRatio || 1;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          }
          break;
        }

        default:
          // ignore unknown op
          break;
      }
    }
  } catch (e) {
    // swallow errors to avoid crashing the app; log for debugging
    // keep logs minimal in production
    // console.warn('batchDrawOperations error', e);
  } finally {
    ctx.restore();
  }
};
