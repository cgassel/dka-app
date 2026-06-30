// ============================================================================
// venue-calendar.js — logic for venue-calendar.html
// Converted from google.script.run to callApi() (see api.js).
// venueId comes from the ?vid= URL param (e.g. set by the GCal OAuth
// callback redirect) OR from sessionStorage (set at login), in that order.
// ============================================================================

var now        = new Date();
var calYear    = now.getFullYear();
var calMonth   = now.getMonth();
var venueId    = null;
var venueObj   = null;
var allBookings= [];
var scheduleObj= {};
var suggLoaded = false;
var gcalConnected    = false;
var gcalStatusLoaded = false;
var gcalEvents       = [];

var DOW_MAP  = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
var DAY_FULL = { Mon:'Monday', Tue:'Tuesday', Wed:'Wednesday', Thu:'Thursday', Fri:'Friday', Sat:'Saturday', Sun:'Sunday' };
var MONTHS   = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ═══════════════════════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════════════════════
window.onload = function() {
  var urlParams = new URLSearchParams(window.location.search);
  var vidParam  = urlParams.get('vid') || sessionStorage.getItem('dka_id');

  if (!vidParam) {
    window.location.href = 'index.html';
    return;
  }

  callApi('getCurrentVenueById', [vidParam]).then(onVenueLoaded).catch(function(e) {
    toast('Error loading venue: '+e.message,'error');
  });
};

function onVenueLoaded(venue) {
  if (!venue) { alert('Session expired.'); window.location.href = 'index.html'; return; }
  venueObj = venue;
  venueId  = venue.id;
  document.getElementById('hdrVenue').textContent = venue.name;

  try { scheduleObj = venue.scheduleJSON ? JSON.parse(venue.scheduleJSON) : {}; }
  catch(e){ scheduleObj = {}; }

  var schedDays = Object.keys(scheduleObj);

  if (schedDays.length === 0) {
    document.getElementById('noSchedBanner').classList.add('visible');
  }

  if (!venue.preferredGenres || venue.preferredGenres.trim() === '') {
    document.getElementById('noPrefsBanner').classList.add('visible');
  }

  document.getElementById('stSchedDays').textContent = schedDays.length || '0';

  callApi('api_getVenueBookings', [venueId]).then(function(bk) {
    allBookings = bk || [];
    updateStats();
    renderCal();
    loadVenueGcalEvents();
    if (allBookings.length === 0) {
      var dbg = document.createElement('div');
      dbg.style.cssText = 'text-align:center;padding:8px;font-size:0.75rem;color:#999;';
      dbg.textContent = 'No bookings found for venue ID: ' + venueId;
      document.getElementById('calWrap').appendChild(dbg);
    }
  }).catch(function(e) {
    document.getElementById('calWrap').innerHTML = '<div class="loading-block" style="color:var(--red);">'+esc(e.message)+'</div>';
  });

  if (schedDays.length > 0) {
    loadSuggestionsForBanner();
  }

  if (!gcalStatusLoaded) {
    gcalStatusLoaded = true;
    loadGcalStatus();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MATCH BANNER
// ═══════════════════════════════════════════════════════════════════════════
function loadSuggestionsForBanner() {
  callApi('api_getSuggestionsFromSchedule', [venueId]).then(function(data) {
    if (!data || !data.suggestions || data.suggestions.length === 0) return;
    var count = data.suggestions.length;
    var names = data.suggestions.slice(0,3).map(function(s){ return s.bandName; });
    document.getElementById('bannerTitle').textContent =
      count === 1 ? '1 band match found on your scheduled days!' : count + ' band matches found on your scheduled days!';
    document.getElementById('bannerBody').textContent =
      names.join(', ') + (count > names.length ? ' and '+(count-names.length)+' more.' : '.');
    document.getElementById('matchBanner').classList.add('visible');
    var badge = document.getElementById('suggBadge');
    badge.textContent = count; badge.style.display='inline';
  }).catch(function() {});
}

function dismissBanner() { document.getElementById('matchBanner').classList.remove('visible'); }

// ═══════════════════════════════════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════════════════════════════════
function switchTab(t) {
  ['calendar','gcal','suggestions'].forEach(function(x){
    document.getElementById('tab-'+x).classList.toggle('active', x===t);
    document.getElementById('pane-'+x).classList.toggle('active', x===t);
  });
  if (t==='gcal' && !gcalStatusLoaded){ gcalStatusLoaded=true; loadGcalStatus(); }
  if (t==='suggestions' && !suggLoaded){ suggLoaded=true; loadSuggestions(); }
}

// ═══════════════════════════════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════════════════════════════
function updateStats() {
  document.getElementById('stTotal').textContent     = allBookings.length;
  document.getElementById('stConfirmed').textContent = allBookings.filter(function(b){return b.status==='Confirmed';}).length;
  document.getElementById('stPending').textContent   = allBookings.filter(function(b){return b.status==='Pending';}).length;
  document.getElementById('stThisMonth').textContent = allBookings.filter(function(b){
    var d=new Date(b.date+'T12:00:00');
    return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();
  }).length;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN CALENDAR
// ═══════════════════════════════════════════════════════════════════════════
function getSchedDows() {
  var m={};
  Object.keys(scheduleObj).forEach(function(k){
    var dow=DOW_MAP[k]; if(dow!==undefined) m[dow]=scheduleObj[k];
  });
  return m;
}

function renderCal() {
  var first=new Date(calYear,calMonth,1);
  var dim  =new Date(calYear,calMonth+1,0).getDate();
  var sdow =first.getDay();
  document.getElementById('calMonthLbl').textContent=MONTHS[calMonth]+' '+calYear;

  var schedDows=getSchedDows();
  var h='<div class="cal-grid">';
  ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].forEach(function(d){
    h+='<div class="cal-hdr">'+d+'</div>';
  });

  var prevDim=new Date(calYear,calMonth,0).getDate();
  for(var i=sdow-1;i>=0;i--) h+='<div class="cal-day other"><div class="day-num">'+(prevDim-i)+'</div></div>';

  for(var day=1;day<=dim;day++){
    var ds  =pad(calYear)+'-'+pad(calMonth+1)+'-'+pad(day);
    var dow =new Date(calYear,calMonth,day).getDay();
    var isTd=day===now.getDate()&&calMonth===now.getMonth()&&calYear===now.getFullYear();
    var isSc=schedDows[dow]!==undefined;
    var cls ='cal-day'+(isTd?' today':'')+(isSc?' sched-day':'');

    h+='<div class="'+cls+'"><div class="day-num">'+day+'</div>';
    if(isSc){
      h+='<span class="sched-label">&#9834; Live Music</span>';
      (schedDows[dow]||[]).forEach(function(sl){
        h+='<span class="sched-time">'+esc(sl.start)+'&#8211;'+esc(sl.end)+'</span>';
      });
    }
    allBookings.filter(function(b){return(b.date||'').substring(0,10)===ds;}).forEach(function(b){
      h+='<div class="bk-chip '+b.status.toLowerCase()+'" onclick="showBooking(\''+b.id+'\')">'+esc(b.bandName.substring(0,16))+'</div>';
    });
    gcalEvents.filter(function(e){return e.date===ds;}).forEach(function(e){
      if(!e.isDK){
        var cls='gcal-evt-chip'+(e.allDay?' all-day':'');
        var lbl=(e.startTime?e.startTime+' ':'')+e.title.substring(0,20);
        h+='<div class="'+cls+'" title="'+esc(e.title)+'">'+esc(lbl)+'</div>';
      }
    });
    h+='</div>';
  }

  var rem=42-(sdow+dim);
  for(var j=1;j<=rem;j++) h+='<div class="cal-day other"><div class="day-num">'+j+'</div></div>';
  h+='</div>';
  document.getElementById('calWrap').innerHTML=h;
}

function prevMonth(){ if(--calMonth<0){calMonth=11;calYear--;} gcalEvents=[]; renderCal(); loadVenueGcalEvents(); }
function nextMonth(){ if(++calMonth>11){calMonth=0;calYear++;} gcalEvents=[]; renderCal(); loadVenueGcalEvents(); }
function gotoToday(){ calYear=now.getFullYear(); calMonth=now.getMonth(); gcalEvents=[]; renderCal(); loadVenueGcalEvents(); }

function cleanTime(t) {
  if (!t) return '';
  var s = String(t);
  if (s.indexOf('1899') !== -1 || s.indexOf('GMT') !== -1) {
    var m = s.match(/(\d{1,2}):(\d{2})/);
    if (m) { var h = parseInt(m[1]), mn = m[2], ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + ':' + mn + ' ' + ap; }
    return '';
  }
  var m2 = s.match(/^(\d{1,2}):(\d{2})/);
  if (m2) { var h2 = parseInt(m2[1]), mn2 = m2[2], ap2 = h2 >= 12 ? 'PM' : 'AM'; h2 = h2 % 12 || 12; return h2 + ':' + mn2 + ' ' + ap2; }
  return s;
}

function showBooking(id){
  var b=allBookings.find(function(x){return x.id==id;}); if(!b) return;
  var sc='s-'+b.status.toLowerCase();
  var startFmt = cleanTime(b.startTime);
  var endFmt   = cleanTime(b.endTime);
  var timeStr  = (startFmt && endFmt) ? startFmt + ' - ' + endFmt : (startFmt || endFmt || 'N/A');
  var h=dRow('Band','<strong>'+esc(b.bandName)+'</strong>')+
        dRow('Date',new Date(b.date+'T12:00:00').toLocaleDateString())+
        dRow('Time',timeStr)+
        dRow('Status','<span class="sbadge '+sc+'">'+esc(b.status)+'</span>')+
        dRow('Sound/Lights',esc(b.soundLights));
  if(b.payAmount) h+=dRow('Pay','$'+parseFloat(b.payAmount).toFixed(2));
  if(b.notes) h+=dRow('Notes',esc(b.notes));
  document.getElementById('modalTitle').textContent='Booking Details';
  document.getElementById('modalBody').innerHTML=h;
  document.getElementById('modalOverlay').classList.add('open');
}
function closeModal(){ document.getElementById('modalOverlay').classList.remove('open'); }

// ═══════════════════════════════════════════════════════════════════════════
// GOOGLE CALENDAR
// ═══════════════════════════════════════════════════════════════════════════
function loadVenueGcalEvents() {
  if (!venueId) return;
  var lastDay = new Date(calYear, calMonth + 1, 0);
  function p2(n){ return n < 10 ? '0' + n : String(n); }
  var startStr = calYear + '-' + p2(calMonth+1) + '-01';
  var endStr   = calYear + '-' + p2(calMonth+1) + '-' + p2(lastDay.getDate());
  callApi('api_getVenueGcalEvents', [venueId, startStr, endStr]).then(function(result) {
    gcalEvents = (result && result.success) ? (result.events || []) : [];
    renderCal();
  }).catch(function(err) {
    gcalEvents = [];
    renderCal();
  });
}

function loadGcalStatus(){
  callApi('api_getVenueGcalStatus', [venueId]).then(function(st) {
    document.getElementById('gcalLoading').style.display='none';
    if(st&&st.connected){
      gcalConnected=true;
      document.getElementById('gcalConnected').style.display='flex';
      document.getElementById('gcalDisconnected').style.display='none';
      document.getElementById('gcalConnectBtn').style.display='none';
      document.getElementById('gcalRefreshNote').style.display='block';
      if(st.email) document.getElementById('gcalEmail').textContent='Connected as '+st.email+'.';
      loadVenueGcalEvents();
    } else {
      gcalConnected=false;
      document.getElementById('gcalConnected').style.display='none';
      document.getElementById('gcalDisconnected').style.display='flex';
      document.getElementById('gcalConnectBtn').style.display='flex';
      document.getElementById('gcalRefreshNote').style.display='none';
    }
  }).catch(function() {
    document.getElementById('gcalLoading').style.display='none';
    document.getElementById('gcalDisconnected').style.display='flex';
    document.getElementById('gcalConnectBtn').style.display='flex';
  });
}

function connectGcal(){
  var btn=document.getElementById('gcalConnectBtn');
  btn.disabled=true;
  btn.innerHTML='<div class="spinner" style="width:16px;height:16px;border-width:2px;margin:0 8px 0 0;display:inline-block;vertical-align:middle;"></div>Opening Google…';
  callApi('api_getVenueGcalAuthUrl', [venueId]).then(function(url) {
    window.location.href = url;
  }).catch(function(e) {
    btn.disabled=false; btn.innerHTML='Connect with Google'; toast('Error: '+e.message,'error');
  });
}

function disconnectGcal(){
  if(!confirm('Disconnect Google Calendar?')) return;
  callApi('api_disconnectVenueGcal', [venueId]).then(function() {
    gcalConnected=false;
    document.getElementById('gcalConnected').style.display='none';
    document.getElementById('gcalDisconnected').style.display='flex';
    document.getElementById('gcalConnectBtn').style.display='flex';
    document.getElementById('gcalRefreshNote').style.display='none';
    suggLoaded=false;
    toast('Google Calendar disconnected.','info');
  }).catch(function(e) {
    toast('Error: '+e.message,'error');
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SUGGESTIONS
// ═══════════════════════════════════════════════════════════════════════════
function loadSuggestions(){
  var schedDays=Object.keys(scheduleObj);

  var pEl=document.getElementById('schedDaysPills');
  pEl.innerHTML=schedDays.map(function(d){
    return '<span class="sched-pill">'+(DAY_FULL[d]||d)+'</span>';
  }).join('');

  if(schedDays.length===0){
    document.getElementById('suggPanel').innerHTML=
      '<div class="no-sched-card">'+
      '<div class="icon">&#128197;</div>'+
      '<h3>No Music Schedule Set</h3>'+
      '<p>Set up your weekly live music schedule to get automatic band suggestions. The app will find bands available on your scheduled days that match your venue preferences.</p>'+
      '<button class="btn btn-primary" onclick="goToSchedule()">&#127925; Set Up My Schedule</button>'+
      '</div>';
    return;
  }

  document.getElementById('suggPanel').innerHTML=
    '<div class="loading-block"><div class="spinner"></div><p>Matching bands to your schedule…</p></div>';

  callApi('api_getSuggestionsFromSchedule', [venueId]).then(renderSuggestions).catch(function(e) {
    document.getElementById('suggPanel').innerHTML=
      '<div class="empty-block"><h3>Error</h3><p>'+esc(e.message)+'</p></div>';
  });
}

function renderSuggestions(data){
  if(!data||!data.suggestions||data.suggestions.length===0){
    var msg='<div class="empty-block"><h3>&#128268; No Matches Found</h3>';
    if(!data||!data.scheduleDates||data.scheduleDates.length===0){
      msg+='<p>No upcoming dates were found from your music schedule. Make sure your schedule is set in <strong>My Schedule</strong>.</p>';
    } else {
      msg+='<p>No bands matched at least 2 of your venue preferences on your upcoming scheduled days.<br>'+
           'Check that bands have submitted their availability in the Band Portal, and that your venue preferences are filled in.</p>';
    }
    msg+='</div>';
    document.getElementById('suggPanel').innerHTML=msg;
    return;
  }

  var src=data.gcalFiltered
    ? '<span class="src-pill gcal">&#9989; Filtered by Google Calendar</span>'
    : '<span class="src-pill sched">&#127925; Based on Music Schedule</span>';
  document.getElementById('schedDaysPills').innerHTML=
    Object.keys(scheduleObj).map(function(d){
      return '<span class="sched-pill">'+(DAY_FULL[d]||d)+'</span>';
    }).join('')+'&nbsp;'+src+
    ' <span style="background:#e3f2fd;color:var(--blue);border:1.5px solid #90CAF9;padding:4px 12px;border-radius:10px;font-size:0.8rem;font-weight:700;">'+(data.scheduleDates||[]).length+' candidate dates</span>';

  var h='<div class="sugg-grid">';
  data.suggestions.forEach(function(s,i){
    var rc=i===0?'gold':i===1?'silver':i===2?'bronze':'';
    var cc=s.score>=(s.totalCriteria||1)?'top-match':'';
    h+='<div class="s-card '+cc+'">';
    h+='<div class="s-rank '+rc+'">#'+(i+1)+'</div>';
    h+='<div class="s-body">';
    h+='<div class="s-name">'+esc(s.bandName)+'</div>';
    h+='<div class="s-pills">';
    if(s.genre)       h+='<span class="s-pill">&#127925; '+esc(s.genre)+'</span>';
    if(s.bandSize)    h+='<span class="s-pill">'+szIcon(s.bandSize)+' '+esc(s.bandSize)+'</span>';
    if(s.rating)      h+='<span class="s-pill '+rtCls(s.rating)+'">'+esc(s.rating)+'</span>';
    if(s.typicalDraw) h+='<span class="s-pill">&#128101; '+s.typicalDraw+'</span>';
    if(s.payRate>0)   h+='<span class="s-pill g">$'+s.payRate.toLocaleString()+'</span>';
    h+='</div>';
    h+='<div class="chips-lbl">Criteria matched</div><div class="chips">';
    s.matches.forEach(function(m){ h+='<span class="chip-ok">&#10003; '+esc(m)+'</span>'; });
    s.warnings.forEach(function(w){ h+='<span class="chip-no">&#9888; '+esc(w)+'</span>'; });
    h+='</div>';
    var show=s.matchingDates.slice(0,5), extra=s.matchingDates.length-show.length;
    h+='<div class="chips-lbl" style="margin-top:6px;">Available on your scheduled days</div><div class="chips">';
    show.forEach(function(ds){
      var lbl=new Date(ds+'T00:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
      h+='<span class="chip-date">'+esc(lbl)+'</span>';
    });
    if(extra>0) h+='<span class="more-lbl">+'+extra+' more</span>';
    h+='</div>';
    if(s.promoVideo||s.socialMedia||s.instagram||s.website){
      h+='<div class="s-links">';
      if(s.promoVideo)  h+='<a class="slink yt"  href="'+esc(s.promoVideo)+'"  target="_blank">&#127916; Video</a>';
      if(s.socialMedia) h+='<a class="slink fb"  href="'+esc(s.socialMedia)+'" target="_blank">&#128196; Facebook</a>';
      if(s.instagram)   h+='<a class="slink ig"  href="'+esc(s.instagram)+'"   target="_blank">&#128247; Instagram</a>';
      if(s.website)     h+='<a class="slink web" href="'+esc(s.website)+'"     target="_blank">&#127760; Website</a>';
      h+='</div>';
    }
    h+='</div>';
    h+='<div class="s-footer">';
    if(s.requested){
      h+='<span class="btn-requested">&#10003; Requested</span>';
    } else {
      h+='<select class="s-date-pick" id="reqDate_'+i+'">';
      if(!s.matchingDates||s.matchingDates.length===0){
        h+='<option value="">No open dates found</option>';
      } else {
        h+='<option value="">— Pick a date —</option>';
        s.matchingDates.forEach(function(ds){
          var lbl=new Date(ds+'T00:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'});
          h+='<option value="'+ds+'">'+lbl+'</option>';
        });
      }
      h+='</select>';
      var noDate=!s.matchingDates||s.matchingDates.length===0;
      h+='<button class="btn-request" id="reqBtn_'+i+'"'+(noDate?' disabled':'')+' onclick="requestBand('+i+',\'' +esc(s.bandId)+'\',\''+esc(s.bandName)+'\')">';
      h+=(noDate?'No Open Dates':'&#9993; Request This Band')+'</button>';
    }
    h+='</div>';
    h+='<div class="s-score"><div class="sc-num">'+s.score+'</div><div class="sc-den">/ '+(s.totalCriteria||'?')+'</div><div class="sc-lbl">match</div></div>';
    h+='</div>';
  });
  h+='</div>';
  document.getElementById('suggPanel').innerHTML=h;
}

// ═══════════════════════════════════════════════════════════════════════════
// BAND REQUEST
// ═══════════════════════════════════════════════════════════════════════════
function requestBand(idx, bandId, bandName) {
  var dateEl = document.getElementById('reqDate_' + idx);
  var btnEl  = document.getElementById('reqBtn_'  + idx);
  var date   = dateEl ? dateEl.value : '';
  if (!date) { toast('Please select a date first.', 'error'); return; }

  btnEl.disabled    = true;
  btnEl.textContent = 'Sending…';

  callApi('api_sendBandRequest', [venueId, venueObj.name, bandId, bandName, date, '']).then(function(r) {
    if (r && r.success) {
      var footer = dateEl.closest ? dateEl.closest('.s-footer') : dateEl.parentNode;
      if (footer) {
        footer.innerHTML = '<span class="btn-requested">&#10003; Requested</span>';
      }
      toast('&#9993; Request sent to your agent!', 'success');
    } else {
      btnEl.disabled    = false;
      btnEl.textContent = '&#9993; Request This Band';
      toast((r && r.message) || 'Request failed. Please try again.', 'error');
    }
  }).catch(function(e) {
    btnEl.disabled    = false;
    btnEl.textContent = '&#9993; Request This Band';
    toast('Error: ' + e.message, 'error');
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════
function pad(n){ return n<10?'0'+n:String(n); }
function esc(v){ return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function dRow(l,v){ return '<div class="d-row"><span class="d-lbl">'+l+'</span><span class="d-val">'+v+'</span></div>'; }
function szIcon(s){ return {Solo:'&#127925;',Duo:'&#127926;',Trio:'&#127927;','Full Band':'&#127928;'}[s]||'&#127925;'; }
function rtCls(r){ var c=(r||'').trim().charAt(0).toUpperCase(); return c==='A'?'g':c==='C'||c==='D'?'y':''; }
function toast(msg,type){
  var t=document.getElementById('toast'); t.innerHTML=msg; t.className='toast '+(type||'success');
  void t.offsetWidth; t.classList.add('show'); setTimeout(function(){ t.classList.remove('show'); },3500);
}

// ═══════════════════════════════════════════════════════════════════════════
// EDIT PREFERENCES
// ═══════════════════════════════════════════════════════════════════════════
function openEditPrefs() {
  if (!venueObj) return;
  var v = venueObj;

  document.getElementById('ep_contact').value  = v.contact      || '';
  document.getElementById('ep_email').value    = v.email        || '';
  document.getElementById('ep_phone').value    = v.phone        || '';
  document.getElementById('ep_budget').value   = v.payRateBudget|| '';
  document.getElementById('ep_sound').value    = v.hasSound     || '';
  document.getElementById('ep_lighting').value = v.hasLighting  || '';
  document.getElementById('ep_minRating').value= v.minBandRating|| '';
  document.getElementById('ep_minDraw').value  = v.minDraw > 0 ? v.minDraw : '';
  document.getElementById('ep_travel').value   = v.travelPref   || 'Any';
  document.getElementById('ep_prefNotes').value= v.prefNotes    || '';

  document.querySelectorAll('[name="pg"]').forEach(function(cb){ cb.checked=false; });
  if (v.preferredGenres) {
    v.preferredGenres.split(',').forEach(function(g){
      var g2=g.trim();
      document.querySelectorAll('[name="pg"]').forEach(function(cb){ if(cb.value===g2) cb.checked=true; });
    });
  }

  document.querySelectorAll('[name="psz"]').forEach(function(cb){ cb.checked=false; });
  if (v.prefBandSizes) {
    v.prefBandSizes.split(',').forEach(function(s){
      var s2=s.trim();
      document.querySelectorAll('[name="psz"]').forEach(function(cb){ if(cb.value===s2) cb.checked=true; });
    });
  }

  var err=document.getElementById('epErr'); err.style.display='none'; err.textContent='';
  var btn=document.getElementById('epSaveBtn'); btn.disabled=false; btn.textContent='✓ Save Preferences';

  document.getElementById('epModal').classList.add('open');
  window.scrollTo(0,0);
}

function closeEditPrefs() { document.getElementById('epModal').classList.remove('open'); }
function closeEditIfBg(e) { if(e.target===document.getElementById('epModal')) closeEditPrefs(); }

function saveEditPrefs() {
  var genres=[];
  document.querySelectorAll('[name="pg"]:checked').forEach(function(cb){ genres.push(cb.value); });
  if (genres.length===0) { showEpErr('Please select at least one preferred genre.'); return; }
  if (!document.getElementById('ep_budget').value) { showEpErr('Please enter a pay rate budget.'); return; }

  var sizes=[];
  document.querySelectorAll('[name="psz"]:checked').forEach(function(cb){ sizes.push(cb.value); });

  var btn=document.getElementById('epSaveBtn');
  btn.disabled=true; btn.textContent='Saving…';

  var venueData = {
    contactName:     document.getElementById('ep_contact').value.trim(),
    email:           document.getElementById('ep_email').value.trim(),
    phone:           document.getElementById('ep_phone').value.trim(),
    payRateBudget:   parseFloat(document.getElementById('ep_budget').value) || 0,
    hasSound:        document.getElementById('ep_sound').value,
    hasLighting:     document.getElementById('ep_lighting').value,
    preferredGenres: genres.join(','),
    prefBandSizes:   sizes.join(','),
    minBandRating:   document.getElementById('ep_minRating').value,
    minDraw:         parseInt(document.getElementById('ep_minDraw').value) || 0,
    travelPref:      document.getElementById('ep_travel').value,
    prefNotes:       document.getElementById('ep_prefNotes').value.trim(),
    venueName:       venueObj.name        || '',
    address:         venueObj.address     || '',
    city:            venueObj.city        || '',
    state:           venueObj.state       || '',
    zip:             venueObj.zip         || '',
    latitude:        venueObj.latitude    || '',
    longitude:       venueObj.longitude   || '',
    capacity:        venueObj.capacity    || 0,
    exclusivity:     venueObj.exclusivity || '',
    notes:           venueObj.notes       || '',
    prefDays:        venueObj.prefDays    || ''
  };

  callApi('api_updateVenue', [venueId, venueData, null, 'Venue']).then(function() {
    btn.disabled=false; btn.textContent='✓ Save Preferences';
    venueObj.contact         = venueData.contactName;
    venueObj.email           = venueData.email;
    venueObj.phone           = venueData.phone;
    venueObj.payRateBudget   = venueData.payRateBudget;
    venueObj.hasSound        = venueData.hasSound;
    venueObj.hasLighting     = venueData.hasLighting;
    venueObj.preferredGenres = venueData.preferredGenres;
    var pb = document.getElementById('noPrefsBanner');
    if (pb) pb.classList.remove('visible');
    venueObj.prefBandSizes   = venueData.prefBandSizes;
    venueObj.minBandRating   = venueData.minBandRating;
    venueObj.minDraw         = venueData.minDraw;
    venueObj.travelPref      = venueData.travelPref;
    venueObj.prefNotes       = venueData.prefNotes;
    closeEditPrefs();
    suggLoaded=false;
    document.getElementById('matchBanner').classList.remove('visible');
    if (Object.keys(scheduleObj).length > 0) loadSuggestionsForBanner();
    toast('&#10003; Preferences saved! Suggestions will refresh.','success');
  }).catch(function(e) {
    btn.disabled=false; btn.textContent='✓ Save Preferences';
    showEpErr('Save failed: '+(e.message||e));
  });
}

function showEpErr(msg) {
  var el=document.getElementById('epErr'); el.textContent=msg; el.style.display='block';
}

// ═══════════════════════════════════════════════════════════════════════════
// NAV
// ═══════════════════════════════════════════════════════════════════════════
function doLogout(){
  callApi('logoutVenue', []).finally(function() {
    sessionStorage.removeItem('dka_role');
    sessionStorage.removeItem('dka_id');
    window.location.href = 'index.html';
  });
}
function findBands(){ window.location.href = 'venue-booking-request.html'; }
function goToSchedule(){ window.location.href = 'venue-schedule.html'; }
