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

// In production, serve the built React client
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDistPath));

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// ==========================================
// State management
// ==========================================
let waitingQueue = [];
const activePairs = new Map();

// Private rooms: Map<roomCode, { host: socketId, guest: socketId | null, createdAt: number }>
const privateRooms = new Map();

// Generate a short, readable room code (6 chars)
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No 0/O/1/I to avoid confusion
    let code = '';
    const bytes = crypto.randomBytes(6);
    for (let i = 0; i < 6; i++) {
        code += chars[bytes[i] % chars.length];
    }
    return code;
}

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // ==========================================
    // Random Chat Events
    // ==========================================
    socket.on('start_search', () => {
        console.log(`${socket.id} is looking for a partner`);

        if (waitingQueue.length > 0) {
            const partnerIndex = waitingQueue.findIndex(id => id !== socket.id);

            if (partnerIndex !== -1) {
                const partnerId = waitingQueue.splice(partnerIndex, 1)[0];

                activePairs.set(socket.id, partnerId);
                activePairs.set(partnerId, socket.id);

                console.log(`Matched: ${socket.id} <-> ${partnerId}`);

                io.to(socket.id).emit('partner_found', { role: 'initiator', partnerId });
                io.to(partnerId).emit('partner_found', { role: 'responder', partnerId: socket.id });
                return;
            }
        }

        if (!waitingQueue.includes(socket.id)) {
            waitingQueue.push(socket.id);
        }
    });

    socket.on('cancel_search', () => {
        console.log(`${socket.id} cancelled search`);
        waitingQueue = waitingQueue.filter(id => id !== socket.id);
    });

    // ==========================================
    // Private Room Events
    // ==========================================
    socket.on('create_room', () => {
        // Generate unique room code
        let roomCode;
        do {
            roomCode = generateRoomCode();
        } while (privateRooms.has(roomCode));

        privateRooms.set(roomCode, {
            host: socket.id,
            guest: null,
            createdAt: Date.now()
        });

        // Join Socket.io room
        socket.join(`room_${roomCode}`);

        console.log(`Room created: ${roomCode} by ${socket.id}`);
        socket.emit('room_created', { roomCode });
    });

    socket.on('join_room', ({ roomCode }) => {
        const code = roomCode?.toUpperCase?.();
        const room = privateRooms.get(code);

        if (!room) {
            socket.emit('room_error', { message: 'Ruang tidak ditemukan. Pastikan kode yang dimasukkan benar.' });
            return;
        }

        if (room.host === socket.id) {
            socket.emit('room_error', { message: 'Anda sudah berada di ruang ini.' });
            return;
        }

        if (room.guest) {
            socket.emit('room_error', { message: 'Ruang sudah penuh. Maksimal 2 orang per ruang.' });
            return;
        }

        // Set guest
        room.guest = socket.id;
        socket.join(`room_${code}`);

        // Pair them
        activePairs.set(room.host, socket.id);
        activePairs.set(socket.id, room.host);

        console.log(`Room ${code}: ${socket.id} joined. Paired with ${room.host}`);

        // Notify both
        io.to(room.host).emit('room_partner_joined', { role: 'initiator', partnerId: socket.id });
        socket.emit('room_partner_joined', { role: 'responder', partnerId: room.host });
    });

    socket.on('leave_room', ({ roomCode }) => {
        const code = roomCode?.toUpperCase?.();
        handleRoomLeave(socket, code);
    });

    // ==========================================
    // WebRTC Signaling (shared for random + private)
    // ==========================================
    socket.on('webrtc_offer', (data) => {
        const partnerId = activePairs.get(socket.id);
        if (partnerId) {
            io.to(partnerId).emit('webrtc_offer', {
                sdp: data.sdp,
                senderId: socket.id
            });
        }
    });

    socket.on('webrtc_answer', (data) => {
        const partnerId = activePairs.get(socket.id);
        if (partnerId) {
            io.to(partnerId).emit('webrtc_answer', {
                sdp: data.sdp,
                senderId: socket.id
            });
        }
    });

    socket.on('webrtc_ice_candidate', (data) => {
        const partnerId = activePairs.get(socket.id);
        if (partnerId) {
            io.to(partnerId).emit('webrtc_ice_candidate', {
                candidate: data.candidate,
                senderId: socket.id
            });
        }
    });

    // Chat Relay
    socket.on('chat_message', (data) => {
        const partnerId = activePairs.get(socket.id);
        if (partnerId) {
            io.to(partnerId).emit('chat_message', {
                text: data.text,
                senderId: socket.id
            });
        }
    });

    // Handle skips
    socket.on('partner_skip', () => {
        const partnerId = activePairs.get(socket.id);
        console.log(`${socket.id} skipped ${partnerId}`);

        if (partnerId) {
            activePairs.delete(socket.id);
            activePairs.delete(partnerId);
            io.to(partnerId).emit('partner_left');
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);

        waitingQueue = waitingQueue.filter(id => id !== socket.id);

        // Clean up active pairs
        const partnerId = activePairs.get(socket.id);
        if (partnerId) {
            activePairs.delete(socket.id);
            activePairs.delete(partnerId);
            io.to(partnerId).emit('partner_left');
        }

        // Clean up private rooms
        for (const [code, room] of privateRooms.entries()) {
            if (room.host === socket.id) {
                // Host left: notify guest, delete room
                if (room.guest) {
                    io.to(room.guest).emit('room_closed', { message: 'Pemilik ruang telah keluar. Ruang ditutup.' });
                    activePairs.delete(room.guest);
                }
                privateRooms.delete(code);
            } else if (room.guest === socket.id) {
                // Guest left: notify host, clear guest slot
                room.guest = null;
                activePairs.delete(room.host);
                io.to(room.host).emit('room_partner_left');
            }
        }
    });
});

function handleRoomLeave(socket, roomCode) {
    const room = privateRooms.get(roomCode);
    if (!room) return;

    if (room.host === socket.id) {
        // Host leaves: close room
        if (room.guest) {
            io.to(room.guest).emit('room_closed', { message: 'Pemilik ruang telah keluar. Ruang ditutup.' });
            activePairs.delete(room.guest);
        }
        activePairs.delete(socket.id);
        privateRooms.delete(roomCode);
        socket.leave(`room_${roomCode}`);
    } else if (room.guest === socket.id) {
        // Guest leaves
        room.guest = null;
        activePairs.delete(socket.id);
        activePairs.delete(room.host);
        io.to(room.host).emit('room_partner_left');
        socket.leave(`room_${roomCode}`);
    }
}

// SPA fallback: serve index.html for all non-API routes
app.get('*', (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
