import React, { useState } from 'react';
import { Crown, Shield, User, UserMinus, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Participant } from '../types/index.js';

interface ParticipantsListProps {
  participants: Participant[];
  currentUser: Participant | null;
  onAssignRole: (targetId: string, role: 'MODERATOR' | 'PARTICIPANT') => void;
  onRemoveParticipant: (targetId: string) => void;
}

export const ParticipantsList: React.FC<ParticipantsListProps> = ({
  participants,
  currentUser,
  onAssignRole,
  onRemoveParticipant,
}) => {
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  const isHost = currentUser?.role === 'HOST';

  const getInitials = (name: string) => {
    return name.slice(0, 2).toUpperCase();
  };

  const getAvatarGradient = (role: string, name: string) => {
    if (role === 'HOST') return 'from-amber-500 to-orange-600 ring-amber-500/30';
    if (role === 'MODERATOR') return 'from-blue-600 to-indigo-600 ring-blue-500/30';

    // Seed color by name char code
    const charCode = name.charCodeAt(0) || 0;
    if (charCode % 3 === 0) return 'from-[#FF2638] to-rose-700 ring-red-500/20';
    if (charCode % 3 === 1) return 'from-purple-600 to-violet-800 ring-purple-500/20';
    return 'from-emerald-600 to-teal-800 ring-emerald-500/20';
  };

  return (
    <div className="flex flex-col h-full bg-[#111116] rounded-2xl border border-white/[0.08] overflow-hidden shadow-xl ring-1 ring-white/[0.03]">
      {/* Header */}
      <div className="p-3.5 px-4 border-b border-white/[0.06] flex items-center justify-between bg-[#14141B]">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-xs uppercase tracking-wider text-white">Participants</h3>
          <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-white/[0.08] text-[#D4D4D8]">
            {participants.length}
          </span>
        </div>
        <span className="text-[11px] text-[#71717A] flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          {isHost ? 'Host Controls Active' : 'Real-time sync'}
        </span>
      </div>

      {/* Participants Scroll List */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1.5">
        {participants.map((p) => {
          const isTargetHost = p.role === 'HOST';
          const isTargetCurrentUser = p.id === currentUser?.id;
          const isTargetMod = p.role === 'MODERATOR';

          return (
            <div
              key={p.id}
              className={`p-2 sm:p-2.5 rounded-xl border transition-all flex items-center justify-between group ${
                isTargetCurrentUser
                  ? 'bg-[#181824] border-white/[0.14] shadow-sm'
                  : 'bg-[#14141B]/70 border-white/[0.04] hover:bg-[#181822] hover:border-white/[0.09]'
              }`}
            >
              {/* User Avatar & Info */}
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="relative shrink-0">
                  <div
                    className={`w-8 h-8 rounded-full bg-gradient-to-tr ${getAvatarGradient(
                      p.role,
                      p.displayName
                    )} text-white flex items-center justify-center font-extrabold text-[11px] shadow-sm ring-1`}
                  >
                    {getInitials(p.displayName)}
                  </div>
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-[#14141B] ${
                      p.isConnected ? 'bg-emerald-400' : 'bg-red-500'
                    }`}
                  />
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-white truncate max-w-[110px] sm:max-w-[130px]">
                      {p.displayName}
                    </span>
                    {isTargetCurrentUser && (
                      <span className="text-[10px] text-[#A1A1AA] font-normal">(You)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {isTargetHost ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-amber-300">
                        <Crown size={11} className="stroke-[2.5]" /> Host
                      </span>
                    ) : isTargetMod ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-blue-300">
                        <Shield size={11} className="stroke-[2.5]" /> Moderator
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#71717A]">
                        <User size={10} /> Viewer
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Host Actions (Only Host can modify other non-Host participants) */}
              {isHost && !isTargetHost && !isTargetCurrentUser && (
                <div className="flex items-center gap-1 opacity-90 group-hover:opacity-100 transition-opacity">
                  {/* Role Assignment: Promote / Demote */}
                  {isTargetMod ? (
                    <button
                      onClick={() => onAssignRole(p.id, 'PARTICIPANT')}
                      className="p-1.5 rounded-lg text-[#A1A1AA] hover:text-amber-400 hover:bg-amber-950/30 border border-transparent hover:border-amber-900/40 transition cursor-pointer"
                      title="Demote to Viewer"
                    >
                      <ShieldAlert size={14} />
                    </button>
                  ) : (
                    <button
                      onClick={() => onAssignRole(p.id, 'MODERATOR')}
                      className="p-1.5 rounded-lg text-[#A1A1AA] hover:text-blue-400 hover:bg-blue-950/30 border border-transparent hover:border-blue-900/40 transition cursor-pointer"
                      title="Promote to Moderator"
                    >
                      <ShieldCheck size={14} />
                    </button>
                  )}

                  {/* Remove Participant */}
                  {confirmRemoveId === p.id ? (
                    <div className="flex items-center gap-1 bg-red-950/80 p-0.5 rounded-lg border border-red-800">
                      <button
                        onClick={() => {
                          onRemoveParticipant(p.id);
                          setConfirmRemoveId(null);
                        }}
                        className="px-1.5 py-0.5 bg-[#FF2638] hover:bg-red-600 text-white text-[10px] font-bold rounded shadow cursor-pointer"
                      >
                        Kick
                      </button>
                      <button
                        onClick={() => setConfirmRemoveId(null)}
                        className="px-1 py-0.5 text-gray-400 hover:text-white text-[10px] cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmRemoveId(p.id)}
                      className="p-1.5 rounded-lg text-[#A1A1AA] hover:text-[#FF2638] hover:bg-red-950/30 border border-transparent hover:border-red-900/40 transition cursor-pointer"
                      title="Remove participant from room"
                    >
                      <UserMinus size={14} />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
