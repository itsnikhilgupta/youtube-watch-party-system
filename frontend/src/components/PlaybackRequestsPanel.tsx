import React, { useState } from 'react';
import { Check, X, Clock, Send, Play, Pause, FastForward, Film } from 'lucide-react';
import { Participant, PlaybackActionType, PlaybackRequest } from '../types/index.js';
import { extractYouTubeVideoId, formatMessageTime, formatTime } from '../utils/youtube.js';

interface PlaybackRequestsPanelProps {
  requests: PlaybackRequest[];
  currentUser: Participant | null;
  currentPlaybackTime: number;
  onRespondRequest: (requestId: string, approve: boolean) => void;
  onRequestControl: (action: PlaybackActionType, currentTime?: number, videoId?: string) => Promise<void>;
}

export const PlaybackRequestsPanel: React.FC<PlaybackRequestsPanelProps> = ({
  requests,
  currentUser,
  currentPlaybackTime,
  onRespondRequest,
  onRequestControl,
}) => {
  const [showModal, setShowModal] = useState<boolean>(false);
  const [actionType, setActionType] = useState<PlaybackActionType>('PLAY');
  const [seekSeconds, setSeekSeconds] = useState<number>(Math.floor(currentPlaybackTime));
  const [videoUrlInput, setVideoUrlInput] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isHost = currentUser?.role === 'HOST';
  const pendingRequests = requests.filter((r) => r.status === 'PENDING');

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      if (actionType === 'CHANGE_VIDEO') {
        const id = extractYouTubeVideoId(videoUrlInput);
        if (!id) {
          throw new Error('Please enter a valid YouTube URL or 11-character video ID');
        }
        await onRequestControl('CHANGE_VIDEO', 0, id);
      } else if (actionType === 'SEEK') {
        await onRequestControl('SEEK', seekSeconds);
      } else {
        await onRequestControl(actionType, currentPlaybackTime);
      }
      setShowModal(false);
      setVideoUrlInput('');
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getActionBadge = (action: PlaybackActionType) => {
    switch (action) {
      case 'PLAY':
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
            <Play size={10} fill="currentColor" /> Play
          </span>
        );
      case 'PAUSE':
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
            <Pause size={10} /> Pause
          </span>
        );
      case 'SEEK':
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
            <FastForward size={10} /> Seek
          </span>
        );
      case 'CHANGE_VIDEO':
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">
            <Film size={10} /> Video
          </span>
        );
    }
  };

  const getInitials = (name: string) => {
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div className="flex flex-col h-full bg-[#111116] rounded-2xl border border-white/[0.08] overflow-hidden shadow-xl ring-1 ring-white/[0.03]">
      {/* Header */}
      <div className="p-3.5 px-4 border-b border-white/[0.06] flex items-center justify-between bg-[#14141B]">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-xs uppercase tracking-wider text-white">Requests</h3>
          {pendingRequests.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#FF2638] text-white shadow-sm shadow-red-600/40 animate-pulse">
              {pendingRequests.length} PENDING
            </span>
          )}
        </div>

        {/* Participant "Request Control" button */}
        {!isHost && (
          <button
            onClick={() => {
              setSeekSeconds(Math.floor(currentPlaybackTime));
              setShowModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1 bg-white/[0.06] hover:bg-white/[0.12] text-white text-xs font-semibold rounded-full border border-white/[0.1] transition-all shadow-sm cursor-pointer active:scale-95"
          >
            <Send size={12} className="text-[#FF2638]" />
            <span>Request Control</span>
          </button>
        )}
      </div>

      {/* Requests List */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">
        {requests.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center text-[#71717A]">
            <Clock size={32} className="mb-2 opacity-30 text-[#A1A1AA]" />
            <p className="text-xs font-bold text-white mb-0.5">No pending requests</p>
            <p className="text-[11px] text-[#71717A] max-w-xs leading-normal">
              {isHost
                ? 'When attendees request to play, pause, seek, or change videos, their requests appear here for approval.'
                : 'Click "Request Control" above to ask the Host to play, pause, seek, or switch video.'}
            </p>
          </div>
        ) : (
          requests.map((req) => {
            const isPending = req.status === 'PENDING';
            const isMine = req.requesterId === currentUser?.id;

            return (
              <div
                key={req.id}
                className={`p-3 rounded-xl border flex flex-col gap-2 transition-all ${
                  isPending
                    ? 'bg-[#181824] border-white/[0.12] shadow-md ring-1 ring-white/[0.04]'
                    : 'bg-[#14141B]/60 border-white/[0.04] opacity-60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center text-[10px] font-extrabold shadow-sm shrink-0">
                      {getInitials(req.requesterName)}
                    </div>
                    <span className="text-xs font-bold text-white truncate max-w-[110px]">
                      {req.requesterName} {isMine && '(You)'}
                    </span>
                    {getActionBadge(req.action)}
                  </div>
                  <span className="text-[10px] text-[#71717A] font-mono">
                    {formatMessageTime(req.timestamp)}
                  </span>
                </div>

                {/* Details */}
                <div className="text-[11px] text-[#A1A1AA] pl-8">
                  {req.action === 'SEEK' && typeof req.payload.currentTime === 'number' && (
                    <span>
                      Seek to timestamp:{' '}
                      <strong className="text-white font-mono bg-white/[0.06] px-1.5 py-0.5 rounded">
                        {formatTime(req.payload.currentTime)}
                      </strong>
                    </span>
                  )}
                  {req.action === 'CHANGE_VIDEO' && req.payload.videoId && (
                    <span>
                      YouTube Video ID:{' '}
                      <strong className="text-white font-mono bg-white/[0.06] px-1.5 py-0.5 rounded">
                        {req.payload.videoId}
                      </strong>
                    </span>
                  )}
                  {(req.action === 'PLAY' || req.action === 'PAUSE') && (
                    <span>Requests to {req.action.toLowerCase()} synchronized stream</span>
                  )}
                </div>

                {/* Host Review Actions or Status Tag */}
                <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] mt-0.5">
                  <div className="text-[11px] font-medium">
                    {req.status === 'PENDING' && (
                      <span className="inline-flex items-center gap-1.5 text-amber-300 text-[10px] font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                        Awaiting Host
                      </span>
                    )}
                    {req.status === 'APPROVED' && (
                      <span className="inline-flex items-center gap-1 text-emerald-400 text-[10px] font-bold">
                        <Check size={11} /> Approved
                      </span>
                    )}
                    {req.status === 'REJECTED' && (
                      <span className="inline-flex items-center gap-1 text-red-400 text-[10px] font-bold">
                        <X size={11} /> Rejected
                      </span>
                    )}
                    {req.status === 'EXPIRED' && (
                      <span className="text-[#71717A] text-[10px]">Expired</span>
                    )}
                  </div>

                  {isHost && isPending && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => onRespondRequest(req.id, true)}
                        className="flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-bold shadow-md shadow-emerald-900/30 transition cursor-pointer active:scale-95"
                        title="Approve request"
                      >
                        <Check size={13} />
                        <span>Approve</span>
                      </button>
                      <button
                        onClick={() => onRespondRequest(req.id, false)}
                        className="flex items-center gap-1 px-2.5 py-1 bg-white/[0.06] hover:bg-red-500/20 text-[#A1A1AA] hover:text-red-400 rounded-lg text-[11px] font-semibold border border-white/[0.08] hover:border-red-500/30 transition cursor-pointer"
                        title="Reject request"
                      >
                        <X size={13} />
                        <span>Reject</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Participant Request Control Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#14141B]/95 border border-white/[0.12] rounded-2xl max-w-md w-full p-6 shadow-2xl ring-1 ring-black/60 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                <Send size={17} className="text-[#FF2638]" />
                Request Playback Control
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-[#71717A] hover:text-white p-1 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[#A1A1AA] mb-4">
              Submit a control request for the room Host to approve or reject.
            </p>

            <form onSubmit={handleSubmitRequest} className="space-y-4">
              {/* Action selector */}
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-2">Select Action</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['PLAY', 'PAUSE', 'SEEK', 'CHANGE_VIDEO'] as PlaybackActionType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setActionType(type)}
                      className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                        actionType === type
                          ? 'bg-gradient-to-r from-[#FF2638] to-[#E01427] border-[#FF2638] text-white shadow-lg shadow-red-600/30'
                          : 'bg-[#181822] border-white/[0.06] text-[#A1A1AA] hover:bg-[#20202C] hover:text-white'
                      }`}
                    >
                      {type === 'PLAY' && <Play size={13} fill="currentColor" />}
                      {type === 'PAUSE' && <Pause size={13} />}
                      {type === 'SEEK' && <FastForward size={13} />}
                      {type === 'CHANGE_VIDEO' && <Film size={13} />}
                      <span>{type.replace('_', ' ')}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Seek parameter input */}
              {actionType === 'SEEK' && (
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5">
                    Target Timestamp: <span className="font-mono text-[#FF2638]">{formatTime(seekSeconds)}</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={seekSeconds}
                    onChange={(e) => setSeekSeconds(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="w-full bg-[#0D0D12] border border-white/[0.08] focus:border-[#FF2638] rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none transition"
                  />
                </div>
              )}

              {/* Change video parameter input */}
              {actionType === 'CHANGE_VIDEO' && (
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5">
                    YouTube URL or Video ID
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={videoUrlInput}
                    onChange={(e) => setVideoUrlInput(e.target.value)}
                    className="w-full bg-[#0D0D12] border border-white/[0.08] focus:border-[#FF2638] rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none transition"
                  />
                </div>
              )}

              {submitError && (
                <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/60 text-red-300 text-xs flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[#A1A1AA] hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#FF2638] hover:bg-[#FF3D4E] text-white shadow-lg shadow-red-600/30 disabled:opacity-50 cursor-pointer active:scale-95 transition-all"
                >
                  {isSubmitting ? 'Submitting...' : 'Send Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
