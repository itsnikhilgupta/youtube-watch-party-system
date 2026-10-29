import React, { useState } from 'react';
import {
  X,
  Settings,
  Shield,
  Sparkles,
  Lock,
  Unlock,
  Key,
  Clock,
  Check,
  AlertCircle,
  Eye,
  EyeOff
} from 'lucide-react';
import { PlaybackMode, RoomSettings } from '../types/index.js';

interface RoomSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSettings?: RoomSettings;
  onSave: (settings: {
    playbackMode: PlaybackMode;
    isLocked: boolean;
    passcode: string | null;
    slowModeSeconds: number;
  }) => Promise<void>;
}

const SLOW_MODE_OPTIONS = [
  { label: 'Off', seconds: 0 },
  { label: '3s', seconds: 3 },
  { label: '5s', seconds: 5 },
  { label: '10s', seconds: 10 },
  { label: '30s', seconds: 30 },
];

export const RoomSettingsModal: React.FC<RoomSettingsModalProps> = ({
  isOpen,
  onClose,
  currentSettings,
  onSave,
}) => {
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>(
    currentSettings?.playbackMode || 'HOST_MODERATED'
  );
  const [isLocked, setIsLocked] = useState<boolean>(
    currentSettings?.isLocked || false
  );
  const [hasPasscodeEnabled, setHasPasscodeEnabled] = useState<boolean>(
    currentSettings?.hasPasscode || false
  );
  const [passcode, setPasscode] = useState<string>('');
  const [showPasscodeText, setShowPasscodeText] = useState<boolean>(false);
  const [slowModeSeconds, setSlowModeSeconds] = useState<number>(
    currentSettings?.slowModeSeconds || 0
  );

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successSaved, setSuccessSaved] = useState<boolean>(false);

  // Sync state whenever opened
  React.useEffect(() => {
    if (isOpen && currentSettings) {
      setPlaybackMode(currentSettings.playbackMode);
      setIsLocked(currentSettings.isLocked);
      setHasPasscodeEnabled(currentSettings.hasPasscode);
      setSlowModeSeconds(currentSettings.slowModeSeconds);
      setPasscode('');
      setErrorMessage(null);
      setSuccessSaved(false);
    }
  }, [isOpen, currentSettings]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // If passcode enabled, validate length
    let finalPasscode: string | null = null;
    if (hasPasscodeEnabled) {
      if (passcode.trim()) {
        if (passcode.trim().length < 3) {
          setErrorMessage('Passcode must be at least 3 characters');
          return;
        }
        finalPasscode = passcode.trim();
      } else if (!currentSettings?.hasPasscode) {
        setErrorMessage('Please enter a passcode or disable the passcode lock');
        return;
      }
      // If passcode is blank but hasPasscode was already set and enabled, keep existing by not sending null
    } else {
      finalPasscode = null; // Remove passcode
    }

    try {
      setIsSubmitting(true);
      await onSave({
        playbackMode,
        isLocked,
        passcode: hasPasscodeEnabled ? (passcode.trim() ? passcode.trim() : undefined as any) : null,
        slowModeSeconds,
      });
      setSuccessSaved(true);
      setTimeout(() => {
        setIsSubmitting(false);
        onClose();
      }, 700);
    } catch (err: unknown) {
      setIsSubmitting(false);
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update settings');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-xl bg-[#121218]/95 border border-white/[0.1] rounded-3xl shadow-2xl overflow-hidden ring-1 ring-white/[0.05] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08] bg-[#161622]/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#FF2638] to-[#990000] flex items-center justify-center text-white shadow-md shadow-red-600/30">
              <Settings size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Room Mode Settings</h2>
              <p className="text-xs text-[#A1A1AA]">Host Controls & Playback Permissions</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/[0.05] hover:bg-white/[0.1] text-[#A1A1AA] hover:text-white flex items-center justify-center transition cursor-pointer"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body / Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0 text-[#FF2638]" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* 1. Playback Mode Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="font-bold text-xs uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                <Sparkles size={14} className="text-[#FF2638]" />
                Playback Mode
              </label>
              <span className="text-[11px] text-[#A1A1AA]">Who can control video</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Option A: Host Moderated */}
              <div
                onClick={() => setPlaybackMode('HOST_MODERATED')}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                  playbackMode === 'HOST_MODERATED'
                    ? 'bg-amber-500/10 border-amber-500/50 ring-1 ring-amber-500/30 text-white'
                    : 'bg-[#181824]/60 border-white/[0.07] hover:border-white/[0.15] text-[#A1A1AA]'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                        playbackMode === 'HOST_MODERATED'
                          ? 'bg-amber-500 text-black font-bold'
                          : 'bg-white/[0.06] text-white'
                      }`}
                    >
                      <Shield size={14} />
                    </div>
                    <span className="font-bold text-sm text-white">Host Moderated</span>
                  </div>
                  {playbackMode === 'HOST_MODERATED' && (
                    <span className="w-5 h-5 rounded-full bg-amber-500 text-black flex items-center justify-center text-xs font-bold">
                      <Check size={12} className="stroke-[3]" />
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#A1A1AA] leading-relaxed">
                  Default strict RBAC. Viewers must submit approval requests to play, pause, seek, or change video.
                </p>
              </div>

              {/* Option B: Free-For-All Party Mode */}
              <div
                onClick={() => setPlaybackMode('FREE_FOR_ALL')}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                  playbackMode === 'FREE_FOR_ALL'
                    ? 'bg-[#FF2638]/10 border-[#FF2638]/60 ring-1 ring-[#FF2638]/40 text-white'
                    : 'bg-[#181824]/60 border-white/[0.07] hover:border-white/[0.15] text-[#A1A1AA]'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                        playbackMode === 'FREE_FOR_ALL'
                          ? 'bg-[#FF2638] text-white font-bold'
                          : 'bg-white/[0.06] text-white'
                      }`}
                    >
                      <Sparkles size={14} />
                    </div>
                    <span className="font-bold text-sm text-white">Free-For-All</span>
                  </div>
                  {playbackMode === 'FREE_FOR_ALL' && (
                    <span className="w-5 h-5 rounded-full bg-[#FF2638] text-white flex items-center justify-center text-xs font-bold">
                      <Check size={12} className="stroke-[3]" />
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#A1A1AA] leading-relaxed">
                  Party mode! Anyone in the room can play, pause, seek, and switch videos freely without approval.
                </p>
              </div>
            </div>
          </div>

          {/* 2. Room Privacy & Access Controls */}
          <div className="space-y-3.5 pt-2 border-t border-white/[0.06]">
            <label className="font-bold text-xs uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
              <Lock size={14} className="text-[#FF2638]" />
              Room Privacy & Security
            </label>

            <div className="space-y-3">
              {/* Toggle: Lock Room */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#181824]/60 border border-white/[0.07]">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                      isLocked ? 'bg-red-500/20 text-[#FF2638]' : 'bg-white/[0.06] text-[#A1A1AA]'
                    }`}
                  >
                    {isLocked ? <Lock size={16} /> : <Unlock size={16} />}
                  </div>
                  <div>
                    <span className="font-semibold text-white text-xs block">Lock Room</span>
                    <span className="text-[11px] text-[#A1A1AA]">
                      Prevent new viewers from joining the session
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsLocked(!isLocked)}
                  className={`w-12 h-6 rounded-full transition-colors p-1 cursor-pointer flex items-center ${
                    isLocked ? 'bg-[#FF2638] justify-end' : 'bg-white/[0.12] justify-start'
                  }`}
                  aria-pressed={isLocked}
                >
                  <div className="w-4 h-4 rounded-full bg-white shadow-md" />
                </button>
              </div>

              {/* Passcode Protection */}
              <div className="p-3.5 rounded-2xl bg-[#181824]/60 border border-white/[0.07] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                        hasPasscodeEnabled ? 'bg-amber-500/20 text-amber-300' : 'bg-white/[0.06] text-[#A1A1AA]'
                      }`}
                    >
                      <Key size={16} />
                    </div>
                    <div>
                      <span className="font-semibold text-white text-xs block">Passcode Protection</span>
                      <span className="text-[11px] text-[#A1A1AA]">
                        Require an entry passcode for viewers to enter
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setHasPasscodeEnabled(!hasPasscodeEnabled);
                      if (hasPasscodeEnabled) setPasscode('');
                    }}
                    className={`w-12 h-6 rounded-full transition-colors p-1 cursor-pointer flex items-center ${
                      hasPasscodeEnabled ? 'bg-amber-500 justify-end' : 'bg-white/[0.12] justify-start'
                    }`}
                    aria-pressed={hasPasscodeEnabled}
                  >
                    <div className="w-4 h-4 rounded-full bg-white shadow-md" />
                  </button>
                </div>

                {hasPasscodeEnabled && (
                  <div className="pt-2 animate-in fade-in slide-in-from-top-1">
                    <div className="relative">
                      <input
                        type={showPasscodeText ? 'text' : 'password'}
                        placeholder={
                          currentSettings?.hasPasscode
                            ? 'Enter new passcode (leave blank to keep current)'
                            : 'Enter join passcode (e.g. party123)'
                        }
                        value={passcode}
                        onChange={(e) => setPasscode(e.target.value)}
                        className="w-full bg-[#0D0D12] border border-white/[0.1] rounded-xl px-3.5 py-2 text-xs text-white placeholder-[#71717A] focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasscodeText(!showPasscodeText)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#71717A] hover:text-white"
                      >
                        {showPasscodeText ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 3. Chat Slow Mode */}
          <div className="space-y-3 pt-2 border-t border-white/[0.06]">
            <div className="flex items-center justify-between">
              <label className="font-bold text-xs uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                <Clock size={14} className="text-[#FF2638]" />
                Chat Slow Mode
              </label>
              <span className="text-[11px] text-[#A1A1AA]">
                {slowModeSeconds === 0 ? 'Disabled' : `${slowModeSeconds} seconds cooldown`}
              </span>
            </div>

            <p className="text-xs text-[#A1A1AA]">
              Rate-limit viewer messages to prevent chat flooding or spam during busy parties.
            </p>

            <div className="flex items-center gap-2 flex-wrap">
              {SLOW_MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.seconds}
                  type="button"
                  onClick={() => setSlowModeSeconds(opt.seconds)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                    slowModeSeconds === opt.seconds
                      ? 'bg-gradient-to-r from-[#FF2638] to-[#E01427] text-white border-[#FF2638] shadow-md shadow-red-600/30'
                      : 'bg-[#181824]/60 text-[#A1A1AA] hover:text-white border-white/[0.08] hover:border-white/[0.15]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Modal Footer / Save */}
          <div className="pt-4 border-t border-white/[0.08] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-[#A1A1AA] hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#FF2638] to-[#E01427] hover:from-[#FF3D4E] hover:to-[#FF2638] shadow-lg shadow-red-600/30 transition active:scale-95 flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {successSaved ? (
                <>
                  <Check size={14} />
                  <span>Saved!</span>
                </>
              ) : isSubmitting ? (
                <span>Saving...</span>
              ) : (
                <span>Save Changes</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
