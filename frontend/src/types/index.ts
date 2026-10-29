export type Role = 'HOST' | 'MODERATOR' | 'PARTICIPANT';

export interface Participant {
  id: string;
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
  currentTime: number;
  updatedAt: number;
  revision: number;
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

export interface StructuredError {
  code: string;
  message: string;
  timestamp?: number;
}

export type SyncStatus = 'synced' | 'syncing' | 'drift_correcting' | 'paused' | 'buffering' | 'error';
