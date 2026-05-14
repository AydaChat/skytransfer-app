import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import crypto from 'crypto';

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

interface Room {
  pin: string;
  senderSocketId: string;
  receiverSocketId: string | null;
  createdAt: number;
  status: 'waiting' | 'connected';
}

const rooms = new Map<string, Room>();
const socketToRoom = new Map<string, string>();

// Generate a non-sequential 6-digit random code
function generateSecurePIN(): string {
  let pin: string;
  do {
    pin = crypto.randomInt(100000, 999999).toString();
  } while (rooms.has(pin));
  return pin;
}

// Cleanup expired rooms (older than 30 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [pin, room] of rooms.entries()) {
    if (now - room.createdAt > 30 * 60 * 1000) {
      rooms.delete(pin);
      if (room.senderSocketId) socketToRoom.delete(room.senderSocketId);
      if (room.receiverSocketId) socketToRoom.delete(room.receiverSocketId);
      console.log(`[CLEANUP] Expired room ${pin} removed.`);
    }
  }
}, 5 * 60 * 1000);

io.on('connection', (socket: Socket) => {
  console.log(`[CONNECTED] Socket ID: ${socket.id}`);

  // Sender creates a new transfer session
  socket.on('create-room', (callback: (response: { success: boolean; pin?: string; error?: string }) => void) => {
    try {
      const pin = generateSecurePIN();
      const room: Room = {
        pin,
        senderSocketId: socket.id,
        receiverSocketId: null,
        createdAt: Date.now(),
        status: 'waiting'
      };
      rooms.set(pin, room);
      socketToRoom.set(socket.id, pin);

      socket.join(pin);
      console.log(`[ROOM CREATED] PIN: ${pin} by Sender: ${socket.id}`);
      callback({ success: true, pin });
    } catch (err) {
      console.error('[ERROR creating room]:', err);
      callback({ success: false, error: 'Failed to create room.' });
    }
  });

  // Receiver attempts to join an existing session via 6-digit PIN
  socket.on('join-room', (pin: string, callback: (response: { success: boolean; error?: string }) => void) => {
    const room = rooms.get(pin);
    if (!room) {
      return callback({ success: false, error: 'Invalid or expired 6-digit PIN.' });
    }
    if (room.status === 'connected' || room.receiverSocketId) {
      return callback({ success: false, error: 'Room is already full or transfer in progress.' });
    }

    room.receiverSocketId = socket.id;
    room.status = 'connected';
    socketToRoom.set(socket.id, pin);
    socket.join(pin);

    console.log(`[ROOM JOINED] PIN: ${pin} by Receiver: ${socket.id}`);

    // Notify sender that receiver has joined to initiate WebRTC SDP offer
    socket.to(room.senderSocketId).emit('peer-joined', { receiverSocketId: socket.id });
    callback({ success: true });
  });

  // General WebRTC signaling relay (SDP Offer, Answer, ICE Candidates)
  socket.on('webrtc-signaling', (data: { targetSocketId: string; type: string; payload: any }) => {
    if (data.targetSocketId) {
      socket.to(data.targetSocketId).emit('webrtc-signaling', {
        senderSocketId: socket.id,
        type: data.type,
        payload: data.payload
      });
    }
  });

  // Invalidate code upon successful handshake or completed transfer
  socket.on('transfer-complete', () => {
    const pin = socketToRoom.get(socket.id);
    if (pin) {
      const room = rooms.get(pin);
      if (room) {
        if (room.senderSocketId) socketToRoom.delete(room.senderSocketId);
        if (room.receiverSocketId) socketToRoom.delete(room.receiverSocketId);
        rooms.delete(pin);
        console.log(`[TRANSFER COMPLETE] Room ${pin} destroyed.`);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log(`[DISCONNECTED] Socket ID: ${socket.id}`);
    const pin = socketToRoom.get(socket.id);
    if (pin) {
      const room = rooms.get(pin);
      if (room) {
        // Notify the remaining peer in the room
        const target = socket.id === room.senderSocketId ? room.receiverSocketId : room.senderSocketId;
        if (target) {
          io.to(target).emit('peer-disconnected');
        }
        rooms.delete(pin);
        if (room.senderSocketId) socketToRoom.delete(room.senderSocketId);
        if (room.receiverSocketId) socketToRoom.delete(room.receiverSocketId);
        console.log(`[ROOM DESTROYED] PIN: ${pin} due to socket disconnect.`);
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`[SIGNALING SERVER] Running securely on port ${PORT}`);
});
