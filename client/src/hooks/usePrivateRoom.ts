import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import {
    Room,
    RoomEvent,
    Track,
    RemoteTrackPublication,
    RemoteParticipant,
    LocalParticipant,
    ConnectionState,
    DataPacket_Kind,
    Participant,
} from 'livekit-client';

const SIGNALING_URL = import.meta.env.PROD
    ? window.location.origin
    : 'http://localhost:3000';

export interface ChatMessage {
    sender: 'me' | 'partner';
    senderName: string;
    text: string;
    timestamp: number;
}

export interface ParticipantInfo {
    identity: string;
    name: string;
    videoTrack: MediaStreamTrack | null;
    audioTrack: MediaStreamTrack | null;
    isSpeaking: boolean;
    connectionQuality: string;
    isMuted: boolean;
    isCameraOff: boolean;
}

export function usePrivateRoom() {
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
    const [roomCode, setRoomCode] = useState<string | null>(null);
    const [isHost, setIsHost] = useState(false);
    const [waitingForGuest, setWaitingForGuest] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [micEnabled, setMicEnabled] = useState(true);
    const [cameraEnabled, setCameraEnabled] = useState(true);
    const [roomClosed, setRoomClosed] = useState(false);
    const [connectionState, setConnectionState] = useState<string>('disconnected');

    const socketRef = useRef<Socket | null>(null);
    const livekitRoomRef = useRef<Room | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const encoder = useRef(new TextEncoder());
    const decoder = useRef(new TextDecoder());

    // Build participant info from LiveKit Room
    const updateParticipants = useCallback(() => {
        const room = livekitRoomRef.current;
        if (!room) {
            setParticipants([]);
            return;
        }

        const infos: ParticipantInfo[] = [];
        const remotes = Array.from(room.remoteParticipants.values());

        for (const p of remotes) {
            const videoTrack = p.getTrackPublication(Track.Source.Camera)?.track?.mediaStreamTrack ?? null;
            const audioTrack = p.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack ?? null;
            const isMuted = !p.getTrackPublication(Track.Source.Microphone)?.isSubscribed ||
                p.getTrackPublication(Track.Source.Microphone)?.isMuted ||
                !p.getTrackPublication(Track.Source.Microphone)?.track;
            const isCameraOff = !p.getTrackPublication(Track.Source.Camera)?.isSubscribed ||
                p.getTrackPublication(Track.Source.Camera)?.isMuted ||
                !p.getTrackPublication(Track.Source.Camera)?.track;

            infos.push({
                identity: p.identity,
                name: p.name || p.identity,
                videoTrack,
                audioTrack,
                isSpeaking: p.isSpeaking,
                connectionQuality: p.connectionQuality,
                isMuted: !!isMuted,
                isCameraOff: !!isCameraOff,
            });
        }

        setParticipants(infos);
    }, []);

    // Connect to LiveKit room
    const connectToLiveKit = useCallback(async (token: string, livekitUrl: string) => {
        try {
            // Get local media first
            let stream = localStreamRef.current;
            if (!stream) {
                stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                setLocalStream(stream);
                localStreamRef.current = stream;
            }

            const room = new Room({
                adaptiveStream: true,
                dynacast: true,
                videoCaptureDefaults: { resolution: { width: 1280, height: 720 } },
            });

            livekitRoomRef.current = room;

            // Event listeners
            room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
                setConnectionState(state);
                if (state === ConnectionState.Disconnected) {
                    setRoomClosed(true);
                    setRoomCode(null);
                }
            });

            room.on(RoomEvent.ParticipantConnected, (_p: RemoteParticipant) => {
                setWaitingForGuest(false);
                updateParticipants();
            });

            room.on(RoomEvent.ParticipantDisconnected, (_p: RemoteParticipant) => {
                updateParticipants();
                if (room.remoteParticipants.size === 0) {
                    setWaitingForGuest(true);
                }
            });

            room.on(RoomEvent.TrackSubscribed, (_track, _pub: RemoteTrackPublication, _participant: RemoteParticipant) => {
                updateParticipants();
            });

            room.on(RoomEvent.TrackUnsubscribed, () => {
                updateParticipants();
            });

            room.on(RoomEvent.TrackMuted, () => updateParticipants());
            room.on(RoomEvent.TrackUnmuted, () => updateParticipants());

            room.on(RoomEvent.ActiveSpeakersChanged, (_speakers: Participant[]) => {
                updateParticipants();
            });

            room.on(RoomEvent.ConnectionQualityChanged, () => updateParticipants());

            // Data channel for chat
            room.on(RoomEvent.DataReceived, (payload: Uint8Array, participant?: RemoteParticipant) => {
                try {
                    const msg = JSON.parse(decoder.current.decode(payload));
                    if (msg.type === 'chat') {
                        setMessages(prev => [...prev, {
                            sender: 'partner',
                            senderName: participant?.name || participant?.identity || 'Anonim',
                            text: msg.text,
                            timestamp: Date.now()
                        }]);
                    }
                } catch { /* ignore non-chat data */ }
            });

            // Connect
            await room.connect(livekitUrl, token);

            // Publish local tracks
            await room.localParticipant.setCameraEnabled(true);
            await room.localParticipant.setMicrophoneEnabled(true);

            // Update local stream from LiveKit's tracks
            const localVideoTrack = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
            const localAudioTrack = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;

            if (localVideoTrack?.mediaStreamTrack || localAudioTrack?.mediaStreamTrack) {
                const newStream = new MediaStream();
                if (localVideoTrack?.mediaStreamTrack) newStream.addTrack(localVideoTrack.mediaStreamTrack);
                if (localAudioTrack?.mediaStreamTrack) newStream.addTrack(localAudioTrack.mediaStreamTrack);
                setLocalStream(newStream);
                localStreamRef.current = newStream;
            }

            updateParticipants();
            setConnectionState(ConnectionState.Connected);

        } catch (err) {
            console.error('[LiveKit] Connection error:', err);
            setError('Gagal terhubung ke server video. Pastikan server LiveKit berjalan.');
        }
    }, [updateParticipants]);

    // Initialize socket connection
    useEffect(() => {
        // Get camera stream for preview (before LiveKit connects)
        const initPreview = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                setLocalStream(stream);
                localStreamRef.current = stream;
            } catch (err) {
                console.error('Media error:', err);
                setError('Tidak dapat mengakses kamera/mikrofon.');
            }
        };
        initPreview();

        const currentSocket = io(SIGNALING_URL);
        socketRef.current = currentSocket;

        currentSocket.on('room_created', async ({ roomCode: code, token, livekitUrl }) => {
            setRoomCode(code);
            setIsHost(true);
            setWaitingForGuest(true);
            setError(null);
            await connectToLiveKit(token, livekitUrl);
        });

        currentSocket.on('room_joined', async ({ roomCode: code, token, livekitUrl }) => {
            setRoomCode(code);
            setIsHost(false);
            setWaitingForGuest(false);
            setError(null);
            await connectToLiveKit(token, livekitUrl);
        });

        currentSocket.on('room_error', ({ message }) => setError(message));

        return () => {
            // Stop preview stream tracks
            localStreamRef.current?.getTracks().forEach(t => t.stop());
            livekitRoomRef.current?.disconnect();
            currentSocket.disconnect();
        };
    }, [connectToLiveKit]);

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
    }, []);

    const leaveRoom = useCallback(() => {
        livekitRoomRef.current?.disconnect();
        livekitRoomRef.current = null;
        setParticipants([]);
        setMessages([]);
        setRoomCode(null);
        setIsHost(false);
        setWaitingForGuest(false);
        setRoomClosed(false);
        setConnectionState('disconnected');
    }, []);

    const toggleMic = useCallback(async () => {
        const room = livekitRoomRef.current;
        if (room?.localParticipant) {
            const newState = !micEnabled;
            await room.localParticipant.setMicrophoneEnabled(newState);
            setMicEnabled(newState);
        }
    }, [micEnabled]);

    const toggleCamera = useCallback(async () => {
        const room = livekitRoomRef.current;
        if (room?.localParticipant) {
            const newState = !cameraEnabled;
            await room.localParticipant.setCameraEnabled(newState);
            setCameraEnabled(newState);
            // Update local stream
            const track = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
            if (track?.mediaStreamTrack) {
                const newStream = new MediaStream();
                newStream.addTrack(track.mediaStreamTrack);
                const audioTrack = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
                if (audioTrack?.mediaStreamTrack) newStream.addTrack(audioTrack.mediaStreamTrack);
                setLocalStream(newStream);
                localStreamRef.current = newStream;
            }
        }
    }, [cameraEnabled]);

    const sendMessage = useCallback((text: string) => {
        const room = livekitRoomRef.current;
        if (!room || room.remoteParticipants.size === 0 || !text.trim()) return;

        const data = encoder.current.encode(JSON.stringify({ type: 'chat', text }));
        room.localParticipant.publishData(data, { reliable: true });

        const localName = room.localParticipant.name || room.localParticipant.identity;
        setMessages(prev => [...prev, { sender: 'me', senderName: localName, text, timestamp: Date.now() }]);
    }, []);

    const hasConnectedPeers = participants.length > 0;
    const participantCount = 1 + participants.length;

    return {
        localStream,
        participants,
        hasConnectedPeers,
        participantCount,
        roomCode,
        isHost,
        waitingForGuest,
        error,
        roomClosed,
        connectionState,
        createRoom,
        joinRoom,
        leaveRoom,
        toggleMic,
        toggleCamera,
        micEnabled,
        cameraEnabled,
        messages,
        sendMessage,
    };
}
