// routes/channelRoutes.js
const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { multerMiddleware } = require('../config/cloudinaryConfig');
const channelController = require('../controllers/channelController');

const router = express.Router();

router.post('/', authMiddleware, channelController.createChannel);

router.get('/me', authMiddleware, channelController.getMyChannels);

router.get('/', authMiddleware, channelController.getAllChannels);

router.get('/:channelId', authMiddleware, channelController.getChannelDetails);

router.put('/:channelId', authMiddleware, channelController.updateChannel);

router.delete('/:channelId', authMiddleware, channelController.deleteChannel);

router.post('/:channelId/join', authMiddleware, channelController.joinChannel);

router.post('/:channelId/leave', authMiddleware, channelController.leaveChannel);


router.get(
  '/:channelId/messages',
  authMiddleware,
  channelController.getChannelMessages
);


router.get(
  '/:channelId/members',
  authMiddleware,
  channelController.getChannelMembers
);


router.get(
  '/:channelId/membership',
  authMiddleware,
  channelController.checkMembership
);

module.exports = router;