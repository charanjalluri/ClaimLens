const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const storageService = require('../services/storageService');
const aiService = require('../services/aiService');
const eventService = require('../services/eventService');

function generateClaimId() {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `CLM-${rand}`;
}

function generateConflictId(claimId) {
  const rand = Math.floor(100 + Math.random() * 900);
  return `CONF-${claimId}-${rand}`;
}

const claimController = {
  /**
   * POST /api/v1/claims & POST /claims
   * Create a new claim, store media, trigger AI analysis, store conflicts, notify dashboard.
   */
  async createClaim(req, res, next) {
    try {
      const body = req.body || {};
      const files = req.files || {};

      // Support field aliases from Android contract and shared specifications
      const claimText = body.claim_text || body.text || body.claimText || '';
      const customClaimId = body.claim_id || body.claimId || null;
      const userId = body.user_id || body.userId || 'claimant-default';

      if (!claimText.trim()) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Field "claim_text" or "text" is required.',
          statusCode: 400,
        });
      }

      const claimId = customClaimId ? customClaimId.trim() : generateClaimId();

      // Check if claimId already exists
      const existing = await db.getClaimById(claimId);
      if (existing) {
        return res.status(409).json({
          error: 'Conflict',
          message: `Claim with ID ${claimId} already exists.`,
          statusCode: 409,
        });
      }

      // Handle Image file or base64 JSON payload
      let imageUrl = null;
      let imageFile = null;
      if (files.image && files.image[0]) {
        imageFile = files.image[0];
        const saved = storageService.saveImage(imageFile, imageFile.originalname);
        imageUrl = saved.url;
      } else if (body.image) {
        const saved = storageService.saveImage(body.image, 'image.jpg');
        imageUrl = saved.url;
      }

      // Handle Audio file or base64 JSON payload
      let audioUrl = null;
      let audioFile = null;
      if (files.audio && files.audio[0]) {
        audioFile = files.audio[0];
        const saved = storageService.saveAudio(audioFile, audioFile.originalname);
        audioUrl = saved.url;
      } else if (body.audio) {
        const saved = storageService.saveAudio(body.audio, 'audio.mp3');
        audioUrl = saved.url;
      }

      // 1. Store initial claim in SQLite with status 'PROCESSING'
      const initialClaim = await db.saveClaim({
        id: claimId,
        userId,
        claimText,
        imageUrl,
        audioUrl,
        status: 'PROCESSING',
        conflictCount: 0,
      });

      // 2. Broadcast real-time claim created event to dashboard
      eventService.broadcast('claim:created', {
        claimId,
        status: 'PROCESSING',
        claimText,
        imageUrl,
        audioUrl,
        createdAt: initialClaim.createdAt,
      });

      // 3. Trigger Agent 1 AI microservice
      console.log(`[ClaimController] Running AI analysis for ${claimId}...`);
      const aiResult = await aiService.analyzeClaim({
        claimId,
        claimText,
        imageFile: imageFile || (body.image ? Buffer.from(body.image, 'base64') : null),
        audioFile: audioFile || (body.audio ? Buffer.from(body.audio, 'base64') : null),
      });

      let updatedStatus = 'CLEAR';
      let conflictCount = 0;
      let createdConflict = null;

      if (aiResult.conflictDetected) {
        updatedStatus = 'CONFLICT_DETECTED';
        conflictCount = 1;

        const conflictId = generateConflictId(claimId);
        createdConflict = await db.saveConflict({
          id: conflictId,
          claimId,
          conflictType: aiResult.conflictType || 'damage_location',
          evidenceA: aiResult.evidenceA,
          evidenceB: aiResult.evidenceB,
          explanation: aiResult.explanation,
          confidence: aiResult.confidence,
          status: 'unresolved',
        });

        // Broadcast real-time conflict detected event
        eventService.broadcast('conflict:detected', {
          claimId,
          conflictId,
          conflictType: createdConflict.conflictType,
          evidenceA: createdConflict.evidenceA,
          evidenceB: createdConflict.evidenceB,
          explanation: createdConflict.explanation,
          confidence: createdConflict.confidence,
          status: 'unresolved',
        });
      } else if (aiResult.status === 'ai_failed') {
        updatedStatus = 'AI_FAILED';
      } else if (aiResult.status === 'insufficient_evidence') {
        updatedStatus = 'INSUFFICIENT_EVIDENCE';
      } else {
        updatedStatus = 'CLEAR';
      }

      // 4. Update claim record in Database
      const finalClaim = await db.updateClaim(claimId, {
        status: updatedStatus,
        conflictCount,
        transcription: aiResult.transcription,
        imageAnalysis: aiResult.imageAnalysis,
        processingTimeMs: aiResult.processingTimeMs,
      });

      // 5. Broadcast claim:updated event
      const stats = await db.getStats();
      eventService.broadcast('claim:updated', finalClaim);
      eventService.broadcast('stats:updated', stats);

      // 6. Return response to Android / caller
      return res.status(201).json({
        claimId: finalClaim.claimId,
        status: finalClaim.status,
        conflictDetected: aiResult.conflictDetected,
        conflictCount: finalClaim.conflictCount,
        message: aiResult.conflictDetected 
          ? 'Claim received. AI detected contradictions between evidence sources.'
          : 'Claim received. AI analysis completed without conflicts.',
        transcription: finalClaim.transcription,
        imageAnalysis: finalClaim.imageAnalysis,
        processingTimeMs: finalClaim.processingTimeMs,
        conflict: createdConflict,
        claim: finalClaim,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/v1/claims & GET /claims
   * Get all claims for the dashboard with optional filter & search
   */
  async getAllClaims(req, res, next) {
    try {
      const { status, search } = req.query;
      const claims = await db.getAllClaims({ status, search });
      return res.json({
        total: claims.length,
        claims,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/v1/claims/:id & GET /claims/:id
   * Get claim details by ID
   */
  async getClaimById(req, res, next) {
    try {
      const { id } = req.params;
      const claim = await db.getClaimById(id);
      if (!claim) {
        return res.status(404).json({
          error: 'NotFound',
          message: `Claim with ID "${id}" not found.`,
          statusCode: 404,
        });
      }
      return res.json(claim);
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/v1/claims/:id/conflicts & GET /claims/:id/conflicts
   * Get conflicts for a specific claim
   */
  async getClaimConflicts(req, res, next) {
    try {
      const { id } = req.params;
      const claim = await db.getClaimById(id);
      if (!claim) {
        return res.status(404).json({
          error: 'NotFound',
          message: `Claim with ID "${id}" not found.`,
          statusCode: 404,
        });
      }
      const conflicts = await db.getConflictsByClaimId(id);
      return res.json({
        claimId: id,
        count: conflicts.length,
        conflicts,
      });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = claimController;
