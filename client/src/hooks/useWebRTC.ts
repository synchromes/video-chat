import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ],
};

// In production, the client is served from the same Express server,
// so we connect to the current origin. In dev, we connect to localhost:3000.
const SIGNALING_URL = import.meta.env.PROD
    ? window.location.origin
    : 'http://localhost:3000';

export interface ChatMessage {
    sender: 'me' | 'partner';
    text: string;
    timestamp: number;
}

export function useWebRTC() {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [partnerConnected, setPartnerConnected] = useState(false);
    const [searching, setSearching] = useState(false);

    // Chat states
    const [messages, setMessages] = useState<ChatMessage[]>([]);

    const [micEnabled, setMicEnabled] = useState(true);
    const [cameraEnabled, setCameraEnabled] = useState(true);

    // Refs to keep track of mutable objects without triggering re-renders unnecessarily
    const localStreamRef = useRef<MediaStream | null>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const socketRef = useRef<Socket | null>(null);

    // Initialize Socket and local media stream on mount
    useEffect(() => {
        // 1. Get user media
        const initMedia = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                setLocalStream(stream);
                localStreamRef.current = stream;

                // 2. Connect directly to signaling server once media is ready
                const newSocket = io(SIGNALING_URL);
                setSocket(newSocket);
                socketRef.current = newSocket;

                setupSocketListeners(newSocket, stream);

            } catch (err) {
                console.error("Error accessing media devices.", err);
                alert("Please allow camera and microphone access to use this app.");
            }
        };

        initMedia();

        return () => {
            // Cleanup
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(track => track.stop());
            }
            if (peerConnectionRef.current) {
                peerConnectionRef.current.close();
            }
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
        };
    }, []); // Only run once on mount!

    const setupSocketListeners = (currentSocket: Socket, currentLocalStream: MediaStream) => {

        currentSocket.on('partner_found', async ({ role, partnerId }) => {
            console.log(`Matched! I am the ${role}. Partner: ${partnerId}`);
            setSearching(false);
            setPartnerConnected(true);

            // Initialize Peer Connection fresh
            createPeerConnection(currentSocket, currentLocalStream);

            if (role === 'initiator') {
                try {
                    // Create and send offer
                    const offer = await peerConnectionRef.current?.createOffer();
                    await peerConnectionRef.current?.setLocalDescription(offer);
                    currentSocket.emit('webrtc_offer', { sdp: offer });
                } catch (error) {
                    console.error("Error creating offer:", error);
                }
            }
        });

        currentSocket.on('webrtc_offer', async ({ sdp }) => {
            try {
                if (!peerConnectionRef.current) {
                    // Edge case: Sometimes the offer arrives slightly before connection creation completed.
                    createPeerConnection(currentSocket, currentLocalStream);
                }

                await peerConnectionRef.current?.setRemoteDescription(new RTCSessionDescription(sdp));
                const answer = await peerConnectionRef.current?.createAnswer();
                await peerConnectionRef.current?.setLocalDescription(answer);

                currentSocket.emit('webrtc_answer', { sdp: answer });
            } catch (error) {
                console.error("Error handling offer:", error);
            }
        });

        currentSocket.on('webrtc_answer', async ({ sdp }) => {
            try {
                await peerConnectionRef.current?.setRemoteDescription(new RTCSessionDescription(sdp));
            } catch (error) {
                console.error("Error handling answer:", error);
            }
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
            console.log("Partner left, auto-searching again...");
            cleanupConnection();
            // Auto search again immediately
            setSearching(true);
            currentSocket.emit('start_search');
        });
    };

    const createPeerConnection = (currentSocket: Socket, currentLocalStream: MediaStream) => {
        // If there is an existing one, close it
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
        }

        const pc = new RTCPeerConnection(ICE_SERVERS);
        peerConnectionRef.current = pc;

        // Add local tracks to peer connection
        currentLocalStream.getTracks().forEach(track => {
            pc.addTrack(track, currentLocalStream);
        });

        // Handle incoming ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                currentSocket.emit('webrtc_ice_candidate', { candidate: event.candidate });
            }
        };

        // Handle incoming tracks from remote peer
        pc.ontrack = (event) => {
            if (event.streams && event.streams[0]) {
                console.log("Received remote stream");
                setRemoteStream(event.streams[0]);
            }
        };

        pc.onconnectionstatechange = () => {
            console.log("Connection state:", pc.connectionState);
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                cleanupConnection();
            }
        }
    };

    const startSearch = useCallback(() => {
        if (!socketRef.current) return;

        // Make sure old state makes sense
        cleanupConnection();

        setSearching(true);
        socketRef.current.emit('start_search');
    }, []);

    const skipPartner = useCallback(() => {
        if (!socketRef.current) return;
        socketRef.current.emit('partner_skip');
        cleanupConnection();
        startSearch(); // Start searching for a new one immediately
    }, [startSearch]);

    const disconnectUser = useCallback(() => {
        if (socketRef.current) {
            if (partnerConnected) {
                socketRef.current.emit('partner_skip');
            } else if (searching) {
                socketRef.current.emit('cancel_search');
            }
        }
        setSearching(false);
        cleanupConnection();
    }, [partnerConnected, searching]);

    const sendMessage = useCallback((text: string) => {
        if (!socketRef.current || !partnerConnected || !text.trim()) return;

        socketRef.current.emit('chat_message', { text });
        setMessages(prev => [...prev, { sender: 'me', text, timestamp: Date.now() }]);
    }, [partnerConnected]);

    const cleanupConnection = () => {
        setPartnerConnected(false);
        setRemoteStream(null);
        setMessages([]); // Clear chat on disconnect
        if (peerConnectionRef.current) {
            peerConnectionRef.current.onicecandidate = null;
            peerConnectionRef.current.ontrack = null;
            peerConnectionRef.current.onconnectionstatechange = null;
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }
    };

    // Toggles
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

    return {
        localStream,
        remoteStream,
        partnerConnected,
        searching,
        startSearch,
        skipPartner,
        disconnectUser,
        toggleMic,
        toggleCamera,
        micEnabled,
        cameraEnabled,
        messages,
        sendMessage
    };
}
