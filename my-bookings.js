// ============================================================================
// my-bookings.js — logic for my-bookings.html
// Converted from google.script.run to callApi() (see api.js).
// agentId read from sessionStorage (set at login).
// ============================================================================

var allBookings   = [];
var allBands      = [];
var agentId       = null;
var commissionMap = {};
var now           = new Date();
var currentYear   = now.getFullYear();
var currentMonth  = now.getMonth();
var confirmCb     = null;
var MONTH_NAMES   = ['January','February','March','April','May','June','July','August','September','October','November','December'];

window.onload = function() {
  agentId = sessionStorage.getItem('dka_id');
  if (!agentId) {
    window.location.href = 'index.html'; return;
  }

  callApi('api_getAgentBookingsFull', [agentId]).then(function(bookings) {
    allBookings = bookings || [];
    updateStats();
    renderCalendar();
  }).catch(showError);

  callApi('api_getBandsFullData', []).then(function(bands) {
    allBands = bands || [];
    commissionMap = {};
    allBands.forEach(function(b){ commissionMap[b.id] = parseFloat(b.commission) || 0; });
    populateBandDropdown();
  }).catch(function(){});
};

function populateBandDropdown() {
  var sel = document.getElementById('editBandId');
  allBands.forEach(function(b) {
    var opt = document.createElement('option');
    opt.value = b.id;
    opt.textContent = b.name;
    opt.dataset.payNoSound   = b.payRateNoSound   || 0;
    opt.dataset.payWithSound = b.payRateWithSound || 0;
    opt.dataset.commission   = b.commission       || 0;
    sel.appendChild(opt);
  });
}

function updateStats() {
  var confirmed  = allBookings.filter(function(b){ return b.status === 'Confirmed'; }).length;
  var pending    = allBookings.filter(function(b){ return b.status === 'Pending'; }).length;
  var commission = allBookings.reduce(function(sum, b) {
    if ((b.status||'').toLowerCase() === 'cancelled') return sum;
    var pay = parseFloat(b.payAmount)    || 0;
    var pct = parseFloat(b.commissionPct) || commissionMap[b.bandId] || 0;
    return sum + pay * pct / 100;
  }, 0);
  document.getElementById('statTotal').textContent      = allBookings.length;
  document.getElementById('statConfirmed').textContent  = confirmed;
  document.getElementById('statPending').textContent    = pending;
  document.getElementById('statCommission').textContent = '$' + commission.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});
}

function renderCalendar() {
  var filterStatus = document.getElementById('filterStatus').value;
  var filtered = allBookings.filter(function(b){ return !filterStatus || b.status === filterStatus; });

  var firstDay    = new Date(currentYear, currentMonth, 1);
  var daysInMonth = new Date(currentYear, currentMonth+1, 0).getDate();
  var startDow    = firstDay.getDay();
  var prevDays    = new Date(currentYear, currentMonth, 0).getDate();

  document.getElementById('currentMonth').textContent = MONTH_NAMES[currentMonth] + ' ' + currentYear;

  function pad(n){ return n < 10 ? '0' + n : String(n); }

  var h = '';
  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(function(d){ h += '<div class="calendar-header">' + d + '</div>'; });

  for (var i = startDow-1; i >= 0; i--)
    h += '<div class="calendar-day other-month"><div class="day-number">' + (prevDays-i) + '</div></div>';

  for (var day = 1; day <= daysInMonth; day++) {
    var ds = currentYear + '-' + pad(currentMonth+1) + '-' + pad(day);
    var isToday = (day===now.getDate() && currentMonth===now.getMonth() && currentYear===now.getFullYear());
    h += '<div class="calendar-day' + (isToday?' today':'') + '">';
    h += '<div class="day-number">' + day + '</div>';

    filtered.filter(function(b){
      var bd = new Date(b.date + 'T12:00:00');
      return bd.getFullYear()===currentYear && bd.getMonth()===currentMonth && bd.getDate()===day;
    }).forEach(function(b) {
      var sc    = (b.status||'pending').toLowerCase().replace(/\s+/g,'-');
      var label = esc((b.venueName||'').substring(0,14));
      var band  = esc((b.bandName||'').substring(0,14));
      h += '<div class="booking-chip chip-' + sc + '" onclick="showDetail(' + b.id + ')">';
      h += '<div style="min-width:0;overflow:hidden;">';
      h += '<div style="font-size:0.7rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + label + '</div>';
      h += '<div style="font-size:0.63rem;opacity:0.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + band + '</div>';
      h += '</div>';
      h += '<div class="chip-actions" onclick="event.stopPropagation();">';
      h += '<button class="chip-btn" title="Edit" onclick="openEdit(' + b.id + ')">&#9998;</button>';
      if (b.status !== 'Cancelled') h += '<button class="chip-btn" title="Cancel" onclick="promptCancel(' + b.id + ')">&#x2715;</button>';
      h += '</div></div>';
    });
    h += '</div>';
  }

  var remaining = 42 - (startDow + daysInMonth);
  for (var j = 1; j <= remaining; j++)
    h += '<div class="calendar-day other-month"><div class="day-number">' + j + '</div></div>';

  document.getElementById('calendarContainer').innerHTML = h;
}

function prevMonth() { if (--currentMonth < 0) { currentMonth=11; currentYear--; } renderCalendar(); }
function nextMonth() { if (++currentMonth > 11) { currentMonth=0; currentYear++; } renderCalendar(); }
function goToday()   { now=new Date(); currentYear=now.getFullYear(); currentMonth=now.getMonth(); renderCalendar(); }

function fmt(n) { return '$'+(n||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0}); }
function fmtTime(t) {
  if (!t) return '';
  var m = String(t).match(/(\d{1,2}):(\d{2})/);
  if (!m) return t;
  var h=parseInt(m[1]),mn=m[2],ap=h>=12?'PM':'AM';
  h=h%12||12; return h+':'+mn+' '+ap;
}

function showDetail(id) {
  var b = allBookings.find(function(x){ return String(x.id)===String(id); });
  if (!b) return;
  var pct  = parseFloat(b.commissionPct) || commissionMap[b.bandId] || 0;
  var pay  = parseFloat(b.payAmount) || 0;
  var comm = pay * pct / 100;
  var sc   = (b.status||'pending').toLowerCase().replace(/\s+/g,'-');
  var dateStr = '';
  try { dateStr = new Date(b.date+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}); } catch(e){ dateStr = b.date; }

  document.getElementById('modalTitle').textContent = esc(b.venueName) + ' — ' + esc(b.bandName);
  var html = '';
  html += dr('Date',        '<strong>' + dateStr + '</strong>');
  if (b.startTime) html += dr('Time', fmtTime(b.startTime) + (b.endTime ? ' – ' + fmtTime(b.endTime) : ''));
  html += dr('Venue',       esc(b.venueName||'—'));
  html += dr('Band',        esc(b.bandName||'—'));
  html += dr('Status',      '<span class="status-badge s-' + sc + '">' + esc(b.status) + '</span>');
  html += dr('Sound/Lights',esc(b.soundLights||'—'));
  html += dr('Band Pay',    '<span style="color:var(--blue);font-weight:700;">' + fmt(pay) + '</span>');
  html += dr('Commission %', pct + '%');
  html += dr('My Commission','<span style="color:var(--green);font-weight:700;">' + fmt(comm) + '</span>');
  if (b.notes) html += dr('Notes', esc(b.notes));
  document.getElementById('modalContent').innerHTML = html;
  document.getElementById('modalActions').innerHTML =
    '<button class="btn btn-ghost" onclick="closeModal()">Close</button>' +
    '<button class="btn btn-primary" onclick="closeModal();openEdit(' + id + ')">&#9998; Edit</button>';
  document.getElementById('modalOverlay').classList.add('open');
}

function dr(label, value) {
  return '<div class="detail-row"><span class="detail-label">' + label + '</span><span class="detail-value">' + value + '</span></div>';
}
function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); }

function openEdit(id) {
  var b = allBookings.find(function(x){ return String(x.id)===String(id); });
  if (!b) return;
  document.getElementById('editBookingId').value    = b.id;
  document.getElementById('editVenueName').value    = b.venueName || '';
  document.getElementById('editBandId').value       = b.bandId || '';
  document.getElementById('editDate').value         = b.date || '';
  document.getElementById('editStatus').value       = b.status || 'Pending';
  document.getElementById('editStartTime').value    = b.startTime || '';
  document.getElementById('editEndTime').value      = b.endTime   || '';
  document.getElementById('editSoundLights').value  = b.soundLights || 'Venue';
  document.getElementById('editPayAmount').value    = b.payAmount || '';
  document.getElementById('editCommissionPct').value= parseFloat(b.commissionPct) || commissionMap[b.bandId] || 0;
  document.getElementById('editNotes').value        = b.notes || '';
  document.getElementById('editError').style.display = 'none';
  editCalcCommission();
  document.getElementById('editModalOverlay').classList.add('open');
}

function closeEditModal() { document.getElementById('editModalOverlay').classList.remove('open'); }

function editBandChanged() {
  var sel = document.getElementById('editBandId');
  var opt = sel.options[sel.selectedIndex];
  if (!opt || !opt.value) return;
  var sl  = document.getElementById('editSoundLights').value;
  var pay = sl === 'Venue' ? parseFloat(opt.dataset.payNoSound||0) : parseFloat(opt.dataset.payWithSound||0);
  var pct = parseFloat(opt.dataset.commission||0);
  document.getElementById('editPayAmount').value      = pay || '';
  document.getElementById('editCommissionPct').value  = pct || '';
  editCalcCommission();
}

function editCalcPay() {
  var sel = document.getElementById('editBandId');
  var opt = sel.options[sel.selectedIndex];
  if (!opt || !opt.value) return;
  var sl  = document.getElementById('editSoundLights').value;
  var pay = sl === 'Venue' ? parseFloat(opt.dataset.payNoSound||0) : parseFloat(opt.dataset.payWithSound||0);
  if (pay) document.getElementById('editPayAmount').value = pay;
  editCalcCommission();
}

function editCalcCommission() {
  var pay  = parseFloat(document.getElementById('editPayAmount').value)     || 0;
  var pct  = parseFloat(document.getElementById('editCommissionPct').value) || 0;
  var comm = pay * pct / 100;
  document.getElementById('editCommissionAmt').value = fmt(comm);
  var preview = document.getElementById('payPreview');
  if (pay > 0) {
    document.getElementById('previewBandPay').textContent    = fmt(pay);
    document.getElementById('previewCommission').textContent = fmt(comm);
    preview.style.display = 'block';
  } else {
    preview.style.display = 'none';
  }
}

function saveEdit() {
  var id    = document.getElementById('editBookingId').value;
  var errEl = document.getElementById('editError');
  errEl.style.display = 'none';
  var bandSel  = document.getElementById('editBandId');
  var bandId   = bandSel.value;
  var bandName = bandSel.options[bandSel.selectedIndex] ? bandSel.options[bandSel.selectedIndex].textContent : '';
  var updates = {
    bandId:        bandId,
    bandName:      bandName,
    date:          document.getElementById('editDate').value,
    status:        document.getElementById('editStatus').value,
    startTime:     document.getElementById('editStartTime').value,
    endTime:       document.getElementById('editEndTime').value,
    soundLights:   document.getElementById('editSoundLights').value,
    payAmount:     document.getElementById('editPayAmount').value,
    commissionPct: document.getElementById('editCommissionPct').value,
    notes:         document.getElementById('editNotes').value
  };
  if (!updates.date)   { errEl.textContent='Date is required.';    errEl.style.display='block'; return; }
  if (!updates.bandId) { errEl.textContent='Please select a band.'; errEl.style.display='block'; return; }

  callApi('api_updateBooking', [id, updates]).then(function() {
    var b = allBookings.find(function(x){ return String(x.id)===String(id); });
    if (b) {
      b.bandId=updates.bandId; b.bandName=updates.bandName; b.date=updates.date;
      b.status=updates.status; b.startTime=updates.startTime; b.endTime=updates.endTime;
      b.soundLights=updates.soundLights; b.payAmount=updates.payAmount;
      b.commissionPct=updates.commissionPct; b.notes=updates.notes;
    }
    closeEditModal(); updateStats(); renderCalendar();
    showToast('Booking updated successfully.', 'success');
  }).catch(function(e) {
    errEl.textContent = 'Error: ' + e.message; errEl.style.display = 'block';
  });
}

function promptCancel(id) {
  var b = allBookings.find(function(x){ return String(x.id)===String(id); });
  if (!b) return;
  document.getElementById('confirmIcon').textContent   = '\u26a0\ufe0f';
  document.getElementById('confirmTitle').textContent  = 'Cancel Booking?';
  document.getElementById('confirmMsg').textContent    = esc(b.venueName) + ' — ' + esc(b.bandName) + ' on ' + b.date + '. This cannot be undone.';
  document.getElementById('confirmActionBtn').className   = 'btn btn-red';
  document.getElementById('confirmActionBtn').textContent = 'Cancel Booking';
  confirmCb = function() {
    callApi('api_updateBookingStatus', [id, 'Cancelled', agentId]).then(function() {
      var bk = allBookings.find(function(x){ return String(x.id)===String(id); });
      if (bk) bk.status = 'Cancelled';
      closeConfirm(); updateStats(); renderCalendar();
      showToast('Booking cancelled.', 'success');
    }).catch(function(e){ closeConfirm(); showToast('Error: '+e.message,'error'); });
  };
  document.getElementById('confirmOverlay').classList.add('open');
}

function confirmAction() { if (confirmCb) confirmCb(); }
function closeConfirm()  { document.getElementById('confirmOverlay').classList.remove('open'); confirmCb=null; }

function showToast(msg, type) {
  var t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast ' + (type||'success');
  t.classList.add('show');
  setTimeout(function(){ t.classList.remove('show'); }, 3000);
}

function showError(e) {
  document.getElementById('calendarContainer').innerHTML =
    '<div style="padding:40px;text-align:center;color:var(--red);">Error: ' + esc((e&&e.message)||String(e)) + '</div>';
}

function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function goToDashboard()   { window.location.href = 'agent-dashboard.html'; }
function goCreateBooking() { window.location.href = 'create-booking.html'; }
