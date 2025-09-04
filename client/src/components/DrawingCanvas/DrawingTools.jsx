// components/DrawingCanvas/DrawingTools.jsx

import React from 'react';
import ColorPicker from './ColorPicker';
import './DrawingTools.css';

const DrawingTools = ({
  currentTool,
  currentColor,
  lineWidth,
  onToolChange,
  onColorChange,
  onLineWidthChange,
  onClear,
  onUndo,
  onRedo,
  undoDisabled,
  redoDisabled
}) => {
  const tools = [
    { id: 'pen', name: 'Pen', icon: '✏️' },
    { id: 'rectangle', name: 'Rectangle', icon: '⬜' },
    { id: 'circle', name: 'Circle', icon: '⭕' },
    { id: 'line', name: 'Line', icon: '📏' },
    { id: 'text', name: 'Text', icon: 'T' },
    { id: 'eraser', name: 'Eraser', icon: '🧽' }
  ];

  const lineWidths = [1, 2, 4, 6, 8, 12, 16];

  return (
    <div className="drawing-tools">
      {/* Tool Selection */}
      <div className="tool-section">
        <h4>Tools</h4>
        <div className="tool-grid">
          {tools.map(tool => (
            <button
              key={tool.id}
              className={`tool-btn ${currentTool === tool.id ? 'active' : ''}`}
              onClick={() => onToolChange(tool.id)}
              title={tool.name}
            >
              {tool.icon}
            </button>
          ))}
        </div>
      </div>

      {/* Color Selection */}
      <div className="tool-section">
        <h4>Color</h4>
        <ColorPicker
          currentColor={currentColor}
          onColorChange={onColorChange}
        />
      </div>

      {/* Line Width Selection */}
      <div className="tool-section">
        <h4>Line Width</h4>
        <div className="line-width-selector">
          {lineWidths.map(width => (
            <button
              key={width}
              className={`line-width-btn ${lineWidth === width ? 'active' : ''}`}
              onClick={() => onLineWidthChange(width)}
            >
              <div
                className="line-preview"
                style={{
                  height: `${Math.min(width, 8)}px`,
                  backgroundColor: currentColor
                }}
              />
              <span>{width}px</span>
            </button>
          ))}
        </div>
      </div>

      {/* Canvas Actions */}
      <div className="tool-section">
        <h4>Actions</h4>
        <div className="action-buttons">
          <button
            className="action-btn"
            onClick={onClear}
          >
            Clear Canvas
          </button>
          <button
            className="action-btn"
            onClick={onUndo}
            disabled={undoDisabled}
          >
            Undo
          </button>
          <button
            className="action-btn"
            onClick={onRedo}
            disabled={redoDisabled}
          >
            Redo
          </button>
        </div>
      </div>
    </div>
  );
};

export default DrawingTools;
