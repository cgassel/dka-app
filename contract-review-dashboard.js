// ============================================================================
// contract-review-dashboard.js — logic for contract-review-dashboard.html
// ============================================================================

var contractAgentId   = sessionStorage.getItem('dka_id');
var contractAgentName = sessionStorage.getItem('dka_name') || 'Contract Agent';
var pendingContracts   = [];
var attentionContracts = [];
var currentQueue = 'pending';

(function checkSession() {
  if (sessionStorage.getItem('dka_role') !== 'contractagent' || !contractAgentId) {
    window.location.href = 'index.html';
  }
})();

window.onload = function() {
  document.getElementById('agentNameLabel').textContent = contractAgentName;
  loadBothQueues();
};

// Supports links from the "new message" notification email:
// contract-review-dashboard.html?openContract=X&channel=band|venue|agent
function _checkDeepLink() {
  var params = new URLSearchParams(window.location.search);
  var openContract = params.get('openContract');
  var channel       = params.get('channel');
  if (!openContract) return;

  switchQueue('attention');
  var idx = attentionContracts.findIndex(function(c) {
    return String(c.contractId) === String(openContract) && (!channel || c.channel === channel);
  });
  if (idx !== -1) {
    toggleAttentionCard(idx);
  } else {
    showToast('That conversation is no longer open — it may have already been handled.', 'error');
  }
  // Clean the URL so refreshing doesn't re-trigger this.
  if (window.history && window.history.replaceState) {
    window.history.replaceState({}, '', window.location.pathname);
  }
}

function loadBothQueues() {
  Promise.all([
    callApi('api_getPendingContractReviews', []).catch(function() { return []; }),
    callApi('api_getContractsNeedingAttention', []).catch(function() { return []; })
  ]).then(function(results) {
    pendingContracts   = results[0] || [];
    attentionContracts = results[1] || [];
    updateTabCounts();
    renderQueueBanner();
    renderList();
    _checkDeepLink();
  }).catch(function(e) {
    showToast('Error loading contracts: ' + e.message, 'error');
  });
}

function updateTabCounts() {
  document.getElementById('pendingCount').textContent   = pendingContracts.length;
  document.getElementById('attentionCount').textContent = attentionContracts.length;
}

function switchQueue(queue) {
  currentQueue = queue;
  document.getElementById('tabPending').classList.toggle('active', queue === 'pending');
  document.getElementById('tabAttention').classList.toggle('active', queue === 'attention');
  renderQueueBanner();
  renderList();
}

function renderQueueBanner() {
  var banner = document.getElementById('queueBanner');
  var title  = document.getElementById('queueTitle');
  var sub    = document.getElementById('queueSub');
  var list   = currentQueue === 'pending' ? pendingContracts : attentionContracts;
  var n      = list.length;

  if (n === 0) {
    banner.classList.add('empty');
    title.textContent = 'All caught up';
    sub.textContent = currentQueue === 'pending'
      ? 'No contracts are currently awaiting review.'
      : 'No open questions or change requests right now.';
  } else {
    banner.classList.remove('empty');
    if (currentQueue === 'pending') {
      title.textContent = n + ' contract' + (n === 1 ? '' : 's') + ' awaiting review';
      sub.textContent = 'Review the language below, edit anything that needs it, then send.';
    } else {
      title.textContent = n + ' contract' + (n === 1 ? '' : 's') + ' need' + (n === 1 ? 's' : '') + ' your attention';
      sub.textContent = 'Someone is waiting on a reply, a change, or both.';
    }
  }
}

function renderList() {
  if (currentQueue === 'pending') renderPendingList();
  else renderAttentionList();
}

function renderPendingList() {
  var container = document.getElementById('listContainer');

  if (pendingContracts.length === 0) {
    container.innerHTML =
      '<div class="empty-state">' +
        '<div class="empty-state-icon">&#9989;</div>' +
        '<p>Nothing to review right now. New bookings will show up here automatically.</p>' +
      '</div>';
    return;
  }

  var html = '';
  pendingContracts.forEach(function(c, idx) {
    html +=
      '<div class="contract-card" id="p-card-' + idx + '">' +
        '<div class="contract-card-hdr" onclick="togglePendingCard(' + idx + ')">' +
          '<div>' +
            '<div class="contract-card-title">' + esc(c.bandName) + ' @ ' + esc(c.venueName) + '</div>' +
            '<div class="contract-card-sub">Booking #' + esc(c.bookingId) + '</div>' +
          '</div>' +
          '<div class="contract-card-meta">' +
            '<div class="contract-card-date">' + esc(c.date) + '</div>' +
            '<div class="contract-card-created">Created ' + esc(c.createdAt) + '</div>' +
          '</div>' +
          '<div class="contract-card-chevron">&#9654;</div>' +
        '</div>' +
        '<div class="contract-card-body">' +
          '<div class="contract-card-body-inner">' +
            '<div class="contract-meta-row">' +
              '<div class="contract-meta-item"><div class="label">Band Email</div><div class="value' + (c.bandEmail ? '' : ' missing') + '">' + (c.bandEmail ? esc(c.bandEmail) : 'Missing — won\'t be sent') + '</div></div>' +
              '<div class="contract-meta-item"><div class="label">Venue Email</div><div class="value' + (c.venueEmail ? '' : ' missing') + '">' + (c.venueEmail ? esc(c.venueEmail) : 'Missing — won\'t be sent') + '</div></div>' +
            '</div>' +
            '<textarea class="contract-textarea" id="contractText-' + idx + '">' + esc(c.contractText) + '</textarea>' +
            '<div class="contract-actions">' +
              '<button class="btn-collapse" onclick="togglePendingCard(' + idx + ')">Collapse</button>' +
              '<button class="btn-approve" id="approveBtn-' + idx + '" onclick="approveAndSend(' + idx + ')">&#10003; Approve &amp; Send to Band + Venue</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  });
  document.getElementById('listContainer').innerHTML = html;
}

function togglePendingCard(idx) {
  toggleAnyCard('p-card-' + idx);
}

// ── Needs Attention queue ───────────────────────────────────────────────────

function renderAttentionList() {
  var container = document.getElementById('listContainer');

  if (attentionContracts.length === 0) {
    container.innerHTML =
      '<div class="empty-state">' +
        '<div class="empty-state-icon">&#128172;</div>' +
        '<p>No open conversations right now.</p>' +
      '</div>';
    return;
  }

  var html = '';
  var channelLabels = { band: 'Band', venue: 'Venue', agent: 'Booking Agent' };
  attentionContracts.forEach(function(c, idx) {
    html +=
      '<div class="contract-card" id="a-card-' + idx + '">' +
        '<div class="contract-card-hdr" onclick="toggleAttentionCard(' + idx + ')">' +
          '<div>' +
            '<div class="contract-card-title">' + esc(c.bandName) + ' @ ' + esc(c.venueName) + ' <span class="channel-pill">' + esc(channelLabels[c.channel] || c.channel) + '</span></div>' +
            '<div class="contract-card-sub">Booking #' + esc(c.bookingId) + ' &bull; ' + esc(c.status) + '</div>' +
          '</div>' +
          '<div class="contract-card-meta">' +
            '<div class="contract-card-date">' + esc(c.date) + '</div>' +
            '<div class="contract-card-created">Last message ' + esc(c.lastMessageAt) + '</div>' +
          '</div>' +
          '<div class="contract-card-chevron">&#9654;</div>' +
        '</div>' +
        '<div class="contract-card-body">' +
          '<div class="contract-card-body-inner">' +
            '<div class="msg-thread" id="thread-' + idx + '">' +
              '<div class="msg-empty">Loading conversation…</div>' +
            '</div>' +
            '<div class="msg-compose">' +
              '<textarea class="msg-input" id="reply-' + idx + '" placeholder="Reply without changing the contract…"></textarea>' +
              '<button class="btn-msg-send" id="replyBtn-' + idx + '" onclick="sendReply(' + idx + ')">Reply</button>' +
            '</div>' +
            '<div class="revise-label">Or revise the contract and send a new version</div>' +
            '<textarea class="contract-textarea" id="reviseText-' + idx + '">' + esc(c.contractText) + '</textarea>' +
            '<div class="contract-actions">' +
              '<button class="btn-collapse" onclick="toggleAttentionCard(' + idx + ')">Collapse</button>' +
              '<button class="btn-approve" id="reviseBtn-' + idx + '" onclick="reviseAndSend(' + idx + ')">&#10003; Send Revised Contract for Signatures</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  });
  document.getElementById('listContainer').innerHTML = html;
}

function toggleAttentionCard(idx) {
  var wasOpening = !document.getElementById('a-card-' + idx).classList.contains('open');
  toggleAnyCard('a-card-' + idx);
  if (wasOpening) loadThread(idx);
}

function toggleAnyCard(cardId) {
  var card = document.getElementById(cardId);
  var wasOpen = card.classList.contains('open');
  document.querySelectorAll('.contract-card.open').forEach(function(c) { c.classList.remove('open'); });
  if (!wasOpen) {
    card.classList.add('open');
    setTimeout(function() { card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 100);
  }
}

function loadThread(idx) {
  var c = attentionContracts[idx];
  if (!c) return;
  callApi('api_getContractMessages', [c.contractId, c.channel]).then(function(msgs) {
    renderThread(idx, msgs || []);
  }).catch(function() {
    document.getElementById('thread-' + idx).innerHTML = '<div class="msg-empty">Couldn\'t load the conversation.</div>';
  });
}

function renderThread(idx, msgs) {
  var el = document.getElementById('thread-' + idx);
  var c  = attentionContracts[idx];
  var roleNames = { band: 'Band', venue: 'Venue', agent: 'Booking Agent', contractagent: contractAgentName };
  if (msgs.length === 0) {
    el.innerHTML = '<div class="msg-empty">No messages.</div>';
    return;
  }
  el.innerHTML = msgs.map(function(m) {
    if (m.fromRole === 'contractagent' && m.text.indexOf('Sent a revised contract') === 0) {
      return '<div class="msg-bubble system">' + esc(m.text) + ' &bull; ' + esc(m.createdAt) + '</div>';
    }
    var cls = m.fromRole === 'contractagent' ? 'mine' : 'theirs';
    return '<div class="msg-bubble ' + cls + '">' +
      '<div class="msg-meta">' + esc(roleNames[m.fromRole] || m.fromRole) + ' &bull; ' + esc(m.createdAt) + '</div>' +
      esc(m.text) +
    '</div>';
  }).join('');
  el.scrollTop = el.scrollHeight;
}

async function sendReply(idx) {
  var c = attentionContracts[idx];
  if (!c) return;
  var input = document.getElementById('reply-' + idx);
  var text = input.value.trim();
  if (!text) return;

  var btn = document.getElementById('replyBtn-' + idx);
  btn.disabled = true;
  btn.textContent = 'Sending…';

  try {
    await callApi('api_postContractMessage', [c.contractId, c.channel, 'contractagent', contractAgentName, text]);
    input.value = '';
    loadThread(idx);
    showToast('Reply sent.', 'success');
  } catch (e) {
    showToast('Error sending reply: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Reply';
  }
}

async function reviseAndSend(idx) {
  var c = attentionContracts[idx];
  if (!c) return;

  var textEl = document.getElementById('reviseText-' + idx);
  var finalText = textEl.value;

  if (!c.bandEmail && !c.venueEmail) {
    showToast('Neither the band nor venue has an email on file — nothing to send.', 'error');
    return;
  }

  var btn = document.getElementById('reviseBtn-' + idx);
  btn.disabled = true;
  btn.textContent = 'Sending…';

  try {
    await callApi('api_reviseAndResendContract', [c.contractId, finalText, contractAgentId, contractAgentName]);
    showToast('Revised contract sent to band and venue.', 'success');
    attentionContracts.splice(idx, 1);
    updateTabCounts();
    renderQueueBanner();
    renderList();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = '\u2713 Send Revised Contract for Signatures';
    showToast('Error sending revised contract: ' + e.message, 'error');
  }
}

// ── Pending review: approve first-time send ─────────────────────────────────

async function approveAndSend(idx) {
  var c = pendingContracts[idx];
  if (!c) return;

  var textEl = document.getElementById('contractText-' + idx);
  var finalText = textEl.value;

  if (!c.bandEmail && !c.venueEmail) {
    showToast('Neither the band nor venue has an email on file — nothing to send.', 'error');
    return;
  }

  var btn = document.getElementById('approveBtn-' + idx);
  btn.disabled = true;
  btn.textContent = 'Sending…';

  try {
    await callApi('api_approveAndSendContract', [c.contractId, finalText, contractAgentId, contractAgentName]);
    showToast('Contract sent to band and venue.', 'success');
    pendingContracts.splice(idx, 1);
    updateTabCounts();
    renderQueueBanner();
    renderList();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = '\u2713 Approve & Send to Band + Venue';
    showToast('Error sending contract: ' + e.message, 'error');
  }
}

// ── Add Contract Agent ───────────────────────────────────────────────────────

function openAddAgentModal() {
  document.getElementById('newAgentName').value = '';
  document.getElementById('newAgentEmail').value = '';
  document.getElementById('newAgentPassword').value = '';
  document.getElementById('addAgentModalOverlay').classList.add('show');
}

function closeAddAgentModal() {
  document.getElementById('addAgentModalOverlay').classList.remove('show');
}

async function submitAddAgent() {
  var name = document.getElementById('newAgentName').value.trim();
  var email = document.getElementById('newAgentEmail').value.trim();
  var password = document.getElementById('newAgentPassword').value;

  if (!name || !email || !password) {
    showToast('Please fill in name, email, and password.', 'error');
    return;
  }

  var btn = document.getElementById('addAgentSubmitBtn');
  btn.disabled = true;
  btn.textContent = 'Adding…';

  try {
    await callApi('api_addContractAgent', [{ name: name, email: email, password: password }]);
    closeAddAgentModal();
    showToast('Contract agent added.', 'success');
  } catch (e) {
    showToast('Error adding contract agent: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Add Agent';
  }
}

function showToast(msg, type) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + (type || 'success');
  void t.offsetWidth;
  t.classList.add('show');
  setTimeout(function() { t.classList.remove('show'); }, 4000);
}

function logout() {
  callApi('logoutContractAgent', []).catch(function() {}).finally(function() {
    sessionStorage.removeItem('dka_role');
    sessionStorage.removeItem('dka_id');
    window.location.href = 'index.html';
  });
}

function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
