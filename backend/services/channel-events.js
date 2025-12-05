// services/channel-events.js
const Channel = require('../models/Channel');
const ChannelMessage = require('../models/ChannelMessage');

const channelTypingUsers = new Map(); // Structure: { channelId: { userId: timeout } }

const TYPING_TIMEOUT = 3000;

const handleChannelEvents = (socket, io) => {

  // 1. JOIN CHANNEL ROOM (Real-time room join)
  socket.on('channel:join', async ({ channelId }) => {
    try {
      if (!channelId) {
        console.error('[Socket][Channel] channel:join: No channelId provided');
        socket.emit('channel_error', {
          error: 'Channel ID is required',
        });
        return;
      }

      if (!socket.userId) {
        console.error('[Socket][Channel] channel:join: No userId on socket');
        socket.emit('channel_error', {
          error: 'Not authenticated',
        });
        return;
      }

      const channel = await Channel.findById(channelId).select('members name');
      if (!channel) {
        console.error('[Socket][Channel] channel:join: Channel not found');
        socket.emit('channel_error', {
          error: 'Channel not found',
        });
        return;
      }

      const isMember = channel.members.some(
        (m) => String(m) === String(socket.userId)
      );

      if (!isMember) {
        console.error(
          '[Socket][Channel] channel:join: User is not a member of this channel'
        );
        socket.emit('channel_error', {
          error: 'You are not a member of this channel',
        });
        return;
      }

      socket.join(channelId.toString());
      console.log(
        `[Socket][Channel] User ${socket.userId} joined channel room ${channelId}`
      );

      socket.emit('channel_joined', {
        channelId: channelId.toString(),
        channelName: channel.name,
      });
    } catch (error) {
      console.error('[Socket][Channel] Error in channel:join:', error);
      socket.emit('channel_error', {
        error: 'Failed to join channel',
      });
    }
  });

  // 2. LEAVE CHANNEL ROOM
  socket.on('channel:leave', ({ channelId }) => {
    try {
      if (!channelId) {
        console.error('[Socket][Channel] channel:leave: No channelId provided');
        return;
      }

      const channelIdStr = channelId.toString();
      const userIdStr = socket.userId?.toString();

      // Leave socket room
      socket.leave(channelIdStr);

      // Clean up typing state
      const channelTyping = channelTypingUsers.get(channelIdStr);
      if (channelTyping && userIdStr && channelTyping.has(userIdStr)) {
        clearTimeout(channelTyping.get(userIdStr));
        channelTyping.delete(userIdStr);

        // If channel has no more typing users, remove the channel entry
        if (channelTyping.size === 0) {
          channelTypingUsers.delete(channelIdStr);
        }
      }

      console.log(
        `[Socket][Channel] User ${socket.userId} left channel room ${channelId}`
      );

      socket.emit('channel_left', {
        channelId: channelIdStr,
      });
    } catch (error) {
      console.error('[Socket][Channel] Error in channel:leave:', error);
    }
  });

  // 3. SEND MESSAGE TO CHANNEL
  socket.on('channel:send_message', async (messageData) => {
    try {
      if (!messageData || !messageData.channelId || !messageData.content) {
        console.error('[Socket][Channel] send_message: Invalid message data');
        socket.emit('channel_message_error', { error: 'Invalid message data' });
        return;
      }

      const channelId = messageData.channelId.toString();
      const userId = socket.userId;

      // Verify user is member of channel
      const channel = await Channel.findById(channelId).select('members');
      if (!channel) {
        socket.emit('channel_message_error', { error: 'Channel not found' });
        return;
      }

      const isMember = channel.members.some(
        (m) => String(m) === String(userId)
      );

      if (!isMember) {
        socket.emit('channel_message_error', {
          error: 'You are not a member of this channel'
        });
        return;
      }

      const ChannelMessage = require('../models/ChannelMessage');

      // Save message to database
      const message = new ChannelMessage({
        channel: channelId,
        sender: userId,
        content: messageData.content.trim(),
        contentType: messageData.contentType || 'text',
        imageOrVideoUrl: messageData.imageOrVideoUrl || null,
        messageStatus: 'sent',
      });

      await message.save();

      // Update channel lastMessage
      channel.lastMessage = message._id;
      await channel.save();

      // Populate sender info
      const populatedMessage = await ChannelMessage.findById(message._id)
        .populate('sender', 'username profilePicture');

      // Broadcast to all channel members (including sender)
      io.to(channelId).emit('channel:receive_message', populatedMessage);

      // Send confirmation to sender
      socket.emit('channel:message_sent', {
        messageId: message._id,
        channelId: channelId,
        status: 'delivered',
        timestamp: new Date(),
      });

      console.log(`[Socket][Channel] Message saved & sent to channel ${channelId}`);

    } catch (error) {
      console.error('[Socket][Channel] Error in send_message:', error);
      socket.emit('channel_message_error', {
        error: 'Failed to send message',
      });
    }
  });
  // 4. MESSAGE READ STATUS 
  socket.on('channel:message_read', async ({ messageIds, channelId }) => {
    try {
      if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
        console.error('[Socket][Channel] message_read: Invalid messageIds');
        return;
      }

      if (!channelId) {
        console.error('[Socket][Channel] message_read: No channelId provided');
        return;
      }

      // Update messages in database
      const result = await ChannelMessage.updateMany(
        {
          _id: { $in: messageIds },
          channel: channelId,
          messageStatus: { $ne: 'read' }
        },
        { $set: { messageStatus: 'read', readAt: new Date() } }
      ).catch(err => {
        console.error('[Socket][Channel] Error updating message status:', err);
        return null;
      });

      if (result) {
        // Broadcast read status to all channel members
        io.to(channelId.toString()).emit('channel:message_read', {
          messageIds,
          channelId,
          readBy: socket.userId,
          messageStatus: 'read',
          readAt: new Date(),
        });
      }

    } catch (error) {
      console.error('[Socket][Channel] Error in message_read:', error);
    }
  });

  // 5. TYPING INDICATORS 
  socket.on('channel:typing_start', ({ channelId }) => {
    try {
      if (!socket.userId || !channelId) {
        console.error('[Socket][Channel] typing_start: Missing required fields');
        return;
      }

      const channelIdStr = channelId.toString();
      const userIdStr = socket.userId.toString();

      // Initialize channel typing map if not exists
      if (!channelTypingUsers.has(channelIdStr)) {
        channelTypingUsers.set(channelIdStr, new Map());
      }

      const channelTyping = channelTypingUsers.get(channelIdStr);

      // Clear existing timeout
      if (channelTyping.has(userIdStr)) {
        clearTimeout(channelTyping.get(userIdStr));
      }

      // Set auto-stop timeout
      const timeout = setTimeout(() => {
        channelTyping.delete(userIdStr);

        // Broadcast to all channel members except sender
        socket.to(channelIdStr).emit('channel:user_typing', {
          userId: socket.userId,
          channelId: channelIdStr,
          isTyping: false,
        });
      }, TYPING_TIMEOUT);

      channelTyping.set(userIdStr, timeout);

      // Broadcast to all channel members except sender
      socket.to(channelIdStr).emit('channel:user_typing', {
        userId: socket.userId,
        channelId: channelIdStr,
        isTyping: true,
      });

      console.log(`[Socket][Channel] User ${socket.userId} started typing in channel ${channelId}`);

    } catch (error) {
      console.error('[Socket][Channel] Error in typing_start:', error);
    }
  });

  socket.on('channel:typing_stop', ({ channelId }) => {
    try {
      if (!socket.userId || !channelId) return;

      const channelIdStr = channelId.toString();
      const userIdStr = socket.userId.toString();

      const channelTyping = channelTypingUsers.get(channelIdStr);

      if (channelTyping && channelTyping.has(userIdStr)) {
        clearTimeout(channelTyping.get(userIdStr));
        channelTyping.delete(userIdStr);
      }

      // Broadcast to all channel members except sender
      socket.to(channelIdStr).emit('channel:user_typing', {
        userId: socket.userId,
        channelId: channelIdStr,
        isTyping: false,
      });

      console.log(`[Socket][Channel] User ${socket.userId} stopped typing in channel ${channelId}`);

    } catch (error) {
      console.error('[Socket][Channel] Error in typing_stop:', error);
    }
  });

  // 6. ADD REACTION TO CHANNEL MESSAGE
  socket.on('channel:add_reaction', async ({ messageId, emoji, channelId }) => {
    try {
      if (!messageId || !emoji || !channelId || !socket.userId) {
        console.error('[Socket][Channel] add_reaction: Missing required fields');
        socket.emit('channel_reaction_error', { error: 'Missing required fields' });
        return;
      }

      const message = await ChannelMessage.findById(messageId);
      if (!message) {
        console.error('[Socket][Channel] add_reaction: Message not found');
        socket.emit('channel_reaction_error', { error: 'Message not found' });
        return;
      }

      const userIdStr = socket.userId.toString();

      // Check if user already reacted
      const existingIndex = message.reactions.findIndex(
        r => r.user.toString() === userIdStr
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
          user: socket.userId,
          emoji,
          createdAt: new Date(),
        });
      }

      await message.save();

      // Get populated message
      const populatedMessage = await ChannelMessage.findById(message._id)
        .populate('sender', 'username profilePicture')
        .populate('reactions.user', 'username profilePicture');

      const reactionUpdate = {
        messageId,
        channelId: channelId.toString(),
        reactions: populatedMessage.reactions,
        updatedAt: new Date(),
      };

      // Broadcast to all channel members
      io.to(channelId.toString()).emit('channel:reaction_update', reactionUpdate);

      console.log(`[Socket][Channel] Reaction updated on message ${messageId} in channel ${channelId}`);

    } catch (error) {
      console.error('[Socket][Channel] Error in add_reaction:', error);
      socket.emit('channel_reaction_error', {
        error: 'Failed to add reaction',
        messageId,
      });
    }
  });

  // 7. MEMBER JOINED CHANNEL 
  socket.on('channel:member_joined', async ({ channelId, userId, username, profilePicture }) => {
    try {
      if (!channelId || !userId) {
        console.error('[Socket][Channel] member_joined: Missing required fields');
        return;
      }

      const channelIdStr = channelId.toString();

      // Broadcast to all channel members
      io.to(channelIdStr).emit('channel:member_joined', {
        channelId: channelIdStr,
        member: {
          _id: userId,
          username,
          profilePicture,
        },
        timestamp: new Date(),
      });

      console.log(`[Socket][Channel] User ${userId} joined channel ${channelId}`);

    } catch (error) {
      console.error('[Socket][Channel] Error in member_joined:', error);
    }
  });

  // 8. MEMBER LEFT CHANNEL 
  socket.on('channel:member_left', async ({ channelId, userId }) => {
    try {
      if (!channelId || !userId) {
        console.error('[Socket][Channel] member_left: Missing required fields');
        return;
      }

      const channelIdStr = channelId.toString();

      // Broadcast to all channel members
      io.to(channelIdStr).emit('channel:member_left', {
        channelId: channelIdStr,
        userId,
        timestamp: new Date(),
      });

      console.log(`[Socket][Channel] User ${userId} left channel ${channelId}`);

    } catch (error) {
      console.error('[Socket][Channel] Error in member_left:', error);
    }
  });

  // 9. CHANNEL CREATED 
  socket.on('channel:created', async (channelData) => {
    try {
      if (!channelData || !channelData._id) {
        console.error('[Socket][Channel] created: Invalid channel data');
        return;
      }

      // If public channel, broadcast to all connected users
      if (channelData.isPublic) {
        io.emit('channel:created', {
          channel: channelData,
          timestamp: new Date(),
        });
        console.log(`[Socket][Channel] Public channel ${channelData._id} created and broadcasted`);
      }

    } catch (error) {
      console.error('[Socket][Channel] Error in channel:created:', error);
    }
  });

  // 10. CHANNEL UPDATED (Broadcast to channel members)
  socket.on('channel:updated', async ({ channelId, updates }) => {
    try {
      if (!channelId || !updates) {
        console.error('[Socket][Channel] updated: Missing required fields');
        return;
      }

      const channelIdStr = channelId.toString();

      // Broadcast to all channel members
      io.to(channelIdStr).emit('channel:updated', {
        channelId: channelIdStr,
        updates,
        timestamp: new Date(),
      });

      // If visibility changed to public, broadcast to all
      if (updates.isPublic === true) {
        io.emit('channel:visibility_changed', {
          channelId: channelIdStr,
          isPublic: true,
        });
      }

      console.log(`[Socket][Channel] Channel ${channelId} updated`);

    } catch (error) {
      console.error('[Socket][Channel] Error in channel:updated:', error);
    }
  });

  // 11. CHANNEL DELETED (Broadcast to channel members)
  socket.on('channel:deleted', async ({ channelId }) => {
    try {
      if (!channelId) {
        console.error('[Socket][Channel] deleted: No channelId provided');
        return;
      }

      const channelIdStr = channelId.toString();

      // Broadcast to all channel members
      io.to(channelIdStr).emit('channel:deleted', {
        channelId: channelIdStr,
        timestamp: new Date(),
      });

      console.log(`[Socket][Channel] Channel ${channelId} deleted`);

    } catch (error) {
      console.error('[Socket][Channel] Error in channel:deleted:', error);
    }
  });

  // CLEANUP ON DISCONNECT
  socket.on('disconnect', () => {
    // Clean up typing timeouts for this user
    if (socket.userId) {
      channelTypingUsers.forEach((channelTyping, channelId) => {
        if (channelTyping.has(socket.userId.toString())) {
          clearTimeout(channelTyping.get(socket.userId.toString()));
          channelTyping.delete(socket.userId.toString());

          // Notify channel members
          socket.to(channelId).emit('channel:user_typing', {
            userId: socket.userId,
            channelId,
            isTyping: false,
          });
        }
      });
    }
  });
};

module.exports = handleChannelEvents;