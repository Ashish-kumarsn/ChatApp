const { Server } = require('socket.io');
const User = require('../models/User');
const Message = require('../models/Message');
const handleVideoCallEvent = require('./video-call-events');
const socketMiddleware = require('../middleware/socketMiddleware');


const handleChannelEvents = require('./channel-events'); // 👈 NEW



const onlineUsers = new Map();

const typingUsers = new Map();
// CONFIGURATION CONSTANTS

const SOCKET_CONFIG = {
    PING_TIMEOUT: 60000,
    PING_INTERVAL: 25000,
    TYPING_TIMEOUT: 3000,
    MAX_RECONNECTION_ATTEMPTS: 5,
    RECONNECTION_DELAY: 1000,
};


const getUserSockets = (userId) => {
    if (!userId) return [];
    return onlineUsers.get(userId.toString()) || [];
};


const isUserOnline = (userId) => {
    if (!userId) return false;
    const sockets = getUserSockets(userId);
    return sockets.length > 0;
};


const addUserSocket = (userId, socketId) => {
    if (!userId || !socketId) return;

    const userIdStr = userId.toString();
    if (!onlineUsers.has(userIdStr)) {
        onlineUsers.set(userIdStr, []);
    }

    const userSockets = onlineUsers.get(userIdStr);
    if (!userSockets.includes(socketId)) {
        userSockets.push(socketId);
    }
};


const removeUserSocket = (userId, socketId) => {
    if (!userId || !socketId) return false;

    const userIdStr = userId.toString();
    const userSockets = onlineUsers.get(userIdStr);

    if (!userSockets) return false;

    const index = userSockets.indexOf(socketId);
    if (index > -1) {
        userSockets.splice(index, 1);
    }

    // Clean up if no more sockets
    if (userSockets.length === 0) {
        onlineUsers.delete(userIdStr);
        return true; // Indicate user is now completely offline
    }

    return false;
};


const emitToUser = (io, userId, eventName, data) => {
    if (!userId) return;

    const sockets = getUserSockets(userId);
    sockets.forEach(socketId => {
        io.to(socketId).emit(eventName, data);
    });
};


const clearTypingTimeout = (userId, conversationId) => {
    if (!userId || !conversationId) return;

    const userTyping = typingUsers.get(userId.toString());
    if (userTyping) {
        const timeoutKey = `${conversationId}_timeout`;
        if (userTyping[timeoutKey]) {
            clearTimeout(userTyping[timeoutKey]);
            delete userTyping[timeoutKey];
        }
    }
};


const cleanupUserTyping = (userId) => {
    if (!userId) return;

    const userIdStr = userId.toString();
    const userTyping = typingUsers.get(userIdStr);

    if (userTyping) {
        // Clear all timeouts
        Object.keys(userTyping).forEach(key => {
            if (key.endsWith('_timeout')) {
                clearTimeout(userTyping[key]);
            }
        });
        typingUsers.delete(userIdStr);
    }
};

// SOCKET INITIALIZATION

const initializeSocket = (server) => {
    const io = new Server(server, {
        cors: {
            origin: process.env.FRONTEND_URL,
            credentials: true,

            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        },
        pingTimeout: SOCKET_CONFIG.PING_TIMEOUT,
        pingInterval: SOCKET_CONFIG.PING_INTERVAL,
        transports: ['websocket', 'polling'],
    });


    //middleware
    io.use(socketMiddleware);
    // CONNECTION HANDLER

    io.on('connection', (socket) => {
        console.log(`[Socket] New connection: ${socket.id}`);
        let userId = null;

        // USER CONNECTION

        socket.on('user_connected', async (connectingUserId) => {
            try {
                if (!connectingUserId) {
                    console.error('[Socket] user_connected: No userId provided');
                    return;
                }

                userId = connectingUserId.toString();
                socket.userId = userId;

                // Check if this is the first connection for this user
                const wasOffline = !isUserOnline(userId);

                // Add socket to user's connection list
                addUserSocket(userId, socket.id);
                socket.join(userId);

                console.log(`[Socket] User ${userId} connected (${getUserSockets(userId).length} active tabs)`);

                // Update DB only on first connection
                if (wasOffline) {
                    await User.findByIdAndUpdate(userId, {
                        isOnline: true,
                        lastSeen: new Date(),
                    }).catch(err => {
                        console.error('[Socket] Error updating user status:', err);
                    });

                    // Broadcast user online status
                    io.emit('user_status', {
                        userId,
                        isOnline: true,
                        timestamp: new Date(),
                    });
                }

                // Send acknowledgment to the connected client
                socket.emit('connection_ack', {
                    success: true,
                    userId,
                    socketId: socket.id,
                });

            } catch (error) {
                console.error('[Socket] Error in user_connected:', error);
                socket.emit('connection_error', {
                    error: 'Failed to establish connection'
                });
            }
        });

        // GET USER STATUS

        socket.on('get_user_status', (requestedUserId, callback) => {
            try {
                if (!requestedUserId) {
                    if (callback) callback({ error: 'User ID required' });
                    return;
                }

                const isOnline = isUserOnline(requestedUserId);

                if (callback) {
                    callback({
                        userId: requestedUserId,
                        isOnline,
                        lastSeen: isOnline ? new Date() : null,
                        activeConnections: getUserSockets(requestedUserId).length,
                    });
                }
            } catch (error) {
                console.error('[Socket] Error in get_user_status:', error);
                if (callback) callback({ error: 'Failed to get status' });
            }
        });

        // SEND MESSAGE

        socket.on('send_message', async (message) => {
            try {
                if (!message || !message.receiver?._id) {
                    console.error('[Socket] send_message: Invalid message data');
                    socket.emit('message_error', { error: 'Invalid message data' });
                    return;
                }

                const receiverId = message.receiver._id.toString();

                // Send to all receiver's active sockets
                emitToUser(io, receiverId, 'receive_message', message);

                // Send delivery confirmation to sender
                socket.emit('message_sent', {
                    messageId: message._id,
                    status: 'delivered',
                    timestamp: new Date(),
                });

            } catch (error) {
                console.error('[Socket] Error in send_message:', error);
                socket.emit('message_error', {
                    error: 'Failed to send message',
                    messageId: message?._id,
                });
            }
        });

        // MESSAGE READ STATUS

        socket.on('message_read', async ({ messageIds, senderId }) => {
            try {
                if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
                    console.error('[Socket] message_read: Invalid messageIds');
                    return;
                }

                if (!senderId) {
                    console.error('[Socket] message_read: No senderId provided');
                    return;
                }

                // Update messages in database
                const result = await Message.updateMany(
                    {
                        _id: { $in: messageIds },
                        messageStatus: { $ne: 'read' } // Only update if not already read
                    },
                    { $set: { messageStatus: 'read', readAt: new Date() } }
                ).catch(err => {
                    console.error('[Socket] Error updating message status:', err);
                    return null;
                });

                if (result) {
                    // Notify sender on all their devices
                    messageIds.forEach(messageId => {
                        emitToUser(io, senderId, 'message_read', {
                            messageId,
                            messageStatus: 'read',
                            readAt: new Date(),
                        });
                    });
                }

            } catch (error) {
                console.error('[Socket] Error in message_read:', error);
            }
        });

        // TYPING INDICATORS

        socket.on('typing_start', ({ conversationId, receiverId }) => {
            try {
                if (!userId || !conversationId || !receiverId) {
                    console.error('[Socket] typing_start: Missing required fields');
                    return;
                }

                const userIdStr = userId.toString();

                // Initialize typing map for user if not exists
                if (!typingUsers.has(userIdStr)) {
                    typingUsers.set(userIdStr, {});
                }

                const userTyping = typingUsers.get(userIdStr);

                // Clear existing timeout
                clearTypingTimeout(userId, conversationId);

                // Set typing status
                userTyping[conversationId] = true;

                // Set auto-stop timeout
                userTyping[`${conversationId}_timeout`] = setTimeout(() => {
                    userTyping[conversationId] = false;
                    emitToUser(io, receiverId, 'user_typing', {
                        userId,
                        conversationId,
                        isTyping: false,
                    });
                }, SOCKET_CONFIG.TYPING_TIMEOUT);

                // Notify receiver
                emitToUser(io, receiverId, 'user_typing', {
                    userId,
                    conversationId,
                    isTyping: true,
                });

            } catch (error) {
                console.error('[Socket] Error in typing_start:', error);
            }
        });

        socket.on('typing_stop', ({ conversationId, receiverId }) => {
            try {
                if (!userId || !conversationId || !receiverId) return;

                clearTypingTimeout(userId, conversationId);

                const userTyping = typingUsers.get(userId.toString());
                if (userTyping) {
                    userTyping[conversationId] = false;
                }

                // Notify receiver
                emitToUser(io, receiverId, 'user_typing', {
                    userId,
                    conversationId,
                    isTyping: false,
                });

            } catch (error) {
                console.error('[Socket] Error in typing_stop:', error);
            }
        });

        // REACTIONS

        socket.on('add_reaction', async ({ messageId, emoji, userId: reactionUserId }) => {
            try {
                if (!messageId || !emoji || !reactionUserId) {
                    console.error('[Socket] add_reaction: Missing required fields');
                    return;
                }

                const message = await Message.findById(messageId);
                if (!message) {
                    console.error('[Socket] add_reaction: Message not found');
                    socket.emit('reaction_error', { error: 'Message not found' });
                    return;
                }

                const reactionUserIdStr = reactionUserId.toString();

                const reactions = Array.isArray(message.reactions) ? message.reactions : [];

                // Check if user already reacted
                const existingIndex = message.reactions.findIndex(
                    r => r.user.toString() === reactionUserIdStr
                );

                if (existingIndex > -1) {
                    const existing = message.reactions[existingIndex];
                    if (existing.emoji === emoji) {
                        // Remove reaction (toggle off)
                        message.reactions.splice(existingIndex, 1);
                    } else {
                        // Update reaction
                        message.reactions[existingIndex].emoji = emoji;
                        message.reactions[existingIndex].createdAt = new Date();
                    }
                } else {
                    // Add new reaction
                    message.reactions.push({
                        user: reactionUserId,
                        emoji,
                        createdAt: new Date(),
                    });
                }

                await message.save();

                // Get populated message
                const populatedMessage = await Message.findById(message._id)
                    .populate('sender', 'username profilePicture')
                    .populate('receiver', 'username profilePicture')
                    .populate('reactions.user', 'username profilePicture');

                const reactionUpdate = {
                    messageId,
                    reactions: populatedMessage.reactions,
                    updatedAt: new Date(),
                };

                // Notify both sender and receiver on all their devices
                const senderId = populatedMessage.sender._id.toString();
                const receiverId = populatedMessage.receiver._id.toString();

                emitToUser(io, senderId, 'reaction_update', reactionUpdate);
                emitToUser(io, receiverId, 'reaction_update', reactionUpdate);

            } catch (error) {
                console.error('[Socket] Error in add_reaction:', error);
                socket.emit('reaction_error', {
                    error: 'Failed to add reaction',
                    messageId,
                });
            }
        });

        handleChannelEvents(socket, io);


        // VIDEO CALL EVENTS

        handleVideoCallEvent(socket, io, onlineUsers);

        // DISCONNECTION HANDLER

        const handleDisconnection = async () => {
            if (!userId) {
                console.log(`[Socket] Disconnected: ${socket.id} (no userId)`);
                return;
            }

            try {
                console.log(`[Socket] User ${userId} disconnecting socket ${socket.id}`);

                // Remove this socket from user's connections
                const isCompletelyOffline = removeUserSocket(userId, socket.id);

                // Only update DB and broadcast if user has no more connections
                if (isCompletelyOffline) {
                    console.log(`[Socket] User ${userId} is now completely offline`);

                    // Clean up typing data
                    cleanupUserTyping(userId);

                    // Update user status in database
                    await User.findByIdAndUpdate(userId, {
                        isOnline: false,
                        lastSeen: new Date(),
                    }).catch(err => {
                        console.error('[Socket] Error updating user offline status:', err);
                    });

                    // Broadcast offline status
                    io.emit('user_status', {
                        userId,
                        isOnline: false,
                        lastSeen: new Date(),
                    });
                } else {
                    console.log(`[Socket] User ${userId} still has ${getUserSockets(userId).length} active connections`);
                }

                socket.leave(userId);

            } catch (error) {
                console.error('[Socket] Error in handleDisconnection:', error);
            }
        };

        socket.on('disconnect', handleDisconnection);
        socket.on('error', (error) => {
            console.error(`[Socket] Socket error for ${socket.id}:`, error);
        });
    });

    // ATTACH MAPS TO IO INSTANCE

    io.socketUserMap = onlineUsers;
    io.typingUsers = typingUsers;

    // Helper methods attached to io
    io.getUserSockets = getUserSockets;
    io.isUserOnline = isUserOnline;
    io.emitToUser = (userId, event, data) => emitToUser(io, userId, event, data);

    console.log('[Socket] Socket.IO initialized successfully');

    return io;
};

// CLEANUP ON PROCESS EXIT

process.on('SIGTERM', () => {
    console.log('[Socket] Cleaning up socket connections...');
    onlineUsers.clear();
    typingUsers.clear();
});

module.exports = initializeSocket;