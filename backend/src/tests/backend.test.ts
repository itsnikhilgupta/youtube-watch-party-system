import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RoomManager } from '../services/RoomManager.js';
import { RequestManager } from '../services/RequestManager.js';
import { extractYouTubeVideoId, generateRoomCode } from '../utils/crypto.js';
import {
  changeVideoSchema,
  createRoomSchema,
  joinRoomSchema,
  requestPlaybackControlSchema,
  respondToPlaybackRequestSchema,
} from '../types/index.js';

describe('WatchTogether Backend Test Suite', () => {
  let roomManager: RoomManager;
  let requestManager: RequestManager;

  beforeEach(() => {
    roomManager = new RoomManager();
    requestManager = new RequestManager();
  });

  // ==============================================================
  // 1. ROOM MANAGEMENT & IDENTITIES
  // ==============================================================
  describe('Room Management', () => {
    it('creates a room with secure code and grants creator HOST role', () => {
      const { room, participant } = roomManager.createRoom('Alice', 'socket-alice-1');

      expect(room.roomId).toBeDefined();
      expect(room.roomId).toMatch(/^[a-z0-9]{3}-[a-z0-9]{3}-[a-z0-9]{3}$/);
      expect(room.hostParticipantId).toBe(participant.id);
      expect(participant.displayName).toBe('Alice');
      expect(participant.role).toBe('HOST');
      expect(participant.id).toBeDefined();
    });

    it('allows a second user to join, assigning PARTICIPANT role authoritatively', () => {
      const { room: createdRoom } = roomManager.createRoom('Alice', 'socket-alice');
      const { room: joinedRoom, participant: bob, currentParticipants } = roomManager.joinRoom(
        createdRoom.roomId,
        'Bob',
        'socket-bob'
      );

      expect(joinedRoom.roomId).toBe(createdRoom.roomId);
      expect(bob.displayName).toBe('Bob');
      expect(bob.role).toBe('PARTICIPANT');
      expect(bob.id).not.toBe(createdRoom.hostParticipantId);
      expect(currentParticipants.length).toBe(2);
    });

    it('rejects joining a non-existent room', () => {
      expect(() => {
        roomManager.joinRoom('non-existent-room-code', 'Charlie', 'socket-charlie');
      }).toThrow('ROOM_NOT_FOUND');
    });

    it('generates unique participant identities for multiple users', () => {
      const { room } = roomManager.createRoom('Alice', 'socket-alice');
      const { participant: bob } = roomManager.joinRoom(room.roomId, 'Bob', 'socket-bob');
      const { participant: charlie } = roomManager.joinRoom(room.roomId, 'Charlie', 'socket-charlie');

      const ids = new Set([room.hostParticipantId, bob.id, charlie.id]);
      expect(ids.size).toBe(3);
    });

    it('handles participant disconnection and updates participant count', () => {
      const { room } = roomManager.createRoom('Alice', 'socket-alice');
      const { participant: bob } = roomManager.joinRoom(room.roomId, 'Bob', 'socket-bob');

      const disconnectResult = roomManager.handleDisconnect('socket-bob');
      expect(disconnectResult).not.toBeNull();
      expect(disconnectResult?.participant.id).toBe(bob.id);
      expect(disconnectResult?.remainingParticipants.length).toBe(1);

      const remaining = roomManager.getParticipants(room.roomId);
      expect(remaining.length).toBe(1);
      expect(remaining[0].displayName).toBe('Alice');
    });
  });

  // ==============================================================
  // 2. AUTHORIZATION & ROLE ASSIGNMENT
  // ==============================================================
  describe('Authorization & Role Assignment', () => {
    it('allows Host to promote a Participant to Moderator and demote back', () => {
      const { room } = roomManager.createRoom('Alice', 'socket-alice');
      const { participant: bob } = roomManager.joinRoom(room.roomId, 'Bob', 'socket-bob');

      expect(bob.role).toBe('PARTICIPANT');

      // Promote to MODERATOR
      const promoted = roomManager.assignRole(room.roomId, bob.id, 'MODERATOR');
      expect(promoted.role).toBe('MODERATOR');

      // Demote back to PARTICIPANT
      const demoted = roomManager.assignRole(room.roomId, bob.id, 'PARTICIPANT');
      expect(demoted.role).toBe('PARTICIPANT');
    });

    it('prevents demoting or changing the Host role through assignRole', () => {
      const { room, participant: host } = roomManager.createRoom('Alice', 'socket-alice');

      expect(() => {
        roomManager.assignRole(room.roomId, host.id, 'PARTICIPANT');
      }).toThrow('CANNOT_CHANGE_HOST_ROLE');
    });

    it('allows Host to remove a participant, but prevents removing the Host', () => {
      const { room, participant: host } = roomManager.createRoom('Alice', 'socket-alice');
      const { participant: bob } = roomManager.joinRoom(room.roomId, 'Bob', 'socket-bob');

      // Host cannot remove themselves through ordinary participant removal
      expect(() => {
        roomManager.removeParticipant(room.roomId, host.id);
      }).toThrow('CANNOT_REMOVE_HOST');

      // Host removes Bob
      const removedBob = roomManager.removeParticipant(room.roomId, bob.id);
      expect(removedBob.id).toBe(bob.id);

      const participants = roomManager.getParticipants(room.roomId);
      expect(participants.find(p => p.id === bob.id)).toBeUndefined();
    });
  });

  // ==============================================================
  // 3. PLAYBACK SYNCHRONIZATION & REVISIONS
  // ==============================================================
  describe('Playback Synchronization', () => {
    it('updates playback state with incrementing revisions', () => {
      const { room } = roomManager.createRoom('Alice', 'socket-alice');
      expect(room.revision).toBe(1);
      expect(room.isPlaying).toBe(false);

      // Play event
      const playState = roomManager.updatePlayback(room.roomId, {
        isPlaying: true,
        currentTime: 10,
      });
      expect(playState.isPlaying).toBe(true);
      expect(playState.currentTime).toBe(10);
      expect(playState.revision).toBe(2);

      // Pause event
      const pauseState = roomManager.updatePlayback(room.roomId, {
        isPlaying: false,
        currentTime: 25,
      });
      expect(pauseState.isPlaying).toBe(false);
      expect(pauseState.currentTime).toBe(25);
      expect(pauseState.revision).toBe(3);

      // Seek event
      const seekState = roomManager.updatePlayback(room.roomId, {
        currentTime: 120,
      });
      expect(seekState.currentTime).toBe(120);
      expect(seekState.revision).toBe(4);

      // Change video event
      const changeVideoState = roomManager.updatePlayback(room.roomId, {
        videoId: 'kJQP7kiw5Fk',
        currentTime: 0,
        isPlaying: true,
      });
      expect(changeVideoState.videoId).toBe('kJQP7kiw5Fk');
      expect(changeVideoState.currentTime).toBe(0);
      expect(changeVideoState.isPlaying).toBe(true);
      expect(changeVideoState.revision).toBe(5);
    });

    it('calculates expected playback time considering elapsed time while playing', () => {
      const { room } = roomManager.createRoom('Alice', 'socket-alice');

      // When paused, expected time is exactly currentTime
      expect(roomManager.calculateExpectedTime(room)).toBe(0);

      // When playing, elapsed time is factored in
      const playingState = {
        ...room,
        isPlaying: true,
        currentTime: 30,
        updatedAt: Date.now() - 3000, // 3 seconds ago
      };

      const expected = roomManager.calculateExpectedTime(playingState);
      expect(expected).toBeGreaterThanOrEqual(32.8);
      expect(expected).toBeLessThanOrEqual(33.2);
    });
  });

  // ==============================================================
  // 4. PLAYBACK REQUEST SYSTEM
  // ==============================================================
  describe('Playback Request System', () => {
    it('creates participant requests and allows Host to approve them', () => {
      const { room } = roomManager.createRoom('Alice', 'socket-alice');
      const { participant: bob } = roomManager.joinRoom(room.roomId, 'Bob', 'socket-bob');

      const request = requestManager.createRequest(
        room.roomId,
        bob.id,
        bob.displayName,
        'SEEK',
        { currentTime: 75 }
      );

      expect(request.id).toBeDefined();
      expect(request.status).toBe('PENDING');
      expect(request.action).toBe('SEEK');
      expect(request.payload.currentTime).toBe(75);

      // Host approves request
      const approved = requestManager.reviewRequest(room.roomId, request.id, room.hostParticipantId, true);
      expect(approved.status).toBe('APPROVED');
      expect(approved.reviewedBy).toBe(room.hostParticipantId);

      // Idempotency: cannot approve or reject twice
      expect(() => {
        requestManager.reviewRequest(room.roomId, request.id, room.hostParticipantId, true);
      }).toThrow('REQUEST_ALREADY_PROCESSED');
    });

    it('supports rejecting requests without altering pending states twice', () => {
      const { room } = roomManager.createRoom('Alice', 'socket-alice');
      const { participant: bob } = roomManager.joinRoom(room.roomId, 'Bob', 'socket-bob');

      const request = requestManager.createRequest(
        room.roomId,
        bob.id,
        bob.displayName,
        'PLAY',
        { currentTime: 15 }
      );

      const rejected = requestManager.reviewRequest(room.roomId, request.id, room.hostParticipantId, false);
      expect(rejected.status).toBe('REJECTED');
    });

    it('invalidates pending requests if the requester leaves the room', () => {
      const { room } = roomManager.createRoom('Alice', 'socket-alice');
      const { participant: bob } = roomManager.joinRoom(room.roomId, 'Bob', 'socket-bob');

      requestManager.createRequest(room.roomId, bob.id, bob.displayName, 'PLAY', {});
      const expired = requestManager.invalidateUserRequests(room.roomId, bob.id);

      expect(expired.length).toBe(1);
      expect(expired[0].status).toBe('EXPIRED');
    });
  });

  // ==============================================================
  // 5. SECURITY & INPUT VALIDATION
  // ==============================================================
  describe('Security & Validation', () => {
    it('validates YouTube URL formats correctly', () => {
      expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
      expect(extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
      expect(extractYouTubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
      expect(extractYouTubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
      expect(extractYouTubeVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');

      // Invalid URLs / payloads
      expect(extractYouTubeVideoId('https://malicious-site.com/video')).toBeNull();
      expect(extractYouTubeVideoId('<script>alert(1)</script>')).toBeNull();
      expect(extractYouTubeVideoId('')).toBeNull();
    });

    it('enforces schema bounds on usernames and room codes', () => {
      expect(() => createRoomSchema.parse({ displayName: 'A' })).toThrow();
      expect(() => createRoomSchema.parse({ displayName: 'a'.repeat(30) })).toThrow();
      expect(createRoomSchema.parse({ displayName: 'ValidUser' })).toBeDefined();

      expect(() => joinRoomSchema.parse({ roomId: 'x', displayName: 'Valid' })).toThrow();
      expect(() => changeVideoSchema.parse({ videoId: 'invalid-id-too-short' })).toThrow();
      expect(changeVideoSchema.parse({ videoId: 'dQw4w9WgXcQ' })).toBeDefined();
    });
  });

  // ==============================================================
  // 6. ROOM MODE SETTINGS (HOST PERMISSIONS)
  // ==============================================================
  describe('Room Mode Settings (Host Permissions)', () => {
    it('initializes room with default Host Moderated settings', () => {
      const { room } = roomManager.createRoom('Alice', 'socket-alice');
      expect(room.settings).toBeDefined();
      expect(room.settings.playbackMode).toBe('HOST_MODERATED');
      expect(room.settings.isLocked).toBe(false);
      expect(room.settings.hasPasscode).toBe(false);
      expect(room.settings.slowModeSeconds).toBe(0);
    });

    it('allows Host to update playback mode to Free-for-All', () => {
      const { room } = roomManager.createRoom('Alice', 'socket-alice');
      const updated = roomManager.updateRoomSettings(room.roomId, {
        playbackMode: 'FREE_FOR_ALL',
      });

      expect(updated.settings.playbackMode).toBe('FREE_FOR_ALL');
      expect(roomManager.getRoom(room.roomId)?.state.settings.playbackMode).toBe('FREE_FOR_ALL');
    });

    it('enforces room lock to prevent new participants from joining', () => {
      const { room } = roomManager.createRoom('Alice', 'socket-alice');
      roomManager.updateRoomSettings(room.roomId, { isLocked: true });

      expect(() => {
        roomManager.joinRoom(room.roomId, 'Bob', 'socket-bob');
      }).toThrow('ROOM_LOCKED');
    });

    it('enforces passcode requirement and validation', () => {
      const { room } = roomManager.createRoom('Alice', 'socket-alice');
      roomManager.updateRoomSettings(room.roomId, { passcode: 'secret123' });

      // Missing passcode
      expect(() => {
        roomManager.joinRoom(room.roomId, 'Bob', 'socket-bob');
      }).toThrow('ROOM_PASSCODE_REQUIRED');

      // Invalid passcode
      expect(() => {
        roomManager.joinRoom(room.roomId, 'Bob', 'socket-bob', 'wrong-pass');
      }).toThrow('INVALID_PASSCODE');

      // Correct passcode
      const { participant } = roomManager.joinRoom(room.roomId, 'Bob', 'socket-bob', 'secret123');
      expect(participant.displayName).toBe('Bob');
    });

    it('enforces chat slow mode rate-limiting on participants while allowing host bypass', () => {
      const { room } = roomManager.createRoom('Alice', 'socket-alice');
      const { participant: bob } = roomManager.joinRoom(room.roomId, 'Bob', 'socket-bob');

      // Set slow mode to 5 seconds
      roomManager.updateRoomSettings(room.roomId, { slowModeSeconds: 5 });

      // Host can always chat
      const hostCheck = roomManager.canSendChatMessage(room.roomId, room.hostParticipantId, 'HOST');
      expect(hostCheck.allowed).toBe(true);

      // Participant initial message is allowed
      const bobCheck1 = roomManager.canSendChatMessage(room.roomId, bob.id, 'PARTICIPANT');
      expect(bobCheck1.allowed).toBe(true);

      // Record Bob's message
      roomManager.recordChatMessage(room.roomId, bob.id);

      // Immediate subsequent message should be blocked by cooldown
      const bobCheck2 = roomManager.canSendChatMessage(room.roomId, bob.id, 'PARTICIPANT');
      expect(bobCheck2.allowed).toBe(false);
      expect(bobCheck2.waitSeconds).toBeGreaterThanOrEqual(1);
    });
  });
});
