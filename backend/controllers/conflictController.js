const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const eventService = require('../services/eventService');

function generateResolutionId() {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `RES-${rand}`;
}

const conflictController = {
  /**
   * GET /api/v1/conflicts & GET /conflicts
   * Retrieve all conflicts (e.g. status=unresolved)
   */
  async getAllConflicts(req, res, next) {
    try {
      const { status } = req.query;
      const conflicts = await db.getAllConflicts({ status });
      return res.json({
        total: conflicts.length,
        conflicts,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/v1/conflicts/:id & GET /conflicts/:id
   * Retrieve conflict details and its resolutions
   */
  async getConflictById(req, res, next) {
    try {
      const { id } = req.params;
      const conflict = await db.getConflictById(id);
      if (!conflict) {
        return res.status(404).json({
          error: 'NotFound',
          message: `Conflict with ID "${id}" not found.`,
          statusCode: 404,
        });
      }
      return res.json(conflict);
    } catch (error) {
      next(error);
    }
  },

  /**
   * PATCH /api/v1/conflicts/:id & PATCH /conflicts/:id
   * Resolve a conflict and save resolution notes
   */
  async resolveConflict(req, res, next) {
    try {
      const { id } = req.params;
      const body = req.body || {};

      const conflict = await db.getConflictById(id);
      if (!conflict) {
        return res.status(404).json({
          error: 'NotFound',
          message: `Conflict with ID "${id}" not found.`,
          statusCode: 404,
        });
      }

      const resolutionNotes = body.resolutionNotes || body.resolution_notes || body.notes || '';
      const resolvedStatus = body.resolvedStatus || body.resolved_status || body.status || 'resolved';
      const resolvedBy = body.resolvedBy || body.resolved_by || 'Admin Adjuster';

      if (!resolutionNotes.trim()) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Field "resolutionNotes" (or "notes") is required.',
          statusCode: 400,
        });
      }

      const resolutionId = generateResolutionId();
      const resolutionRecord = {
        id: resolutionId,
        conflictId: id,
        claimId: conflict.claimId,
        resolutionNotes,
        resolvedStatus,
        resolvedBy,
      };

      const updatedConflict = await db.saveResolution(resolutionRecord);
      const updatedClaim = await db.getClaimById(conflict.claimId);
      const stats = await db.getStats();

      // Broadcast real-time updates to dashboard
      eventService.broadcast('conflict:resolved', {
        conflictId: id,
        claimId: conflict.claimId,
        resolutionNotes,
        resolvedStatus,
        resolvedBy,
        resolvedAt: new Date().toISOString(),
      });

      if (updatedClaim) {
        eventService.broadcast('claim:updated', updatedClaim);
      }
      eventService.broadcast('stats:updated', stats);

      return res.json({
        message: 'Conflict resolved successfully.',
        conflict: updatedConflict,
        claim: updatedClaim,
        resolution: resolutionRecord,
      });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = conflictController;
