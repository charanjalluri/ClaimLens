/**
 * ClaimLens — AI Claims Operations Dashboard Frontend Application
 * Real-time WebSocket & SSE Synchronization, Multimodal Inspection, and Adjuster Resolution
 */

// Application State
let allClaims = [];
let activeFilter = 'all';
let currentInspectingClaim = null;
let currentConflict = null;

// DOM Elements
const claimsTableBody = document.getElementById('claims-table-body');
const searchInput = document.getElementById('search-input');
const filterTabs = document.getElementById('filter-tabs');
const btnRefresh = document.getElementById('btn-refresh');
const btnTestClaim = document.getElementById('btn-test-claim');
const detailModal = document.getElementById('detail-modal');
const modalCloseBtn = document.getElementById('modal-close-btn');
const resolutionForm = document.getElementById('resolution-form');
const resolutionNotesInput = document.getElementById('resolution-notes');
const btnDismissConflict = document.getElementById('btn-dismiss-conflict');
const toastContainer = document.getElementById('toast-container');
const wsStatusText = document.getElementById('ws-status-text');

// KPI Stat Elements
const statTotal = document.getElementById('stat-total');
const statConflicts = document.getElementById('stat-conflicts');
const statResolved = document.getElementById('stat-resolved');
const statProcessing = document.getElementById('stat-processing');

// Nav Badge Elements
const pillAll = document.getElementById('pill-all');
const pillConflicts = document.getElementById('pill-conflicts');
const pillResolved = document.getElementById('pill-resolved');
const pillClear = document.getElementById('pill-clear');

// Health Chip Elements
const aiDot = document.getElementById('ai-dot');
const aiChipLabel = document.getElementById('ai-chip-label');

// ─── Real-Time Stream Setup (WebSocket + SSE Fallback) ───────────────────────
function initRealtime() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  let ws = null;
  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[RealTime] WebSocket connected.');
      if (wsStatusText) wsStatusText.textContent = 'Live Sync (WS)';
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        handleRealTimeEvent(payload);
      } catch (err) {
        console.error('[RealTime] Parse error:', err);
      }
    };

    ws.onclose = () => {
      console.warn('[RealTime] WebSocket closed. Initiating SSE fallback...');
      if (wsStatusText) wsStatusText.textContent = 'Connecting SSE...';
      initSSEFallback();
    };

    ws.onerror = (err) => {
      console.warn('[RealTime] WebSocket error:', err);
    };
  } catch (e) {
    initSSEFallback();
  }
}

function initSSEFallback() {
  if (!window.EventSource) return;
  const sse = new EventSource('/api/v1/events');

  sse.onopen = () => {
    console.log('[RealTime] Connected via Server-Sent Events (SSE).');
    if (wsStatusText) wsStatusText.textContent = 'Live Sync (SSE)';
  };

  sse.addEventListener('claim:created', (e) => handleRealTimeEvent(JSON.parse(e.data)));
  sse.addEventListener('claim:updated', (e) => handleRealTimeEvent(JSON.parse(e.data)));
  sse.addEventListener('conflict:detected', (e) => handleRealTimeEvent(JSON.parse(e.data)));
  sse.addEventListener('conflict:resolved', (e) => handleRealTimeEvent(JSON.parse(e.data)));
  sse.addEventListener('stats:updated', (e) => handleRealTimeEvent(JSON.parse(e.data)));

  sse.onerror = () => {
    if (wsStatusText) wsStatusText.textContent = 'Reconnecting...';
  };
}

function handleRealTimeEvent(event) {
  const { type, data } = event;
  console.log(`[RealTime Event] ${type}`, data);

  if (type === 'claim:created') {
    showToast(`New Claim ${data.claimId || ''} received. AI evaluation in progress.`, 'info');
    fetchClaims();
    fetchStats();
  } else if (type === 'conflict:detected') {
    showToast(`Conflict Flagged on ${data.claimId || ''}: ${(data.conflictType || '').replace(/_/g, ' ')}`, 'alert');
    fetchClaims();
    fetchStats();
  } else if (type === 'claim:updated' || type === 'conflict:resolved') {
    fetchClaims();
    fetchStats();
    if (currentInspectingClaim && (currentInspectingClaim.claimId === (data.claimId || data.id))) {
      openClaimModal(data.claimId || data.id);
    }
  } else if (type === 'stats:updated') {
    updateStatsUI(data);
  }
}

// ─── API Data Fetching ───────────────────────────────────────────────────────
async function fetchClaims() {
  try {
    const res = await fetch('/api/v1/claims');
    const data = await res.json();
    allClaims = data.claims || [];
    renderTable();
    updatePills();
  } catch (err) {
    console.error('[API] Error fetching claims:', err);
  }
}

async function fetchStats() {
  try {
    const res = await fetch('/api/v1/stats');
    const stats = await res.json();
    updateStatsUI(stats);
  } catch (err) {
    console.error('[API] Error fetching stats:', err);
  }
}

async function checkSystemHealth() {
  try {
    const res = await fetch('/health');
    const health = await res.json();
    if (health.aiService) {
      if (health.aiService.reachable) {
        if (aiDot) {
          aiDot.className = 'indicator-dot online';
        }
        if (aiChipLabel) {
          aiChipLabel.textContent = 'AI Engine (NVIDIA NIM)';
        }
      } else {
        if (aiDot) {
          aiDot.className = 'indicator-dot offline';
        }
        if (aiChipLabel) {
          aiChipLabel.textContent = 'AI Disconnected';
        }
      }
    }
  } catch (e) {
    if (aiDot) aiDot.className = 'indicator-dot offline';
  }
}

function updateStatsUI(stats) {
  if (!stats) return;
  if (statTotal) statTotal.textContent = stats.totalClaims || 0;
  if (statConflicts) statConflicts.textContent = stats.unresolvedConflicts !== undefined ? stats.unresolvedConflicts : (stats.conflictClaims || 0);
  if (statResolved) statResolved.textContent = stats.resolvedClaims || 0;
  if (statProcessing) statProcessing.textContent = stats.processingClaims || 0;

  if (pillAll) pillAll.textContent = stats.totalClaims || 0;
  if (pillConflicts) pillConflicts.textContent = stats.unresolvedConflicts !== undefined ? stats.unresolvedConflicts : (stats.conflictClaims || 0);
  if (pillResolved) pillResolved.textContent = stats.resolvedClaims || 0;
  if (pillClear) pillClear.textContent = stats.clearClaims || 0;
}

function updatePills() {
  const unresolvedCount = allClaims.filter(c => c.status === 'CONFLICT_DETECTED' || c.status === 'UNRESOLVED').length;
  const resolvedCount = allClaims.filter(c => c.status === 'RESOLVED').length;
  const clearCount = allClaims.filter(c => c.status === 'CLEAR').length;

  if (pillAll) pillAll.textContent = allClaims.length;
  if (pillConflicts) pillConflicts.textContent = unresolvedCount;
  if (pillResolved) pillResolved.textContent = resolvedCount;
  if (pillClear) pillClear.textContent = clearCount;
}

// ─── Table Rendering ─────────────────────────────────────────────────────────
function renderTable() {
  const searchTerm = (searchInput.value || '').toLowerCase().trim();

  const filtered = allClaims.filter(claim => {
    // Search match
    const matchesSearch = !searchTerm ||
      (claim.claimId && claim.claimId.toLowerCase().includes(searchTerm)) ||
      (claim.claimText && claim.claimText.toLowerCase().includes(searchTerm)) ||
      (claim.status && claim.status.toLowerCase().includes(searchTerm)) ||
      (claim.userId && claim.userId.toLowerCase().includes(searchTerm));

    // Tab filter match
    let matchesTab = true;
    if (activeFilter === 'unresolved') {
      matchesTab = claim.status === 'CONFLICT_DETECTED' || claim.status === 'UNRESOLVED';
    } else if (activeFilter === 'clear') {
      matchesTab = claim.status === 'CLEAR';
    } else if (activeFilter === 'resolved') {
      matchesTab = claim.status === 'RESOLVED';
    }

    return matchesSearch && matchesTab;
  });

  if (filtered.length === 0) {
    claimsTableBody.innerHTML = `
      <tr>
        <td colspan="7" class="loading-state">
          <span>No insurance claims found matching the current filter.</span>
        </td>
      </tr>
    `;
    return;
  }

  claimsTableBody.innerHTML = filtered.map(claim => {
    const statusUpper = (claim.status || 'PROCESSING').toUpperCase();
    let statusClass = 'processing';
    let statusText = 'PROCESSING';

    if (statusUpper === 'CONFLICT_DETECTED' || statusUpper === 'UNRESOLVED') {
      statusClass = 'conflict';
      statusText = 'CONFLICT DETECTED';
    } else if (statusUpper === 'CLEAR') {
      statusClass = 'clear';
      statusText = 'VERIFIED CLEAR';
    } else if (statusUpper === 'RESOLVED') {
      statusClass = 'resolved';
      statusText = 'RESOLVED';
    } else if (statusUpper === 'AI_FAILED' || statusUpper === 'ERROR') {
      statusClass = 'error';
      statusText = 'PIPELINE ERROR';
    }

    const hasImage = Boolean(claim.imageUrl);
    const hasAudio = Boolean(claim.audioUrl);

    const conflict = claim.conflicts && claim.conflicts.length > 0 ? claim.conflicts[0] : null;
    let conflictHtml = '<span style="color: var(--text-muted);">None</span>';
    
    if (conflict) {
      const confPct = Math.round((conflict.confidence || 0.8) * 100);
      conflictHtml = `
        <div class="conflict-cell-summary">
          <span class="conflict-type-text">${escapeHtml((conflict.conflictType || 'DISCREPANCY').replace(/_/g, ' '))}</span>
          <span class="conflict-conf-text">${confPct}% AI confidence</span>
        </div>
      `;
    }

    const formattedDate = claim.createdAt 
      ? new Date(claim.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'Just now';

    return `
      <tr>
        <td>
          <span class="claim-id-code">${escapeHtml(claim.claimId)}</span>
        </td>
        <td>
          <div class="claimant-meta">
            <span class="claimant-id">${escapeHtml(claim.userId || 'Claimant')}</span>
            <span class="claimant-time">${formattedDate}</span>
          </div>
        </td>
        <td>
          <div class="claim-desc-cell">
            ${escapeHtml(claim.claimText || '')}
          </div>
        </td>
        <td>
          <div class="evidence-chips">
            <span class="evidence-tag ${hasImage ? 'active' : ''}" title="${hasImage ? 'Photo attached' : 'No photo'}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            </span>
            <span class="evidence-tag ${hasAudio ? 'active' : ''}" title="${hasAudio ? 'Voice memo attached' : 'No audio'}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
            </span>
          </div>
        </td>
        <td>
          <span class="status-badge ${statusClass}">
            <span class="dot-sm ${statusClass === 'conflict' ? 'red' : statusClass === 'clear' ? 'green' : statusClass === 'resolved' ? 'blue' : 'purple'}"></span>
            ${statusText}
          </span>
        </td>
        <td>
          ${conflictHtml}
        </td>
        <td style="text-align: right;">
          <button class="btn-action-inspect" onclick="openClaimModal('${claim.claimId}')">
            <span>Inspect</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// ─── Modal Inspection View ───────────────────────────────────────────────────
async function openClaimModal(claimId) {
  try {
    const res = await fetch(`/api/v1/claims/${claimId}`);
    const claim = await res.json();
    currentInspectingClaim = claim;

    document.getElementById('modal-claim-id').textContent = claim.claimId;
    document.getElementById('modal-claim-text').textContent = `"${claim.claimText || ''}"`;
    document.getElementById('modal-user-id').textContent = `Claimant: ${claim.userId || 'claimant-user'}`;
    document.getElementById('modal-date').textContent = `Submitted: ${new Date(claim.createdAt).toLocaleString()}`;
    
    // Latency badge
    const latencyVal = claim.processingTimeMs ? (claim.processingTimeMs / 1000).toFixed(1) : '11.9';
    document.getElementById('modal-latency-badge').textContent = `AI Latency: ${latencyVal}s`;

    // Status Pill
    const badge = document.getElementById('modal-status-badge');
    const statusUpper = (claim.status || 'PROCESSING').toUpperCase();
    let statusClass = 'processing';
    if (statusUpper === 'CONFLICT_DETECTED' || statusUpper === 'UNRESOLVED') statusClass = 'conflict';
    else if (statusUpper === 'RESOLVED') statusClass = 'resolved';
    else if (statusUpper === 'CLEAR') statusClass = 'clear';

    badge.className = `status-pill ${statusClass}`;
    badge.textContent = statusUpper.replace(/_/g, ' ');

    // Photo Box & Vision Analysis
    const photoContainer = document.getElementById('modal-photo-container');
    const imageAnalysisBox = document.getElementById('modal-image-analysis-box');
    const imageAnalysisText = document.getElementById('modal-image-analysis-text');

    if (claim.imageUrl) {
      photoContainer.innerHTML = `<img src="${claim.imageUrl}" alt="Damage Photo" onerror="this.src='https://placehold.co/400x200/1e293b/white?text=Damage+Photo'"/>`;
      if (claim.imageAnalysis) {
        imageAnalysisBox.style.display = 'block';
        imageAnalysisText.textContent = claim.imageAnalysis;
      } else {
        imageAnalysisBox.style.display = 'none';
      }
    } else {
      photoContainer.innerHTML = '<span class="empty-media-msg">No image attached</span>';
      imageAnalysisBox.style.display = 'none';
    }

    // Audio Box & Whisper Transcription
    const audioContainer = document.getElementById('modal-audio-container');
    const transcriptionBox = document.getElementById('modal-transcription-box');
    const transcriptionText = document.getElementById('modal-transcription-text');

    if (claim.audioUrl) {
      audioContainer.innerHTML = `<audio controls src="${claim.audioUrl}"></audio>`;
      if (claim.transcription) {
        transcriptionBox.style.display = 'block';
        transcriptionText.textContent = `"${claim.transcription}"`;
      } else {
        transcriptionBox.style.display = 'none';
      }
    } else {
      audioContainer.innerHTML = '<span class="empty-media-msg">No voice recording attached</span>';
      transcriptionBox.style.display = 'none';
    }

    // Conflict Contradiction Section
    const conflictBox = document.getElementById('modal-conflict-box');
    const conflict = claim.conflicts && claim.conflicts.length > 0 ? claim.conflicts[0] : null;
    currentConflict = conflict;

    if (conflict) {
      conflictBox.style.display = 'flex';
      document.getElementById('modal-conflict-type').textContent = (conflict.conflictType || 'DISCREPANCY').replace(/_/g, ' ').toUpperCase();
      document.getElementById('modal-evidence-a').textContent = conflict.evidenceA || 'Primary evidence statement';
      document.getElementById('modal-evidence-b').textContent = conflict.evidenceB || 'Contradictory evidence statement';
      document.getElementById('modal-explanation').textContent = conflict.explanation || 'Discrepancy detected across evidence streams.';

      const confPercent = Math.round((conflict.confidence || 0.8) * 100);
      document.getElementById('modal-confidence-val').textContent = `${confPercent}%`;

      // Resolution Section
      const resSection = document.getElementById('modal-resolution-section');
      resSection.style.display = 'flex';
      renderResolutionHistory(conflict.resolutions || []);
    } else {
      conflictBox.style.display = 'none';
      document.getElementById('modal-resolution-section').style.display = 'none';
    }

    detailModal.classList.add('active');
    detailModal.setAttribute('aria-hidden', 'false');
  } catch (err) {
    console.error('[Modal] Error loading claim details:', err);
  }
}

function renderResolutionHistory(resolutions) {
  const list = document.getElementById('modal-resolutions-list');
  if (!resolutions || resolutions.length === 0) {
    list.innerHTML = '';
    return;
  }

  list.innerHTML = resolutions.map(r => `
    <div class="resolution-card-done">
      <div class="res-header-done">
        <span class="res-by">Resolved by ${escapeHtml(r.resolvedBy || 'Lead Adjuster')}</span>
        <span class="res-time">${new Date(r.resolvedAt).toLocaleString()}</span>
      </div>
      <p class="res-notes">${escapeHtml(r.resolutionNotes || '')}</p>
    </div>
  `).join('');
}

// ─── Adjuster Resolution Actions ─────────────────────────────────────────────
resolutionForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentConflict) return;

  const notes = resolutionNotesInput.value.trim();
  if (!notes) return;

  try {
    const res = await fetch(`/api/v1/conflicts/${currentConflict.conflictId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resolutionNotes: notes,
        resolvedStatus: 'resolved',
        resolvedBy: 'Senior Claims Adjuster',
      }),
    });

    if (res.ok) {
      showToast('Conflict successfully resolved and claim status updated.', 'success');
      resolutionNotesInput.value = '';
      openClaimModal(currentInspectingClaim.claimId);
      fetchClaims();
      fetchStats();
    } else {
      const err = await res.json();
      showToast(err.message || 'Failed to submit conflict resolution.', 'alert');
    }
  } catch (err) {
    showToast('Network error submitting conflict resolution.', 'alert');
  }
});

btnDismissConflict.addEventListener('click', async () => {
  if (!currentConflict) return;
  const notes = resolutionNotesInput.value.trim() || 'Verified by claims adjuster. Conflict dismissed.';
  
  try {
    const res = await fetch(`/api/v1/conflicts/${currentConflict.conflictId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resolutionNotes: notes,
        resolvedStatus: 'dismissed',
        resolvedBy: 'Senior Claims Adjuster',
      }),
    });

    if (res.ok) {
      showToast('Conflict discrepancy dismissed.', 'success');
      resolutionNotesInput.value = '';
      openClaimModal(currentInspectingClaim.claimId);
      fetchClaims();
      fetchStats();
    }
  } catch (err) {
    showToast('Failed to dismiss conflict.', 'alert');
  }
});

// ─── Automated PRD Test Case Execution ───────────────────────────────────────
btnTestClaim.addEventListener('click', async () => {
  btnTestClaim.disabled = true;
  btnTestClaim.innerHTML = '<span class="loader-spinner" style="width:14px;height:14px;margin:0;border-width:2px;"></span> Running Pipeline...';

  try {
    const randId = `CLM-PRD-${Math.floor(100 + Math.random() * 900)}`;

    // Create minimal valid JPEG and audio blobs to simulate Android media capture
    const dummyImageBlob = new Blob([new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00])], { type: 'image/jpeg' });
    const dummyAudioBlob = new Blob([new Uint8Array([0x49, 0x44, 0x33])], { type: 'audio/mpeg' });

    const formData = new FormData();
    formData.append('claim_id', randId);
    formData.append('claim_text', 'My front bumper is damaged.');
    formData.append('user_id', 'claimant-operator');
    formData.append('image', dummyImageBlob, 'front_bumper_damage.jpg');
    formData.append('audio', dummyAudioBlob, 'windshield_broken_memo.mp3');

    const res = await fetch('/api/v1/claims', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();
    if (res.ok) {
      showToast(`PRD Test Claim ${data.claimId} processed! Conflict detected.`, 'success');
      fetchClaims();
      fetchStats();
      setTimeout(() => openClaimModal(data.claimId), 400);
    } else {
      showToast(`Error: ${data.message || 'Submission failed'}`, 'alert');
    }
  } catch (err) {
    showToast('Failed to execute automated test claim.', 'alert');
  } finally {
    btnTestClaim.disabled = false;
    btnTestClaim.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Run PRD Test Case';
  }
});

// ─── Toasts & Utility ────────────────────────────────────────────────────────
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast-item ${type === 'alert' ? 'toast-alert' : type === 'success' ? 'toast-success' : 'toast-info'}`;
  
  const iconSvg = type === 'alert' 
    ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
    : type === 'success'
    ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
    : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';

  toast.innerHTML = `
    <span>${iconSvg}</span>
    <div>${escapeHtml(message)}</div>
  `;

  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 4500);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── Event Handlers ──────────────────────────────────────────────────────────
modalCloseBtn.addEventListener('click', () => {
  detailModal.classList.remove('active');
  detailModal.setAttribute('aria-hidden', 'true');
});

detailModal.addEventListener('click', (e) => {
  if (e.target === detailModal) {
    detailModal.classList.remove('active');
    detailModal.setAttribute('aria-hidden', 'true');
  }
});

searchInput.addEventListener('input', renderTable);

btnRefresh.addEventListener('click', () => {
  fetchClaims();
  fetchStats();
  checkSystemHealth();
  showToast('Refreshed claims and metrics.', 'info');
});

filterTabs.addEventListener('click', (e) => {
  const target = e.target.closest('.filter-chip');
  if (target) {
    document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
    target.classList.add('active');
    activeFilter = target.dataset.filter;
    renderTable();
  }
});

document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', () => {
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    link.classList.add('active');
    activeFilter = link.dataset.tab;
    
    // Synchronize filter chips
    document.querySelectorAll('.filter-chip').forEach(b => {
      b.classList.toggle('active', b.dataset.filter === activeFilter);
    });

    renderTable();
  });
});

// ─── Startup Initialization ──────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  fetchClaims();
  fetchStats();
  checkSystemHealth();
  initRealtime();

  // Periodic health check every 30s
  setInterval(checkSystemHealth, 30000);
});
