import React, { useState, useRef, useEffect } from 'react';
import { Send, MessageSquare, Crown, Shield, Clock } from 'lucide-react';
import { ChatMessage, Participant, Role } from '../types/index.js';
import { formatMessageTime } from '../utils/youtube.js';

interface ChatPanelProps {
  messages: ChatMessage[];
  currentUser: Participant | null;
  onSendMessage: (text: string) => void;
  slowModeSeconds?: number;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  currentUser,
  onSendMessage,
  slowModeSeconds = 0,
}) => {
  const [inputText, setInputText] = useState<string>('');
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const interval = setInterval(() => {
      setCooldownRemaining((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownRemaining]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    if (cooldownRemaining > 0) return;

    onSendMessage(inputText);
    setInputText('');

    // Trigger slow mode cooldown for participants
    if (slowModeSeconds > 0 && currentUser?.role === 'PARTICIPANT') {
      setCooldownRemaining(slowModeSeconds);
    }
  };

  const renderRoleBadge = (role: Role) => {
    if (role === 'HOST') {
      return (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full text-[9px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30">
          <Crown size={9} /> Host
        </span>
      );
    }
    if (role === 'MODERATOR') {
      return (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full text-[9px] font-extrabold bg-blue-500/20 text-blue-300 border border-blue-500/30">
          <Shield size={9} /> Mod
        </span>
      );
    }
    return null;
  };

  const getInitials = (name: string) => {
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div className="flex flex-col h-full bg-[#111116] rounded-2xl border border-white/[0.08] overflow-hidden shadow-xl ring-1 ring-white/[0.03]">
      {/* Header */}
      <div className="p-3.5 px-4 border-b border-white/[0.06] flex items-center justify-between bg-[#14141B]">
        <div className="flex items-center gap-2">
          <MessageSquare size={15} className="text-[#FF2638]" />
          <h3 className="font-bold text-xs uppercase tracking-wider text-white">Party Chat</h3>
        </div>
        <div className="flex items-center gap-2">
          {slowModeSeconds > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/25 font-medium">
              <Clock size={10} /> {slowModeSeconds}s slow
            </span>
          )}
          <span className="text-[11px] text-[#71717A]">Live Discussion</span>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-3.5 flex flex-col gap-3">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center text-[#71717A]">
            <div className="w-12 h-12 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-2">
              <MessageSquare size={22} className="text-[#A1A1AA] opacity-50" />
            </div>
            <p className="text-xs font-bold text-white mb-0.5">No messages yet</p>
            <p className="text-[11px] text-[#71717A] max-w-xs leading-normal">
              Say hello or react to the stream with everyone in the room!
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.senderId === currentUser?.id;

            return (
              <div
                key={msg.id}
                className={`flex flex-col max-w-[85%] ${
                  isMine ? 'self-end items-end' : 'self-start items-start'
                }`}
              >
                {/* Sender identity & role */}
                <div className="flex items-center gap-1.5 mb-1 px-1">
                  {!isMine && (
                    <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-[#FF2638] to-[#8B5CF6] text-white flex items-center justify-center text-[8px] font-extrabold shadow-sm shrink-0">
                      {getInitials(msg.senderName)}
                    </div>
                  )}
                  <span className="text-[11px] font-bold text-white truncate max-w-[120px]">
                    {msg.senderName} {isMine && '(You)'}
                  </span>
                  {renderRoleBadge(msg.senderRole)}
                  <span className="text-[10px] text-[#71717A] font-mono">
                    {formatMessageTime(msg.timestamp)}
                  </span>
                </div>

                {/* Message Bubble */}
                <div
                  className={`p-3 rounded-2xl text-xs break-words leading-relaxed shadow-sm ${
                    isMine
                      ? 'bg-gradient-to-r from-[#FF2638] to-[#E01427] text-white rounded-tr-sm shadow-red-900/20'
                      : 'bg-[#181824] text-[#E4E4E7] border border-white/[0.08] rounded-tl-sm'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input Box */}
      <form onSubmit={handleSend} className="p-3 bg-[#14141B] border-t border-white/[0.06] flex gap-2 items-center">
        <div className="relative flex-1">
          <input
            type="text"
            maxLength={280}
            disabled={cooldownRemaining > 0}
            placeholder={
              cooldownRemaining > 0
                ? `Slow mode active (${cooldownRemaining}s remaining)...`
                : 'Type a message to the room...'
            }
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="w-full bg-[#0D0D12] border border-white/[0.08] rounded-xl pl-3.5 pr-10 py-2.5 text-white text-xs placeholder-[#71717A] focus:outline-none focus:border-[#FF2638] focus:ring-1 focus:ring-[#FF2638]/40 transition shadow-inner disabled:opacity-50"
          />
          {inputText.length > 200 && (
            <span className="absolute right-3 top-2.5 text-[10px] text-[#71717A] font-mono">
              {280 - inputText.length}
            </span>
          )}
        </div>
        <button
          type="submit"
          disabled={!inputText.trim() || cooldownRemaining > 0}
          className="px-3.5 py-2.5 rounded-xl bg-[#FF2638] hover:bg-[#FF3D4E] text-white disabled:opacity-30 disabled:hover:bg-[#FF2638] transition-all shadow-md shadow-red-600/30 shrink-0 cursor-pointer active:scale-95 flex items-center gap-1.5 text-xs font-bold"
          title={cooldownRemaining > 0 ? `Wait ${cooldownRemaining}s` : 'Send message (Enter)'}
        >
          {cooldownRemaining > 0 ? (
            <span className="font-mono text-xs">{cooldownRemaining}s</span>
          ) : (
            <Send size={15} />
          )}
        </button>
      </form>
    </div>
  );
};
