// controllers/channelController.js
const response = require('../utils/responseHandler');
const { uploadFileToCloudinary } = require('../config/cloudinaryConfig');

const Channel = require('../models/Channel');
const ChannelMessage = require('../models/ChannelMessage');
const User = require('../models/User');

// 1. CREATE CHANNEL
exports.createChannel = async (req, res) => {
    try {
        const { name, description, isPrivate } = req.body;
        const userId = req.user.userId;

        if (!name || !name.trim()) {
            return response(res, 400, 'Channel name is required');
        }

        const trimmedName = name.trim();

        // Check if channel with same name already exists
        const existingChannel = await Channel.findOne({ name: trimmedName });
        if (existingChannel) {
            return response(res, 400, 'Channel name already exists');
        }

        const channel = new Channel({
            name: trimmedName,
            description: description?.trim() || '',
            members: [userId],
            createdBy: userId,
            isPrivate: !!isPrivate,
        });

        await channel.save();

        const populatedChannel = await Channel.findById(channel._id)
            .populate('members', 'username profilePicture isOnline lastSeen')
            .populate({
                path: 'createdBy',
                select: 'username profilePicture',
            });

        // Socket: Broadcast new PUBLIC channel to ALL users
        if (req.io && !isPrivate) {
            req.io.emit('channel:created', {
                channel: populatedChannel,
                timestamp: new Date(),
            });
        }

        return response(res, 201, 'Channel created successfully', populatedChannel);
    } catch (error) {
        console.error('[Controller] Error in createChannel:', error);
        return response(res, 500, 'Internal server error');
    }
};

// 2. GET MY CHANNELS (Private + Joined Public)
exports.getMyChannels = async (req, res) => {
    try {
        const userId = req.user.userId;

        const channels = await Channel.find({ members: userId })
            .populate('members', 'username profilePicture isOnline lastSeen')
            .populate({
                path: 'lastMessage',
                populate: {
                    path: 'sender',
                    select: 'username profilePicture',
                },
            })
            .populate({
                path: 'createdBy',
                select: 'username profilePicture',
            })
            .sort({ updatedAt: -1 });

        // Add isMember flag for each channel
        const channelsWithStatus = channels.map(channel => {
            const channelObj = channel.toObject();
            channelObj.isMember = true; // Since we filtered by members
            channelObj.memberCount = channel.members?.length || 0;
            return channelObj;
        });

        return response(res, 200, 'My channels retrieved successfully', channelsWithStatus);
    } catch (error) {
        console.error('[Controller] Error in getMyChannels:', error);
        return response(res, 500, 'Internal server error');
    }
};

// 3. GET ALL PUBLIC CHANNELS 
exports.getAllChannels = async (req, res) => {
    try {
        const userId = req.user.userId;

        // Only PUBLIC channels
        const channels = await Channel.find({ isPrivate: false })
            .populate('members', 'username profilePicture isOnline lastSeen')
            .populate({
                path: 'lastMessage',
                populate: {
                    path: 'sender',
                    select: 'username profilePicture',
                },
            })
            .populate({
                path: 'createdBy',
                select: 'username profilePicture',
            })
            .sort({ updatedAt: -1 });

        // Add isMember flag for each channel
        const channelsWithStatus = channels.map(channel => {
            const channelObj = channel.toObject();
            const isMember = channel.members.some(
                m => String(m._id || m) === String(userId)
            );
            channelObj.isMember = isMember;
            channelObj.memberCount = channel.members?.length || 0;
            return channelObj;
        });

        return response(res, 200, 'All public channels retrieved successfully', channelsWithStatus);
    } catch (error) {
        console.error('[Controller] Error in getAllChannels:', error);
        return response(res, 500, 'Internal server error');
    }
};

// 4. GET CHANNEL DETAILS
exports.getChannelDetails = async (req, res) => {
    try {
        const { channelId } = req.params;
        const userId = req.user.userId;

        const channel = await Channel.findById(channelId)
            .populate('members', 'username profilePicture isOnline lastSeen')
            .populate({
                path: 'createdBy',
                select: 'username profilePicture',
            })
            .populate({
                path: 'lastMessage',
                populate: {
                    path: 'sender',
                    select: 'username profilePicture',
                },
            });

        if (!channel) {
            return response(res, 404, 'Channel not found');
        }

        // Check if user is member
        const isMember = channel.members.some(
            m => String(m._id || m) === String(userId)
        );

        // Private channel - only members can view
        if (channel.isPrivate && !isMember) {
            return response(res, 403, 'Not authorized to view this channel');
        }

        const memberCount = channel.members?.length || 0;
        const isCreator = String(channel.createdBy._id || channel.createdBy) === String(userId);

        return response(res, 200, 'Channel details retrieved successfully', {
            channel,
            memberCount,
            isMember,
            isCreator,
        });
    } catch (error) {
        console.error('[Controller] Error in getChannelDetails:', error);
        return response(res, 500, 'Internal server error');
    }
};

// 5. JOIN CHANNEL
exports.joinChannel = async (req, res) => {
    try {
        const { channelId } = req.params;
        const userId = req.user.userId;

        const channel = await Channel.findById(channelId);
        if (!channel) {
            return response(res, 404, 'Channel not found');
        }

        // Private channels cannot be joined directly
        if (channel.isPrivate) {
            return response(res, 403, 'Cannot join private channel');
        }

        // Use atomic operation to prevent race condition
        const updatedChannel = await Channel.findOneAndUpdate(
            {
                _id: channelId,
                members: { $ne: userId } // Only update if user is NOT already a member
            },
            {
                $addToSet: { members: userId } // $addToSet prevents duplicates
            },
            {
                new: true,
                runValidators: true
            }
        );

        // If null, user was already a member
        if (!updatedChannel) {
            const populatedChannel = await Channel.findById(channelId)
                .populate('members', 'username profilePicture isOnline lastSeen')
                .populate({
                    path: 'createdBy',
                    select: 'username profilePicture',
                });

            const channelObj = populatedChannel.toObject();
            channelObj.isMember = true;
            channelObj.memberCount = populatedChannel.members?.length || 0;

            return response(res, 200, 'Already a member of this channel', channelObj);
        }

        const populatedChannel = await Channel.findById(channelId)
            .populate('members', 'username profilePicture isOnline lastSeen')
            .populate({
                path: 'createdBy',
                select: 'username profilePicture',
            });

        // Get user details for socket broadcast
        const user = await User.findById(userId).select('username profilePicture');

        // Socket: Broadcast member joined to ALL channel members
        if (req.io) {
            req.io.to(channelId.toString()).emit('channel:member_joined', {
                channelId: channelId.toString(),
                member: {
                    _id: userId,
                    username: user.username,
                    profilePicture: user.profilePicture,
                },
                timestamp: new Date(),
            });
        }

        const channelObj = populatedChannel.toObject();
        channelObj.isMember = true;
        channelObj.memberCount = populatedChannel.members?.length || 0;

        return response(res, 200, 'Joined channel successfully', channelObj);
    } catch (error) {
        console.error('[Controller] Error in joinChannel:', error);
        return response(res, 500, 'Internal server error');
    }
};

// 6. LEAVE CHANNEL
exports.leaveChannel = async (req, res) => {
    try {
        const { channelId } = req.params;
        const userId = req.user.userId;

        const channel = await Channel.findById(channelId);
        if (!channel) {
            return response(res, 404, 'Channel not found');
        }

        // Creator cannot leave their own channel
        if (String(channel.createdBy) === String(userId)) {
            return response(res, 400, 'Channel creator cannot leave. Delete the channel instead.');
        }

        const beforeCount = channel.members.length;
        channel.members = channel.members.filter(
            (m) => String(m) !== String(userId)
        );
        const afterCount = channel.members.length;

        if (beforeCount === afterCount) {
            return response(res, 400, 'You are not a member of this channel');
        }

        await channel.save();

        // Socket: Broadcast member left to ALL channel members
        if (req.io) {
            req.io.to(channelId.toString()).emit('channel:member_left', {
                channelId: channelId.toString(),
                userId: userId.toString(),
                timestamp: new Date(),
            });
        }

        return response(res, 200, 'Left channel successfully');
    } catch (error) {
        console.error('[Controller] Error in leaveChannel:', error);
        return response(res, 500, 'Internal server error');
    }
};

// 7. UPDATE CHANNEL (Only Creator)
exports.updateChannel = async (req, res) => {
    try {
        const { channelId } = req.params;
        const userId = req.user.userId;
        const { name, description, isPrivate } = req.body;

        const channel = await Channel.findById(channelId);
        if (!channel) {
            return response(res, 404, 'Channel not found');
        }

        // Only creator can update
        if (String(channel.createdBy) !== String(userId)) {
            return response(res, 403, 'Only channel creator can update the channel');
        }

        const updates = {};

        if (name !== undefined && name.trim()) {
            const trimmedName = name.trim();
            // Check if new name already exists (exclude current channel)
            const existingChannel = await Channel.findOne({
                name: trimmedName,
                _id: { $ne: channelId }
            });
            if (existingChannel) {
                return response(res, 400, 'Channel name already exists');
            }
            updates.name = trimmedName;
        }

        if (description !== undefined) {
            updates.description = description.trim();
        }

        if (isPrivate !== undefined) {
            updates.isPrivate = !!isPrivate;
        }

        Object.assign(channel, updates);
        await channel.save();

        const populatedChannel = await Channel.findById(channelId)
            .populate('members', 'username profilePicture isOnline lastSeen')
            .populate({
                path: 'createdBy',
                select: 'username profilePicture',
            });

        // Socket: Broadcast channel update to ALL channel members
        if (req.io) {
            req.io.to(channelId.toString()).emit('channel:updated', {
                channelId: channelId.toString(),
                updates: populatedChannel,
                timestamp: new Date(),
            });

            // If changed to public, broadcast to all users
            if (updates.isPrivate === false) {
                req.io.emit('channel:visibility_changed', {
                    channelId: channelId.toString(),
                    isPublic: true,
                    channel: populatedChannel,
                });
            }
        }

        return response(res, 200, 'Channel updated successfully', populatedChannel);
    } catch (error) {
        console.error('[Controller] Error in updateChannel:', error);
        return response(res, 500, 'Internal server error');
    }
};

// 8. DELETE CHANNEL (Only Creator)
exports.deleteChannel = async (req, res) => {
    try {
        const { channelId } = req.params;
        const userId = req.user.userId;

        const channel = await Channel.findById(channelId);
        if (!channel) {
            return response(res, 404, 'Channel not found');
        }

        // Only creator can delete
        if (String(channel.createdBy) !== String(userId)) {
            return response(res, 403, 'Only channel creator can delete the channel');
        }

        // Delete all messages in this channel
        await ChannelMessage.deleteMany({ channel: channelId });

        // Delete the channel
        await Channel.findByIdAndDelete(channelId);

        // Socket: Broadcast channel deletion to ALL channel members
        if (req.io) {
            req.io.to(channelId.toString()).emit('channel:deleted', {
                channelId: channelId.toString(),
                timestamp: new Date(),
            });
        }

        return response(res, 200, 'Channel deleted successfully');
    } catch (error) {
        console.error('[Controller] Error in deleteChannel:', error);
        return response(res, 500, 'Internal server error');
    }
};

// 9. GET CHANNEL MEMBERS
exports.getChannelMembers = async (req, res) => {
    try {
        const { channelId } = req.params;
        const userId = req.user.userId;

        const channel = await Channel.findById(channelId)
            .populate('members', 'username profilePicture isOnline lastSeen');

        if (!channel) {
            return response(res, 404, 'Channel not found');
        }

        // Check if user is member (for private channels)
        const isMember = channel.members.some(
            m => String(m._id || m) === String(userId)
        );

        if (channel.isPrivate && !isMember) {
            return response(res, 403, 'Not authorized to view members');
        }

        return response(res, 200, 'Channel members retrieved successfully', {
            members: channel.members,
            memberCount: channel.members.length,
        });
    } catch (error) {
        console.error('[Controller] Error in getChannelMembers:', error);
        return response(res, 500, 'Internal server error');
    }
};

// 10. CHECK MEMBERSHIP STATUS
exports.checkMembership = async (req, res) => {
    try {
        const { channelId } = req.params;
        const userId = req.user.userId;

        const channel = await Channel.findById(channelId).select('members isPrivate');
        if (!channel) {
            return response(res, 404, 'Channel not found');
        }

        const isMember = channel.members.some(
            m => String(m) === String(userId)
        );

        return response(res, 200, 'Membership status retrieved', {
            channelId: channelId.toString(),
            isMember,
            isPrivate: channel.isPrivate,
        });
    } catch (error) {
        console.error('[Controller] Error in checkMembership:', error);
        return response(res, 500, 'Internal server error');
    }
};

// ========================================
// 11. GET CHANNEL MESSAGES (with Pagination)
// ========================================
exports.getChannelMessages = async (req, res) => {
    try {
        const { channelId } = req.params;
        const userId = req.user.userId;
        const limit = parseInt(req.query.limit, 10) || 20;
        const before = req.query.before;

        const channel = await Channel.findById(channelId).select('members');
        if (!channel) {
            return response(res, 404, 'Channel not found');
        }

        const isMember = channel.members.some(
            (m) => String(m) === String(userId)
        );
        if (!isMember) {
            return response(res, 403, 'Not authorized to view messages');
        }

        const query = { channel: channelId };
        if (before) {
            query.createdAt = { $lt: new Date(before) };
        }

        const messages = await ChannelMessage.find(query)
            .populate('sender', 'username profilePicture')
            .populate({
                path: 'reactions.user',
                select: 'username profilePicture',
            })
            .sort({ createdAt: -1 })
            .limit(limit);

        const hasMore = messages.length === limit;
        const nextCursor = hasMore
            ? messages[messages.length - 1].createdAt.toISOString()
            : null;

        // Reverse to oldest -> newest for UI
        const orderedMessages = messages.slice().reverse();

        return response(res, 200, 'Channel messages retrieved successfully', {
            messages: orderedMessages,
            nextCursor,
            hasMore,
        });
    } catch (error) {
        console.error('[Controller] Error in getChannelMessages:', error);
        return response(res, 500, 'Internal server error');
    }
};

