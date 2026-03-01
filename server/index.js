import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { fileURLToPath } from 'url';
import path from 'path';

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

// State management
let waitingQueue = [];
const activePairs = new Map();

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

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

    // WebRTC Signaling
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

        const partnerId = activePairs.get(socket.id);
        if (partnerId) {
            activePairs.delete(socket.id);
            activePairs.delete(partnerId);
            io.to(partnerId).emit('partner_left');
        }
    });
});

// SPA fallback: serve index.html for all non-API routes
app.get('*', (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
