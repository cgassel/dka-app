// ============================================================================
// venue-schedule.js — logic for venue-schedule.html
// Converted from google.script.run to callApi() (see api.js).
// venueId read from ?vid= URL param or sessionStorage (same as venue-calendar).
// api_saveVenueScheduleById is a new wrapper in ApiRouter.gs that accepts
// venueId explicitly since PropertiesService session doesn't apply here.
// ============================================================================

var DAYS     = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
var DAY_FULL = { Mon:'Monday', Tue:'Tuesday', Wed:'Wednesday', Thu:'Thursday', Fri:'Friday', Sat:'Saturday', Sun:'Sunday' };

var TIME_OPTIONS = (function() {
  var opts = [];
  function fmt(h, m) {
    var suffix = h < 12 ? 'AM' : 'PM';
    var disp   = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return disp + ':' + (m === 0 ? '00' : '30') + ' ' + suffix;
  }
  for (var h = 9;  h < 12; h++) { opts.push(fmt(h,0)); opts.push(fmt(h,30)); }
  opts.push(fmt(12,0)); opts.push(fmt(12,30));
  for (var h = 13; h < 24; h++) { opts.push(fmt(h,0)); opts.push(fmt(h,30)); }
  opts.push(fmt(0,0)); opts.push(fmt(0,30));
  for (var h = 1; h <= 2; h++) { opts.push(fmt(h,0)); opts.push(fmt(h,30)); }
  return opts;
})();

var SLOT_DEFAULTS = [
  { start:'6:00 PM',  end:'9:00 PM'  },
  { start:'9:00 PM',  end:'12:00 AM' },
  { start:'12:00 AM', end:'2:00 AM'  },
  { start:'3:00 PM',  end:'6:00 PM'  }
];

var activeDays = {};
var venueId    = null;

// ═══════════════════════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════════════════════
window.onload = function() {
  var urlParams = new URLSearchParams(window.location.search);
  var vidParam  = urlParams.get('vid') || sessionStorage.getItem('dka_id');
  if (!vidParam) { window.location.href = 'index.html'; return; }

  callApi('getCurrentVenueById', [vidParam]).then(function(venue) {
    if (!venue) { window.location.href = 'venue-calendar.html'; return; }
    venueId = venue.id;
    document.getElementById('venueNameBar').textContent = venue.name;

    if (venue.scheduleJSON) {
      try { loadSchedule(JSON.parse(venue.scheduleJSON)); } catch(e) {}
    }

    document.getElementById('pageLoading').style.display = 'none';
    document.getElementById('editor').style.display      = 'block';
    updateHint();
    updateSummary();
  }).catch(function(e) {
    alert('Error loading venue: ' + e.message);
    window.location.href = 'venue-calendar.html';
  });
};

// ═══════════════════════════════════════════════════════════════════════════
// SCHEDULE LOAD / TOGGLE / BUILD
// ═══════════════════════════════════════════════════════════════════════════
function loadSchedule(schedule) {
  DAYS.forEach(function(day) {
    if (!schedule[day] || !schedule[day].length) return;
    var slots = schedule[day];
    activeDays[day] = true;
    document.getElementById('slots-' + day).value = Math.min(slots.length, 4);
    document.querySelector('.day-toggle[data-day="' + day + '"]').classList.add('active');
    document.getElementById('panel-' + day).classList.add('open');
    buildSlotRows(day, slots.length, slots);
  });
}

function toggleDay(day) {
  var toggle = document.querySelector('.day-toggle[data-day="' + day + '"]');
  var panel  = document.getElementById('panel-' + day);
  if (activeDays[day]) {
    delete activeDays[day];
    toggle.classList.remove('active');
    panel.classList.remove('open');
  } else {
    activeDays[day] = true;
    toggle.classList.add('active');
    panel.classList.add('open');
    if (!document.getElementById('slotRows-' + day).children.length) {
      buildSlotRows(day, 1, null);
    }
  }
  updateHint();
  updateSummary();
}

function buildSlotRows(day, count, existingSlots) {
  count = parseInt(count) || 1;
  var container = document.getElementById('slotRows-' + day);
  container.innerHTML = '';
  for (var i = 0; i < count; i++) {
    var def        = SLOT_DEFAULTS[i] || SLOT_DEFAULTS[0];
    var savedStart = existingSlots && existingSlots[i] ? existingSlots[i].start : def.start;
    var savedEnd   = existingSlots && existingSlots[i] ? existingSlots[i].end   : def.end;
    var row = document.createElement('div');
    row.className = 'slot-row';
    var num = document.createElement('div');
    num.className = 'slot-num'; num.textContent = i + 1;
    var arrow = document.createElement('div');
    arrow.className = 'arrow'; arrow.textContent = '→';
    row.appendChild(num);
    row.appendChild(makeTimeSelect('start-' + day + '-' + i, savedStart));
    row.appendChild(arrow);
    row.appendChild(makeTimeSelect('end-'   + day + '-' + i, savedEnd));
    container.appendChild(row);
  }
  updateSummary();
}

function updateSlots(day, count) {
  var existing = getSlotsForDay(day);
  buildSlotRows(day, parseInt(count), existing);
}

function makeTimeSelect(id, selectedVal) {
  var sel = document.createElement('select');
  sel.id  = id;
  TIME_OPTIONS.forEach(function(t) {
    var opt = document.createElement('option');
    opt.value = t; opt.textContent = t;
    if (t === selectedVal) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', updateSummary);
  return sel;
}

function getSlotsForDay(day) {
  var count = parseInt(document.getElementById('slots-' + day).value) || 1;
  var slots = [];
  for (var i = 0; i < count; i++) {
    var s = document.getElementById('start-' + day + '-' + i);
    var e = document.getElementById('end-'   + day + '-' + i);
    if (s && e) slots.push({ start: s.value, end: e.value });
  }
  return slots;
}

function buildScheduleObj() {
  var obj = {};
  DAYS.forEach(function(d) { if (activeDays[d]) obj[d] = getSlotsForDay(d); });
  return obj;
}

// ═══════════════════════════════════════════════════════════════════════════
// SUMMARY / HINT
// ═══════════════════════════════════════════════════════════════════════════
function updateSummary() {
  var active  = DAYS.filter(function(d){ return activeDays[d]; });
  var summary = document.getElementById('scheduleSummary');
  var lines   = document.getElementById('summaryLines');
  if (!active.length) { summary.classList.remove('visible'); return; }
  summary.classList.add('visible');
  lines.innerHTML = active.map(function(d) {
    var slots   = getSlotsForDay(d);
    var slotStr = slots.map(function(s, i) {
      return '<span style="margin-right:6px">Slot '+(i+1)+': '+s.start+' – '+s.end+'</span>';
    }).join('&nbsp;·&nbsp; ');
    return '<div class="sum-day"><b>'+DAY_FULL[d]+':</b>&nbsp; '+slotStr+'</div>';
  }).join('');
}

function updateHint() {
  var active = DAYS.filter(function(d){ return activeDays[d]; }).length;
  document.getElementById('noDaysHint').style.display = active > 0 ? 'none' : 'block';
}

// ═══════════════════════════════════════════════════════════════════════════
// CLEAR / SAVE
// ═══════════════════════════════════════════════════════════════════════════
function clearAll() {
  if (!confirm('Clear your entire schedule?')) return;
  DAYS.forEach(function(d) {
    delete activeDays[d];
    document.querySelector('.day-toggle[data-day="'+d+'"]').classList.remove('active');
    document.getElementById('panel-'    + d).classList.remove('open');
    document.getElementById('slotRows-' + d).innerHTML = '';
    document.getElementById('slots-'   + d).value = '1';
  });
  updateHint();
  updateSummary();
}

function saveSchedule() {
  var active = DAYS.filter(function(d){ return activeDays[d]; });
  if (active.length === 0) { showMsg('error', 'Please select at least one day before saving.'); return; }

  var btn = document.getElementById('saveBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="save-spinner"></span>Saving...';
  hideMsg();

  var scheduleJSON = JSON.stringify(buildScheduleObj());

  callApi('api_saveVenueScheduleById', [venueId, scheduleJSON]).then(function(result) {
    btn.disabled = false;
    btn.textContent = 'Save Schedule';
    if (result && result.success) {
      showMsg('success', '&#10003; Schedule saved! Agents can now see your music availability.');
    } else {
      showMsg('error', 'Save failed — please try again.');
    }
  }).catch(function(err) {
    btn.disabled = false;
    btn.textContent = 'Save Schedule';
    showMsg('error', 'Error: ' + err.message);
  });
}

function showMsg(type, text) {
  hideMsg();
  var el = document.getElementById(type === 'success' ? 'successMsg' : 'errorMsg');
  el.innerHTML = text; el.classList.add('visible');
  if (type === 'success') setTimeout(function(){ el.classList.remove('visible'); }, 5000);
  window.scrollTo(0, 0);
}

function hideMsg() {
  document.getElementById('successMsg').classList.remove('visible');
  document.getElementById('errorMsg').classList.remove('visible');
}

function goToCalendar() {
  window.location.href = 'venue-calendar.html' + (venueId ? '?vid=' + venueId : '');
}
