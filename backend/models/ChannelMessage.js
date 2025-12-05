// models/ChannelMessage.js
const mongoose = require('mongoose');

const channelMessageSchema = new mongoose.Schema(
  {
    channel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Channel',
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    content: {
      type: String,
      trim: true,
    },
    imageOrVideoUrl: {
      type: String,
    },
    contentType: {
      type: String,
      enum: ['image', 'video', 'text'],
      default: 'text',
    },
    reactions: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        emoji: { type: String },
      },
    ],
    messageStatus: {
      type: String,
      enum: ['sent', 'delivered', 'read'],
      default: 'sent',
    },
  },
  { timestamps: true }
);

// Indexes for efficient pagination and querying
channelMessageSchema.index({ channel: 1, createdAt: 1 }); // list messages per channel
channelMessageSchema.index({ sender: 1, createdAt: -1 }); // sender history

const ChannelMessage = mongoose.model('ChannelMessage', channelMessageSchema);
module.exports = ChannelMessage;
