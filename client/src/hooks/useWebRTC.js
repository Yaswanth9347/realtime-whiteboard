// client/src/hooks/useWebRTC.js
import { useState, useEffect, useRef, useCallback } from 'react';
import Peer from 'simple-peer';

/**
 * useWebRTC
 * - Manages local media, simple-peer connections and remote streams
 * - socket: socket.io client instance (must be stable)
 * - roomId: room identifier (used for signaling join)
 *
 * Returns:
 *  { localStream, remoteStreams, peers, leave }
 *
 * Note: caller must call leave() when user intentionally leaves room.
 */
export const useWebRTC = (socket, roomId) => {
  const [remoteStreams, setRemoteStreams] = useState({}); // { peerId: MediaStream }
  const [peers, setPeers] = useState({}); // { peerId: PeerInstance }
  const peersRef = useRef({}); // mutable ref storage for peers
  const localStreamRef = useRef(null); // actual MediaStream ref
  const mountedRef = useRef(true);

  // Helper to safely set remoteStreams (functional update)
  const addRemoteStream = (peerId, stream) => {
    setRemoteStreams((prev) => {
      if (prev[peerId] && prev[peerId] === stream) return prev;
      return { ...prev, [peerId]: stream };
    });
  };

  const removeRemoteStream = (peerId) => {
    setRemoteStreams((prev) => {
      if (!prev[peerId]) return prev;
      const copy = { ...prev };
      delete copy[peerId];
      return copy;
    });
  };

  // Acquire local media once
  useEffect(() => {
    mountedRef.current = true;
    let stopped = false;

    async function initMedia() {
      if (!navigator?.mediaDevices?.getUserMedia) {
        console.warn('Media API not available in this environment.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        if (stopped) {
          // If the component unmounted before stream returned, stop tracks immediately
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        // don't set state for localStream to keep hook lightweight; expose via ref
      } catch (err) {
        console.error('Failed to get user media', err);
      }
    }

    initMedia();

    return () => {
      stopped = true;
      // do not stop tracks here — leave() or unmount cleanup will handle it
    };
  }, []);

  // Cleanup function used both on unmount and explicit leave
  const cleanupPeers = useCallback(() => {
    try {
      Object.keys(peersRef.current).forEach((id) => {
        const p = peersRef.current[id];
        try { p.destroy(); } catch (e) { /* ignore */ }
      });
    } catch (e) {
      // ignore
    }
    peersRef.current = {};
    setPeers({});
    setRemoteStreams({});
    // Stop local tracks
    try {
      const s = localStreamRef.current;
      if (s && s.getTracks) s.getTracks().forEach((t) => t.stop());
    } catch (e) {
      // ignore
    }
    localStreamRef.current = null;
  }, []);

  // leave hook for caller
  const leave = useCallback(() => {
    cleanupPeers();
    // emit a leave event if needed (optional)
    try {
      if (socket && socket.connected) {
        socket.emit('webrtc-leave', { roomId });
      }
    } catch (e) {
      // ignore
    }
  }, [cleanupPeers, socket, roomId]);

  // Signal handlers
  // Use stable callbacks referencing current refs
  const handleOffer = useCallback((payload) => {
    const { from, offer } = payload || {};
    if (!from || !offer) return;
    // if we already have a peer for this id, ignore duplicate offers
    if (peersRef.current[from]) {
      // signal anyway in case it's renegotiation
      try { peersRef.current[from].signal(offer); } catch (e) { /* ignore */ }
      return;
    }

    const initiator = false;
    const peer = new Peer({
      initiator,
      trickle: true,
      stream: localStreamRef.current || undefined
    });

    peer.on('signal', (signalData) => {
      try {
        socket.emit('webrtc-answer', { target: from, answer: signalData });
      } catch (e) {
        console.warn('Failed to emit webrtc-answer', e);
      }
    });

    peer.on('stream', (remoteStream) => {
      addRemoteStream(from, remoteStream);
    });

    peer.on('close', () => {
      // cleanup when peer closes
      delete peersRef.current[from];
      setPeers({ ...peersRef.current });
      removeRemoteStream(from);
    });

    peer.on('error', (err) => {
      console.warn('Peer error from', from, err);
    });

    try {
      peer.signal(offer);
    } catch (e) {
      console.warn('Failed to signal incoming offer', e);
    }

    peersRef.current[from] = peer;
    setPeers({ ...peersRef.current });
  }, [socket]);

  const handleAnswer = useCallback((payload) => {
    const { from, answer } = payload || {};
    if (!from || !answer) return;
    const peer = peersRef.current[from];
    if (peer) {
      try {
        peer.signal(answer);
      } catch (e) {
        console.warn('Failed to signal answer for', from, e);
      }
    }
  }, []);

  const handleCandidate = useCallback((payload) => {
    const { from, candidate } = payload || {};
    if (!from || !candidate) return;
    const peer = peersRef.current[from];
    if (peer) {
      try {
        peer.signal(candidate);
      } catch (e) {
        console.warn('Failed to apply candidate for', from, e);
      }
    }
  }, []);

  const handleUserJoined = useCallback((payload) => {
    const { userId } = payload || {};
    if (!userId) return;
    // If we already have a connection, skip
    if (peersRef.current[userId]) return;

    const initiator = true;
    const peer = new Peer({
      initiator,
      trickle: true,
      stream: localStreamRef.current || undefined
    });

    peer.on('signal', (signalData) => {
      try {
        socket.emit('webrtc-offer', { target: userId, offer: signalData });
      } catch (e) {
        console.warn('Failed to emit webrtc-offer', e);
      }
    });

    peer.on('stream', (remoteStream) => {
      addRemoteStream(userId, remoteStream);
    });

    peer.on('close', () => {
      delete peersRef.current[userId];
      setPeers({ ...peersRef.current });
      removeRemoteStream(userId);
    });

    peer.on('error', (err) => {
      console.warn('Peer error (initiator) for', userId, err);
    });

    peersRef.current[userId] = peer;
    setPeers({ ...peersRef.current });
  }, [socket]);

  // Set up socket listeners when socket/roomId/localStream available
  useEffect(() => {
    if (!socket || !roomId) return undefined;

    // ensure listeners are not duplicated
    socket.off('webrtc-offer', handleOffer);
    socket.off('webrtc-answer', handleAnswer);
    socket.off('webrtc-candidate', handleCandidate);
    socket.off('user-joined', handleUserJoined);

    socket.on('webrtc-offer', handleOffer);
    socket.on('webrtc-answer', handleAnswer);
    socket.on('webrtc-candidate', handleCandidate);
    socket.on('user-joined', handleUserJoined);

    // announce presence (ask server to notify existing peers)
    try {
      socket.emit('webrtc-join', { roomId });
    } catch (e) {
      console.warn('Failed to emit webrtc-join', e);
    }

    // cleanup when socket changes / component unmounts
    return () => {
      try {
        socket.off('webrtc-offer', handleOffer);
        socket.off('webrtc-answer', handleAnswer);
        socket.off('webrtc-candidate', handleCandidate);
        socket.off('user-joined', handleUserJoined);
      } catch (e) {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, roomId, handleOffer, handleAnswer, handleCandidate, handleUserJoined]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      cleanupPeers();
    };
  }, [cleanupPeers]);

  // Expose localStream via getter rather than state to avoid re-renders
  const localStream = localStreamRef.current;

  // Lightweight peer list to return (not full Peer instances)
  const peerList = Object.keys(peersRef.current);

  return {
    localStream,
    remoteStreams,
    peers: peerList,
    leave
  };
};
