const { uploadFileToCloudinary } = require('../config/cloudinaryConfig');
const Conversation = require('../models/Conversation');
const response = require('../utils/responseHandler');
const Message = require('../models/Message');

exports.sendMessage = async (req, res) => {
  try {
    const { senderId, receiverId, content, messageStatus } = req.body;
    const file = req.file;

    // keep participants sorted to match schema behavior
    const participants = [senderId, receiverId].map(String).sort();

    let conversation = await Conversation.findOne({ participants });

    if (!conversation) {
      conversation = new Conversation({ participants });
      await conversation.save();
    }

    let imageOrVideoUrl = null;
    let contentType = null;

    // handle file upload
    if (file) {
      const uploadFile = await uploadFileToCloudinary(file);
      if (!uploadFile?.secure_url) {
        return response(res, 400, 'failed to upload media');
      }
      imageOrVideoUrl = uploadFile.secure_url;

      if (file.mimetype?.startsWith('image')) {
        contentType = 'image';
      } else if (file.mimetype?.startsWith('video')) {
        contentType = 'video';
      } else {
        return response(res, 400, 'unsupported file type');
      }
    } else if (content?.trim()) {
      contentType = 'text';
    } else {
      return response(res, 400, 'message content is required');
    }

    const message = new Message({
      conversation: conversation?._id,
      sender: senderId,
      receiver: receiverId,
      content,
      contentType,
      imageOrVideoUrl,
      messageStatus
    });
    await message.save();

    // update convo metadata
    conversation.lastMessage = message?._id;
    conversation.unreadCount = (conversation.unreadCount || 0) + 1;
    await conversation.save();

    const populatedMessage = await Message.findById(message?._id)
      .populate('sender', 'username profilePicture')
      .populate('receiver', 'username profilePicture');

    // ✅ UPDATED: Handle multiple socket IDs per user
    if (req.io && req.socketUserMap) {
      const receiverSocketIds = req.socketUserMap.get(receiverId);
      if (receiverSocketIds && receiverSocketIds.length > 0) {
        // DB me status update
        await Message.findByIdAndUpdate(message._id, { messageStatus: 'delivered' });

        // response & socket dono me latest status dikhane ke liye
        if (populatedMessage) {
          populatedMessage.messageStatus = 'delivered';
        }

        // ✅ Send to all receiver's active sockets
        receiverSocketIds.forEach(socketId => {
          req.io.to(socketId).emit('receive_message', populatedMessage);
        });
      }
    }

    return response(res, 201, 'Message send successfully', populatedMessage);

  } catch (error) {
    console.error(error);
    return response(res, 500, 'internal server error');
  }
};

// get all conversation
exports.getConversation = async (req, res) => {
  const userId = req.user.userId;
  try {
    let conversation = await Conversation.find({
      participants: userId,
    })
      .populate('participants', 'username profilePicture isOnline lastSeen')
      .populate({
        path: 'lastMessage',
        populate: [
          { path: 'sender', select: 'username profilePicture' },
          { path: 'receiver', select: 'username profilePicture' },
        ],
      })
      .sort({ updatedAt: -1 });

    return response(res, 200, 'conversation get successfully ', conversation);
  } catch (error) {
    console.error(error);
    return response(res, 500, 'internal server error');
  }
};

// get messages of specific conversation
exports.getMessages = async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user.userId;
  try {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return response(res, 404, 'conversation not found');
    }

    const isParticipant = conversation.participants.some(
      (p) => String(p) === String(userId)
    );
    if (!isParticipant) {
      return response(res, 403, 'Not authorized to view this conversation');
    }

    const messages = await Message.find({ conversation: conversationId })
      .populate('sender', 'username profilePicture')
      .populate('receiver', 'username profilePicture')
      .sort('createdAt');

    await Message.updateMany(
      {
        conversation: conversationId,
        receiver: userId,
        messageStatus: { $in: ['sent', 'delivered'] },
      },
      { $set: { messageStatus: 'read' } }
    );

    conversation.unreadCount = 0;
    await conversation.save();

    return response(res, 200, 'message retrived ', messages);
  } catch (error) {
    console.error(error);
    return response(res, 500, 'internal server error');
  }
};

// mark as read
exports.markAsRead = async (req, res) => {
  const { messageIds } = req.body;
  const userId = req.user.userId;
  try {
    let messages = await Message.find({
      _id: { $in: messageIds },
      receiver: userId,
    });

    await Message.updateMany(
      { _id: { $in: messageIds }, receiver: userId },
      { $set: { messageStatus: 'read' } }
    );

    // in-memory docs ko bhi update kar do (sirf response ke liye)
    messages.forEach((msg) => {
      msg.messageStatus = 'read';
    });

    // ✅ UPDATED: Handle multiple socket IDs per sender
    if (req.io && req.socketUserMap) {
      for (const message of messages) {
        const senderSocketIds = req.socketUserMap.get(message.sender.toString());
        if (senderSocketIds && senderSocketIds.length > 0) {
          const updatedMessage = {
            _id: message._id,
            messageStatus: 'read',
          };
          // ✅ Send to all sender's active sockets
          senderSocketIds.forEach(socketId => {
            req.io.to(socketId).emit('message_read', updatedMessage);
          });
        }
      }
    }

    return response(res, 200, 'message marked as read', messages);

  } catch (error) {
    console.error(error);
    return response(res, 500, 'internal server error');
  }
};

exports.deleteMessage = async (req, res) => {
  const { messageId } = req.params;
  const userId = req.user.userId;
  try {
    const message = await Message.findById(messageId);
    if (!message) {
      return response(res, 404, 'message not found');
    }
    if (message.sender.toString() !== String(userId)) {
      return response(res, 403, 'Not authorized to delete this message');
    }

    // ✅ NEW: Update conversation's lastMessage if this was the last message
    const conversation = await Conversation.findById(message.conversation);
    if (conversation && conversation.lastMessage?.toString() === messageId) {
      const newLastMessage = await Message.findOne({ 
        conversation: message.conversation,
        _id: { $ne: messageId }
      }).sort({ createdAt: -1 });
      
      conversation.lastMessage = newLastMessage?._id || null;
      await conversation.save();
    }

    await message.deleteOne();

    // ✅ UPDATED: Handle multiple socket IDs per receiver
    if (req.io && req.socketUserMap) {
      const receiverSocketIds = req.socketUserMap.get(message.receiver.toString());
      if (receiverSocketIds && receiverSocketIds.length > 0) {
        // ✅ Send to all receiver's active sockets
        receiverSocketIds.forEach(socketId => {
          req.io.to(socketId).emit("message_deleted", messageId);
        });
      }
    }

    return response(res, 200, 'message deleted successfully');
  } catch (error) {
    console.error(error);
    return response(res, 500, 'internal server error');
  }
};