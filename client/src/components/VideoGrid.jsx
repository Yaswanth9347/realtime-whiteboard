// client/src/components/VideoGrid.jsx
import React, { useEffect, useRef } from 'react';
import './VideoGrid.css';

/**
 * VideoTile
 * - Manages a single <video> element and safely assigns srcObject.
 * - Cleans up the srcObject reference on unmount or when stream changes.
 */
const VideoTile = ({ stream, isLocal = false, label = '', onClick }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    // Only assign if different to avoid reassignments
    if (el.srcObject !== stream) {
      try {
        el.srcObject = stream;
      } catch (e) {
        // Some browsers may throw for certain MediaStream-like objects; ignore
        // but log in dev
        if (process.env.NODE_ENV !== 'production') console.warn('Failed to set srcObject', e);
      }
    }

    // Try to play (some browsers require user gesture; ignore failure)
    const playPromise = el.play && el.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise.catch(() => {
        // autoplay blocked — user gesture required. ignore.
      });
    }

    return () => {
      // Clean up: detach srcObject to avoid holding onto tracks if component unmounts
      try {
        if (el && el.srcObject) {
          // don't stop tracks here — we don't "own" remote streams
          el.srcObject = null;
        }
      } catch (e) {
        // ignore
      }
    };
  }, [stream]);

  return (
    <div className={`video-tile ${isLocal ? 'local' : 'remote'}`} onClick={onClick} role="group" aria-label={label}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={!!isLocal}
        className="video-element"
      />
      {label && <div className="video-label">{label}</div>}
    </div>
  );
};

/**
 * VideoGrid
 * - localStream: MediaStream (optional)
 * - remoteStreams: object mapping peerId -> MediaStream OR array [{ id, stream }]
 *
 * Accepts both forms for flexibility.
 */
const VideoGrid = ({ localStream, remoteStreams = {}, localLabel = 'You' }) => {
  // Normalize remoteStreams to array of { id, stream }
  let remotes = [];
  if (Array.isArray(remoteStreams)) {
    remotes = remoteStreams.map((r) => ({ id: r.id || r.peerId || Math.random().toString(36).slice(2, 7), stream: r.stream || r }));
  } else if (remoteStreams && typeof remoteStreams === 'object') {
    remotes = Object.entries(remoteStreams).map(([id, stream]) => ({ id, stream }));
  }

  return (
    <div className="video-grid" aria-live="polite">
      {localStream && (
        <VideoTile stream={localStream} isLocal={true} label={localLabel} />
      )}

      {remotes.map(({ id, stream }) => (
        <VideoTile key={id} stream={stream} isLocal={false} label={id} />
      ))}
    </div>
  );
};

export default VideoGrid;

