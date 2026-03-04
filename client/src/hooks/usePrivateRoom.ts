import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ],
};

const SIGNALING_URL = import.meta.env.PROD
    ? window.location.origin
    : 'http://localhost:3000';

export interface ChatMessage {
    sender: 'me' | 'partner';
    text: string;
    timestamp: number;
}

export interface RemotePeer {
    peerId: string;
    stream: MediaStream | null;
}

export function usePrivateRoom() {
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remotePeers, setRemotePeers] = useState<Map<string, MediaStream | null>>(new Map());
    const [roomCode, setRoomCode] = useState<string | null>(null);
    const [isHost, setIsHost] = useState(false);
    const [waitingForGuest, setWaitingForGuest] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [micEnabled, setMicEnabled] = useState(true);
    const [cameraEnabled, setCameraEnabled] = useState(true);
    const [roomClosed, setRoomClosed] = useState(false);
    const [participantCount, setParticipantCount] = useState(1); // includes self

    const localStreamRef = useRef<MediaStream | null>(null);
    const socketRef = useRef<Socket | null>(null);
    // Multiple peer connections: peerId -> RTCPeerConnection
    const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());

    // Helper: update remote peers state from peerConnections
    const updateRemotePeersState = useCallback(() => {
        const newMap = new Map<string, MediaStream | null>();
        for (const [peerId, pc] of peerConnectionsRef.current.entries()) {
            const receivers = pc.getReceivers();
            const stream = new MediaStream();
            receivers.forEach(r => { if (r.track) stream.addTrack(r.track); });
            newMap.set(peerId, stream.getTracks().length > 0 ? stream : null);
        }
        setRemotePeers(new Map(newMap));
        setParticipantCount(1 + newMap.size); // self + remotes
    }, []);

    // Create a peer connection for a specific remote peer
    const createPeerConnection = useCallback((peerId: string, currentSocket: Socket): RTCPeerConnection => {
        // Close existing if any
        const existing = peerConnectionsRef.current.get(peerId);
        if (existing) {
            existing.close();
            peerConnectionsRef.current.delete(peerId);
        }

        const pc = new RTCPeerConnection(ICE_SERVERS);
        peerConnectionsRef.current.set(peerId, pc);

        // Add local tracks
        localStreamRef.current?.getTracks().forEach(track => {
            pc.addTrack(track, localStreamRef.current!);
        });

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                currentSocket.emit('webrtc_ice_candidate', { candidate: event.candidate, targetId: peerId });
            }
        };

        pc.ontrack = () => {
            // Trigger state update whenever we get a track
            updateRemotePeersState();
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                removePeer(peerId);
            }
        };

        return pc;
    }, [updateRemotePeersState]);

    const removePeer = useCallback((peerId: string) => {
        const pc = peerConnectionsRef.current.get(peerId);
        if (pc) {
            pc.onicecandidate = null;
            pc.ontrack = null;
            pc.onconnectionstatechange = null;
            pc.close();
            peerConnectionsRef.current.delete(peerId);
        }
        setRemotePeers(prev => {
            const next = new Map(prev);
            next.delete(peerId);
            setParticipantCount(1 + next.size);
            return next;
        });
    }, []);

    const cleanupAllPeers = useCallback(() => {
        for (const [, pc] of peerConnectionsRef.current) {
            pc.onicecandidate = null;
            pc.ontrack = null;
            pc.onconnectionstatechange = null;
            pc.close();
        }
        peerConnectionsRef.current.clear();
        setRemotePeers(new Map());
        setMessages([]);
        setParticipantCount(1);
    }, []);

    useEffect(() => {
        const initMedia = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                setLocalStream(stream);
                localStreamRef.current = stream;

                const currentSocket = io(SIGNALING_URL);
                socketRef.current = currentSocket;

                currentSocket.on('connect', () => {
                    console.log('[Room] Connected:', currentSocket.id);
                });

                // Room lifecycle
                currentSocket.on('room_created', ({ roomCode: code }) => {
                    setRoomCode(code);
                    setIsHost(true);
                    setWaitingForGuest(true);
                    setError(null);
                });

                currentSocket.on('room_error', ({ message }) => {
                    setError(message);
                });

                // When we join: we receive list of existing participants to connect to
                currentSocket.on('room_participants', async ({ participants }) => {
                    setWaitingForGuest(false);
                    setError(null);

                    // Create peer connections and send offers to each existing participant
                    for (const peerId of participants) {
                        const pc = createPeerConnection(peerId, currentSocket);
                        const offer = await pc.createOffer();
                        await pc.setLocalDescription(offer);
                        currentSocket.emit('webrtc_offer', { sdp: offer, targetId: peerId });
                    }
                    updateRemotePeersState();
                });

                // When someone new joins our room
                currentSocket.on('room_peer_joined', ({ peerId }) => {
                    console.log('[Room] Peer joined:', peerId);
                    setWaitingForGuest(false);
                    // We wait for THEIR offer (they are the initiator to us)
                    createPeerConnection(peerId, currentSocket);
                    updateRemotePeersState();
                });

                // Peer left
                currentSocket.on('room_peer_left', ({ peerId }) => {
                    console.log('[Room] Peer left:', peerId);
                    removePeer(peerId);

                    // If no peers left and we're host, show waiting again
                    if (peerConnectionsRef.current.size === 0) {
                        setWaitingForGuest(true);
                    }
                });

                currentSocket.on('room_host_transferred', () => {
                    setIsHost(true);
                });

                currentSocket.on('room_closed', () => {
                    cleanupAllPeers();
                    setRoomClosed(true);
                    setWaitingForGuest(false);
                    setRoomCode(null);
                });

                // WebRTC signaling - multi-peer
                currentSocket.on('webrtc_offer', async ({ sdp, senderId }) => {
                    let pc = peerConnectionsRef.current.get(senderId);
                    if (!pc) pc = createPeerConnection(senderId, currentSocket);
                    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    currentSocket.emit('webrtc_answer', { sdp: answer, targetId: senderId });
                });

                currentSocket.on('webrtc_answer', async ({ sdp, senderId }) => {
                    const pc = peerConnectionsRef.current.get(senderId);
                    if (pc) await pc.setRemoteDescription(new RTCSessionDescription(sdp));
                });

                currentSocket.on('webrtc_ice_candidate', async ({ candidate, senderId }) => {
                    try {
                        const pc = peerConnectionsRef.current.get(senderId);
                        if (pc && candidate) await pc.addIceCandidate(new RTCIceCandidate(candidate));
                    } catch (err) {
                        console.error('ICE error:', err);
                    }
                });

                currentSocket.on('chat_message', ({ text }) => {
                    setMessages(prev => [...prev, { sender: 'partner', text, timestamp: Date.now() }]);
                });

                currentSocket.on('partner_left', () => {
                    cleanupAllPeers();
                    setWaitingForGuest(true);
                });

            } catch (err) {
                console.error('Media error:', err);
                setError('Tidak dapat mengakses kamera/mikrofon. Pastikan izin diberikan.');
            }
        };

        initMedia();
        return () => {
            localStreamRef.current?.getTracks().forEach(t => t.stop());
            cleanupAllPeers();
            socketRef.current?.disconnect();
        };
    }, [createPeerConnection, removePeer, cleanupAllPeers, updateRemotePeersState]);

    const createRoom = useCallback(() => {
        if (!socketRef.current) return;
        setError(null);
        setRoomClosed(false);
        socketRef.current.emit('create_room');
    }, []);

    const joinRoom = useCallback((code: string) => {
        if (!socketRef.current || !code.trim()) return;
        setError(null);
        setRoomClosed(false);
        socketRef.current.emit('join_room', { roomCode: code.trim() });
        setRoomCode(code.trim().toUpperCase());
    }, []);

    const leaveRoom = useCallback(() => {
        if (!socketRef.current || !roomCode) return;
        socketRef.current.emit('leave_room', { roomCode });
        cleanupAllPeers();
        setRoomCode(null);
        setIsHost(false);
        setWaitingForGuest(false);
        setRoomClosed(false);
    }, [roomCode, cleanupAllPeers]);

    const toggleMic = useCallback(() => {
        if (localStreamRef.current) {
            const t = localStreamRef.current.getAudioTracks()[0];
            if (t) { t.enabled = !t.enabled; setMicEnabled(t.enabled); }
        }
    }, []);

    const toggleCamera = useCallback(() => {
        if (localStreamRef.current) {
            const t = localStreamRef.current.getVideoTracks()[0];
            if (t) { t.enabled = !t.enabled; setCameraEnabled(t.enabled); }
        }
    }, []);

    const sendMessage = useCallback((text: string) => {
        if (!socketRef.current || peerConnectionsRef.current.size === 0 || !text.trim()) return;
        socketRef.current.emit('chat_message', { text });
        setMessages(prev => [...prev, { sender: 'me', text, timestamp: Date.now() }]);
    }, []);

    // Computed: has any connected peers
    const hasConnectedPeers = remotePeers.size > 0;

    return {
        localStream,
        remotePeers,
        hasConnectedPeers,
        participantCount,
        roomCode,
        isHost,
        waitingForGuest,
        error,
        roomClosed,
        createRoom,
        joinRoom,
        leaveRoom,
        toggleMic,
        toggleCamera,
        micEnabled,
        cameraEnabled,
        messages,
        sendMessage
    };
}
