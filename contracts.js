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
    } else if (st === 'pending review') {
      statusBadge = '<span class="badge badge-sent" style="background:#fff3e0;color:#e65100;border-color:#ffcc80;">&#x1F4CB; Pending Review</span>';
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

  var showMessages = (c.status||'').toLowerCase() !== 'pending review';
  if (showMessages) {
    html += '<div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--muted);margin:20px 0 8px;">Messages</div>';
    html += '<div class="msg-thread" id="modalMsgThread"><div class="msg-empty">Loading…</div></div>';
    html += '<div class="msg-inline-error" id="modalMsgError" style="display:none;color:#c62828;font-size:0.8rem;margin-bottom:8px;"></div>';
    html += '<div class="msg-compose">';
    html += '<textarea class="msg-input" id="modalMsgInput" placeholder="Ask the Contract Agent a question or request a change…"></textarea>';
    html += '<button class="btn-msg-send" id="modalMsgSendBtn" onclick="sendModalMessage(\'' + c.contractId + '\')">Send</button>';
    html += '</div>';
  }

  document.getElementById('modalTitle').textContent = esc(c.bandName) + ' — ' + esc(c.venueName);
  document.getElementById('modalBody').innerHTML    = html;
  document.getElementById('modalOverlay').classList.add('open');

  if (showMessages) loadModalMessages(c.contractId);
}

function loadModalMessages(contractId) {
  callApi('api_getAllContractMessagesForAgent', [contractId]).then(function(msgs) {
    renderModalMessages(msgs || []);
  }).catch(function() {
    var el = document.getElementById('modalMsgThread');
    if (el) el.innerHTML = '<div class="msg-empty">Couldn\'t load messages.</div>';
  });
}

function renderModalMessages(msgs) {
  var el = document.getElementById('modalMsgThread');
  if (!el) return;
  var roleNames = { band: 'Band', venue: 'Venue', agent: 'You', contractagent: 'Contract Agent' };
  var channelLabels = { band: 'Band thread', venue: 'Venue thread', agent: 'Your thread' };
  if (msgs.length === 0) {
    el.innerHTML = '<div class="msg-empty">No messages yet. Ask a question below if you need anything changed.</div>';
    return;
  }
  el.innerHTML = msgs.map(function(m) {
    if (m.fromRole === 'contractagent' && m.text.indexOf('Sent a revised contract') === 0) {
      return '<div class="msg-bubble system">[' + esc(channelLabels[m.channel] || m.channel) + '] ' + esc(m.text) + ' &bull; ' + esc(m.createdAt) + '</div>';
    }
    var cls = m.fromRole === 'agent' ? 'mine' : 'theirs';
    return '<div class="msg-bubble ' + cls + '">' +
      '<div class="msg-meta">' + esc(roleNames[m.fromRole] || m.fromRole) + ' &bull; ' + esc(channelLabels[m.channel] || m.channel) + ' &bull; ' + esc(m.createdAt) + '</div>' +
      esc(m.text) +
    '</div>';
  }).join('');
  el.scrollTop = el.scrollHeight;
}

async function sendModalMessage(contractId) {
  var input = document.getElementById('modalMsgInput');
  var text = input.value.trim();
  if (!text) return;
  var btn = document.getElementById('modalMsgSendBtn');
  btn.disabled = true;
  btn.textContent = 'Sending…';
  try {
    await callApi('api_postContractMessage', [contractId, 'agent', 'agent', 'Booking Agent', text]);
    input.value = '';
    var errEl = document.getElementById('modalMsgError');
    if (errEl) errEl.style.display = 'none';
    loadModalMessages(contractId);
  } catch (e) {
    var errEl2 = document.getElementById('modalMsgError');
    if (errEl2) { errEl2.textContent = 'Error sending message: ' + e.message; errEl2.style.display = 'block'; }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send';
  }
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
