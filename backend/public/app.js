// ClaimLens Admin Dashboard Real-Time Application

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
const wsStatusText = document.querySelector('.status-text');

// Stat Elements
const statTotal = document.getElementById('stat-total');
const statConflicts = document.getElementById('stat-conflicts');
const statResolved = document.getElementById('stat-resolved');
const pillAll = document.getElementById('pill-all');
const pillConflicts = document.getElementById('pill-conflicts');
const pillResolved = document.getElementById('pill-resolved');
const pillClear = document.getElementById('pill-clear');

// ─── Real-Time WebSocket & SSE Setup ──────────────────────────────────────────
function initRealtime() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  let ws = null;
  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[WS] Connected to ClaimLens Real-Time stream.');
      wsStatusText.textContent = 'Real-Time Live (WS)';
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        handleRealTimeEvent(payload);
      } catch (err) {
        console.error('[WS] Parse error:', err);
      }
    };

    ws.onclose = () => {
      console.warn('[WS] Closed. Falling back to SSE...');
      wsStatusText.textContent = 'Connecting SSE...';
      initSSEFallback();
    };

    ws.onerror = (err) => {
      console.warn('[WS] Error:', err);
    };
  } catch (e) {
    initSSEFallback();
  }
}

function initSSEFallback() {
  if (!window.EventSource) return;
  const sse = new EventSource('/api/v1/events');

  sse.onopen = () => {
    console.log('[SSE] Connected to ClaimLens SSE stream.');
    wsStatusText.textContent = 'Real-Time Live (SSE)';
  };

  sse.addEventListener('claim:created', (e) => handleRealTimeEvent(JSON.parse(e.data)));
  sse.addEventListener('claim:updated', (e) => handleRealTimeEvent(JSON.parse(e.data)));
  sse.addEventListener('conflict:detected', (e) => handleRealTimeEvent(JSON.parse(e.data)));
  sse.addEventListener('conflict:resolved', (e) => handleRealTimeEvent(JSON.parse(e.data)));
  sse.addEventListener('stats:updated', (e) => handleRealTimeEvent(JSON.parse(e.data)));

  sse.onerror = () => {
    wsStatusText.textContent = 'Reconnecting...';
  };
}

function handleRealTimeEvent(event) {
  const { type, data } = event;
  console.log(`[RealTime Event] ${type}`, data);

  if (type === 'claim:created') {
    showToast(`New Claim ${data.claimId} received. AI analysis running...`, 'info');
    fetchClaims();
  } else if (type === 'conflict:detected') {
    showToast(`⚠️ Conflict Detected on Claim ${data.claimId}! Type: ${data.conflictType}`, 'alert');
    fetchClaims();
    fetchStats();
  } else if (type === 'claim:updated' || type === 'conflict:resolved') {
    fetchClaims();
    fetchStats();
    if (currentInspectingClaim && currentInspectingClaim.claimId === (data.claimId || data.id)) {
      openClaimModal(data.claimId || data.id);
    }
  } else if (type === 'stats:updated') {
    updateStatsUI(data);
  }
}

// ─── Data Fetching ───────────────────────────────────────────────────────────
async function fetchClaims() {
  try {
    const res = await fetch('/api/v1/claims');
    const data = await res.json();
    allClaims = data.claims || [];
    renderTable();
    updatePills();
  } catch (err) {
    console.error('Failed to fetch claims:', err);
  }
}

async function fetchStats() {
  try {
    const res = await fetch('/api/v1/stats');
    const stats = await res.json();
    updateStatsUI(stats);
  } catch (err) {
    console.error('Failed to fetch stats:', err);
  }
}

function updateStatsUI(stats) {
  if (!stats) return;
  statTotal.textContent = stats.totalClaims || 0;
  statConflicts.textContent = stats.unresolvedConflicts || 0;
  statResolved.textContent = stats.resolvedClaims || 0;
  pillAll.textContent = stats.totalClaims || 0;
  pillConflicts.textContent = stats.unresolvedConflicts || 0;
  pillResolved.textContent = stats.resolvedClaims || 0;
  pillClear.textContent = stats.clearClaims || 0;
}

function updatePills() {
  pillAll.textContent = allClaims.length;
  pillConflicts.textContent = allClaims.filter(c => c.status === 'CONFLICT_DETECTED' || c.status === 'UNRESOLVED').length;
  pillResolved.textContent = allClaims.filter(c => c.status === 'RESOLVED').length;
  pillClear.textContent = allClaims.filter(c => c.status === 'CLEAR').length;
}

// ─── Rendering Table ─────────────────────────────────────────────────────────
function renderTable() {
  const searchTerm = (searchInput.value || '').toLowerCase().trim();

  let filtered = allClaims.filter(claim => {
    // Search filter
    const matchesSearch = !searchTerm ||
      (claim.claimId && claim.claimId.toLowerCase().includes(searchTerm)) ||
      (claim.claimText && claim.claimText.toLowerCase().includes(searchTerm)) ||
      (claim.status && claim.status.toLowerCase().includes(searchTerm));

    // Tab filter
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
          <span>No insurance claims found matching criteria.</span>
        </td>
      </tr>
    `;
    return;
  }

  claimsTableBody.innerHTML = filtered.map(claim => {
    const statusUpper = (claim.status || '').toUpperCase();
    let statusClass = 'processing';
    let statusLabel = 'PROCESSING';

    if (statusUpper === 'CONFLICT_DETECTED' || statusUpper === 'UNRESOLVED') {
      statusClass = 'conflict';
      statusLabel = '⚠️ CONFLICT';
    } else if (statusUpper === 'CLEAR') {
      statusClass = 'clear';
      statusLabel = '✅ CLEAR';
    } else if (statusUpper === 'RESOLVED') {
      statusClass = 'resolved';
      statusLabel = '🛡️ RESOLVED';
    }

    const hasImage = Boolean(claim.imageUrl);
    const hasAudio = Boolean(claim.audioUrl);

    const conflict = claim.conflicts && claim.conflicts.length > 0 ? claim.conflicts[0] : null;
    let conflictSummary = '<span style="color:var(--text-dim)">None</span>';
    if (conflict) {
      conflictSummary = `<strong style="color:var(--rose)">${conflict.conflictType}</strong> (${Math.round(conflict.confidence * 100)}% conf)`;
    }

    const formattedDate = claim.createdAt ? new Date(claim.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now';

    return `
      <tr>
        <td>
          <span class="claim-id-badge">${escapeHtml(claim.claimId)}</span>
        </td>
        <td>
          <div style="font-weight:500;color:#fff">${escapeHtml(claim.userId || 'Claimant')}</div>
          <small style="color:var(--text-dim)">${formattedDate}</small>
        </td>
        <td style="max-width:280px;line-height:1.4">
          ${escapeHtml(claim.claimText || '')}
        </td>
        <td>
          <div class="media-badges">
            ${hasImage ? '<span class="media-badge" title="Photo Attached">📷</span>' : ''}
            ${hasAudio ? '<span class="media-badge" title="Voice Memo Attached">🎙️</span>' : ''}
            ${!hasImage && !hasAudio ? '<small style="color:var(--text-dim)">Text only</small>' : ''}
          </div>
        </td>
        <td>
          <span class="status-tag ${statusClass}">${statusLabel}</span>
        </td>
        <td>
          ${conflictSummary}
        </td>
        <td>
          <button class="btn-inspect" onclick="openClaimModal('${claim.claimId}')">
            Inspect Evidence 🔍
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// ─── Modal Inspection & Resolution ──────────────────────────────────────────
async function openClaimModal(claimId) {
  try {
    const res = await fetch(`/api/v1/claims/${claimId}`);
    const claim = await res.json();
    currentInspectingClaim = claim;

    document.getElementById('modal-claim-id').textContent = claim.claimId;
    document.getElementById('modal-claim-text').textContent = `"${claim.claimText || ''}"`;
    document.getElementById('modal-date').textContent = `Submitted: ${new Date(claim.createdAt).toLocaleString()}`;

    // Status Badge
    const badge = document.getElementById('modal-status-badge');
    badge.className = 'status-tag ' + (
      claim.status === 'CONFLICT_DETECTED' || claim.status === 'UNRESOLVED' ? 'conflict' :
      claim.status === 'RESOLVED' ? 'resolved' :
      claim.status === 'CLEAR' ? 'clear' : 'processing'
    );
    badge.textContent = claim.status;

    // Photo Box
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
      photoContainer.innerHTML = '<span class="no-media">No photo uploaded</span>';
      imageAnalysisBox.style.display = 'none';
    }

    // Audio Box
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
      audioContainer.innerHTML = '<span class="no-media">No audio recorded</span>';
      transcriptionBox.style.display = 'none';
    }

    // Conflict Box
    const conflictBox = document.getElementById('modal-conflict-box');
    const conflict = claim.conflicts && claim.conflicts.length > 0 ? claim.conflicts[0] : null;
    currentConflict = conflict;

    if (conflict) {
      conflictBox.style.display = 'block';
      document.getElementById('modal-conflict-type').textContent = (conflict.conflictType || 'CONTRADICTION').toUpperCase();
      document.getElementById('modal-evidence-a').textContent = conflict.evidenceA || 'Primary evidence statement';
      document.getElementById('modal-evidence-b').textContent = conflict.evidenceB || 'Contradictory evidence statement';
      document.getElementById('modal-explanation').textContent = conflict.explanation || 'Contradiction detected across evidence streams.';

      const confPercent = Math.round((conflict.confidence || 0.8) * 100);
      document.getElementById('modal-confidence-val').textContent = `${confPercent}%`;
      document.getElementById('modal-confidence-bar').style.width = `${confPercent}%`;

      // Resolution Section
      const resSection = document.getElementById('modal-resolution-section');
      resSection.style.display = 'block';
      renderResolutionHistory(conflict.resolutions || []);
    } else {
      conflictBox.style.display = 'none';
      document.getElementById('modal-resolution-section').style.display = 'none';
    }

    detailModal.classList.add('active');
  } catch (err) {
    console.error('Failed to open claim modal:', err);
  }
}

function renderResolutionHistory(resolutions) {
  const list = document.getElementById('modal-resolutions-list');
  if (!resolutions || resolutions.length === 0) {
    list.innerHTML = '';
    return;
  }

  list.innerHTML = resolutions.map(r => `
    <div style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:8px;padding:12px;margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:12px">
        <strong style="color:var(--emerald)">Resolved by ${escapeHtml(r.resolvedBy || 'Admin')}</strong>
        <span style="color:var(--text-dim)">${new Date(r.resolvedAt).toLocaleString()}</span>
      </div>
      <p style="font-size:13px;color:#fff">${escapeHtml(r.resolutionNotes || '')}</p>
    </div>
  `).join('');
}

// ─── Resolution Submit ───────────────────────────────────────────────────────
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
        resolvedBy: 'Lead Claims Adjuster',
      }),
    });

    if (res.ok) {
      showToast('Conflict resolved and claim updated!', 'success');
      resolutionNotesInput.value = '';
      openClaimModal(currentInspectingClaim.claimId);
      fetchClaims();
      fetchStats();
    } else {
      const err = await res.json();
      showToast(err.message || 'Failed to resolve conflict.', 'alert');
    }
  } catch (err) {
    showToast('Network error resolving conflict.', 'alert');
  }
});

btnDismissConflict.addEventListener('click', async () => {
  if (!currentConflict) return;
  const notes = resolutionNotesInput.value.trim() || 'Adjuster verified and dismissed conflict.';
  try {
    const res = await fetch(`/api/v1/conflicts/${currentConflict.conflictId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resolutionNotes: notes,
        resolvedStatus: 'dismissed',
        resolvedBy: 'Lead Claims Adjuster',
      }),
    });
    if (res.ok) {
      showToast('Conflict dismissed.', 'success');
      resolutionNotesInput.value = '';
      openClaimModal(currentInspectingClaim.claimId);
      fetchClaims();
      fetchStats();
    }
  } catch (err) {
    showToast('Failed to dismiss conflict.', 'alert');
  }
});

// ─── PRD Test Case Runner ────────────────────────────────────────────────────
btnTestClaim.addEventListener('click', async () => {
  btnTestClaim.disabled = true;
  btnTestClaim.innerHTML = '<span class="spinner" style="width:16px;height:16px;margin:0"></span> Running PRD Test...';

  try {
    const randId = `CLM-PRD-${Math.floor(100 + Math.random() * 900)}`;

    // Create a 1x1 transparent dummy JPEG and tiny audio buffer to simulate files
    const dummyImageBlob = new Blob([new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46])], { type: 'image/jpeg' });
    const dummyAudioBlob = new Blob([new Uint8Array([0xFF, 0xFB, 0x90, 0x64])], { type: 'audio/mpeg' });

    const formData = new FormData();
    formData.append('claim_id', randId);
    formData.append('claim_text', 'My front bumper is damaged.');
    formData.append('user_id', 'claimant-gayathri');
    formData.append('image', dummyImageBlob, 'front_bumper_damage.jpg');
    formData.append('audio', dummyAudioBlob, 'windshield_broken_memo.mp3');

    const res = await fetch('/api/v1/claims', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();
    if (res.ok) {
      showToast(`PRD Test Claim ${data.claimId} submitted successfully!`, 'success');
      fetchClaims();
      fetchStats();
      setTimeout(() => openClaimModal(data.claimId), 500);
    } else {
      showToast(`Error: ${data.message || 'Submission failed'}`, 'alert');
    }
  } catch (err) {
    showToast('Failed to execute PRD test submission.', 'alert');
  } finally {
    btnTestClaim.disabled = false;
    btnTestClaim.innerHTML = '<span class="icon">⚡</span> Run PRD Test Case';
  }
});

// ─── Helper Functions ────────────────────────────────────────────────────────
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'alert' ? 'alert' : type === 'success' ? 'success' : ''}`;
  toast.innerHTML = `
    <span>${type === 'alert' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️'}</span>
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

// Event Listeners
modalCloseBtn.addEventListener('click', () => detailModal.classList.remove('active'));
detailModal.addEventListener('click', (e) => {
  if (e.target === detailModal) detailModal.classList.remove('active');
});

searchInput.addEventListener('input', renderTable);
btnRefresh.addEventListener('click', () => {
  fetchClaims();
  fetchStats();
  showToast('Refreshed claims & metrics.', 'info');
});

filterTabs.addEventListener('click', (e) => {
  if (e.target.classList.contains('filter-btn')) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    activeFilter = e.target.dataset.filter;
    renderTable();
  }
});

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    activeFilter = item.dataset.tab;
    renderTable();
  });
});

// Initialize on Load
window.addEventListener('DOMContentLoaded', () => {
  fetchClaims();
  fetchStats();
  initRealtime();
});
