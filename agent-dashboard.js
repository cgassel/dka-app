// ============================================================================
// agent-dashboard.js — logic for agent-dashboard.html
// Converted from google.script.run to callApi() (see api.js).
// Session info (agentId/role) now comes from sessionStorage, set at login.
// ============================================================================

var agentId        = sessionStorage.getItem('dka_id');
var agentName       = '';
var allBookings     = [];
var allVenues       = [];
var commissionMap   = {};
var notifData       = [];
var dashStats       = {};
var upcomingDays    = 30;
var earningsPeriod  = 'month';
var commPeriod      = 'week';
var allOpenSlots    = [];
var currentSlotWeek = 1;

window.addEventListener('load', function() {
  document.getElementById('loadingOverlay').classList.remove('show');
});

(function init() {
  if (sessionStorage.getItem('dka_role') !== 'agent' || !agentId) {
    window.location.href = 'index.html';
    return;
  }
  var now = new Date();
  document.getElementById('dateText').textContent = now.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

  var urlParams  = new URLSearchParams(window.location.search);
  var toastParam = urlParams.get('toast');
  if (toastParam === 'band_added') showDashToast('Band added successfully!');
  if (toastParam === 'venue_added') showDashToast('Venue added successfully!');

  loadAgentName(agentId);
  loadDashboardData();
})();

async function loadAgentName(id) {
  try {
    var agents = await callApi('api_getAgents', []);
    for (var i = 0; i < agents.length; i++) {
      if (String(agents[i].id) === String(id)) {
        agentName = agents[i].name;
        document.getElementById('agentName').textContent   = agentName;
        document.getElementById('welcomeText').textContent = 'Welcome back, ' + agentName.split(' ')[0] + ' \ud83d\udc4b';
        return;
      }
    }
    document.getElementById('agentName').textContent   = 'Agent ' + id;
    document.getElementById('welcomeText').textContent = 'Dashboard';
  } catch (err) {
    document.getElementById('agentName').textContent = 'Agent ' + id;
  }
}

async function loadDashboardData() {
  try {
    var results = await Promise.all([
      callApi('api_getAllBookings', []).catch(function(){ return []; }),
      callApi('api_getBandCommissionMap', []).catch(function(){ return {}; }),
      callApi('api_getDashboardStats', [agentId]).catch(function(){ return {}; }),
      callApi('api_getVenuesFullData', []).catch(function(){ return []; })
    ]);
    allBookings   = results[0] || [];
    commissionMap = results[1] || {};
    dashStats     = results[2] || {};
    allVenues     = results[3] || [];
    renderAllPanels();
  } catch (err) {
    console.error('loadDashboardData error:', err);
  }

  callApi('api_getAgentNotifications', []).then(function(n) {
    notifData = n || [];
    renderNotifBell();
    renderNotifDrawer();
  }).catch(function() {});

  callApi('api_getOpenSlotsAllVenues', []).then(function(slots) {
    renderOpenSlots(slots || []);
  }).catch(function() { renderOpenSlots([]); });
}

function refreshDashboard() { allBookings = []; allVenues = []; loadDashboardData(); }

function agencyEarnings(b) {
  var pay = parseFloat(b.payAmount) || 0;
  var pct = (b.commissionPct > 0) ? b.commissionPct : (parseFloat(commissionMap[String(b.bandId)]) || 0);
  return Math.round(pay * pct) / 100;
}

function renderAllPanels() {
  var mb = allBookings.filter(function(b) { return String(b.agentId) === String(agentId); });
  renderStats(mb); renderUpcoming(mb); renderContactAlerts(); renderOpenDates(mb); renderEarnings(mb); renderRecent(mb);
}

function fmtMoney(n) { return '$' + (n||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0}); }

function setCommPeriod(period, btn) {
  commPeriod = period;
  btn.parentElement.querySelectorAll('.period-tab').forEach(function(t){t.classList.remove('active');}); btn.classList.add('active');
  updateCommissionCard();
}

function updateCommissionCard() {
  var el = document.getElementById('statCommission');
  var sub = document.getElementById('statCommSub');
  if (!dashStats || dashStats.weekCommission === undefined) return;
  el.classList.remove('loading-shimmer');
  if (commPeriod === 'week') {
    el.textContent = fmtMoney(dashStats.weekCommission);
    sub.textContent = dashStats.weekBookings + ' booking' + (dashStats.weekBookings !== 1 ? 's' : '') + ' this week';
  } else if (commPeriod === 'month') {
    el.textContent = fmtMoney(dashStats.monthCommission);
    sub.textContent = dashStats.monthBookings + ' booking' + (dashStats.monthBookings !== 1 ? 's' : '') + ' this month';
  } else {
    el.textContent = fmtMoney(dashStats.yearCommission);
    sub.textContent = dashStats.yearBookings + ' booking' + (dashStats.yearBookings !== 1 ? 's' : '') + ' this year';
  }
}

function renderStats(mb) {
  var bSet = new Set(), vSet = new Set();
  mb.forEach(function(b) {
    if ((b.status||'').toLowerCase() !== 'cancelled') {
      bSet.add(b.bandId); vSet.add(b.venueId);
    }
  });

  updateCommissionCard();

  ['statBandsBooked','statVenuesBooked','statContactAlert'].forEach(function(id){
    document.getElementById(id).classList.remove('loading-shimmer');
  });
  document.getElementById('statBandsBooked').textContent  = dashStats.uniqueBands  || bSet.size;
  document.getElementById('statBandsSub').textContent     = 'tap for band stats';
  document.getElementById('statVenuesBooked').textContent = dashStats.uniqueVenues || vSet.size;
  document.getElementById('statVenuesSub').textContent    = 'unique venues booked';
  document.getElementById('statContactAlert').textContent = (dashStats.venueAlerts || []).length;
}

function setUpcomingPeriod(days,btn) {
  upcomingDays=days;
  btn.parentElement.querySelectorAll('.period-tab').forEach(function(t){t.classList.remove('active');}); btn.classList.add('active');
  renderUpcoming(allBookings.filter(function(b){return String(b.agentId)===String(agentId);}));
}

function renderUpcoming(mb) {
  var now=new Date(), cut=new Date(now.getTime()+upcomingDays*864e5); now.setHours(0,0,0,0);
  var up=mb.filter(function(b){var d=new Date(b.date+'T12:00:00');return d>=now&&d<=cut&&(b.status||'').toLowerCase()!=='cancelled';}).sort(function(a,b){return new Date(a.date+'T12:00:00')-new Date(b.date+'T12:00:00');});
  document.getElementById('upcomingCount').textContent=up.length;
  if(!up.length){document.getElementById('upcomingBookings').innerHTML='<div class="empty-state"><div class="empty-icon">&#127881;</div><p>No upcoming bookings in the next '+upcomingDays+' days.</p></div>';return;}
  var h='';
  up.forEach(function(b){
    var d=new Date(b.date+'T12:00:00'),ds=d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}),dow=d.toLocaleDateString('en-US',{weekday:'short'});
    var pay=parseFloat(b.payAmount)||0,sc='status-'+(b.status||'pending').toLowerCase().replace(/\s+/g,'-'),earn=agencyEarnings(b);
    h+='<div class="booking-item"><div class="booking-main"><div class="booking-names">'+escHtml(b.venueName)+' <span style="color:var(--muted);font-weight:400;">with</span> '+escHtml(b.bandName)+'</div>';
    h+='<div class="booking-meta"><span class="status-badge '+sc+'">'+escHtml(b.status||'Pending')+'</span>';
    if(b.startTime)h+='<span>'+escHtml(cleanTime(b.startTime))+(b.endTime?' - '+escHtml(cleanTime(b.endTime)):'')+' </span>';
    h+='</div></div><div style="text-align:right;"><div class="booking-date">'+dow+' '+ds+'</div>';
    if(pay>0){h+='<div style="font-size:0.74rem;color:var(--muted);">Band: $'+pay.toLocaleString()+'</div>';if(earn>0)h+='<div class="booking-pay">Agency: $'+earn.toLocaleString()+'</div>';}
    h+='</div></div>';
  });
  document.getElementById('upcomingBookings').innerHTML=h;
}

function renderContactAlerts() {
  var alerts = (dashStats && dashStats.venueAlerts) ? dashStats.venueAlerts : [];
  document.getElementById('contactCount').textContent = alerts.length;
  if (!alerts.length) {
    document.getElementById('contactAlerts').innerHTML =
      '<div class="empty-state"><div class="empty-icon">&#9989;</div><p>All venues recently contacted.</p></div>';
    return;
  }
  function daysBadge(days, label, greenOk) {
    if (days === null || days === undefined) return '<span class="contact-badge orange">Never ' + label + '</span>';
    if (days > 60) return '<span class="contact-badge red">' + days + 'd since ' + label + '</span>';
    if (days > 30) return '<span class="contact-badge orange">' + days + 'd since ' + label + '</span>';
    return greenOk ? '<span class="contact-badge green">' + days + 'd since ' + label + '</span>'
                   : '<span class="contact-badge blue">' + days + 'd since ' + label + '</span>';
  }
  var h = '';
  alerts.slice(0, 10).forEach(function(a) {
    h += '<div class="contact-alert-item">';
    h += '<div class="contact-alert-name">' + escHtml(a.venueName) + (a.city ? ' <span style="font-weight:400;color:var(--muted);font-size:0.78rem;">&mdash; ' + escHtml(a.city) + '</span>' : '') + '</div>';
    h += '<div class="contact-alert-badges">';
    h += daysBadge(a.daysSinceContact, 'contact', false);
    h += daysBadge(a.daysSinceBooked,  'booked',  true);
    if (a.daysSinceFlyer !== null && a.daysSinceFlyer !== undefined) {
      h += daysBadge(a.daysSinceFlyer, 'flyer', false);
    } else {
      h += '<span class="contact-badge orange">No flyer sent</span>';
    }
    h += '</div></div>';
  });
  document.getElementById('contactAlerts').innerHTML = h;
}

function renderOpenDates(mb) {
  var now=new Date();now.setHours(0,0,0,0);var end=new Date(now.getTime()+90*864e5);
  var bm={},mvi={};
  mb.forEach(function(b){if((b.status||'').toLowerCase()!=='cancelled'){bm[b.venueId+'|'+b.date]=true;mvi[b.venueId]=b.venueName;}});
  var res=[];
  Object.keys(mvi).forEach(function(vid){
    var od=[],d=new Date(now.getTime()+7*864e5);
    while(d<=end){var dow=d.getDay();if(dow===5||dow===6){var ds=d.toISOString().split('T')[0];if(!bm[vid+'|'+ds])od.push(d.toLocaleDateString('en-US',{month:'short',day:'numeric'})+' (['+'Su,Mo,Tu,We,Th,Fr,Sa'.split(',')[dow]+')');}d=new Date(d.getTime()+864e5);}
    if(od.length>0){var vd=null;for(var i=0;i<allVenues.length;i++){if(String(allVenues[i].id)===String(vid)){vd=allVenues[i];break;}}res.push({id:vid,name:mvi[vid],openDates:od.slice(0,6),venue:vd});}
  });
  document.getElementById('openDatesCount').textContent=res.length;
  if(!res.length){document.getElementById('openDatesPanel').innerHTML='<div class="empty-state"><div class="empty-icon">&#128397;</div><p>No booked venues yet, or all weekends are filled!</p></div>';return;}
  var h='';
  res.slice(0,8).forEach(function(r){
    var city=r.venue?(r.venue.city||'')+(r.venue.state?', '+r.venue.state:''):'';
    h+='<div class="open-venue-item"><div><div style="font-size:0.88rem;font-weight:600;">'+escHtml(r.name)+'</div>';
    if(city)h+='<div class="venue-city">'+escHtml(city)+'</div>';
    h+='<div class="open-dates-list">';r.openDates.forEach(function(dt){h+='<span class="open-date-chip">'+dt+'</span>';});h+='</div></div></div>';
  });
  document.getElementById('openDatesPanel').innerHTML=h;
}

function setEarningsPeriod(p,btn){earningsPeriod=p;btn.parentElement.querySelectorAll('.period-tab').forEach(function(t){t.classList.remove('active');});btn.classList.add('active');renderEarnings(allBookings.filter(function(b){return String(b.agentId)===String(agentId);}));}

function renderEarnings(mb){
  var now=new Date(),ps;
  if(earningsPeriod==='month')ps=new Date(now.getFullYear(),now.getMonth(),1);
  else if(earningsPeriod==='year')ps=new Date(now.getFullYear(),0,1);
  else ps=new Date(2000,0,1);
  var fl=mb.filter(function(b){return new Date(b.date+'T12:00:00')>=ps&&(b.status||'').toLowerCase()!=='cancelled';});
  if(!fl.length){document.getElementById('earningsBreakdown').innerHTML='<div class="empty-state"><div class="empty-icon">&#128202;</div><p>No earnings in this period.</p></div>';return;}
  var bv={};
  fl.forEach(function(b){var e=agencyEarnings(b);if(!bv[b.venueName])bv[b.venueName]={count:0,total:0,bandPay:0};bv[b.venueName].count++;bv[b.venueName].total+=e;bv[b.venueName].bandPay+=parseFloat(b.payAmount)||0;});
  var sorted=Object.keys(bv).map(function(k){return{name:k,count:bv[k].count,total:bv[k].total,bandPay:bv[k].bandPay};}).sort(function(a,b){return b.total-a.total;});
  var gT=sorted.reduce(function(s,x){return s+x.total;},0),gB=sorted.reduce(function(s,x){return s+x.bandPay;},0);
  var h='<div class="earnings-row" style="background:#f8fafc;font-weight:700;font-size:0.8rem;color:var(--muted);grid-template-columns:1fr auto auto auto;"><span>VENUE</span><span style="text-align:right;">SHOWS</span><span style="text-align:right;">BAND PAY</span><span style="text-align:right;">AGENCY EARNS</span></div>';
  sorted.forEach(function(x){h+='<div class="earnings-row" style="grid-template-columns:1fr auto auto auto;"><span style="font-size:0.86rem;">'+escHtml(x.name)+'</span><span class="earnings-count">'+x.count+'</span><span class="earnings-count" style="color:var(--muted);">$'+Math.round(x.bandPay).toLocaleString()+'</span><span class="earnings-amount">$'+Math.round(x.total).toLocaleString()+'</span></div>';});
  h+='<div class="earnings-row" style="grid-template-columns:1fr auto auto auto;border-top:2px solid var(--border);font-weight:700;"><span>TOTAL</span><span class="earnings-count">'+fl.length+'</span><span class="earnings-count" style="color:var(--muted);">$'+Math.round(gB).toLocaleString()+'</span><span class="earnings-amount" style="color:var(--green-dark);">$'+Math.round(gT).toLocaleString()+'</span></div>';
  var mp=fl.filter(function(b){return!(commissionMap[String(b.bandId)]>0);}).length;
  if(mp>0)h+='<div style="padding:10px 20px;font-size:0.78rem;color:#b45309;background:#fffbeb;border-top:1px solid #fde68a;">&#9888; '+mp+' booking'+(mp>1?'s have':' has')+' no commission rate set \u2014 edit those bands to add one.</div>';
  document.getElementById('earningsBreakdown').innerHTML=h;
}

function renderRecent(mb){
  var sorted=mb.slice().sort(function(a,b){return new Date(b.date+'T12:00:00')-new Date(a.date+'T12:00:00');});
  var recent=sorted.slice(0,10);
  document.getElementById('recentCount').textContent=mb.length+' total';
  if(!recent.length){document.getElementById('recentBookings').innerHTML='<div class="empty-state"><div class="empty-icon">&#128397;</div><p>No bookings yet. Create your first booking!</p></div>';return;}
  var h='<div class="section-label">10 MOST RECENT</div>';
  recent.forEach(function(b){
    var d=new Date(b.date+'T12:00:00'),ds=d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    var pay=parseFloat(b.payAmount)||0,sc='status-'+(b.status||'pending').toLowerCase().replace(/\s+/g,'-'),past=d<new Date(),earn=agencyEarnings(b);
    h+='<div class="booking-item"'+(past?' style="opacity:0.7;"':'')+'>'+
       '<div class="booking-main"><div class="booking-names">'+escHtml(b.venueName)+' <span style="color:var(--muted);font-weight:400;">&#183;</span> '+escHtml(b.bandName)+'</div>'+
       '<div class="booking-meta"><span class="status-badge '+sc+'">'+escHtml(b.status||'Pending')+'</span>';
    if(b.agentName)h+='<span>&#128100; '+escHtml(b.agentName)+'</span>';
    h+='</div></div><div style="text-align:right;"><div class="booking-date">'+ds+'</div>';
    if(pay>0){h+='<div style="font-size:0.74rem;color:var(--muted);">Band: $'+pay.toLocaleString()+'</div>';if(earn>0)h+='<div class="booking-pay">Agency: $'+earn.toLocaleString()+'</div>';}
    h+='</div></div>';
  });
  document.getElementById('recentBookings').innerHTML=h;
}

// ── NAVIGATION (plain page links — no Apps Script round-trip needed) ──────
function createBooking()       { window.location.href = 'create-booking.html'; }
function viewBandDirectory()   { window.location.href = 'band-directory.html'; }
function viewVenueDirectory()  { window.location.href = 'venue-directory.html'; }
function viewVenueMap()        { window.location.href = 'venue-map.html'; }
function viewCalendar()        { window.location.href = 'booking-calendar.html'; }
function viewMyBookings()      { window.location.href = 'my-bookings.html'; }
function viewContracts()       { window.location.href = 'contracts.html'; }
function viewBandStats()       { window.location.href = 'band-stats.html'; }

function logout() {
  sessionStorage.removeItem('dka_role');
  sessionStorage.removeItem('dka_id');
  window.location.href = 'index.html';
}

function showLoading(msg){document.getElementById('loadingText').textContent=msg||'Loading\u2026';document.getElementById('loadingOverlay').classList.add('show');}
function hideLoading(){document.getElementById('loadingOverlay').classList.remove('show');}
function escHtml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function cleanTime(t){if(!t)return'';var s=String(t);if(s.indexOf('1899')!==-1||s.indexOf('GMT')!==-1){var m=s.match(/(\d{1,2}):(\d{2})/);if(m){var h=parseInt(m[1]),mn=m[2],ap=h>=12?'PM':'AM';h=h%12||12;return h+':'+mn+' '+ap;}return'';}var m2=s.match(/^(\d{1,2}):(\d{2})/);if(m2){var h2=parseInt(m2[1]),mn2=m2[2],ap2=h2>=12?'PM':'AM';h2=h2%12||12;return h2+':'+mn2+' '+ap2;}return s;}

function renderNotifBell(){var u=notifData.filter(function(n){return!n.isRead;}).length,btn=document.getElementById('notifBellBtn'),badge=document.getElementById('notifCount');if(u>0){badge.textContent=u>9?'9+':String(u);badge.style.display='flex';btn.classList.add('has-unread');}else{badge.style.display='none';btn.classList.remove('has-unread');}}
function renderNotifDrawer(){
  var u=notifData.filter(function(n){return!n.isRead;}).length,badge=document.getElementById('drawerUnreadBadge'),mb=document.getElementById('markAllBtn');
  if(u>0){badge.textContent=u+' new';badge.style.display='inline-block';mb.disabled=false;}else{badge.style.display='none';mb.disabled=true;}
  var list=document.getElementById('notifList');
  if(!notifData.length){list.innerHTML='<div class="notif-empty"><div style="font-size:2rem;">&#128277;</div><p>No notifications yet</p></div>';return;}
  var h='';
  notifData.forEach(function(n,ni){
    var ts=n.timestamp?timeAgo(new Date(n.timestamp)):'';
    var isBR=n.type==='band_request';
    var clk=isBR?' onclick="handleNotifClick('+ni+')" style="cursor:pointer;"':'';
    h+='<div class="notif-item'+(n.isRead?'':' unread')+(isBR?' notif-clickable':'')+'"'+clk+'>';
    h+='<div class="notif-icon">'+(n.icon||'&#128276;')+'</div>';
    h+='<div class="notif-body"><div class="notif-text">'+n.message+'</div>';
    if(isBR)h+='<div class="notif-text" style="color:var(--bronze3);font-size:0.78rem;font-weight:600;">&#128073; Tap to create booking</div>';
    h+='<div class="notif-meta">'+ts+'</div></div>';
    if(!n.isRead)h+='<div class="notif-unread-dot"></div>';
    h+='</div>';
  });
  list.innerHTML=h;
}
function toggleNotifDrawer(){
  var d=document.getElementById('notifDrawer'),b=document.getElementById('notifBackdrop');
  if(d.classList.contains('open')){closeNotifDrawer();}
  else{
    d.classList.add('open');b.classList.add('open');
    setTimeout(function(){
      var ids=notifData.filter(function(n){return!n.isRead;}).map(function(n){return n.id;});
      if(ids.length>0){
        callApi('api_markNotificationsRead',[ids]).then(function(){
          notifData.forEach(function(n){n.isRead=true;});
          renderNotifBell();renderNotifDrawer();
        }).catch(function(){});
      }
    },1200);
  }
}
function closeNotifDrawer(){document.getElementById('notifDrawer').classList.remove('open');document.getElementById('notifBackdrop').classList.remove('open');}
function markAllRead(){
  var ids=notifData.filter(function(n){return!n.isRead;}).map(function(n){return n.id;});
  if(!ids.length)return;
  document.getElementById('markAllBtn').disabled=true;
  callApi('api_markNotificationsRead',[ids]).then(function(){
    notifData.forEach(function(n){n.isRead=true;});
    renderNotifBell();renderNotifDrawer();
  }).catch(function(){});
}
function timeAgo(date){var diff=Math.floor((Date.now()-date.getTime())/1000);if(diff<60)return'just now';if(diff<3600)return Math.floor(diff/60)+'m ago';if(diff<86400)return Math.floor(diff/3600)+'h ago';var days=Math.floor(diff/86400);if(days===1)return'yesterday';if(days<7)return days+'d ago';return date.toLocaleDateString('en-US',{month:'short',day:'numeric'});}

function setSlotWeek(week) {
  currentSlotWeek = week;
  ['1','2','3','All'].forEach(function(w) {
    var btn = document.getElementById('slotTab' + w);
    if (btn) btn.classList.toggle('active', String(week) === (w === 'All' ? '0' : w));
  });
  renderOpenSlots(allOpenSlots);
}

function renderOpenSlots(slots) {
  allOpenSlots = slots || [];
  var el = document.getElementById('openSlotsPanel');
  document.getElementById('openSlotsCount').textContent = slots.length;

  var now   = new Date(); now.setHours(0,0,0,0);
  var w1end = new Date(now.getTime() + 7  * 86400000);
  var w2end = new Date(now.getTime() + 14 * 86400000);
  var w3end = new Date(now.getTime() + 21 * 86400000);

  var filtered = slots.filter(function(s) {
    var d = new Date(s.date + 'T12:00:00');
    if (currentSlotWeek === 1) return d >= now   && d < w1end;
    if (currentSlotWeek === 2) return d >= w1end && d < w2end;
    if (currentSlotWeek === 3) return d >= w2end && d < w3end;
    return true;
  });

  if (!filtered.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">&#9989;</div><p>No open slots for this period.</p></div>';
    return;
  }

  var groups = [
    { label:'This Week', color:'#7CB342', slots:[] },
    { label:'Week 2',    color:'#F9A825', slots:[] },
    { label:'Week 3',    color:'#EF6C00', slots:[] }
  ];
  filtered.forEach(function(s) {
    var d = new Date(s.date + 'T12:00:00');
    if      (d >= now   && d < w1end) groups[0].slots.push(s);
    else if (d >= w1end && d < w2end) groups[1].slots.push(s);
    else if (d >= w2end && d < w3end) groups[2].slots.push(s);
  });

  var parts = [];
  groups.forEach(function(g) {
    if (!g.slots.length) return;
    parts.push('<div class="slot-week-label"><div class="slot-week-dot" style="background:' + g.color + '"></div>' + g.label + ' &mdash; ' + g.slots.length + ' open slot' + (g.slots.length !== 1 ? 's' : '') + '</div>');
    g.slots.forEach(function(s) {
      var dateObj = new Date(s.date + 'T12:00:00');
      var dateFmt = dateObj.toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric'});
      var dayAbbr = dateFmt.split(',')[0];
      var row = '<div class="open-slot-item">';
      row += '<div style="text-align:center;min-width:44px;"><div style="font-size:1.1rem;font-weight:800;color:var(--bronze2);font-family:monospace;line-height:1;">' + dateObj.getDate() + '</div>';
      row += '<div style="font-size:0.65rem;font-weight:700;text-transform:uppercase;color:var(--muted);">' + dayAbbr + '</div></div>';
      row += '<div style="min-width:0;">';
      row += '<div style="font-size:0.88rem;font-weight:700;color:var(--text);">' + escHtml(s.venueName) + '</div>';
      row += '<div style="font-size:0.74rem;color:var(--muted);margin-top:1px;">' + escHtml(s.venueCity || '') + (s.timeSlot ? ' &middot; ' + escHtml(s.timeSlot) : '') + '</div>';
      if (s.bandMatches && s.bandMatches.length) {
        row += '<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;">';
        s.bandMatches.forEach(function(b) {
          var isRoster = b.onRoster === 'Yes';
          var videoBtn = '';
          if (b.promoVideo) {
            var isYT = b.promoVideo.indexOf('youtube') !== -1 || b.promoVideo.indexOf('youtu.be') !== -1;
            if (isYT) {
              videoBtn = '<button onclick="event.stopPropagation();openVideoPanel(' + JSON.stringify(s.venueId) + ',' + JSON.stringify(s.date) + ',' + JSON.stringify(b.promoVideo) + ',' + JSON.stringify(b.bandName) + ')" title="Watch promo video" style="margin-left:6px;background:#D32F2F;border:none;color:white;border-radius:4px;padding:1px 6px;font-size:0.72rem;cursor:pointer;font-weight:700;">&#9654; YouTube</button>';
            } else {
              videoBtn = '<a href="' + escHtml(b.promoVideo) + '" target="_blank" onclick="event.stopPropagation()" title="Watch promo video" style="margin-left:6px;background:#555;color:white;border-radius:4px;padding:1px 6px;font-size:0.72rem;font-weight:700;text-decoration:none;">&#9654; Video</a>';
            }
          }
          row += '<span class="band-match-chip' + (isRoster ? ' roster' : '') + '"'
               + ' title="' + escHtml(b.criteria.join(', ')) + '"'
               + ' data-vid='  + JSON.stringify(s.venueId)
               + ' data-date=' + JSON.stringify(s.date)
               + ' data-bid='  + JSON.stringify(b.bandId)
               + ' data-bname='+ JSON.stringify(b.bandName)
               + ' onclick="handleBandChipClick(this)">'
               + (isRoster ? '&#11088; ' : '&#127928; ')
               + escHtml(b.bandName)
               + '<span style="opacity:0.6;font-size:0.65rem;margin-left:2px;">' + b.score + '&#10003;</span>'
               + videoBtn
               + '</span>';
        });
        row += '</div>';
        row += '<div class="video-panel" id="vp_' + s.venueId + '_' + s.date.replace(/-/g, '') + '"><div class="video-panel-header"><span class="video-panel-title">&#9654; Promo Video</span><button class="video-panel-close" onclick="closeVideoPanel(this)">&#x2715;</button></div><iframe id="vf_' + s.venueId + '_' + s.date.replace(/-/g, '') + '" src="" allowfullscreen allow="autoplay"></iframe></div>';
      } else {
        row += '<div style="margin-top:5px;font-size:0.72rem;color:var(--dim);font-style:italic;">No bands have submitted availability for this date</div>';
      }
      row += '<button class="slot-book-btn"'
           + ' data-vid='  + JSON.stringify(s.venueId)
           + ' data-date=' + JSON.stringify(s.date)
           + ' onclick="handleSlotBookClick(this)">+ Create Booking</button>';
      row += '</div></div>';
      parts.push(row);
    });
  });
  el.innerHTML = parts.join('');
}

function handleBandChipClick(el) {
  bookSlotBand(el.getAttribute('data-vid'), el.getAttribute('data-date'), el.getAttribute('data-bid'), el.getAttribute('data-bname'));
}
function handleSlotBookClick(el) {
  bookSlot(el.getAttribute('data-vid'), el.getAttribute('data-date'));
}

async function bookSlot(venueId, date) {
  var data = { venueId: venueId, date: date };
  try {
    var key = await callApi('api_storeBookingPrefill', [data]);
    if (!key) { createBooking(); return; }
    goToUrl('create-booking.html?prefillKey=' + encodeURIComponent(key), 'Open slot on ' + date, 'Venue and date are pre-filled.');
  } catch (err) {
    createBooking();
  }
}

async function bookSlotBand(venueId, date, bandId, bandName) {
  var data = { venueId: venueId, date: date, bandId: bandId, bandName: bandName, autoFill: true };
  try {
    var key = await callApi('api_storeBookingPrefill', [data]);
    if (!key) { createBooking(); return; }
    goToUrl('create-booking.html?prefillKey=' + encodeURIComponent(key), 'Open slot on ' + date, 'Venue and date are pre-filled.');
  } catch (err) {
    createBooking();
  }
}

function getYouTubeEmbedUrl(url) {
  var id = '';
  var m = url.match(/youtu\.be\/([^?&#]+)/);
  if (m) { id = m[1]; }
  if (!id) { m = url.match(/[?&]v=([^&#]+)/); if (m) id = m[1]; }
  if (!id) { m = url.match(/youtube\.com\/embed\/([^?&#]+)/); if (m) id = m[1]; }
  if (!id) { m = url.match(/youtube\.com\/shorts\/([^?&#]+)/); if (m) id = m[1]; }
  return id ? 'https://www.youtube.com/embed/' + id + '?autoplay=1' : null;
}

function openVideoPanel(venueId, date, videoUrl, bandName) {
  var panelId = 'vp_' + venueId + '_' + date.replace(/-/g, '');
  var frameId = 'vf_' + venueId + '_' + date.replace(/-/g, '');
  var panel = document.getElementById(panelId);
  var frame = document.getElementById(frameId);
  if (!panel || !frame) return;

  document.querySelectorAll('.video-panel.open').forEach(function(p) {
    if (p.id !== panelId) {
      p.classList.remove('open');
      var f = p.querySelector('iframe');
      if (f) f.src = '';
    }
  });

  var embedUrl = getYouTubeEmbedUrl(videoUrl);
  if (!embedUrl) { window.open(videoUrl, '_blank'); return; }

  var titleEl = panel.querySelector('.video-panel-title');
  if (titleEl) titleEl.textContent = '\u25B6 ' + bandName;

  if (panel.classList.contains('open')) {
    panel.classList.remove('open');
    frame.src = '';
  } else {
    frame.src = embedUrl;
    panel.classList.add('open');
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function closeVideoPanel(btn) {
  var panel = btn.closest('.video-panel');
  if (!panel) return;
  panel.classList.remove('open');
  var frame = panel.querySelector('iframe');
  if (frame) frame.src = '';
}

function goToUrl(url, title, subtitle) {
  if (!url) return;
  if (!title) {
    window.location.href = url;
    return;
  }
  var overlay = document.getElementById('navOverlay');
  var link    = document.getElementById('navOverlayLink');
  var ttl     = document.getElementById('navOverlayTitle');
  var sub     = document.getElementById('navOverlaySubtitle');
  link.href   = url;
  ttl.textContent = title;
  sub.textContent = subtitle || 'Click below to continue.';
  overlay.style.display = 'flex';
}

function showDashToast(msg) {
  var t = document.getElementById('toastMsg');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function() { t.classList.remove('show'); }, 4000);
}

// ── ADD BAND MODAL ─────────────────────────────────────────────────────────
function openAddBandModal() {
  document.getElementById('addBandModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeAddBandModal() {
  document.getElementById('addBandModal').classList.remove('open');
  document.body.style.overflow = '';
}
function closeAddBand(e) {
  if (e.target === document.getElementById('addBandModal')) closeAddBandModal();
}

function updateGenreDisplay(prefix) {
  var dispId  = prefix === 'ab_g' ? 'ab_gDisplay' : 'av_gDisplay';
  var dispEl  = document.getElementById(dispId);
  var checked = document.querySelectorAll('#' + prefix + 'Grid input:checked');
  var genres  = Array.from(checked).map(function(c){ return c.value; });
  var grid    = document.getElementById(prefix + 'Grid');
  if (dispEl) dispEl.textContent = genres.length ? '\u2713 ' + genres.join(', ') : '';
  if (grid)   grid.classList.toggle('has-selection', genres.length > 0);
}

function abUpdateRating() {
  var draw = parseInt(document.getElementById('ab_draw').value) || 0;
  document.getElementById('ab_rating').value =
    draw >= 150 ? 'A (150+)' : draw >= 75 ? 'B (75+)' : draw >= 40 ? 'C (40+)' : draw >= 25 ? 'D (25+)' : 'Unrated';
}

function abUpdateComm() {
  var pct  = parseFloat(document.getElementById('ab_commission').value) || 0;
  var ns   = parseFloat(document.getElementById('ab_payNoSound').value) || 0;
  var ws   = parseFloat(document.getElementById('ab_payWithSound').value) || 0;
  var pr   = parseFloat(document.getElementById('ab_privateRate').value) || 0;
  var prev = document.getElementById('abCommPreview');
  if (!pct || (!ns && !ws)) { prev.style.display = 'none'; return; }
  function fmt(v) { return '$' + Math.round(v).toLocaleString(); }
  function earn(v){ return fmt(v * pct / 100); }
  document.getElementById('abCp1').textContent = ns ? fmt(ns) : '—';
  document.getElementById('abCe1').textContent = ns ? earn(ns) : '—';
  document.getElementById('abCp2').textContent = ws ? fmt(ws) : '—';
  document.getElementById('abCe2').textContent = ws ? earn(ws) : '—';
  var show3 = pr > 0;
  ['abCl3','abCp3','abCe3'].forEach(function(id){ document.getElementById(id).style.display = show3 ? '' : 'none'; });
  if (show3) { document.getElementById('abCp3').textContent = fmt(pr); document.getElementById('abCe3').textContent = earn(pr); }
  prev.style.display = 'block';
}

function abGetSize() {
  var r = document.querySelector('input[name="ab_size"]:checked');
  return r ? r.value : '';
}

function abGetGenres() {
  return Array.from(document.querySelectorAll('#ab_gGrid input:checked')).map(function(c){ return c.value; });
}

function abShowError(msg) {
  var el = document.getElementById('abError');
  el.textContent = msg; el.style.display = 'block';
  el.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

async function abSubmit() {
  document.getElementById('abError').style.display = 'none';
  var size   = abGetSize();
  var genres = abGetGenres();
  if (!document.getElementById('ab_bandName').value.trim()) { abShowError('Band name is required.'); return; }
  if (!document.getElementById('ab_contactName').value.trim()) { abShowError('Contact name is required.'); return; }
  if (!document.getElementById('ab_email').value.trim()) { abShowError('Email is required.'); return; }
  if (!document.getElementById('ab_phone').value.trim()) { abShowError('Phone is required.'); return; }
  if (!document.getElementById('ab_payNoSound').value) { abShowError('Pay rate (no sound) is required.'); return; }
  if (!document.getElementById('ab_payWithSound').value) { abShowError('Pay rate (with sound) is required.'); return; }
  if (!document.getElementById('ab_commission').value) { abShowError('Commission rate is required.'); return; }
  if (!size)   { abShowError('Please select a band size.'); return; }
  if (!genres.length) { abShowError('Please select at least one genre.'); return; }
  if (!document.getElementById('ab_members').value) { abShowError('Number of members is required.'); return; }
  if (!document.getElementById('ab_draw').value) { abShowError('Typical draw is required.'); return; }

  document.getElementById('abBody').style.display   = 'none';
  document.getElementById('abFooter').style.display = 'none';
  document.getElementById('abLoading').style.display = 'block';

  var bandData = {
    bandName:         document.getElementById('ab_bandName').value.trim(),
    contactName:      document.getElementById('ab_contactName').value.trim(),
    nameOnW9:         document.getElementById('ab_nameOnW9').value.trim(),
    w9Current:        document.getElementById('ab_w9').value,
    email:            document.getElementById('ab_email').value.trim(),
    phone:            document.getElementById('ab_phone').value.trim(),
    payRateNoSound:   parseFloat(document.getElementById('ab_payNoSound').value) || 0,
    payRateWithSound: parseFloat(document.getElementById('ab_payWithSound').value) || 0,
    privatePartyRate: parseFloat(document.getElementById('ab_privateRate').value) || 0,
    agencyCommission: parseFloat(document.getElementById('ab_commission').value) || 0,
    genre:            genres.join(', '),
    numMembers:       parseInt(document.getElementById('ab_members').value) || 0,
    typicalDraw:      parseInt(document.getElementById('ab_draw').value) || 0,
    canTravel:        document.getElementById('ab_travel').value,
    maxTravelDistance:parseInt(document.getElementById('ab_maxDist').value) || 0,
    promoVideo:       document.getElementById('ab_video').value.trim(),
    socialMedia:      document.getElementById('ab_facebook').value.trim(),
    instagram:        document.getElementById('ab_instagram').value.trim(),
    website:          document.getElementById('ab_website').value.trim(),
    hometown:         document.getElementById('ab_hometown').value.trim(),
    bandSize:         size,
    notes:            document.getElementById('ab_notes').value.trim()
  };

  try {
    await callApi('api_addBand', [bandData, agentId, agentName || ('Agent ' + agentId)]);
    document.getElementById('abLoading').style.display  = 'none';
    document.getElementById('abBody').style.display     = 'block';
    document.getElementById('abSuccess').style.display  = 'block';
    document.getElementById('abFooter').style.display   = 'flex';
    document.getElementById('abSubmitBtn').textContent  = '+ Add Another';
    document.getElementById('abSubmitBtn').onclick      = abReset;
    loadDashboardData();
    showDashToast('\u2713 Band added successfully!');
  } catch (err) {
    document.getElementById('abLoading').style.display  = 'none';
    document.getElementById('abBody').style.display     = 'block';
    document.getElementById('abFooter').style.display   = 'flex';
    abShowError(err.message);
  }
}

function abReset() {
  document.getElementById('abSuccess').style.display = 'none';
  document.getElementById('abError').style.display   = 'none';
  document.getElementById('ab_gDisplay').textContent = '';
  document.getElementById('ab_gGrid').classList.remove('has-selection');
  ['ab_bandName','ab_contactName','ab_nameOnW9','ab_email','ab_phone',
   'ab_payNoSound','ab_payWithSound','ab_privateRate','ab_commission',
   'ab_members','ab_draw','ab_rating','ab_hometown','ab_maxDist',
   'ab_video','ab_facebook','ab_instagram','ab_website','ab_notes']
    .forEach(function(id){ var el=document.getElementById(id); if(el) el.value=''; });
  document.querySelectorAll('input[name="ab_size"]').forEach(function(r){ r.checked=false; });
  document.querySelectorAll('#ab_gGrid input').forEach(function(c){ c.checked=false; });
  document.getElementById('abCommPreview').style.display = 'none';
  var btn = document.getElementById('abSubmitBtn');
  btn.textContent = '\u{1F3B8} Add Band';
  btn.onclick = abSubmit;
}

// ── ADD VENUE MODAL ────────────────────────────────────────────────────────
function openAddVenueModal() {
  document.getElementById('addVenueModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeAddVenueModal() {
  document.getElementById('addVenueModal').classList.remove('open');
  document.body.style.overflow = '';
}
function closeAddVenue(e) {
  if (e.target === document.getElementById('addVenueModal')) closeAddVenueModal();
}

function avUpdateSizes() {
  var checked = document.querySelectorAll('#av_szGrid input:checked');
  document.getElementById('av_szGrid').classList.toggle('has-selection', checked.length > 0);
}

function avGetGenres() {
  return Array.from(document.querySelectorAll('#av_gGrid input:checked')).map(function(c){ return c.value; });
}

function avGetSizes() {
  return Array.from(document.querySelectorAll('#av_szGrid input:checked')).map(function(c){ return c.value; });
}

function avShowError(msg) {
  var el = document.getElementById('avError');
  el.textContent = msg; el.style.display = 'block';
  el.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

async function avSubmit() {
  document.getElementById('avError').style.display = 'none';
  var genres = avGetGenres();
  if (!document.getElementById('av_venueName').value.trim()) { avShowError('Venue name is required.'); return; }
  if (!document.getElementById('av_city').value.trim())      { avShowError('City is required.'); return; }
  if (!document.getElementById('av_contactName').value.trim()){ avShowError('Contact name is required.'); return; }
  if (!document.getElementById('av_email').value.trim())     { avShowError('Email is required.'); return; }
  if (!genres.length) { avShowError('Please select at least one preferred genre.'); return; }

  document.getElementById('avBody').style.display    = 'none';
  document.getElementById('avFooter').style.display  = 'none';
  document.getElementById('avLoading').style.display = 'block';

  var venueData = {
    venueName:      document.getElementById('av_venueName').value.trim(),
    address:        document.getElementById('av_address').value.trim(),
    city:           document.getElementById('av_city').value.trim(),
    state:          document.getElementById('av_state').value.trim(),
    zip:            document.getElementById('av_zip').value.trim(),
    capacity:       parseInt(document.getElementById('av_capacity').value) || 0,
    exclusivity:    document.getElementById('av_exclusivity').value,
    contactName:    document.getElementById('av_contactName').value.trim(),
    email:          document.getElementById('av_email').value.trim(),
    phone:          document.getElementById('av_phone').value.trim(),
    activityStatus: document.getElementById('av_status').value,
    hasSound:       document.getElementById('av_sound').value,
    hasLighting:    document.getElementById('av_lighting').value,
    payRateBudget:  parseFloat(document.getElementById('av_budget').value) || 0,
    preferredGenres:genres.join(','),
    prefBandSizes:  avGetSizes().join(','),
    minBandRating:  document.getElementById('av_minRating').value,
    travelPref:     document.getElementById('av_travelPref').value,
    minDraw:        parseInt(document.getElementById('av_minDraw').value) || 0,
    prefDays:       document.getElementById('av_prefDays').value.trim(),
    notes:          document.getElementById('av_notes').value.trim()
  };

  try {
    await callApi('api_addVenue', [venueData, agentId, agentName || ('Agent ' + agentId)]);
    document.getElementById('avLoading').style.display  = 'none';
    document.getElementById('avBody').style.display     = 'block';
    document.getElementById('avSuccess').style.display  = 'block';
    document.getElementById('avFooter').style.display   = 'flex';
    document.getElementById('avSubmitBtn').textContent  = '+ Add Another';
    document.getElementById('avSubmitBtn').onclick      = avReset;
    loadDashboardData();
    showDashToast('\u2713 Venue added successfully!');
  } catch (err) {
    document.getElementById('avLoading').style.display  = 'none';
    document.getElementById('avBody').style.display     = 'block';
    document.getElementById('avFooter').style.display   = 'flex';
    avShowError(err.message);
  }
}

function avReset() {
  document.getElementById('avSuccess').style.display = 'none';
  document.getElementById('avError').style.display   = 'none';
  document.getElementById('av_gDisplay').textContent = '';
  document.getElementById('av_gGrid').classList.remove('has-selection');
  document.getElementById('av_szGrid').classList.remove('has-selection');
  ['av_venueName','av_address','av_city','av_state','av_zip','av_capacity',
   'av_contactName','av_email','av_phone','av_budget','av_minDraw','av_prefDays','av_notes']
    .forEach(function(id){ var el=document.getElementById(id); if(el) el.value=''; });
  document.querySelectorAll('#av_gGrid input, #av_szGrid input').forEach(function(c){ c.checked=false; });
  var btn = document.getElementById('avSubmitBtn');
  btn.textContent = '\u{1F3D7}\uFE0F Add Venue';
  btn.onclick = avSubmit;
}

function handleNotifClick(idx) {
  var n = notifData[idx];
  if (!n || n.type !== 'band_request') return;
  closeNotifDrawer();

  var data = null;
  try {
    var parsed = JSON.parse(n.subtext);
    if (parsed && (parsed.venueId || parsed.bandId)) data = parsed;
  } catch(e) {}

  if (!data) {
    createBooking();
    return;
  }

  showLoading('Opening Booking Form…');
  callApi('api_storeBookingPrefill', [data]).then(function(key) {
    hideLoading();
    if (!key) { showDashToast('Could not save prefill data.'); return; }
    window.location.href = 'create-booking.html?prefillKey=' + encodeURIComponent(key);
  }).catch(function(err) {
    hideLoading();
    showDashToast('Error: ' + err.message);
  });
}
