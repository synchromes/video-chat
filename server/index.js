import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { fileURLToPath } from 'url';
import path from 'path';
import crypto from 'crypto';

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
// State
// ==========================================
let waitingQueue = [];
const activePairs = new Map(); // For random 1-to-1 chat

// Private rooms: Map<roomCode, { host, participants: Set<socketId>, createdAt }>
const privateRooms = new Map();
// Reverse lookup: socketId -> roomCode
const socketToRoom = new Map();

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    const bytes = crypto.randomBytes(6);
    for (let i = 0; i < 6; i++) code += chars[bytes[i] % chars.length];
    return code;
}

io.on('connection', (socket) => {
    console.log(`Connected: ${socket.id}`);

    // ==========================================
    // Random Chat (unchanged - 1-to-1)
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

    // ==========================================
    // Random Chat - WebRTC signaling (1-to-1 via activePairs)
    // ==========================================
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

    socket.on('chat_message', (data) => {
        // For random chat: 1-to-1
        const partnerId = activePairs.get(socket.id);
        if (partnerId) {
            io.to(partnerId).emit('chat_message', { text: data.text, senderId: socket.id });
            return;
        }
        // For private room: broadcast to all in room
        const roomCode = socketToRoom.get(socket.id);
        if (roomCode) {
            const room = privateRooms.get(roomCode);
            if (room) {
                for (const pid of room.participants) {
                    if (pid !== socket.id) {
                        io.to(pid).emit('chat_message', { text: data.text, senderId: socket.id });
                    }
                }
            }
        }
    });

    // ==========================================
    // Private Room - Multi-participant
    // ==========================================
    socket.on('create_room', () => {
        let roomCode;
        do { roomCode = generateRoomCode(); } while (privateRooms.has(roomCode));

        const participants = new Set([socket.id]);
        privateRooms.set(roomCode, { host: socket.id, participants, createdAt: Date.now() });
        socketToRoom.set(socket.id, roomCode);
        socket.join(`room_${roomCode}`);

        console.log(`Room ${roomCode} created by ${socket.id}`);
        socket.emit('room_created', { roomCode });
    });

    socket.on('join_room', ({ roomCode }) => {
        const code = roomCode?.toUpperCase?.();
        const room = privateRooms.get(code);

        if (!room) {
            socket.emit('room_error', { message: 'Ruang tidak ditemukan. Pastikan kode yang dimasukkan benar.' });
            return;
        }
        if (room.participants.has(socket.id)) {
            socket.emit('room_error', { message: 'Anda sudah berada di ruang ini.' });
            return;
        }

        // Get list of existing participants BEFORE adding the new one
        const existingParticipants = Array.from(room.participants);

        // Add new participant
        room.participants.add(socket.id);
        socketToRoom.set(socket.id, code);
        socket.join(`room_${code}`);

        console.log(`Room ${code}: ${socket.id} joined (${room.participants.size} participants)`);

        // Tell the NEW joiner about ALL existing participants → they become initiators
        socket.emit('room_participants', {
            participants: existingParticipants,
            roomCode: code
        });

        // Tell ALL existing participants about the new joiner
        for (const pid of existingParticipants) {
            io.to(pid).emit('room_peer_joined', { peerId: socket.id });
        }
    });

    socket.on('leave_room', ({ roomCode }) => {
        handleRoomLeave(socket, roomCode?.toUpperCase?.());
    });

    // ==========================================
    // Disconnect
    // ==========================================
    socket.on('disconnect', () => {
        console.log(`Disconnected: ${socket.id}`);

        // Random chat cleanup
        waitingQueue = waitingQueue.filter(id => id !== socket.id);
        const partnerId = activePairs.get(socket.id);
        if (partnerId) {
            activePairs.delete(socket.id);
            activePairs.delete(partnerId);
            io.to(partnerId).emit('partner_left');
        }

        // Private room cleanup
        const roomCode = socketToRoom.get(socket.id);
        if (roomCode) handleRoomLeave(socket, roomCode);
    });
});

function handleRoomLeave(socket, roomCode) {
    const room = privateRooms.get(roomCode);
    if (!room) return;

    room.participants.delete(socket.id);
    socketToRoom.delete(socket.id);
    socket.leave(`room_${roomCode}`);

    console.log(`Room ${roomCode}: ${socket.id} left (${room.participants.size} remaining)`);

    // Notify remaining participants
    for (const pid of room.participants) {
        io.to(pid).emit('room_peer_left', { peerId: socket.id });
    }

    // If host left, transfer host or close room
    if (room.host === socket.id) {
        if (room.participants.size > 0) {
            // Transfer host to first remaining participant
            const newHost = room.participants.values().next().value;
            room.host = newHost;
            io.to(newHost).emit('room_host_transferred');
            console.log(`Room ${roomCode}: host transferred to ${newHost}`);
        } else {
            // No one left, delete room
            privateRooms.delete(roomCode);
            console.log(`Room ${roomCode}: deleted (empty)`);
        }
    }

    // Also delete room if empty
    if (room.participants.size === 0) {
        privateRooms.delete(roomCode);
    }
}

// SPA fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
