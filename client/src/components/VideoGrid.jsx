// client/src/components/VideoGrid.jsx
import React from 'react';

const VideoGrid = ({ localStream, remoteStreams }) => (
  <div className="video-grid">
    {localStream && (
      <video
        className="video-element"
        ref={el => el && (el.srcObject = localStream)}
        autoPlay
        muted
        playsInline
      />
    )}
    {Object.entries(remoteStreams).map(([peerId, stream]) => (
      <video
        key={peerId}
        className="video-element"
        ref={el => el && (el.srcObject = stream)}
        autoPlay
        playsInline
      />
    ))}
  </div>
);

export default VideoGrid;


// In your main DrawingCanvas or App component
import VideoGrid from './VideoGrid';
import { useWebRTC } from '../hooks/useWebRTC';

const CollaborationView = ({ socket, roomState }) => {
  const { localStream, remoteStreams, leave } = useWebRTC(socket, roomState.roomId);

  return (
    <div className="collaboration-view">
      <VideoGrid localStream={localStream} remoteStreams={remoteStreams} />
      <button onClick={leave} className="end-call-btn">
        End Call
      </button>
    </div>
  );
};
