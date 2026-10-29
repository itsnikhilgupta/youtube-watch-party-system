import crypto from 'crypto';

/**
 * Generate a cryptographically secure, human-friendly room code.
 * Example format: 'w7k-m9p-2qx'
 */
export function generateRoomCode(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'; // Avoid visually confusing chars (0, O, 1, l, i)
  const bytes = crypto.randomBytes(9);
  let result = '';
  for (let i = 0; i < 9; i++) {
    result += chars[bytes[i] % chars.length];
    if (i === 2 || i === 5) {
      result += '-';
    }
  }
  return result;
}

/**
 * Generate a cryptographically secure UUID v4 string.
 */
export function generateUuid(): string {
  return crypto.randomUUID();
}

/**
 * Extracts a valid 11-character YouTube video ID from various supported URL formats.
 * Supported:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://www.youtube.com/shorts/VIDEO_ID
 * - Direct 11-char ID
 */
export function extractYouTubeVideoId(input: string): string | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();

  // If already an 11-char valid ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, '');

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      // /watch?v=ID
      const v = url.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) {
        return v;
      }
      // /embed/ID or /shorts/ID or /v/ID
      const parts = url.pathname.split('/').filter(Boolean);
      if ((parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'v') && parts[1]) {
        const id = parts[1].split('?')[0].split('&')[0];
        if (/^[a-zA-Z0-9_-]{11}$/.test(id)) {
          return id;
        }
      }
    } else if (host === 'youtu.be') {
      const id = url.pathname.slice(1).split('?')[0].split('&')[0];
      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) {
        return id;
      }
    }
  } catch {
    // Fallback regex for non-standard or partial URLs
    const match = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([a-zA-Z0-9_-]{11})/);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}
