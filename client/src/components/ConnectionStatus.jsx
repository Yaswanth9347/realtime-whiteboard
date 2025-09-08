// client/src/components/ConnectionStatus.jsx
import React, { useMemo } from 'react';
import './ConnectionStatus.css';

/**
 * ConnectionStatus
 * Displays current socket connection state with simple indicator + text.
 *
 * Props:
 *  - isConnected: boolean
 *  - connectionError: string | null
 *  - reconnectAttempts: number
 *  - maxReconnects: number (optional, default = 5)
 */
const ConnectionStatus = ({
  isConnected,
  connectionError,
  reconnectAttempts = 0,
  maxReconnects = 5,
}) => {
  const { statusClass, statusText } = useMemo(() => {
    if (connectionError) {
      return {
        statusClass: 'status-error',
        statusText: `Error: ${String(connectionError)}`,
      };
    }
    if (!isConnected && reconnectAttempts > 0) {
      return {
        statusClass: 'status-connecting',
        statusText: `Reconnecting... (${reconnectAttempts}/${maxReconnects})`,
      };
    }
    if (!isConnected) {
      return {
        statusClass: 'status-connecting',
        statusText: 'Connecting...',
      };
    }
    return {
      statusClass: 'status-connected',
      statusText: 'Connected',
    };
  }, [isConnected, connectionError, reconnectAttempts, maxReconnects]);

  return (
    <div
      className={`connection-status ${statusClass}`}
      role="status"
      aria-live="polite"
    >
      <span className="status-indicator" aria-hidden="true" />
      <span className="status-text">{statusText}</span>
    </div>
  );
};

export default ConnectionStatus;
