// src/pages/ChannelSection/ChannelChatWindow.jsx
import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { isToday, isYesterday, format } from "date-fns";
import {
  FaArrowLeft,
  FaEllipsisH,
  FaHashtag,
  FaPaperPlane,
  FaSmile,
  FaUsers,
} from "react-icons/fa";

import useThemeStore from "../../store/themeStore";
import useUserStore from "../../store/useUserStore";
import { useChannelStore } from "../../store/channelStore";
import { useChatStore } from "../../store/chatStore";
import WhatsappImage from "../../whatsapp_image.png";
import ChannelDetailsPanel from "./ChannelDetailsPanel";

const isValidDate = (date) => date instanceof Date && !isNaN(date);

const ChannelChatWindow = ({ onBack }) => {
  const { theme } = useThemeStore();
  const { user } = useUserStore();

  const {
    currentChannelId,
    currentChannelDetails,
    getCurrentChannelMessages,
    hasMoreMessagesForCurrentChannel,
    loadOlderMessages,
    sendMessageInCurrentChannel,
    startTyping,
    stopTyping,
    markMessagesAsRead,
    getTypingUsersForCurrentChannel,
    joinChannel,
    leaveChannel,
    loadingMessages,
    joiningChannel,
    leavingChannel,
    sendingMessage,
  } = useChannelStore();

  const {
    isUserOnline,
    getUserLastSeen,
    refreshUsersStatus,
  } = useChatStore();

  const [message, setMessage] = useState("");
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const scrollContainerRef = useRef(null);
  const messagesEndRef = useRef(null);

  const isDark = theme === "dark";

  // --- Derived data from store ---
  const messages = getCurrentChannelMessages();
  const hasMore = hasMoreMessagesForCurrentChannel();
  const typingUsers = getTypingUsersForCurrentChannel();

  const channel = currentChannelDetails?.channel;
  const isMember = currentChannelDetails?.isMember;
  const isCreator = currentChannelDetails?.isCreator;
  const memberCount =
    currentChannelDetails?.memberCount ?? channel?.members?.length ?? 0;

  // ---------- Channel Members + Online Status ----------
  const membersWithStatus = useMemo(() => {
    if (!channel || !Array.isArray(channel.members)) return [];

    return channel.members.map((m) => {
      const id = typeof m === "string" ? m : m._id;
      const username =
        typeof m === "string" ? "Member" : m.username || "Unknown";
      const profilePicture =
        typeof m === "string" ? null : m.profilePicture || null;

      return {
        _id: id,
        username,
        profilePicture,
        isOnline: isUserOnline(id),
        lastSeen: getUserLastSeen(id),
      };
    });
  }, [channel, isUserOnline, getUserLastSeen]);

  // Panel open hone par members ke status refresh karo (online/last seen)
  useEffect(() => {
    if (!isDetailsOpen || !channel || !Array.isArray(channel.members)) return;

    const ids = channel.members
      .map((m) => (typeof m === "string" ? m : m._id))
      .filter(Boolean);

    if (ids.length > 0) {
      refreshUsersStatus(ids);
    }
  }, [isDetailsOpen, channel, refreshUsersStatus]);

  // --- Scroll helpers ---
  const scrollToBottom = useCallback((behavior = "smooth") => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior });
    }
  }, []);

  // Scroll to bottom when channel changes
  useEffect(() => {
    if (currentChannelId) {
      const timeout = setTimeout(() => scrollToBottom("auto"), 80);
      return () => clearTimeout(timeout);
    }
  }, [currentChannelId, scrollToBottom]);

  // Scroll on new messages
  useEffect(() => {
    if (!messages || messages.length === 0) return;
    scrollToBottom("smooth");
  }, [messages?.length, scrollToBottom]);

  // Load older messages when reaching top
  const handleScroll = async (e) => {
    const container = e.target;
    if (!container) return;

    if (container.scrollTop === 0 && hasMore && !isLoadingOlder) {
      try {
        setIsLoadingOlder(true);
        const prevScrollHeight = container.scrollHeight;

        await loadOlderMessages(currentChannelId);

        const newScrollHeight = container.scrollHeight;
        container.scrollTop = newScrollHeight - prevScrollHeight;
      } catch (err) {
        console.error("[Channel] Failed to load older messages:", err);
      } finally {
        setIsLoadingOlder(false);
      }
    }
  };

  // --- Group messages by date ---
  const groupedMessages = useMemo(() => {
    if (!Array.isArray(messages) || messages.length === 0) return {};

    return messages.reduce((acc, msg) => {
      if (!msg.createdAt) return acc;
      const d = new Date(msg.createdAt);
      if (!isValidDate(d)) return acc;

      const key = format(d, "yyyy-MM-dd");
      if (!acc[key]) acc[key] = [];
      acc[key].push(msg);
      return acc;
    }, {});
  }, [messages]);

  // --- Date separator renderer ---
  const renderDateSeparator = (date) => {
    if (!isValidDate(date)) return null;

    let label;
    if (isToday(date)) label = "Today";
    else if (isYesterday(date)) label = "Yesterday";
    else label = format(date, "EEEE, MMMM d");

    return (
      <div className="flex justify-center my-4">
        <span
          className={`px-4 py-1.5 rounded-full text-xs ${
            isDark ? "bg-gray-700 text-gray-300" : "bg-gray-200 text-gray-600"
          }`}
        >
          {label}
        </span>
      </div>
    );
  };

  // --- Mark messages as read when they load ---
  useEffect(() => {
    if (!currentChannelId || !Array.isArray(messages) || !messages.length) {
      return;
    }

    const unreadIds = messages
      .filter(
        (m) =>
          m.sender &&
          (m.sender._id || m.sender) !== user?._id &&
          m.messageStatus !== "read"
      )
      .map((m) => m._id);

    if (!unreadIds.length) return;

    markMessagesAsRead(unreadIds, currentChannelId);
  }, [messages, currentChannelId, user?._id, markMessagesAsRead]);

  // --- Send message handler ---
  const handleSend = async () => {
    const text = message.trim();
    if (!text || !currentChannelId) return;
    if (!isMember) {
      console.warn("[Channel] Cannot send message: not a member");
      return;
    }

    try {
      await sendMessageInCurrentChannel(text);
      setMessage("");
      // stop typing when message sent
      stopTyping(currentChannelId);
    } catch (err) {
      console.error("[Channel] Failed to send message:", err);
    }
  };

  // --- Typing handlers ---
  const handleInputChange = (e) => {
    const value = e.target.value;
    setMessage(value);

    if (!currentChannelId || !isMember) return;

    if (value.trim()) {
      startTyping(currentChannelId);
    } else {
      stopTyping(currentChannelId);
    }
  };

  const handleInputBlur = () => {
    if (currentChannelId && isMember) {
      stopTyping(currentChannelId);
    }
  };

  // --- Join / Leave handlers ---
  const handleJoinChannel = async () => {
    if (!currentChannelId || joiningChannel) return;
    try {
      await joinChannel(currentChannelId);
    } catch (err) {
      console.error("[Channel] Failed to join channel:", err);
    }
  };

  const handleLeaveChannel = async () => {
    if (!currentChannelId || leavingChannel) return;
    if (isCreator) {
      console.warn("[Channel] Creator cannot leave channel");
      return;
    }
    try {
      await leaveChannel(currentChannelId);
    } catch (err) {
      console.error("[Channel] Failed to leave channel:", err);
    }
  };

  // --- Placeholder when no channel selected ---
  if (!currentChannelId || !channel) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center mx-auto h-screen text-center">
        <div className="max-w-md">
          <img
            src={WhatsappImage}
            alt="channel-placeholder"
            className="w-full h-auto"
          />
          <h2
            className={`text-3xl font-semibold mb-4 ${
              isDark ? "text-white" : "text-black"
            }`}
          >
            Select a channel to start chatting
          </h2>
          <p
            className={`${
              isDark ? "text-gray-400" : "text-gray-600"
            } mb-6`}
          >
            Choose a channel from the list to start collaborating with everyone.
          </p>
        </div>
      </div>
    );
  }

  // --- Typing indicator text ---
  let typingText = "";
  if (typingUsers && typingUsers.length > 0 && isMember) {
    if (typingUsers.length === 1) {
      typingText = "Someone is typing…";
    } else {
      typingText = "Multiple people are typing…";
    }
  }

  return (
    <div className="flex-1 h-screen w-full flex flex-col relative">
      {/* HEADER */}
      <div
        className={`p-4 flex items-center ${
          isDark
            ? "bg-[#303430] text-white"
            : "bg-[rgb(239,242,245)] text-gray-700"
        }`}
      >
        {/* Back button (for mobile) */}
        {onBack && (
          <button className="mr-2 focus:outline-none" onClick={onBack}>
            <FaArrowLeft className="h-5 w-5" />
          </button>
        )}

        <div className="w-10 h-10 rounded-full flex items-center justify-center bg-green-500 text-white">
          <FaHashtag className="h-5 w-5" />
        </div>

        <div className="ml-3 flex-grow min-w-0">
          <h2 className="font-semibold text-start flex items-center gap-2">
            <span className="truncate">#{channel?.name}</span>
            {channel?.isPrivate && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500 text-white">
                Private
              </span>
            )}
          </h2>
          <p
            className={`text-xs mt-0.5 flex items-center gap-2 ${
              isDark ? "text-gray-300" : "text-gray-500"
            }`}
          >
            <FaUsers className="h-3 w-3" />
            <span>
              {memberCount} member{memberCount === 1 ? "" : "s"}
            </span>
          </p>
          {channel?.description && (
            <p
              className={`text-xs mt-0.5 line-clamp-1 ${
                isDark ? "text-gray-400" : "text-gray-500"
              }`}
              title={channel.description}
            >
              {channel.description}
            </p>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {/* Join / Leave Button */}
          {isMember ? (
            <button
              onClick={handleLeaveChannel}
              disabled={leavingChannel || isCreator}
              className={`px-3 py-1 text-xs rounded-full border transition-all ${
                leavingChannel ? "opacity-60 cursor-not-allowed" : ""
              } ${
                isDark
                  ? "border-red-400 text-red-300 hover:bg-red-500/10"
                  : "border-red-400 text-red-500 hover:bg-red-50"
              }`}
            >
              {isCreator ? "Creator" : "Leave"}
            </button>
          ) : (
            <button
              onClick={handleJoinChannel}
              disabled={joiningChannel || channel?.isPrivate}
              className={`px-3 py-1 text-xs rounded-full border transition-all ${
                joiningChannel ? "opacity-60 cursor-not-allowed" : ""
              } ${
                isDark
                  ? "border-green-400 text-green-300 hover:bg-green-500/10"
                  : "border-green-500 text-green-600 hover:bg-green-50"
              }`}
            >
              {channel?.isPrivate ? "Invite only" : "Join"}
            </button>
          )}

          <button
            className="focus:outline-none"
            onClick={() => setIsDetailsOpen(true)}
          >
            <FaEllipsisH className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* NON-MEMBER VIEW */}
      {!isMember && (
        <div
          className={`flex-1 flex flex-col items-center justify-center px-4 ${
            isDark ? "bg-[#191a1a]" : "bg-[rgb(241,236,229)]"
          }`}
        >
          <h3
            className={`text-lg font-semibold mb-2 ${
              isDark ? "text-white" : "text-gray-900"
            }`}
          >
            Join this channel to see messages
          </h3>
          <p
            className={`text-sm mb-4 text-center max-w-md ${
              isDark ? "text-gray-400" : "text-gray-600"
            }`}
          >
            You’re currently not a member of{" "}
            <span className="font-semibold">#{channel?.name}</span>. Join to
            view past messages and start participating in the conversation.
          </p>
          <button
            onClick={handleJoinChannel}
            disabled={joiningChannel || channel?.isPrivate}
            className={`px-4 py-2 rounded-full text-sm font-medium ${
              joiningChannel || channel?.isPrivate
                ? "opacity-60 cursor-not-allowed"
                : ""
            } ${
              isDark
                ? "bg-green-600 text-white hover:bg-green-500"
                : "bg-green-500 text-white hover:bg-green-600"
            }`}
          >
            {channel?.isPrivate ? "Private channel" : "Join channel"}
          </button>
        </div>
      )}

      {/* MEMBER VIEW: MESSAGES + INPUT */}
      {isMember && (
        <>
          {/* MESSAGES AREA */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className={`flex-1 p-4 overflow-y-auto ${
              isDark ? "bg-[#191a1a]" : "bg-[rgb(241,236,229)]"
            }`}
          >
            {/* Loading older */}
            {isLoadingOlder && (
              <div className="flex justify-center my-2">
                <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {/* First-load spinner */}
            {loadingMessages && !messages?.length && (
              <div className="flex justify-center my-4">
                <div className="w-6 h-6 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {/* Empty state for members */}
            {!loadingMessages && (!messages || messages.length === 0) && (
              <div className="h-full flex items-center justify-center">
                <p
                  className={`text-sm ${
                    isDark ? "text-gray-400" : "text-gray-500"
                  }`}
                >
                  No messages yet. Start the conversation 🎉
                </p>
              </div>
            )}

            {/* Messages grouped by date */}
            {Object.entries(groupedMessages).map(([dateKey, msgs]) => (
              <React.Fragment key={dateKey}>
                {renderDateSeparator(new Date(dateKey))}
                {msgs.map((msg) => {
                  const senderId =
                    typeof msg.sender === "string"
                      ? msg.sender
                      : msg.sender?._id;

                  const isMine = senderId === user?._id;

                  const createdAt = msg.createdAt
                    ? new Date(msg.createdAt)
                    : null;

                  const reactions = Array.isArray(msg.reactions)
                    ? msg.reactions
                    : [];

                  return (
                    <div
                      key={msg._id}
                      className={`mb-2 flex ${
                        isMine ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[75%] rounded-lg px-3 py-2 shadow-sm ${
                          isMine
                            ? isDark
                              ? "bg-green-600 text-white"
                              : "bg-green-500 text-white"
                            : isDark
                            ? "bg-gray-700 text-white"
                            : "bg-white text-gray-900"
                        }`}
                      >
                        {/* Sender name for others */}
                        {!isMine && msg.sender && (
                          <p className="text-[11px] font-semibold mb-1 opacity-80">
                            {msg.sender.username || "Unknown"}
                          </p>
                        )}

                        {/* Content */}
                        <p className="text-sm break-words">{msg.content}</p>

                        {/* Reactions (if any) */}
                        {reactions.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {reactions.map((r) => (
                              <span
                                key={`${msg._id}-${r.user}-${r.emoji}-${r.createdAt}`}
                                className={`text-[10px] px-1.5 py-0.5 rounded-full bg-black/10 ${
                                  isDark
                                    ? "bg-white/10 text-gray-100"
                                    : "bg-gray-100 text-gray-700"
                                }`}
                              >
                                {r.emoji}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Time */}
                        {createdAt && isValidDate(createdAt) && (
                          <p
                            className={`text-[10px] mt-1 text-right ${
                              isMine
                                ? "text-gray-100/80"
                                : isDark
                                ? "text-gray-300/80"
                                : "text-gray-500"
                            }`}
                          >
                            {format(createdAt, "HH:mm")}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}

            <div ref={messagesEndRef} />
          </div>

          {/* TYPING INDICATOR */}
          {typingText && (
            <div
              className={`px-4 py-1 text-xs ${
                isDark
                  ? "bg-[#202221] text-gray-300"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {typingText}
            </div>
          )}

          {/* INPUT AREA */}
          <div
            className={`p-4 flex items-center space-x-2 ${
              isDark ? "bg-[#303430]" : "bg-white"
            }`}
          >
            <button className="focus:outline-none">
              <FaSmile
                className={`h-6 w-6 ${
                  isDark ? "text-gray-400" : "text-gray-500"
                }`}
              />
            </button>

            <input
              type="text"
              value={message}
              onChange={handleInputChange}
              onBlur={handleInputBlur}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (message.trim()) handleSend();
                }
              }}
              placeholder={`Message #${channel?.name || ""}`}
              className={`flex-grow px-4 py-2 border rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-green-500 ${
                isDark
                  ? "bg-gray-700 text-white border-gray-600"
                  : "bg-white text-black border-gray-300"
              }`}
            />

            <button
              onClick={handleSend}
              disabled={!message.trim() || sendingMessage}
              className="focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FaPaperPlane className="h-6 w-6 text-green-500" />
            </button>
          </div>
        </>
      )}

      {/* RIGHT SIDE DETAILS PANEL */}
      <ChannelDetailsPanel
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        channel={channel}
        memberCount={memberCount}
        members={membersWithStatus}
        isMember={isMember}
        isCreator={isCreator}
        onJoin={handleJoinChannel}
        onLeave={handleLeaveChannel}
      />
    </div>
  );
};

export default ChannelChatWindow;
