// client/src/components/DrawingCanvas/DrawingTools.jsx
import React, { useMemo, useCallback } from 'react';
import ColorPicker from './ColorPicker';
import './DrawingTools.css';

/**
 * DrawingTools
 *
 * Props (supports both handler naming conventions for backward-compat):
 *  - currentTool, currentColor, lineWidth
 *  - onToolChange OR setCurrentTool
 *  - onColorChange OR setCurrentColor
 *  - onLineWidthChange OR setLineWidth
 *  - onClear, onUndo, onRedo
 *  - undoDisabled, redoDisabled
 */
const DrawingTools = React.memo((props) => {
  const {
    currentTool,
    currentColor,
    lineWidth,
    onToolChange,
    onColorChange,
    onLineWidthChange,
    setCurrentTool,
    setCurrentColor,
    setLineWidth,
    onClear,
    onUndo,
    onRedo,
    undoDisabled,
    redoDisabled
  } = props;

  // Accept either "onX" or "setX" handler names for compatibility
  const handleToolChange = useCallback((tool) => {
    if (typeof onToolChange === 'function') return onToolChange(tool);
    if (typeof setCurrentTool === 'function') return setCurrentTool(tool);
    return undefined;
  }, [onToolChange, setCurrentTool]);

  const handleColorChange = useCallback((color) => {
    if (typeof onColorChange === 'function') return onColorChange(color);
    if (typeof setCurrentColor === 'function') return setCurrentColor(color);
    return undefined;
  }, [onColorChange, setCurrentColor]);

  const handleLineWidthChange = useCallback((w) => {
    if (typeof onLineWidthChange === 'function') return onLineWidthChange(w);
    if (typeof setLineWidth === 'function') return setLineWidth(w);
    return undefined;
  }, [onLineWidthChange, setLineWidth]);

  const tools = useMemo(() => ([
    { id: 'pen', name: 'Pen', icon: '✏️' },
    { id: 'rectangle', name: 'Rectangle', icon: '⬜' },
    { id: 'circle', name: 'Circle', icon: '⭕' },
    { id: 'line', name: 'Line', icon: '📏' },
    { id: 'text', name: 'Text', icon: 'T' },
    { id: 'eraser', name: 'Eraser', icon: '🧽' }
  ]), []);

  const lineWidths = useMemo(() => [1, 2, 4, 6, 8, 12, 16], []);

  return (
    <aside className="drawing-tools" aria-label="Drawing tools">
      {/* Tool Selection */}
      <div className="tool-section">
        <h4 className="section-title">Tools</h4>
        <div className="tool-grid" role="toolbar" aria-label="Select drawing tool">
          {tools.map(tool => (
            <button
              key={tool.id}
              type="button"
              className={`tool-btn ${currentTool === tool.id ? 'active' : ''}`}
              onClick={() => handleToolChange(tool.id)}
              title={tool.name}
              aria-pressed={currentTool === tool.id}
            >
              <span className="tool-icon" aria-hidden="true">{tool.icon}</span>
              <span className="visually-hidden">{tool.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Color Selection */}
      <div className="tool-section">
        <h4 className="section-title">Color</h4>
        <ColorPicker
          currentColor={currentColor}
          onColorChange={handleColorChange}
        />
      </div>

      {/* Line Width Selection */}
      <div className="tool-section">
        <h4 className="section-title">Line Width</h4>
        <div className="line-width-selector" role="radiogroup" aria-label="Select line width">
          {lineWidths.map(width => (
            <button
              key={width}
              type="button"
              className={`line-width-btn ${lineWidth === width ? 'active' : ''}`}
              onClick={() => handleLineWidthChange(width)}
              aria-pressed={lineWidth === width}
              title={`${width}px`}
            >
              <div
                className="line-preview"
                style={{
                  height: `${Math.min(width, 8)}px`,
                  backgroundColor: currentColor || '#000'
                }}
                aria-hidden="true"
              />
              <span className="line-label">{width}px</span>
            </button>
          ))}
        </div>
      </div>

      {/* Canvas Actions */}
      <div className="tool-section">
        <h4 className="section-title">Actions</h4>
        <div className="action-buttons">
          <button
            type="button"
            className="action-btn"
            onClick={typeof onClear === 'function' ? onClear : undefined}
            title="Clear the canvas for everyone"
            aria-label="Clear canvas"
          >
            Clear Canvas
          </button>
          <button
            type="button"
            className="action-btn"
            onClick={typeof onUndo === 'function' ? onUndo : undefined}
            disabled={!!undoDisabled}
            aria-disabled={!!undoDisabled}
            title="Undo"
          >
            Undo
          </button>
          <button
            type="button"
            className="action-btn"
            onClick={typeof onRedo === 'function' ? onRedo : undefined}
            disabled={!!redoDisabled}
            aria-disabled={!!redoDisabled}
            title="Redo"
          >
            Redo
          </button>
        </div>
      </div>
    </aside>
  );
});

export default DrawingTools;
