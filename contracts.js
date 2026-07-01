// ============================================================================
// contracts.js — logic for contracts.html
// Converted from google.script.run to callApi() (see api.js).
// agentId read from sessionStorage (set at login).
// ============================================================================

var allContracts     = [];
var currentFilter    = 'all';
var currentSort      = 'date';
var sortAsc          = false;
var _lastFilteredRows = [];

window.onload = function() {
  var agentId = sessionStorage.getItem('dka_id');
  if (!agentId) { window.location.href = 'index.html'; return; }

  callApi('api_getContractsForAgent', [agentId]).then(function(contracts) {
    allContracts = contracts || [];
    document.getElementById('loadingState').style.display = 'none';
    updateStats();
    renderTable();
  }).catch(function(err) {
    document.getElementById('loadingState').innerHTML =
      '<p style="color:#D32F2F;">Error loading contracts: ' + esc(err.message) + '</p>';
  });
};

function updateStats() {
  var signed  = allContracts.filter(function(c){ return (c.status||'').toLowerCase()==='signed'; }).length;
  var pending = allContracts.length - signed;
  document.getElementById('statTotal').textContent   = allContracts.length;
  document.getElementById('statSigned').textContent  = signed;
  document.getElementById('statPending').textContent = pending;
}

function setFilter(f) {
  currentFilter = f;
  ['All','Signed','Sent'].forEach(function(x) {
    var btn = document.getElementById('tab' + x);
    if (btn) btn.classList.toggle('active', f === x.toLowerCase() || (f === 'all' && x === 'All'));
  });
  renderTable();
}

function sortBy(col) {
  if (currentSort === col) sortAsc = !sortAsc;
  else { currentSort = col; sortAsc = true; }
  renderTable();
}

function renderTable() {
  var query = (document.getElementById('searchInput').value || '').toLowerCase();
  var rows  = allContracts.filter(function(c) {
    if (currentFilter === 'signed' && (c.status||'').toLowerCase() !== 'signed') return false;
    if (currentFilter === 'sent'   && (c.status||'').toLowerCase() === 'signed') return false;
    if (query) {
      return (c.bandName||'').toLowerCase().indexOf(query)  !== -1 ||
             (c.venueName||'').toLowerCase().indexOf(query) !== -1;
    }
    return true;
  });

  rows.sort(function(a, b) {
    var av = String(a[currentSort]||''), bv = String(b[currentSort]||'');
    return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  _lastFilteredRows = rows;

  if (!rows.length) {
    document.getElementById('tableWrap').style.display  = 'none';
    document.getElementById('emptyState').style.display = 'block';
    return;
  }
  document.getElementById('tableWrap').style.display  = 'block';
  document.getElementById('emptyState').style.display = 'none';

  document.getElementById('contractsTbody').innerHTML = rows.map(function(c, idx) {
    var st = (c.status||'').toLowerCase();
    var statusBadge;
    if (st === 'signed') {
      statusBadge = '<span class="badge badge-signed">&#x2705; Fully Signed</span>';
    } else if (st === 'awaiting band') {
      statusBadge = '<span class="badge badge-sent">&#x23F3; Awaiting Band</span>';
    } else if (st === 'awaiting venue') {
      statusBadge = '<span class="badge badge-sent" style="background:#f3e5f5;color:#6a1b9a;border-color:#ce93d8;">&#x23F3; Awaiting Venue</span>';
    } else {
      statusBadge = '<span class="badge badge-sent">&#x23F3; Awaiting Both</span>';
    }

    var signedCell = '';
    if (c.bandSignedName)  signedCell += '<div style="font-size:0.72rem;color:#2e7d32;font-weight:600;">&#x1F3B8; ' + esc(c.bandSignedName) + '</div>';
    if (c.venueSignedName) signedCell += '<div style="font-size:0.72rem;color:#6a1b9a;font-weight:600;">&#x1F3DB; ' + esc(c.venueSignedName) + '</div>';
    if (!signedCell) signedCell = '<span style="color:var(--dim);font-size:0.75rem;">—</span>';

    return '<tr>' +
      '<td><div class="td-band">' + esc(c.bandName) + '</div></td>' +
      '<td><div class="td-venue">' + esc(c.venueName) + '</div></td>' +
      '<td class="td-date">' + esc(c.date) + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td class="td-sent">' + esc(c.sentAt||'—') + '</td>' +
      '<td>' + signedCell + '</td>' +
      '<td style="white-space:nowrap;">' +
        '<button class="btn-view" data-idx="' + idx + '" onclick="viewContractIdx(this)">View</button>' +
      '</td>' +
      '</tr>';
  }).join('');
}

function viewContractIdx(btn) {
  var c = _lastFilteredRows[parseInt(btn.getAttribute('data-idx'))];
  if (c) showContractModal(c);
}

function showContractModal(c) {
  var isSigned = (c.status||'').toLowerCase() === 'signed';
  var badge = isSigned
    ? '<span class="badge badge-signed" style="font-size:0.82rem;">&#x2705; Signed</span>'
    : '<span class="badge badge-sent"   style="font-size:0.82rem;">&#x23F3; Awaiting Signature</span>';

  var html = '<div class="modal-meta">';
  html += metaCell('Band',             esc(c.bandName));
  html += metaCell('Venue',            esc(c.venueName));
  html += metaCell('Performance Date', esc(c.date));
  html += metaCell('Status',           badge);
  html += metaCell('Sent',             esc(c.sentAt||'—'));
  html += metaCell('Booking #',        esc(String(c.bookingId||'—')));
  html += '</div>';

  html += '<div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--muted);margin-bottom:8px;">Contract Text</div>';
  html += '<div class="contract-body">' + esc(c.contractText||'') + '</div>';

  if (c.bandSignedName) {
    html += '<div class="sig-box"><div class="sig-icon">&#x1F3B8;</div><div class="sig-text"><strong>Band signed: ' + esc(c.bandSignedName) + '</strong><span>on ' + esc(c.bandSignedAt) + '</span></div></div>';
  } else {
    html += '<div class="unsig-box" style="margin-top:12px;">&#x23F3; Awaiting band signature from ' + esc(c.bandName) + '</div>';
  }
  if (c.venueSignedName) {
    html += '<div class="sig-box" style="margin-top:10px;background:#f3e5f5;border-color:#ce93d8;"><div class="sig-icon">&#x1F3DB;</div><div class="sig-text"><strong>Venue signed: ' + esc(c.venueSignedName) + '</strong><span>on ' + esc(c.venueSignedAt) + '</span></div></div>';
  } else {
    html += '<div class="unsig-box" style="margin-top:10px;background:#f3e5f5;border-color:#ce93d8;color:#6a1b9a;">&#x23F3; Awaiting venue signature from ' + esc(c.venueName) + '</div>';
  }

  document.getElementById('modalTitle').textContent = esc(c.bandName) + ' — ' + esc(c.venueName);
  document.getElementById('modalBody').innerHTML    = html;
  document.getElementById('modalOverlay').classList.add('open');
}

function metaCell(label, value) {
  return '<div class="meta-cell"><div class="meta-cell-label">' + label + '</div><div class="meta-cell-value">' + value + '</div></div>';
}

function closeModal(e) {
  if (!e || e.target === document.getElementById('modalOverlay')) {
    document.getElementById('modalOverlay').classList.remove('open');
  }
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function goToDashboard() { window.location.href = 'agent-dashboard.html'; }
