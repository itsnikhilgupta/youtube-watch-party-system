import { Server, Socket } from 'socket.io';
import { roomManager } from '../services/RoomManager.js';
import { requestManager } from '../services/RequestManager.js';
import {
  assignRoleSchema,
  changeVideoSchema,
  chatMessageSchema,
  createRoomSchema,
  joinRoomSchema,
  pauseSchema,
  playSchema,
  removeParticipantSchema,
  requestPlaybackControlSchema,
  respondToPlaybackRequestSchema,
  seekSchema,
  updateRoomSettingsSchema,
  ChatMessage,
  Role,
} from '../types/index.js';
import { generateUuid } from '../utils/crypto.js';

export function setupSocketHandlers(io: Server): void {
  // Wire up room closure broadcast
  roomManager.setOnRoomClosedCallback((roomId, reason) => {
    io.to(roomId).emit('room_closed', { reason });
    requestManager.clearRoom(roomId);
  });

  io.on('connection', (socket: Socket) => {
    // -------------------------------------------------------------
    // Helper: Structured Error Emitter
    // -------------------------------------------------------------
    const emitError = (code: string, message: string, ack?: (res: unknown) => void) => {
      const err = { code, message, timestamp: Date.now() };
      socket.emit('operation_rejected', err);
      if (typeof ack === 'function') {
        ack({ success: false, error: err });
      }
    };

    // -------------------------------------------------------------
    // Helper: Authenticate Socket and Fetch Authoritative Role
    // -------------------------------------------------------------
    const getAuthenticatedContext = () => {
      const context = roomManager.getBySocketId(socket.id);
      if (!context) {
        return null;
      }
      return {
        room: context.room,
        participant: context.participant,
        role: context.participant.role,
        roomId: context.room.state.roomId,
      };
    };

    // -------------------------------------------------------------
    // 1. CREATE ROOM
    // -------------------------------------------------------------
    socket.on('create_room', (payload, ack) => {
      try {
        const validated = createRoomSchema.parse(payload);
        const { room, participant } = roomManager.createRoom(validated.displayName, socket.id);

        socket.join(room.roomId);

        const response = {
          success: true,
          room,
          participant,
          participants: [participant],
          requests: [],
        };

        socket.emit('room_created', response);
        if (typeof ack === 'function') ack(response);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to create room';
        emitError('CREATE_ROOM_FAILED', msg, ack);
      }
    });

    // -------------------------------------------------------------
    // 2. JOIN ROOM
    // -------------------------------------------------------------
    socket.on('join_room', (payload, ack) => {
      try {
        const validated = joinRoomSchema.parse(payload);
        const { room, participant, currentParticipants } = roomManager.joinRoom(
          validated.roomId,
          validated.displayName,
          socket.id,
          validated.passcode
        );

        socket.join(room.roomId);

        const requests = requestManager.getRoomRequests(room.roomId);
        const response = {
          success: true,
          room,
          participant,
          participants: currentParticipants,
          requests,
        };

        socket.emit('room_joined', response);
        // Broadcast user joined to other room members
        socket.to(room.roomId).emit('user_joined', { participant });
        socket.to(room.roomId).emit('participants_updated', { participants: currentParticipants });

        if (typeof ack === 'function') ack(response);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to join room';
        emitError('JOIN_ROOM_FAILED', msg, ack);
      }
    });

    // -------------------------------------------------------------
    // 3. RECONNECT PARTICIPANT
    // -------------------------------------------------------------
    socket.on('reconnect_session', (payload, ack) => {
      try {
        const { roomId, participantId } = payload || {};
        if (!roomId || !participantId) {
          return emitError('INVALID_RECONNECT', 'Room ID and participant ID required', ack);
        }

        const result = roomManager.reconnectParticipant(roomId, participantId, socket.id);
        if (!result) {
          return emitError('RECONNECT_FAILED', 'Session expired or invalid', ack);
        }

        socket.join(roomId);
        const participants = roomManager.getParticipants(roomId);
        const requests = requestManager.getRoomRequests(roomId);

        const response = {
          success: true,
          room: result.room,
          participant: result.participant,
          participants,
          requests,
        };

        socket.emit('room_joined', response);
        socket.to(roomId).emit('participants_updated', { participants });
        if (typeof ack === 'function') ack(response);
      } catch (err: unknown) {
        emitError('RECONNECT_ERROR', (err as Error).message, ack);
      }
    });

    // -------------------------------------------------------------
    // 4. PLAY (Host & Moderator only)
    // -------------------------------------------------------------
    socket.on('play', (payload, ack) => {
      const auth = getAuthenticatedContext();
      if (!auth) return emitError('NOT_IN_ROOM', 'You must join a room first', ack);

      const canControl = auth.role === 'HOST' || auth.role === 'MODERATOR' || auth.room.settings.playbackMode === 'FREE_FOR_ALL';
      if (!canControl) {
        return emitError('UNAUTHORIZED', 'Participants must request permission to play', ack);
      }

      try {
        const validated = playSchema.parse(payload);
        const updatedState = roomManager.updatePlayback(auth.roomId, {
          isPlaying: true,
          currentTime: validated.currentTime,
        });

        io.to(auth.roomId).emit('sync_state', { room: updatedState });
        if (typeof ack === 'function') ack({ success: true, room: updatedState });
      } catch (err: unknown) {
        emitError('INVALID_PAYLOAD', (err as Error).message, ack);
      }
    });

    // -------------------------------------------------------------
    // 5. PAUSE (Host & Moderator only)
    // -------------------------------------------------------------
    socket.on('pause', (payload, ack) => {
      const auth = getAuthenticatedContext();
      if (!auth) return emitError('NOT_IN_ROOM', 'You must join a room first', ack);

      const canControl = auth.role === 'HOST' || auth.role === 'MODERATOR' || auth.room.settings.playbackMode === 'FREE_FOR_ALL';
      if (!canControl) {
        return emitError('UNAUTHORIZED', 'Participants must request permission to pause', ack);
      }

      try {
        const validated = pauseSchema.parse(payload);
        const updatedState = roomManager.updatePlayback(auth.roomId, {
          isPlaying: false,
          currentTime: validated.currentTime,
        });

        io.to(auth.roomId).emit('sync_state', { room: updatedState });
        if (typeof ack === 'function') ack({ success: true, room: updatedState });
      } catch (err: unknown) {
        emitError('INVALID_PAYLOAD', (err as Error).message, ack);
      }
    });

    // -------------------------------------------------------------
    // 6. SEEK (Host & Moderator only)
    // -------------------------------------------------------------
    socket.on('seek', (payload, ack) => {
      const auth = getAuthenticatedContext();
      if (!auth) return emitError('NOT_IN_ROOM', 'You must join a room first', ack);

      const canControl = auth.role === 'HOST' || auth.role === 'MODERATOR' || auth.room.settings.playbackMode === 'FREE_FOR_ALL';
      if (!canControl) {
        return emitError('UNAUTHORIZED', 'Participants must request permission to seek', ack);
      }

      try {
        const validated = seekSchema.parse(payload);
        const updatedState = roomManager.updatePlayback(auth.roomId, {
          currentTime: validated.currentTime,
        });

        io.to(auth.roomId).emit('sync_state', { room: updatedState });
        if (typeof ack === 'function') ack({ success: true, room: updatedState });
      } catch (err: unknown) {
        emitError('INVALID_PAYLOAD', (err as Error).message, ack);
      }
    });

    // -------------------------------------------------------------
    // 7. CHANGE VIDEO (Host & Moderator only)
    // -------------------------------------------------------------
    socket.on('change_video', (payload, ack) => {
      const auth = getAuthenticatedContext();
      if (!auth) return emitError('NOT_IN_ROOM', 'You must join a room first', ack);

      const canControl = auth.role === 'HOST' || auth.role === 'MODERATOR' || auth.room.settings.playbackMode === 'FREE_FOR_ALL';
      if (!canControl) {
        return emitError('UNAUTHORIZED', 'Participants must request permission to change the video', ack);
      }

      try {
        const validated = changeVideoSchema.parse(payload);
        const updatedState = roomManager.updatePlayback(auth.roomId, {
          videoId: validated.videoId,
          currentTime: 0,
          isPlaying: true, // Auto-play new video upon change
        });

        io.to(auth.roomId).emit('sync_state', { room: updatedState });
        if (typeof ack === 'function') ack({ success: true, room: updatedState });
      } catch (err: unknown) {
        emitError('INVALID_PAYLOAD', (err as Error).message, ack);
      }
    });

    // -------------------------------------------------------------
    // 8. ASSIGN ROLE (Host only)
    // -------------------------------------------------------------
    socket.on('assign_role', (payload, ack) => {
      const auth = getAuthenticatedContext();
      if (!auth) return emitError('NOT_IN_ROOM', 'You must join a room first', ack);

      if (auth.role !== 'HOST') {
        return emitError('FORBIDDEN', 'Only the Host can assign or revoke roles', ack);
      }

      try {
        const validated = assignRoleSchema.parse(payload);
        const updatedParticipant = roomManager.assignRole(
          auth.roomId,
          validated.targetParticipantId,
          validated.role as 'MODERATOR' | 'PARTICIPANT'
        );

        const allParticipants = roomManager.getParticipants(auth.roomId);
        io.to(auth.roomId).emit('role_assigned', {
          targetParticipantId: validated.targetParticipantId,
          role: validated.role,
        });
        io.to(auth.roomId).emit('participants_updated', { participants: allParticipants });

        if (typeof ack === 'function') ack({ success: true, participant: updatedParticipant });
      } catch (err: unknown) {
        emitError('ASSIGN_ROLE_FAILED', (err as Error).message, ack);
      }
    });

    // -------------------------------------------------------------
    // 9. REMOVE PARTICIPANT (Host only)
    // -------------------------------------------------------------
    socket.on('remove_participant', (payload, ack) => {
      const auth = getAuthenticatedContext();
      if (!auth) return emitError('NOT_IN_ROOM', 'You must join a room first', ack);

      if (auth.role !== 'HOST') {
        return emitError('FORBIDDEN', 'Only the Host can remove participants', ack);
      }

      try {
        const validated = removeParticipantSchema.parse(payload);
        const removed = roomManager.removeParticipant(auth.roomId, validated.targetParticipantId);

        // Notify removed participant directly
        if (removed.socketId) {
          io.to(removed.socketId).emit('participant_removed', {
            targetParticipantId: removed.id,
            reason: 'Removed by the room Host',
          });
        }

        // Invalidate any pending requests they had
        requestManager.invalidateUserRequests(auth.roomId, removed.id);

        const remaining = roomManager.getParticipants(auth.roomId);
        io.to(auth.roomId).emit('participants_updated', { participants: remaining });

        if (typeof ack === 'function') ack({ success: true });
      } catch (err: unknown) {
        emitError('REMOVE_PARTICIPANT_FAILED', (err as Error).message, ack);
      }
    });

    // -------------------------------------------------------------
    // 10. SUBMIT PLAYBACK REQUEST (Participants)
    // -------------------------------------------------------------
    socket.on('request_playback_control', (payload, ack) => {
      const auth = getAuthenticatedContext();
      if (!auth) return emitError('NOT_IN_ROOM', 'You must join a room first', ack);

      try {
        const validated = requestPlaybackControlSchema.parse(payload);
        const request = requestManager.createRequest(
          auth.roomId,
          auth.participant.id,
          auth.participant.displayName,
          validated.action,
          {
            currentTime: validated.currentTime,
            videoId: validated.videoId,
          }
        );

        // Broadcast new request to room (Host UI will display it prominently)
        io.to(auth.roomId).emit('playback_request_received', { request });
        if (typeof ack === 'function') ack({ success: true, request });
      } catch (err: unknown) {
        emitError('REQUEST_FAILED', (err as Error).message, ack);
      }
    });

    // -------------------------------------------------------------
    // 11. RESPOND TO PLAYBACK REQUEST (Host only)
    // -------------------------------------------------------------
    socket.on('respond_to_playback_request', (payload, ack) => {
      const auth = getAuthenticatedContext();
      if (!auth) return emitError('NOT_IN_ROOM', 'You must join a room first', ack);

      if (auth.role !== 'HOST') {
        return emitError('FORBIDDEN', 'Only the Host can approve or reject requests', ack);
      }

      try {
        const validated = respondToPlaybackRequestSchema.parse(payload);
        const updatedRequest = requestManager.reviewRequest(
          auth.roomId,
          validated.requestId,
          auth.participant.id,
          validated.approve
        );

        // If approved, execute action authoritatively
        if (validated.approve) {
          let stateUpdate: { isPlaying?: boolean; currentTime?: number; videoId?: string } = {};

          if (updatedRequest.action === 'PLAY') {
            stateUpdate = { isPlaying: true, currentTime: updatedRequest.payload.currentTime };
          } else if (updatedRequest.action === 'PAUSE') {
            stateUpdate = { isPlaying: false, currentTime: updatedRequest.payload.currentTime };
          } else if (updatedRequest.action === 'SEEK') {
            stateUpdate = { currentTime: updatedRequest.payload.currentTime };
          } else if (updatedRequest.action === 'CHANGE_VIDEO') {
            stateUpdate = {
              videoId: updatedRequest.payload.videoId,
              currentTime: 0,
              isPlaying: true,
            };
          }

          const newState = roomManager.updatePlayback(auth.roomId, stateUpdate);
          io.to(auth.roomId).emit('sync_state', { room: newState });
        }

        io.to(auth.roomId).emit('playback_request_updated', { request: updatedRequest });
        if (typeof ack === 'function') ack({ success: true, request: updatedRequest });
      } catch (err: unknown) {
        emitError('RESPOND_REQUEST_FAILED', (err as Error).message, ack);
      }
    });

    // -------------------------------------------------------------
    // 12. SEND CHAT
    // -------------------------------------------------------------
    socket.on('send_chat', (payload, ack) => {
      const auth = getAuthenticatedContext();
      if (!auth) return emitError('NOT_IN_ROOM', 'You must join a room first', ack);

      try {
        const validated = chatMessageSchema.parse(payload);

        // Check chat slow mode
        const slowModeCheck = roomManager.canSendChatMessage(auth.roomId, auth.participant.id, auth.role);
        if (!slowModeCheck.allowed) {
          return emitError(
            'SLOW_MODE_ACTIVE',
            `Slow mode active. Please wait ${slowModeCheck.waitSeconds}s before sending another message.`,
            ack
          );
        }

        const chatMsg: ChatMessage = {
          id: generateUuid(),
          roomId: auth.roomId,
          senderId: auth.participant.id,
          senderName: auth.participant.displayName,
          senderRole: auth.role,
          text: validated.text,
          timestamp: Date.now(),
        };

        roomManager.recordChatMessage(auth.roomId, auth.participant.id);
        io.to(auth.roomId).emit('chat_message', { message: chatMsg });
        if (typeof ack === 'function') ack({ success: true, message: chatMsg });
      } catch (err: unknown) {
        emitError('CHAT_ERROR', (err as Error).message, ack);
      }
    });

    // -------------------------------------------------------------
    // 12b. UPDATE ROOM SETTINGS (Host only)
    // -------------------------------------------------------------
    socket.on('update_room_settings', (payload, ack) => {
      const auth = getAuthenticatedContext();
      if (!auth) return emitError('NOT_IN_ROOM', 'You must join a room first', ack);

      if (auth.role !== 'HOST') {
        return emitError('FORBIDDEN', 'Only the Host can modify room settings', ack);
      }

      try {
        const validated = updateRoomSettingsSchema.parse(payload);
        const result = roomManager.updateRoomSettings(auth.roomId, validated);

        // Broadcast updated room settings and state to the room
        io.to(auth.roomId).emit('room_settings_updated', {
          settings: result.settings,
          room: result.room,
        });

        if (typeof ack === 'function') {
          ack({ success: true, settings: result.settings, room: result.room });
        }
      } catch (err: unknown) {
        emitError('UPDATE_SETTINGS_FAILED', (err as Error).message, ack);
      }
    });

    // -------------------------------------------------------------
    // 13. REQUEST SYNC / REFRESH
    // -------------------------------------------------------------
    socket.on('request_sync', (ack) => {
      const auth = getAuthenticatedContext();
      if (!auth) return emitError('NOT_IN_ROOM', 'You must join a room first', ack);

      const expectedTime = roomManager.calculateExpectedTime(auth.room.state);
      const state = {
        ...auth.room.state,
        currentTime: expectedTime,
      };

      socket.emit('sync_state', { room: state });
      if (typeof ack === 'function') ack({ success: true, room: state });
    });

    // -------------------------------------------------------------
    // 14. DISCONNECT
    // -------------------------------------------------------------
    socket.on('disconnect', () => {
      const result = roomManager.handleDisconnect(socket.id);
      if (result) {
        const { roomId, participant, remainingParticipants, isHost } = result;

        if (!isHost) {
          // Invalidate any pending requests
          requestManager.invalidateUserRequests(roomId, participant.id);
          io.to(roomId).emit('user_left', {
            participantId: participant.id,
            remainingParticipants,
          });
          io.to(roomId).emit('participants_updated', {
            participants: remainingParticipants,
          });
        } else {
          // Notify room that Host temporarily disconnected (grace period running)
          io.to(roomId).emit('host_disconnected_grace_period', {
            message: 'Host temporarily disconnected. Waiting for reconnection...',
          });
        }
      }
    });
  });
}
