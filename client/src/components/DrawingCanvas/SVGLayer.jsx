// components/DrawingCanvas/SVGLayer.jsx
import React, { forwardRef, useState } from 'react';

const SVGLayer = forwardRef(({ onShapeAdd, width = 1920, height = 1080 }, ref) => {
  const [shapes, setShapes] = useState([]);
  const [selectedShape, setSelectedShape] = useState(null);

  const handleShapeClick = (shapeId) => {
    setSelectedShape(shapeId);
  };

  const addShape = (shapeData) => {
    const newShape = {
      id: `shape_${Date.now()}_${Math.random()}`,
      ...shapeData
    };
    setShapes(prev => [...prev, newShape]);
    onShapeAdd(newShape);
  };

  return (
    <svg
      ref={ref}
      width={width}
      height={height}
      className="svg-layer"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'auto',
        zIndex: 2
      }}
    >
      {/* Render shapes */}
      {shapes.map(shape => {
        switch (shape.type) {
          case 'rectangle':
            return (
              <rect
                key={shape.id}
                x={shape.x}
                y={shape.y}
                width={shape.width}
                height={shape.height}
                fill={shape.fillColor || 'transparent'}
                stroke={shape.strokeColor}
                strokeWidth={shape.strokeWidth}
                onClick={() => handleShapeClick(shape.id)}
                className={selectedShape === shape.id ? 'selected-shape' : ''}
              />
            );
          case 'circle':
            return (
              <circle
                key={shape.id}
                cx={shape.x}
                cy={shape.y}
                r={shape.radius}
                fill={shape.fillColor || 'transparent'}
                stroke={shape.strokeColor}
                strokeWidth={shape.strokeWidth}
                onClick={() => handleShapeClick(shape.id)}
                className={selectedShape === shape.id ? 'selected-shape' : ''}
              />
            );
          case 'line':
            return (
              <line
                key={shape.id}
                x1={shape.x1}
                y1={shape.y1}
                x2={shape.x2}
                y2={shape.y2}
                stroke={shape.strokeColor}
                strokeWidth={shape.strokeWidth}
                onClick={() => handleShapeClick(shape.id)}
                className={selectedShape === shape.id ? 'selected-shape' : ''}
              />
            );
          case 'text':
            return (
              <text
                key={shape.id}
                x={shape.x}
                y={shape.y}
                fontSize={shape.fontSize}
                fill={shape.color}
                onClick={() => handleShapeClick(shape.id)}
                className={selectedShape === shape.id ? 'selected-shape' : ''}
              >
                {shape.text}
              </text>
            );
          default:
            return null;
        }
      })}
    </svg>
  );
});

SVGLayer.displayName = 'SVGLayer';
export default SVGLayer;
