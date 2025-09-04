// client/src/components/ConnectionStatus.jsx
import React from 'react';
import './ConnectionStatus.css';

const ConnectionStatus = ({ isConnected, connectionError, reconnectAttempts }) => {
  const getStatusClass = () => {
    if (connectionError) return 'status-error';
    if (!isConnected) return 'status-connecting';
    return 'status-connected';
  };

  const getStatusText = () => {
    if (connectionError) return `Error: ${connectionError}`;
    if (!isConnected && reconnectAttempts > 0) return `Reconnecting... (${reconnectAttempts}/5)`;
    if (!isConnected) return 'Connecting...';
    return 'Connected';
  };

  return (
    <div className={`connection-status ${getStatusClass()}`}>
      <div className="status-indicator" />
      <span className="status-text">{getStatusText()}</span>
    </div>
  );
};

export default ConnectionStatus;
