import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { fileURLToPath } from 'url';
import path from 'path';
import crypto from 'crypto';
import { AccessToken } from 'livekit-server-sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());

const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDistPath));

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

// ==========================================
// LiveKit config
// ==========================================
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'devkey';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'devsecret123456789012345678901234567890';
const LIVEKIT_URL = process.env.LIVEKIT_URL || 'ws://localhost:7880';

// ==========================================
// State
// ==========================================
let waitingQueue = [];
const activePairs = new Map(); // random 1-to-1 chat

// Private rooms (lightweight tracking — LiveKit handles the actual media)
const privateRooms = new Map(); // code -> { host, createdAt }

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    const bytes = crypto.randomBytes(6);
    for (let i = 0; i < 6; i++) code += chars[bytes[i] % chars.length];
    return code;
}

// Generate a LiveKit access token
async function createLiveKitToken(roomName, participantName, participantIdentity) {
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
        identity: participantIdentity,
        name: participantName,
    });
    at.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
    });
    return await at.toJwt();
}

io.on('connection', (socket) => {
    console.log(`Connected: ${socket.id}`);

    // ==========================================
    // Random Chat (peer-to-peer, unchanged)
    // ==========================================
    socket.on('start_search', () => {
        if (waitingQueue.length > 0) {
            const idx = waitingQueue.findIndex(id => id !== socket.id);
            if (idx !== -1) {
                const partnerId = waitingQueue.splice(idx, 1)[0];
                activePairs.set(socket.id, partnerId);
                activePairs.set(partnerId, socket.id);
                io.to(socket.id).emit('partner_found', { role: 'initiator', partnerId });
                io.to(partnerId).emit('partner_found', { role: 'responder', partnerId: socket.id });
                return;
            }
        }
        if (!waitingQueue.includes(socket.id)) waitingQueue.push(socket.id);
    });

    socket.on('cancel_search', () => {
        waitingQueue = waitingQueue.filter(id => id !== socket.id);
    });

    socket.on('partner_skip', () => {
        const partnerId = activePairs.get(socket.id);
        if (partnerId) {
            activePairs.delete(socket.id);
            activePairs.delete(partnerId);
            io.to(partnerId).emit('partner_left');
        }
    });

    // Random chat WebRTC signaling
    socket.on('webrtc_offer', (data) => {
        const targetId = data.targetId || activePairs.get(socket.id);
        if (targetId) io.to(targetId).emit('webrtc_offer', { sdp: data.sdp, senderId: socket.id });
    });

    socket.on('webrtc_answer', (data) => {
        const targetId = data.targetId || activePairs.get(socket.id);
        if (targetId) io.to(targetId).emit('webrtc_answer', { sdp: data.sdp, senderId: socket.id });
    });

    socket.on('webrtc_ice_candidate', (data) => {
        const targetId = data.targetId || activePairs.get(socket.id);
        if (targetId) io.to(targetId).emit('webrtc_ice_candidate', { candidate: data.candidate, senderId: socket.id });
    });

    // Random chat message
    socket.on('chat_message', (data) => {
        const partnerId = activePairs.get(socket.id);
        if (partnerId) {
            io.to(partnerId).emit('chat_message', { text: data.text, senderId: socket.id });
        }
    });

    // ==========================================
    // Private Room + LiveKit
    // ==========================================
    socket.on('create_room', async () => {
        let roomCode;
        do { roomCode = generateRoomCode(); } while (privateRooms.has(roomCode));

        privateRooms.set(roomCode, { host: socket.id, createdAt: Date.now() });

        try {
            const token = await createLiveKitToken(
                `room_${roomCode}`,
                `Peserta_${socket.id.slice(0, 4)}`,
                socket.id
            );
            socket.emit('room_created', { roomCode, token, livekitUrl: LIVEKIT_URL });
        } catch (err) {
            console.error('Token error:', err);
            socket.emit('room_error', { message: 'Gagal membuat ruang. Coba lagi.' });
        }
    });

    socket.on('join_room', async ({ roomCode }) => {
        const code = roomCode?.toUpperCase?.();
        const room = privateRooms.get(code);

        if (!room) {
            socket.emit('room_error', { message: 'Ruang tidak ditemukan. Pastikan kode yang dimasukkan benar.' });
            return;
        }

        try {
            const token = await createLiveKitToken(
                `room_${code}`,
                `Peserta_${socket.id.slice(0, 4)}`,
                socket.id
            );
            socket.emit('room_joined', { roomCode: code, token, livekitUrl: LIVEKIT_URL });
        } catch (err) {
            console.error('Token error:', err);
            socket.emit('room_error', { message: 'Gagal bergabung. Coba lagi.' });
        }
    });

    // Disconnect cleanup
    socket.on('disconnect', () => {
        console.log(`Disconnected: ${socket.id}`);
        waitingQueue = waitingQueue.filter(id => id !== socket.id);
        const partnerId = activePairs.get(socket.id);
        if (partnerId) {
            activePairs.delete(socket.id);
            activePairs.delete(partnerId);
            io.to(partnerId).emit('partner_left');
        }
        // Room cleanup: if host disconnects, remove room entry (LiveKit handles actual disconnection)
        for (const [code, room] of privateRooms.entries()) {
            if (room.host === socket.id) {
                privateRooms.delete(code);
            }
        }
    });
});

// SPA fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`LiveKit URL: ${LIVEKIT_URL}`);
});
