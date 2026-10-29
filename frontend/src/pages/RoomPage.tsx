import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Users, Send, MessageSquare, AlertCircle, Share2, Check, ArrowLeft, Radio, Film, Sparkles } from 'lucide-react';
import { useWatchParty } from '../context/WatchPartyContext.js';
import { Navbar } from '../components/Navbar.js';
import { YouTubePlayer } from '../components/YouTubePlayer.js';
import { VideoControlBar } from '../components/VideoControlBar.js';
import { ParticipantsList } from '../components/ParticipantsList.js';
import { PlaybackRequestsPanel } from '../components/PlaybackRequestsPanel.js';
import { ChatPanel } from '../components/ChatPanel.js';
import { AmbientBackground } from '../components/AmbientBackground.js';
import { RoomSettingsModal } from '../components/RoomSettingsModal.js';

type SidebarTab = 'chat' | 'participants' | 'requests';

export const RoomPage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  const {
    isConnected,
    room,
    currentUser,
    participants,
    requests,
    chatMessages,
    lastError,
    hostGracePeriodNotice,
    isRoomClosed,
    roomClosedReason,
    clearError,
    play,
    pause,
    seek,
    changeVideo,
    assignRole,
    removeParticipant,
    requestPlaybackControl,
    respondToPlaybackRequest,
    sendChat,
    updateRoomSettings,
    leaveRoom,
  } = useWatchParty();

  const [activeTab, setActiveTab] = useState<SidebarTab>('chat');
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [isTheaterMode, setIsTheaterMode] = useState<boolean>(false);
  const [videoTitle, setVideoTitle] = useState<string>('');
  const [showVideoChanger, setShowVideoChanger] = useState<boolean>(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);

  // If user opened directly without joining yet, route back to landing page with room query
  if (!room || !currentUser) {
    return (
      <div className="min-h-screen bg-[#09090B] text-[#F4F4F6] flex flex-col justify-between">
        <Navbar isConnected={isConnected} />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="glass-panel p-8 sm:p-10 rounded-3xl max-w-md w-full shadow-2xl border border-white/[0.08] ring-1 ring-white/[0.04]">
            <div className="w-14 h-14 rounded-2xl bg-[#FF2638]/10 border border-[#FF2638]/20 flex items-center justify-center text-[#FF2638] mx-auto mb-4">
              <AlertCircle size={28} />
            </div>
            <h2 className="text-xl font-extrabold text-white mb-2">Join Watch Party</h2>
            <p className="text-xs text-[#A1A1AA] mb-6 leading-relaxed">
              You need to choose a display name to enter room{' '}
              <span className="font-mono text-white font-bold bg-white/[0.06] px-2 py-0.5 rounded">
                {roomId}
              </span>
              .
            </p>
            <button
              onClick={() => navigate(`/?room=${roomId}`)}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#FF2638] to-[#E01427] hover:from-[#FF3D4E] hover:to-[#FF2638] text-white font-bold text-sm shadow-xl shadow-red-600/30 transition-all active:scale-95 cursor-pointer"
            >
              <span>Enter Watch Room</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const pendingRequestsCount = requests.filter((r) => r.status === 'PENDING').length;
  const hostParticipant = participants.find((p) => p.role === 'HOST' || p.id === room.hostParticipantId);
  const hostDisplayName = hostParticipant ? hostParticipant.displayName : 'Party Host';
  const isAuthorized = currentUser.role === 'HOST' || currentUser.role === 'MODERATOR' || room.settings?.playbackMode === 'FREE_FOR_ALL';

  const handleCopyInvitation = () => {
    const inviteUrl = `${window.location.origin}/?room=${room.roomId}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2200);
  };

  const handleLeave = () => {
    leaveRoom();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-[#09090B] text-[#F4F4F6] flex flex-col relative overflow-x-hidden">
      {/* 1. Cinematic Ambient Background Light Effect derived from active video imagery */}
      <AmbientBackground videoId={room.videoId || ''} />

      {/* Top Navigation Bar */}
      <Navbar
        roomId={room.roomId}
        currentUser={currentUser}
        isConnected={isConnected}
        roomSettings={room.settings}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onLeave={handleLeave}
      />

      {/* Host Grace Period Notification Banner */}
      {hostGracePeriodNotice && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 text-amber-200 px-4 py-2.5 text-xs text-center flex items-center justify-center gap-2 backdrop-blur-md animate-pulse z-30">
          <AlertCircle size={15} className="text-amber-400" />
          <span>{hostGracePeriodNotice}</span>
        </div>
      )}

      {/* Floating Error Toast Notification */}
      {lastError && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#161622]/95 border border-red-500/40 text-white px-4 py-3 rounded-2xl shadow-2xl backdrop-blur-2xl flex items-center gap-3 text-xs max-w-sm animate-in slide-in-from-bottom duration-300 ring-1 ring-black/60">
          <div className="w-8 h-8 rounded-xl bg-red-500/20 text-[#FF2638] flex items-center justify-center shrink-0">
            <AlertCircle size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white uppercase text-[10px] tracking-wider">
              {lastError.code.replace(/_/g, ' ')}
            </p>
            <p className="text-[#A1A1AA] truncate text-[11px]">{lastError.message}</p>
          </div>
          <button
            onClick={clearError}
            className="text-[#71717A] hover:text-white p-1 rounded-lg cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* 2. Main Watch Page Layout (Centered, tightly aligned player and compact sidebar) */}
      <main
        className={`flex-1 w-full mx-auto p-3 sm:p-5 md:p-6 transition-all duration-300 relative z-10 ${
          isTheaterMode
            ? 'max-w-[1700px] flex flex-col gap-6'
            : 'max-w-[1680px] flex flex-col lg:flex-row gap-5'
        }`}
      >
        {/* Left / Main Column: Video Player & Watch Page Metadata */}
        <section className={`flex flex-col gap-3 min-w-0 ${isTheaterMode ? 'w-full' : 'flex-1'}`}>
          {/* Official YouTube IFrame Player with Custom Translucent Controls */}
          <div className="relative">
            <YouTubePlayer
              room={room}
              userRole={currentUser.role}
              isTheaterMode={isTheaterMode}
              onToggleTheaterMode={() => setIsTheaterMode(!isTheaterMode)}
              onPlay={play}
              onPause={pause}
              onSeek={seek}
              onVideoTitleChange={setVideoTitle}
              onRequestControl={(action, time) => {
                requestPlaybackControl(action, time);
              }}
            />
          </div>

          {/* Video Metadata, Channel Info & Actions Section (YouTube Watch Page Style) */}
          <div className="flex flex-col gap-3.5 pt-1">
            {/* Video Title */}
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-white tracking-tight leading-snug line-clamp-2">
              {videoTitle || `YouTube Stream (${room.videoId})`}
            </h1>

            {/* Room Host, Viewer Count, Sync Indicator & Action Buttons Row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
              {/* Left: Host Avatar, Host Name & Viewer Counter */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#FF2638] to-[#8B5CF6] p-0.5 shadow-md shrink-0">
                  <div className="w-full h-full rounded-full bg-[#14141B] flex items-center justify-center text-white font-extrabold text-sm uppercase">
                    {hostDisplayName.charAt(0)}
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm hover:text-[#FF2638] transition cursor-default">
                      {hostDisplayName}
                    </span>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-[#FF2638]/15 text-[#FF2638] border border-[#FF2638]/30">
                      Host
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[#A1A1AA] mt-0.5">
                    <span>
                      {participants.length} {participants.length === 1 ? 'viewer' : 'viewers'} in party
                    </span>
                    <span>•</span>
                    <span className="font-mono text-[11px] bg-white/[0.06] px-1.5 py-0.5 rounded text-zinc-300">
                      ID: {room.roomId}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right: Live Sync Status badge & Actions */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Live Synchronization Status Indicator */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-xs">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'
                    }`}
                  />
                  <span className="text-zinc-200 text-xs font-medium">
                    {isConnected ? 'In Sync' : 'Reconnecting'}
                  </span>
                </div>

                {/* Change Video Toggle Button */}
                <button
                  type="button"
                  onClick={() => setShowVideoChanger(!showVideoChanger)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 cursor-pointer shadow-sm ${
                    showVideoChanger
                      ? 'bg-[#FF2638] text-white border-[#FF2638]'
                      : 'bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 border-white/[0.1]'
                  }`}
                  title={isAuthorized ? 'Change current video' : 'Request new video'}
                >
                  <Film size={14} />
                  <span>{showVideoChanger ? 'Hide Input' : isAuthorized ? 'Change Video' : 'Request Video'}</span>
                </button>

                {/* Share Party Link Button */}
                <button
                  onClick={handleCopyInvitation}
                  className="px-3.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-white text-xs font-bold border border-white/[0.1] flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-sm"
                  title="Copy shareable party invitation link"
                >
                  {copiedLink ? <Check size={14} className="text-emerald-400" /> : <Share2 size={14} />}
                  <span>{copiedLink ? 'Copied Link!' : 'Share'}</span>
                </button>
              </div>
            </div>

            {/* Expandable/Inline Video Control Bar */}
            {showVideoChanger && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                <VideoControlBar
                  userRole={currentUser.role}
                  playbackMode={room.settings?.playbackMode}
                  onChangeVideo={(newId) => {
                    changeVideo(newId);
                    setShowVideoChanger(false);
                  }}
                  onRequestChangeVideo={(videoId) => {
                    requestPlaybackControl('CHANGE_VIDEO', 0, videoId);
                    setShowVideoChanger(false);
                  }}
                />
              </div>
            )}
          </div>
        </section>

        {/* Right Column: Compact Streaming Sidebar (Chat, Participants, Requests) */}
        <aside
          className={`flex flex-col shrink-0 ${
            isTheaterMode
              ? 'w-full lg:w-96 h-[480px]'
              : 'w-full lg:w-80 xl:w-96 h-[520px] lg:h-[calc(100vh-100px)] sticky top-20'
          }`}
        >
          {/* Sidebar Tab Navigation (Aligned with top of player) */}
          <div className="flex bg-[#14141B] p-1.5 rounded-2xl mb-2.5 border border-white/[0.08] shrink-0 shadow-lg">
            {/* Chat Tab */}
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'chat'
                  ? 'bg-[#1F1F2C] text-white shadow-sm border border-white/[0.12]'
                  : 'text-[#A1A1AA] hover:text-white'
              }`}
            >
              <MessageSquare size={14} />
              <span>Live Chat</span>
            </button>

            {/* Users Tab */}
            <button
              onClick={() => setActiveTab('participants')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'participants'
                  ? 'bg-[#1F1F2C] text-white shadow-sm border border-white/[0.12]'
                  : 'text-[#A1A1AA] hover:text-white'
              }`}
            >
              <Users size={14} />
              <span>Users ({participants.length})</span>
            </button>

            {/* Requests Tab */}
            <button
              onClick={() => setActiveTab('requests')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 relative cursor-pointer ${
                activeTab === 'requests'
                  ? 'bg-[#1F1F2C] text-white shadow-sm border border-white/[0.12]'
                  : 'text-[#A1A1AA] hover:text-white'
              }`}
            >
              <Send size={14} />
              <span>Requests</span>
              {pendingRequestsCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-[#FF2638] text-white text-[10px] font-extrabold flex items-center justify-center shadow-sm shadow-red-600/40">
                  {pendingRequestsCount}
                </span>
              )}
            </button>
          </div>

          {/* Active Sidebar Tab View */}
          <div className="flex-1 min-h-0 bg-[#121218] rounded-2xl border border-white/[0.08] overflow-hidden shadow-2xl flex flex-col">
            {activeTab === 'chat' && (
              <ChatPanel
                messages={chatMessages}
                currentUser={currentUser}
                onSendMessage={sendChat}
                slowModeSeconds={room.settings?.slowModeSeconds}
              />
            )}

            {activeTab === 'participants' && (
              <ParticipantsList
                participants={participants}
                currentUser={currentUser}
                onAssignRole={assignRole}
                onRemoveParticipant={removeParticipant}
              />
            )}

            {activeTab === 'requests' && (
              <PlaybackRequestsPanel
                requests={requests}
                currentUser={currentUser}
                currentPlaybackTime={room.currentTime}
                onRespondRequest={respondToPlaybackRequest}
                onRequestControl={requestPlaybackControl}
              />
            )}
          </div>
        </aside>
      </main>

      {/* Room Closed or User Removed Modal */}
      {isRoomClosed && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel border border-white/[0.12] rounded-3xl max-w-sm w-full p-7 text-center shadow-2xl ring-1 ring-black/80">
            <div className="w-14 h-14 rounded-2xl bg-[#FF2638]/15 border border-[#FF2638]/30 flex items-center justify-center text-[#FF2638] mx-auto mb-4">
              <AlertCircle size={28} />
            </div>
            <h3 className="text-lg font-extrabold text-white mb-1.5">Session Terminated</h3>
            <p className="text-xs text-[#A1A1AA] mb-6 leading-relaxed">
              {roomClosedReason || 'This watch party has been closed or you were removed from the room.'}
            </p>
            <button
              onClick={() => {
                leaveRoom();
                navigate('/');
              }}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#FF2638] to-[#E01427] hover:from-[#FF3D4E] hover:to-[#FF2638] text-white text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 cursor-pointer active:scale-95"
            >
              <ArrowLeft size={14} />
              <span>Return to Home</span>
            </button>
          </div>
        </div>
      )}

      {/* Host Room Mode Settings Modal */}
      <RoomSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        currentSettings={room.settings}
        onSave={updateRoomSettings}
      />
    </div>
  );
};
