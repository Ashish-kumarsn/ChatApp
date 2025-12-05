// src/components/channels/ChannelList.jsx
import React, { useState, useMemo, useEffect } from "react";
import useThemeStore from "../../store/themeStore";
import { useChannelStore } from "../../store/channelStore";
import { FaPlus, FaSearch, FaHashtag, FaLock } from "react-icons/fa";
import { motion } from "framer-motion";
import formatTimestamp from "../../utils/formatTime";

const ChannelList = () => {
  const { theme } = useThemeStore();

  const {
    myChannels,
    allChannels,
    currentChannelId,
    openChannel,
    createChannel,
    fetchMyChannels,
    fetchAllChannels,
    loadingChannels,
    error,
  } = useChannelStore();

  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("my"); // 'my' | 'discover'

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelDesc, setNewChannelDesc] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        if (!myChannels.length) {
          await fetchMyChannels();
        }
        if (!allChannels.length) {
          await fetchAllChannels();
        }
      } catch (e) {
        // store already handles error state
        console.error("[ChannelList] Error loading channels on mount:", e);
      }
    };
    load();
  }, []);

  const sourceChannels =
    activeTab === "my" ? myChannels || [] : allChannels || [];

  const filteredChannels = useMemo(
    () =>
      (sourceChannels || []).filter((c) =>
        c?.name?.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [sourceChannels, searchTerm]
  );

  const handleCreateChannel = async (e) => {
    e.preventDefault();
    setLocalError("");

    const trimmedName = newChannelName.trim();
    const trimmedDesc = newChannelDesc.trim();

    if (!trimmedName) {
      setLocalError("Channel name is required");
      return;
    }

    const channel = await createChannel(trimmedName, trimmedDesc, isPrivate);

    if (channel) {
      setNewChannelName("");
      setNewChannelDesc("");
      setIsPrivate(false);
      setIsCreateOpen(false);
    }
  };

  const isDark = theme === "dark";

  return (
    <div
      className={`w-full border-r h-screen flex flex-col ${
        isDark
          ? "bg-[rgb(17,27,33)] border-gray-600"
          : "bg-white border-gray-200"
      }`}
    >
      {/* Header */}
      <div
        className={`px-4 pt-4 pb-2 flex items-center justify-between ${
          isDark ? "text-white" : "text-gray-800"
        }`}
      >
        <div className="flex items-center gap-2">
          <FaHashtag />
          <span className="text-lg font-semibold">Channels</span>
        </div>

        <button
          className="p-2 bg-green-500 text-white rounded-full hover:bg-green-600 transition-colors"
          onClick={() => {
            setIsCreateOpen(true);
            setLocalError("");
          }}
        >
          <FaPlus size={12} />
        </button>
      </div>

      {/* Tabs: My / Discover */}
      <div className="px-4 pb-2 flex gap-2 text-xs">
        <button
          className={`flex-1 py-1.5 rounded-full border transition-all ${
            activeTab === "my"
              ? isDark
                ? "bg-green-500 text-white border-green-500"
                : "bg-green-500 text-white border-green-500"
              : isDark
              ? "border-gray-700 text-gray-300 hover:bg-gray-800"
              : "border-gray-300 text-gray-600 hover:bg-gray-100"
          }`}
          onClick={() => setActiveTab("my")}
        >
          My Channels
        </button>
        <button
          className={`flex-1 py-1.5 rounded-full border transition-all ${
            activeTab === "discover"
              ? isDark
                ? "bg-green-500 text-white border-green-500"
                : "bg-green-500 text-white border-green-500"
              : isDark
              ? "border-gray-700 text-gray-300 hover:bg-gray-800"
              : "border-gray-300 text-gray-600 hover:bg-gray-100"
          }`}
          onClick={() => setActiveTab("discover")}
        >
          Discover
        </button>
      </div>

      {/* Search */}
      <div className="px-4 pb-2">
        <div className="relative">
          <FaSearch
            className={`absolute left-3 top-1/2 -translate-y-1/2 ${
              isDark ? "text-gray-400" : "text-gray-500"
            }`}
            size={12}
          />
          <input
            type="text"
            placeholder={
              activeTab === "my" ? "Search my channels" : "Search public channels"
            }
            className={`w-full pl-8 pr-3 py-1.5 text-xs rounded-lg outline-none border focus:ring-1 focus:ring-green-500 ${
              isDark
                ? "bg-gray-900 text-white border-gray-700 placeholder-gray-500"
                : "bg-gray-100 text-black border-gray-200 placeholder-gray-400"
            }`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Error / Loading */}
      {error && (
        <div className="px-4 text-xs text-red-500 mb-1 truncate">{error}</div>
      )}
      {loadingChannels && (
        <div
          className={`px-4 text-xs mb-1 ${
            isDark ? "text-gray-400" : "text-gray-500"
          }`}
        >
          Loading channels…
        </div>
      )}

      {/* Channels list */}
      <div className="flex-1 overflow-y-auto pb-2">
        {(!filteredChannels || filteredChannels.length === 0) &&
        !loadingChannels ? (
          <div
            className={`px-4 py-4 text-sm ${
              isDark ? "text-gray-400" : "text-gray-500"
            }`}
          >
            {activeTab === "my"
              ? "You have not joined any channels yet."
              : "No public channels found. Try a different search or create one."}
          </div>
        ) : (
          filteredChannels.map((channel) => {
            const isSelected = currentChannelId === channel._id;
            const lastMsg = channel.lastMessage;
            const lastTime = lastMsg?.createdAt
              ? formatTimestamp(lastMsg.createdAt)
              : null;
            const lastContent =
              lastMsg?.content || channel.description || "No messages yet";

            const memberCount =
              typeof channel.memberCount === "number"
                ? channel.memberCount
                : channel.members?.length || 0;

            return (
              <motion.div
                key={channel._id}
                onClick={() => openChannel(channel._id)}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                className={`px-3 py-2 flex items-center gap-3 cursor-pointer text-sm
                  ${
                    isSelected
                      ? isDark
                        ? "bg-gray-800"
                        : "bg-gray-200"
                      : isDark
                      ? "hover:bg-gray-800"
                      : "hover:bg-gray-100"
                  }`}
              >
                {/* Icon circle */}
                <div
                  className={`min-w-[40px] h-10 rounded-full flex items-center justify-center ${
                    isDark ? "bg-gray-800" : "bg-gray-200"
                  }`}
                >
                  {channel.isPrivate ? (
                    <FaLock
                      className={isDark ? "text-yellow-400" : "text-yellow-500"}
                      size={14}
                    />
                  ) : (
                    <FaHashtag
                      className={isDark ? "text-green-400" : "text-green-600"}
                      size={14}
                    />
                  )}
                </div>

                {/* Text info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 min-w-0">
                      <span
                        className={`font-semibold truncate ${
                          isDark ? "text-white" : "text-gray-900"
                        }`}
                      >
                        {channel.name}
                      </span>
                      {activeTab === "discover" && channel.isMember && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-500 border border-green-500/40">
                          Joined
                        </span>
                      )}
                    </div>

                    {lastTime && (
                      <span
                        className={`text-[10px] whitespace-nowrap ${
                          isDark ? "text-gray-400" : "text-gray-500"
                        }`}
                      >
                        {lastTime}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p
                      className={`text-xs truncate ${
                        isDark ? "text-gray-400" : "text-gray-600"
                      }`}
                    >
                      {lastContent}
                    </p>

                    <span
                      className={`text-[11px] whitespace-nowrap ${
                        isDark ? "text-gray-300" : "text-gray-600"
                      }`}
                    >
                      {memberCount} member{memberCount === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Create Channel Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div
            className={`w-[90%] max-w-sm rounded-xl p-4 shadow-lg ${
              isDark ? "bg-gray-900 text-gray-100" : "bg-white text-gray-900"
            }`}
          >
            <h3 className="text-base font-semibold mb-3">Create Channel</h3>

            <form onSubmit={handleCreateChannel} className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  className={`w-full px-2 py-1.5 rounded-md text-sm outline-none border ${
                    isDark
                      ? "bg-gray-800 border-gray-700 text-gray-100"
                      : "bg-gray-50 border-gray-300 text-gray-900"
                  }`}
                  placeholder="e.g. general, dev, random"
                />
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  Description (optional)
                </label>
                <textarea
                  rows={2}
                  value={newChannelDesc}
                  onChange={(e) => setNewChannelDesc(e.target.value)}
                  className={`w-full px-2 py-1.5 rounded-md text-sm outline-none border resize-none ${
                    isDark
                      ? "bg-gray-800 border-gray-700 text-gray-100"
                      : "bg-gray-50 border-gray-300 text-gray-900"
                  }`}
                  placeholder="Short description"
                />
              </div>

              <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                  className="h-3 w-3"
                />
                <span>Private channel</span>
              </label>

              {localError && (
                <div className="text-xs text-red-500">{localError}</div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateOpen(false);
                    setLocalError("");
                  }}
                  className={`px-3 py-1.5 text-xs rounded-md border ${
                    isDark
                      ? "border-gray-600 hover:bg-gray-800"
                      : "border-gray-300 hover:bg-gray-100"
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs rounded-md bg-green-500 text-white hover:bg-green-600"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChannelList;
