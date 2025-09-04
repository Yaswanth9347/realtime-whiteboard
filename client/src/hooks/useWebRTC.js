// client/src/hooks/useWebRTC.js
import { useState, useEffect, useRef, useCallback } from 'react';
import Peer from 'simple-peer';

export const useWebRTC = (socket, roomId) => {
  const [localStream, setLocalStream] = useState(null);
  const [peers, setPeers] = useState({}); // { peerId: PeerInstance }
  const [remoteStreams, setRemoteStreams] = useState({}); // { peerId: MediaStream }
  const peersRef = useRef({});

  // 1. Get local media
  useEffect(() => {
    async function initMedia() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
        setLocalStream(stream);
      } catch (err) {
        console.error('Media error:', err);
      }
    }
    initMedia();
  }, []);

  // 2. Handle new participant
  useEffect(() => {
    if (!socket || !localStream || !roomId) return;

    // Notify existing users
    socket.emit('webrtc-join', { roomId });

    // Listen for join, offers, answers, candidates
    socket.on('webrtc-offer', handleOffer);
    socket.on('webrtc-answer', handleAnswer);
    socket.on('webrtc-candidate', handleCandidate);
    socket.on('user-joined', handleUserJoined);

    return () => {
      socket.off('webrtc-offer', handleOffer);
      socket.off('webrtc-answer', handleAnswer);
      socket.off('webrtc-candidate', handleCandidate);
      socket.off('user-joined', handleUserJoined);
    };
  }, [socket, localStream, roomId]);

  // 3. Create a new peer for each existing user
  const handleUserJoined = useCallback(({ userId }) => {
    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream: localStream
    });

    peer.on('signal', signal => {
      socket.emit('webrtc-offer', {
        target: userId,
        offer: signal
      });
    });

    peer.on('stream', remoteStream => {
      setRemoteStreams(prev => ({ ...prev, [userId]: remoteStream }));
    });

    peersRef.current[userId] = peer;
    setPeers({ ...peersRef.current });
  }, [localStream, socket]);

  // 4. Handle incoming offer
  const handleOffer = useCallback(({ from, offer }) => {
    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream: localStream
    });

    peer.on('signal', answerSignal => {
      socket.emit('webrtc-answer', {
        target: from,
        answer: answerSignal
      });
    });

    peer.signal(offer);

    peer.on('stream', remoteStream => {
      setRemoteStreams(prev => ({ ...prev, [from]: remoteStream }));
    });

    peersRef.current[from] = peer;
    setPeers({ ...peersRef.current });
  }, [localStream, socket]);

  // 5. Handle incoming answer
  const handleAnswer = useCallback(({ from, answer }) => {
    const peer = peersRef.current[from];
    if (peer) peer.signal(answer);
  }, []);

  // 6. Handle new ICE candidate
  const handleCandidate = useCallback(({ from, candidate }) => {
    const peer = peersRef.current[from];
    if (peer) peer.signal(candidate);
  }, []);

  // 7. Cleanup on leave
  const leave = useCallback(() => {
    Object.values(peersRef.current).forEach(peer => peer.destroy());
    peersRef.current = {};
    setPeers({});
    setRemoteStreams({});
    localStream?.getTracks().forEach(track => track.stop());
    setLocalStream(null);
  }, [localStream]);

  return { localStream, remoteStreams, leave };
};
