// src/store/channelStore.js
import { create } from "zustand";
import { getSocket } from "../services/chat.service";
import ChannelService from "../services/channel.service";

export const useChannelStore = create((set, get) => ({
  //STATES
  myChannels: [],              // channels where user is a member
  allChannels: [],             // all public channels (discover)
  currentChannelId: null,      // currently open channel ID
  currentChannelDetails: null, // { channel, memberCount, isMember, isCreator }

  messagesByChannel: {},       // { [channelId]: ChannelMessage[] }
  cursorByChannel: {},         // { [channelId]: nextCursor }
  hasMoreByChannel: {},        // { [channelId]: boolean }

  typingUsersByChannel: {},    // { [channelId]: Set<userId> }

  loadingChannels: false,
  loadingMessages: false,
  joiningChannel: false,
  leavingChannel: false,
  creatingChannel: false,
  sendingMessage: false,

  error: null,
  socketInitialized: false,

  // SOCKET LISTENERS 

  initChannelSocketListeners: () => {
    const socket = getSocket();
    if (!socket) {
      console.warn("[ChannelStore] Cannot initialize socket - socket not available");
      return;
    }

    const { socketInitialized } = get();
    if (socketInitialized) {
      console.log("[ChannelStore] Socket listeners already initialized");
      return;
    }

    console.log("[ChannelStore] Initializing socket listeners...");

    // Remove old listeners first
    socket.off("channel:receive_message");
    socket.off("channel:message_sent");
    socket.off("channel:message_read");
    socket.off("channel:user_typing");
    socket.off("channel:reaction_update");
    socket.off("channel:member_joined");
    socket.off("channel:member_left");
    socket.off("channel:created");
    socket.off("channel:updated");
    socket.off("channel:deleted");
    socket.off("channel:visibility_changed");
    socket.off("channel_joined");
    socket.off("channel_left");
    socket.off("channel_error");
    socket.off("channel_message_error");
    socket.off("channel_reaction_error");

    // 1. RECEIVE MESSAGE (Real-time)
    socket.on("channel:receive_message", (message) => {
      try {
        if (!message || !message._id) {
          console.error("[ChannelStore] Invalid message data:", message);
          return;
        }

        const channelId = message.channel?._id || message.channel;
        if (!channelId) {
          console.error("[ChannelStore] No channelId in message:", message);
          return;
        }

        console.log("[ChannelStore] Real-time message received:", message._id, "in channel:", channelId);

        get().addMessageToChannel(channelId, message);

        // Update lastMessage in channel lists
        set((state) => ({
          myChannels: state.myChannels.map(ch =>
            ch._id === channelId ? { ...ch, lastMessage: message } : ch
          ),
          allChannels: state.allChannels.map(ch =>
            ch._id === channelId ? { ...ch, lastMessage: message } : ch
          ),
        }));

      } catch (err) {
        console.error("[ChannelStore] Error handling channel:receive_message:", err);
      }
    });

    // 2. MESSAGE SENT CONFIRMATION
    socket.on("channel:message_sent", ({ messageId, channelId, status, timestamp }) => {
      console.log("[ChannelStore] Message sent confirmation:", messageId, "status:", status);
      
    });

    // 3. MESSAGE READ STATUS
    socket.on("channel:message_read", ({ messageIds, channelId, readBy, messageStatus, readAt }) => {
      try {
        console.log("[ChannelStore] Messages read:", messageIds.length, "by:", readBy);

        set((state) => {
          const messages = state.messagesByChannel[channelId] || [];
          const updatedMessages = messages.map(msg =>
            messageIds.includes(msg._id)
              ? { ...msg, messageStatus: 'read', readAt: readAt }
              : msg
          );

          return {
            messagesByChannel: {
              ...state.messagesByChannel,
              [channelId]: updatedMessages,
            },
          };
        });

      } catch (err) {
        console.error("[ChannelStore] Error handling channel:message_read:", err);
      }
    });

    // 4. TYPING INDICATORS
    socket.on("channel:user_typing", ({ userId, channelId, isTyping }) => {
      try {
        if (!userId || !channelId) return;

        set((state) => {
          const typingSet = new Set(state.typingUsersByChannel[channelId] || []);

          if (isTyping) {
            typingSet.add(userId);
          } else {
            typingSet.delete(userId);
          }

          return {
            typingUsersByChannel: {
              ...state.typingUsersByChannel,
              [channelId]: typingSet,
            },
          };
        });

        console.log("[ChannelStore] User typing:", userId, "in channel:", channelId, "isTyping:", isTyping);

      } catch (err) {
        console.error("[ChannelStore] Error handling channel:user_typing:", err);
      }
    });

    // 5. REACTION UPDATE
    socket.on("channel:reaction_update", ({ messageId, channelId, reactions, updatedAt }) => {
      try {
        console.log("[ChannelStore] Reaction update for message:", messageId);

        set((state) => {
          const messages = state.messagesByChannel[channelId] || [];
          const updatedMessages = messages.map(msg =>
            msg._id === messageId
              ? { ...msg, reactions: reactions }
              : msg
          );

          return {
            messagesByChannel: {
              ...state.messagesByChannel,
              [channelId]: updatedMessages,
            },
          };
        });

      } catch (err) {
        console.error("[ChannelStore] Error handling channel:reaction_update:", err);
      }
    });

    // 6. MEMBER JOINED
    socket.on("channel:member_joined", ({ channelId, member, timestamp }) => {
      try {
        console.log("[ChannelStore] Member joined:", member?.username, "in channel:", channelId);

        // Update member count in currentChannelDetails if this is current channel
        const { currentChannelId, currentChannelDetails } = get();
        if (currentChannelId === channelId && currentChannelDetails) {
          set({
            currentChannelDetails: {
              ...currentChannelDetails,
              memberCount: (currentChannelDetails.memberCount || 0) + 1,
              channel: {
                ...currentChannelDetails.channel,
                members: [...(currentChannelDetails.channel.members || []), member],
              },
            },
          });
        }

        // Update in channel lists
        set((state) => ({
          myChannels: state.myChannels.map(ch =>
            ch._id === channelId
              ? { ...ch, members: [...(ch.members || []), member], memberCount: (ch.memberCount || 0) + 1 }
              : ch
          ),
          allChannels: state.allChannels.map(ch =>
            ch._id === channelId
              ? { ...ch, members: [...(ch.members || []), member], memberCount: (ch.memberCount || 0) + 1 }
              : ch
          ),
        }));

      } catch (err) {
        console.error("[ChannelStore] Error handling channel:member_joined:", err);
      }
    });

    // 7. MEMBER LEFT
    socket.on("channel:member_left", ({ channelId, userId, timestamp }) => {
      try {
        console.log("[ChannelStore] Member left:", userId, "from channel:", channelId);

        // Update member count
        const { currentChannelId, currentChannelDetails } = get();
        if (currentChannelId === channelId && currentChannelDetails) {
          set({
            currentChannelDetails: {
              ...currentChannelDetails,
              memberCount: Math.max(0, (currentChannelDetails.memberCount || 0) - 1),
              channel: {
                ...currentChannelDetails.channel,
                members: (currentChannelDetails.channel.members || []).filter(
                  m => (m._id || m) !== userId
                ),
              },
            },
          });
        }

        // Update in channel lists
        set((state) => ({
          myChannels: state.myChannels.map(ch =>
            ch._id === channelId
              ? {
                ...ch,
                members: (ch.members || []).filter(m => (m._id || m) !== userId),
                memberCount: Math.max(0, (ch.memberCount || 0) - 1),
              }
              : ch
          ),
          allChannels: state.allChannels.map(ch =>
            ch._id === channelId
              ? {
                ...ch,
                members: (ch.members || []).filter(m => (m._id || m) !== userId),
                memberCount: Math.max(0, (ch.memberCount || 0) - 1),
              }
              : ch
          ),
        }));

      } catch (err) {
        console.error("[ChannelStore] Error handling channel:member_left:", err);
      }
    });

    // 8. NEW PUBLIC CHANNEL CREATED
    socket.on("channel:created", ({ channel, timestamp }) => {
      try {
        if (!channel || !channel._id) return;

        console.log("[ChannelStore] New public channel created:", channel.name);

        // Add to allChannels if not already there
        set((state) => {
          const exists = state.allChannels.some(ch => ch._id === channel._id);
          if (exists) return state;

          return {
            allChannels: [channel, ...state.allChannels],
          };
        });

      } catch (err) {
        console.error("[ChannelStore] Error handling channel:created:", err);
      }
    });

    // 9. CHANNEL UPDATED
    socket.on("channel:updated", ({ channelId, updates, timestamp }) => {
      try {
        console.log("[ChannelStore] Channel updated:", channelId);

        // Update in both lists
        set((state) => ({
          myChannels: state.myChannels.map(ch =>
            ch._id === channelId ? { ...ch, ...updates } : ch
          ),
          allChannels: state.allChannels.map(ch =>
            ch._id === channelId ? { ...ch, ...updates } : ch
          ),
          currentChannelDetails:
            state.currentChannelId === channelId && state.currentChannelDetails
              ? { ...state.currentChannelDetails, channel: { ...state.currentChannelDetails.channel, ...updates } }
              : state.currentChannelDetails,
        }));

      } catch (err) {
        console.error("[ChannelStore] Error handling channel:updated:", err);
      }
    });

    // 10. CHANNEL VISIBILITY CHANGED
    socket.on("channel:visibility_changed", ({ channelId, isPublic, channel }) => {
      try {
        console.log("[ChannelStore] Channel visibility changed:", channelId, "isPublic:", isPublic);

        if (isPublic && channel) {
          // Add to allChannels
          set((state) => {
            const exists = state.allChannels.some(ch => ch._id === channelId);
            if (exists) {
              return {
                allChannels: state.allChannels.map(ch =>
                  ch._id === channelId ? channel : ch
                ),
              };
            } else {
              return {
                allChannels: [channel, ...state.allChannels],
              };
            }
          });
        }

      } catch (err) {
        console.error("[ChannelStore] Error handling channel:visibility_changed:", err);
      }
    });

    // 11. CHANNEL DELETED
    socket.on("channel:deleted", ({ channelId, timestamp }) => {
      try {
        console.log("[ChannelStore] Channel deleted:", channelId);

        // Remove from all lists
        set((state) => ({
          myChannels: state.myChannels.filter(ch => ch._id !== channelId),
          allChannels: state.allChannels.filter(ch => ch._id !== channelId),
        }));

        // If currently open, close it
        const { currentChannelId } = get();
        if (currentChannelId === channelId) {
          get().closeCurrentChannel();
        }

      } catch (err) {
        console.error("[ChannelStore] Error handling channel:deleted:", err);
      }
    });

    // 12. ROOM JOIN/LEAVE ACKNOWLEDGMENTS
    socket.on("channel_joined", ({ channelId, channelName }) => {
      console.log("[ChannelStore] Successfully joined channel room:", channelId, channelName);
    });

    socket.on("channel_left", ({ channelId }) => {
      console.log("[ChannelStore] Successfully left channel room:", channelId);
    });

    // 13. ERROR HANDLERS
    socket.on("channel_error", (err) => {
      console.error("[ChannelStore] Channel error:", err);
      const msg = err?.error || err?.message || "Channel operation failed";
      set({ error: msg });
    });

    socket.on("channel_message_error", (err) => {
      console.error("[ChannelStore] Message error:", err);
      const msg = err?.error || err?.message || "Message operation failed";
      set({ error: msg, sendingMessage: false });
    });

    socket.on("channel_reaction_error", (err) => {
      console.error("[ChannelStore] Reaction error:", err);
      const msg = err?.error || err?.message || "Reaction operation failed";
      set({ error: msg });
    });

    set({ socketInitialized: true });
    console.log("[ChannelStore]  All socket listeners attached");
  },

  // CHANNEL LISTS 

  fetchMyChannels: async () => {
    set({ loadingChannels: true, error: null });
    try {
      const res = await ChannelService.getMyChannels();
      const channels = res?.data || [];

      set({
        myChannels: channels,
        loadingChannels: false,
        error: null,
      });

      console.log("[ChannelStore] My channels fetched:", channels.length);

      // Initialize socket listeners
      get().initChannelSocketListeners();

      return channels;
    } catch (error) {
      console.error("[ChannelStore] Error fetching my channels:", error);
      const msg = error?.message || error?.error || "Failed to fetch channels";
      set({
        loadingChannels: false,
        error: msg,
      });
      return [];
    }
  },

  fetchAllChannels: async () => {
    set({ loadingChannels: true, error: null });
    try {
      const res = await ChannelService.getAllChannels();
      const channels = res?.data || [];

      set({
        allChannels: channels,
        loadingChannels: false,
        error: null,
      });

      console.log("[ChannelStore] All public channels fetched:", channels.length);

      // Initialize socket listeners
      get().initChannelSocketListeners();

      return channels;
    } catch (error) {
      console.error("[ChannelStore] Error fetching all channels:", error);
      const msg = error?.message || error?.error || "Failed to fetch channels";
      set({
        loadingChannels: false,
        error: msg,
      });
      return [];
    }
  },

  //  CREATE CHANNEL 

  createChannel: async (name, description = "", isPrivate = false) => {
    if (!name || !name.trim()) {
      set({ error: "Channel name is required" });
      return null;
    }

    set({ creatingChannel: true, error: null });

    try {
      const res = await ChannelService.createChannel(name.trim(), description, isPrivate);
      const channel = res?.data || null;

      if (!channel) {
        throw new Error("Invalid channel data received");
      }

      // Add to myChannels
      set((state) => ({
        myChannels: [channel, ...state.myChannels],
        creatingChannel: false,
        error: null,
      }));

      console.log("[ChannelStore] Channel created:", channel._id, channel.name);

      // Auto-open the new channel
      await get().openChannel(channel._id);

      return channel;
    } catch (error) {
      console.error("[ChannelStore] Error creating channel:", error);
      const msg = error?.message || error?.error || "Failed to create channel";
      set({
        creatingChannel: false,
        error: msg,
      });
      return null;
    }
  },

  // JOIN CHANNEL

joinChannel: async (channelId) => {
  if (!channelId) {
    console.error("[ChannelStore] joinChannel: No channelId provided");
    return null;
  }

  set({ joiningChannel: true, error: null });

  try {
    // STEP 1: HTTP join (DB membership)
    const res = await ChannelService.joinChannel(channelId);
    const channel = res?.data || null;

    if (!channel) {
      throw new Error("Invalid channel data received");
    }

    const { currentChannelId, currentChannelDetails } = get();

    // STEP 2: Update myChannels, allChannels, and currentChannelDetails (if open)
    set((state) => {
      const alreadyInMy = state.myChannels.some(ch => ch._id === channel._id);

      const newState = {
        myChannels: alreadyInMy
          ? state.myChannels.map(ch =>
              ch._id === channel._id ? channel : ch
            )
          : [channel, ...state.myChannels],

        allChannels: state.allChannels.map(ch =>
          ch._id === channel._id ? channel : ch
        ),

        joiningChannel: false,
        error: null,
      };

      // If this channel is currently open, update details too
      if (currentChannelId === channel._id && currentChannelDetails) {
        newState.currentChannelDetails = {
          ...currentChannelDetails,
          isMember: true,
          memberCount:
            channel.memberCount ??
            channel.members?.length ??
            currentChannelDetails.memberCount,
          channel: {
            ...(currentChannelDetails.channel || {}),
            ...channel,
          },
        };
      }

      return newState;
    });

    console.log("[ChannelStore] Joined channel:", channelId);

    // STEP 3: Join socket room for real-time events
    const socket = getSocket();
    if (socket) {
      socket.emit("channel:join", { channelId });
    }

    return channel;
  } catch (error) {
    console.error("[ChannelStore] Error joining channel:", error);
    const msg = error?.message || error?.error || "Failed to join channel";
    set({
      joiningChannel: false,
      error: msg,
    });
    return null;
  }
},



  // LEAVE CHANNEL 

  leaveChannel: async (channelId) => {
    if (!channelId) {
      console.error("[ChannelStore] leaveChannel: No channelId provided");
      return false;
    }

    set({ leavingChannel: true, error: null });

    try {
      // Step 1: HTTP leave (removes from DB)
      await ChannelService.leaveChannel(channelId);

      // Step 2: Leave socket room
      const socket = getSocket();
      if (socket) {
        socket.emit("channel:leave", { channelId });
      }

      // Step 3: Remove from myChannels
      set((state) => ({
        myChannels: state.myChannels.filter(ch => ch._id !== channelId),
        leavingChannel: false,
        error: null,
      }));

      console.log("[ChannelStore] Left channel:", channelId);

      // Step 4: If currently open, close it
      const { currentChannelId } = get();
      if (currentChannelId === channelId) {
        get().closeCurrentChannel();
      }

      return true;
    } catch (error) {
      console.error("[ChannelStore] Error leaving channel:", error);
      const msg = error?.message || error?.error || "Failed to leave channel";
      set({
        leavingChannel: false,
        error: msg,
      });
      return false;
    }
  },

  // UPDATE CHANNEL 

  updateChannel: async (channelId, updates) => {
    if (!channelId) {
      console.error("[ChannelStore] updateChannel: No channelId provided");
      return null;
    }

    try {
      const res = await ChannelService.updateChannel(channelId, updates);
      const updatedChannel = res?.data || null;

      if (updatedChannel) {
        // Update in store
        set((state) => ({
          myChannels: state.myChannels.map(ch =>
            ch._id === channelId ? updatedChannel : ch
          ),
          allChannels: state.allChannels.map(ch =>
            ch._id === channelId ? updatedChannel : ch
          ),
          currentChannelDetails:
            state.currentChannelId === channelId && state.currentChannelDetails
              ? { ...state.currentChannelDetails, channel: updatedChannel }
              : state.currentChannelDetails,
        }));

        console.log("[ChannelStore] Channel updated:", channelId);
      }

      return updatedChannel;
    } catch (error) {
      console.error("[ChannelStore] Error updating channel:", error);
      const msg = error?.message || error?.error || "Failed to update channel";
      set({ error: msg });
      return null;
    }
  },

  // DELETE CHANNEL

  deleteChannel: async (channelId) => {
    if (!channelId) {
      console.error("[ChannelStore] deleteChannel: No channelId provided");
      return false;
    }

    try {
      await ChannelService.deleteChannel(channelId);

      // Remove from store
      set((state) => ({
        myChannels: state.myChannels.filter(ch => ch._id !== channelId),
        allChannels: state.allChannels.filter(ch => ch._id !== channelId),
      }));

      console.log("[ChannelStore] Channel deleted:", channelId);

      // If currently open, close it
      const { currentChannelId } = get();
      if (currentChannelId === channelId) {
        get().closeCurrentChannel();
      }

      return true;
    } catch (error) {
      console.error("[ChannelStore] Error deleting channel:", error);
      const msg = error?.message || error?.error || "Failed to delete channel";
      set({ error: msg });
      return false;
    }
  },

  //  OPEN / CLOSE CHANNE

openChannel: async (channelId) => {
  if (!channelId) {
    console.error("[ChannelStore] openChannel: No channelId provided");
    return;
  }

  const socket = getSocket();
  const { currentChannelId, messagesByChannel } = get();

  // Ensure socket listeners are attached
  get().initChannelSocketListeners();

  // Leave previous channel room (if any)
  if (socket && currentChannelId && currentChannelId !== channelId) {
    socket.emit("channel:leave", { channelId: currentChannelId });
    console.log("[ChannelStore] Left previous channel room:", currentChannelId);
  }

  set({
    currentChannelId: channelId,
    error: null,
  });

  let details = null;
  try {
    const res = await ChannelService.getChannelDetails(channelId);
    details = res?.data || null;

    set({ currentChannelDetails: details });
    console.log("[ChannelStore] Channel details loaded:", channelId);
  } catch (err) {
    console.error("[ChannelStore] Failed to fetch channel details:", err);
    set({ currentChannelDetails: null });
    return; // Cannot proceed without details
  }

  const isMember = details?.isMember;

  if (socket && isMember) {
    socket.emit("channel:join", { channelId });
    console.log("[ChannelStore] Joining channel room as member:", channelId);
  } else {
    console.log(
      "[ChannelStore] User is not a member of this channel yet. Not joining room or loading messages."
    );
    return; 
  }

  const existing = messagesByChannel[channelId];
  if (!existing || existing.length === 0) {
    await get().fetchChannelMessages(channelId);
  }
},


  closeCurrentChannel: () => {
    const socket = getSocket();
    const { currentChannelId } = get();
    if (socket && currentChannelId) {
      socket.emit("channel:leave", { channelId: currentChannelId });
      console.log("[ChannelStore] Left channel room:", currentChannelId);
    }

    set({
      currentChannelId: null,
      currentChannelDetails: null,
    });

    console.log("[ChannelStore] Current channel closed");
  },

  // MESSAGES 

  fetchChannelMessages: async (channelId, limit = 20) => {
    if (!channelId) {
      console.error("[ChannelStore] fetchChannelMessages: No channelId provided");
      return [];
    }

    set({ loadingMessages: true, error: null });

    try {
      const res = await ChannelService.getChannelMessages(channelId, limit, null);
      const payload = res?.data || {};
      const messages = payload.messages || [];
      const nextCursor = payload.nextCursor || null;
      const hasMore = !!payload.hasMore;

      set((state) => ({
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: messages,
        },
        cursorByChannel: {
          ...state.cursorByChannel,
          [channelId]: nextCursor,
        },
        hasMoreByChannel: {
          ...state.hasMoreByChannel,
          [channelId]: hasMore,
        },
        loadingMessages: false,
        error: null,
      }));

      console.log("[ChannelStore] Messages loaded:", messages.length, "for channel:", channelId);

      return messages;
    } catch (error) {
      console.error("[ChannelStore] Error fetching messages:", error);
      const msg = error?.message || error?.error || "Failed to fetch messages";
      set({
        loadingMessages: false,
        error: msg,
      });
      return [];
    }
  },

  loadOlderMessages: async (channelId, limit = 20) => {
    if (!channelId) {
      console.error("[ChannelStore] loadOlderMessages: No channelId provided");
      return [];
    }

    const { cursorByChannel, hasMoreByChannel, messagesByChannel } = get();
    const cursor = cursorByChannel[channelId];
    const hasMore = hasMoreByChannel[channelId];

    if (!hasMore || !cursor) {
      console.log("[ChannelStore] No more messages to load for channel:", channelId);
      return [];
    }

    set({ loadingMessages: true, error: null });

    try {
      const res = await ChannelService.getChannelMessages(channelId, limit, cursor);
      const payload = res?.data || {};
      const newMessages = payload.messages || [];
      const nextCursor = payload.nextCursor || null;
      const stillHasMore = !!payload.hasMore;

      set((state) => {
        const existing = state.messagesByChannel[channelId] || [];

        // Prepend older messages, avoid duplicates
        const existingIds = new Set(existing.map(m => m._id));
        const merged = [
          ...newMessages.filter(m => !existingIds.has(m._id)),
          ...existing,
        ];

        return {
          messagesByChannel: {
            ...state.messagesByChannel,
            [channelId]: merged,
          },
          cursorByChannel: {
            ...state.cursorByChannel,
            [channelId]: nextCursor,
          },
          hasMoreByChannel: {
            ...state.hasMoreByChannel,
            [channelId]: stillHasMore,
          },
          loadingMessages: false,
          error: null,
        };
      });

      console.log("[ChannelStore] Older messages loaded:", newMessages.length);

      return newMessages;
    } catch (error) {
      console.error("[ChannelStore] Error loading older messages:", error);
      const msg = error?.message || error?.error || "Failed to load messages";
      set({
        loadingMessages: false,
        error: msg,
      });
      return [];
    }
  },

  addMessageToChannel: (channelId, message) => {
    if (!channelId || !message || !message._id) {
      console.error("[ChannelStore] addMessageToChannel: Invalid params");
      return;
    }

    set((state) => {
      const existing = state.messagesByChannel[channelId] || [];
      const alreadyExists = existing.some(m => m._id === message._id);

      if (alreadyExists) {
        console.log("[ChannelStore] Message already exists, skipping:", message._id);
        return state;
      }

      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: [...existing, message],
        },
      };
    });
  },

  // SEND MESSAGE 

  sendMessageInCurrentChannel: (content) => {
    const { currentChannelId, currentChannelDetails } = get();
    if (!currentChannelId) {
      console.error("[ChannelStore] sendMessageInCurrentChannel: No channel selected");
      set({ error: "No channel selected" });
      return;
    }

    const trimmed = content?.trim();
    if (!trimmed) {
      console.error("[ChannelStore] sendMessageInCurrentChannel: Empty content");
      return;
    }

    // Check if user is a member
    const isMember = currentChannelDetails?.isMember;
    if (!isMember) {
      console.error("[ChannelStore] Cannot send message: User is not a member");
      set({ error: "You must join the channel to send messages" });
      return;
    }

    const socket = getSocket();
    if (!socket) {
      console.error("[ChannelStore] Socket not available");
      set({ error: "Connection error. Please refresh." });
      return;
    }

    set({ sendingMessage: true, error: null });

    // Emit via socket
    socket.emit("channel:send_message", {
      channelId: currentChannelId,
      content: trimmed,
      contentType: "text",
    });

    console.log("[ChannelStore] Message sent via socket:", trimmed.substring(0, 30));

    // Reset sending state after a short delay
    setTimeout(() => {
      set({ sendingMessage: false });
    }, 500);
  },

  // TYPING INDICATORS
  startTyping: (channelId) => {
    if (!channelId) return;
    const socket = getSocket();
    if (!socket) return;

    socket.emit("channel:typing_start", { channelId });
    console.log("[ChannelStore] Typing started in channel:", channelId);
  },

  stopTyping: (channelId) => {
    if (!channelId) return;
    const socket = getSocket();
    if (!socket) return;

    socket.emit("channel:typing_stop", { channelId });
    console.log("[ChannelStore] Typing stopped in channel:", channelId);
  },

  // REACTIONS
  addReaction: (messageId, emoji, channelId) => {
    if (!messageId || !emoji || !channelId) {
      console.error("[ChannelStore] addReaction: Missing params");
      return;
    }
    const socket = getSocket();
    if (!socket) {
      console.error("[ChannelStore] Socket not available");
      return;
    }

    socket.emit("channel:add_reaction", {
      messageId,
      emoji,
      channelId,
    });

    console.log(
      "[ChannelStore] Reaction sent:",
      emoji,
      "for message:",
      messageId
    );
  },

  //MESSAGE READ STATUS
  markMessagesAsRead: (messageIds, channelId) => {
    if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
      console.error(
        "[ChannelStore] markMessagesAsRead: Invalid messageIds"
      );
      return;
    }
    if (!channelId) {
      console.error("[ChannelStore] markMessagesAsRead: No channelId");
      return;
    }

    const socket = getSocket();
    if (!socket) return;

    socket.emit("channel:message_read", {
      messageIds,
      channelId,
    });

    console.log(
      "[ChannelStore] Marked",
      messageIds.length,
      "messages as read"
    );
  },

  getCurrentChannelMessages: () => {
    const { currentChannelId, messagesByChannel } = get();
    if (!currentChannelId) return [];
    return messagesByChannel[currentChannelId] || [];
  },

  hasMoreMessagesForCurrentChannel: () => {
    const { currentChannelId, hasMoreByChannel } = get();
    if (!currentChannelId) return false;
    return !!hasMoreByChannel[currentChannelId];
  },

  getTypingUsersForCurrentChannel: () => {
    const { currentChannelId, typingUsersByChannel } = get();
    if (!currentChannelId) return [];
    const typingSet = typingUsersByChannel[currentChannelId];
    return typingSet ? Array.from(typingSet) : [];
  },

  // CLEANUP 
  cleanup: () => {
    const socket = getSocket();
    if (socket) {
      console.log("[ChannelStore] Cleaning up socket listeners");
      socket.off("channel:receive_message");
      socket.off("channel:message_sent");
      socket.off("channel:message_read");
      socket.off("channel:user_typing");
      socket.off("channel:reaction_update");
      socket.off("channel:member_joined");
      socket.off("channel:member_left");
      socket.off("channel:created");
      socket.off("channel:updated");
      socket.off("channel:deleted");
      socket.off("channel:visibility_changed");
      socket.off("channel_joined");
      socket.off("channel_left");
      socket.off("channel_error");
      socket.off("channel_message_error");
      socket.off("channel_reaction_error");
    }

    set({
      myChannels: [],
      allChannels: [],
      currentChannelId: null,
      currentChannelDetails: null,
      messagesByChannel: {},
      cursorByChannel: {},
      hasMoreByChannel: {},
      typingUsersByChannel: {},
      loadingChannels: false,
      loadingMessages: false,
      joiningChannel: false,
      leavingChannel: false,
      creatingChannel: false,
      sendingMessage: false,
      error: null,
      socketInitialized: false,
    });

    console.log("[ChannelStore] Store cleaned up");
  },

}));
