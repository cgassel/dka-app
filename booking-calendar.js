// ============================================================================
// booking-calendar.js — logic for booking-calendar.html
// Converted from google.script.run to callApi() (see api.js).
// Session handled via sessionStorage set at login.
// ============================================================================

var currentDate  = new Date();
var currentYear  = currentDate.getFullYear();
var currentMonth = currentDate.getMonth();
var allBookings  = [];
var pendingAction = null;

window.onload = function() {
  if (!sessionStorage.getItem('dka_role')) {
    window.location.href = 'index.html'; return;
  }
  loadData();
};

function loadData() {
  callApi('api_getAllBookings', []).then(function(bookings) {
    allBookings = bookings || [];
    updateStats();
    renderCalendar();
  }).catch(function(error) {
    document.getElementById('calendarContainer').innerHTML =
      '<div style="padding:40px;text-align:center;color:#D32F2F;">Error: ' + esc(error.message) + '</div>';
  });

  callApi('api_getVenuesFullData', []).then(function(venueData) {
    var select = document.getElementById('filterVenue');
    (venueData || []).forEach(function(venue) {
      var option = document.createElement('option');
      option.value = venue.id;
      option.textContent = venue.name;
      select.appendChild(option);
    });
  }).catch(function() {});
}

function updateStats() {
  document.getElementById('statTotal').textContent     = allBookings.length;
  document.getElementById('statConfirmed').textContent = allBookings.filter(function(b){ return b.status === 'Confirmed'; }).length;
  document.getElementById('statPending').textContent   = allBookings.filter(function(b){ return b.status === 'Pending'; }).length;
}

function renderCalendar() {
  var firstDay          = new Date(currentYear, currentMonth, 1);
  var daysInMonth       = new Date(currentYear, currentMonth + 1, 0).getDate();
  var startingDayOfWeek = firstDay.getDay();
  var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('currentMonth').textContent = MONTHS[currentMonth] + ' ' + currentYear;

  var filterVenue  = document.getElementById('filterVenue').value;
  var filterStatus = document.getElementById('filterStatus').value;
  var filtered = allBookings.filter(function(b) {
    if (filterVenue  && b.venueId != filterVenue)   return false;
    if (filterStatus && b.status  !== filterStatus) return false;
    return true;
  });

  var html = '<div class="calendar">';
  ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].forEach(function(d) {
    html += '<div class="calendar-header">' + d + '</div>';
  });

  var prevDays = new Date(currentYear, currentMonth, 0).getDate();
  for (var i = startingDayOfWeek - 1; i >= 0; i--) {
    html += '<div class="calendar-day other-month"><div class="day-number">' + (prevDays - i) + '</div></div>';
  }

  for (var day = 1; day <= daysInMonth; day++) {
    var pad = function(n) { return n < 10 ? '0' + n : String(n); };
    var dateStr = currentYear + '-' + pad(currentMonth + 1) + '-' + pad(day);
    var isToday = (day === currentDate.getDate() && currentMonth === currentDate.getMonth() && currentYear === currentDate.getFullYear());
    html += '<div class="calendar-day' + (isToday ? ' today' : '') + '" onclick="dayClicked(\'' + dateStr + '\')">';
    html += '<div class="day-number">' + day + '</div>';

    var dayBookings = filtered.filter(function(b) {
      var bd = new Date(b.date + 'T12:00:00');
      return bd.getFullYear() === currentYear && bd.getMonth() === currentMonth && bd.getDate() === day;
    });

    var maxShow = 3;
    for (var i = 0; i < Math.min(dayBookings.length, maxShow); i++) {
      var b = dayBookings[i];
      var sc = b.status.toLowerCase().replace(/\s+/g, '-');
      var label = b.venueName.substring(0, 15) + (b.venueName.length > 15 ? '...' : '');
      html += '<div class="booking-item ' + sc + '" onclick="event.stopPropagation(); showBooking(' + b.id + ')">';
      html += '<span>' + esc(label) + '</span>';
      html += '<div class="booking-actions">';
      if (b.status !== 'Cancelled') {
        html += '<button class="booking-action-btn" title="Cancel booking" onclick="event.stopPropagation(); promptCancel(' + b.id + ')">&#x2715;</button>';
      }
      html += '<button class="booking-action-btn" title="Delete booking" onclick="event.stopPropagation(); promptDelete(' + b.id + ')">&#x1F5D1;</button>';
      html += '</div></div>';
    }

    if (dayBookings.length > maxShow) {
      html += '<div class="more-bookings">+' + (dayBookings.length - maxShow) + ' more</div>';
    }
    html += '</div>';
  }

  var remaining = 42 - (startingDayOfWeek + daysInMonth);
  for (var i = 1; i <= remaining; i++) {
    html += '<div class="calendar-day other-month"><div class="day-number">' + i + '</div></div>';
  }
  html += '</div>';
  document.getElementById('calendarContainer').innerHTML = html;
}

function previousMonth() { if (--currentMonth < 0) { currentMonth = 11; currentYear--; } renderCalendar(); }
function nextMonth()     { if (++currentMonth > 11) { currentMonth = 0;  currentYear++; } renderCalendar(); }
function goToToday()     { currentYear = currentDate.getFullYear(); currentMonth = currentDate.getMonth(); renderCalendar(); }
function dayClicked(dateStr) { /* Could pre-fill create booking for this date */ }

// ── SHOW BOOKING MODAL ──────────────────────────────────────────────────────
function showBooking(bookingId) {
  var b = allBookings.find(function(x) { return x.id == bookingId; });
  if (!b) return;
  var sc = 'status-' + b.status.toLowerCase();

  function cleanTime(t) {
    if (!t) return '';
    var s = String(t);
    if (s.indexOf('1899') !== -1 || s.indexOf('GMT') !== -1) {
      var m = s.match(/(\d{1,2}):(\d{2})/);
      if (m) { var h=parseInt(m[1]),mn=m[2],ap=h>=12?'PM':'AM'; h=h%12||12; return h+':'+mn+' '+ap; }
      return '';
    }
    var m2 = s.match(/^(\d{1,2}):(\d{2})/);
    if (m2) { var h2=parseInt(m2[1]),mn2=m2[2],ap2=h2>=12?'PM':'AM'; h2=h2%12||12; return h2+':'+mn2+' '+ap2; }
    return s;
  }

  var dateDisplay = '';
  try { dateDisplay = new Date(b.date + 'T12:00:00').toLocaleDateString(); } catch(e) { dateDisplay = b.date; }

  var html = '';
  html += dr('Venue',       '<strong>' + esc(b.venueName) + '</strong>');
  html += dr('Band',        '<strong>' + esc(b.bandName)  + '</strong>');
  html += dr('Date',        dateDisplay);
  html += dr('Time',        cleanTime(b.startTime) + ' – ' + cleanTime(b.endTime));
  html += dr('Status',      '<span class="status-badge ' + sc + '">' + esc(b.status) + '</span>');
  html += dr('Sound/Lights', esc(b.soundLights));
  html += dr('Agent',       esc(b.agentName));
  if (b.notes) html += dr('Notes', '<span style="max-width:250px;display:inline-block;">' + esc(b.notes) + '</span>');

  document.getElementById('modalTitle').textContent = 'Booking #' + b.id;
  document.getElementById('modalContent').innerHTML = html;

  var actions = '';
  actions += '<button class="btn btn-primary" onclick="closeModal(); openEditModal(' + b.id + ')">Edit Booking</button>';
  if (b.status !== 'Cancelled') {
    actions += '<button class="btn btn-orange" onclick="closeModal(); promptCancel(' + b.id + ')">Mark Cancelled</button>';
  }
  actions += '<button class="btn btn-red" onclick="closeModal(); promptDelete(' + b.id + ')">Delete Booking</button>';
  actions += '<button class="btn btn-ghost" onclick="closeModal()">Close</button>';
  document.getElementById('modalActions').innerHTML = actions;

  document.getElementById('modalOverlay').classList.add('open');
}

function dr(label, value) {
  return '<div class="detail-row"><span class="detail-label">' + label + '</span><span class="detail-value">' + value + '</span></div>';
}
function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); }

// ── CANCEL / DELETE ─────────────────────────────────────────────────────────
function promptCancel(bookingId) {
  var b = allBookings.find(function(x){ return x.id == bookingId; });
  if (!b) return;
  pendingAction = { type: 'cancel', bookingId: bookingId };
  document.getElementById('confirmIcon').textContent  = '\u26A0\uFE0F';
  document.getElementById('confirmTitle').textContent = 'Cancel This Booking?';
  document.getElementById('confirmMsg').innerHTML     = 'This will mark <strong>' + esc(b.venueName) + '</strong> on <strong>' + esc(b.date) + '</strong> as Cancelled.<br>The record will be kept.';
  document.getElementById('confirmActionBtn').className   = 'btn btn-orange';
  document.getElementById('confirmActionBtn').textContent = 'Yes, Cancel It';
  document.getElementById('confirmOverlay').classList.add('open');
}

function promptDelete(bookingId) {
  var b = allBookings.find(function(x){ return x.id == bookingId; });
  if (!b) return;
  pendingAction = { type: 'delete', bookingId: bookingId };
  document.getElementById('confirmIcon').innerHTML     = '&#x1F5D1;&#xFE0F;';
  document.getElementById('confirmTitle').textContent  = 'Delete This Booking?';
  document.getElementById('confirmMsg').innerHTML      = 'This will <strong>permanently delete</strong> the booking for <strong>' + esc(b.venueName) + '</strong> on <strong>' + esc(b.date) + '</strong>.<br>This cannot be undone.';
  document.getElementById('confirmActionBtn').className   = 'btn btn-red';
  document.getElementById('confirmActionBtn').textContent = 'Yes, Delete It';
  document.getElementById('confirmOverlay').classList.add('open');
}

function closeConfirm() { document.getElementById('confirmOverlay').classList.remove('open'); pendingAction = null; }

function confirmAction() {
  if (!pendingAction) return;
  document.getElementById('confirmOverlay').classList.remove('open');
  var action = pendingAction;
  pendingAction = null;

  if (action.type === 'cancel') {
    callApi('api_updateBookingStatus', [action.bookingId, 'Cancelled']).then(function() {
      var b = allBookings.find(function(x){ return x.id == action.bookingId; });
      if (b) b.status = 'Cancelled';
      updateStats(); renderCalendar();
      showToast('Booking marked as cancelled', 'success');
    }).catch(function(err) { showToast('Error: ' + err.message, 'error'); });

  } else if (action.type === 'delete') {
    callApi('api_deleteBooking', [action.bookingId]).then(function() {
      allBookings = allBookings.filter(function(x){ return x.id != action.bookingId; });
      updateStats(); renderCalendar();
      showToast('Booking deleted', 'success');
    }).catch(function(err) { showToast('Error: ' + err.message, 'error'); });
  }
}

// ── EDIT MODAL ──────────────────────────────────────────────────────────────
function openEditModal(bookingId) {
  var b = allBookings.find(function(x){ return x.id == bookingId; });
  if (!b) return;

  document.getElementById('editBookingId').value   = b.id;
  document.getElementById('editModalTitle').textContent = 'Edit Booking #' + b.id + ' — ' + esc(b.venueName) + ' / ' + esc(b.bandName);
  document.getElementById('editDate').value        = b.date ? b.date.substring(0, 10) : '';
  document.getElementById('editStatus').value      = b.status || 'Confirmed';
  document.getElementById('editSoundLights').value = b.soundLights || 'Yes';
  document.getElementById('editNotes').value       = b.notes || '';
  document.getElementById('editError').style.display = 'none';

  function toTimeInput(t) {
    if (!t) return '';
    var s = String(t);
    if (s.indexOf('1899') !== -1 || s.indexOf('GMT') !== -1) {
      var m = s.match(/(\d{1,2}):(\d{2})/);
      return m ? (m[1].length === 1 ? '0' + m[1] : m[1]) + ':' + m[2] : '';
    }
    var m2 = s.match(/^(\d{1,2}):(\d{2})/);
    return m2 ? (m2[1].length === 1 ? '0' + m2[1] : m2[1]) + ':' + m2[2] : '';
  }
  document.getElementById('editStartTime').value = toTimeInput(b.startTime);
  document.getElementById('editEndTime').value   = toTimeInput(b.endTime);

  document.getElementById('editModalOverlay').classList.add('open');
}

function closeEditModal() { document.getElementById('editModalOverlay').classList.remove('open'); }

function saveBookingEdit() {
  var bookingId = document.getElementById('editBookingId').value;
  var saveBtn   = document.getElementById('editSaveBtn');
  var errorDiv  = document.getElementById('editError');
  errorDiv.style.display = 'none';

  var updates = {
    date:        document.getElementById('editDate').value,
    startTime:   document.getElementById('editStartTime').value,
    endTime:     document.getElementById('editEndTime').value,
    soundLights: document.getElementById('editSoundLights').value,
    status:      document.getElementById('editStatus').value,
    notes:       document.getElementById('editNotes').value
  };

  if (!updates.date) {
    errorDiv.textContent = 'Please enter a date.';
    errorDiv.style.display = 'block';
    return;
  }

  saveBtn.textContent = 'Saving...'; saveBtn.disabled = true;

  callApi('api_updateBooking', [bookingId, updates]).then(function() {
    var b = allBookings.find(function(x){ return x.id == bookingId; });
    if (b) {
      b.date = updates.date; b.startTime = updates.startTime;
      b.endTime = updates.endTime; b.soundLights = updates.soundLights;
      b.status = updates.status; b.notes = updates.notes;
    }
    closeEditModal(); updateStats(); renderCalendar();
    showToast('Booking updated successfully', 'success');
    saveBtn.textContent = 'Save Changes'; saveBtn.disabled = false;
  }).catch(function(err) {
    errorDiv.textContent = 'Error: ' + err.message;
    errorDiv.style.display = 'block';
    saveBtn.textContent = 'Save Changes'; saveBtn.disabled = false;
  });
}

// ── UTILS ────────────────────────────────────────────────────────────────────
function showToast(msg, type) {
  var t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast ' + (type||'');
  t.classList.add('show');
  setTimeout(function(){ t.classList.remove('show'); }, 3000);
}

function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function createBooking() { window.location.href = 'create-booking.html'; }
function goToDashboard() { window.location.href = 'agent-dashboard.html'; }
