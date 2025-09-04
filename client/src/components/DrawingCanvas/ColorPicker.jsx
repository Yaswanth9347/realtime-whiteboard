// components/DrawingCanvas/ColorPicker.jsx
import React, { useState } from 'react';
import './ColorPicker.css';

const ColorPicker = ({ currentColor, onColorChange }) => {
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  const presetColors = [
    '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF',
    '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', '#800080',
    '#FFC0CB', '#A52A2A', '#808080', '#008000', '#000080'
  ];

  return (
    <div className="color-picker">
      {/* Current Color Display */}
      <div 
        className="current-color"
        style={{ backgroundColor: currentColor }}
        onClick={() => setShowCustomPicker(!showCustomPicker)}
      />

      {/* Preset Colors */}
      <div className="preset-colors">
        {presetColors.map(color => (
          <button
            key={color}
            className={`color-btn ${currentColor === color ? 'active' : ''}`}
            style={{ backgroundColor: color }}
            onClick={() => onColorChange(color)}
          />
        ))}
      </div>

      {/* Custom Color Picker */}
      {showCustomPicker && (
        <div className="custom-picker">
          <input
            type="color"
            value={currentColor}
            onChange={(e) => onColorChange(e.target.value)}
          />
        </div>
      )}
    </div>
  );
};

export default ColorPicker;
