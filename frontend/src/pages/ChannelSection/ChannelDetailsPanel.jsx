// src/pages/ChannelSection/ChannelDetailsPanel.jsx
import React, { useMemo, useState } from "react";
import {
  FaTimes,
  FaHashtag,
  FaUsers,
  FaBellSlash,
  FaSignOutAlt,
  FaUserCircle,
  FaSearch,
} from "react-icons/fa";
import { format, formatDistanceToNow } from "date-fns";
import useThemeStore from "../../store/themeStore";

const isValidDate = (d) => d instanceof Date && !isNaN(d);

const ChannelDetailsPanel = ({
  isOpen,
  onClose,
  channel,
  memberCount,
  members = [],
  isMember,
  isCreator,
  onJoin,
  onLeave,
}) => {
  const { theme } = useThemeStore();
  const isDark = theme === "dark";

  // ✅ Hooks always at top, fixed order
  const [searchTerm, setSearchTerm] = useState("");

  // ---- Creator / createdOn ----
  const createdAtDate = channel?.createdAt ? new Date(channel.createdAt) : null;

  // backend se aata hai: channel.createdBy
  const creatorRaw = channel?.createdBy || channel?.creator || null;
  const creator =
    creatorRaw && typeof creatorRaw === "object" ? creatorRaw : null;

  const createdByName = creator?.username || "Unknown";

  // ---- Online count (simple version) ----
  const onlineCount = useMemo(
    () => members.filter((m) => m.isOnline).length,
    [members]
  );

  // ---- Member search filter ----
  const filteredMembers = useMemo(() => {
    if (!Array.isArray(members)) return [];

    const term = searchTerm.trim().toLowerCase();
    if (!term) return members;

    return members.filter((m) =>
      (m.username || "Unknown").toLowerCase().includes(term)
    );
  }, [members, searchTerm]);

  // ✅ Early return AFTER hooks (safe for Rules of Hooks)
  if (!isOpen || !channel) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* Overlay */}
      <div
        className="flex-1 bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Right Panel */}
      <div
        className={`w-full max-w-sm h-full flex flex-col ${
          isDark ? "bg-[#111111] text-gray-100" : "bg-white text-gray-900"
        } shadow-xl`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-4 py-3 border-b ${
            isDark ? "border-gray-800" : "border-gray-200"
          }`}
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-green-500 text-white">
              <FaHashtag className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">
                #{channel.name || "Channel"}
              </p>
              <p
                className={`text-[11px] ${
                  isDark ? "text-gray-400" : "text-gray-500"
                }`}
              >
                Channel details
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-black/10 focus:outline-none"
          >
            <FaTimes className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Channel Info */}
          <div className="px-4 py-3 border-b border-gray-800/40">
            {/* Description */}
            {channel.description && (
              <div className="mb-3">
                <h4
                  className={`text-xs font-semibold mb-1 ${
                    isDark ? "text-gray-300" : "text-gray-600"
                  }`}
                >
                  Description
                </h4>
                <p
                  className={`text-sm ${
                    isDark ? "text-gray-200" : "text-gray-800"
                  }`}
                >
                  {channel.description}
                </p>
              </div>
            )}

            {/* Created by / on */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p
                  className={`font-semibold mb-1 ${
                    isDark ? "text-gray-300" : "text-gray-600"
                  }`}
                >
                  Created by
                </p>
                <p className="text-sm truncate">{createdByName}</p>
              </div>
              <div>
                <p
                  className={`font-semibold mb-1 ${
                    isDark ? "text-gray-300" : "text-gray-600"
                  }`}
                >
                  Created on
                </p>
                <p className="text-sm">
                  {createdAtDate && isValidDate(createdAtDate)
                    ? format(createdAtDate, "MMM d, yyyy")
                    : "N/A"}
                </p>
              </div>
            </div>

            {/* Stats */}
            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              <span
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full ${
                  isDark
                    ? "bg-gray-800 text-gray-200"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                <FaUsers className="h-3 w-3" />
                <span>
                  {memberCount} member{memberCount === 1 ? "" : "s"}
                </span>
              </span>
              <span
                className={`inline-flex items-center px-2 py-1 rounded-full ${
                  channel.isPrivate
                    ? isDark
                      ? "bg-red-900/40 text-red-300"
                      : "bg-red-50 text-red-600"
                    : isDark
                    ? "bg-green-900/40 text-green-300"
                    : "bg-green-50 text-green-600"
                }`}
              >
                {channel.isPrivate ? "Private channel" : "Public channel"}
              </span>
              {typeof onlineCount === "number" && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full ${
                    isDark
                      ? "bg-emerald-900/40 text-emerald-300"
                      : "bg-emerald-50 text-emerald-600"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  {onlineCount} online
                </span>
              )}
            </div>
          </div>

          {/* Member Search */}
          <div
            className={`px-4 py-2 border-b ${
              isDark ? "border-gray-800" : "border-gray-200"
            }`}
          >
            <div
              className={`flex items-center gap-2 px-2 py-1.5 rounded-full text-xs ${
                isDark
                  ? "bg-gray-900 border border-gray-700 text-gray-200"
                  : "bg-gray-50 border border-gray-200 text-gray-700"
              }`}
            >
              <FaSearch className="h-3 w-3 opacity-70" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search members"
                className={`flex-1 bg-transparent outline-none text-xs ${
                  isDark ? "placeholder-gray-500" : "placeholder-gray-400"
                }`}
              />
            </div>
          </div>

          {/* Members List */}
          <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
            <div
              className={`text-[11px] mb-1 ${
                isDark ? "text-gray-400" : "text-gray-500"
              }`}
            >
              Members ({filteredMembers.length})
            </div>

            {filteredMembers.length === 0 && (
              <p
                className={`text-xs ${
                  isDark ? "text-gray-500" : "text-gray-500"
                }`}
              >
                No members found.
              </p>
            )}

            {filteredMembers.map((member) => {
              const lastSeenDate = member.lastSeen
                ? new Date(member.lastSeen)
                : null;

              let statusText = "Offline";
              if (member.isOnline) {
                statusText = "Online";
              } else if (lastSeenDate && isValidDate(lastSeenDate)) {
                statusText = `Last seen ${formatDistanceToNow(lastSeenDate, {
                  addSuffix: true,
                })}`;
              }

              const isChannelCreator =
                creator &&
                (creator._id || creator.id) &&
                (creator._id || creator.id).toString() ===
                  (member._id || member.id || "").toString();

              return (
                <div
                  key={member._id || member.id || member.username}
                  className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-xs ${
                    isDark ? "hover:bg-gray-900" : "hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {member.profilePicture ? (
                      <img
                        src={member.profilePicture}
                        alt={member.username}
                        className="w-7 h-7 rounded-full object-cover"
                      />
                    ) : (
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center ${
                          isDark ? "bg-gray-800" : "bg-gray-200"
                        }`}
                      >
                        <FaUserCircle
                          className={`h-5 w-5 ${
                            isDark ? "text-gray-400" : "text-gray-500"
                          }`}
                        />
                      </div>
                    )}

                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {member.username || "Unknown"}
                      </p>
                      <div className="flex items-center gap-2 text-[10px]">
                        <span
                          className={`inline-flex items-center gap-1 ${
                            member.isOnline
                              ? "text-green-500"
                              : isDark
                              ? "text-gray-400"
                              : "text-gray-500"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              member.isOnline ? "bg-green-500" : "bg-gray-400"
                            }`}
                          />
                          {statusText}
                        </span>
                        {isChannelCreator && (
                          <span
                            className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${
                              isDark
                                ? "bg-indigo-900/40 text-indigo-200"
                                : "bg-indigo-50 text-indigo-600"
                            }`}
                          >
                            Creator
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div
            className={`px-4 py-3 border-t ${
              isDark ? "border-gray-800" : "border-gray-200"
            } space-y-2`}
          >
            {/* Mute placeholder (UI only) */}
            <button
              type="button"
              disabled
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-not-allowed opacity-70 ${
                isDark
                  ? "bg-gray-900 text-gray-400"
                  : "bg-gray-50 text-gray-600"
              }`}
            >
              <span className="flex items-center gap-2">
                <FaBellSlash className="h-3.5 w-3.5" />
                Mute notifications
              </span>
              <span className="text-[10px] italic">coming soon</span>
            </button>

            {/* Join / Leave actions */}
            {isMember ? (
              <button
                type="button"
                onClick={onLeave}
                disabled={isCreator}
                className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  isCreator ? "opacity-60 cursor-not-allowed" : ""
                } ${
                  isDark
                    ? "bg-red-900/50 text-red-200 hover:bg-red-900/70"
                    : "bg-red-50 text-red-600 hover:bg-red-100"
                }`}
              >
                <FaSignOutAlt className="h-3.5 w-3.5" />
                {isCreator ? "You are the creator" : "Leave channel"}
              </button>
            ) : (
              <button
                type="button"
                onClick={onJoin}
                className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  isDark
                    ? "bg-green-700 text-white hover:bg-green-600"
                    : "bg-green-500 text-white hover:bg-green-600"
                }`}
              >
                <FaUsers className="h-3.5 w-3.5" />
                Join channel
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChannelDetailsPanel;
