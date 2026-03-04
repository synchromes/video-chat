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

export function usePrivateRoom() {
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [partnerConnected, setPartnerConnected] = useState(false);
    const [roomCode, setRoomCode] = useState<string | null>(null);
    const [isHost, setIsHost] = useState(false);
    const [waitingForGuest, setWaitingForGuest] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [micEnabled, setMicEnabled] = useState(true);
    const [cameraEnabled, setCameraEnabled] = useState(true);
    const [roomClosed, setRoomClosed] = useState(false);

    const localStreamRef = useRef<MediaStream | null>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        const initMedia = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                setLocalStream(stream);
                localStreamRef.current = stream;

                const currentSocket = io(SIGNALING_URL);
                socketRef.current = currentSocket;

                currentSocket.on('connect', () => {
                    console.log('[PrivateRoom] Connected to signaling server:', currentSocket.id);
                });

                // Room events
                currentSocket.on('room_created', ({ roomCode: code }) => {
                    setRoomCode(code);
                    setIsHost(true);
                    setWaitingForGuest(true);
                    setError(null);
                });

                currentSocket.on('room_error', ({ message }) => {
                    setError(message);
                });

                currentSocket.on('room_partner_joined', async ({ role }) => {
                    console.log('[PrivateRoom] Partner joined, role:', role);
                    setWaitingForGuest(false);
                    setPartnerConnected(true);
                    setError(null);

                    if (role === 'initiator') {
                        await createOffer(currentSocket);
                    }
                });

                currentSocket.on('room_partner_left', () => {
                    console.log('[PrivateRoom] Partner left room');
                    cleanupConnection();
                    setWaitingForGuest(true);
                });

                currentSocket.on('room_closed', ({ message }) => {
                    console.log('[PrivateRoom] Room closed:', message);
                    cleanupConnection();
                    setRoomClosed(true);
                    setWaitingForGuest(false);
                    setRoomCode(null);
                });

                // WebRTC signaling
                currentSocket.on('webrtc_offer', async ({ sdp }) => {
                    const pc = createPeerConnection(currentSocket);
                    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    currentSocket.emit('webrtc_answer', { sdp: answer });
                });

                currentSocket.on('webrtc_answer', async ({ sdp }) => {
                    await peerConnectionRef.current?.setRemoteDescription(new RTCSessionDescription(sdp));
                });

                currentSocket.on('webrtc_ice_candidate', async ({ candidate }) => {
                    try {
                        if (candidate) {
                            await peerConnectionRef.current?.addIceCandidate(new RTCIceCandidate(candidate));
                        }
                    } catch (error) {
                        console.error("Error adding ice candidate:", error);
                    }
                });

                currentSocket.on('chat_message', ({ text }) => {
                    setMessages(prev => [...prev, { sender: 'partner', text, timestamp: Date.now() }]);
                });

                currentSocket.on('partner_left', () => {
                    console.log('[PrivateRoom] Partner left (generic)');
                    cleanupConnection();
                    if (isHost) {
                        setWaitingForGuest(true);
                    }
                });

            } catch (err) {
                console.error('Failed to access media:', err);
                setError('Tidak dapat mengakses kamera/mikrofon. Pastikan izin diberikan.');
            }
        };

        initMedia();

        return () => {
            localStreamRef.current?.getTracks().forEach(t => t.stop());
            socketRef.current?.disconnect();
        };
    }, []);

    const createPeerConnection = (currentSocket: Socket): RTCPeerConnection => {
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
        }

        const pc = new RTCPeerConnection(ICE_SERVERS);
        peerConnectionRef.current = pc;

        localStreamRef.current?.getTracks().forEach(track => {
            pc.addTrack(track, localStreamRef.current!);
        });

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                currentSocket.emit('webrtc_ice_candidate', { candidate: event.candidate });
            }
        };

        pc.ontrack = (event) => {
            const [stream] = event.streams;
            setRemoteStream(stream);
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                cleanupConnection();
            }
        };

        return pc;
    };

    const createOffer = async (currentSocket: Socket) => {
        const pc = createPeerConnection(currentSocket);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        currentSocket.emit('webrtc_offer', { sdp: offer });
    };

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
        cleanupConnection();
        setRoomCode(null);
        setIsHost(false);
        setWaitingForGuest(false);
        setRoomClosed(false);
    }, [roomCode]);

    const cleanupConnection = () => {
        setPartnerConnected(false);
        setRemoteStream(null);
        setMessages([]);
        if (peerConnectionRef.current) {
            peerConnectionRef.current.onicecandidate = null;
            peerConnectionRef.current.ontrack = null;
            peerConnectionRef.current.onconnectionstatechange = null;
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }
    };

    const toggleMic = useCallback(() => {
        if (localStreamRef.current) {
            const audioTrack = localStreamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setMicEnabled(audioTrack.enabled);
            }
        }
    }, []);

    const toggleCamera = useCallback(() => {
        if (localStreamRef.current) {
            const videoTrack = localStreamRef.current.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                setCameraEnabled(videoTrack.enabled);
            }
        }
    }, []);

    const sendMessage = useCallback((text: string) => {
        if (!socketRef.current || !partnerConnected || !text.trim()) return;
        socketRef.current.emit('chat_message', { text });
        setMessages(prev => [...prev, { sender: 'me', text, timestamp: Date.now() }]);
    }, [partnerConnected]);

    return {
        localStream,
        remoteStream,
        partnerConnected,
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
