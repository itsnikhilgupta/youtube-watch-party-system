import { z } from 'zod';

export type Role = 'HOST' | 'MODERATOR' | 'PARTICIPANT';

export interface Participant {
  id: string; // Server-generated participant ID (UUID)
  socketId: string;
  displayName: string;
  role: Role;
  joinedAt: number;
  isConnected: boolean;
}

export type PlaybackMode = 'HOST_MODERATED' | 'FREE_FOR_ALL';

export interface RoomSettings {
  playbackMode: PlaybackMode;
  isLocked: boolean;
  hasPasscode: boolean;
  slowModeSeconds: number;
}

export interface RoomState {
  roomId: string;
  videoId: string | null;
  isPlaying: boolean;
  currentTime: number; // In seconds
  updatedAt: number; // Milliseconds timestamp of last state change
  revision: number; // Monotonically increasing revision counter
  hostParticipantId: string;
  settings: RoomSettings;
}

export type PlaybackActionType = 'PLAY' | 'PAUSE' | 'SEEK' | 'CHANGE_VIDEO';

export interface PlaybackActionPayload {
  currentTime?: number;
  videoId?: string;
}

export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

export interface PlaybackRequest {
  id: string;
  roomId: string;
  requesterId: string;
  requesterName: string;
  action: PlaybackActionType;
  payload: PlaybackActionPayload;
  timestamp: number;
  status: RequestStatus;
  reviewedBy?: string;
  reviewedAt?: number;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderRole: Role;
  text: string;
  timestamp: number;
}

// Zod schemas for client event validation
export const createRoomSchema = z.object({
  displayName: z.string().trim().min(2, 'Username must be at least 2 characters').max(25, 'Username must not exceed 25 characters')
});

export const joinRoomSchema = z.object({
  roomId: z.string().trim().min(4, 'Invalid room code'),
  displayName: z.string().trim().min(2, 'Username must be at least 2 characters').max(25, 'Username must not exceed 25 characters'),
  passcode: z.string().trim().optional()
});

export const updateRoomSettingsSchema = z.object({
  playbackMode: z.enum(['HOST_MODERATED', 'FREE_FOR_ALL']).optional(),
  isLocked: z.boolean().optional(),
  passcode: z.string().max(32).nullable().optional(),
  slowModeSeconds: z.number().int().min(0).max(300).optional()
});

export const playSchema = z.object({
  currentTime: z.number().min(0, 'Current time must be non-negative')
});

export const pauseSchema = z.object({
  currentTime: z.number().min(0, 'Current time must be non-negative')
});

export const seekSchema = z.object({
  currentTime: z.number().min(0, 'Seek timestamp must be non-negative')
});

export const changeVideoSchema = z.object({
  videoId: z.string().trim().regex(/^[a-zA-Z0-9_-]{11}$/, 'Invalid YouTube video ID format')
});

export const assignRoleSchema = z.object({
  targetParticipantId: z.string().uuid('Invalid participant ID'),
  role: z.enum(['MODERATOR', 'PARTICIPANT'], {
    errorMap: () => ({ message: 'Can only assign MODERATOR or PARTICIPANT role' })
  })
});

export const removeParticipantSchema = z.object({
  targetParticipantId: z.string().uuid('Invalid participant ID')
});

export const requestPlaybackControlSchema = z.object({
  action: z.enum(['PLAY', 'PAUSE', 'SEEK', 'CHANGE_VIDEO']),
  currentTime: z.number().min(0).optional(),
  videoId: z.string().trim().regex(/^[a-zA-Z0-9_-]{11}$/, 'Invalid YouTube video ID format').optional()
}).refine(data => {
  if (data.action === 'CHANGE_VIDEO' && !data.videoId) return false;
  if (data.action === 'SEEK' && typeof data.currentTime !== 'number') return false;
  return true;
}, {
  message: 'Invalid request payload for specified action'
});

export const respondToPlaybackRequestSchema = z.object({
  requestId: z.string().uuid('Invalid request ID'),
  approve: z.boolean()
});

export const chatMessageSchema = z.object({
  text: z.string().trim().min(1, 'Message cannot be empty').max(280, 'Message cannot exceed 280 characters')
});

export interface StructuredError {
  code: string;
  message: string;
  details?: unknown;
}
