import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  Volume2,
  Volume1,
  VolumeX,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  Maximize,
  Minimize,
  Tv,
  Settings,
  Subtitles,
  Gauge,
  ChevronRight,
  ChevronLeft,
  Check,
  Info
} from 'lucide-react';
import { Role, RoomState, SyncStatus } from '../types/index.js';
import { formatTime, formatQualityLabel, QUALITY_LABELS } from '../utils/youtube.js';

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
    YT?: any;
  }
}

interface YouTubePlayerProps {
  room: RoomState;
  userRole: Role;
  isTheaterMode?: boolean;
  onToggleTheaterMode?: () => void;
  onPlay: (time: number) => void;
  onPause: (time: number) => void;
  onSeek: (time: number) => void;
  onRequestControl?: (action: 'PLAY' | 'PAUSE' | 'SEEK', time?: number) => void;
  onVideoTitleChange?: (title: string) => void;
}

type SettingsSubmenu = 'main' | 'speed' | 'quality' | 'captions';

interface CaptionTrack {
  languageCode: string;
  languageName?: string;
  name?: string;
  displayName?: string;
}

const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export const YouTubePlayer: React.FC<YouTubePlayerProps> = ({
  room,
  userRole,
  isTheaterMode = false,
  onToggleTheaterMode,
  onPlay,
  onPause,
  onSeek,
  onRequestControl,
  onVideoTitleChange,
}) => {
  const playerWrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const settingsMenuRef = useRef<HTMLDivElement>(null);

  const isApiReadyRef = useRef<boolean>(false);
  const isApplyingServerSync = useRef<boolean>(false);
  const lastKnownRevision = useRef<number>(-1);

  // Playback & player state
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('syncing');
  const [videoTitle, setVideoTitle] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [needsGesture, setNeedsGesture] = useState<boolean>(false);

  // Local preferences (strictly local to current user, never synced to shared room state)
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(100);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  // 1. User requested quality preference (persisted locally, never overwritten by YouTube player events)
  const [qualityPreference, setQualityPreference] = useState<string>(() => {
    try {
      return localStorage.getItem('wt_quality_preference') || 'auto';
    } catch {
      return 'auto';
    }
  });

  // 2. Actual video resolution currently reported by YouTube player
  const [actualQuality, setActualQuality] = useState<string>('auto');

  // 3. Available qualities detected from player or default fallback list
  const [availableQualities, setAvailableQualities] = useState<string[]>([
    'auto',
    'highres',
    'hd1440',
    'hd1080',
    'hd720',
    'large',
    'medium',
    'small',
    'tiny',
  ]);

  const [isCaptionsEnabled, setIsCaptionsEnabled] = useState<boolean>(false);
  const [availableCaptions, setAvailableCaptions] = useState<CaptionTrack[]>([]);
  const [selectedCaptionTrack, setSelectedCaptionTrack] = useState<string | null>(null);
  const [captionsSupportedNotice, setCaptionsSupportedNotice] = useState<string | null>(null);


  // UI state
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [settingsSubmenu, setSettingsSubmenu] = useState<SettingsSubmenu>('main');
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number>(0);
  const [isControlsVisible, setIsControlsVisible] = useState<boolean>(true);

  const isAuthorized = userRole === 'HOST' || userRole === 'MODERATOR' || room.settings?.playbackMode === 'FREE_FOR_ALL';

  // --------------------------------------------------------------------------
  // 1. Load YouTube IFrame Player API
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (window.YT && window.YT.Player) {
      isApiReadyRef.current = true;
      initPlayer();
      return;
    }

    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);

    window.onYouTubeIframeAPIReady = () => {
      isApiReadyRef.current = true;
      initPlayer();
    };

    return () => {
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  // --------------------------------------------------------------------------
  // 2. Discover available capabilities (Qualities, Captions, Rates)
  // --------------------------------------------------------------------------
  const refreshPlayerCapabilities = useCallback(() => {
    if (!playerRef.current) return;

    // A. Quality Levels
    try {
      if (typeof playerRef.current.getAvailableQualityLevels === 'function') {
        const levels = playerRef.current.getAvailableQualityLevels();
        if (Array.isArray(levels) && levels.length > 0) {
          const unique = Array.from(new Set(['auto', ...levels]));
          setAvailableQualities(unique);
        }
      }
      if (typeof playerRef.current.getPlaybackQuality === 'function') {
        const currentQ = playerRef.current.getPlaybackQuality();
        if (currentQ && currentQ !== 'unknown') {
          // Strictly update actual reported quality only - never touch user's qualityPreference!
          setActualQuality(currentQ);
        }
      }
    } catch {
      // ignore
    }

    // B. Playback Rates
    try {
      if (typeof playerRef.current.getPlaybackRate === 'function') {
        const rate = playerRef.current.getPlaybackRate();
        if (typeof rate === 'number' && rate > 0) {
          setPlaybackSpeed(rate);
        }
      }
    } catch {
      // ignore
    }

    // C. Captions Module
    try {
      if (typeof playerRef.current.loadModule === 'function') {
        playerRef.current.loadModule('captions');
      }
      if (typeof playerRef.current.getOption === 'function') {
        const tracks = playerRef.current.getOption('captions', 'tracklist');
        if (Array.isArray(tracks) && tracks.length > 0) {
          setAvailableCaptions(tracks);
          setCaptionsSupportedNotice(null);
        } else {
          setAvailableCaptions([]);
          setCaptionsSupportedNotice('No closed captions found for this video.');
        }

        const currentTrack = playerRef.current.getOption('captions', 'track');
        if (currentTrack && currentTrack.languageCode) {
          setIsCaptionsEnabled(true);
          setSelectedCaptionTrack(currentTrack.languageCode);
        } else {
          setIsCaptionsEnabled(false);
          setSelectedCaptionTrack(null);
        }
      }
    } catch {
      setCaptionsSupportedNotice('Caption module not accessible in this embedded context.');
    }
  }, []);

  // --------------------------------------------------------------------------
  // 3. Initialize Player instance
  // --------------------------------------------------------------------------
  const initPlayer = useCallback(() => {
    if (!containerRef.current || !isApiReadyRef.current || !room.videoId) return;

    if (playerRef.current) {
      try {
        playerRef.current.destroy();
      } catch {
        // ignore
      }
    }

    playerRef.current = new window.YT.Player(containerRef.current, {
      videoId: room.videoId,
      playerVars: {
        autoplay: room.isPlaying ? 1 : 0,
        controls: 0,
        disablekb: 1,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
        enablejsapi: 1,
        origin: window.location.origin,
        cc_load_policy: 1,
        fs: 0,
      },
      events: {
        onReady: (event: any) => {
          setSyncStatus('synced');
          setDuration(event.target.getDuration() || 0);

          try {
            const data = event.target.getVideoData();
            if (data?.title) {
              setVideoTitle(data.title);
              onVideoTitleChange?.(data.title);
            }
          } catch {
            // ignore
          }

          // Apply saved local quality preference if set and supported
          try {
            const savedPref = localStorage.getItem('wt_quality_preference') || 'auto';
            if (savedPref !== 'auto' && typeof event.target.setPlaybackQuality === 'function') {
              event.target.setPlaybackQuality(savedPref);
            }
          } catch {
            // ignore
          }

          refreshPlayerCapabilities();
          applyServerState(room, true);
        },
        onStateChange: (event: any) => {
          const state = event.data;
          if (state === 3) {
            setSyncStatus('buffering');
          } else if (state === 1) {
            setSyncStatus('synced');
            setNeedsGesture(false);
            refreshPlayerCapabilities();
          } else if (state === 2) {
            setSyncStatus('paused');
          }

          if (!isApplyingServerSync.current && isAuthorized) {
            const currentSeconds = event.target.getCurrentTime();
            if (state === 1 && !room.isPlaying) {
              onPlay(currentSeconds);
            } else if (state === 2 && room.isPlaying) {
              onPause(currentSeconds);
            }
          }
        },
        onPlaybackQualityChange: (event: any) => {
          if (event?.data && event.data !== 'unknown') {
            // Strictly update actual reported quality, never overwrite user preference!
            setActualQuality(event.data);
          }
        },
        onPlaybackRateChange: (event: any) => {
          if (typeof event?.data === 'number') {
            setPlaybackSpeed(event.data);
          }
        },
        onError: (event: any) => {
          let msg = 'Playback error occurred.';
          if (event.data === 100) msg = 'Video not found or has been removed.';
          else if (event.data === 101 || event.data === 150)
            msg = 'The owner of this video does not allow it to be embedded on other websites.';
          else if (event.data === 2) msg = 'Invalid YouTube video ID.';
          setErrorMessage(msg);
          setSyncStatus('error');
        },
      },
    });
  }, [room.videoId, isAuthorized, refreshPlayerCapabilities, onVideoTitleChange]);

  // --------------------------------------------------------------------------
  // 4. Authoritative Sync Algorithm with Drift Correction
  // --------------------------------------------------------------------------
  const applyServerState = useCallback(
    (serverState: RoomState, forceSeek: boolean = false) => {
      if (!playerRef.current || typeof playerRef.current.getPlayerState !== 'function') return;

      isApplyingServerSync.current = true;

      try {
        let expectedTime = serverState.currentTime;
        if (serverState.isPlaying) {
          const elapsed = Math.max(0, (Date.now() - serverState.updatedAt) / 1000);
          expectedTime += elapsed;
        }

        const localTime = playerRef.current.getCurrentTime() || 0;
        const drift = Math.abs(localTime - expectedTime);
        const DRIFT_THRESHOLD = 1.5;

        // Video ID change
        const currentLoadedVideoId = playerRef.current.getVideoData?.()?.video_id;
        if (serverState.videoId && currentLoadedVideoId && currentLoadedVideoId !== serverState.videoId) {
          playerRef.current.loadVideoById(serverState.videoId, expectedTime);
          setVideoTitle('');
          onVideoTitleChange?.('');
          setErrorMessage(null);
          setTimeout(() => {
            refreshPlayerCapabilities();
            try {
              const savedPref = localStorage.getItem('wt_quality_preference') || 'auto';
              if (savedPref !== 'auto' && playerRef.current && typeof playerRef.current.setPlaybackQuality === 'function') {
                playerRef.current.setPlaybackQuality(savedPref);
              }
            } catch {
              // ignore
            }
          }, 1000);
        } else if (forceSeek || drift > DRIFT_THRESHOLD) {
          setSyncStatus('drift_correcting');
          playerRef.current.seekTo(expectedTime, true);
        }

        // Play / Pause state
        const playerState = playerRef.current.getPlayerState();
        if (serverState.isPlaying && playerState !== 1) {
          const playPromise = playerRef.current.playVideo();
          if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => setNeedsGesture(true));
          }
        } else if (!serverState.isPlaying && playerState === 1) {
          playerRef.current.pauseVideo();
        }

        lastKnownRevision.current = serverState.revision;
      } catch (err) {
        console.error('Error applying server sync:', err);
      } finally {
        setTimeout(() => {
          isApplyingServerSync.current = false;
        }, 300);
      }
    },
    [refreshPlayerCapabilities, onVideoTitleChange]
  );


  // Trigger sync on room revisions
  useEffect(() => {
    if (room.revision !== lastKnownRevision.current) {
      applyServerState(room);
    }
  }, [room, applyServerState]);

  // --------------------------------------------------------------------------
  // 5. Time ticker & periodic drift check
  // --------------------------------------------------------------------------
  useEffect(() => {
    const timer = setInterval(() => {
      if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
        try {
          const cur = playerRef.current.getCurrentTime();
          const dur = playerRef.current.getDuration();
          if (typeof cur === 'number') setCurrentTime(cur);
          if (typeof dur === 'number' && dur > 0) setDuration(dur);

          if (room.isPlaying && !isApplyingServerSync.current) {
            const expectedTime = room.currentTime + Math.max(0, (Date.now() - room.updatedAt) / 1000);
            const drift = Math.abs(cur - expectedTime);
            if (drift > 2.0) {
              setSyncStatus('drift_correcting');
              playerRef.current.seekTo(expectedTime, true);
            } else if (syncStatus === 'drift_correcting') {
              setSyncStatus('synced');
            }
          }
        } catch {
          // Ignore polling errors
        }
      }
    }, 500);

    return () => clearInterval(timer);
  }, [room, syncStatus]);

  // --------------------------------------------------------------------------
  // 6. Fullscreen API Handling
  // --------------------------------------------------------------------------
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentFs = document.fullscreenElement === playerWrapperRef.current;
      setIsFullscreen(isCurrentFs);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    if (!playerWrapperRef.current) return;

    try {
      if (!document.fullscreenElement) {
        if (playerWrapperRef.current.requestFullscreen) {
          await playerWrapperRef.current.requestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
      }
    } catch (err) {
      console.warn('Fullscreen request failed:', err);
    }
  };

  // --------------------------------------------------------------------------
  // 7. Keyboard Shortcuts
  // --------------------------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      switch (e.code) {
        case 'Space':
        case 'KeyK':
          e.preventDefault();
          handleTogglePlayPause();
          break;
        case 'KeyF':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'KeyM':
          e.preventDefault();
          toggleMute();
          break;
        case 'KeyT':
          if (onToggleTheaterMode) {
            e.preventDefault();
            onToggleTheaterMode();
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          handleSeekRelative(-5);
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleSeekRelative(5);
          break;
        case 'ArrowUp':
          e.preventDefault();
          handleVolumeRelative(5);
          break;
        case 'ArrowDown':
          e.preventDefault();
          handleVolumeRelative(-5);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTime, duration, isMuted, volume, isAuthorized, room.isPlaying, needsGesture, onToggleTheaterMode]);

  // --------------------------------------------------------------------------
  // 8. Close Settings on Outside Click
  // --------------------------------------------------------------------------
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        settingsMenuRef.current &&
        !settingsMenuRef.current.contains(e.target as Node)
      ) {
        setIsSettingsOpen(false);
        setSettingsSubmenu('main');
      }
    };

    if (isSettingsOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isSettingsOpen]);

  // --------------------------------------------------------------------------
  // 9. Playback Actions
  // --------------------------------------------------------------------------
  const handleTogglePlayPause = () => {
    if (needsGesture) {
      playerRef.current?.playVideo();
      setNeedsGesture(false);
      return;
    }

    if (isAuthorized) {
      if (room.isPlaying) {
        onPause(currentTime);
      } else {
        onPlay(currentTime);
      }
    } else if (onRequestControl) {
      onRequestControl(room.isPlaying ? 'PAUSE' : 'PLAY', currentTime);
    }
  };

  const handleSeekRelative = (secondsDelta: number) => {
    const target = Math.max(0, Math.min(duration || 1000, currentTime + secondsDelta));
    setCurrentTime(target);

    if (isAuthorized) {
      onSeek(target);
    } else if (onRequestControl) {
      onRequestControl('SEEK', target);
    }
  };

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || (!duration && !room.currentTime)) return;

    const rect = progressBarRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = ratio * (duration || 100);

    setCurrentTime(targetTime);

    if (isAuthorized) {
      onSeek(targetTime);
    } else if (onRequestControl) {
      onRequestControl('SEEK', targetTime);
    }
  };

  const handleProgressMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || !duration) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverTime(ratio * duration);
    setHoverPosition(e.clientX - rect.left);
  };

  const handleProgressMouseLeave = () => {
    setHoverTime(null);
  };

  // --------------------------------------------------------------------------
  // 10. Volume & Mute (Local preference)
  // --------------------------------------------------------------------------
  const toggleMute = () => {
    if (!playerRef.current) return;
    if (isMuted) {
      playerRef.current.unMute();
      setIsMuted(false);
    } else {
      playerRef.current.mute();
      setIsMuted(true);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setVolume(val);
    if (playerRef.current) {
      playerRef.current.setVolume(val);
      if (val === 0) setIsMuted(true);
      else if (isMuted) setIsMuted(false);
    }
  };

  const handleVolumeRelative = (delta: number) => {
    const newVol = Math.max(0, Math.min(100, volume + delta));
    setVolume(newVol);
    if (playerRef.current) {
      playerRef.current.setVolume(newVol);
      if (newVol === 0) setIsMuted(true);
      else if (isMuted) setIsMuted(false);
    }
  };

  // --------------------------------------------------------------------------
  // 11. Playback Speed (Local preference)
  // --------------------------------------------------------------------------
  const handleChangeSpeed = (speed: number) => {
    setPlaybackSpeed(speed);
    if (playerRef.current && typeof playerRef.current.setPlaybackRate === 'function') {
      playerRef.current.setPlaybackRate(speed);
    }
    setSettingsSubmenu('main');
  };

  // --------------------------------------------------------------------------
  // 12. Quality Selection (Local preference)
  // --------------------------------------------------------------------------
  const handleChangeQuality = (quality: string) => {
    // 1. Save user requested preference locally
    setQualityPreference(quality);
    try {
      localStorage.setItem('wt_quality_preference', quality);
    } catch {
      // ignore
    }

    // 2. Dispatch request to YouTube player API
    if (playerRef.current && typeof playerRef.current.setPlaybackQuality === 'function') {
      try {
        playerRef.current.setPlaybackQuality(quality);
      } catch (err) {
        console.warn('Failed to call setPlaybackQuality:', err);
      }
    }

    // 3. Query reported quality after a short delay
    setTimeout(() => {
      if (playerRef.current && typeof playerRef.current.getPlaybackQuality === 'function') {
        try {
          const q = playerRef.current.getPlaybackQuality();
          if (q && q !== 'unknown') {
            setActualQuality(q);
          }
        } catch {
          // ignore
        }
      }
    }, 600);

    setSettingsSubmenu('main');
  };

  // --------------------------------------------------------------------------
  // 13. Closed Captions (CC) (Local preference)
  // --------------------------------------------------------------------------
  const handleToggleCaptions = () => {
    if (!playerRef.current) return;

    if (isCaptionsEnabled) {
      try {
        if (typeof playerRef.current.setOption === 'function') {
          playerRef.current.setOption('captions', 'track', {});
        }
        if (typeof playerRef.current.unloadModule === 'function') {
          playerRef.current.unloadModule('captions');
        }
      } catch {
        // ignore
      }
      setIsCaptionsEnabled(false);
      setSelectedCaptionTrack(null);
    } else {
      try {
        if (typeof playerRef.current.loadModule === 'function') {
          playerRef.current.loadModule('captions');
        }
        const defaultTrack = availableCaptions[0]?.languageCode || 'en';
        if (typeof playerRef.current.setOption === 'function') {
          playerRef.current.setOption('captions', 'track', { languageCode: defaultTrack });
        }
        setIsCaptionsEnabled(true);
        setSelectedCaptionTrack(defaultTrack);
      } catch {
        setCaptionsSupportedNotice('Captions could not be toggled for this video.');
      }
    }
  };

  const handleSelectCaptionLanguage = (langCode: string) => {
    if (!playerRef.current) return;
    try {
      if (typeof playerRef.current.loadModule === 'function') {
        playerRef.current.loadModule('captions');
      }
      if (typeof playerRef.current.setOption === 'function') {
        playerRef.current.setOption('captions', 'track', { languageCode: langCode });
      }
      setIsCaptionsEnabled(true);
      setSelectedCaptionTrack(langCode);
    } catch {
      // ignore
    }
    setSettingsSubmenu('main');
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={playerWrapperRef}
      className={`relative flex flex-col w-full bg-[#0D0D12] rounded-2xl overflow-hidden border border-white/[0.08] shadow-[0_20px_50px_-15px_rgba(0,0,0,0.8)] transition-all duration-300 ring-1 ring-white/[0.04] ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none border-0 h-screen w-screen bg-black' : ''
      }`}
      onMouseEnter={() => setIsControlsVisible(true)}
      onMouseLeave={() => {
        if (!isSettingsOpen) setIsControlsVisible(true);
      }}
    >
      {/* Autoplay user gesture banner */}
      {needsGesture && (
        <div className="bg-gradient-to-r from-[#FF2638] to-[#B91C1C] text-white px-4 py-2 flex items-center justify-between text-xs sm:text-sm animate-pulse z-30 shadow-md">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} />
            <span>Browser autoplay restricted. Click to resume real-time sync playback!</span>
          </div>
          <button
            onClick={handleTogglePlayPause}
            className="px-3 py-1 bg-white text-black font-extrabold rounded-md hover:bg-gray-200 transition text-xs shadow-md"
          >
            Join Live
          </button>
        </div>
      )}

      {/* Video Viewport Container */}
      <div
        className={`relative w-full bg-black flex items-center justify-center ${
          isFullscreen
            ? 'flex-1 h-full'
            : isTheaterMode
            ? 'h-[52vh] sm:h-[64vh] lg:h-[72vh]'
            : 'pb-[56.25%]'
        }`}
      >
        <div
          ref={containerRef}
          className={`${
            isFullscreen || isTheaterMode ? 'w-full h-full' : 'absolute inset-0 w-full h-full'
          }`}
        />

        {/* Video bottom gradient overlay for smooth contrast */}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/85 via-black/35 to-transparent pointer-events-none z-10" />

        {/* Video Unavailable / Error State */}
        {errorMessage && (
          <div className="absolute inset-0 bg-[#09090B]/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center text-white z-20">
            <AlertCircle className="w-12 h-12 text-[#FF2638] mb-3" />
            <h4 className="text-lg font-bold mb-1">Playback Unavailable</h4>
            <p className="text-xs sm:text-sm text-[#A1A1AA] max-w-md">{errorMessage}</p>
          </div>
        )}
      </div>

      {/* Control Bar Container (Translucent dark surface with backdrop blur) */}
      <div
        className={`relative px-4 py-3 bg-[#0F0F14]/90 backdrop-blur-md border-t border-white/[0.08] flex flex-col gap-2.5 transition-opacity z-20 ${
          isFullscreen && !isControlsVisible ? 'opacity-0' : 'opacity-100'
        }`}
      >
        {/* Floating Settings Menu Dropdown */}
        {isSettingsOpen && (
          <div
            ref={settingsMenuRef}
            className="absolute right-4 bottom-16 z-50 w-72 bg-[#14141B]/95 backdrop-blur-2xl border border-white/[0.12] rounded-2xl shadow-2xl p-3 text-xs text-white ring-1 ring-black/60 animate-in fade-in zoom-in-95 duration-150"
            role="menu"
            aria-label="Player Settings"
          >
            {/* Main Menu */}
            {settingsSubmenu === 'main' && (
              <div className="flex flex-col gap-1">
                <div className="pb-2 border-b border-white/[0.08] flex items-center justify-between text-[#71717A] font-semibold text-[11px] uppercase tracking-wider">
                  <span>Player Preferences</span>
                  <Settings size={13} />
                </div>

                {/* Speed Row */}
                <button
                  type="button"
                  onClick={() => setSettingsSubmenu('speed')}
                  className="flex items-center justify-between p-2 rounded-xl hover:bg-white/[0.06] transition text-left cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Gauge size={15} className="text-[#A1A1AA]" />
                    <span>Playback Speed</span>
                  </div>
                  <div className="flex items-center gap-1 text-[#A1A1AA]">
                    <span className="font-semibold text-white">
                      {playbackSpeed === 1 ? 'Normal' : `${playbackSpeed}x`}
                    </span>
                    <ChevronRight size={14} />
                  </div>
                </button>

                {/* Quality Row */}
                <button
                  type="button"
                  onClick={() => setSettingsSubmenu('quality')}
                  className="flex items-center justify-between p-2 rounded-xl hover:bg-white/[0.06] transition text-left cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Tv size={15} className="text-[#A1A1AA]" />
                    <span>Quality</span>
                  </div>
                  <div className="flex items-center gap-1 text-[#A1A1AA]">
                    <span className="font-semibold text-white">
                      {formatQualityLabel(qualityPreference)}
                    </span>
                    {actualQuality && actualQuality !== 'auto' && actualQuality !== qualityPreference && (
                      <span className="text-[10px] text-emerald-400 bg-emerald-950/50 px-1.5 py-0.5 rounded border border-emerald-800/50">
                        {formatQualityLabel(actualQuality)}
                      </span>
                    )}
                    <ChevronRight size={14} />
                  </div>
                </button>

                {/* Captions Row */}
                <button
                  type="button"
                  onClick={() => setSettingsSubmenu('captions')}
                  className="flex items-center justify-between p-2 rounded-xl hover:bg-white/[0.06] transition text-left cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Subtitles size={15} className="text-[#A1A1AA]" />
                    <span>Subtitles / CC</span>
                  </div>
                  <div className="flex items-center gap-1 text-[#A1A1AA]">
                    <span className="font-semibold text-white">
                      {isCaptionsEnabled
                        ? selectedCaptionTrack?.toUpperCase() || 'On'
                        : 'Off'}
                    </span>
                    <ChevronRight size={14} />
                  </div>
                </button>
              </div>
            )}

            {/* Submenu: Playback Speed */}
            {settingsSubmenu === 'speed' && (
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => setSettingsSubmenu('main')}
                  className="pb-2 border-b border-white/[0.08] flex items-center gap-1.5 text-[#A1A1AA] hover:text-white transition font-semibold text-[11px] cursor-pointer"
                >
                  <ChevronLeft size={14} />
                  <span>Back to Settings</span>
                </button>
                <div className="max-h-56 overflow-y-auto flex flex-col gap-0.5 pt-1">
                  {PLAYBACK_SPEEDS.map((speed) => (
                    <button
                      key={speed}
                      type="button"
                      onClick={() => handleChangeSpeed(speed)}
                      className={`flex items-center justify-between p-2 rounded-lg transition text-left cursor-pointer ${
                        playbackSpeed === speed
                          ? 'bg-[#FF2638]/15 text-[#FF2638] font-bold'
                          : 'hover:bg-white/[0.06] text-[#D4D4D8]'
                      }`}
                    >
                      <span>{speed === 1 ? '1x (Normal)' : `${speed}x`}</span>
                      {playbackSpeed === speed && <Check size={14} />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Submenu: Quality */}
            {settingsSubmenu === 'quality' && (
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => setSettingsSubmenu('main')}
                  className="pb-2 border-b border-white/[0.08] flex items-center gap-1.5 text-[#A1A1AA] hover:text-white transition font-semibold text-[11px] cursor-pointer"
                >
                  <ChevronLeft size={14} />
                  <span>Back to Settings</span>
                </button>

                {/* Currently Playing Status Badge */}
                <div className="px-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-between text-[11px] my-1">
                  <span className="text-[#A1A1AA]">Current Stream:</span>
                  <span className="font-bold text-white flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {formatQualityLabel(actualQuality)}
                  </span>
                </div>

                <div className="max-h-56 overflow-y-auto flex flex-col gap-0.5 pt-1">
                  {availableQualities.map((q) => {
                    const isSelected = qualityPreference === q;
                    const isCurrentlyActive = actualQuality === q;
                    return (
                      <button
                        key={q}
                        type="button"
                        onClick={() => handleChangeQuality(q)}
                        className={`flex items-center justify-between p-2 rounded-lg transition text-left cursor-pointer ${
                          isSelected
                            ? 'bg-[#FF2638]/15 text-[#FF2638] font-bold'
                            : 'hover:bg-white/[0.06] text-[#D4D4D8]'
                        }`}
                      >
                        <div className="flex flex-col">
                          <span className="text-xs">{formatQualityLabel(q)}</span>
                          {q !== 'auto' && (
                            <span className="text-[10px] text-[#71717A] font-normal">
                              {isCurrentlyActive ? 'Active stream' : 'Requested preference'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {isCurrentlyActive && q !== 'auto' && (
                            <span className="text-[9px] bg-white/[0.08] px-1.5 py-0.5 rounded text-white">
                              Active
                            </span>
                          )}
                          {isSelected && <Check size={14} />}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Honest YouTube Adaptive Bitrate Notice */}
                <div className="mt-2 pt-2 border-t border-white/[0.08] flex items-start gap-1.5 text-[10px] text-[#A1A1AA] leading-tight">
                  <Info size={12} className="shrink-0 mt-0.5 text-amber-400" />
                  <span>
                    {qualityPreference !== 'auto' && actualQuality !== qualityPreference
                      ? `Requested ${formatQualityLabel(qualityPreference)}. YouTube's embedded player uses adaptive bitrate and balances resolution with viewport size and bandwidth.`
                      : 'YouTube automatically manages streaming resolution based on network speed and viewport size.'}
                  </span>
                </div>
              </div>
            )}

            {/* Submenu: Captions */}
            {settingsSubmenu === 'captions' && (
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => setSettingsSubmenu('main')}
                  className="pb-2 border-b border-white/[0.08] flex items-center gap-1.5 text-[#A1A1AA] hover:text-white transition font-semibold text-[11px] cursor-pointer"
                >
                  <ChevronLeft size={14} />
                  <span>Back to Settings</span>
                </button>
                <div className="max-h-56 overflow-y-auto flex flex-col gap-0.5 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (isCaptionsEnabled) handleToggleCaptions();
                      setSettingsSubmenu('main');
                    }}
                    className={`flex items-center justify-between p-2 rounded-lg transition text-left cursor-pointer ${
                      !isCaptionsEnabled
                        ? 'bg-[#FF2638]/15 text-[#FF2638] font-bold'
                        : 'hover:bg-white/[0.06] text-[#D4D4D8]'
                    }`}
                  >
                    <span>Off</span>
                    {!isCaptionsEnabled && <Check size={14} />}
                  </button>

                  {availableCaptions.map((track) => (
                    <button
                      key={track.languageCode}
                      type="button"
                      onClick={() => handleSelectCaptionLanguage(track.languageCode)}
                      className={`flex items-center justify-between p-2 rounded-lg transition text-left cursor-pointer ${
                        isCaptionsEnabled && selectedCaptionTrack === track.languageCode
                          ? 'bg-[#FF2638]/15 text-[#FF2638] font-bold'
                          : 'hover:bg-white/[0.06] text-[#D4D4D8]'
                      }`}
                    >
                      <span>{track.displayName || track.languageName || track.name || track.languageCode}</span>
                      {isCaptionsEnabled && selectedCaptionTrack === track.languageCode && <Check size={14} />}
                    </button>
                  ))}
                </div>

                {captionsSupportedNotice && (
                  <div className="mt-2 pt-2 border-t border-white/[0.08] flex items-start gap-1.5 text-[10px] text-[#A1A1AA] leading-tight">
                    <Info size={12} className="shrink-0 mt-0.5 text-amber-400" />
                    <span>{captionsSupportedNotice}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Progress Bar Container with Hover Tooltip */}
        <div className="relative group/progress py-1">
          {/* Hover timestamp tooltip */}
          {hoverTime !== null && (
            <div
              className="absolute -top-8 transform -translate-x-1/2 bg-[#14141B]/95 border border-white/[0.12] text-white text-[11px] font-mono px-2 py-0.5 rounded shadow-xl backdrop-blur-md pointer-events-none z-30"
              style={{ left: `${hoverPosition}px` }}
            >
              {formatTime(hoverTime)}
            </div>
          )}

          <div
            ref={progressBarRef}
            onClick={handleProgressBarClick}
            onMouseMove={handleProgressMouseMove}
            onMouseLeave={handleProgressMouseLeave}
            className="relative w-full h-1.5 bg-white/[0.12] group-hover/progress:h-2 rounded-full cursor-pointer overflow-hidden transition-all"
            role="slider"
            aria-label="Video Progress Bar"
            aria-valuemin={0}
            aria-valuemax={duration || 100}
            aria-valuenow={currentTime}
            title={!isAuthorized ? 'Click to request seek' : 'Seek'}
          >
            {/* Current progress fill */}
            <div
              className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-[#FF2638] to-[#FF4555] shadow-[0_0_12px_rgba(255,38,56,0.5)] transition-all duration-100 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
            {/* Scrubber thumb */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-lg opacity-0 group-hover/progress:opacity-100 transition-opacity ring-2 ring-[#FF2638]"
              style={{ left: `calc(${progressPercent}% - 7px)` }}
            />
          </div>
        </div>

        {/* Controls Row */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-0.5">
          {/* Left Controls: Play/Pause, Volume, Time */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Play/Pause Button */}
            <button
              onClick={handleTogglePlayPause}
              aria-label={
                isAuthorized
                  ? room.isPlaying
                    ? 'Pause (k or space)'
                    : 'Play (k or space)'
                  : `Request ${room.isPlaying ? 'Pause' : 'Play'}`
              }
              className={`p-2 sm:p-2.5 rounded-xl flex items-center justify-center transition active:scale-95 cursor-pointer ${
                isAuthorized
                  ? 'bg-gradient-to-r from-[#FF2638] to-[#E01427] hover:from-[#FF3D4E] hover:to-[#FF2638] text-white shadow-lg shadow-red-600/30'
                  : 'bg-white/[0.06] hover:bg-white/[0.1] text-gray-300 border border-white/[0.08]'
              }`}
              title={
                isAuthorized
                  ? room.isPlaying
                    ? 'Pause (k / space)'
                    : 'Play (k / space)'
                  : `Request ${room.isPlaying ? 'Pause' : 'Play'}`
              }
            >
              {room.isPlaying ? <Pause size={17} /> : <Play size={17} fill="currentColor" />}
            </button>

            {/* Volume Control */}
            <div className="flex items-center gap-1.5 group/volume">
              <button
                onClick={toggleMute}
                aria-label={isMuted ? 'Unmute (m)' : 'Mute (m)'}
                className="text-[#A1A1AA] hover:text-white p-1.5 rounded-lg hover:bg-white/[0.06] transition cursor-pointer"
                title={isMuted ? 'Unmute (m)' : 'Mute (m)'}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX size={17} />
                ) : volume < 50 ? (
                  <Volume1 size={17} />
                ) : (
                  <Volume2 size={17} />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                aria-label="Volume Slider"
                className="w-14 sm:w-20 h-1 bg-white/[0.15] rounded-full appearance-none cursor-pointer accent-[#FF2638] group-hover/volume:h-1.5 transition-all"
                title={`Volume: ${isMuted ? 0 : volume}%`}
              />
            </div>

            {/* Timestamp Display */}
            <div className="flex items-center gap-1 text-xs font-mono text-gray-300 pl-1">
              <span className="text-white font-semibold">{formatTime(currentTime)}</span>
              <span className="text-[#71717A]">/</span>
              <span className="text-[#A1A1AA]">{formatTime(duration)}</span>
            </div>

            {/* Video Title in player bar */}
            {videoTitle && (
              <span className="hidden xl:inline-block text-xs font-medium text-[#A1A1AA] truncate max-w-xs pl-3 border-l border-white/[0.08]">
                {videoTitle}
              </span>
            )}
          </div>

          {/* Right Controls: Sync status, CC, Settings, Theater, Fullscreen */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Sync Status Badge */}
            {syncStatus === 'drift_correcting' && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-medium">
                <RefreshCw size={12} className="animate-spin" />
                <span>Syncing Drift</span>
              </div>
            )}
            {syncStatus === 'synced' && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium">
                <CheckCircle2 size={12} />
                <span>In Sync</span>
              </div>
            )}
            {syncStatus === 'paused' && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs font-medium">
                <span>Paused</span>
              </div>
            )}
            {syncStatus === 'buffering' && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-medium">
                <RefreshCw size={12} className="animate-spin" />
                <span>Buffering</span>
              </div>
            )}

            {/* Captions Toggle Button (CC) */}
            <button
              type="button"
              onClick={handleToggleCaptions}
              aria-label="Toggle Subtitles (c)"
              className={`p-1.5 rounded-lg border transition text-xs font-bold flex items-center justify-center cursor-pointer ${
                isCaptionsEnabled
                  ? 'bg-[#FF2638] border-[#FF2638] text-white shadow-md shadow-red-600/30'
                  : 'bg-white/[0.04] border-white/[0.08] text-[#A1A1AA] hover:text-white hover:bg-white/[0.08]'
              }`}
              title={isCaptionsEnabled ? 'Turn Off Subtitles' : 'Turn On Subtitles'}
            >
              <Subtitles size={16} />
            </button>

            {/* Settings Menu Button */}
            <button
              type="button"
              onClick={() => {
                setIsSettingsOpen(!isSettingsOpen);
                setSettingsSubmenu('main');
              }}
              aria-label="Playback Settings"
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                isSettingsOpen
                  ? 'bg-white/[0.12] border-white/[0.2] text-white shadow'
                  : 'bg-white/[0.04] border-white/[0.08] text-[#A1A1AA] hover:text-white hover:bg-white/[0.08]'
              }`}
              title="Settings (Speed, Quality, Captions)"
            >
              <Settings size={16} />
            </button>

            {/* Theater Mode Button */}
            {onToggleTheaterMode && (
              <button
                type="button"
                onClick={onToggleTheaterMode}
                aria-label={isTheaterMode ? 'Exit Theater Mode (t)' : 'Theater Mode (t)'}
                className={`p-1.5 rounded-lg border transition cursor-pointer ${
                  isTheaterMode
                    ? 'bg-[#FF2638] border-[#FF2638] text-white shadow-md shadow-red-600/30'
                    : 'bg-white/[0.04] border-white/[0.08] text-[#A1A1AA] hover:text-white hover:bg-white/[0.08]'
                }`}
                title={isTheaterMode ? 'Exit Theater Mode (t)' : 'Theater Mode (t)'}
              >
                <Tv size={16} />
              </button>
            )}

            {/* Fullscreen Button */}
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Exit Fullscreen (f)' : 'Fullscreen (f)'}
              className="p-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[#A1A1AA] hover:text-white hover:bg-white/[0.08] transition cursor-pointer"
              title={isFullscreen ? 'Exit Fullscreen (f)' : 'Fullscreen (f)'}
            >
              {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
