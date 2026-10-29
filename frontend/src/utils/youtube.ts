/**
 * Extracts an 11-character YouTube video ID from various URL formats.
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
      const v = url.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) {
        return v;
      }
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
    const match = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([a-zA-Z0-9_-]{11})/);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Formats time in seconds to mm:ss or hh:mm:ss
 */
export function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const totalSeconds = Math.floor(seconds);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Formats a timestamp into a friendly relative or short time string
 */
export function formatMessageTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Standard YouTube quality labels mapped to user-friendly resolution strings.
 */
export const QUALITY_LABELS: Record<string, string> = {
  highres: '4K / Original',
  hd2160: '2160p (4K)',
  hd1440: '1440p (QHD)',
  hd1080: '1080p (HD)',
  hd720: '720p (HD)',
  large: '480p',
  medium: '360p',
  small: '240p',
  tiny: '144p',
  auto: 'Auto',
};

/**
 * Returns a friendly label for YouTube internal quality strings.
 */
export function formatQualityLabel(quality: string): string {
  if (!quality) return 'Auto';
  return QUALITY_LABELS[quality] || quality;
}

/**
 * Generates an official YouTube thumbnail image URL with fallback capability.
 */
export function getYouTubeThumbnailUrl(
  videoId: string,
  quality: 'maxres' | 'hq' | 'mq' | 'default' = 'hq'
): string {
  if (!videoId) return '';
  const filename =
    quality === 'maxres'
      ? 'maxresdefault.jpg'
      : quality === 'hq'
      ? 'hqdefault.jpg'
      : quality === 'mq'
      ? 'mqdefault.jpg'
      : 'default.jpg';
  return `https://img.youtube.com/vi/${videoId}/${filename}`;
}

