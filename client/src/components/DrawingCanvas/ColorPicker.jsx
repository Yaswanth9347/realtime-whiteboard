// client/src/components/DrawingCanvas/ColorPicker.jsx
import React, { useState } from 'react';
import './ColorPicker.css';

const ColorPicker = ({ currentColor = '#000000', onColorChange }) => {
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  const presetColors = [
    '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF',
    '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', '#800080',
    '#FFC0CB', '#A52A2A', '#808080', '#008000', '#000080'
  ];

  const handleChange = (color) => {
    if (typeof onColorChange === 'function') {
      onColorChange(color);
    }
  };

  return (
    <div className="color-picker">
      {/* Current Color Display */}
      <div
        className="current-color"
        style={{ backgroundColor: currentColor }}
        onClick={() => setShowCustomPicker(!showCustomPicker)}
        role="button"
        aria-label={`Current color: ${currentColor}. Click to ${showCustomPicker ? 'hide' : 'show'} custom picker`}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setShowCustomPicker(!showCustomPicker);
          }
        }}
      />

      {/* Preset Colors */}
      <div className="preset-colors">
        {presetColors.map((color) => (
          <button
            key={color}
            type="button"
            className={`color-btn ${currentColor === color ? 'active' : ''}`}
            style={{ backgroundColor: color }}
            onClick={() => handleChange(color)}
            aria-label={`Select color ${color}`}
          />
        ))}
      </div>

      {/* Custom Color Picker */}
      {showCustomPicker && (
        <div className="custom-picker">
          <input
            type="color"
            value={currentColor}
            onChange={(e) => handleChange(e.target.value)}
            aria-label="Custom color picker"
          />
        </div>
      )}
    </div>
  );
};

export default ColorPicker;
