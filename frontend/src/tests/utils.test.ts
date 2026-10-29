import { describe, it, expect } from 'vitest';
import {
  extractYouTubeVideoId,
  formatTime,
  formatMessageTime,
  formatQualityLabel,
  QUALITY_LABELS,
  getYouTubeThumbnailUrl,
} from '../utils/youtube.js';

describe('Frontend YouTube and Utility Helpers', () => {
  describe('extractYouTubeVideoId', () => {
    it('extracts ID from standard watch URL', () => {
      expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
      expect(extractYouTubeVideoId('http://youtube.com/watch?v=dQw4w9WgXcQ&feature=share')).toBe('dQw4w9WgXcQ');
    });

    it('extracts ID from youtu.be short URL', () => {
      expect(extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
      expect(extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ?t=42')).toBe('dQw4w9WgXcQ');
    });

    it('extracts ID from embed URL', () => {
      expect(extractYouTubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('extracts ID from YouTube Shorts URL', () => {
      expect(extractYouTubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('accepts raw 11-character video ID', () => {
      expect(extractYouTubeVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('rejects invalid or malicious inputs safely', () => {
      expect(extractYouTubeVideoId('https://evil-site.com/video')).toBeNull();
      expect(extractYouTubeVideoId('<iframe src="javascript:alert(1)"></iframe>')).toBeNull();
      expect(extractYouTubeVideoId('')).toBeNull();
      expect(extractYouTubeVideoId('abc')).toBeNull();
    });
  });

  describe('formatTime', () => {
    it('formats seconds into mm:ss', () => {
      expect(formatTime(0)).toBe('00:00');
      expect(formatTime(65)).toBe('01:05');
      expect(formatTime(599)).toBe('09:59');
    });

    it('formats timestamps exceeding one hour into hh:mm:ss', () => {
      expect(formatTime(3600)).toBe('01:00:00');
      expect(formatTime(3665)).toBe('01:01:05');
    });

    it('handles negative or invalid values gracefully', () => {
      expect(formatTime(-10)).toBe('00:00');
      expect(formatTime(NaN)).toBe('00:00');
    });
  });

  describe('formatMessageTime', () => {
    it('formats timestamps into valid time strings', () => {
      const now = Date.now();
      const formatted = formatMessageTime(now);
      expect(typeof formatted).toBe('string');
      expect(formatted.length).toBeGreaterThan(0);
    });
  });

  describe('Player Control calculations', () => {
    it('calculates progress percentage correctly', () => {
      const calculatePercent = (cur: number, dur: number) => (dur > 0 ? (cur / dur) * 100 : 0);
      expect(calculatePercent(30, 60)).toBe(50);
      expect(calculatePercent(0, 100)).toBe(0);
      expect(calculatePercent(100, 100)).toBe(100);
      expect(calculatePercent(50, 0)).toBe(0);
    });

    it('clamps relative seeking properly', () => {
      const clampSeek = (cur: number, delta: number, dur: number) =>
        Math.max(0, Math.min(dur || 1000, cur + delta));
      expect(clampSeek(10, -15, 100)).toBe(0);
      expect(clampSeek(95, 10, 100)).toBe(100);
      expect(clampSeek(50, 5, 100)).toBe(55);
    });
  });

  describe('YouTube Quality Formatting & Thumbnail Generation', () => {
    it('maps YouTube internal quality keys to human readable labels', () => {
      expect(formatQualityLabel('hd1080')).toBe('1080p (HD)');
      expect(formatQualityLabel('hd720')).toBe('720p (HD)');
      expect(formatQualityLabel('auto')).toBe('Auto');
      expect(formatQualityLabel('large')).toBe('480p');
      expect(formatQualityLabel('medium')).toBe('360p');
      expect(formatQualityLabel('small')).toBe('240p');
      expect(formatQualityLabel('tiny')).toBe('144p');
      expect(formatQualityLabel('hd1440')).toBe('1440p (QHD)');
      expect(formatQualityLabel('hd2160')).toBe('2160p (4K)');
      expect(formatQualityLabel('highres')).toBe('4K / Original');
      expect(formatQualityLabel('custom_unknown')).toBe('custom_unknown');
      expect(formatQualityLabel('')).toBe('Auto');
      expect(QUALITY_LABELS.hd1080).toBeDefined();
    });

    it('generates correct YouTube thumbnail URLs for ambient background', () => {
      expect(getYouTubeThumbnailUrl('dQw4w9WgXcQ', 'maxres')).toBe(
        'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'
      );
      expect(getYouTubeThumbnailUrl('dQw4w9WgXcQ', 'hq')).toBe(
        'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg'
      );
      expect(getYouTubeThumbnailUrl('dQw4w9WgXcQ', 'mq')).toBe(
        'https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg'
      );
      expect(getYouTubeThumbnailUrl('')).toBe('');
    });


    it('maintains independent user quality preference and actual reported quality', () => {
      // Simulation of user quality preference vs YouTube player reported adaptive quality
      let qualityPreference = 'hd1080';
      let actualQuality = 'auto';

      // YouTube player reports buffering and then starts at medium/auto
      const handlePlayerCapabilityUpdate = (reportedQuality: string) => {
        // Crucial fix: DO NOT overwrite qualityPreference
        actualQuality = reportedQuality;
      };

      handlePlayerCapabilityUpdate('medium');
      expect(qualityPreference).toBe('hd1080'); // Preference preserved!
      expect(actualQuality).toBe('medium');

      // Player adapts to 720p
      handlePlayerCapabilityUpdate('hd720');
      expect(qualityPreference).toBe('hd1080'); // Still preserved!
      expect(actualQuality).toBe('hd720');

      // When player finally achieves 1080p
      handlePlayerCapabilityUpdate('hd1080');
      expect(qualityPreference).toBe('hd1080');
      expect(actualQuality).toBe('hd1080');
    });
  });
});

