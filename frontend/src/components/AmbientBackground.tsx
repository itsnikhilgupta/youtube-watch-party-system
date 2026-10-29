import React, { useState, useEffect } from 'react';
import { getYouTubeThumbnailUrl } from '../utils/youtube.js';

interface AmbientBackgroundProps {
  videoId: string;
}

/**
 * Cinematic ambient background light effect inspired by YouTube's ambient viewing mode.
 * Dynamically derives lighting glow from the active YouTube video's thumbnail,
 * blurred softly behind the video player and UI, never overlaying content or capturing pointer events.
 */
export const AmbientBackground: React.FC<AmbientBackgroundProps> = ({ videoId }) => {
  const [imgUrl, setImgUrl] = useState<string>(() =>
    videoId ? getYouTubeThumbnailUrl(videoId, 'hq') : ''
  );

  useEffect(() => {
    if (!videoId) return;

    // Test maxres resolution image, fallback smoothly to hq
    const maxresUrl = getYouTubeThumbnailUrl(videoId, 'maxres');
    const hqUrl = getYouTubeThumbnailUrl(videoId, 'hq');

    const img = new Image();
    img.src = maxresUrl;
    img.onload = () => {
      // YouTube responds with a 120x90 placeholder if maxres is missing
      if (img.naturalWidth > 120) {
        setImgUrl(maxresUrl);
      } else {
        setImgUrl(hqUrl);
      }
    };
    img.onerror = () => {
      setImgUrl(hqUrl);
    };
  }, [videoId]);

  if (!videoId) return null;

  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none select-none z-0"
      aria-hidden="true"
    >
      {/* Blurred image ambient lighting layer */}
      {imgUrl ? (
        <div
          className="ambient-lighting-layer"
          style={{
            backgroundImage: `url(${imgUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
      ) : (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1100px] h-[450px] ambient-glow-red opacity-30" />
      )}

      {/* Subtle dark vignette radial overlay so ambient light fades naturally into background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 85% 65% at 50% 25%, transparent 20%, #09090B 80%)',
        }}
      />
    </div>
  );
};
