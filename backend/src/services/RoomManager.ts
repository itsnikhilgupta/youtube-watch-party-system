import { config } from '../config/index.js';
import { generateRoomCode, generateUuid } from '../utils/crypto.js';
import { Participant, PlaybackMode, Role, RoomSettings, RoomState } from '../types/index.js';
import {
  saveRoomToDb,
  updateRoomPlaybackInDb,
  updateRoomSettingsInDb,
  markRoomClosedInDb,
  getRoomFromDb
} from '../database/db.js';

export interface InternalRoomSettings {
  playbackMode: PlaybackMode;
  isLocked: boolean;
  passcode: string | null;
  slowModeSeconds: number;
}

export interface InternalRoom {
  state: RoomState;
  settings: InternalRoomSettings;
  participants: Map<string, Participant>; // participantId -> Participant
  socketToParticipant: Map<string, string>; // socketId -> participantId
  hostDisconnectTimer: NodeJS.Timeout | null;
  createdAt: number;
  isActive: boolean;
  lastChatMessageTimes: Map<string, number>; // participantId -> timestamp
}

export class RoomManager {
  private rooms: Map<string, InternalRoom> = new Map();
  private onRoomClosedCallback?: (roomId: string, reason: string) => void;

  public setOnRoomClosedCallback(cb: (roomId: string, reason: string) => void) {
    this.onRoomClosedCallback = cb;
  }

  /**
   * Creates a new watch room. The creator is granted the authoritative HOST role.
   */
  public createRoom(displayName: string, socketId: string): { room: RoomState; participant: Participant } {
    let roomId = generateRoomCode();
    // Ensure collision avoidance
    while (this.rooms.has(roomId) || getRoomFromDb(roomId) !== null) {
      roomId = generateRoomCode();
    }

    const participantId = generateUuid();
    const hostParticipant: Participant = {
      id: participantId,
      socketId,
      displayName,
      role: 'HOST',
      joinedAt: Date.now(),
      isConnected: true,
    };

    const initialSettings: InternalRoomSettings = {
      playbackMode: 'HOST_MODERATED',
      isLocked: false,
      passcode: null,
      slowModeSeconds: 0,
    };

    const initialRoomState: RoomState = {
      roomId,
      videoId: 'dQw4w9WgXcQ', // Default initial video (Rick Astley - Never Gonna Give You Up)
      isPlaying: false,
      currentTime: 0,
      updatedAt: Date.now(),
      revision: 1,
      hostParticipantId: participantId,
      settings: {
        playbackMode: 'HOST_MODERATED',
        isLocked: false,
        hasPasscode: false,
        slowModeSeconds: 0,
      },
    };

    const internalRoom: InternalRoom = {
      state: initialRoomState,
      settings: initialSettings,
      participants: new Map([[participantId, hostParticipant]]),
      socketToParticipant: new Map([[socketId, participantId]]),
      hostDisconnectTimer: null,
      createdAt: Date.now(),
      isActive: true,
      lastChatMessageTimes: new Map(),
    };

    this.rooms.set(roomId, internalRoom);
    saveRoomToDb(initialRoomState, null);

    return { room: initialRoomState, participant: hostParticipant };
  }

  /**
   * Joins an existing room. Clients always receive the PARTICIPANT role by default.
   */
  public joinRoom(roomId: string, displayName: string, socketId: string, passcode?: string): {
    room: RoomState;
    participant: Participant;
    currentParticipants: Participant[];
  } {
    const room = this.rooms.get(roomId);
    if (!room || !room.isActive) {
      throw new Error('ROOM_NOT_FOUND');
    }

    if (room.settings.isLocked) {
      throw new Error('ROOM_LOCKED');
    }

    if (room.settings.passcode) {
      if (!passcode || !passcode.trim()) {
        throw new Error('ROOM_PASSCODE_REQUIRED');
      }
      if (passcode.trim() !== room.settings.passcode) {
        throw new Error('INVALID_PASSCODE');
      }
    }

    const participantId = generateUuid();
    const newParticipant: Participant = {
      id: participantId,
      socketId,
      displayName,
      role: 'PARTICIPANT',
      joinedAt: Date.now(),
      isConnected: true,
    };

    room.participants.set(participantId, newParticipant);
    room.socketToParticipant.set(socketId, participantId);

    // Calculate updated time taking into account current elapsed time if playing
    const expectedTime = this.calculateExpectedTime(room.state);
    const synchronizedState: RoomState = {
      ...room.state,
      currentTime: expectedTime,
    };

    return {
      room: synchronizedState,
      participant: newParticipant,
      currentParticipants: Array.from(room.participants.values()),
    };
  }

  /**
   * Reconnects an existing participant with a new socket ID
   */
  public reconnectParticipant(roomId: string, participantId: string, newSocketId: string): {
    room: RoomState;
    participant: Participant;
  } | null {
    const room = this.rooms.get(roomId);
    if (!room || !room.isActive) return null;

    const participant = room.participants.get(participantId);
    if (!participant) return null;

    // Clear old socket mapping
    if (participant.socketId) {
      room.socketToParticipant.delete(participant.socketId);
    }

    participant.socketId = newSocketId;
    participant.isConnected = true;
    room.socketToParticipant.set(newSocketId, participantId);

    // If host reconnected during grace period, cancel the termination timer
    if (participant.role === 'HOST' && room.hostDisconnectTimer) {
      clearTimeout(room.hostDisconnectTimer);
      room.hostDisconnectTimer = null;
    }

    const expectedTime = this.calculateExpectedTime(room.state);
    return {
      room: { ...room.state, currentTime: expectedTime },
      participant,
    };
  }

  /**
   * Find room and participant by socket ID
   */
  public getBySocketId(socketId: string): { room: InternalRoom; participant: Participant } | null {
    for (const room of this.rooms.values()) {
      const participantId = room.socketToParticipant.get(socketId);
      if (participantId) {
        const participant = room.participants.get(participantId);
        if (participant) {
          return { room, participant };
        }
      }
    }
    return null;
  }

  public getRoom(roomId: string): InternalRoom | null {
    return this.rooms.get(roomId) || null;
  }

  public getParticipants(roomId: string): Participant[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return Array.from(room.participants.values()).filter(p => p.isConnected);
  }

  /**
   * Authoritative playback update with revisioning and DB sync
   */
  public updatePlayback(
    roomId: string,
    updates: {
      isPlaying?: boolean;
      currentTime?: number;
      videoId?: string | null;
    }
  ): RoomState {
    const room = this.rooms.get(roomId);
    if (!room || !room.isActive) {
      throw new Error('ROOM_NOT_FOUND');
    }

    const now = Date.now();
    const nextRevision = room.state.revision + 1;

    let nextTime = room.state.currentTime;
    if (typeof updates.currentTime === 'number') {
      nextTime = Math.max(0, updates.currentTime);
    } else if (updates.isPlaying === false && room.state.isPlaying) {
      // Freezing at current expected position
      nextTime = this.calculateExpectedTime(room.state);
    }

    const nextIsPlaying = typeof updates.isPlaying === 'boolean' ? updates.isPlaying : room.state.isPlaying;
    const nextVideoId = updates.videoId !== undefined ? updates.videoId : room.state.videoId;

    room.state = {
      ...room.state,
      isPlaying: nextIsPlaying,
      currentTime: nextTime,
      videoId: nextVideoId,
      updatedAt: now,
      revision: nextRevision,
    };

    updateRoomPlaybackInDb(
      roomId,
      room.state.videoId,
      room.state.isPlaying,
      room.state.currentTime,
      room.state.updatedAt,
      room.state.revision
    );

    return room.state;
  }

  /**
   * Calculate playback time taking into account elapsed time when isPlaying is true
   */
  public calculateExpectedTime(state: RoomState): number {
    if (!state.isPlaying) {
      return state.currentTime;
    }
    const elapsedSeconds = Math.max(0, (Date.now() - state.updatedAt) / 1000);
    return state.currentTime + elapsedSeconds;
  }

  /**
   * Role management: Host assigns/revokes Moderator role
   */
  public assignRole(roomId: string, targetParticipantId: string, newRole: 'MODERATOR' | 'PARTICIPANT'): Participant {
    const room = this.rooms.get(roomId);
    if (!room || !room.isActive) {
      throw new Error('ROOM_NOT_FOUND');
    }

    const target = room.participants.get(targetParticipantId);
    if (!target) {
      throw new Error('PARTICIPANT_NOT_FOUND');
    }

    if (target.role === 'HOST') {
      throw new Error('CANNOT_CHANGE_HOST_ROLE');
    }

    target.role = newRole;
    return target;
  }

  /**
   * Update Room Mode Settings (Host only)
   */
  public updateRoomSettings(
    roomId: string,
    updates: {
      playbackMode?: PlaybackMode;
      isLocked?: boolean;
      passcode?: string | null;
      slowModeSeconds?: number;
    }
  ): { settings: RoomSettings; room: RoomState } {
    const room = this.rooms.get(roomId);
    if (!room || !room.isActive) {
      throw new Error('ROOM_NOT_FOUND');
    }

    if (updates.playbackMode !== undefined) {
      room.settings.playbackMode = updates.playbackMode;
    }
    if (updates.isLocked !== undefined) {
      room.settings.isLocked = updates.isLocked;
    }
    if (updates.passcode !== undefined) {
      room.settings.passcode = updates.passcode && updates.passcode.trim() ? updates.passcode.trim() : null;
    }
    if (updates.slowModeSeconds !== undefined) {
      room.settings.slowModeSeconds = Math.max(0, updates.slowModeSeconds);
    }

    const publicSettings: RoomSettings = {
      playbackMode: room.settings.playbackMode,
      isLocked: room.settings.isLocked,
      hasPasscode: !!room.settings.passcode,
      slowModeSeconds: room.settings.slowModeSeconds,
    };

    room.state.settings = publicSettings;

    updateRoomSettingsInDb(
      roomId,
      room.settings.playbackMode,
      room.settings.isLocked,
      room.settings.passcode,
      room.settings.slowModeSeconds
    );

    return { settings: publicSettings, room: room.state };
  }

  /**
   * Check if participant can send chat based on slow mode
   */
  public canSendChatMessage(
    roomId: string,
    participantId: string,
    role: Role
  ): { allowed: boolean; waitSeconds?: number } {
    const room = this.rooms.get(roomId);
    if (!room) return { allowed: true };

    if (role === 'HOST' || role === 'MODERATOR') {
      return { allowed: true };
    }

    if (room.settings.slowModeSeconds <= 0) {
      return { allowed: true };
    }

    const lastTime = room.lastChatMessageTimes.get(participantId);
    if (lastTime) {
      const elapsedMs = Date.now() - lastTime;
      const cooldownMs = room.settings.slowModeSeconds * 1000;
      if (elapsedMs < cooldownMs) {
        const remainingSeconds = Math.ceil((cooldownMs - elapsedMs) / 1000);
        return { allowed: false, waitSeconds: remainingSeconds };
      }
    }

    return { allowed: true };
  }

  /**
   * Record chat message timestamp for slow mode
   */
  public recordChatMessage(roomId: string, participantId: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.lastChatMessageTimes.set(participantId, Date.now());
    }
  }

  /**
   * Participant removal: Host removes a participant
   */
  public removeParticipant(roomId: string, targetParticipantId: string): Participant {
    const room = this.rooms.get(roomId);
    if (!room || !room.isActive) {
      throw new Error('ROOM_NOT_FOUND');
    }

    const target = room.participants.get(targetParticipantId);
    if (!target) {
      throw new Error('PARTICIPANT_NOT_FOUND');
    }

    if (target.role === 'HOST') {
      throw new Error('CANNOT_REMOVE_HOST');
    }

    room.participants.delete(targetParticipantId);
    if (target.socketId) {
      room.socketToParticipant.delete(target.socketId);
    }

    return target;
  }

  /**
   * Handle socket disconnection
   */
  public handleDisconnect(socketId: string): {
    roomId: string;
    participant: Participant;
    isHost: boolean;
    remainingParticipants: Participant[];
  } | null {
    const found = this.getBySocketId(socketId);
    if (!found) return null;

    const { room, participant } = found;
    const roomId = room.state.roomId;
    participant.isConnected = false;
    room.socketToParticipant.delete(socketId);

    const isHost = participant.role === 'HOST';

    if (isHost) {
      // Start Host reconnection grace period timer
      if (room.hostDisconnectTimer) {
        clearTimeout(room.hostDisconnectTimer);
      }

      room.hostDisconnectTimer = setTimeout(() => {
        // If Host hasn't reconnected by grace period, permanently close room
        if (!participant.isConnected && room.isActive) {
          this.closeRoom(roomId, 'Host disconnected permanently');
        }
      }, config.hostReconnectGracePeriodMs);
    } else {
      // Ordinary participant left: remove from room
      room.participants.delete(participant.id);
    }

    return {
      roomId,
      participant,
      isHost,
      remainingParticipants: Array.from(room.participants.values()).filter(p => p.isConnected),
    };
  }

  /**
   * Gracefully close room and notify
   */
  public closeRoom(roomId: string, reason: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.isActive = false;
    if (room.hostDisconnectTimer) {
      clearTimeout(room.hostDisconnectTimer);
      room.hostDisconnectTimer = null;
    }

    markRoomClosedInDb(roomId);

    if (this.onRoomClosedCallback) {
      this.onRoomClosedCallback(roomId, reason);
    }

    this.rooms.delete(roomId);
  }
}

export const roomManager = new RoomManager();
