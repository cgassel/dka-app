// ============================================================================
// create-booking.js — logic for create-booking.html
// Converted from google.script.run to callApi() (see api.js).
// prefillKey now comes from the URL query string instead of a server-side
// <?= ?> scriptlet. agentId comes from sessionStorage instead of
// getCurrentAgentId() / PropertiesService session.
// ============================================================================

var venues        = [];
var bands         = [];
var selectedVenue = null;
var selectedBand  = null;
var isSubmitting  = false;

var agentId = sessionStorage.getItem('dka_id');

// Contract Agents live in a completely separate sheet/ID space from
// booking Agents — their numeric IDs can collide (both start counting
// from 1). When a Contract Agent creates a booking, everything written as
// "who booked this" needs to be unambiguous, since it's later used to
// resolve who gets emailed a copy when a contract is sent. The "CA"
// prefix keeps that lookup pointed at the right sheet.
var _sessionRole        = sessionStorage.getItem('dka_role');
var _effectiveAgentId   = (_sessionRole === 'contractagent') ? ('CA' + agentId) : agentId;
var _effectiveAgentName = (_sessionRole === 'contractagent') ? (sessionStorage.getItem('dka_name') || 'Contract Agent') : ('Agent ' + agentId);

var _prefill = { venueId:'', bandId:'', date:'', venueName:'', bandName:'' };
var _hasPrefill = false;

function showPrefillBanner() {
  var banner = document.getElementById('prefillBanner');
  var txt    = document.getElementById('prefillBannerText');
  if (!banner) return;
  var msg = '&#128073; Venue request pre-filled';
  if (_prefill.venueName && _prefill.bandName) {
    msg = '&#128276; Venue request: <strong>' + _prefill.venueName + '</strong> wants to book <strong>' + _prefill.bandName + '</strong>';
    if (_prefill.date) {
      var d = new Date(_prefill.date + 'T00:00:00');
      msg += ' on <strong>' + d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}) + '</strong>';
    }
    msg += ' — please review and submit.';
  }
  txt.innerHTML = msg;
  banner.classList.add('show');
}

// prefillKey now read from URL query string: create-booking.html?prefillKey=xxxx
var _prefillKey = new URLSearchParams(window.location.search).get('prefillKey') || '';
var _venuesDone = false;
var _bandsDone  = false;

function _selectById(selectId, id) {
  var sel  = document.getElementById(selectId);
  var norm = String(id).trim().replace(/\.0$/, '');
  sel.value = norm;
  if (!sel.value) {
    for (var i = 0; i < sel.options.length; i++) {
      if (String(sel.options[i].value).trim().replace(/\.0$/, '') === norm) {
        sel.selectedIndex = i; break;
      }
    }
  }
  return !!sel.value;
}

function _tryApplyPrefill() {
  if (!_venuesDone || !_bandsDone) return;
  if (!_hasPrefill) return;

  if (_prefill.venueId) {
    if (_selectById('venue', _prefill.venueId)) updateVenueInfo();
  }

  if (_prefill.bandId) {
    if (_selectById('band', _prefill.bandId)) updateBandInfo();
  }

  if (_prefill.date) {
    var dateEl = document.getElementById('bookingDate');
    if (dateEl) {
      dateEl.value = _prefill.date;
      if (typeof checkAvailability === 'function') checkAvailability();
    }
  }

  var statusEl = document.getElementById('status');
  if (statusEl && !statusEl.value) statusEl.value = 'Pending';

  if (_prefill.notes) {
    var notesEl = document.getElementById('notes');
    if (notesEl) notesEl.value = _prefill.notes;
  }

  setTimeout(function() {
    var stEl = document.getElementById('startTime');
    var etEl = document.getElementById('endTime');
    if (stEl && _prefill.startTime) stEl.value = _prefill.startTime;
    if (etEl && _prefill.endTime)   etEl.value = _prefill.endTime;

    var slEl = document.getElementById('soundLights');
    if (slEl) {
      var hasSound = _prefill.hasSound || (selectedVenue ? selectedVenue.hasSound : '');
      slEl.value = (hasSound === 'Yes') ? 'Venue' : 'Band';
    }

    if (_prefill.payAmount && parseFloat(_prefill.payAmount) > 0) {
      var paEl   = document.getElementById('payAmountValue');
      var paDisp = document.getElementById('payAmount');
      if (paEl) paEl.value = _prefill.payAmount;
      if (paDisp) paDisp.textContent = '$' + parseFloat(_prefill.payAmount).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
    } else if (typeof updatePayAmount === 'function') {
      updatePayAmount();
    }

    var commEl   = document.getElementById('commissionPct');
    var commWarn = document.getElementById('commissionWarn');
    if (commEl) {
      var commVal = '';
      if (_prefill.commission && _prefill.commission !== '0' && _prefill.commission !== '')
        commVal = String(_prefill.commission);
      if (!commVal && selectedBand && selectedBand.commission && selectedBand.commission !== '0')
        commVal = String(selectedBand.commission);
      if (!commVal) {
        var bSel2 = document.getElementById('band');
        if (bSel2 && bSel2.selectedIndex > 0) {
          try {
            var bObj = JSON.parse(bSel2.options[bSel2.selectedIndex].dataset.band || '{}');
            if (bObj.commission && bObj.commission !== '0') commVal = String(bObj.commission);
          } catch(e2) {}
        }
      }
      if (commVal) {
        commEl.value = commVal;
        if (commWarn) commWarn.style.display = 'none';
      } else {
        if (commWarn) {
          commWarn.style.display = 'block';
          commWarn.innerHTML = '&#9888;&#xFE0F; No commission rate on file for <strong>' +
            (_prefill.bandName || 'this band') + '</strong>. ' +
            'Enter it below, then update the band record in the Band Directory.';
        }
        commEl.style.borderColor = 'var(--amber, #b45309)';
        commEl.style.boxShadow   = '0 0 0 3px rgba(180,83,9,0.15)';
        commEl.focus();
      }
    }

    if (typeof updateCommissionSummary === 'function') updateCommissionSummary();
    showPrefillBanner();
  }, 800);
}

window.onload = function() {
  if (!sessionStorage.getItem('dka_role') || !agentId) {
    window.location.href = 'index.html';
    return;
  }

  callApi('api_getContractTemplate', []).then(function(tmpl) {
    _contractTemplateLoaded = true;
    _contractTemplate = tmpl;
  }).catch(function() {});

  var _returnBand = new URLSearchParams(window.location.search).get('returnBand') || '';

  if (_returnBand) {
    var decodedName = decodeURIComponent(_returnBand);
    Promise.all([loadVenues(), loadBands(decodedName)]).then(function() {
      _restoreDraftAfterAddBand(decodedName);
    });
  } else if (_prefillKey && _prefillKey.trim() !== '') {
    callApi('api_getBookingPrefillByKey', [_prefillKey]).then(function(data) {
      if (data && (data.venueId || data.bandId)) {
        _prefill    = data;
        _hasPrefill = true;
      }
      loadVenues();
      loadBands();
    }).catch(function() { loadVenues(); loadBands(); });
  } else {
    loadVenues();
    loadBands();
  }
};

function loadVenues() {
  return callApi('api_getVenuesFullData', []).then(function(data) {
    // Private Parties and Festivals have their own picker (see
    // switchVenueCategory / loadSpecialVenues) — keep them out of the
    // normal Club venue dropdown.
    venues = data.filter(function(v) { return !v.category || v.category === 'Club'; });
    var select = document.getElementById('venue');
    select.innerHTML = '<option value="">-- Select Venue --</option>';
    venues.forEach(function(venue) {
      var opt = document.createElement('option');
      opt.value = venue.id;
      opt.textContent = venue.name + ' - ' + venue.city + ', ' + venue.state;
      opt.dataset.venue = JSON.stringify(venue);
      select.appendChild(opt);
    });
    _venuesDone = true;
    _tryApplyPrefill();
  }).catch(function(e) { openAlertModal('Error loading venues: ' + e.message); });
}

// ── Venue Category (Club / Private Party / Festival) ────────────────────────

var _specialVenues = [];
var MAX_LINEUP_BANDS = 100;

function switchVenueCategory() {
  var category = document.getElementById('venueCategory').value;

  var clubSection       = document.getElementById('clubVenueSection');
  var specialSection    = document.getElementById('specialVenueSection');
  var normalBandSection = document.getElementById('normalBandSection');
  var festivalSection   = document.getElementById('festivalLineupSection');
  var sharedTimeRow     = document.getElementById('sharedTimeRow');
  var singlePayGroup    = document.getElementById('singlePayGroup');
  var dateHelpText      = document.getElementById('dateHelpText');
  var editOpt           = document.getElementById('optEdit');

  // Switching away from Club — any conflict warning tied to the old venue
  // selection no longer applies.
  _venueConflict = { hasConflict: false, count: 0 };
  document.getElementById('warningMsg').style.display = 'none';

  if (category === 'Club') {
    clubSection.style.display       = '';
    specialSection.style.display    = 'none';
    normalBandSection.style.display = '';
    festivalSection.style.display   = 'none';
    sharedTimeRow.style.display     = '';
    singlePayGroup.style.display    = '';
    dateHelpText.textContent = 'Check venue calendar for availability';
    if (editOpt) editOpt.style.display = '';
    return;
  }

  clubSection.style.display    = 'none';
  specialSection.style.display = '';

  if (category === 'Private Party') {
    normalBandSection.style.display = '';
    festivalSection.style.display   = 'none';
    sharedTimeRow.style.display     = '';
    singlePayGroup.style.display    = '';
    dateHelpText.textContent = 'Date of the private event';
    document.getElementById('specialVenueSectionTitle').textContent = 'Select Private Party';
    document.getElementById('specialVenueSelectLabel').innerHTML    = 'Private Party <span class="required">*</span>';
    document.getElementById('specialVenueNameLabel').innerHTML      = 'Party Name <span class="required">*</span>';
    document.getElementById('specialCompanyNameGroup').style.display = 'block';
    if (editOpt) editOpt.style.display = '';
    loadSpecialVenues('Private Party');

  } else if (category === 'Festival') {
    normalBandSection.style.display = 'none';
    festivalSection.style.display   = '';
    sharedTimeRow.style.display     = 'none';
    singlePayGroup.style.display    = 'none';
    dateHelpText.textContent = 'Festival date';
    document.getElementById('specialVenueSectionTitle').textContent = 'Select Festival';
    document.getElementById('specialVenueSelectLabel').innerHTML    = 'Festival <span class="required">*</span>';
    document.getElementById('specialVenueNameLabel').innerHTML      = 'Festival Name <span class="required">*</span>';
    document.getElementById('specialCompanyNameGroup').style.display = 'none';
    loadSpecialVenues('Festival');

    // "Edit Before Review" doesn't make sense across a whole lineup of
    // different bands — each gets its own auto-generated contract instead.
    if (_contractMode === 'edit') selectContractOpt('standard');
    if (editOpt) editOpt.style.display = 'none';

    if (document.querySelectorAll('.lineup-row').length === 0) addLineupRow();
  }
}

function loadSpecialVenues(category) {
  var select = document.getElementById('specialVenueSelect');
  select.innerHTML = '<option value="">-- Loading... --</option>';
  callApi('api_getVenuesByCategory', [category]).then(function(data) {
    _specialVenues = data || [];
    select.innerHTML = '<option value="">-- Select --</option>';
    _specialVenues.forEach(function(v) {
      var opt = document.createElement('option');
      opt.value = v.id;
      opt.textContent = v.name + (v.companyName ? ' (' + v.companyName + ')' : '');
      select.appendChild(opt);
    });
    var newOpt = document.createElement('option');
    newOpt.value = '__new__';
    newOpt.textContent = '+ Create New ' + (category === 'Festival' ? 'Festival' : 'Private Party') + '...';
    select.appendChild(newOpt);

    if (_specialVenues.length === 0) {
      select.value = '__new__';
      onSpecialVenueSelectChange();
    }
  }).catch(function() {
    select.innerHTML = '<option value="">-- Error loading, try again --</option>';
  });
}

function onSpecialVenueSelectChange() {
  var val = document.getElementById('specialVenueSelect').value;
  document.getElementById('specialVenueNewFields').style.display = (val === '__new__') ? 'block' : 'none';
}

// ── Festival lineup builder ──────────────────────────────────────────────────

function addLineupRow() {
  var existing = document.querySelectorAll('.lineup-row').length;
  if (existing >= MAX_LINEUP_BANDS) return;

  var idx = existing + 1;
  var rowId = 'lineupRow_' + Date.now() + '_' + idx;
  var div = document.createElement('div');
  div.className = 'lineup-row';
  div.id = rowId;
  div.innerHTML =
    '<div class="lineup-row-num">Band ' + idx + '</div>' +
    '<div class="lineup-row-grid">' +
      '<div><label>Band</label><select class="lineup-band-select" onchange="onLineupBandChange(this)"><option value="">-- Select Band --</option>' + _bandOptionsHtml() + '</select></div>' +
      '<div><label>Start</label><input type="time" class="lineup-start" value="20:00"></div>' +
      '<div><label>End</label><input type="time" class="lineup-end" value="21:00"></div>' +
      '<div><label>Pay ($)</label><input type="number" class="lineup-pay" min="0" step="1" placeholder="0"></div>' +
    '</div>' +
    '<button type="button" class="btn-remove-lineup" onclick="removeLineupRow(\'' + rowId + '\')">&times; Remove</button>';
  document.getElementById('lineupRows').appendChild(div);
  updateLineupCount();
}

function _bandOptionsHtml() {
  return bands.map(function(b) {
    return '<option value="' + b.id + '">' + _cbEsc(b.name) + ' - ' + _cbEsc(b.genre) + '</option>';
  }).join('');
}

function onLineupBandChange(selectEl) {
  var band = bands.find(function(b) { return String(b.id) === String(selectEl.value); });
  var row = selectEl.closest('.lineup-row');
  var payInput = row.querySelector('.lineup-pay');
  if (band && !payInput.value) {
    var soundLights = document.getElementById('soundLights').value;
    var suggested = soundLights === 'Venue' ? (parseFloat(band.payRateNoSound) || 0) : (parseFloat(band.payRateWithSound) || 0);
    if (suggested) payInput.value = suggested;
  }
}

function removeLineupRow(rowId) {
  var el = document.getElementById(rowId);
  if (el) el.remove();
  // Renumber the "Band N" labels so they stay sequential after a removal
  document.querySelectorAll('.lineup-row').forEach(function(row, i) {
    row.querySelector('.lineup-row-num').textContent = 'Band ' + (i + 1);
  });
  updateLineupCount();
}

function updateLineupCount() {
  var n = document.querySelectorAll('.lineup-row').length;
  document.getElementById('lineupCount').textContent = n + ' / ' + MAX_LINEUP_BANDS + ' bands';
  document.getElementById('addLineupBtn').disabled = n >= MAX_LINEUP_BANDS;
}

function toggleEmailCheckbox() {
  var cb = document.getElementById('sendConfirmationEmail');
  cb.checked = !cb.checked;
  updateEmailHint();
}

function updateEmailHint() {
  var cb   = document.getElementById('sendConfirmationEmail');
  var hint = document.getElementById('emailCheckboxHint');
  var grp  = document.getElementById('sendEmailGroup');
  if (cb.checked) {
    hint.textContent = 'A booking confirmation will be emailed to the band\'s address on file';
    grp.style.background   = '#f0f4fa';
    grp.style.borderColor  = '#c5d4f8';
    grp.querySelector('label').style.color = '#A07018';
  } else {
    hint.textContent = 'No email will be sent to the band';
    grp.style.background   = '#f8f8f8';
    grp.style.borderColor  = '#e0e0e0';
    grp.querySelector('label').style.color = '#888';
  }
}

function loadBands(selectBandName) {
  return callApi('api_getBandsFullData', []).then(function(data) {
    bands = data;
    var select = document.getElementById('band');
    select.innerHTML = '<option value="">-- Select Band --</option>';
    var matchOpt = null;
    data.forEach(function(band) {
      var opt = document.createElement('option');
      opt.value = band.id;
      opt.textContent = band.name + ' - ' + band.genre + ' (' + band.rating + ')';
      opt.dataset.band = JSON.stringify(band);
      select.appendChild(opt);
      if (selectBandName && band.name === selectBandName) matchOpt = opt;
    });
    _bandsDone = true;
    _tryApplyPrefill();
    if (matchOpt) {
      select.value = matchOpt.value;
      updateBandInfo();
    }
  }).catch(function(e) { openAlertModal('Error loading bands: ' + e.message); });
}

var DKA_DRAFT_KEY = 'dka_cb_draft';

// Saves the in-progress booking form to sessionStorage, then navigates to
// the full Add Band page. add-band.js reads ?returnTo=create-booking and,
// on success, sends the user back here with ?returnBand=<new band name>.
function goToAddBand() {
  var draft = {
    venueId:               (document.getElementById('venue') || {}).value || '',
    bookingDate:           (document.getElementById('bookingDate') || {}).value || '',
    startTime:             (document.getElementById('startTime') || {}).value || '',
    endTime:               (document.getElementById('endTime') || {}).value || '',
    soundLights:           (document.getElementById('soundLights') || {}).value || '',
    commissionPct:         (document.getElementById('commissionPct') || {}).value || '',
    notes:                 (document.getElementById('notes') || {}).value || '',
    status:                (document.getElementById('status') || {}).value || '',
    sendConfirmationEmail: !!(document.getElementById('sendConfirmationEmail') || {}).checked
  };
  try { sessionStorage.setItem(DKA_DRAFT_KEY, JSON.stringify(draft)); } catch (e) {}
  window.location.href = 'add-band.html?returnTo=create-booking';
}

// After venues + bands are (re)loaded and the new band is selected, restore
// whatever the user had already filled in before they left for Add Band.
function _restoreDraftAfterAddBand(bandName) {
  var raw = null;
  try { raw = sessionStorage.getItem(DKA_DRAFT_KEY); } catch (e) {}
  var draft = null;
  if (raw) { try { draft = JSON.parse(raw); } catch (e) { draft = null; } }

  if (draft) {
    if (draft.venueId) { if (_selectById('venue', draft.venueId)) updateVenueInfo(); }
    if (draft.bookingDate) {
      var dateEl = document.getElementById('bookingDate');
      if (dateEl) { dateEl.value = draft.bookingDate; if (typeof checkAvailability === 'function') checkAvailability(); }
    }
    if (draft.startTime) { var stEl = document.getElementById('startTime'); if (stEl) stEl.value = draft.startTime; }
    if (draft.endTime)   { var etEl = document.getElementById('endTime');   if (etEl) etEl.value = draft.endTime; }
    if (draft.soundLights) { var slEl = document.getElementById('soundLights'); if (slEl) slEl.value = draft.soundLights; }
    if (draft.status) { var statusEl = document.getElementById('status'); if (statusEl) statusEl.value = draft.status; }
    if (draft.notes) { var notesEl = document.getElementById('notes'); if (notesEl) notesEl.value = draft.notes; }
    if (typeof draft.sendConfirmationEmail === 'boolean') {
      var emailCb = document.getElementById('sendConfirmationEmail');
      if (emailCb) emailCb.checked = draft.sendConfirmationEmail;
    }
    if (typeof updatePayAmount === 'function') updatePayAmount();
    var commEl = document.getElementById('commissionPct');
    if (commEl) {
      commEl.value = draft.commissionPct || commEl.value;
      if (typeof updateCommissionSummary === 'function') updateCommissionSummary();
    }
    try { sessionStorage.removeItem(DKA_DRAFT_KEY); } catch (e) {}
  }

  var banner = document.getElementById('newBandBanner');
  var nameEl = document.getElementById('newBandNameText');
  if (banner && nameEl) {
    nameEl.textContent = bandName;
    banner.classList.add('show');
  }

  // Clean the query string so a page refresh doesn't re-trigger this.
  if (window.history && window.history.replaceState) {
    window.history.replaceState({}, '', window.location.pathname);
  }
}

function updateVenueInfo() {
  setTimeout(refreshContractIfOpen, 300);
  var select = document.getElementById('venue');
  var option = select.options[select.selectedIndex];
  if (select.value) {
    selectedVenue = JSON.parse(option.dataset.venue);
    document.getElementById('venueDetails').textContent =
      'Capacity: ' + selectedVenue.capacity +
      ' | Budget: $' + selectedVenue.payRateBudget +
      ' | Sound: ' + selectedVenue.hasSound +
      ' | Lights: ' + selectedVenue.hasLighting;
    document.getElementById('venueInfo').style.display = 'block';
    updatePayAmount();
  } else {
    document.getElementById('venueInfo').style.display = 'none';
    selectedVenue = null;
  }
}

function updateBandInfo() {
  setTimeout(refreshContractIfOpen, 300);
  var select = document.getElementById('band');
  var option = select.options[select.selectedIndex];
  if (select.value) {
    selectedBand = JSON.parse(option.dataset.band);
    document.getElementById('bandDetails').textContent =
      'Genre: ' + selectedBand.genre +
      ' | Members: ' + selectedBand.numMembers +
      ' | Typical Draw: ' + selectedBand.typicalDraw +
      ' | Rating: ' + selectedBand.rating;
    document.getElementById('bandInfo').style.display = 'block';
    updatePayAmount();
    var emailGrp = document.getElementById('sendEmailGroup');
    var emailCb  = document.getElementById('sendConfirmationEmail');
    var hint     = document.getElementById('emailCheckboxHint');
    if (selectedBand.email) {
      emailGrp.classList.remove('disabled');
      if (emailCb.checked) {
        hint.textContent = 'Confirmation will be sent to: ' + selectedBand.email;
      }
    } else {
      emailGrp.classList.add('disabled');
      emailCb.checked  = false;
      hint.textContent = 'No email on file for this band';
    }
  } else {
    document.getElementById('bandInfo').style.display = 'none';
    selectedBand = null;
    updateCommissionSummary();
    var emailGrp2 = document.getElementById('sendEmailGroup');
    var emailCb2  = document.getElementById('sendConfirmationEmail');
    emailGrp2.classList.remove('disabled');
    emailCb2.checked = true;
    document.getElementById('emailCheckboxHint').textContent = 'A booking confirmation will be emailed to the band\'s address on file';
  }
}

function updatePayAmount() {
  if (!selectedBand) {
    document.getElementById('payAmount').textContent = 'Select band first';
    document.getElementById('payAmountValue').value  = '';
    updateCommissionSummary();
    return;
  }
  var soundLights = document.getElementById('soundLights').value;
  var amount = soundLights === 'Venue'
    ? (parseFloat(selectedBand.payRateNoSound)   || 0)
    : (parseFloat(selectedBand.payRateWithSound) || 0);
  document.getElementById('payAmount').textContent = '$' + amount.toFixed(2);
  document.getElementById('payAmountValue').value  = amount;
  updateCommissionSummary();
}

function updateCommissionSummary() {
  var pay = parseFloat(document.getElementById('payAmountValue').value) || 0;
  var pct = parseFloat(document.getElementById('commissionPct').value)  || 0;
  var summary = document.getElementById('commissionSummary');
  if (pay > 0 && pct > 0) {
    var earns = pay * pct / 100;
    document.getElementById('summaryBandPay').textContent = '$' + pay.toFixed(2);
    document.getElementById('summaryRate').textContent    = pct + '%';
    document.getElementById('summaryEarns').textContent   = '$' + earns.toFixed(2);
    summary.style.display = 'block';
  } else {
    summary.style.display = 'none';
  }
}

function _cbEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
  });
}

function _cbCleanTime(t) {
  if (!t) return '';
  var s = String(t);
  // Google Sheets stores time-only cells internally with a placeholder
  // date of Dec 30, 1899 — if that (or a raw "GMT" Date string) comes
  // through, pull just the HH:MM out of it rather than showing the whole
  // bogus date.
  if (s.indexOf('1899') !== -1 || s.indexOf('GMT') !== -1) {
    var mm = s.match(/(\d{1,2}):(\d{2})/);
    if (mm) {
      var hh = parseInt(mm[1], 10), mnn = mm[2], app = hh >= 12 ? 'PM' : 'AM';
      hh = hh % 12 || 12;
      return hh + ':' + mnn + ' ' + app;
    }
    return '';
  }
  var m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return s;
  var h = parseInt(m[1], 10), mn = m[2], ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return h + ':' + mn + ' ' + ap;
}

// Tracks whether the currently-selected venue+date has existing, non-cancelled
// bookings, so handleSubmit can require explicit confirmation before allowing
// a double/triple booking through.
var _venueConflict = { hasConflict: false, count: 0 };

function checkAvailability() {
  var date    = document.getElementById('bookingDate').value;
  var venueId = document.getElementById('venue').value;
  var warnEl  = document.getElementById('warningMsg');

  _venueConflict = { hasConflict: false, count: 0 };

  if (!date || !venueId) {
    warnEl.style.display = 'none';
    return;
  }

  callApi('api_getVenueBookings', [venueId]).then(function(bookings) {
    // Re-check the fields are still what we fetched for — the user may have
    // changed venue/date again while this request was in flight.
    if (document.getElementById('bookingDate').value !== date ||
        document.getElementById('venue').value !== venueId) return;

    var matches = (bookings || []).filter(function(b) {
      return (b.date || '').substring(0, 10) === date && b.status !== 'Cancelled';
    });

    _venueConflict = { hasConflict: matches.length > 0, count: matches.length, matches: matches };

    if (matches.length === 0) {
      warnEl.style.display = 'none';
      return;
    }

    var headline = matches.length === 1
      ? 'This venue already has a booking on this date:'
      : 'This venue already has ' + matches.length + ' bookings on this date (double/triple booking):';

    var details = matches.map(function(b) {
      var time = b.startTime ? (' at ' + _cbCleanTime(b.startTime)) : '';
      var status = b.status ? ' — ' + _cbEsc(b.status) : '';
      return '&bull; <strong>' + _cbEsc(b.bandName || 'Unknown band') + '</strong>' + time + status;
    }).join('<br>');

    warnEl.style.display = 'block';
    warnEl.innerHTML = '<strong>&#x26A0; Warning:</strong> ' + headline + '<br>' + details;
  }).catch(function() {
    warnEl.style.display = 'none';
  });
}

// Custom in-page confirm/alert modal — replaces window.confirm()/alert(),
// which are unreliable inside native app wrappers (especially iOS WKWebView).
// This is plain HTML/CSS/JS, so it renders identically on web, installed
// PWA, and any future native-wrapped build.
var _confirmModalCallback = null;

function openConfirmModal(message, onConfirm, opts) {
  opts = opts || {};
  document.getElementById('confirmModalTitle').innerHTML = opts.title || '&#9888; Please Confirm';
  document.getElementById('confirmModalMessage').textContent = message;
  document.getElementById('confirmModalFooter').innerHTML =
    '<button type="button" class="btn-secondary" onclick="_confirmModalRespond(false)">' + (opts.cancelLabel || 'Cancel') + '</button>' +
    '<button type="button" class="btn-primary" onclick="_confirmModalRespond(true)">' + (opts.confirmLabel || 'Confirm') + '</button>';

  var viewLink = document.getElementById('confirmModalViewLink');
  var detailsEl = document.getElementById('confirmModalDetails');
  detailsEl.style.display = 'none';
  viewLink.textContent = '\u{1F441} View Existing Booking';
  if (opts.detailsHtml) {
    detailsEl.innerHTML = opts.detailsHtml;
    viewLink.style.display = 'inline-block';
  } else {
    detailsEl.innerHTML = '';
    viewLink.style.display = 'none';
  }

  _confirmModalCallback = onConfirm;
  document.getElementById('confirmModalOverlay').classList.add('show');
}

function toggleConflictDetails(event) {
  if (event) event.preventDefault();
  var detailsEl = document.getElementById('confirmModalDetails');
  var link = document.getElementById('confirmModalViewLink');
  var isOpen = detailsEl.style.display !== 'none';
  detailsEl.style.display = isOpen ? 'none' : 'block';
  link.textContent = isOpen ? '\u{1F441} View Existing Booking' : '\u{1F441} Hide Booking Details';
}

function openAlertModal(message, onClose, opts) {
  opts = opts || {};
  document.getElementById('confirmModalTitle').innerHTML = opts.title || 'Notice';
  document.getElementById('confirmModalMessage').textContent = message;
  document.getElementById('confirmModalFooter').innerHTML =
    '<button type="button" class="btn-primary" style="flex:1;" onclick="_confirmModalRespond(true)">OK</button>';
  document.getElementById('confirmModalViewLink').style.display = 'none';
  document.getElementById('confirmModalDetails').style.display = 'none';
  _confirmModalCallback = onClose || null;
  document.getElementById('confirmModalOverlay').classList.add('show');
}

function _confirmModalRespond(confirmed) {
  document.getElementById('confirmModalOverlay').classList.remove('show');
  var cb = _confirmModalCallback;
  _confirmModalCallback = null;
  if (confirmed && typeof cb === 'function') cb();
}

async function handleSubmit(event) {
  event.preventDefault();
  if (isSubmitting) return false;

  var pct = parseFloat(document.getElementById('commissionPct').value);
  if (isNaN(pct) || pct < 0 || pct > 100) {
    _showFormError('Commission % must be between 0 and 100.');
    return false;
  }

  var category = document.getElementById('venueCategory').value;

  // Venue validation
  if (category === 'Club') {
    if (!document.getElementById('venue').value) {
      _showFormError('Please select a venue.');
      return false;
    }
  } else {
    var specialVal = document.getElementById('specialVenueSelect').value;
    if (!specialVal) {
      _showFormError('Please select or create a ' + (category === 'Festival' ? 'festival' : 'private party') + '.');
      return false;
    }
    if (specialVal === '__new__' && !document.getElementById('specialVenueName').value.trim()) {
      _showFormError('Please enter a ' + (category === 'Festival' ? 'festival name' : 'party name') + '.');
      return false;
    }
  }

  // Band validation
  if (category === 'Festival') {
    var lineupRows = document.querySelectorAll('.lineup-row');
    if (lineupRows.length === 0) {
      _showFormError('Please add at least one band to the lineup.');
      return false;
    }
    for (var li = 0; li < lineupRows.length; li++) {
      if (!lineupRows[li].querySelector('.lineup-band-select').value) {
        _showFormError('Please select a band for every row in the lineup, or remove empty rows.');
        return false;
      }
    }
  } else {
    if (!document.getElementById('band').value) {
      _showFormError('Please select a band.');
      return false;
    }
  }

  if (_venueConflict.hasConflict) {
    var conflictMsg = _venueConflict.count === 1
      ? 'This venue already has a booking on this date. Create another booking here anyway?'
      : 'This venue already has ' + _venueConflict.count + ' bookings on this date — this would be a double/triple booking. Create another booking here anyway?';
    var detailsHtml = (_venueConflict.matches || []).map(function(b) {
      var time = b.startTime ? (' at ' + _cbCleanTime(b.startTime)) : '';
      var status = b.status ? ' &mdash; <strong>' + _cbEsc(b.status) + '</strong>' : '';
      return '&bull; <strong>' + _cbEsc(b.bandName || 'Unknown band') + '</strong>' + time + status;
    }).join('<br>');
    openConfirmModal(conflictMsg, function() { _submitBooking(pct); }, {
      title: '&#9888; Possible Duplicate Booking',
      confirmLabel: 'Create Anyway',
      detailsHtml: detailsHtml
    });
    return false;
  }

  _submitBooking(pct);
  return false;
}

function _showFormError(msg) {
  document.getElementById('errorMsg').style.display = 'block';
  document.getElementById('errorMsg').innerHTML = '<strong>Error:</strong> ' + msg;
  window.scrollTo(0, 0);
}

// Creates a new Private Party / Festival venue record on the fly, or looks
// up the one the agent picked from the dropdown. Returns the shared venue
// fields every booking in this submission will use.
async function _resolveVenue(category) {
  if (category === 'Club') {
    return {
      venueId: document.getElementById('venue').value,
      venueName: selectedVenue.name,
      venueEmail: selectedVenue.email || '',
      venueAddress: selectedVenue.address || '',
      venueCity: selectedVenue.city || '',
      venueState: selectedVenue.state || '',
      venuePhone: selectedVenue.phone || ''
    };
  }

  var sel = document.getElementById('specialVenueSelect').value;
  if (sel && sel !== '__new__') {
    var existing = _specialVenues.find(function(v) { return String(v.id) === String(sel); });
    return {
      venueId: existing.id, venueName: existing.name,
      venueEmail: existing.email || '', venueAddress: existing.address || '',
      venueCity: existing.city || '', venueState: existing.state || '', venuePhone: existing.phone || ''
    };
  }

  var name        = document.getElementById('specialVenueName').value.trim();
  var companyName = category === 'Private Party' ? document.getElementById('specialCompanyName').value.trim() : '';
  var address     = document.getElementById('specialVenueAddress').value.trim();
  var cityState   = document.getElementById('specialVenueCityState').value.trim();
  var city = '', state = '';
  if (cityState.indexOf(',') !== -1) {
    var parts = cityState.split(',');
    city = parts[0].trim(); state = (parts[1] || '').trim();
  } else {
    city = cityState;
  }

  var venueData = {
    category: category, companyName: companyName, venueName: name,
    contactName: '', email: '', phone: '', address: address, city: city, state: state, zip: '',
    capacity: 0, payRateBudget: 0
  };
  var result = await callApi('api_addVenue', [venueData, _effectiveAgentId, _effectiveAgentName]);
  return {
    venueId: result.venueId, venueName: name,
    venueEmail: '', venueAddress: address, venueCity: city, venueState: state, venuePhone: ''
  };
}

// Generates and submits the contract-for-review for one booking. When
// forceStandard is true (used for every band in a festival lineup), the
// "Edit Before Review" text is never used — each band gets its own
// auto-generated contract from its own actual details, since one edited
// block of text can't correctly apply to a whole lineup of different bands.
async function _createContractForBooking(bookingData, bookingId, forceStandard) {
  var bandEmail = bookingData.bandEmail || '';
  var perfDate  = '';
  try { perfDate = new Date(bookingData.date + 'T12:00:00').toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'}); } catch(e) { perfDate = bookingData.date; }

  var contractText = '';
  if (!forceStandard && _contractMode === 'edit') {
    var ta = document.getElementById('contractTextarea');
    contractText = ta ? ta.value : '';
  }

  if (forceStandard || _contractMode === 'standard' || !contractText) {
    var bkDataForContract = {
      bandName:    bookingData.bandName,
      venueName:   bookingData.venueName,
      date:        bookingData.date,
      startTime:   bookingData.startTime,
      endTime:     bookingData.endTime,
      payAmount:   bookingData.payAmount,
      soundLights: bookingData.soundLights,
      notes:       bookingData.notes,
      commission:  String(bookingData.commissionPct || ''),
      bookingId:   String(bookingId)
    };
    try {
      var genResult = await callApi('api_generateContractText', [bkDataForContract, null]);
      var text = (genResult && genResult.text) ? genResult.text : '';
      if (text) {
        await callApi('api_createContractForReview', [bookingId, text, bandEmail, bookingData.bandName, bookingData.venueName, perfDate, bookingData.agentId || '']);
      }
    } catch (e) { /* non-fatal — booking already saved */ }
  } else if (contractText) {
    try {
      await callApi('api_createContractForReview', [bookingId, contractText, bandEmail, bookingData.bandName, bookingData.venueName, perfDate, bookingData.agentId || '']);
    } catch (e) { /* non-fatal */ }
  }
}

async function _submitSingleBooking(shared, contractIsPending) {
  var bookingData = Object.assign({}, shared, {
    bandId:      document.getElementById('band').value,
    bandName:    selectedBand.name,
    bandEmail:   selectedBand.email   || '',
    bandContact: selectedBand.contact || '',
    startTime:   document.getElementById('startTime').value,
    endTime:     document.getElementById('endTime').value,
    payAmount:   parseFloat(document.getElementById('payAmountValue').value),
    contractPending: contractIsPending
  });

  var result = await callApi('api_createBooking', [bookingData, _effectiveAgentId, _effectiveAgentName]);

  var contractNoteEl = document.getElementById('successContractNote');
  if (contractIsPending && result && result.bookingId) {
    await _createContractForBooking(bookingData, result.bookingId, false);
    if (contractNoteEl) contractNoteEl.textContent = 'Your contract has been sent to a Contract Agent for review before it goes out to the band and venue.';
  } else if (contractNoteEl) {
    contractNoteEl.textContent = bookingData.sendConfirmEmail
      ? 'A booking confirmation email was sent to the band and venue.'
      : '';
  }
}

async function _submitFestivalLineup(shared, contractIsPending) {
  var rows = Array.prototype.slice.call(document.querySelectorAll('.lineup-row'));
  var loadingText = document.querySelector('#loading p');
  var successCount = 0, failedNames = [];

  for (var i = 0; i < rows.length; i++) {
    var row    = rows[i];
    var bandId = row.querySelector('.lineup-band-select').value;
    var band   = bands.find(function(b) { return String(b.id) === String(bandId); });
    if (!band) continue;

    if (loadingText) loadingText.textContent = 'Creating booking ' + (i + 1) + ' of ' + rows.length + ' (' + band.name + ')\u2026';

    var bookingData = Object.assign({}, shared, {
      bandId: band.id, bandName: band.name,
      bandEmail: band.email || '', bandContact: band.contact || '',
      startTime: row.querySelector('.lineup-start').value,
      endTime:   row.querySelector('.lineup-end').value,
      payAmount: parseFloat(row.querySelector('.lineup-pay').value) || 0,
      contractPending: contractIsPending
    });

    try {
      var result = await callApi('api_createBooking', [bookingData, _effectiveAgentId, _effectiveAgentName]);
      if (contractIsPending && result && result.bookingId) {
        await _createContractForBooking(bookingData, result.bookingId, true);
      }
      successCount++;
    } catch (e) {
      failedNames.push(band.name);
    }
  }

  var contractNoteEl = document.getElementById('successContractNote');
  if (contractNoteEl) {
    var msg = successCount + ' booking' + (successCount === 1 ? '' : 's') + ' created for the festival lineup.';
    if (contractIsPending && successCount > 0) msg += ' Contracts sent to a Contract Agent for review.';
    if (failedNames.length > 0) msg += ' ' + failedNames.length + ' failed: ' + failedNames.join(', ') + '.';
    contractNoteEl.textContent = msg;
  }
}

async function _submitBooking(pct) {
  isSubmitting = true;
  document.getElementById('successMsg').style.display  = 'none';
  document.getElementById('errorMsg').style.display    = 'none';
  document.getElementById('warningMsg').style.display  = 'none';
  document.getElementById('createBookingForm').style.display = 'none';
  document.getElementById('loading').style.display     = 'block';
  var loadingTextEl = document.querySelector('#loading p');
  if (loadingTextEl) loadingTextEl.textContent = 'Creating booking\u2026';
  window.scrollTo(0, 0);

  var category = document.getElementById('venueCategory').value;
  var sendCon = document.getElementById('sendContract');
  var contractIsPending = !!(sendCon && sendCon.checked);

  try {
    var venueInfo = await _resolveVenue(category);

    var shared = {
      venueId:      venueInfo.venueId,
      venueName:    venueInfo.venueName,
      venueEmail:   venueInfo.venueEmail,
      venueAddress: venueInfo.venueAddress,
      venueCity:    venueInfo.venueCity,
      venueState:   venueInfo.venueState,
      venuePhone:   venueInfo.venuePhone,
      date:         document.getElementById('bookingDate').value,
      status:       document.getElementById('status').value,
      soundLights:  document.getElementById('soundLights').value,
      commissionPct: pct,
      notes:        document.getElementById('notes').value,
      sendConfirmEmail: document.getElementById('sendConfirmationEmail').checked,
      agentId:      String(_effectiveAgentId || '')
    };

    if (category === 'Festival') {
      await _submitFestivalLineup(shared, contractIsPending);
    } else {
      await _submitSingleBooking(shared, contractIsPending);
    }

    isSubmitting = false;
    document.getElementById('loading').style.display    = 'none';
    document.getElementById('successMsg').style.display = 'block';
    window.scrollTo(0, 0);

  } catch (error) {
    isSubmitting = false;
    document.getElementById('loading').style.display           = 'none';
    document.getElementById('createBookingForm').style.display = 'block';
    document.getElementById('errorMsg').style.display          = 'block';
    document.getElementById('errorMsg').innerHTML = '<strong>Error:</strong> ' + error.message;
  }

  return false;
}


// ── CONTRACT ──────────────────────────────────────────────────────────────
var _contractTemplateLoaded = false;
var _contractMode = 'standard';

function toggleContractCheckbox() { /* no-op: contract section always visible */ }
function onContractCheckChange()   { /* no-op: contract section always visible */ }

function selectContractOpt(mode) {
  _contractMode = mode;
  document.getElementById('optStandard').classList.toggle('selected', mode === 'standard');
  document.getElementById('optEdit').classList.toggle('selected', mode === 'edit');
  var optNone = document.getElementById('optNone');
  if (optNone) optNone.classList.toggle('selected', mode === 'none');

  var cb = document.getElementById('sendContract');
  if (cb) cb.checked = (mode !== 'none');

  var editWrap = document.getElementById('contractEditWrap');
  if (mode === 'edit') {
    editWrap.classList.add('show');
    if (!_contractTemplateLoaded) loadContractTemplate();
  } else {
    editWrap.classList.remove('show');
  }

  var rec = document.getElementById('contractRecipients');
  if (rec) {
    if (mode === 'none') {
      rec.style.display = 'none';
    } else {
      rec.style.display = 'flex';
      rec.innerHTML = '&#x2705; Contract will be sent to the band and to you (the agent) for signatures';
    }
  }
}

var _contractTemplate = null;

function loadContractTemplate() {
  var ta = document.getElementById('contractTextarea');
  if (_contractTemplate) {
    if (ta) ta.value = fillContractTemplate(_contractTemplate);
    return;
  }
  if (ta) ta.value = 'Loading contract...';
  callApi('api_getContractTemplate', []).then(function(tmpl) {
    _contractTemplateLoaded = true;
    _contractTemplate = tmpl;
    if (ta) ta.value = fillContractTemplate(tmpl);
  }).catch(function() {
    if (ta) ta.value = 'Error loading template.';
  });
}

function fillContractTemplate(tmpl) {
  if (!tmpl) return '';
  var bandName     = selectedBand  ? (selectedBand.name  || '') : '';
  var venueName    = selectedVenue ? (selectedVenue.name || '') : '';
  var venueContact = selectedVenue ? (selectedVenue.contact || '') : '';
  var venueEmail   = selectedVenue ? (selectedVenue.email   || '') : '';
  var venuePhone   = selectedVenue ? (selectedVenue.phone   || '') : '';
  var bandContact  = selectedBand  ? (selectedBand.contact  || '') : '';
  var bandPhone    = selectedBand  ? (selectedBand.phone    || '') : '';
  var bandEmail    = selectedBand  ? (selectedBand.email    || '') : '';
  var date         = document.getElementById('bookingDate')     ? document.getElementById('bookingDate').value     : '';
  var startTime    = document.getElementById('startTime')       ? document.getElementById('startTime').value       : '';
  var endTime      = document.getElementById('endTime')         ? document.getElementById('endTime').value         : '';
  var pay          = document.getElementById('payAmountValue')  ? document.getElementById('payAmountValue').value  : '';
  var sl           = document.getElementById('soundLights')     ? document.getElementById('soundLights').value     : '';
  var notes        = document.getElementById('notes')           ? document.getElementById('notes').value           : '';
  var pct          = document.getElementById('commissionPct')   ? document.getElementById('commissionPct').value   : '0';

  function fmtTime(t) {
    if (!t) return 'TBD';
    var m = t.match(/(\d{1,2}):(\d{2})/);
    if (!m) return t;
    var h = parseInt(m[1]), mn = m[2], ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + mn + ' ' + ap;
  }
  function fmtDate(ds) {
    if (!ds) return 'TBD';
    try { return new Date(ds + 'T12:00:00').toLocaleDateString('en-US', {month:'2-digit',day:'2-digit',year:'numeric'}); }
    catch(e) { return ds; }
  }
  function fmtPay(p) {
    var n = parseFloat(p);
    return n ? '$' + n.toLocaleString('en-US', {minimumFractionDigits:2}) : 'As agreed';
  }
  var payNum    = parseFloat(pay) || 0;
  var commNum   = parseFloat(pct) || 0;
  var commAmt   = commNum > 0 ? '$' + (payNum * commNum / 100).toFixed(2) + ' (' + commNum + '%)' : 'Per agreement';
  var issueDate = new Date().toLocaleDateString('en-US', {month:'2-digit',day:'2-digit',year:'numeric'});

  return tmpl
    .replace(/{{BAND_NAME}}/g,             bandName    || '[Band Name]')
    .replace(/{{VENUE_NAME}}/g,            venueName   || '[Venue Name]')
    .replace(/{{PERFORMANCE_DATE}}/g,      fmtDate(date))
    .replace(/{{START_TIME}}/g,            fmtTime(startTime))
    .replace(/{{END_TIME}}/g,              fmtTime(endTime))
    .replace(/{{PAY_AMOUNT}}/g,            fmtPay(pay))
    .replace(/{{SOUND_LIGHTS}}/g,          sl          || 'TBD')
    .replace(/{{AGENT_NAME}}/g,            'David Kalz')
    .replace(/{{BOOKING_ID}}/g,            'TBD')
    .replace(/{{ISSUE_DATE}}/g,            issueDate)
    .replace(/{{VENUE_CONTACT}}/g,         venueContact|| '[Venue Contact]')
    .replace(/{{VENUE_EMAIL}}/g,           venueEmail  || '[Venue Email]')
    .replace(/{{VENUE_PHONE}}/g,           venuePhone  || '[Venue Phone]')
    .replace(/{{BAND_CONTACT}}/g,          bandContact || '[Band Contact]')
    .replace(/{{BAND_PHONE}}/g,            bandPhone   || '[Band Phone]')
    .replace(/{{BAND_EMAIL}}/g,            bandEmail   || '[Band Email]')
    .replace(/{{COMMISSION_AMOUNT}}/g,     commAmt)
    .replace(/{{SPECIAL_INSTRUCTIONS}}/g,  notes       || 'None');
}

function refreshContractIfOpen() {
  if (!document.getElementById('sendContract').checked) return;
  if (!_contractTemplateLoaded) return;
  var ta = document.getElementById('contractTextarea');
  if (!ta) return;
  callApi('api_getContractTemplate', []).then(function(tmpl) {
    ta.value = fillContractTemplate(tmpl);
  }).catch(function() {});
}

function addAnother() {
  isSubmitting = false;
  document.getElementById('successMsg').style.display          = 'none';
  document.getElementById('createBookingForm').style.display   = 'block';
  document.getElementById('createBookingForm').reset();
  document.getElementById('venueInfo').style.display           = 'none';
  document.getElementById('bandInfo').style.display            = 'none';
  document.getElementById('commissionSummary').style.display   = 'none';
  document.getElementById('payAmount').textContent             = 'Select band first';
  selectedVenue = null;
  selectedBand  = null;
  window.scrollTo(0, 0);
}

function goToDashboard() {
  window.location.href = 'agent-dashboard.html';
}
