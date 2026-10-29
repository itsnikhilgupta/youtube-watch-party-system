import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { config } from '../config/index.js';
import { RoomState } from '../types/index.js';

let db: DatabaseSync | null = null;

export function getDatabase(): DatabaseSync {
  if (db) return db;

  const dbDir = path.dirname(config.databasePath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new DatabaseSync(config.databasePath);

  // Initialize schema with parameterized setup and WAL mode
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      video_id TEXT,
      is_playing INTEGER NOT NULL DEFAULT 0,
      current_time REAL NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0,
      host_participant_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      closed_at INTEGER,
      playback_mode TEXT NOT NULL DEFAULT 'HOST_MODERATED',
      is_locked INTEGER NOT NULL DEFAULT 0,
      passcode TEXT,
      slow_mode_seconds INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_rooms_created_at ON rooms(created_at);
    CREATE INDEX IF NOT EXISTS idx_rooms_is_active ON rooms(is_active);

    CREATE TABLE IF NOT EXISTS room_events (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY(room_id) REFERENCES rooms(id)
    );

    CREATE INDEX IF NOT EXISTS idx_events_room_id ON room_events(room_id);
  `);

  // Migrate existing tables if columns missing
  try { db.exec(`ALTER TABLE rooms ADD COLUMN playback_mode TEXT NOT NULL DEFAULT 'HOST_MODERATED';`); } catch {}
  try { db.exec(`ALTER TABLE rooms ADD COLUMN is_locked INTEGER NOT NULL DEFAULT 0;`); } catch {}
  try { db.exec(`ALTER TABLE rooms ADD COLUMN passcode TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE rooms ADD COLUMN slow_mode_seconds INTEGER NOT NULL DEFAULT 0;`); } catch {}

  return db;
}

export function saveRoomToDb(room: RoomState, passcode: string | null = null): void {
  const database = getDatabase();
  const stmt = database.prepare(`
    INSERT INTO rooms (
      id, video_id, is_playing, current_time, updated_at, revision,
      host_participant_id, created_at, is_active, playback_mode, is_locked, passcode, slow_mode_seconds
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      video_id = excluded.video_id,
      is_playing = excluded.is_playing,
      current_time = excluded.current_time,
      updated_at = excluded.updated_at,
      revision = excluded.revision,
      host_participant_id = excluded.host_participant_id,
      is_active = 1,
      playback_mode = excluded.playback_mode,
      is_locked = excluded.is_locked,
      passcode = excluded.passcode,
      slow_mode_seconds = excluded.slow_mode_seconds
  `);
  stmt.run(
    room.roomId,
    room.videoId,
    room.isPlaying ? 1 : 0,
    room.currentTime,
    room.updatedAt,
    room.revision,
    room.hostParticipantId,
    Date.now(),
    room.settings?.playbackMode || 'HOST_MODERATED',
    room.settings?.isLocked ? 1 : 0,
    passcode,
    room.settings?.slowModeSeconds || 0
  );
}

export function updateRoomSettingsInDb(
  roomId: string,
  playbackMode: string,
  isLocked: boolean,
  passcode: string | null,
  slowModeSeconds: number
): void {
  const database = getDatabase();
  const stmt = database.prepare(`
    UPDATE rooms
    SET playback_mode = ?, is_locked = ?, passcode = ?, slow_mode_seconds = ?
    WHERE id = ?
  `);
  stmt.run(playbackMode, isLocked ? 1 : 0, passcode, slowModeSeconds, roomId);
}

export function updateRoomPlaybackInDb(
  roomId: string,
  videoId: string | null,
  isPlaying: boolean,
  currentTime: number,
  updatedAt: number,
  revision: number
): void {
  const database = getDatabase();
  const stmt = database.prepare(`
    UPDATE rooms
    SET video_id = ?, is_playing = ?, current_time = ?, updated_at = ?, revision = ?
    WHERE id = ?
  `);
  stmt.run(videoId, isPlaying ? 1 : 0, currentTime, updatedAt, revision, roomId);
}

export function markRoomClosedInDb(roomId: string): void {
  const database = getDatabase();
  const stmt = database.prepare(`
    UPDATE rooms
    SET is_active = 0, closed_at = ?
    WHERE id = ?
  `);
  stmt.run(Date.now(), roomId);
}

export function getRoomFromDb(roomId: string): { room: RoomState; passcode: string | null } | null {
  const database = getDatabase();
  const stmt = database.prepare(`
    SELECT id, video_id, is_playing, current_time, updated_at, revision, host_participant_id,
           is_active, playback_mode, is_locked, passcode, slow_mode_seconds
    FROM rooms
    WHERE id = ?
  `);
  const row = stmt.get(roomId) as {
    id: string;
    video_id: string | null;
    is_playing: number;
    current_time: number;
    updated_at: number;
    revision: number;
    host_participant_id: string;
    is_active: number;
    playback_mode?: string;
    is_locked?: number;
    passcode?: string | null;
    slow_mode_seconds?: number;
  } | undefined;

  if (!row) return null;

  const roomState: RoomState = {
    roomId: row.id,
    videoId: row.video_id,
    isPlaying: row.is_playing === 1,
    currentTime: row.current_time,
    updatedAt: row.updated_at,
    revision: row.revision,
    hostParticipantId: row.host_participant_id,
    settings: {
      playbackMode: (row.playback_mode as any) || 'HOST_MODERATED',
      isLocked: row.is_locked === 1,
      hasPasscode: !!row.passcode,
      slowModeSeconds: row.slow_mode_seconds || 0,
    },
  };

  return {
    room: roomState,
    passcode: row.passcode || null,
  };
}

export function closeDatabase(): void {
  if (db) {
    try {
      db.close();
    } catch {
      // Ignore if already closed
    }
    db = null;
  }
}
