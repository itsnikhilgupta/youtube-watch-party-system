import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  databasePath: process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'watchtogether.db'),
  hostReconnectGracePeriodMs: parseInt(process.env.HOST_RECONNECT_GRACE_PERIOD_MS || '15000', 10),
  maxPendingRequestsPerRoom: 10,
  maxChatMessageLength: 280,
  maxUsernameLength: 25,
  minUsernameLength: 2,
  syncDriftThresholdSeconds: 1.5,
};
