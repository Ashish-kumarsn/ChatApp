// models/Channel.js
const mongoose = require('mongoose');

const channelSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 50,
      unique: true, // each channel name should be unique like Slack
    },
    description: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    isPrivate: {
      type: Boolean,
      default: false,
    },
    // for showing last activity in channel list 
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChannelMessage',
    },
  },
  { timestamps: true }
);

// Indexes for fast queries
channelSchema.index({ name: 1 }, { unique: true });       
channelSchema.index({ members: 1 });                      
channelSchema.index({ createdBy: 1 });                    
channelSchema.index({ updatedAt: -1 });                   

const Channel = mongoose.model('Channel', channelSchema);
module.exports = Channel;
