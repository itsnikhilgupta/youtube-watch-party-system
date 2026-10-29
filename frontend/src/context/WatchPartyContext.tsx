import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  ChatMessage,
  Participant,
  PlaybackActionType,
  PlaybackMode,
  PlaybackRequest,
  Role,
  RoomSettings,
  RoomState,
  StructuredError,
} from '../types/index.js';

interface WatchPartyContextType {
  socket: Socket | null;
  isConnected: boolean;
  isConnecting: boolean;
  room: RoomState | null;
  currentUser: Participant | null;
  participants: Participant[];
  requests: PlaybackRequest[];
  chatMessages: ChatMessage[];
  lastError: StructuredError | null;
  hostGracePeriodNotice: string | null;
  isRoomClosed: boolean;
  roomClosedReason: string | null;
  clearError: () => void;
  createRoom: (displayName: string) => Promise<string>;
  joinRoom: (roomId: string, displayName: string, passcode?: string) => Promise<void>;
  updateRoomSettings: (settings: {
    playbackMode?: PlaybackMode;
    isLocked?: boolean;
    passcode?: string | null;
    slowModeSeconds?: number;
  }) => Promise<void>;
  play: (currentTime: number) => void;
  pause: (currentTime: number) => void;
  seek: (currentTime: number) => void;
  changeVideo: (videoId: string) => void;
  assignRole: (targetParticipantId: string, role: 'MODERATOR' | 'PARTICIPANT') => void;
  removeParticipant: (targetParticipantId: string) => void;
  requestPlaybackControl: (action: PlaybackActionType, currentTime?: number, videoId?: string) => Promise<void>;
  respondToPlaybackRequest: (requestId: string, approve: boolean) => void;
  sendChat: (text: string) => void;
  leaveRoom: () => void;
}

const WatchPartyContext = createContext<WatchPartyContextType | null>(null);

const BACKEND_URL = import.meta.env.VITE_API_URL || (
  window.location.hostname === 'localhost' ? 'http://localhost:4000' : window.location.origin
);

export const WatchPartyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [currentUser, setCurrentUser] = useState<Participant | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [requests, setRequests] = useState<PlaybackRequest[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [lastError, setLastError] = useState<StructuredError | null>(null);
  const [hostGracePeriodNotice, setHostGracePeriodNotice] = useState<string | null>(null);
  const [isRoomClosed, setIsRoomClosed] = useState<boolean>(false);
  const [roomClosedReason, setRoomClosedReason] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);

  // Initialize socket connection
  useEffect(() => {
    const s = io(BACKEND_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      transports: ['websocket', 'polling'],
    });

    socketRef.current = s;
    setSocket(s);

    s.on('connect', () => {
      setIsConnected(true);
      setIsConnecting(false);
      // If we already had a room and session, attempt re-connection
      const savedSession = sessionStorage.getItem('watchtogether_session');
      if (savedSession) {
        try {
          const { roomId, participantId } = JSON.parse(savedSession);
          if (roomId && participantId) {
            s.emit('reconnect_session', { roomId, participantId }, (res: any) => {
              if (res?.success) {
                setRoom(res.room);
                setCurrentUser(res.participant);
                setParticipants(res.participants || []);
                setRequests(res.requests || []);
              } else {
                sessionStorage.removeItem('watchtogether_session');
              }
            });
          }
        } catch {
          sessionStorage.removeItem('watchtogether_session');
        }
      }
    });

    s.on('disconnect', () => {
      setIsConnected(false);
    });

    s.on('connect_error', (err) => {
      setIsConnected(false);
      setIsConnecting(false);
      console.warn('Socket connection error:', err.message);
    });

    // Room events
    s.on('sync_state', (data: { room: RoomState }) => {
      setRoom(data.room);
    });

    s.on('user_joined', (data: { participant: Participant }) => {
      setParticipants((prev) => {
        if (prev.some((p) => p.id === data.participant.id)) return prev;
        return [...prev, data.participant];
      });
    });

    s.on('user_left', (data: { participantId: string; remainingParticipants: Participant[] }) => {
      setParticipants(data.remainingParticipants);
      setRequests((prev) =>
        prev.map((r) => (r.requesterId === data.participantId && r.status === 'PENDING' ? { ...r, status: 'EXPIRED' } : r))
      );
    });

    s.on('participants_updated', (data: { participants: Participant[] }) => {
      setParticipants(data.participants);
      // If current user is in this list, keep their authoritative role in sync
      setCurrentUser((curr) => {
        if (!curr) return null;
        const updated = data.participants.find((p) => p.id === curr.id);
        return updated || curr;
      });
    });

    s.on('role_assigned', (data: { targetParticipantId: string; role: Role }) => {
      setParticipants((prev) =>
        prev.map((p) => (p.id === data.targetParticipantId ? { ...p, role: data.role } : p))
      );
      setCurrentUser((curr) => {
        if (curr && curr.id === data.targetParticipantId) {
          return { ...curr, role: data.role };
        }
        return curr;
      });
    });

    s.on('participant_removed', (data: { targetParticipantId: string; reason: string }) => {
      setCurrentUser((curr) => {
        if (curr && curr.id === data.targetParticipantId) {
          setIsRoomClosed(true);
          setRoomClosedReason(data.reason || 'You were removed from the room');
        }
        return curr;
      });
    });

    s.on('playback_request_received', (data: { request: PlaybackRequest }) => {
      setRequests((prev) => {
        if (prev.some((r) => r.id === data.request.id)) return prev;
        return [data.request, ...prev];
      });
    });

    s.on('playback_request_updated', (data: { request: PlaybackRequest }) => {
      setRequests((prev) =>
        prev.map((r) => (r.id === data.request.id ? data.request : r))
      );
    });

    s.on('chat_message', (data: { message: ChatMessage }) => {
      setChatMessages((prev) => [...prev, data.message]);
    });

    s.on('room_settings_updated', (data: { settings: RoomSettings; room: RoomState }) => {
      setRoom(data.room);
    });

    s.on('room_closed', (data: { reason: string }) => {
      setIsRoomClosed(true);
      setRoomClosedReason(data.reason || 'Room closed by server');
      sessionStorage.removeItem('watchtogether_session');
    });

    s.on('host_disconnected_grace_period', (data: { message: string }) => {
      setHostGracePeriodNotice(data.message);
      // Auto clear after 15 seconds
      setTimeout(() => setHostGracePeriodNotice(null), 15000);
    });

    s.on('operation_rejected', (err: StructuredError) => {
      setLastError(err);
      setTimeout(() => {
        setLastError((curr) => (curr?.timestamp === err.timestamp ? null : curr));
      }, 5000);
    });

    return () => {
      s.disconnect();
    };
  }, []);

  const clearError = useCallback(() => {
    setLastError(null);
  }, []);

  const createRoom = useCallback(
    (displayName: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        if (!socketRef.current) return reject(new Error('Socket not initialized'));
        setIsConnecting(true);

        socketRef.current.emit('create_room', { displayName }, (res: any) => {
          setIsConnecting(false);
          if (res?.success) {
            setRoom(res.room);
            setCurrentUser(res.participant);
            setParticipants(res.participants);
            setRequests(res.requests || []);
            setChatMessages([]);
            setIsRoomClosed(false);
            sessionStorage.setItem(
              'watchtogether_session',
              JSON.stringify({ roomId: res.room.roomId, participantId: res.participant.id })
            );
            resolve(res.room.roomId);
          } else {
            setLastError(res?.error || { code: 'CREATE_FAILED', message: 'Failed to create room' });
            reject(new Error(res?.error?.message || 'Failed to create room'));
          }
        });
      });
    },
    []
  );

  const joinRoom = useCallback(
    (roomId: string, displayName: string, passcode?: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (!socketRef.current) return reject(new Error('Socket not initialized'));
        setIsConnecting(true);

        socketRef.current.emit('join_room', { roomId, displayName, passcode }, (res: any) => {
          setIsConnecting(false);
          if (res?.success) {
            setRoom(res.room);
            setCurrentUser(res.participant);
            setParticipants(res.participants);
            setRequests(res.requests || []);
            setChatMessages([]);
            setIsRoomClosed(false);
            sessionStorage.setItem(
              'watchtogether_session',
              JSON.stringify({ roomId: res.room.roomId, participantId: res.participant.id })
            );
            resolve();
          } else {
            setLastError(res?.error || { code: 'JOIN_FAILED', message: 'Failed to join room' });
            reject(new Error(res?.error?.message || 'Failed to join room'));
          }
        });
      });
    },
    []
  );

  const updateRoomSettings = useCallback(
    (settings: {
      playbackMode?: PlaybackMode;
      isLocked?: boolean;
      passcode?: string | null;
      slowModeSeconds?: number;
    }): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (!socketRef.current) return reject(new Error('Socket disconnected'));
        socketRef.current.emit('update_room_settings', settings, (res: any) => {
          if (res?.success) {
            if (res.room) setRoom(res.room);
            resolve();
          } else {
            setLastError(res?.error || { code: 'SETTINGS_UPDATE_FAILED', message: 'Failed to update settings' });
            reject(new Error(res?.error?.message || 'Failed to update settings'));
          }
        });
      });
    },
    []
  );

  const play = useCallback((currentTime: number) => {
    if (!socketRef.current) return;
    socketRef.current.emit('play', { currentTime });
  }, []);

  const pause = useCallback((currentTime: number) => {
    if (!socketRef.current) return;
    socketRef.current.emit('pause', { currentTime });
  }, []);

  const seek = useCallback((currentTime: number) => {
    if (!socketRef.current) return;
    socketRef.current.emit('seek', { currentTime });
  }, []);

  const changeVideo = useCallback((videoId: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('change_video', { videoId });
  }, []);

  const assignRole = useCallback((targetParticipantId: string, role: 'MODERATOR' | 'PARTICIPANT') => {
    if (!socketRef.current) return;
    socketRef.current.emit('assign_role', { targetParticipantId, role });
  }, []);

  const removeParticipant = useCallback((targetParticipantId: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('remove_participant', { targetParticipantId });
  }, []);

  const requestPlaybackControl = useCallback(
    (action: PlaybackActionType, currentTime?: number, videoId?: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (!socketRef.current) return reject(new Error('Socket disconnected'));
        socketRef.current.emit('request_playback_control', { action, currentTime, videoId }, (res: any) => {
          if (res?.success) {
            resolve();
          } else {
            setLastError(res?.error || { code: 'REQUEST_FAILED', message: 'Failed to submit request' });
            reject(new Error(res?.error?.message || 'Failed to submit request'));
          }
        });
      });
    },
    []
  );

  const respondToPlaybackRequest = useCallback((requestId: string, approve: boolean) => {
    if (!socketRef.current) return;
    socketRef.current.emit('respond_to_playback_request', { requestId, approve });
  }, []);

  const sendChat = useCallback((text: string) => {
    if (!socketRef.current || !text.trim()) return;
    socketRef.current.emit('send_chat', { text: text.trim() });
  }, []);

  const leaveRoom = useCallback(() => {
    sessionStorage.removeItem('watchtogether_session');
    setRoom(null);
    setCurrentUser(null);
    setParticipants([]);
    setRequests([]);
    setChatMessages([]);
    setIsRoomClosed(false);
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current.connect();
    }
  }, []);

  return (
    <WatchPartyContext.Provider
      value={{
        socket,
        isConnected,
        isConnecting,
        room,
        currentUser,
        participants,
        requests,
        chatMessages,
        lastError,
        hostGracePeriodNotice,
        isRoomClosed,
        roomClosedReason,
        clearError,
        createRoom,
        joinRoom,
        updateRoomSettings,
        play,
        pause,
        seek,
        changeVideo,
        assignRole,
        removeParticipant,
        requestPlaybackControl,
        respondToPlaybackRequest,
        sendChat,
        leaveRoom,
      }}
    >
      {children}
    </WatchPartyContext.Provider>
  );
};

export const useWatchParty = () => {
  const context = useContext(WatchPartyContext);
  if (!context) {
    throw new Error('useWatchParty must be used within a WatchPartyProvider');
  }
  return context;
};
