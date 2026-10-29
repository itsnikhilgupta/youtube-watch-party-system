import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Tv,
  Users,
  Shield,
  Zap,
  Sparkles,
  ArrowRight,
  Video,
  Play,
  MessageSquare,
  Lock,
  Radio,
  CheckCircle2
} from 'lucide-react';
import { useWatchParty } from '../context/WatchPartyContext.js';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { createRoom, joinRoom, isConnecting, lastError, clearError } = useWatchParty();

  const [displayName, setDisplayName] = useState<string>('');
  const [roomCode, setRoomCode] = useState<string>('');
  const [passcode, setPasscode] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'create' | 'join'>('create');
  const [formError, setFormError] = useState<string | null>(null);

  // If a room parameter was passed in URL (e.g. invite link /?room=w7k-m9p-2qx)
  useEffect(() => {
    const queryRoom = searchParams.get('room');
    if (queryRoom) {
      setRoomCode(queryRoom.trim());
      setActiveTab('join');
    }
  }, [searchParams]);

  const validateDisplayName = (): boolean => {
    const trimmed = displayName.trim();
    if (!trimmed) {
      setFormError('Please enter a display name to continue');
      return false;
    }
    if (trimmed.length < 2) {
      setFormError('Display name must be at least 2 characters');
      return false;
    }
    if (trimmed.length > 25) {
      setFormError('Display name cannot exceed 25 characters');
      return false;
    }
    setFormError(null);
    return true;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (!validateDisplayName()) return;

    try {
      const roomId = await createRoom(displayName.trim());
      navigate(`/room/${roomId}`);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to create room');
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (!validateDisplayName()) return;

    const trimmedRoom = roomCode.trim();
    if (!trimmedRoom) {
      setFormError('Please enter a room code');
      return;
    }

    try {
      await joinRoom(trimmedRoom, displayName.trim(), passcode.trim() || undefined);
      navigate(`/room/${trimmedRoom}`);
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : 'Failed to join room';
      if (rawMsg.includes('ROOM_LOCKED')) {
        setFormError('This room is currently locked by the Host and cannot be joined.');
      } else if (rawMsg.includes('ROOM_PASSCODE_REQUIRED')) {
        setFormError('This room requires a passcode. Please enter the passcode below.');
      } else if (rawMsg.includes('INVALID_PASSCODE')) {
        setFormError('Incorrect passcode. Please check with the host and try again.');
      } else {
        setFormError(rawMsg);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#09090B] text-[#F4F4F6] flex flex-col justify-between relative overflow-hidden">
      {/* Ambient background lighting */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[550px] ambient-hero-glow pointer-events-none z-0" />
      <div className="absolute inset-0 grid-backdrop pointer-events-none z-0 opacity-40" />

      {/* Top Header */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#09090B]/85 backdrop-blur-xl px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Brand Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF2638] to-[#B91C1C] flex items-center justify-center text-white shadow-lg shadow-red-600/30 ring-1 ring-white/20">
              <Tv size={20} className="stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-tight text-white">WatchTogether</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FF2638]/15 text-[#FF2638] border border-[#FF2638]/30">
                  LIVE
                </span>
              </div>
              <p className="text-[10px] text-[#A1A1AA] hidden sm:block">Cinematic Synchronized Streaming</p>
            </div>
          </div>

          {/* Status pill */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#181820] border border-white/[0.08] text-xs text-[#A1A1AA]">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400/50" />
              <span>Real-Time Engine Active</span>
            </div>

            <button
              onClick={() => {
                setActiveTab(activeTab === 'create' ? 'join' : 'create');
                document.getElementById('action-card')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="text-xs font-semibold px-3.5 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-white border border-white/[0.08] transition"
            >
              {activeTab === 'create' ? 'Join Existing Room' : 'Create Party'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Hero & Launch Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-12 lg:py-20 flex-1 flex flex-col justify-center relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          {/* Left Column: Headline & Value Proposition */}
          <div className="lg:col-span-7 text-center lg:text-left space-y-6">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#181820]/90 border border-white/[0.08] text-xs font-semibold text-[#A1A1AA] shadow-sm">
              <Sparkles size={14} className="text-[#FF2638]" />
              <span className="text-white font-medium">Sub-Second YouTube Sync</span>
              <span className="text-white/30">•</span>
              <span>Zero Account Needed</span>
            </div>

            <h1 className="text-4xl sm:text-6xl xl:text-7xl font-extrabold tracking-tight leading-[1.08] text-white">
              Your people. <br className="hidden sm:inline" />
              Your screen. <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FF2638] via-[#FF5263] to-[#A855F7]">
                One moment.
              </span>
            </h1>

            <p className="text-base sm:text-lg text-[#A1A1AA] max-w-xl mx-auto lg:mx-0 leading-relaxed font-normal">
              Transform online video into a shared cinematic experience. Watch YouTube in perfect
              real-time synchronization with server-authoritative control, participant governance, and live room chat.
            </p>

            {/* Quick Feature Badges */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-4 max-w-lg mx-auto lg:mx-0">
              <div className="p-3.5 rounded-xl bg-[#14141B] border border-white/[0.06] flex items-center gap-3 text-left">
                <div className="w-9 h-9 rounded-lg bg-[#FF2638]/10 text-[#FF2638] flex items-center justify-center shrink-0">
                  <Zap size={18} />
                </div>
                <div>
                  <p className="text-xs font-bold text-white">Sub-Second Sync</p>
                  <p className="text-[11px] text-[#71717A]">Auto drift correction</p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#14141B] border border-white/[0.06] flex items-center gap-3 text-left">
                <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
                  <Shield size={18} />
                </div>
                <div>
                  <p className="text-xs font-bold text-white">Role Governance</p>
                  <p className="text-[11px] text-[#71717A]">Host, Mod & Viewer</p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#14141B] border border-white/[0.06] flex items-center gap-3 text-left">
                <div className="w-9 h-9 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0">
                  <Lock size={18} />
                </div>
                <div>
                  <p className="text-xs font-bold text-white">Private Rooms</p>
                  <p className="text-[11px] text-[#71717A]">Crypto-secure codes</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Launch Action Card */}
          <div id="action-card" className="lg:col-span-5 w-full max-w-md mx-auto">
            <div className="glass-panel rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden ring-1 ring-white/[0.08]">
              {/* Subtle top red glow line */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#FF2638] to-transparent opacity-80" />

              {/* Toggle Pills */}
              <div className="flex bg-[#0D0D12] p-1.5 rounded-xl mb-6 border border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('create');
                    setFormError(null);
                  }}
                  className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 ${
                    activeTab === 'create'
                      ? 'bg-[#FF2638] text-white shadow-md shadow-red-900/40'
                      : 'text-[#A1A1AA] hover:text-white'
                  }`}
                >
                  <Video size={14} />
                  <span>Start Party (Host)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('join');
                    setFormError(null);
                  }}
                  className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 ${
                    activeTab === 'join'
                      ? 'bg-[#FF2638] text-white shadow-md shadow-red-900/40'
                      : 'text-[#A1A1AA] hover:text-white'
                  }`}
                >
                  <Users size={14} />
                  <span>Join Room</span>
                </button>
              </div>

              {/* Action Form */}
              <form onSubmit={activeTab === 'create' ? handleCreate : handleJoin} className="space-y-4">
                {/* Display Name */}
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5">
                    Your Display Name
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      maxLength={25}
                      placeholder="e.g. Alex"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full bg-[#101015] border border-white/[0.08] focus:border-[#FF2638] rounded-xl px-4 py-3 text-sm text-white placeholder-[#71717A] focus:outline-none transition shadow-inner"
                    />
                  </div>
                </div>

                {/* Room Code & Passcode (if Join tab) */}
                {activeTab === 'join' && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-gray-300 mb-1.5">
                        Room Code or Invitation Link
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          required
                          placeholder="e.g. w7k-m9p-2qx"
                          value={roomCode}
                          onChange={(e) => setRoomCode(e.target.value)}
                          className="w-full bg-[#101015] border border-white/[0.08] focus:border-[#FF2638] rounded-xl px-4 py-3 text-sm text-white font-mono placeholder-[#71717A] focus:outline-none transition uppercase shadow-inner"
                        />
                      </div>
                    </div>

                    {/* Room Passcode (Optional unless protected) */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-bold text-gray-300">
                          Room Passcode
                        </label>
                        <span className="text-[10px] text-[#71717A]">Only if room has passcode</span>
                      </div>
                      <div className="relative">
                        <input
                          type="password"
                          placeholder="Enter passcode (if required)"
                          value={passcode}
                          onChange={(e) => setPasscode(e.target.value)}
                          className="w-full bg-[#101015] border border-white/[0.08] focus:border-[#FF2638] rounded-xl px-4 py-3 text-sm text-white placeholder-[#71717A] focus:outline-none transition shadow-inner"
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Validation Errors */}
                {(formError || lastError) && (
                  <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/60 text-red-300 text-xs flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                    <span>{formError || lastError?.message}</span>
                  </div>
                )}

                {/* Submit Action */}
                <button
                  type="submit"
                  disabled={isConnecting}
                  className="w-full py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-[#FF2638] to-[#E01427] hover:from-[#FF3D4E] hover:to-[#FF2638] text-white shadow-xl shadow-red-600/30 flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                >
                  <span>
                    {isConnecting
                      ? 'Connecting...'
                      : activeTab === 'create'
                      ? 'Create Watch Party'
                      : 'Join Watch Party'}
                  </span>
                  <ArrowRight size={16} />
                </button>
              </form>

              {/* Footer Note */}
              <p className="text-[11px] text-[#71717A] text-center mt-5 leading-normal">
                {activeTab === 'create'
                  ? 'Creates an instant room with server-assigned Host privileges. Share the link with friends to watch together.'
                  : 'Enter the room code shared with you to join live playback as an attendee.'}
              </p>
            </div>
          </div>
        </div>

        {/* Live Watch Room Mock Preview Banner */}
        <div className="mt-16 lg:mt-24 pt-12 border-t border-white/[0.06]">
          <div className="text-center max-w-xl mx-auto mb-8">
            <h2 className="text-xs uppercase tracking-widest font-extrabold text-[#FF2638] mb-1">
              Cinematic Experience
            </h2>
            <p className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Engineered for seamless shared viewing
            </p>
          </div>

          <div className="relative max-w-5xl mx-auto rounded-2xl overflow-hidden glass-panel glow-ambient border border-white/[0.08] shadow-2xl">
            {/* Top Mock Window Header */}
            <div className="bg-[#121218] px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F56]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#27C93F]" />
                <span className="ml-2 text-xs font-mono text-[#A1A1AA]">watchtogether.app/room/w7k-m9p-2qx</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#FF2638]/20 text-[#FF2638] border border-[#FF2638]/30">
                  LIVE SYNC
                </span>
                <span className="text-xs text-[#71717A]">4 viewers</span>
              </div>
            </div>

            {/* Inner Mock View */}
            <div className="p-4 sm:p-6 bg-[#0B0B10] grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
              {/* Mock Player */}
              <div className="md:col-span-8 rounded-xl bg-[#000] border border-white/[0.08] relative aspect-video flex flex-col justify-between p-4 overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-tr from-[#FF2638]/15 via-transparent to-purple-900/10 pointer-events-none" />
                <div className="flex items-center justify-between z-10">
                  <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-[11px] text-white font-medium border border-white/10">
                    <Radio size={12} className="text-[#FF2638] animate-pulse" />
                    <span>Synchronized 1080p</span>
                  </div>
                  <span className="text-xs font-mono text-white/80 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded border border-white/10">
                    04:20 / 12:45
                  </span>
                </div>

                <div className="self-center z-10 w-12 h-12 rounded-full bg-[#FF2638] text-white flex items-center justify-center shadow-lg shadow-red-600/50">
                  <Play size={20} fill="currentColor" className="ml-0.5" />
                </div>

                {/* Mock Player Control Bar */}
                <div className="z-10 bg-black/70 backdrop-blur-md p-2 rounded-lg border border-white/10 flex flex-col gap-1.5">
                  <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                    <div className="w-1/3 h-full bg-[#FF2638]" />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-white/80">
                    <span>Synthwave 4K Live Stream</span>
                    <span className="text-[#A1A1AA]">Host Controls Active</span>
                  </div>
                </div>
              </div>

              {/* Mock Sidebar */}
              <div className="md:col-span-4 flex flex-col gap-3">
                <div className="p-3 rounded-xl bg-[#14141B] border border-white/[0.06]">
                  <div className="flex items-center justify-between text-xs font-bold text-white mb-2">
                    <div className="flex items-center gap-1.5">
                      <Users size={13} className="text-[#FF2638]" />
                      <span>In Room (4)</span>
                    </div>
                    <span className="text-[10px] text-emerald-400 font-normal">All in sync</span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between p-1.5 rounded-lg bg-[#181822] text-xs">
                      <span className="font-semibold text-white">Alex</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-400 font-bold">HOST</span>
                    </div>
                    <div className="flex items-center justify-between p-1.5 rounded-lg bg-[#181822] text-xs">
                      <span className="font-semibold text-white">Elena</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-400 font-bold">MOD</span>
                    </div>
                    <div className="flex items-center justify-between p-1.5 rounded-lg bg-[#181822] text-xs">
                      <span className="font-semibold text-gray-300">Marcus</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-700/30 text-gray-400">VIEWER</span>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#14141B] border border-white/[0.06] flex items-center gap-2.5 text-xs text-gray-300">
                  <MessageSquare size={14} className="text-[#FF2638] shrink-0" />
                  <p className="truncate">
                    <strong className="text-white">Elena:</strong> This scene is stunning! 🍿
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Sleek Minimalist Footer */}
      <footer className="border-t border-white/[0.06] py-6 px-6 text-center text-xs text-[#71717A] bg-[#09090B]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>WatchTogether • Synchronized Group Streaming Experience</p>
          <div className="flex items-center gap-4 text-[#A1A1AA]">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 size={13} className="text-emerald-400" /> WebSockets Live
            </span>
            <span>•</span>
            <span>Server Authoritative</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
