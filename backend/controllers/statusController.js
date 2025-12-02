const { uploadFileToCloudinary } = require('../config/cloudinaryConfig');
const Status = require('../models/Status');
const response = require('../utils/responseHandler');

// Constants for validation
const MAX_TEXT_LENGTH = 500;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/ogg'];
const STATUS_EXPIRY_HOURS = 24;

// Helper function to validate file
const validateFile = (file) => {
  if (!file) return { valid: true };

  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: 'File size exceeds 10MB limit' };
  }

  const isImage = ALLOWED_IMAGE_TYPES.includes(file.mimetype);
  const isVideo = ALLOWED_VIDEO_TYPES.includes(file.mimetype);

  if (!isImage && !isVideo) {
    return { valid: false, error: 'Unsupported file type. Only images and videos allowed' };
  }

  return { valid: true, isImage, isVideo };
};

// Helper to emit socket events safely
const emitSocketEvent = (req, eventName, data, excludeUserId = null) => {
  try {
    if (!req.io || !req.socketUserMap) return;

    for (const [connectedUserId, sockets] of req.socketUserMap) {
      if (excludeUserId && connectedUserId.toString() === excludeUserId.toString()) {
        continue;
      }

      const socketIds = Array.isArray(sockets) ? sockets : [sockets];

      socketIds.forEach((socketId) => {
        req.io.to(socketId).emit(eventName, data);
      });
    }
  } catch (error) {
    console.error('Socket emit error:', error.message);
  }
};

// Helper to emit to specific user (all their devices)
const emitToUser = (req, userId, eventName, data) => {
  try {
    if (!req.io || !req.socketUserMap) return;

    const sockets = req.socketUserMap.get(userId.toString());
    if (!sockets) return;

    const socketIds = Array.isArray(sockets) ? sockets : [sockets];

    socketIds.forEach((socketId) => {
      req.io.to(socketId).emit(eventName, data);
    });
  } catch (error) {
    console.error('Socket emit to user error:', error.message);
  }
};


exports.createStatus = async (req, res) => {
  try {
    const { content, contentType } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return response(res, 401, 'Unauthorized - User not authenticated');
    }

    const file = req.file;
    let mediaUrl = null;
    let finalContentType = contentType || 'text';
    let finalContent = content?.trim() || null;

    // Validate and handle file upload
    if (file) {
      const fileValidation = validateFile(file);
      if (!fileValidation.valid) {
        return response(res, 400, fileValidation.error);
      }

      try {
        const uploadResult = await uploadFileToCloudinary(file);
        if (!uploadResult?.secure_url) {
          return response(res, 500, 'Failed to upload media to cloud storage');
        }
        mediaUrl = uploadResult.secure_url;

        // Determine content type based on file
        if (fileValidation.isImage) {
          finalContentType = 'image';
        } else if (fileValidation.isVideo) {
          finalContentType = 'video';
        }

        finalContent = mediaUrl;
      } catch (uploadError) {
        console.error('Cloudinary upload error:', uploadError);
        return response(res, 500, 'Media upload failed. Please try again');
      }
    } else if (finalContent) {
      // Validate text content
      finalContentType = 'text';
      if (finalContent.length > MAX_TEXT_LENGTH) {
        return response(res, 400, `Text content exceeds ${MAX_TEXT_LENGTH} characters limit`);
      }
    } else {
      return response(res, 400, 'Status content is required (text or media)');
    }

    // Calculate expiry time
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + STATUS_EXPIRY_HOURS);

    // Create status
    const status = new Status({
      user: userId,
      content: finalContent,
      contentType: finalContentType,
      expiresAt
    });

    await status.save();

    // Populate with lean query for better performance
    const populatedStatus = await Status.findById(status._id)
      .populate('user', 'username profilePicture')
      .populate('viewers', 'username profilePicture')
      .lean();

    if (!populatedStatus) {
      return response(res, 500, 'Failed to retrieve created status');
    }

    // Emit socket event to other users
    emitSocketEvent(req, 'new_status', populatedStatus, userId);

    return response(res, 201, 'Status created successfully', populatedStatus);
  } catch (error) {
    console.error('Create status error:', error);
    
    // More specific error messages
    if (error.name === 'ValidationError') {
      return response(res, 400, 'Invalid status data: ' + error.message);
    }
    if (error.name === 'MongoError' || error.name === 'MongoServerError') {
      return response(res, 500, 'Database error occurred');
    }
    
    return response(res, 500, 'Internal server error');
  }
};

exports.getStatuses = async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return response(res, 401, 'Unauthorized - User not authenticated');
    }

    // Get only non-expired statuses with lean query for performance
    const statuses = await Status.find({
      expiresAt: { $gt: new Date() }
    })
      .select('user content contentType viewers createdAt expiresAt') // Only select needed fields
      .populate('user', 'username profilePicture')
      .populate('viewers', 'username profilePicture')
      .sort({ createdAt: -1 })
      .lean();

    return response(res, 200, 'Statuses retrieved successfully', statuses || []);
  } catch (error) {
    console.error('Get statuses error:', error);
    
    if (error.name === 'CastError') {
      return response(res, 400, 'Invalid request parameters');
    }
    
    return response(res, 500, 'Internal server error');
  }
};

exports.viewStatus = async (req, res) => {
  try {
    const { statusId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return response(res, 401, 'Unauthorized - User not authenticated');
    }

    if (!statusId) {
      return response(res, 400, 'Status ID is required');
    }

    // Find status
    const status = await Status.findById(statusId);
    
    if (!status) {
      return response(res, 404, 'Status not found');
    }

    // Check if status has expired
    if (status.expiresAt < new Date()) {
      return response(res, 410, 'Status has expired');
    }

    // Check if already viewed
    const alreadyViewed = status.viewers?.some(
      v => v.toString() === userId.toString()
    );

    let updatedStatus;

    if (!alreadyViewed) {
      // Add viewer
      status.viewers.push(userId);
      await status.save();

      // Get updated status with populated fields
      updatedStatus = await Status.findById(statusId)
        .populate('user', 'username profilePicture')
        .populate('viewers', 'username profilePicture')
        .lean();

      // Emit view notification to status owner (if not viewing own status)
      if (status.user.toString() !== userId.toString()) {
        const viewData = {
          statusId,
          viewerId: userId,
          totalViewers: updatedStatus.viewers.length,
          viewers: updatedStatus.viewers
        };
        emitToUser(req, status.user, 'status_viewed', viewData);
      }
    } else {
      // Already viewed, just return the status
      updatedStatus = await Status.findById(statusId)
        .populate('user', 'username profilePicture')
        .populate('viewers', 'username profilePicture')
        .lean();
    }

    return response(res, 200, 'Status viewed successfully', updatedStatus);
  } catch (error) {
    console.error('View status error:', error);
    
    if (error.name === 'CastError') {
      return response(res, 400, 'Invalid status ID format');
    }
    
    return response(res, 500, 'Internal server error');
  }
};

exports.deleteStatus = async (req, res) => {
  try {
    const { statusId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return response(res, 401, 'Unauthorized - User not authenticated');
    }

    if (!statusId) {
      return response(res, 400, 'Status ID is required');
    }

    // Find status
    const status = await Status.findById(statusId);
    
    if (!status) {
      return response(res, 404, 'Status not found');
    }

    // Authorization check
    if (status.user.toString() !== userId.toString()) {
      return response(res, 403, 'Not authorized to delete this status');
    }

    // Delete status
    await status.deleteOne();

    // Emit deletion event to all connected users except the creator
    emitSocketEvent(req, 'status_deleted', { statusId }, userId);

    return response(res, 200, 'Status deleted successfully', { statusId });
  } catch (error) {
    console.error('Delete status error:', error);
    
    if (error.name === 'CastError') {
      return response(res, 400, 'Invalid status ID format');
    }
    
    return response(res, 500, 'Internal server error');
  }
};

// Bonus: Clean up expired statuses (can be called by a cron job)
exports.cleanupExpiredStatuses = async (req, res) => {
  try {
    const result = await Status.deleteMany({
      expiresAt: { $lt: new Date() }
    });

    return response(res, 200, `Cleaned up ${result.deletedCount} expired statuses`, {
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Cleanup expired statuses error:', error);
    return response(res, 500, 'Internal server error');
  }
};

// GET STATUS VIEWERS
exports.getStatusViewers = async (req, res) => {
  try {
    const { statusId } = req.params;

    if (!statusId) {
      return response(res, 400, 'Status ID is required');
    }

    const status = await Status.findById(statusId)
      .populate('viewers', 'username profilePicture')
      .lean();

    if (!status) {
      return response(res, 404, 'Status not found');
    }

    // Optional: expired status ke viewers dene hain ya nahi?
    // Agar nahi dene to yaha check kar sakte ho:
    // if (status.expiresAt && status.expiresAt < new Date()) {
    //   return response(res, 410, 'Status has expired');
    // }

    return response(
      res,
      200,
      'Status viewers fetched successfully',
      status.viewers || []
    );

  } catch (error) {
    console.error('Get status viewers error:', error);

    if (error.name === 'CastError') {
      return response(res, 400, 'Invalid status ID format');
    }

    return response(res, 500, 'Internal server error');
  }
};
