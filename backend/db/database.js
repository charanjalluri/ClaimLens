const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const config = require('../config');

// Ensure data directory exists
const dbDir = path.dirname(config.dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let dbInstance = null;
let SQL = null;
let initPromise = null;

async function getDb() {
  if (dbInstance) return dbInstance;
  if (!initPromise) {
    initPromise = (async () => {
      SQL = await initSqlJs();
      if (fs.existsSync(config.dbPath)) {
        try {
          const fileBuffer = fs.readFileSync(config.dbPath);
          dbInstance = new SQL.Database(fileBuffer);
        } catch (err) {
          console.warn('[Database] Could not read existing db file, creating new:', err.message);
          dbInstance = new SQL.Database();
        }
      } else {
        dbInstance = new SQL.Database();
      }
      initSchema(dbInstance);
      persist(dbInstance);
      return dbInstance;
    })();
  }
  return initPromise;
}

function persist(db) {
  try {
    if (!db) return;
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(config.dbPath, buffer);
  } catch (err) {
    console.error('[Database] Failed to persist database to disk:', err.message);
  }
}

function initSchema(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS claims (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      claim_text TEXT NOT NULL,
      image_url TEXT,
      audio_url TEXT,
      transcription TEXT,
      image_analysis TEXT,
      status TEXT DEFAULT 'PROCESSING',
      conflict_count INTEGER DEFAULT 0,
      processing_time_ms INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS conflicts (
      id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL,
      conflict_type TEXT NOT NULL,
      evidence_a TEXT,
      evidence_b TEXT,
      explanation TEXT,
      confidence REAL DEFAULT 0.0,
      status TEXT DEFAULT 'unresolved',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS resolutions (
      id TEXT PRIMARY KEY,
      conflict_id TEXT NOT NULL,
      claim_id TEXT NOT NULL,
      resolution_notes TEXT NOT NULL,
      resolved_status TEXT DEFAULT 'resolved',
      resolved_by TEXT DEFAULT 'Admin',
      resolved_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (conflict_id) REFERENCES conflicts(id) ON DELETE CASCADE,
      FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);
    CREATE INDEX IF NOT EXISTS idx_conflicts_claim_id ON conflicts(claim_id);
    CREATE INDEX IF NOT EXISTS idx_conflicts_status ON conflicts(status);
    CREATE INDEX IF NOT EXISTS idx_resolutions_conflict_id ON resolutions(conflict_id);
  `);
}

// Helper to convert SQL.js query result into array of JS objects
function parseResults(res) {
  if (!res || res.length === 0) return [];
  const { columns, values } = res[0];
  return values.map(row => {
    const obj = {};
    columns.forEach((col, idx) => {
      obj[col] = row[idx];
    });
    return obj;
  });
}

// Helper to convert snake_case DB columns to camelCase object
function formatClaim(row) {
  if (!row) return null;
  return {
    claimId: row.id || row.claimId,
    userId: row.user_id || row.userId || null,
    claimText: row.claim_text || row.claimText || row.text || '',
    text: row.claim_text || row.claimText || row.text || '',
    imageUrl: row.image_url || row.imageUrl || null,
    audioUrl: row.audio_url || row.audioUrl || null,
    transcription: row.transcription || null,
    imageAnalysis: row.image_analysis || row.imageAnalysis || null,
    status: row.status || 'PROCESSING',
    conflictCount: row.conflict_count !== undefined ? row.conflict_count : (row.conflictCount || 0),
    processingTimeMs: row.processing_time_ms !== undefined ? row.processing_time_ms : (row.processingTimeMs || null),
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || row.updatedAt || new Date().toISOString(),
  };
}

function formatConflict(row) {
  if (!row) return null;
  return {
    conflictId: row.id || row.conflictId,
    claimId: row.claim_id || row.claimId,
    conflictType: row.conflict_type || row.conflictType || 'none',
    evidenceA: row.evidence_a !== undefined ? row.evidence_a : (row.evidenceA || null),
    evidenceB: row.evidence_b !== undefined ? row.evidence_b : (row.evidenceB || null),
    explanation: row.explanation || null,
    confidence: row.confidence !== undefined ? row.confidence : 0.0,
    status: row.status || 'unresolved',
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || row.updatedAt || new Date().toISOString(),
    claimText: row.claim_text || row.claimText || null,
    imageUrl: row.image_url || row.imageUrl || null,
    audioUrl: row.audio_url || row.audioUrl || null,
  };
}

function formatResolution(row) {
  if (!row) return null;
  return {
    resolutionId: row.id || row.resolutionId,
    conflictId: row.conflict_id || row.conflictId,
    claimId: row.claim_id || row.claimId,
    resolutionNotes: row.resolution_notes || row.resolutionNotes || '',
    resolvedStatus: row.resolved_status || row.resolvedStatus || 'resolved',
    resolvedBy: row.resolved_by || row.resolvedBy || 'Admin',
    resolvedAt: row.resolved_at || row.resolvedAt || new Date().toISOString(),
  };
}

const dbService = {
  async init() {
    return getDb();
  },

  // ─── Claims ────────────────────────────────────────────────────────────────
  async saveClaim(claim) {
    const db = await getDb();
    const id = claim.claimId || claim.id;
    const userId = claim.userId || claim.user_id || null;
    const claimText = claim.claimText || claim.text || '';
    const imageUrl = claim.imageUrl || claim.image_url || null;
    const audioUrl = claim.audioUrl || claim.audio_url || null;
    const transcription = claim.transcription || null;
    const imageAnalysis = claim.imageAnalysis || claim.image_analysis || null;
    const status = claim.status || 'PROCESSING';
    const conflictCount = claim.conflictCount || 0;
    const processingTimeMs = claim.processingTimeMs || null;
    const now = new Date().toISOString();

    db.run(
      `INSERT INTO claims (
        id, user_id, claim_text, image_url, audio_url,
        transcription, image_analysis, status, conflict_count,
        processing_time_ms, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, claimText, imageUrl, audioUrl, transcription, imageAnalysis, status, conflictCount, processingTimeMs, now, now]
    );

    persist(db);
    return this.getClaimById(id);
  },

  async updateClaim(id, updates) {
    const db = await getDb();
    const fields = [];
    const values = [];

    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.conflictCount !== undefined || updates.conflict_count !== undefined) {
      fields.push('conflict_count = ?');
      values.push(updates.conflictCount !== undefined ? updates.conflictCount : updates.conflict_count);
    }
    if (updates.transcription !== undefined) {
      fields.push('transcription = ?');
      values.push(updates.transcription);
    }
    if (updates.imageAnalysis !== undefined || updates.image_analysis !== undefined) {
      fields.push('image_analysis = ?');
      values.push(updates.imageAnalysis !== undefined ? updates.imageAnalysis : updates.image_analysis);
    }
    if (updates.processingTimeMs !== undefined || updates.processing_time_ms !== undefined) {
      fields.push('processing_time_ms = ?');
      values.push(updates.processingTimeMs !== undefined ? updates.processingTimeMs : updates.processing_time_ms);
    }
    if (updates.imageUrl !== undefined || updates.image_url !== undefined) {
      fields.push('image_url = ?');
      values.push(updates.imageUrl !== undefined ? updates.imageUrl : updates.image_url);
    }
    if (updates.audioUrl !== undefined || updates.audio_url !== undefined) {
      fields.push('audio_url = ?');
      values.push(updates.audioUrl !== undefined ? updates.audioUrl : updates.audio_url);
    }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')");
      values.push(id);
      db.run(`UPDATE claims SET ${fields.join(', ')} WHERE id = ?`, values);
      persist(db);
    }

    return this.getClaimById(id);
  },

  async getClaimById(id) {
    const db = await getDb();
    const res = db.exec('SELECT * FROM claims WHERE id = ?', [id]);
    const rows = parseResults(res);
    if (rows.length === 0) return null;
    const claim = formatClaim(rows[0]);
    claim.conflicts = await this.getConflictsByClaimId(id);
    claim.resolutions = await this.getResolutionsByClaimId(id);
    return claim;
  },

  async getAllClaims(filter = {}) {
    const db = await getDb();
    let query = 'SELECT * FROM claims ORDER BY created_at DESC';
    let params = [];

    if (filter.status) {
      query = 'SELECT * FROM claims WHERE UPPER(status) = UPPER(?) ORDER BY created_at DESC';
      params = [filter.status];
    }

    const res = db.exec(query, params);
    let claims = parseResults(res).map(formatClaim);

    if (filter.search) {
      const q = filter.search.toLowerCase();
      claims = claims.filter(c =>
        (c.claimId && c.claimId.toLowerCase().includes(q)) ||
        (c.claimText && c.claimText.toLowerCase().includes(q)) ||
        (c.status && c.status.toLowerCase().includes(q))
      );
    }

    const populated = [];
    for (const c of claims) {
      c.conflicts = await this.getConflictsByClaimId(c.claimId);
      populated.push(c);
    }
    return populated;
  },

  // ─── Conflicts ─────────────────────────────────────────────────────────────
  async saveConflict(conflict) {
    const db = await getDb();
    const id = conflict.conflictId || conflict.id;
    const claimId = conflict.claimId || conflict.claim_id;
    const conflictType = conflict.conflictType || conflict.conflict_type || 'none';
    const evidenceA = conflict.evidenceA || conflict.evidence_a || null;
    const evidenceB = conflict.evidenceB || conflict.evidence_b || null;
    const explanation = conflict.explanation || null;
    const confidence = conflict.confidence !== undefined ? conflict.confidence : 0.0;
    const status = conflict.status || 'unresolved';
    const now = new Date().toISOString();

    db.run(
      `INSERT INTO conflicts (
        id, claim_id, conflict_type, evidence_a, evidence_b,
        explanation, confidence, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, claimId, conflictType, evidenceA, evidenceB, explanation, confidence, status, now, now]
    );

    persist(db);
    return this.getConflictById(id);
  },

  async getConflictById(id) {
    const db = await getDb();
    const res = db.exec(`
      SELECT 
        c.*,
        cl.claim_text,
        cl.image_url,
        cl.audio_url
      FROM conflicts c
      LEFT JOIN claims cl ON c.claim_id = cl.id
      WHERE c.id = ?
    `, [id]);

    const rows = parseResults(res);
    if (rows.length === 0) return null;
    const conflict = formatConflict(rows[0]);
    conflict.resolutions = await this.getResolutionsByConflictId(id);
    return conflict;
  },

  async getConflictsByClaimId(claimId) {
    const db = await getDb();
    const res = db.exec('SELECT * FROM conflicts WHERE claim_id = ? ORDER BY created_at DESC', [claimId]);
    const rows = parseResults(res).map(formatConflict);
    const populated = [];
    for (const c of rows) {
      c.resolutions = await this.getResolutionsByConflictId(c.conflictId);
      populated.push(c);
    }
    return populated;
  },

  async getAllConflicts(filter = {}) {
    const db = await getDb();
    let query = `
      SELECT 
        c.*,
        cl.claim_text,
        cl.image_url,
        cl.audio_url
      FROM conflicts c
      LEFT JOIN claims cl ON c.claim_id = cl.id
      ORDER BY c.created_at DESC
    `;
    let params = [];

    if (filter.status) {
      query = `
        SELECT 
          c.*,
          cl.claim_text,
          cl.image_url,
          cl.audio_url
        FROM conflicts c
        LEFT JOIN claims cl ON c.claim_id = cl.id
        WHERE UPPER(c.status) = UPPER(?)
        ORDER BY c.created_at DESC
      `;
      params = [filter.status];
    }

    const res = db.exec(query, params);
    const conflicts = parseResults(res).map(formatConflict);
    const populated = [];
    for (const c of conflicts) {
      c.resolutions = await this.getResolutionsByConflictId(c.conflictId);
      populated.push(c);
    }
    return populated;
  },

  async updateConflictStatus(id, status) {
    const db = await getDb();
    db.run("UPDATE conflicts SET status = ?, updated_at = datetime('now') WHERE id = ?", [status, id]);
    persist(db);
    return this.getConflictById(id);
  },

  // ─── Resolutions ───────────────────────────────────────────────────────────
  async saveResolution(resolution) {
    const db = await getDb();
    const id = resolution.resolutionId || resolution.id;
    const conflictId = resolution.conflictId || resolution.conflict_id;
    const claimId = resolution.claimId || resolution.claim_id;
    const resolutionNotes = resolution.resolutionNotes || resolution.resolution_notes || resolution.notes || '';
    const resolvedStatus = resolution.resolvedStatus || resolution.resolved_status || resolution.status || 'resolved';
    const resolvedBy = resolution.resolvedBy || resolution.resolved_by || 'Admin';
    const now = new Date().toISOString();

    db.run(
      `INSERT INTO resolutions (
        id, conflict_id, claim_id, resolution_notes,
        resolved_status, resolved_by, resolved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, conflictId, claimId, resolutionNotes, resolvedStatus, resolvedBy, now]
    );

    // Update conflict status
    await this.updateConflictStatus(conflictId, resolvedStatus);

    // Check if all conflicts for this claim are resolved
    const allConflicts = await this.getConflictsByClaimId(claimId);
    const hasUnresolved = allConflicts.some(c => c.status === 'unresolved');
    if (!hasUnresolved && allConflicts.length > 0) {
      await this.updateClaim(claimId, { status: 'RESOLVED' });
    }

    persist(db);
    return this.getConflictById(conflictId);
  },

  async getResolutionsByConflictId(conflictId) {
    const db = await getDb();
    const res = db.exec('SELECT * FROM resolutions WHERE conflict_id = ? ORDER BY resolved_at DESC', [conflictId]);
    return parseResults(res).map(formatResolution);
  },

  async getResolutionsByClaimId(claimId) {
    const db = await getDb();
    const res = db.exec('SELECT * FROM resolutions WHERE claim_id = ? ORDER BY resolved_at DESC', [claimId]);
    return parseResults(res).map(formatResolution);
  },

  // ─── Stats ─────────────────────────────────────────────────────────────────
  async getStats() {
    const db = await getDb();
    const getCount = (sql, params = []) => {
      const res = db.exec(sql, params);
      const rows = parseResults(res);
      return rows.length > 0 ? (rows[0].count || 0) : 0;
    };

    const totalClaims = getCount('SELECT COUNT(*) AS count FROM claims');
    const processingClaims = getCount("SELECT COUNT(*) AS count FROM claims WHERE UPPER(status) = 'PROCESSING'");
    const conflictClaims = getCount("SELECT COUNT(*) AS count FROM claims WHERE UPPER(status) IN ('CONFLICT_DETECTED', 'UNRESOLVED')");
    const clearClaims = getCount("SELECT COUNT(*) AS count FROM claims WHERE UPPER(status) = 'CLEAR'");
    const resolvedClaims = getCount("SELECT COUNT(*) AS count FROM claims WHERE UPPER(status) = 'RESOLVED'");
    const totalConflicts = getCount('SELECT COUNT(*) AS count FROM conflicts');
    const unresolvedConflicts = getCount("SELECT COUNT(*) AS count FROM conflicts WHERE UPPER(status) = 'UNRESOLVED'");
    const resolvedConflicts = getCount("SELECT COUNT(*) AS count FROM conflicts WHERE UPPER(status) != 'UNRESOLVED'");

    return {
      totalClaims,
      processingClaims,
      conflictClaims,
      clearClaims,
      resolvedClaims,
      totalConflicts,
      unresolvedConflicts,
      resolvedConflicts,
    };
  },

  async clearAll() {
    const db = await getDb();
    db.run(`
      DELETE FROM resolutions;
      DELETE FROM conflicts;
      DELETE FROM claims;
    `);
    persist(db);
  },

  async close() {
    if (dbInstance) {
      persist(dbInstance);
      dbInstance.close();
      dbInstance = null;
      initPromise = null;
    }
  },
};

module.exports = dbService;
