// ============================================================================
// band-portal.js — logic for band-portal.html
// Converted from google.script.run to callApi() (see api.js).
// bandId comes from ?bid= URL param (set by GCal OAuth callback redirect)
// OR from sessionStorage (set at login), in that order.
// ============================================================================

var today    = new Date();
today.setHours(0,0,0,0);

var gigYear  = today.getFullYear();
var gigMonth = today.getMonth();
var allBookings  = [];
var bandId   = null;
var gcalEvents   = [];
var gcalIsConnected = false;

var availYear      = today.getFullYear();
var availMonth     = today.getMonth();
var selectedDates  = new Set();
var submittedDates = new Set();
var bookedDateSet  = new Set();

var MONTHS = ['January','February','March','April','May','June',
              'July','August','September','October','November','December'];

// ═══════════════════════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════════════════════
window.onload = function() {
  var urlParams = new URLSearchParams(window.location.search);
  var bidParam  = urlParams.get('bid') || sessionStorage.getItem('dka_id');

  if (!bidParam) {
    window.location.href = 'index.html';
    return;
  }

  callApi('getCurrentBandById', [bidParam]).then(function(band) {
    if (!band) { alert('Session expired. Please log in again.'); window.location.href = 'index.html'; return; }
    bandId = String(band.id);
    document.getElementById('bandName').textContent = band.name;
    loadBookings();
    loadAvailability();
  }).catch(function(e) {
    alert('Error loading band data: ' + e.message);
    window.location.href = 'index.html';
  });
};

// ═══════════════════════════════════════════════════════════════════════════
// GIGS TAB
// ═══════════════════════════════════════════════════════════════════════════
function loadBookings() {
  callApi('api_getBandBookings', [bandId]).then(function(bookings) {
    allBookings = bookings || [];
    bookedDateSet.clear();
    allBookings.forEach(function(b) {
      if (b.status && b.status.toLowerCase() !== 'cancelled') bookedDateSet.add(b.date);
    });
    updateStats();
    renderGigCalendar();
    if (allBookings.length === 0) {
      var msg = document.createElement('div');
      msg.style.cssText = 'text-align:center;padding:12px;font-size:0.8rem;color:#888;';
      msg.textContent = 'No bookings found for your band.';
      document.getElementById('calendarContainer').appendChild(msg);
    }
  }).catch(function(err) {
    document.getElementById('calendarContainer').innerHTML =
      '<div class="loading"><p style="color:#D32F2F;">Error loading bookings: ' + err.message + '</p></div>';
  });
}

function updateStats() {
  var confirmed = allBookings.filter(function(b){ return b.status === 'Confirmed'; }).length;
  var pending   = allBookings.filter(function(b){ return b.status === 'Pending'; }).length;
  var thisMonth = allBookings.filter(function(b){
    var d = new Date(b.date + 'T12:00:00');
    return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
  }).length;
  var earnings = allBookings.reduce(function(s,b){ return s + (parseFloat(b.payAmount)||0); }, 0);
  document.getElementById('statTotal').textContent     = allBookings.length;
  document.getElementById('statConfirmed').textContent = confirmed;
  document.getElementById('statPending').textContent   = pending;
  document.getElementById('statUpcoming').textContent  = thisMonth;
  document.getElementById('statEarnings').textContent  = '$' + earnings.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
}

function renderGigCalendar() {
  var firstDay    = new Date(gigYear, gigMonth, 1);
  var daysInMonth = new Date(gigYear, gigMonth + 1, 0).getDate();
  var startDow    = firstDay.getDay();
  document.getElementById('currentMonth').textContent = MONTHS[gigMonth] + ' ' + gigYear;

  var html = '<div class="calendar">';
  ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].forEach(function(d){
    html += '<div class="calendar-header">' + d + '</div>';
  });

  var prevDays = new Date(gigYear, gigMonth, 0).getDate();
  for (var i = startDow - 1; i >= 0; i--)
    html += '<div class="calendar-day other-month"><div class="day-number">' + (prevDays - i) + '</div></div>';

  for (var day = 1; day <= daysInMonth; day++) {
    var isToday = (day === today.getDate() && gigMonth === today.getMonth() && gigYear === today.getFullYear());
    var dateStr = gigYear + '-' + pad(gigMonth+1) + '-' + pad(day);
    html += '<div class="calendar-day' + (isToday ? ' today' : '') + '">';
    html += '<div class="day-number">' + day + '</div>';
    allBookings.filter(function(b){ return b.date === dateStr; }).forEach(function(b){
      html += '<div class="booking-item ' + b.status.toLowerCase() + '" onclick="showBooking(\'' + b.id + '\')">' +
              esc(b.venueName.substring(0,16)) + '</div>';
    });
    gcalEvents.filter(function(e){ return e.date === dateStr; }).forEach(function(e){
      if (!e.isDK) {
        var cls = 'gcal-event-item' + (e.allDay ? ' all-day' : '');
        var lbl = e.title.substring(0, 18);
        var time = e.startTime ? e.startTime + ' ' : '';
        html += '<div class="' + cls + '" title="' + esc(e.title) + '">' + time + esc(lbl) + '</div>';
      }
    });
    html += '</div>';
  }

  var remaining = 42 - (startDow + daysInMonth);
  for (var j = 1; j <= remaining; j++)
    html += '<div class="calendar-day other-month"><div class="day-number">' + j + '</div></div>';
  html += '</div>';
  document.getElementById('calendarContainer').innerHTML = html;
}

function previousMonth() { if (--gigMonth < 0) { gigMonth = 11; gigYear--; } gcalEvents = []; renderGigCalendar(); loadGcalEvents(); }
function nextMonth()      { if (++gigMonth > 11) { gigMonth = 0; gigYear++; }  gcalEvents = []; renderGigCalendar(); loadGcalEvents(); }
function goToToday()      { gigYear = today.getFullYear(); gigMonth = today.getMonth(); gcalEvents = []; renderGigCalendar(); loadGcalEvents(); }

function showBooking(bookingId) {
  var b = allBookings.find(function(x){ return x.id == bookingId; });
  if (!b) return;
  var sc = 'status-' + b.status.toLowerCase();
  var dateDisplay = '';
  try { dateDisplay = new Date(b.date + 'T12:00:00').toLocaleDateString(); } catch(e) { dateDisplay = b.date; }

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

  var html = '';
  html += row('Venue', '<strong>' + esc(b.venueName) + '</strong>');
  html += row('Date', dateDisplay);
  html += row('Time', cleanTime(b.startTime) + ' - ' + cleanTime(b.endTime));
  html += row('Status', '<span class="status-badge ' + sc + '">' + b.status + '</span>');
  html += row('Pay', '<strong>$' + parseFloat(b.payAmount).toFixed(2) + '</strong>');
  html += row('Sound/Lights', esc(b.soundLights||''));
  if (b.notes) html += row('Notes', esc(b.notes));
  document.getElementById('modalTitle').textContent = 'Gig Details';
  document.getElementById('modalContent').innerHTML = html;
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); }
function row(label, value) { return '<div class="detail-row"><span class="detail-label">' + label + '</span><span class="detail-value">' + value + '</span></div>'; }

// ═══════════════════════════════════════════════════════════════════════════
// AVAILABILITY TAB
// ═══════════════════════════════════════════════════════════════════════════
function loadAvailability() {
  callApi('api_getBandAvailability', [bandId]).then(function(data) {
    submittedDates.clear();
    if (data && data.dates && data.dates.length > 0) data.dates.forEach(function(d){ submittedDates.add(d); });
    if (data && data.lastUpdated) {
      var lu = document.getElementById('lastUpdatedRow');
      lu.style.display = 'flex';
      document.getElementById('lastUpdatedTime').textContent = new Date(data.lastUpdated).toLocaleString();
    }
    renderOnFileList();
    renderAvailCalendar();
  }).catch(function() {
    renderAvailCalendar();
  });
}

function renderAvailCalendar() {
  var firstDay    = new Date(availYear, availMonth, 1);
  var daysInMonth = new Date(availYear, availMonth + 1, 0).getDate();
  var startDow    = firstDay.getDay();
  document.getElementById('availMonthTitle').textContent = MONTHS[availMonth] + ' ' + availYear;

  var html = '';
  ['S','M','T','W','T','F','S'].forEach(function(d){ html += '<div class="avail-day-header">' + d + '</div>'; });
  for (var i = 0; i < startDow; i++) html += '<div class="avail-day empty"></div>';

  for (var day = 1; day <= daysInMonth; day++) {
    var ds = availYear + '-' + pad(availMonth+1) + '-' + pad(day);
    var d  = new Date(availYear, availMonth, day); d.setHours(0,0,0,0);
    var isPast   = d < today;
    var isBooked = bookedDateSet.has(ds);
    var isSub    = submittedDates.has(ds);
    var isSel    = selectedDates.has(ds);
    var isToday  = (d.getTime() === today.getTime());

    var classes = ['avail-day'];
    if (isPast) classes.push('past');
    else if (isBooked) classes.push('booked');
    else {
      classes.push('selectable');
      if (isSub) classes.push('submitted');
      if (isSel) classes.push('selected');
      if (isToday) classes.push('today-avail');
    }
    var clickable = !isPast && !isBooked;
    var onclick   = clickable ? ' onclick="toggleDate(\'' + ds + '\')"' : '';
    var title     = isBooked ? ' title="Already booked"' : (isPast ? ' title="Past date"' : '');
    html += '<div class="' + classes.join(' ') + '"' + onclick + title + '>' + day + '</div>';
  }
  document.getElementById('availCalendar').innerHTML = html;
}

function availPrevMonth() { if (--availMonth < 0) { availMonth = 11; availYear--; } renderAvailCalendar(); }
function availNextMonth() { if (++availMonth > 11) { availMonth = 0; availYear++; } renderAvailCalendar(); }

function toggleDate(ds) {
  if (selectedDates.has(ds)) selectedDates.delete(ds); else selectedDates.add(ds);
  renderAvailCalendar();
  renderSelectedChips();
}

function renderSelectedChips() {
  var count = selectedDates.size;
  document.getElementById('selectedCount').textContent = count;
  document.getElementById('submitAvailBtn').disabled = (count === 0);
  var sorted = Array.from(selectedDates).sort();
  var el = document.getElementById('selectedDatesList');
  if (sorted.length === 0) { el.innerHTML = '<span class="empty-chips">Click dates on the calendar to add them</span>'; return; }
  el.innerHTML = sorted.map(function(ds){
    var d = new Date(ds + 'T00:00:00');
    var lbl = d.toLocaleDateString('en-US',{month:'short',day:'numeric',weekday:'short'});
    return '<span class="date-chip">' + lbl + '<span class="remove" onclick="toggleDate(\'' + ds + '\')">&#x2715;</span></span>';
  }).join('');
}

function renderOnFileList() {
  var count = submittedDates.size;
  document.getElementById('onFileCount').textContent = count;
  var el = document.getElementById('onFileList');
  if (count === 0) { el.innerHTML = '<span style="color:#aaa;font-style:italic;">None on file yet</span>'; return; }
  var sorted = Array.from(submittedDates).sort();
  var future = sorted.filter(function(ds){ return new Date(ds + 'T00:00:00') >= today; });
  var past   = sorted.length - future.length;
  var html   = '';
  if (future.length === 0) {
    html = '<span style="color:#aaa;font-style:italic;">All submitted dates have passed</span>';
  } else {
    html = '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
    future.forEach(function(ds){
      var d   = new Date(ds + 'T00:00:00');
      var lbl = d.toLocaleDateString('en-US',{month:'short',day:'numeric',weekday:'short'});
      var cls = bookedDateSet.has(ds) ? 'color:#c62828;' : 'color:#00695c;';
      html += '<span style="font-size:0.78rem;font-weight:600;padding:3px 8px;border-radius:10px;background:#f0f9ff;' + cls + '">' + lbl + '</span>';
    });
    html += '</div>';
    if (past > 0) html += '<p style="font-size:0.75rem;color:#aaa;margin-top:8px;">+ ' + past + ' past date' + (past>1?'s':'') + ' not shown</p>';
  }
  el.innerHTML = html;
}

function submitAvailability() {
  if (selectedDates.size === 0) return;
  var btn = document.getElementById('submitAvailBtn');
  btn.disabled = true; btn.textContent = 'Sending…';
  var dates = Array.from(selectedDates).sort();
  var note  = document.getElementById('availNote').value.trim();

  callApi('api_setBandAvailability', [bandId, dates, note]).then(function() {
    dates.forEach(function(d){ submittedDates.add(d); });
    selectedDates.clear();
    var lu = document.getElementById('lastUpdatedRow');
    lu.style.display = 'flex';
    document.getElementById('lastUpdatedTime').textContent = new Date().toLocaleString();
    renderAvailCalendar();
    renderSelectedChips();
    renderOnFileList();
    btn.textContent = 'Submit Availability';
    showToast('&#10003; Availability sent to your booking agent!', 'success');
  }).catch(function(err) {
    btn.disabled = false; btn.textContent = 'Submit Availability';
    showToast('Error saving availability: ' + err.message, 'error');
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// GOOGLE CALENDAR
// ═══════════════════════════════════════════════════════════════════════════
function loadGcalEvents() {
  if (!gcalIsConnected || !bandId) return;
  var lastDay  = new Date(gigYear, gigMonth + 1, 0);
  var startStr = gigYear + '-' + pad(gigMonth+1) + '-01';
  var endStr   = gigYear + '-' + pad(gigMonth+1) + '-' + pad(lastDay.getDate());
  callApi('api_getBandGcalEvents', [bandId, startStr, endStr]).then(function(result) {
    gcalEvents = (result && result.success && result.events) ? result.events : [];
    document.getElementById('calLegend').style.display = gcalEvents.length ? 'flex' : 'none';
    renderGigCalendar();
  }).catch(function() {
    gcalEvents = []; renderGigCalendar();
  });
}

function loadGcalStatus() {
  callApi('api_getGcalStatus', [bandId]).then(function(status) {
    document.getElementById('gcalLoading').style.display = 'none';
    if (status && status.connected) {
      gcalIsConnected = true;
      document.getElementById('gcalConnected').style.display = 'flex';
      document.getElementById('gcalDisconnected').style.display = 'none';
      document.getElementById('gcalConnectBtn').style.display = 'none';
      if (status.email) document.getElementById('gcalConnectedEmail').textContent = 'Connected as ' + status.email + '. New bookings will be added automatically.';
      loadGcalEvents();
    } else {
      document.getElementById('gcalConnected').style.display = 'none';
      document.getElementById('gcalDisconnected').style.display = 'flex';
      document.getElementById('gcalConnectBtn').style.display = 'flex';
    }
  }).catch(function() {
    document.getElementById('gcalLoading').style.display = 'none';
    document.getElementById('gcalDisconnected').style.display = 'flex';
    document.getElementById('gcalConnectBtn').style.display = 'flex';
  });
}

function connectGcal() {
  callApi('api_getGcalAuthUrl', [bandId]).then(function(url) {
    window.location.href = url;
  }).catch(function(err) {
    showToast('Error starting Google login: ' + err.message, 'error');
  });
}

function disconnectGcal() {
  if (!confirm('Disconnect Google Calendar? Future bookings will no longer be added automatically.')) return;
  callApi('api_disconnectGcal', [bandId]).then(function() {
    gcalIsConnected = false;
    document.getElementById('gcalConnected').style.display = 'none';
    document.getElementById('gcalDisconnected').style.display = 'flex';
    document.getElementById('gcalConnectBtn').style.display = 'flex';
    showToast('Google Calendar disconnected.', 'success');
  }).catch(function(err) {
    showToast('Error disconnecting: ' + err.message, 'error');
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(function(t){ t.classList.remove('active'); });
  document.querySelectorAll('.tab-panel').forEach(function(p){ p.classList.remove('active'); });
  document.getElementById('tab-' + tab).classList.add('active');
  document.getElementById('panel-' + tab).classList.add('active');
  if (tab === 'gcal' && bandId) loadGcalStatus();
}

function showToast(msg, type) {
  var t = document.getElementById('toast');
  t.innerHTML = msg; t.className = 'toast ' + (type||'success');
  void t.offsetWidth; t.classList.add('show');
  setTimeout(function(){ t.classList.remove('show'); }, 3500);
}

function pad(n) { return n < 10 ? '0' + n : String(n); }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function logout() {
  callApi('logoutBand', []).finally(function() {
    sessionStorage.removeItem('dka_role');
    sessionStorage.removeItem('dka_id');
    window.location.href = 'index.html';
  });
}
