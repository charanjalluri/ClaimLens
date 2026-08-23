const express = require('express');
const router = express.Router();
const conflictController = require('../controllers/conflictController');

// GET /conflicts & /api/v1/conflicts
router.get('/', conflictController.getAllConflicts);

// GET /conflicts/:id & /api/v1/conflicts/:id
router.get('/:id', conflictController.getConflictById);

// PATCH /conflicts/:id & /api/v1/conflicts/:id
router.patch('/:id', conflictController.resolveConflict);

module.exports = router;
