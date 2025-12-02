// models/Message.js
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    content: { type: String },
    imageOrVideoUrl: { type: String },
    contentType: {
      type: String,
      enum: ['image', 'video', 'text'],
      default: 'text'
    },
    reactions: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true
        },
        emoji: { type: String }
      }
    ],
    messageStatus: {
      type: String,
      enum: ['sent', 'delivered', 'read'],
      default: 'sent'
    }
  },
  { timestamps: true }
);

// Helpful indexes for common queries
messageSchema.index({ conversation: 1, createdAt: 1 }); // list messages in a convo
messageSchema.index({ receiver: 1, messageStatus: 1 }); // mark-as-read scans
messageSchema.index({ sender: 1, createdAt: -1 });      // sender history

const Message = mongoose.model('Message', messageSchema);
module.exports = Message;
