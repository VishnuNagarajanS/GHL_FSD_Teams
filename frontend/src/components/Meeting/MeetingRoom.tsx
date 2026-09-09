'use client';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Avatar from '@/components/UI/Avatar';
import api from '@/lib/api';

interface Participant {
  id: string;
  name: string;
  photo_url?: string;
}

interface MeetingRoomProps {
  meetingId: string;
  participants: Participant[];
  callMode?: 'video' | 'audio';
  onClose: () => void;
}

function RemoteVideoTile({
  participant,
  stream,
  isAudioOnly,
}: {
  participant: Participant;
  stream?: MediaStream;
  isAudioOnly?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasVideo, setHasVideo] = useState(false);

  useEffect(() => {
    if (!videoRef.current || !stream) return;
    videoRef.current.srcObject = stream;

    const checkVideo = () => {
      const vTracks = stream.getVideoTracks();
      setHasVideo(vTracks.length > 0 && vTracks.some(t => t.enabled && t.readyState === 'live'));
    };

    checkVideo();
    stream.addEventListener('addtrack', checkVideo);
    stream.addEventListener('removetrack', checkVideo);

    return () => {
      stream.removeEventListener('addtrack', checkVideo);
      stream.removeEventListener('removetrack', checkVideo);
    };
  }, [stream]);

  return (
    <div
      className="participant-tile"
      style={{
        position: 'relative',
        background: 'linear-gradient(180deg, #111827, #0b0f19)',
        overflow: 'hidden',
      }}
    >
      {/* Remote video element: plays audio and video */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: hasVideo && !isAudioOnly ? 'block' : 'none',
        }}
      />

      {/* Avatar overlay if no video track or in audio-only mode */}
      {(!hasVideo || isAudioOnly) && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, rgba(11, 15, 25, 0.95) 75%)',
            gap: 14,
          }}
        >
          <div style={{ position: 'relative' }}>
            <div className="voice-pulse-ring active" />
            <Avatar name={participant.name} photoUrl={participant.photo_url} size="xl" />
          </div>
          <div style={{ color: '#cbd5e1', fontSize: '0.9375rem', fontWeight: 500 }}>
            {participant.name}
          </div>
        </div>
      )}

      <div className="participant-tile-name">{participant.name}</div>
    </div>
  );
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export default function MeetingRoom({ meetingId, participants, callMode = 'video', onClose }: MeetingRoomProps) {
  const { user, socket } = useAuth();
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(callMode !== 'audio');
  const [screenSharing, setScreenSharing] = useState(false);
  const [activeParticipants, setActiveParticipants] = useState<Participant[]>(participants);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [error, setError] = useState('');
  const [callDuration, setCallDuration] = useState(0);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peerConnections = useRef<Record<string, RTCPeerConnection>>({});

  interface PeerState {
    makingOffer: boolean;
    ignoreOffer: boolean;
  }
  const peerStates = useRef<Record<string, PeerState>>({});
  const pendingCandidates = useRef<Record<string, RTCIceCandidateInit[]>>({});
  const [mediaReady, setMediaReady] = useState(false);

  // Call duration counter
  useEffect(() => {
    const timer = setInterval(() => setCallDuration(d => d + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Deterministic role: higher userId is polite (yields on offer collision)
  const isPolite = useCallback((targetUserId: string) => {
    return (user?.id || '') > targetUserId;
  }, [user?.id]);

  // Drain queued candidates once remote description is set
  const drainCandidates = useCallback(async (targetUserId: string, pc: RTCPeerConnection) => {
    const queue = pendingCandidates.current[targetUserId] || [];
    delete pendingCandidates.current[targetUserId];
    for (const cand of queue) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(cand));
      } catch (err) {
        console.warn('[WebRTC] Error adding queued ICE candidate:', err);
      }
    }
  }, []);

  // Helper to create and configure RTCPeerConnection
  const createPeerConnection = useCallback((targetUserId: string) => {
    if (peerConnections.current[targetUserId]) {
      return peerConnections.current[targetUserId];
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnections.current[targetUserId] = pc;
    peerStates.current[targetUserId] = {
      makingOffer: false,
      ignoreOffer: false,
    };

    // Attach local media tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // Handle remote track arrival
    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) {
        setRemoteStreams(prev => ({ ...prev, [targetUserId]: stream }));
      }
    };

    // Handle local ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('webrtc:ice-candidate', {
          meetingId,
          candidate: event.candidate,
          to: targetUserId,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        setRemoteStreams(prev => {
          const next = { ...prev };
          delete next[targetUserId];
          return next;
        });
      }
    };

    return pc;
  }, [meetingId, socket]);

  // Start local media first before initializing signaling
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: callMode !== 'audio',
          audio: true,
        });
        if (!mounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Add tracks to any existing peer connections
        Object.values(peerConnections.current).forEach(pc => {
          stream.getTracks().forEach(track => {
            pc.addTrack(track, stream);
          });
        });
        setMediaReady(true);
      } catch (err) {
        console.warn('Media access error:', err);
        try {
          const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          if (!mounted) {
            audioOnly.getTracks().forEach(t => t.stop());
            return;
          }
          localStreamRef.current = audioOnly;
          setCamOn(false);
          setMediaReady(true);
        } catch {
          if (!mounted) return;
          setError('Microphone access denied. You are participating in listen-only mode.');
          setMicOn(false);
          setCamOn(false);
          setMediaReady(true);
        }
      }
    })();

    return () => {
      mounted = false;
      setMediaReady(false);
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [callMode]);

  // Socket & WebRTC signaling events — only activate when media is ready
  useEffect(() => {
    if (!socket || !mediaReady || !user) return;

    socket.emit('meeting:join', meetingId);

    const onJoined = async (data: { userId: string; name: string }) => {
      setActiveParticipants(prev => {
        if (prev.some(p => p.id === data.userId)) return prev;
        return [...prev, { id: data.userId, name: data.name }];
      });

      // Existing participant initiates WebRTC offer to new participant
      if (data.userId !== user.id) {
        const pc = createPeerConnection(data.userId);
        const state = peerStates.current[data.userId];
        if (!pc || !state) return;

        try {
          state.makingOffer = true;
          const offer = await pc.createOffer();
          if (pc.signalingState !== 'stable') return;
          await pc.setLocalDescription(offer);
          socket.emit('webrtc:offer', {
            meetingId,
            offer: pc.localDescription,
            to: data.userId,
          });
        } catch (err) {
          console.error('Error creating WebRTC offer:', err);
        } finally {
          if (state) state.makingOffer = false;
        }
      }
    };

    const onOffer = async (data: { offer: RTCSessionDescriptionInit; from: string }) => {
      if (data.from === user.id) return;
      const pc = createPeerConnection(data.from);
      const state = peerStates.current[data.from];
      if (!pc || !state) return;

      try {
        const polite = isPolite(data.from);
        const offerCollision =
          data.offer.type === 'offer' &&
          (state.makingOffer || pc.signalingState !== 'stable');

        state.ignoreOffer = !polite && offerCollision;
        if (state.ignoreOffer) {
          console.log(`[WebRTC] Glare collision: impolite peer ignoring offer from ${data.from}`);
          return;
        }

        if (offerCollision && polite) {
          console.log(`[WebRTC] Glare collision: polite peer rolling back for ${data.from}`);
          await pc.setRemoteDescription({ type: 'rollback' });
        }

        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        await drainCandidates(data.from, pc);

        if (pc.signalingState === 'have-remote-offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('webrtc:answer', {
            meetingId,
            answer: pc.localDescription,
            to: data.from,
          });
        }
      } catch (err) {
        console.error('Error handling WebRTC offer:', err);
      }
    };

    const onAnswer = async (data: { answer: RTCSessionDescriptionInit; from: string }) => {
      const pc = peerConnections.current[data.from];
      if (!pc) return;

      try {
        // Only set remote answer if we are actually expecting an answer
        if (pc.signalingState !== 'have-local-offer') {
          console.warn(`[WebRTC] Ignoring answer from ${data.from}: state is '${pc.signalingState}' (expected 'have-local-offer')`);
          return;
        }

        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        await drainCandidates(data.from, pc);
      } catch (err) {
        console.error('Error setting remote description for answer:', err);
      }
    };

    const onCandidate = async (data: { candidate: RTCIceCandidateInit; from: string }) => {
      const pc = peerConnections.current[data.from];
      if (!pc) return;

      try {
        if (pc.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } else {
          if (!pendingCandidates.current[data.from]) {
            pendingCandidates.current[data.from] = [];
          }
          pendingCandidates.current[data.from].push(data.candidate);
        }
      } catch (err) {
        if (!peerStates.current[data.from]?.ignoreOffer) {
          console.warn('[WebRTC] Error adding ICE candidate:', err);
        }
      }
    };

    const onLeft = (data: { userId: string }) => {
      setActiveParticipants(prev => prev.filter(p => p.id !== data.userId));
      if (peerConnections.current[data.userId]) {
        peerConnections.current[data.userId].close();
        delete peerConnections.current[data.userId];
      }
      delete peerStates.current[data.userId];
      delete pendingCandidates.current[data.userId];
      setRemoteStreams(prev => {
        const next = { ...prev };
        delete next[data.userId];
        return next;
      });
    };

    const onEnded = () => {
      handleLeave();
    };

    socket.on('meeting:participant_joined', onJoined);
    socket.on('webrtc:offer', onOffer);
    socket.on('webrtc:answer', onAnswer);
    socket.on('webrtc:ice-candidate', onCandidate);
    socket.on('meeting:participant_left', onLeft);
    socket.on('meeting:ended', onEnded);

    return () => {
      socket.off('meeting:participant_joined', onJoined);
      socket.off('webrtc:offer', onOffer);
      socket.off('webrtc:answer', onAnswer);
      socket.off('webrtc:ice-candidate', onCandidate);
      socket.off('meeting:participant_left', onLeft);
      socket.off('meeting:ended', onEnded);
    };
  }, [socket, mediaReady, meetingId, user, createPeerConnection, isPolite, drainCandidates]);

  function toggleMic() {
    const stream = localStreamRef.current;
    if (stream) {
      stream.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
      setMicOn(prev => !prev);
    }
  }

  async function toggleCam() {
    const stream = localStreamRef.current;
    if (!stream) return;

    const videoTrack = stream.getVideoTracks()[0];

    if (camOn) {
      // Turn off: disable track without stopping so hardware connection remains active
      if (videoTrack) {
        videoTrack.enabled = false;
      }
      setCamOn(false);
    } else {
      // Turn back on
      if (videoTrack && videoTrack.readyState === 'live') {
        videoTrack.enabled = true;
        setCamOn(true);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } else {
        // If no video track existed (audio call upgraded), acquire new video track
        try {
          const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
          const newTrack = videoStream.getVideoTracks()[0];
          stream.addTrack(newTrack);

          Object.values(peerConnections.current).forEach(pc => {
            pc.addTrack(newTrack, stream);
          });

          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
          setCamOn(true);
        } catch (err) {
          console.warn('Could not acquire camera track:', err);
          setError('Could not access camera.');
        }
      }
    }
  }

  async function toggleScreenShare() {
    if (screenSharing) {
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
      setScreenSharing(false);
      if (localVideoRef.current && localStreamRef.current && camOn) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
    } else {
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = screen;
        setScreenSharing(true);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screen;
        }
        screen.getVideoTracks()[0].onended = () => {
          setScreenSharing(false);
          if (localVideoRef.current && localStreamRef.current && camOn) {
            localVideoRef.current.srcObject = localStreamRef.current;
          }
        };
      } catch (_) {}
    }
  }

  async function handleLeave() {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current?.getTracks().forEach(t => t.stop());

    Object.values(peerConnections.current).forEach(pc => pc.close());
    peerConnections.current = {};
    peerStates.current = {};
    pendingCandidates.current = {};

    try {
      await api.endMeeting(meetingId);
    } catch (_) {
      await api.leaveMeeting(meetingId).catch(() => {});
    }
    onClose();
  }

  const count = activeParticipants.length;
  const gridClass = count <= 1 ? 'grid-1' : count === 2 ? 'grid-2' : count <= 3 ? 'grid-3' : 'grid-4';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: '#090d16',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: callMode === 'audio' ? '#10b981' : '#ef4444',
            animation: 'blink 1.5s infinite',
          }} />
          <span style={{ color: '#fff', fontWeight: 600, fontSize: '1rem' }}>
            {callMode === 'audio' ? '📞 Voice Call' : '📹 Video Meeting'}
          </span>
          <span style={{
            fontSize: '0.8125rem',
            color: 'var(--accent-primary-hover)',
            background: 'rgba(45, 111, 232, 0.15)',
            padding: '2px 8px',
            borderRadius: 6,
            fontWeight: 600,
          }}>
            {formatDuration(callDuration)}
          </span>
          <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
            • {activeParticipants.length} participant{activeParticipants.length !== 1 ? 's' : ''}
          </span>
        </div>
        {error && (
          <div style={{ fontSize: '0.8rem', color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '4px 10px', borderRadius: 8 }}>
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* Media / Participant grid */}
      <div className={`meeting-grid ${gridClass}`} style={{ flex: 1, padding: 16 }}>
        {/* Local participant tile: Video element is permanently mounted to avoid losing ref / srcObject */}
        <div className="participant-tile" style={{
          position: 'relative',
          border: '2px solid rgba(45,111,232,0.5)',
          background: 'linear-gradient(180deg, #111827, #0b0f19)',
          overflow: 'hidden',
        }}>
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: 'scaleX(-1)',
              display: camOn ? 'block' : 'none',
            }}
          />

          {!camOn && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              background: 'radial-gradient(circle, rgba(30, 58, 138, 0.25) 0%, rgba(11, 15, 25, 0.95) 75%)',
              gap: 16,
            }}>
              <div style={{ position: 'relative' }}>
                <div className="voice-pulse-ring" />
                <Avatar name={user?.name || 'You'} photoUrl={user?.photo_url} size="xl" />
              </div>
              <div style={{ color: '#94a3b8', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{micOn ? '🎤 Speaking enabled' : '🔇 Muted'}</span>
              </div>
            </div>
          )}

          <div className="participant-tile-name">
            <span>{callMode === 'audio' && !camOn ? '🎙️' : '🎥'} You {screenSharing ? '(Sharing)' : ''}</span>
          </div>
        </div>

        {/* Remote participants with live video streams */}
        {activeParticipants
          .filter(p => p.id !== user?.id)
          .map(p => (
            <RemoteVideoTile
              key={p.id}
              participant={p}
              stream={remoteStreams[p.id]}
              isAudioOnly={callMode === 'audio'}
            />
          ))}
      </div>

      {/* Controls Bar */}
      <div className="meeting-controls" style={{
        padding: '16px 20px',
        background: 'rgba(15, 23, 42, 0.9)',
        backdropFilter: 'blur(16px)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        justifyContent: 'center',
        gap: 16,
      }}>
        <button
          className={`meeting-btn ${micOn ? 'meeting-btn-normal' : 'meeting-btn-muted'}`}
          onClick={toggleMic}
          title={micOn ? 'Mute Microphone' : 'Unmute Microphone'}
          style={{ width: 50, height: 50, fontSize: '1.25rem', borderRadius: '50%' }}
        >
          {micOn ? '🎤' : '🔇'}
        </button>

        <button
          className={`meeting-btn ${camOn ? 'meeting-btn-normal' : 'meeting-btn-muted'}`}
          onClick={toggleCam}
          title={camOn ? 'Turn Off Camera' : 'Turn On Camera'}
          style={{ width: 50, height: 50, fontSize: '1.25rem', borderRadius: '50%' }}
        >
          {camOn ? '📹' : '📷'}
        </button>

        <button
          className={`meeting-btn ${screenSharing ? 'meeting-btn-muted' : 'meeting-btn-normal'}`}
          onClick={toggleScreenShare}
          title={screenSharing ? 'Stop Sharing' : 'Share Screen'}
          style={{ width: 50, height: 50, fontSize: '1.25rem', borderRadius: '50%' }}
        >
          {screenSharing ? '🛑' : '🖥️'}
        </button>

        <button
          className="meeting-btn meeting-btn-end"
          onClick={handleLeave}
          title="End Call"
          style={{ width: 50, height: 50, fontSize: '1.25rem', borderRadius: '50%', background: '#ef4444', color: '#fff' }}
        >
          📵
        </button>
      </div>

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .voice-pulse-ring {
          position: absolute;
          inset: -12px;
          border-radius: 50%;
          border: 2px solid rgba(45, 111, 232, 0.4);
          animation: pulse-ring 2s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
        }
        .voice-pulse-ring.active {
          border-color: rgba(16, 185, 129, 0.5);
        }
        @keyframes pulse-ring {
          0% { transform: scale(0.9); opacity: 0.8; }
          70% { transform: scale(1.3); opacity: 0; }
          100% { transform: scale(1.3); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
