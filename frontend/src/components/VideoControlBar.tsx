import React, { useState } from 'react';
import { Film, ArrowRight, Sparkles, Check, AlertCircle, PlaySquare } from 'lucide-react';
import { PlaybackMode, Role } from '../types/index.js';
import { extractYouTubeVideoId } from '../utils/youtube.js';

interface VideoControlBarProps {
  userRole: Role;
  playbackMode?: PlaybackMode;
  onChangeVideo: (videoId: string) => void;
  onRequestChangeVideo: (videoId: string) => void;
}

const SAMPLE_VIDEOS = [
  { title: 'Synthwave Lofi Beats', id: 'jfKfPfyJRdk', tag: 'Music' },
  { title: 'Big Buck Bunny 4K', id: 'aqz-KE-bpKQ', tag: 'Animation' },
  { title: 'Earth from Space (NASA)', id: '21X5lGlDOfg', tag: 'Documentary' },
];

export const VideoControlBar: React.FC<VideoControlBarProps> = ({
  userRole,
  playbackMode,
  onChangeVideo,
  onRequestChangeVideo,
}) => {
  const [urlInput, setUrlInput] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const isAuthorized = userRole === 'HOST' || userRole === 'MODERATOR' || playbackMode === 'FREE_FOR_ALL';

  const handleAction = (videoIdToUse?: string) => {
    setError(null);
    setSuccessMsg(null);

    const targetId = videoIdToUse || extractYouTubeVideoId(urlInput);
    if (!targetId) {
      setError('Please provide a valid YouTube link or 11-character video ID');
      return;
    }

    if (isAuthorized) {
      onChangeVideo(targetId);
      setUrlInput('');
      setSuccessMsg('Video changed successfully');
    } else {
      onRequestChangeVideo(targetId);
      setUrlInput('');
      setSuccessMsg('Video change request submitted to Host for approval');
    }

    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleAction();
  };

  return (
    <div className="bg-[#14141B] rounded-2xl border border-white/[0.08] p-4 shadow-xl flex flex-col gap-3.5 ring-1 ring-white/[0.03]">
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-center gap-2.5">
        <div className="relative flex-1 w-full">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#71717A]">
            <Film size={16} />
          </div>
          <input
            type="text"
            placeholder="Paste YouTube link (e.g. https://www.youtube.com/watch?v=...)"
            value={urlInput}
            onChange={(e) => {
              setUrlInput(e.target.value);
              if (error) setError(null);
            }}
            className="w-full bg-[#0D0D12] border border-white/[0.08] rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-white placeholder-[#71717A] focus:outline-none focus:border-[#FF2638] focus:ring-1 focus:ring-[#FF2638]/40 transition shadow-inner"
          />
        </div>

        <button
          type="submit"
          className={`w-full sm:w-auto px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] shrink-0 cursor-pointer ${
            isAuthorized
              ? 'bg-gradient-to-r from-[#FF2638] to-[#E01427] hover:from-[#FF3D4E] hover:to-[#FF2638] text-white shadow-lg shadow-red-600/25'
              : 'bg-white/[0.06] hover:bg-white/[0.1] text-gray-200 border border-white/[0.1]'
          }`}
        >
          <span>{isAuthorized ? 'Change Video' : 'Request Video'}</span>
          <ArrowRight size={15} />
        </button>
      </form>

      {/* Suggested Stream Chips */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="text-[#71717A] flex items-center gap-1.5 text-[11px] font-medium pr-1">
          <Sparkles size={12} className="text-[#FF2638]" /> Suggestions:
        </span>
        {SAMPLE_VIDEOS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => handleAction(v.id)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#181822] hover:bg-[#20202E] text-gray-300 hover:text-white border border-white/[0.06] hover:border-white/[0.15] transition-all text-[11px] cursor-pointer group"
          >
            <PlaySquare size={11} className="text-[#FF2638] group-hover:scale-110 transition-transform" />
            <span>{v.title}</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/[0.06] text-[#71717A] font-mono">
              {v.tag}
            </span>
          </button>
        ))}
      </div>

      {/* Dynamic Feedback Toasts */}
      {error && (
        <div className="flex items-center gap-2 text-xs text-red-300 bg-red-950/40 border border-red-800/60 p-2.5 rounded-xl animate-in fade-in">
          <AlertCircle size={14} className="text-[#FF2638] shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2 text-xs text-emerald-300 bg-emerald-950/40 border border-emerald-800/60 p-2.5 rounded-xl animate-in fade-in">
          <Check size={14} className="text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
    </div>
  );
};
