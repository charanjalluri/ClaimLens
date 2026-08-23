const request = require('supertest');
const path = require('path');
const fs = require('fs');

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DB_PATH = path.join(__dirname, 'test_claimlens.db');
process.env.MOCK_AI_FALLBACK = 'true';

const { app } = require('../server');
const db = require('../db/database');

describe('ClaimLens Backend & Database API Suite (Agent 2)', () => {
  beforeAll(async () => {
    await db.init();
    await db.clearAll();
  });

  afterAll(async () => {
    await db.clearAll();
    await db.close();
    try {
      if (fs.existsSync(process.env.DB_PATH)) {
        fs.unlinkSync(process.env.DB_PATH);
      }
    } catch (e) {}
  });

  // ─── 1. Health Checks ──────────────────────────────────────────────────────
  describe('Health Checks', () => {
    it('GET /health should return 200 and healthy status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body.service).toContain('ClaimLens Backend');
      expect(res.body.database.engine).toContain('SQLite');
    });

    it('GET /api/v1/health should match root health endpoint', async () => {
      const res = await request(app).get('/api/v1/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
    });
  });

  // ─── 2. Claim Submission (Multipart & PRD Scenarios) ───────────────────────
  describe('Claim Ingestion API (POST /claims & POST /api/v1/claims)', () => {
    it('should reject claim without text description (400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/v1/claims')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
      expect(res.body.message).toContain('claim_text');
    });

    it('should successfully submit text-only claim', async () => {
      const res = await request(app)
        .post('/api/v1/claims')
        .field('claim_id', 'CLM-TEST-001')
        .field('claim_text', 'Rear bumper has minor scratches from parking pole.')
        .field('user_id', 'user-101');

      expect(res.status).toBe(201);
      expect(res.body.claimId).toBe('CLM-TEST-001');
      expect(res.body.status).toBe('CLEAR');
      expect(res.body.conflictDetected).toBe(false);
      expect(res.body.conflictCount).toBe(0);

      // Verify SQLite persistence
      const saved = await db.getClaimById('CLM-TEST-001');
      expect(saved).not.toBeNull();
      expect(saved.claimText).toBe('Rear bumper has minor scratches from parking pole.');
      expect(saved.status).toBe('CLEAR');
    });

    it('PRD Test Case: Photo (bumper) + Voice (windshield) -> Conflict Detected', async () => {
      // Mock dummy image and audio buffers
      const dummyImage = Buffer.from('fake-jpeg-image-bytes-front-bumper');
      const dummyAudio = Buffer.from('fake-mp3-audio-bytes-windshield-broken');

      const res = await request(app)
        .post('/api/v1/claims')
        .field('claim_id', 'CLM-PRD-001')
        .field('claim_text', 'My front bumper is damaged.')
        .field('user_id', 'claimant-gayathri')
        .attach('image', dummyImage, 'front_bumper.jpg')
        .attach('audio', dummyAudio, 'voice_memo.mp3');

      expect(res.status).toBe(201);
      expect(res.body.claimId).toBe('CLM-PRD-001');
      expect(res.body.conflictDetected).toBe(true);
      expect(res.body.status).toBe('CONFLICT_DETECTED');
      expect(res.body.conflictCount).toBe(1);

      // Verify Conflict is saved in SQLite database
      const conflicts = await db.getConflictsByClaimId('CLM-PRD-001');
      expect(conflicts.length).toBe(1);
      const conflict = conflicts[0];
      expect(conflict.claimId).toBe('CLM-PRD-001');
      expect(conflict.conflictType).toBe('damage_location');
      expect(conflict.evidenceA).toContain('bumper');
      expect(conflict.evidenceB).toContain('windshield');
      expect(conflict.confidence).toBeGreaterThanOrEqual(0.8);
      expect(conflict.status).toBe('unresolved');
    });

    it('should support direct root alias POST /claims', async () => {
      const res = await request(app)
        .post('/claims')
        .field('claim_id', 'CLM-ROOT-002')
        .field('claim_text', 'Right door dented while opening.');

      expect(res.status).toBe(201);
      expect(res.body.claimId).toBe('CLM-ROOT-002');
    });
  });

  // ─── 3. Claims Retrieval APIs ──────────────────────────────────────────────
  describe('Claims Retrieval APIs', () => {
    it('GET /api/v1/claims should return list of claims', async () => {
      const res = await request(app).get('/api/v1/claims');
      expect(res.status).toBe(200);
      expect(res.body.total).toBeGreaterThanOrEqual(3);
      expect(Array.isArray(res.body.claims)).toBe(true);
    });

    it('GET /api/v1/claims/:id should return complete claim details', async () => {
      const res = await request(app).get('/api/v1/claims/CLM-PRD-001');
      expect(res.status).toBe(200);
      expect(res.body.claimId).toBe('CLM-PRD-001');
      expect(res.body.status).toBe('CONFLICT_DETECTED');
      expect(res.body.imageUrl).toContain('/uploads/images/');
      expect(res.body.audioUrl).toContain('/uploads/audio/');
      expect(res.body.conflicts.length).toBe(1);
    });

    it('GET /api/v1/claims/:id/conflicts should return claim conflicts', async () => {
      const res = await request(app).get('/api/v1/claims/CLM-PRD-001/conflicts');
      expect(res.status).toBe(200);
      expect(res.body.claimId).toBe('CLM-PRD-001');
      expect(res.body.count).toBe(1);
      expect(res.body.conflicts[0].conflictType).toBe('damage_location');
    });

    it('GET /api/v1/claims/NON_EXISTENT should return 404', async () => {
      const res = await request(app).get('/api/v1/claims/CLM-DOES-NOT-EXIST');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('NotFound');
    });
  });

  // ─── 4. Conflicts & Resolution Workflow ────────────────────────────────────
  describe('Conflict Resolution Workflow (PATCH /conflicts/:id)', () => {
    let targetConflictId;

    beforeAll(async () => {
      const conflicts = await db.getConflictsByClaimId('CLM-PRD-001');
      targetConflictId = conflicts[0].conflictId;
    });

    it('GET /api/v1/conflicts should list unresolved conflicts', async () => {
      const res = await request(app).get('/api/v1/conflicts?status=unresolved');
      expect(res.status).toBe(200);
      expect(res.body.conflicts.some(c => c.conflictId === targetConflictId)).toBe(true);
    });

    it('GET /api/v1/conflicts/:id should return single conflict detail', async () => {
      const res = await request(app).get(`/api/v1/conflicts/${targetConflictId}`);
      expect(res.status).toBe(200);
      expect(res.body.conflictId).toBe(targetConflictId);
      expect(res.body.status).toBe('unresolved');
    });

    it('PATCH /api/v1/conflicts/:id should resolve conflict and save notes', async () => {
      const res = await request(app)
        .patch(`/api/v1/conflicts/${targetConflictId}`)
        .send({
          resolutionNotes: 'Claimant clarified windshield damage was from previous claim; bumper damage accepted.',
          resolvedStatus: 'resolved',
          resolvedBy: 'Senior Adjuster John',
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('resolved successfully');
      expect(res.body.conflict.status).toBe('resolved');
      expect(res.body.resolution.resolutionNotes).toContain('windshield damage was from previous claim');

      // Verify overall claim status transitioned to RESOLVED
      const updatedClaim = await db.getClaimById('CLM-PRD-001');
      expect(updatedClaim.status).toBe('RESOLVED');

      // Verify resolution history stored
      const resolutions = await db.getResolutionsByConflictId(targetConflictId);
      expect(resolutions.length).toBe(1);
      expect(resolutions[0].resolvedBy).toBe('Senior Adjuster John');
    });
  });

  // ─── 5. Stats & Metrics ───────────────────────────────────────────────────
  describe('Stats & Real-Time Metrics', () => {
    it('GET /api/v1/stats should return accurate aggregate numbers', async () => {
      const res = await request(app).get('/api/v1/stats');
      expect(res.status).toBe(200);
      expect(res.body.totalClaims).toBeGreaterThanOrEqual(3);
      expect(res.body.resolvedClaims).toBeGreaterThanOrEqual(1);
      expect(res.body.realTimeSubscribers).toBeDefined();
    });
  });
});
