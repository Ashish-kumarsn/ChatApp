// models/Conversation.js
const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema(
  {
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    unreadCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

// Always keep participants sorted for stable matching
conversationSchema.pre('save', function (next) {
  if (Array.isArray(this.participants)) {
    this.participants = this.participants.map(String).sort().map(id => new mongoose.Types.ObjectId(id));
  }
  next();
});

// Validate exactly two distinct users
conversationSchema.path('participants').validate(function (val) {
  return Array.isArray(val) && val.length === 2 && String(val[0]) !== String(val[1]);
}, 'Conversation must have two distinct participants');

// Helpful indexes
conversationSchema.index({ participants: 1 });          // find by participant(s)
conversationSchema.index({ updatedAt: -1 });            // recent conversations
conversationSchema.index({ lastMessage: 1 });           // populate joins

const Conversation = mongoose.model('Conversation', conversationSchema);
module.exports = Conversation;
