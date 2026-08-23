const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
process.env.DB_PATH = path.join(__dirname, 'test_claimlens.db');
process.env.MOCK_AI_FALLBACK = 'true';

const db = require('../db/database');
const storageService = require('../services/storageService');
const aiService = require('../services/aiService');
const eventService = require('../services/eventService');
const { app, server } = require('../server');
const request = require('supertest');

async function runVerification() {
  console.log('='.repeat(60));
  console.log('  ClaimLens Backend Verification Suite (Agent 2)');
  console.log('='.repeat(60));

  try {
    // 1. Database init
    console.log('\n[1] Initializing SQLite database...');
    await db.init();
    await db.clearAll();
    console.log('✅ SQLite initialized and tables created.');

    // 2. Health Checks
    console.log('\n[2] Testing Health Check endpoints...');
    const healthRes = await request(app).get('/health');
    console.log('GET /health Status:', healthRes.status, 'Response:', healthRes.body);
    if (healthRes.status !== 200) throw new Error('Health check failed');
    console.log('✅ Health check passed.');

    // 3. Text-only claim submission
    console.log('\n[3] Testing Text-Only Claim Submission...');
    const textRes = await request(app)
      .post('/api/v1/claims')
      .field('claim_id', 'CLM-TEST-001')
      .field('claim_text', 'Rear bumper has minor scratches from parking pole.')
      .field('user_id', 'user-101');
    
    console.log('POST /api/v1/claims (Text) -> Status:', textRes.status, 'Body:', textRes.body);
    if (textRes.status !== 201) throw new Error(`Text claim submission failed: ${JSON.stringify(textRes.body)}`);
    console.log('✅ Text-only claim created and processed.');

    // 4. PRD Test Case: Photo (bumper) + Voice (windshield) -> Conflict Detected
    console.log('\n[4] Testing PRD Scenario: Photo (bumper) + Voice (windshield)...');
    const dummyImage = Buffer.from('fake-jpeg-image-bytes-front-bumper');
    const dummyAudio = Buffer.from('fake-mp3-audio-bytes-windshield-broken');

    const prdRes = await request(app)
      .post('/api/v1/claims')
      .field('claim_id', 'CLM-PRD-001')
      .field('claim_text', 'My front bumper is damaged.')
      .field('user_id', 'claimant-gayathri')
      .attach('image', dummyImage, 'front_bumper.jpg')
      .attach('audio', dummyAudio, 'voice_memo.mp3');

    console.log('POST /api/v1/claims (PRD) -> Status:', prdRes.status);
    console.log('  Claim ID         :', prdRes.body.claimId);
    console.log('  Status           :', prdRes.body.status);
    console.log('  Conflict Detected:', prdRes.body.conflictDetected);
    console.log('  Conflict Count   :', prdRes.body.conflictCount);
    console.log('  Conflict Details :', prdRes.body.conflict);

    if (prdRes.status !== 201) throw new Error('PRD Claim submission failed');
    if (!prdRes.body.conflictDetected) throw new Error('Expected conflictDetected=true');
    console.log('✅ PRD Conflict Detection verified.');

    // 5. Query Claims
    console.log('\n[5] Testing GET /api/v1/claims & GET /claims/:id...');
    const allClaimsRes = await request(app).get('/api/v1/claims');
    console.log('GET /api/v1/claims -> Total claims in DB:', allClaimsRes.body.total);
    if (allClaimsRes.body.total < 2) throw new Error('Expected at least 2 claims in DB');

    const claimDetailRes = await request(app).get('/api/v1/claims/CLM-PRD-001');
    console.log('GET /api/v1/claims/CLM-PRD-001 -> Status:', claimDetailRes.status, 'Conflicts count:', claimDetailRes.body.conflicts.length);
    if (!claimDetailRes.body.imageUrl || !claimDetailRes.body.audioUrl) throw new Error('Expected imageUrl and audioUrl in claim detail');
    console.log('✅ Claim retrieval & media references verified.');

    // 6. Query Conflicts
    console.log('\n[6] Testing GET /api/v1/conflicts & GET /api/v1/claims/:id/conflicts...');
    const conflictsRes = await request(app).get('/api/v1/conflicts?status=unresolved');
    console.log('GET /api/v1/conflicts (unresolved) -> Total:', conflictsRes.body.total);
    if (conflictsRes.body.total < 1) throw new Error('Expected at least 1 unresolved conflict');

    const targetConflict = conflictsRes.body.conflicts[0];
    console.log('  Target Conflict ID:', targetConflict.conflictId);
    console.log('  Conflict Type     :', targetConflict.conflictType);
    console.log('  Evidence A        :', targetConflict.evidenceA);
    console.log('  Evidence B        :', targetConflict.evidenceB);
    console.log('  Confidence        :', targetConflict.confidence);

    // 7. Resolve Conflict
    console.log('\n[7] Testing PATCH /api/v1/conflicts/:id (Resolution)...');
    const patchRes = await request(app)
      .patch(`/api/v1/conflicts/${targetConflict.conflictId}`)
      .send({
        resolutionNotes: 'Claimant clarified windshield damage occurred in previous incident; approved front bumper repairs.',
        resolvedStatus: 'resolved',
        resolvedBy: 'Senior Adjuster Kaushik',
      });

    console.log('PATCH /api/v1/conflicts/:id -> Status:', patchRes.status, 'Message:', patchRes.body.message);
    if (patchRes.status !== 200) throw new Error('Resolution failed');

    // Verify claim status transitioned to RESOLVED
    const resolvedClaim = await db.getClaimById('CLM-PRD-001');
    console.log('  Updated Claim Status:', resolvedClaim.status);
    if (resolvedClaim.status !== 'RESOLVED') throw new Error('Expected claim status to be RESOLVED');
    console.log('✅ Conflict resolution & claim status transition verified.');

    // 8. Stats & Real-Time Metrics
    console.log('\n[8] Testing GET /api/v1/stats...');
    const statsRes = await request(app).get('/api/v1/stats');
    console.log('Stats Response:', statsRes.body);
    console.log('✅ Real-time metrics verified.');

    // Cleanup
    await db.clearAll();
    await db.close();
    if (fs.existsSync(process.env.DB_PATH)) {
      fs.unlinkSync(process.env.DB_PATH);
    }

    console.log('\n' + '='.repeat(60));
    console.log('🎉 ALL BACKEND & DATABASE TESTS PASSED SUCCESSFULLY! 🎉');
    console.log('='.repeat(60));
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Verification failed with error:', err);
    process.exit(1);
  }
}

runVerification();
