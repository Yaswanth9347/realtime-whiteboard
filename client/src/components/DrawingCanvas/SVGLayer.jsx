// client/src/components/DrawingCanvas/SVGLayer.jsx
import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useState
} from 'react';

/**
 * SVGLayer
 *
 * A lightweight, safe SVG overlay used for shapes and cursors.
 * Exposes imperative handlers via ref:
 *   - addShape(shapeData) -> returns the created shape object
 *   - clearShapes()
 *
 * Props:
 *  - onShapeAdd(shape)  optional callback called when a shape is added
 *  - width, height      logical canvas size (defaults to 1920x1080)
 *  - className          optional css class
 */
const SVGLayer = forwardRef(({
  onShapeAdd,
  width = 1920,
  height = 1080,
  className = '',
  style = {}
}, ref) => {
  const [shapes, setShapes] = useState([]);

  // normalize and validate shape inputs, return a sanitized shape object
  const makeShape = useCallback((raw) => {
    const baseId = `shape_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const type = (raw?.type || '').toString().toLowerCase();

    const common = {
      id: raw?.id ? String(raw.id) : baseId,
      type,
      createdAt: Date.now()
    };

    if (type === 'rectangle' || type === 'rect') {
      return {
        ...common,
        type: 'rect',
        x: Number(raw.x || 0),
        y: Number(raw.y || 0),
        width: Number(raw.width || raw.w || 0),
        height: Number(raw.height || raw.h || 0),
        fillColor: raw.fillColor || raw.fill || 'transparent',
        strokeColor: raw.strokeColor || raw.stroke || '#000',
        strokeWidth: Number(raw.strokeWidth || raw.strokeWidth === 0 ? raw.strokeWidth : raw.strokeWidth || 1)
      };
    }

    if (type === 'circle') {
      return {
        ...common,
        type: 'circle',
        cx: Number(raw.cx || raw.x || 0),
        cy: Number(raw.cy || raw.y || 0),
        r: Number(raw.r || raw.radius || 0),
        fillColor: raw.fillColor || raw.fill || 'transparent',
        strokeColor: raw.strokeColor || raw.stroke || '#000',
        strokeWidth: Number(raw.strokeWidth || 1)
      };
    }

    if (type === 'line') {
      return {
        ...common,
        type: 'line',
        x1: Number(raw.x1 || 0),
        y1: Number(raw.y1 || 0),
        x2: Number(raw.x2 || 0),
        y2: Number(raw.y2 || 0),
        strokeColor: raw.strokeColor || raw.stroke || '#000',
        strokeWidth: Number(raw.strokeWidth || 1)
      };
    }

    if (type === 'text') {
      return {
        ...common,
        type: 'text',
        x: Number(raw.x || 0),
        y: Number(raw.y || 0),
        text: String(raw.text || ''),
        fontSize: Number(raw.fontSize || 14),
        fillColor: raw.fillColor || raw.color || '#000'
      };
    }

    if (type === 'path') {
      // expect points: [{x,y}, ...] or d (path string)
      const pts = Array.isArray(raw.points) ? raw.points
        .filter(p => p && typeof p.x === 'number' && typeof p.y === 'number')
        .map(p => ({ x: Number(p.x), y: Number(p.y) })) : [];
      return {
        ...common,
        type: 'path',
        points: pts,
        strokeColor: raw.strokeColor || raw.stroke || '#000',
        strokeWidth: Number(raw.strokeWidth || 1),
        fill: raw.fill || false
      };
    }

    // fallback: unknown shape -> null
    return null;
  }, []);

  // add shape programmatically or from UI
  const addShape = useCallback((shapeData) => {
    const normalized = makeShape(shapeData);
    if (!normalized) return null;
    setShapes((prev) => {
      const next = [...prev, normalized];
      return next;
    });
    try {
      if (typeof onShapeAdd === 'function') {
        // call asynchronously to avoid blocking render
        setTimeout(() => onShapeAdd(normalized), 0);
      }
    } catch (e) {
      // ignore callback errors
    }
    return normalized;
  }, [makeShape, onShapeAdd]);

  const clearShapes = useCallback(() => {
    setShapes([]);
  }, []);

  // expose imperative handlers to parent via ref
  useImperativeHandle(ref, () => ({
    addShape,
    clearShapes,
    getShapes: () => shapes.slice()
  }), [addShape, clearShapes, shapes]);

  // stable render mapping
  const shapeNodes = useMemo(() => shapes.map((shape) => {
    const key = shape.id;
    switch (shape.type) {
      case 'rect':
        return (
          <rect
            key={key}
            x={shape.x}
            y={shape.y}
            width={shape.width}
            height={shape.height}
            fill={shape.fillColor}
            stroke={shape.strokeColor}
            strokeWidth={shape.strokeWidth}
            data-shape-id={shape.id}
            style={{ cursor: 'pointer' }}
          />
        );
      case 'circle':
        return (
          <circle
            key={key}
            cx={shape.cx}
            cy={shape.cy}
            r={shape.r}
            fill={shape.fillColor}
            stroke={shape.strokeColor}
            strokeWidth={shape.strokeWidth}
            data-shape-id={shape.id}
            style={{ cursor: 'pointer' }}
          />
        );
      case 'line':
        return (
          <line
            key={key}
            x1={shape.x1}
            y1={shape.y1}
            x2={shape.x2}
            y2={shape.y2}
            stroke={shape.strokeColor}
            strokeWidth={shape.strokeWidth}
            data-shape-id={shape.id}
            style={{ cursor: 'pointer' }}
          />
        );
      case 'text':
        return (
          <text
            key={key}
            x={shape.x}
            y={shape.y}
            fontSize={shape.fontSize}
            fill={shape.fillColor}
            data-shape-id={shape.id}
            style={{ cursor: 'pointer', userSelect: 'none' }}
          >
            {shape.text}
          </text>
        );
      case 'path': {
        // convert points to path d
        const pts = Array.isArray(shape.points) ? shape.points : [];
        if (pts.length === 0) return null;
        const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
        return (
          <path
            key={key}
            d={d}
            fill={shape.fill ? (shape.fillColor || 'none') : 'none'}
            stroke={shape.strokeColor}
            strokeWidth={shape.strokeWidth}
            data-shape-id={shape.id}
            style={{ cursor: 'pointer' }}
          />
        );
      }
      default:
        return null;
    }
  }), [shapes]);

  // wrapper svg props
  const svgProps = useMemo(() => ({
    width: '100%',
    height: '100%',
    viewBox: `0 0 ${Number(width) || 1920} ${Number(height) || 1080}`,
    preserveAspectRatio: 'none',
    role: 'img',
    'aria-label': 'drawing layer'
  }), [width, height]);

  return (
    <svg
      className={`svg-layer ${className}`}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'auto',
        zIndex: 2,
        width: '100%',
        height: '100%',
        ...style
      }}
      {...svgProps}
    >
      <g>{shapeNodes}</g>
    </svg>
  );
});

SVGLayer.displayName = 'SVGLayer';
export default SVGLayer;
