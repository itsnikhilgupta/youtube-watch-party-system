import React, { useState } from 'react';
import { Crown, Shield, User, Copy, Check, LogOut, Tv, Radio, Settings, Sparkles, Lock, Key } from 'lucide-react';
import { Participant, Role, RoomSettings } from '../types/index.js';

interface NavbarProps {
  roomId?: string;
  currentUser?: Participant | null;
  isConnected: boolean;
  roomSettings?: RoomSettings;
  onOpenSettings?: () => void;
  onLeave?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  roomId,
  currentUser,
  isConnected,
  roomSettings,
  onOpenSettings,
  onLeave,
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState<boolean>(false);

  const copyInviteLink = () => {
    if (!roomId) return;
    const url = `${window.location.origin}/?room=${roomId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const getRoleBadge = (role?: Role) => {
    if (role === 'HOST') {
      return (
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/15 text-amber-300 border border-amber-500/30">
          <Crown size={11} className="stroke-[2.5]" />
          HOST
        </span>
      );
    }
    if (role === 'MODERATOR') {
      return (
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-500/15 text-blue-300 border border-blue-500/30">
          <Shield size={11} className="stroke-[2.5]" />
          MOD
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/[0.06] text-[#A1A1AA] border border-white/[0.08]">
        <User size={11} />
        VIEWER
      </span>
    );
  };

  const getUserInitials = (name?: string) => {
    if (!name) return 'U';
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-[#09090B]/90 backdrop-blur-xl border-b border-white/[0.07] px-4 py-2.5 transition-colors">
      <div className="max-w-[1700px] mx-auto flex items-center justify-between gap-4">
        {/* Brand & Live Room Status */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#FF2638] to-[#990000] flex items-center justify-center text-white shadow-md shadow-red-600/30 ring-1 ring-white/10 shrink-0">
            <Tv size={17} className="stroke-[2.5]" />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-extrabold text-sm sm:text-base tracking-tight text-white">WatchTogether</span>
            {roomId && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#FF2638]/10 border border-[#FF2638]/25 text-[10px] font-bold text-[#FF2638]">
                <Radio size={11} className="animate-pulse" />
                <span className="hidden sm:inline">LIVE PARTY</span>
              </div>
            )}

            {/* Room Mode Badges */}
            {roomSettings?.playbackMode === 'FREE_FOR_ALL' && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FF2638]/15 border border-[#FF2638]/30 text-[10px] font-bold text-red-300">
                <Sparkles size={11} />
                <span>Party Mode</span>
              </div>
            )}
            {roomSettings?.isLocked && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-950/60 border border-red-800/60 text-[10px] font-bold text-red-300">
                <Lock size={11} />
                <span>Locked</span>
              </div>
            )}
            {roomSettings?.hasPasscode && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[10px] font-bold text-amber-300">
                <Key size={11} />
                <span>Passcode</span>
              </div>
            )}
          </div>
        </div>

        {/* Room Code, User Avatar & Actions */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* Room Pill with Copy Action */}
          {roomId && (
            <div className="relative group">
              <button
                type="button"
                onClick={copyInviteLink}
                className="flex items-center gap-2 bg-[#14141B] hover:bg-[#1C1C24] border border-white/[0.08] hover:border-white/[0.18] rounded-full px-3 py-1 text-xs transition shadow-sm cursor-pointer"
                title="Click to copy invitation link"
              >
                <span className="text-[#71717A] text-[11px] hidden sm:inline">Room:</span>
                <span className="font-mono font-bold text-white tracking-wider text-[11px] sm:text-xs uppercase">
                  {roomId}
                </span>
                <div className="pl-1 border-l border-white/[0.08] flex items-center">
                  {copied ? (
                    <Check size={13} className="text-emerald-400" />
                  ) : (
                    <Copy size={13} className="text-[#A1A1AA] group-hover:text-white transition-colors" />
                  )}
                </div>
              </button>

              {/* Toast tooltip */}
              {copied && (
                <div className="absolute top-10 left-1/2 -translate-x-1/2 bg-emerald-950/90 border border-emerald-600/50 text-emerald-200 text-[11px] font-semibold px-2.5 py-1 rounded-md shadow-xl whitespace-nowrap animate-in fade-in zoom-in-95 z-50">
                  Link copied to clipboard!
                </div>
              )}
            </div>
          )}

          {/* Current User Pill */}
          {currentUser && (
            <div className="flex items-center gap-2 bg-[#14141B] border border-white/[0.08] rounded-full pl-1.5 pr-2.5 py-1">
              {/* User Avatar with Initials & Online Dot */}
              <div className="relative">
                <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-[#FF2638] to-[#8B5CF6] text-white flex items-center justify-center text-[10px] font-extrabold shadow-sm ring-1 ring-white/20">
                  {getUserInitials(currentUser.displayName)}
                </div>
                <span
                  className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-[#14141B] ${
                    isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'
                  }`}
                  title={isConnected ? 'Connected' : 'Disconnected'}
                />
              </div>

              <span className="text-xs font-semibold text-white max-w-[80px] sm:max-w-[120px] truncate">
                {currentUser.displayName}
              </span>

              {getRoleBadge(currentUser.role)}
            </div>
          )}

          {/* Host Room Settings Action */}
          {currentUser?.role === 'HOST' && onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-gradient-to-r from-amber-500/10 to-red-500/10 hover:from-amber-500/20 hover:to-red-500/20 text-amber-300 hover:text-white border border-amber-500/25 hover:border-amber-500/50 transition flex items-center gap-1.5 text-xs font-semibold cursor-pointer shadow-sm group"
              title="Open Room Mode Settings"
            >
              <Settings size={15} className="group-hover:rotate-45 transition-transform duration-300" />
              <span className="hidden md:inline">Settings</span>
            </button>
          )}

          {/* Leave Room Action */}
          {onLeave && (
            <div className="relative">
              {showLeaveConfirm ? (
                <div className="flex items-center gap-1.5 bg-red-950/80 border border-red-800/80 p-1 rounded-xl shadow-xl animate-in fade-in">
                  <span className="text-[11px] text-red-200 px-1 font-medium hidden sm:inline">Leave?</span>
                  <button
                    onClick={() => {
                      setShowLeaveConfirm(false);
                      onLeave();
                    }}
                    className="px-2 py-0.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[11px] font-bold shadow"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setShowLeaveConfirm(false)}
                    className="px-1.5 py-0.5 rounded-lg text-gray-400 hover:text-white text-[11px]"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowLeaveConfirm(true)}
                  className="p-2 rounded-xl bg-white/[0.04] hover:bg-red-500/10 text-[#A1A1AA] hover:text-[#FF2638] border border-white/[0.06] hover:border-[#FF2638]/30 transition flex items-center gap-1.5 text-xs font-medium cursor-pointer"
                  title="Leave watch party"
                >
                  <LogOut size={15} />
                  <span className="hidden md:inline text-[11px]">Leave</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
