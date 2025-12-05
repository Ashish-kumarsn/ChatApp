import { create } from "zustand";
import { getSocket } from "../services/chat.service";
import axiosInstance from "../services/url.service";

export const useChatStore = create((set, get) => ({
    conversations: [],
    currentConversation: null,
    messages: [],
    loading: false,
    error: null,
     messagesCursor: null,     // next page ke liye cursor
    messagesHasMore: false,
    onlineUsers: new Map(),
    typingUsers: new Map(),
    currentUser: null,
    socketInitialized: false,
    isConnected: false,

    setCurrentUser: (user) => {
        set({ currentUser: user });
        console.log('[Chat] Current user set:', user?._id);
    },

    // SOCKET LISTENERS SETUP
    // SOCKET LISTENERS SETUP
    initsocketListners: () => {
        const socket = getSocket();
        if (!socket) {
            console.warn('[Chat] Cannot initialize socket - socket not available');
            return;
        }

        const { socketInitialized } = get();

        // 🔁 Listeners sirf pehli baar attach karne hain
        if (!socketInitialized) {
            // Purane listeners hata do (safety)
            socket.off("connection_ack");
            socket.off("receive_message");
            socket.off("message_sent");
            socket.off("message_read");
            socket.off("reaction_update");
            socket.off("message_deleted");
            socket.off("message_error");
            socket.off("user_typing");
            socket.off("user_status");

            console.log('[Chat] Attaching socket listeners...');

            // CONNECTION ACKNOWLEDGMENT
            socket.on("connection_ack", ({ success, userId, socketId }) => {
                try {
                    if (success) {
                        console.log('[Chat] Connection acknowledged:', socketId);
                        set({ isConnected: true });
                    }
                } catch (error) {
                    console.error('[Chat] Error handling connection_ack:', error);
                }
            });

            // RECEIVE MESSAGE
            socket.on("receive_message", (message) => {
                try {
                    if (!message || !message._id) {
                        console.error('[Chat] Invalid receive_message data:', message);
                        return;
                    }

                    console.log('[Chat] Message received:', message._id);
                    const { receiveMessage } = get();
                    receiveMessage(message);
                } catch (error) {
                    console.error('[Chat] Error handling receive_message:', error);
                }
            });

            // MESSAGE SENT CONFIRMATION
            socket.on("message_sent", (data = {}) => {
                try {
                    const { messageId, status, timestamp } = data;

                    if (!messageId) {
                        console.error('[Chat] Invalid message_sent data:', data);
                        return;
                    }

                    console.log('[Chat] Message sent confirmed:', messageId);

                    set((state) => ({
                        messages: state.messages.map((msg) =>
                            msg._id === messageId
                                ? {
                                    ...msg,
                                    messageStatus: status || "delivered",
                                    sentAt: timestamp || msg.sentAt,
                                }
                                : msg
                        ),
                    }));
                } catch (error) {
                    console.error('[Chat] Error handling message_sent:', error);
                }
            });

            // MESSAGE STATUS UPDATE (READ)
            socket.on("message_read", (data = {}) => {
                try {
                    const { messageId, messageStatus, readAt } = data;

                    if (!messageId) {
                        console.error('[Chat] Invalid message_read data:', data);
                        return;
                    }

                    console.log('[Chat] Message read update:', messageId, messageStatus);

                    set((state) => ({
                        messages: state.messages.map((msg) =>
                            msg._id === messageId
                                ? {
                                    ...msg,
                                    messageStatus:
                                        messageStatus || msg.messageStatus || "read",
                                    readAt:
                                        readAt ||
                                        msg.readAt ||
                                        new Date().toISOString(),
                                }
                                : msg
                        ),
                    }));
                } catch (error) {
                    console.error('[Chat] Error handling message_read:', error);
                }
            });

            // REACTION UPDATE
            socket.on(
                "reaction_update",
                ({ messageId, reactions, updatedAt } = {}) => {
                    try {
                        if (!messageId) {
                            console.error('[Chat] Invalid reaction_update data');
                            return;
                        }

                        console.log(
                            "[Chat] Reaction update:",
                            messageId,
                            reactions?.length
                        );

                        set((state) => ({
                            messages: state.messages.map((msg) =>
                                msg._id === messageId
                                    ? {
                                        ...msg,
                                        reactions: reactions || msg.reactions || [],
                                        lastReactionAt: updatedAt,
                                    }
                                    : msg
                            ),
                        }));
                    } catch (error) {
                        console.error('[Chat] Error handling reaction_update:', error);
                    }
                }
            );

            // MESSAGE DELETED
            socket.on("message_deleted", (deletedMessageId) => {
                try {
                    if (!deletedMessageId) {
                        console.error('[Chat] Invalid message_deleted data');
                        return;
                    }

                    console.log('[Chat] Message deleted:', deletedMessageId);

                    set((state) => ({
                        messages: state.messages.filter(
                            (msg) => msg._id !== deletedMessageId
                        ),
                    }));
                } catch (error) {
                    console.error('[Chat] Error handling message_deleted:', error);
                }
            });

            // MESSAGE ERROR
            socket.on("message_error", (error) => {
                console.error('[Chat] Message error:', error);

                const errorMessage =
                    error?.error || error?.message || "Message operation failed";

                set({ error: errorMessage });

                if (error?.messageId) {
                    set((state) => ({
                        messages: state.messages.map((msg) =>
                            msg._id === error.messageId
                                ? { ...msg, messageStatus: "failed" }
                                : msg
                        ),
                    }));
                }
            });

            // USER TYPING
            socket.on("user_typing", ({ userId, conversationId, isTyping }) => {
                try {
                    if (!userId || !conversationId) {
                        console.error('[Chat] Invalid user_typing data');
                        return;
                    }

                    set((state) => {
                        const newTypingUsers = new Map(state.typingUsers);

                        if (!newTypingUsers.has(conversationId)) {
                            newTypingUsers.set(conversationId, new Set());
                        }

                        const typingSet = newTypingUsers.get(conversationId);

                        if (isTyping) {
                            typingSet.add(userId);
                        } else {
                            typingSet.delete(userId);
                        }

                        return { typingUsers: newTypingUsers };
                    });
                } catch (error) {
                    console.error('[Chat] Error handling user_typing:', error);
                }
            });

            // USER STATUS (ONLINE/OFFLINE)
            socket.on(
                "user_status",
                ({ userId, isOnline, lastSeen, timestamp }) => {
                    try {
                        if (!userId) {
                            console.error('[Chat] Invalid user_status data');
                            return;
                        }

                        console.log(
                            "[Chat] User status update:",
                            userId,
                            isOnline ? "online" : "offline"
                        );

                        set((state) => {
                            const newOnlineUsers = new Map(state.onlineUsers);
                            newOnlineUsers.set(userId, {
                                isOnline,
                                lastSeen: lastSeen || timestamp,
                            });
                            return { onlineUsers: newOnlineUsers };
                        });
                    } catch (error) {
                        console.error('[Chat] Error handling user_status:', error);
                    }
                }
            );

            set({ socketInitialized: true });
            console.log("[Chat] Socket listeners attached");
        }

        // 👇 Ye part har call pe chalega (status refresh for all participants)
             // 👇 Ye part har call pe chalega (status refresh for all 1:1 participants)
        const { conversations, currentUser, refreshUsersStatus } = get();

        if (conversations?.data?.length > 0 && currentUser?._id) {
            const participantIds = [];

            conversations.data.forEach((conv) => {
                const otherUser = conv.participants?.find(
                    (p) => p._id !== currentUser._id
                );

                if (otherUser?._id) {
                    participantIds.push(otherUser._id);
                }
            });

            if (participantIds.length > 0) {
                refreshUsersStatus(participantIds);
            }
        }
    },



    // FETCH CONVERSATIONS
    fetchConversations: async () => {
        set({ loading: true, error: null });
        try {
            const { data } = await axiosInstance.get("/chat/conversations");

            set({
                conversations: data,
                loading: false,
                error: null,
            });

            // Initialize socket listeners after fetching conversations
            get().initsocketListners();

            console.log('[Chat] Conversations fetched:', data?.data?.length || 0);

            return data;

        } catch (error) {
            console.error('[Chat] Error fetching conversations:', error);
            const errorMessage = error?.response?.data?.message || error?.message || 'Failed to fetch conversations';
            set({
                error: errorMessage,
                loading: false
            });
            return null;
        }
    },

    // FETCH MESSAGES
    fetchMassages: async (conversationId) => {
        if (!conversationId) {
            console.error('[Chat] fetchMassages: No conversationId provided');
            return [];
        }

        set({ loading: true, error: null });

        try {
            const { data } = await axiosInstance.get(
                `/chat/conversations/${conversationId}/messages`
            );

            const messageArray = data.data || data || [];

            set({
                messages: messageArray,
                currentConversation: conversationId,
                loading: false,
                error: null,
            });

            console.log('[Chat] Messages fetched:', messageArray.length);

            // Mark unread messages as read
            const { markMessagesAsRead } = get();
            markMessagesAsRead();

            return messageArray;

        } catch (error) {
            console.error('[Chat] Error fetching messages:', error);
            const errorMessage = error?.response?.data?.message || error?.message || 'Failed to fetch messages';
            set({
                error: errorMessage,
                loading: false
            });
            return [];
        }
    },

    // SEND MESSAGE
    sendMessage: async (formData) => {
        const senderId = formData.get("senderId");
        const receiverId = formData.get("receiverId");
        const media = formData.get("media");
        const content = formData.get("content");
        const messageStatus = formData.get("messageStatus") || "sent";

        // Validation
        if (!senderId || !receiverId) {
            console.error('[Chat] sendMessage: Missing sender or receiver ID');
            set({ error: 'Sender and receiver are required' });
            return;
        }

        if (!content?.trim() && !media) {
            console.error('[Chat] sendMessage: No content or media');
            set({ error: 'Message must have content or media' });
            return;
        }

        const socket = getSocket();
        const { conversations } = get();
        let conversationId = get().currentConversation || null;

        // Find or use current conversation
        if (!conversationId && conversations?.data?.length > 0) {
            const conversation = conversations.data.find((conv) =>
                conv.participants?.some((p) => p._id === senderId) &&
                conv.participants?.some((p) => p._id === receiverId)
            );

            if (conversation) {
                conversationId = conversation._id;
                set({ currentConversation: conversationId });
            }
        }

        // Create optimistic message
        const tempId = `temp-${Date.now()}-${Math.random()}`;
        const optimisticMessage = {
            _id: tempId,
            sender: { _id: senderId },
            receiver: { _id: receiverId },
            conversation: conversationId,
            imageOrVideoUrl:
                media && typeof media !== "string" ? URL.createObjectURL(media) : null,
            content: content?.trim() || '',
            contentType: media
                ? media.type.startsWith("image")
                    ? "image"
                    : "video"
                : "text",
            createdAt: new Date().toISOString(),
            messageStatus: "sending",
            reactions: [],
        };

        // Add optimistic message
        set((state) => ({
            messages: [...state.messages, optimisticMessage],
        }));

        try {
            console.log('[Chat] Sending message...');

            const { data } = await axiosInstance.post(
                "/chat/send-message",
                formData,
                { headers: { "Content-Type": "multipart/form-data" } }
            );

            const messageData = data.data || data;

            if (!messageData?._id) {
                throw new Error('Invalid message data received from server');
            }

            // Replace optimistic message with real one
            set((state) => ({
                messages: state.messages.map((msg) =>
                    msg._id === tempId ? messageData : msg
                ),
            }));

            // 🚀 Emit to socket so receiver gets real-time message
            if (socket) {
                socket.emit("send_message", messageData);
                console.log('[Chat] Emitted send_message via socket:', messageData._id);
            }

            console.log('[Chat] Message sent successfully:', messageData._id);

            return messageData;


        } catch (error) {
            console.error('[Chat] Error sending message:', error);

            const errorMessage = error?.response?.data?.message || error?.message || 'Failed to send message';

            // Mark message as failed
            set((state) => ({
                messages: state.messages.map((msg) =>
                    msg._id === tempId
                        ? { ...msg, messageStatus: "failed" }
                        : msg
                ),
                error: errorMessage,
            }));

            throw error;
        }
    },

    // RECEIVE MESSAGE
    receiveMessage: (message) => {
        if (!message || !message._id) {
            console.error('[Chat] receiveMessage: Invalid message');
            return;
        }

        const { currentConversation, currentUser } = get();

        // 1) Messages list update
        set((state) => {
            const alreadyExists = state.messages.some((msg) => msg._id === message._id);
            const updates = {};

            // Agar current open conversation ka message hai aur duplicate nahi
            if (message.conversation === currentConversation && !alreadyExists) {
                updates.messages = [...state.messages, message];
            }

            // 2) Conversations list update (lastMessage + unreadCount)
            const convData = state.conversations?.data || [];
            const updatedConversations = convData.map((conv) => {
                if (conv._id === message.conversation) {
                    const isReceiver = message.receiver?._id === currentUser?._id;
                    const isInCurrentConv = message.conversation === currentConversation;

                    return {
                        ...conv,
                        lastMessage: message,
                        unreadCount: isReceiver && !isInCurrentConv
                            ? (conv.unreadCount || 0) + 1
                            : conv.unreadCount || 0,
                    };
                }
                return conv;
            });

            updates.conversations = {
                ...state.conversations,
                data: updatedConversations,
            };

            return updates;
        });

        // 3) Auto mark as read agar yeh message current user ke liye hai & current convo open hai
        if (
            message.conversation === currentConversation &&
            message.receiver?._id === currentUser?._id
        ) {
            get().markMessagesAsRead();
        }
    },


    // MARK MESSAGES AS READ
    markMessagesAsRead: async () => {
        const { messages, currentUser } = get();

        if (!messages.length || !currentUser?._id) {
            return;
        }

        // Find unread messages received by current user
        const unreadIds = messages
            .filter((msg) =>
                msg.messageStatus !== 'read' &&
                msg.receiver?._id === currentUser._id
            )
            .map((msg) => msg._id)
            .filter(Boolean);

        if (unreadIds.length === 0) {
            return;
        }

        try {
            console.log('[Chat] Marking messages as read:', unreadIds.length);

            await axiosInstance.put("/chat/messages/read", {
                messageIds: unreadIds
            });

            // Update local state
            set((state) => ({
                messages: state.messages.map((msg) =>
                    unreadIds.includes(msg._id)
                        ? { ...msg, messageStatus: "read", readAt: new Date() }
                        : msg
                ),
            }));

            // Emit to socket
            const socket = getSocket();

            // Pehla unread message jisme receiver current user hai
            const firstUnread = messages.find(
                (msg) =>
                    msg.messageStatus !== 'read' &&
                    msg.receiver?._id === currentUser._id
            );

            if (socket && firstUnread?.sender?._id) {
                socket.emit("message_read", {
                    messageIds: unreadIds,
                    senderId: firstUnread.sender._id,
                });
            }


        } catch (error) {
            console.error('[Chat] Failed to mark messages as read:', error);
        }
    },

    // DELETE MESSAGE
    deleteMessage: async (messageId) => {
        if (!messageId) {
            console.error('[Chat] deleteMessage: No messageId provided');
            return false;
        }

        try {
            console.log('[Chat] Deleting message:', messageId);

            await axiosInstance.delete(`/chat/messages/${messageId}`);

            set((state) => ({
                messages: state.messages.filter((msg) => msg._id !== messageId),
            }));

            return true;

        } catch (error) {
            console.error('[Chat] Error deleting message:', error);
            const errorMessage = error?.response?.data?.message || error?.message;
            set({ error: errorMessage });
            return false;
        }
    },

    // ADD/TOGGLE REACTION
    addReaction: async (messageId, emoji) => {
        if (!messageId || !emoji) {
            console.error('[Chat] addReaction: Missing messageId or emoji');
            return;
        }

        const socket = getSocket();
        const { currentUser } = get();

        if (!socket || !currentUser?._id) {
            console.error('[Chat] addReaction: Socket or user not available');
            return;
        }

        console.log('[Chat] Adding reaction:', emoji, 'to message:', messageId);

        socket.emit("add_reaction", {
            messageId,
            emoji,
            userId: currentUser._id,
        });
    },

    // TYPING INDICATORS
    startTyping: (receiverId) => {
        const { currentConversation } = get();
        const socket = getSocket();

        if (!socket || !currentConversation || !receiverId) {
            return;
        }

        socket.emit("typing_start", {
            conversationId: currentConversation,
            receiverId,
        });
    },

    stopTyping: (receiverId) => {
        const { currentConversation } = get();
        const socket = getSocket();

        if (!socket || !currentConversation || !receiverId) {
            return;
        }

        socket.emit("typing_stop", {
            conversationId: currentConversation,
            receiverId,
        });
    },

    isUserTyping: (userId) => {
        const { typingUsers, currentConversation } = get();

        if (!currentConversation || !typingUsers.has(currentConversation) || !userId) {
            return false;
        }

        return typingUsers.get(currentConversation)?.has(userId) || false;
    },

        // BULK USER STATUS REFRESH (DM + channels ke members ke liye)
    refreshUsersStatus: (userIds = []) => {
        const socket = getSocket();
        if (!socket || !Array.isArray(userIds) || userIds.length === 0) {
            return;
        }

        // unique + valid ids
        const uniqueIds = [...new Set(userIds.filter(Boolean))];

        uniqueIds.forEach((id) => {
            socket.emit("get_user_status", id, (status) => {
                if (status && !status.error) {
                    set((state) => {
                        const newOnlineUsers = new Map(state.onlineUsers);
                        newOnlineUsers.set(id, {
                            isOnline: status.isOnline,
                            lastSeen: status.lastSeen,
                        });
                        return { onlineUsers: newOnlineUsers };
                    });
                }
            });
        });
    },

    // ONLINE STATUS
    isUserOnline: (userId) => {
        if (!userId) return false;
        const { onlineUsers } = get();
        return onlineUsers.get(userId)?.isOnline || false;
    },

    getUserLastSeen: (userId) => {
        if (!userId) return null;
        const { onlineUsers } = get();
        return onlineUsers.get(userId)?.lastSeen || null;
    },




    cleanup: () => {
        const socket = getSocket();

        if (socket) {
            console.log('[Chat] Cleaning up socket listeners');
            socket.off("connection_ack");
            socket.off("receive_message");
            socket.off("message_sent");
            socket.off("message_read");
            socket.off("reaction_update");
            socket.off("message_deleted");
            socket.off("message_error");
            socket.off("user_typing");
            socket.off("user_status");
        }

        set({
            conversations: [],
            currentConversation: null,
            messages: [],
            onlineUsers: new Map(),
            typingUsers: new Map(),
            socketInitialized: false,
            isConnected: false,
            loading: false,
            error: null,
        });

        console.log('[Chat] Store cleaned up');
    },
}));