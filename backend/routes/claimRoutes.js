const express = require('express');
const router = express.Router();
const claimController = require('../controllers/claimController');
const { claimUpload } = require('../middleware/upload');

// POST /claims & /api/v1/claims
router.post('/', claimUpload, claimController.createClaim);

// GET /claims & /api/v1/claims
router.get('/', claimController.getAllClaims);

// GET /claims/:id & /api/v1/claims/:id
router.get('/:id', claimController.getClaimById);

// GET /claims/:id/conflicts & /api/v1/claims/:id/conflicts
router.get('/:id/conflicts', claimController.getClaimConflicts);

module.exports = router;
