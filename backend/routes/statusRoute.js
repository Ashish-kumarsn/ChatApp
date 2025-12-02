const express = require('express');
const statusController = require('../controllers/statusController')
const authMiddleware = require('../middleware/authMiddleware')
const { multerMiddleware } = require('../config/cloudinaryConfig');

const router = express.Router();

// protected route
router.post('/', authMiddleware, multerMiddleware, statusController.createStatus);
router.get('/', authMiddleware, statusController.getStatuses)

router.put('/:statusId/view', authMiddleware, statusController.viewStatus)
router.get(
    '/status/:statusId/viewers',
    authMiddleware,
    statusController.getStatusViewers
);
router.delete('/:statusId', authMiddleware, statusController.deleteStatus);

module.exports = router;