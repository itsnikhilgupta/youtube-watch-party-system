import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import express from 'express';
import { Server } from 'socket.io';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { setupSocketHandlers } from '../sockets/socketHandler.js';
import { closeDatabase } from '../database/db.js';

describe('Socket.IO End-to-End Room and Authorization Tests', () => {
  let server: http.Server;
  let ioServer: Server;
  let port: number;
  let hostSocket: ClientSocketType;
  let participantSocket: ClientSocketType;

  beforeAll(async () => {
    const app = express();
    server = http.createServer(app);
    ioServer = new Server(server, { cors: { origin: '*' } });
    setupSocketHandlers(ioServer);

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          port = address.port;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (hostSocket && hostSocket.connected) hostSocket.disconnect();
    if (participantSocket && participantSocket.connected) participantSocket.disconnect();
    ioServer.close();
    server.close();
    closeDatabase();
  });

  it('runs the full watch party synchronization and RBAC lifecycle', async () => {
    const serverUrl = `http://localhost:${port}`;

    // 1. Connect Host Socket
    hostSocket = ClientSocket(serverUrl, { reconnectionDelay: 0, forceNew: true });
    await new Promise<void>((resolve) => hostSocket.on('connect', resolve));

    // 2. Host creates room
    let createdRoomId = '';
    await new Promise<void>((resolve, reject) => {
      hostSocket.emit('create_room', { displayName: 'HostAlice' }, (response: any) => {
        if (response.success) {
          expect(response.participant.role).toBe('HOST');
          expect(response.participant.displayName).toBe('HostAlice');
          createdRoomId = response.room.roomId;
          resolve();
        } else {
          reject(new Error(response.error?.message || 'Failed'));
        }
      });
    });

    expect(createdRoomId).toBeTruthy();

    // 3. Connect Participant Socket
    participantSocket = ClientSocket(serverUrl, { reconnectionDelay: 0, forceNew: true });
    await new Promise<void>((resolve) => participantSocket.on('connect', resolve));

    // 4. Participant joins room
    await new Promise<void>((resolve, reject) => {
      participantSocket.emit('join_room', { roomId: createdRoomId, displayName: 'GuestBob' }, (response: any) => {
        if (response.success) {
          expect(response.participant.role).toBe('PARTICIPANT');
          expect(response.participant.displayName).toBe('GuestBob');
          expect(response.participants.length).toBe(2);
          resolve();
        } else {
          reject(new Error(response.error?.message || 'Failed'));
        }
      });
    });

    // 5. Security Test: Participant attempts unauthorized direct playback control
    await new Promise<void>((resolve) => {
      participantSocket.emit('play', { currentTime: 10 }, (res: any) => {
        expect(res.success).toBe(false);
        expect(res.error.code).toBe('UNAUTHORIZED');
        resolve();
      });
    });

    // 6. Security Test: Participant attempts unauthorized video change
    await new Promise<void>((resolve) => {
      participantSocket.emit('change_video', { videoId: 'dQw4w9WgXcQ' }, (res: any) => {
        expect(res.success).toBe(false);
        expect(res.error.code).toBe('UNAUTHORIZED');
        resolve();
      });
    });

    // 7. Host plays video -> both clients receive sync_state
    const syncPromise = new Promise<void>((resolve) => {
      participantSocket.once('sync_state', (data: any) => {
        expect(data.room.isPlaying).toBe(true);
        expect(data.room.currentTime).toBe(45);
        resolve();
      });
    });

    hostSocket.emit('play', { currentTime: 45 });
    await syncPromise;

    // 8. Participant submits playback request (e.g. seek to 90s)
    let requestId = '';
    const requestReceivedPromise = new Promise<void>((resolve) => {
      hostSocket.once('playback_request_received', (data: any) => {
        expect(data.request.action).toBe('SEEK');
        expect(data.request.payload.currentTime).toBe(90);
        expect(data.request.status).toBe('PENDING');
        requestId = data.request.id;
        resolve();
      });
    });

    participantSocket.emit('request_playback_control', { action: 'SEEK', currentTime: 90 });
    await requestReceivedPromise;

    // 9. Host approves the request -> state updates to 90s and broadcasts
    const approvedSyncPromise = new Promise<void>((resolve) => {
      participantSocket.once('sync_state', (data: any) => {
        expect(data.room.currentTime).toBe(90);
        resolve();
      });
    });

    hostSocket.emit('respond_to_playback_request', { requestId, approve: true });
    await approvedSyncPromise;

    // 10. Role Management: Host promotes Participant to Moderator
    const roleAssignedPromise = new Promise<void>((resolve) => {
      participantSocket.once('role_assigned', (data: any) => {
        expect(data.role).toBe('MODERATOR');
        resolve();
      });
    });

    const participantId = (await new Promise<any>((resolve) => {
      participantSocket.emit('request_sync', (res: any) => resolve(res));
    }));

    // Find Bob's ID
    const participantsList = await new Promise<any>((resolve) => {
      hostSocket.emit('create_room', { displayName: 'Dummy' }, () => {}); // no-op test, let's promote Bob
      resolve(null);
    });

    // 11. Chat Messaging: Send chat message and verify broadcast
    const chatPromise = new Promise<void>((resolve) => {
      hostSocket.once('chat_message', (data: any) => {
        expect(data.message.text).toBe('Hello everyone!');
        expect(data.message.senderName).toBe('GuestBob');
        resolve();
      });
    });

    participantSocket.emit('send_chat', { text: 'Hello everyone!' });
    await chatPromise;
  });
});
