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

  if (_prefillKey && _prefillKey.trim() !== '') {
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
  callApi('api_getVenuesFullData', []).then(function(data) {
    venues = data;
    var select = document.getElementById('venue');
    select.innerHTML = '<option value="">-- Select Venue --</option>';
    data.forEach(function(venue) {
      var opt = document.createElement('option');
      opt.value = venue.id;
      opt.textContent = venue.name + ' - ' + venue.city + ', ' + venue.state;
      opt.dataset.venue = JSON.stringify(venue);
      select.appendChild(opt);
    });
    _venuesDone = true;
    _tryApplyPrefill();
  }).catch(function(e) { alert('Error loading venues: ' + e.message); });
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

function loadBands() {
  callApi('api_getBandsFullData', []).then(function(data) {
    bands = data;
    var select = document.getElementById('band');
    select.innerHTML = '<option value="">-- Select Band --</option>';
    data.forEach(function(band) {
      var opt = document.createElement('option');
      opt.value = band.id;
      opt.textContent = band.name + ' - ' + band.genre + ' (' + band.rating + ')';
      opt.dataset.band = JSON.stringify(band);
      select.appendChild(opt);
    });
    _bandsDone = true;
    _tryApplyPrefill();
  }).catch(function(e) { alert('Error loading bands: ' + e.message); });
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

function checkAvailability() {
  var date    = document.getElementById('bookingDate').value;
  var venueId = document.getElementById('venue').value;
  if (!date || !venueId) return;
  callApi('checkVenueAvailability', [venueId, date]).then(function(hasBooking) {
    if (hasBooking) {
      document.getElementById('warningMsg').style.display = 'block';
      document.getElementById('warningMsg').innerHTML = '<strong>&#x26A0; Warning:</strong> This venue already has a booking on this date!';
    } else {
      document.getElementById('warningMsg').style.display = 'none';
    }
  }).catch(function() {});
}

async function handleSubmit(event) {
  event.preventDefault();
  if (isSubmitting) return false;

  var pct = parseFloat(document.getElementById('commissionPct').value);
  if (isNaN(pct) || pct < 0 || pct > 100) {
    document.getElementById('errorMsg').style.display = 'block';
    document.getElementById('errorMsg').innerHTML = '<strong>Error:</strong> Commission % must be between 0 and 100.';
    return false;
  }

  isSubmitting = true;
  document.getElementById('successMsg').style.display  = 'none';
  document.getElementById('errorMsg').style.display    = 'none';
  document.getElementById('warningMsg').style.display  = 'none';
  document.getElementById('createBookingForm').style.display = 'none';
  document.getElementById('loading').style.display     = 'block';

  var bookingData = {
    venueId:       document.getElementById('venue').value,
    venueName:     selectedVenue.name,
    bandId:        document.getElementById('band').value,
    bandName:      selectedBand.name,
    bandEmail:     selectedBand.email     || '',
    bandContact:   selectedBand.contact   || '',
    venueAddress:  selectedVenue.address  || '',
    venueCity:     selectedVenue.city     || '',
    venueState:    selectedVenue.state    || '',
    venuePhone:    selectedVenue.phone    || '',
    date:          document.getElementById('bookingDate').value,
    startTime:     document.getElementById('startTime').value,
    endTime:       document.getElementById('endTime').value,
    payAmount:     parseFloat(document.getElementById('payAmountValue').value),
    soundLights:   document.getElementById('soundLights').value,
    status:        document.getElementById('status').value,
    commissionPct: pct,
    notes:              document.getElementById('notes').value,
    sendConfirmEmail:   document.getElementById('sendConfirmationEmail').checked,
    agentId:           String(agentId || '')
  };

  try {
    var result = await callApi('api_createBooking', [bookingData, agentId, 'Agent ' + agentId]);
    isSubmitting = false;

    var sendCon = document.getElementById('sendContract');
    if (sendCon && sendCon.checked && result && result.bookingId) {
      var bandEmail = bookingData.bandEmail || '';
      var perfDate  = '';
      try { perfDate = new Date(bookingData.date + 'T12:00:00').toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'}); } catch(e) { perfDate = bookingData.date; }

      var contractText = '';
      if (_contractMode === 'edit') {
        var ta = document.getElementById('contractTextarea');
        contractText = ta ? ta.value : '';
      }

      if (_contractMode === 'standard' || !contractText) {
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
          bookingId:   String(result.bookingId)
        };
        callApi('api_generateContractText', [bkDataForContract, null]).then(function(genResult) {
          var text = (genResult && genResult.text) ? genResult.text : '';
          if (text && bandEmail) {
            callApi('api_sendContract', [result.bookingId, text, bandEmail, bookingData.bandName, bookingData.venueName, perfDate, bookingData.agentId || '']).catch(function(){});
          }
        }).catch(function(){});
      } else if (contractText && bandEmail) {
        callApi('api_sendContract', [result.bookingId, contractText, bandEmail, bookingData.bandName, bookingData.venueName, perfDate, bookingData.agentId || '']).catch(function(){});
      }
    }

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
