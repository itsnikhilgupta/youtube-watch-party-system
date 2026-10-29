import http from 'http';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { config } from './config/index.js';
import { getDatabase, closeDatabase, getRoomFromDb } from './database/db.js';
import { setupSocketHandlers } from './sockets/socketHandler.js';
import { roomManager } from './services/RoomManager.js';

const app = express();

// Configure CORS
const allowedOrigins = config.clientOrigin.split(',').map(o => o.trim());
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, curl, or server-to-server)
    if (!origin) return callback(null, true);
    if (config.nodeEnv === 'development' || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    return callback(new Error(`CORS policy does not allow access from origin: ${origin}`));
  },
  credentials: true,
}));

app.use(express.json());

// Initialize SQLite database
getDatabase();

// Health Check API
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    env: config.nodeEnv,
  });
});

// Room Info API (returns status of whether room exists and is joinable)
app.get('/api/rooms/:roomId', (req: Request, res: Response) => {
  const roomId = req.params.roomId;
  const activeRoom = roomManager.getRoom(roomId);

  if (activeRoom && activeRoom.isActive) {
    return res.json({
      exists: true,
      roomId: activeRoom.state.roomId,
      participantCount: roomManager.getParticipants(roomId).length,
      videoId: activeRoom.state.videoId,
    });
  }

  // Check persistent DB
  const dbData = getRoomFromDb(roomId);
  if (dbData) {
    return res.json({
      exists: true,
      roomId: dbData.room.roomId,
      participantCount: 0,
      videoId: dbData.room.videoId,
    });
  }

  return res.status(404).json({ exists: false, error: 'Room not found' });
});

// Create HTTP server and Socket.IO instance
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: config.nodeEnv === 'development' ? '*' : allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingInterval: 10000,
  pingTimeout: 5000,
});

setupSocketHandlers(io);

// Start listening
const server = httpServer.listen(config.port, '0.0.0.0', () => {
  console.log(`===============================================`);
  console.log(`🚀 WatchTogether Backend Server Running`);
  console.log(`📡 Port: ${config.port}`);
  console.log(`🌐 Environment: ${config.nodeEnv}`);
  console.log(`🔗 Allowed Client Origins: ${config.clientOrigin}`);
  console.log(`===============================================`);
});

// Graceful shutdown handling
function handleShutdown(signal: string) {
  console.log(`\nReceived ${signal}. Starting graceful shutdown...`);
  server.close(() => {
    console.log('HTTP and Socket server closed.');
    closeDatabase();
    console.log('SQLite database connection closed cleanly.');
    process.exit(0);
  });

  // Force close after 5 seconds if hanging
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 5000);
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

export { app, httpServer, io };
