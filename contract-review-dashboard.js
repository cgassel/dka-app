// ============================================================================
// contract-review-dashboard.js — logic for contract-review-dashboard.html
// ============================================================================

var contractAgentId   = sessionStorage.getItem('dka_id');
var contractAgentName = sessionStorage.getItem('dka_name') || 'Contract Agent';
var pendingContracts   = [];

(function checkSession() {
  if (sessionStorage.getItem('dka_role') !== 'contractagent' || !contractAgentId) {
    window.location.href = 'index.html';
  }
})();

window.onload = function() {
  document.getElementById('agentNameLabel').textContent = contractAgentName;
  loadPendingContracts();
};

function loadPendingContracts() {
  callApi('api_getPendingContractReviews', []).then(function(contracts) {
    pendingContracts = contracts || [];
    renderQueueBanner();
    renderList();
  }).catch(function(e) {
    showToast('Error loading contracts: ' + e.message, 'error');
    document.getElementById('listContainer').innerHTML = '';
  });
}

function renderQueueBanner() {
  var banner = document.getElementById('queueBanner');
  var title  = document.getElementById('queueTitle');
  var sub    = document.getElementById('queueSub');
  var n      = pendingContracts.length;

  if (n === 0) {
    banner.classList.add('empty');
    title.textContent = 'All caught up';
    sub.textContent = 'No contracts are currently awaiting review.';
  } else {
    banner.classList.remove('empty');
    title.textContent = n + ' contract' + (n === 1 ? '' : 's') + ' awaiting review';
    sub.textContent = 'Review the language below, edit anything that needs it, then send.';
  }
}

function renderList() {
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
      '<div class="contract-card" id="card-' + idx + '">' +
        '<div class="contract-card-hdr" onclick="toggleCard(' + idx + ')">' +
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
              '<button class="btn-collapse" onclick="toggleCard(' + idx + ')">Collapse</button>' +
              '<button class="btn-approve" id="approveBtn-' + idx + '" onclick="approveAndSend(' + idx + ')">&#10003; Approve &amp; Send to Band + Venue</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  });
  container.innerHTML = html;
}

function toggleCard(idx) {
  var card = document.getElementById('card-' + idx);
  var wasOpen = card.classList.contains('open');
  document.querySelectorAll('.contract-card.open').forEach(function(c) { c.classList.remove('open'); });
  if (!wasOpen) {
    card.classList.add('open');
    setTimeout(function() { card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 100);
  }
}

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
    renderQueueBanner();
    renderList();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = '\u2713 Approve & Send to Band + Venue';
    showToast('Error sending contract: ' + e.message, 'error');
  }
}

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
