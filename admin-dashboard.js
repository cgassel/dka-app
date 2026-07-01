// ============================================================================
// admin-dashboard.js — logic for admin-dashboard.html
// Converted from google.script.run to callApi() (see api.js).
// Admin session verified via sessionStorage dka_role === 'admin'.
// All data loaded in parallel then rendered client-side — no server-side
// rendering needed since all four datasets are already in the router.
// ============================================================================

var allBookings   = [];
var allVenues     = [];
var allAgents     = [];
var commissionMap = {};
var upcomingDays   = 30;
var earningsPeriod = 'month';
var bandPeriod     = 'month';

(function init() {
  if (sessionStorage.getItem('dka_role') !== 'admin') {
    window.location.href = 'index.html'; return;
  }
  document.getElementById('dateText').textContent =
    'Agency overview — ' + new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  loadAll();
})();

function loadAll() {
  var bookingsLoaded=false, venuesLoaded=false, agentsLoaded=false, commLoaded=false;
  function tryRender() {
    if (bookingsLoaded && venuesLoaded && agentsLoaded && commLoaded) renderAll();
  }
  callApi('api_getAllBookings',       []).then(function(d){ allBookings=d||[];   bookingsLoaded=true; tryRender(); }).catch(function(){ allBookings=[];   bookingsLoaded=true; tryRender(); });
  callApi('api_getVenuesFullData',   []).then(function(d){ allVenues=d||[];     venuesLoaded=true;   tryRender(); }).catch(function(){ allVenues=[];     venuesLoaded=true;   tryRender(); });
  callApi('api_getAgents',           []).then(function(d){ allAgents=d||[];     agentsLoaded=true;   tryRender(); }).catch(function(){ allAgents=[];     agentsLoaded=true;   tryRender(); });
  callApi('api_getBandCommissionMap',[]).then(function(d){ commissionMap=d||{}; commLoaded=true;     tryRender(); }).catch(function(){ commissionMap={}; commLoaded=true;     tryRender(); });
}

function refreshAll() { allBookings=[]; allVenues=[]; allAgents=[]; commissionMap={}; loadAll(); }

function agencyEarnings(b) {
  var pay = parseFloat(b.payAmount) || 0;
  var pct = (b.commissionPct > 0) ? b.commissionPct : (parseFloat(commissionMap[String(b.bandId)]) || 0);
  return Math.round(pay * pct) / 100;
}

function periodStart(period) {
  var now = new Date();
  if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === 'year')  return new Date(now.getFullYear(), 0, 1);
  return new Date(2000, 0, 1);
}

function renderAll() {
  renderStats();
  renderUpcoming();
  renderContactAlerts();
  renderAgentEarnings();
  renderBandSpend();
  renderOpenDates();
  renderRecent();
}

function renderStats() {
  var now = new Date();
  var monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  var yearStart  = new Date(now.getFullYear(), 0, 1);
  var thirtyDaysAgo = new Date(now.getTime() - 30*86400000);
  var monthEarn=0, monthCount=0, yearEarn=0, yearCount=0, yearBandSpend=0, contactAlert=0;

  allBookings.forEach(function(b) {
    if ((b.status||'').toLowerCase() === 'cancelled') return;
    var d = new Date(b.date + 'T12:00:00');
    var earn = agencyEarnings(b);
    var pay  = parseFloat(b.payAmount) || 0;
    if (d >= yearStart)  { yearEarn  += earn; yearCount++;  yearBandSpend += pay; }
    if (d >= monthStart) { monthEarn += earn; monthCount++; }
  });

  allVenues.forEach(function(v) {
    var lc = v.lastContactDate ? new Date(v.lastContactDate) : null;
    if (!lc || lc < thirtyDaysAgo) contactAlert++;
  });

  ['sMonthEarn','sYearEarn','sBandSpend','sTotalBookings','sContactAlert'].forEach(function(id){
    document.getElementById(id).classList.remove('shimmer');
  });

  document.getElementById('sMonthEarn').textContent     = '$' + monthEarn.toLocaleString('en-US',{maximumFractionDigits:0});
  document.getElementById('sMonthSub').textContent      = monthCount + ' booking' + (monthCount!==1?'s':'') + ' this month';
  document.getElementById('sYearEarn').textContent      = '$' + yearEarn.toLocaleString('en-US',{maximumFractionDigits:0});
  document.getElementById('sYearSub').textContent       = yearCount + ' booking' + (yearCount!==1?'s':'') + ' this year';
  document.getElementById('sBandSpend').textContent     = '$' + yearBandSpend.toLocaleString('en-US',{maximumFractionDigits:0});
  document.getElementById('sBandSpendSub').textContent  = 'paid to bands this year';
  document.getElementById('sTotalBookings').textContent = allBookings.length;
  document.getElementById('sTotalSub').textContent      = 'total bookings on record';
  document.getElementById('sContactAlert').textContent  = contactAlert;
}

function setUpcoming(days, btn) {
  upcomingDays = days;
  btn.parentElement.querySelectorAll('.period-tab').forEach(function(t){t.classList.remove('active');});
  btn.classList.add('active');
  renderUpcoming();
}
function renderUpcoming() {
  var now    = new Date(); now.setHours(0,0,0,0);
  var cutoff = new Date(now.getTime() + upcomingDays*86400000);
  var list   = allBookings.filter(function(b){
    var d = new Date(b.date + 'T12:00:00');
    return d>=now && d<=cutoff && (b.status||'').toLowerCase()!=='cancelled';
  }).sort(function(a,b){ return new Date(a.date+'T12:00:00') - new Date(b.date+'T12:00:00'); });

  document.getElementById('upcomingCount').textContent = list.length;
  if (list.length === 0) {
    document.getElementById('upcomingPanel').innerHTML = '<div class="empty-state"><div class="ei">&#x1F389;</div><p>No upcoming bookings in the next ' + upcomingDays + ' days.</p></div>';
    return;
  }
  var html = '';
  list.slice(0,15).forEach(function(b) {
    var d    = new Date(b.date + 'T12:00:00');
    var ds   = d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    var dow  = d.toLocaleDateString('en-US',{weekday:'short'});
    var pay  = parseFloat(b.payAmount)||0;
    var earn = agencyEarnings(b);
    var sc   = 'status-'+(b.status||'pending').toLowerCase().replace(/\s+/g,'-');
    html += '<div class="booking-item"><div class="booking-main">';
    html += '<div class="booking-names">'+esc(b.venueName)+' <span style="color:var(--muted);font-weight:400;">with</span> '+esc(b.bandName)+'</div>';
    html += '<div class="booking-meta"><span class="status-badge '+sc+'">'+esc(b.status||'Pending')+'</span>';
    if (b.agentName) html += '<span>&#x1F464; '+esc(b.agentName)+'</span>';
    html += '</div></div>';
    html += '<div style="text-align:right;"><div class="booking-date">'+dow+' '+ds+'</div>';
    if (pay>0) { html += '<div style="font-size:0.74rem;color:var(--muted);">Band: $'+pay.toLocaleString()+'</div>'; if(earn>0) html += '<div class="booking-pay">Commission: $'+earn.toLocaleString()+'</div>'; }
    html += '</div></div>';
  });
  if (list.length > 15) html += '<div class="section-label">&#x2026; and '+(list.length-15)+' more</div>';
  document.getElementById('upcomingPanel').innerHTML = html;
}

function renderContactAlerts() {
  var now = new Date();
  var withDays = allVenues.map(function(v) {
    var lc = v.lastContactDate ? new Date(v.lastContactDate) : null;
    return { venue:v, daysSince:lc?Math.floor((now-lc)/86400000):9999 };
  }).sort(function(a,b){ return b.daysSince-a.daysSince; });

  var alerts = withDays.filter(function(x){ return x.daysSince>=30; });
  document.getElementById('contactCount').textContent = alerts.length;

  if (alerts.length === 0) {
    var html = '<div class="section-label">ALL RECENTLY CONTACTED</div>';
    withDays.slice(0,5).forEach(function(x){ html+=buildAlertRow(x,'ok'); });
    document.getElementById('contactPanel').innerHTML = html;
    return;
  }
  var html = '';
  var overdue = alerts.filter(function(x){ return x.daysSince>=60; });
  var warn    = alerts.filter(function(x){ return x.daysSince>=30 && x.daysSince<60; });
  if (overdue.length) { html += '<div class="section-label">OVERDUE (60+ DAYS)</div>'; overdue.slice(0,8).forEach(function(x){ html+=buildAlertRow(x,'red'); }); }
  if (warn.length)    { html += '<div class="section-label">FOLLOW UP (30&#x2013;59 DAYS)</div>'; warn.slice(0,8).forEach(function(x){ html+=buildAlertRow(x,'warn'); }); }
  document.getElementById('contactPanel').innerHTML = html;
}

function buildAlertRow(x, sev) {
  var icon = sev==='red'?'&#x1F534;':sev==='warn'?'&#x1F7E1;':'&#x1F7E2;';
  var ic   = sev==='red'?'red':sev==='warn'?'gold':'blue';
  var days = x.daysSince>=9000?'Never contacted':x.daysSince+' days ago';
  var dc   = 'alert-days'+(sev==='ok'?' ok':sev==='warn'?' warn':'');
  var city = x.venue.city?(x.venue.city+(x.venue.state?', '+x.venue.state:'')):'';
  return '<div class="alert-item">'+
    '<div class="alert-icon '+ic+'">'+icon+'</div>'+
    '<div class="alert-content"><div class="alert-name">'+esc(x.venue.name)+'</div>'+
    '<div class="alert-detail">'+esc(city)+(x.venue.phone?' &#xB7; '+esc(x.venue.phone):'')+
    (x.venue.addedByAgent?' &#xB7; &#x1F464; Agent '+esc(String(x.venue.addedByAgent)):'')+'</div></div>'+
    '<div class="'+dc+'">'+days+'</div></div>';
}

function setEarnings(period, btn) {
  earningsPeriod = period;
  btn.parentElement.querySelectorAll('.period-tab').forEach(function(t){t.classList.remove('active');});
  btn.classList.add('active');
  renderAgentEarnings();
}
function renderAgentEarnings() {
  var ps = periodStart(earningsPeriod);
  var filtered = allBookings.filter(function(b){
    return new Date(b.date+'T12:00:00') >= ps && (b.status||'').toLowerCase() !== 'cancelled';
  });
  if (filtered.length === 0) {
    document.getElementById('agentEarningsPanel').innerHTML = '<div class="empty-state"><div class="ei">&#x1F4CA;</div><p>No data for this period.</p></div>';
    return;
  }
  var byAgent = {};
  filtered.forEach(function(b) {
    var aid  = String(b.agentId);
    var earn = agencyEarnings(b);
    var pay  = parseFloat(b.payAmount) || 0;
    if (!byAgent[aid]) byAgent[aid] = { name:b.agentName||('Agent '+aid), count:0, commission:0, bandPay:0, venues:{}, bands:{} };
    byAgent[aid].count++;
    byAgent[aid].commission += earn;
    byAgent[aid].bandPay    += pay;
    byAgent[aid].venues[b.venueId] = true;
    byAgent[aid].bands[b.bandId]   = true;
  });
  var sorted = Object.keys(byAgent).map(function(k){ return Object.assign({id:k}, byAgent[k]); }).sort(function(a,b){ return b.commission-a.commission; });
  var grandComm = sorted.reduce(function(s,x){ return s+x.commission; }, 0);
  var grandPay  = sorted.reduce(function(s,x){ return s+x.bandPay; }, 0);
  var grandShows= sorted.reduce(function(s,x){ return s+x.count; }, 0);
  var maxComm   = sorted.length ? sorted[0].commission : 1;

  var html = '<div class="agent-row" style="background:var(--card2);font-weight:700;font-size:0.78rem;color:var(--muted);"><span>AGENT</span><span style="text-align:right;">SHOWS</span><span style="text-align:right;">BAND PAY</span><span style="text-align:right;">COMMISSION</span><span style="text-align:right;">% OF TOTAL</span></div>';
  sorted.forEach(function(x) {
    var pct = grandComm > 0 ? Math.round(x.commission / grandComm * 100) : 0;
    var bar = maxComm  > 0 ? Math.round(x.commission / maxComm  * 100) : 0;
    html += '<div class="agent-row"><div><div class="agent-name">'+esc(x.name)+'</div><div class="agent-meta">'+Object.keys(x.venues).length+' venues &#xB7; '+Object.keys(x.bands).length+' bands</div><div class="commission-bar-bg"><div class="commission-bar-fill" style="width:'+bar+'%;"></div></div></div>';
    html += '<div class="mono">'+x.count+'</div><div class="mono" style="color:var(--muted);">$'+Math.round(x.bandPay).toLocaleString()+'</div><div class="mono" style="color:var(--green-dark);font-weight:700;">$'+Math.round(x.commission).toLocaleString()+'</div><div class="mono" style="color:var(--muted);">'+pct+'%</div></div>';
  });
  html += '<div class="agent-row" style="border-top:2px solid var(--border);font-weight:700;"><span>TOTAL</span><span class="mono">'+grandShows+'</span><span class="mono" style="color:var(--muted);">$'+Math.round(grandPay).toLocaleString()+'</span><span class="mono" style="color:var(--green-dark);">$'+Math.round(grandComm).toLocaleString()+'</span><span class="mono">100%</span></div>';
  var missing = filtered.filter(function(b){ return !(commissionMap[String(b.bandId)] > 0) && !(b.commissionPct > 0); }).length;
  if (missing > 0) html += '<div style="padding:10px 20px;font-size:0.78rem;color:#b45309;background:#fffbeb;border-top:1px solid #fde68a;">&#x26A0; '+missing+' booking'+(missing>1?'s have':' has')+' no commission rate set.</div>';
  document.getElementById('agentEarningsPanel').innerHTML = html;
}

function setBandPeriod(period, btn) {
  bandPeriod = period;
  btn.parentElement.querySelectorAll('.period-tab').forEach(function(t){t.classList.remove('active');});
  btn.classList.add('active');
  renderBandSpend();
}
function renderBandSpend() {
  var ps = periodStart(bandPeriod);
  var filtered = allBookings.filter(function(b){
    return new Date(b.date+'T12:00:00') >= ps && (b.status||'').toLowerCase() !== 'cancelled';
  });
  if (filtered.length === 0) {
    document.getElementById('bandSpendPanel').innerHTML = '<div class="empty-state"><div class="ei">&#x1F4CA;</div><p>No data for this period.</p></div>';
    return;
  }
  var byBand = {};
  filtered.forEach(function(b) {
    var bid  = String(b.bandId);
    var pay  = parseFloat(b.payAmount) || 0;
    var comm = agencyEarnings(b);
    if (!byBand[bid]) byBand[bid] = { name:b.bandName||('Band '+bid), shows:0, totalPay:0, totalCommission:0, agents:{} };
    byBand[bid].shows++;
    byBand[bid].totalPay        += pay;
    byBand[bid].totalCommission += comm;
    byBand[bid].agents[String(b.agentId)] = b.agentName || ('Agent '+b.agentId);
  });
  var sorted  = Object.keys(byBand).map(function(k){ return Object.assign({id:k}, byBand[k]); }).sort(function(a,b){ return b.totalPay-a.totalPay; });
  var grandPay  = sorted.reduce(function(s,x){ return s+x.totalPay; }, 0);
  var grandComm = sorted.reduce(function(s,x){ return s+x.totalCommission; }, 0);
  var maxPay    = sorted.length ? sorted[0].totalPay : 1;

  var html = '<div class="band-row" style="background:var(--card2);font-weight:700;font-size:0.78rem;color:var(--muted);"><span>BAND</span><span style="text-align:right;">SHOWS</span><span style="text-align:right;">TOTAL PAID</span><span style="text-align:right;">COMMISSION EARNED</span></div>';
  sorted.forEach(function(x) {
    var bar = maxPay > 0 ? Math.round(x.totalPay / maxPay * 100) : 0;
    var agentNames = Object.values ? Object.values(x.agents).join(', ') : Object.keys(x.agents).map(function(k){ return x.agents[k]; }).join(', ');
    html += '<div class="band-row"><div><div style="font-weight:600;font-size:0.88rem;">'+esc(x.name)+'</div><div style="font-size:0.74rem;color:var(--muted);margin-top:2px;">Booked by: '+esc(agentNames)+'</div><div class="commission-bar-bg"><div class="commission-bar-fill" style="width:'+bar+'%;background:var(--bronze1);"></div></div></div>';
    html += '<div class="mono">'+x.shows+'</div><div class="mono" style="font-weight:700;">$'+Math.round(x.totalPay).toLocaleString()+'</div><div class="mono" style="color:var(--green-dark);">$'+Math.round(x.totalCommission).toLocaleString()+'</div></div>';
  });
  html += '<div class="band-row" style="border-top:2px solid var(--border);font-weight:700;"><span>TOTAL</span><span class="mono">'+filtered.length+'</span><span class="mono">$'+Math.round(grandPay).toLocaleString()+'</span><span class="mono" style="color:var(--green-dark);">$'+Math.round(grandComm).toLocaleString()+'</span></div>';
  document.getElementById('bandSpendPanel').innerHTML = html;
}

function renderOpenDates() {
  var now = new Date(); now.setHours(0,0,0,0);
  var end = new Date(now.getTime() + 90*86400000);
  var bookedMap={}, bookedVids={};
  allBookings.forEach(function(b){
    if ((b.status||'').toLowerCase()!=='cancelled') { bookedMap[b.venueId+'|'+b.date]=true; bookedVids[b.venueId]=b.venueName; }
  });
  var results=[];
  Object.keys(bookedVids).forEach(function(vid){
    var openDates=[];
    var d=new Date(now.getTime()+7*86400000);
    while(d<=end){
      var dow=d.getDay();
      if(dow===5||dow===6){
        var ds=d.toISOString().split('T')[0];
        if(!bookedMap[vid+'|'+ds]) openDates.push(d.toLocaleDateString('en-US',{month:'short',day:'numeric'})+' (['+'Su,Mo,Tu,We,Th,Fr,Sa'.split(',')[dow]+')');
      }
      d=new Date(d.getTime()+86400000);
    }
    if(openDates.length>0){
      var vd=null; for(var i=0;i<allVenues.length;i++){if(String(allVenues[i].id)===String(vid)){vd=allVenues[i];break;}}
      results.push({id:vid,name:bookedVids[vid],openDates:openDates.slice(0,5),venue:vd});
    }
  });
  document.getElementById('openCount').textContent=results.length;
  if(results.length===0){ document.getElementById('openDatesPanel').innerHTML='<div class="empty-state"><div class="ei">&#x1F4ED;</div><p>All booked venues are filled.</p></div>'; return; }
  var html='';
  results.slice(0,10).forEach(function(r){
    var city=r.venue?(r.venue.city||'')+(r.venue.state?', '+r.venue.state:''):'';
    html+='<div style="padding:12px 20px;border-bottom:1px solid var(--border);"><div style="display:flex;justify-content:space-between;align-items:flex-start;"><div><div style="font-size:0.88rem;font-weight:600;">'+esc(r.name)+'</div>';
    if(city) html+='<div style="font-size:0.76rem;color:var(--muted);">'+esc(city)+'</div>';
    html+='</div>';
    if(r.venue&&r.venue.addedByAgent) html+='<div style="font-size:0.72rem;color:var(--muted);">Agent '+esc(String(r.venue.addedByAgent))+'</div>';
    html+='</div><div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:6px;">';
    r.openDates.forEach(function(dt){html+='<span style="background:#e8f5e9;color:#2e7d32;font-size:0.72rem;font-family:JetBrains Mono,monospace;padding:2px 8px;border-radius:6px;">'+dt+'</span>';});
    html+='</div></div>';
  });
  document.getElementById('openDatesPanel').innerHTML=html;
}

function renderRecent() {
  var sorted = allBookings.slice().sort(function(a,b){ return new Date(b.date+'T12:00:00')-new Date(a.date+'T12:00:00'); });
  var recent = sorted.slice(0,12);
  document.getElementById('recentCount').textContent = allBookings.length+' total';
  if(recent.length===0){ document.getElementById('recentPanel').innerHTML='<div class="empty-state"><div class="ei">&#x1F4ED;</div><p>No bookings yet.</p></div>'; return; }
  var html='<div class="section-label">12 MOST RECENT</div>';
  recent.forEach(function(b){
    var d    = new Date(b.date+'T12:00:00');
    var ds   = d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    var pay  = parseFloat(b.payAmount)||0;
    var earn = agencyEarnings(b);
    var sc   = 'status-'+(b.status||'pending').toLowerCase().replace(/\s+/g,'-');
    var past = d < new Date();
    html+='<div class="booking-item"'+(past?' style="opacity:0.7;"':'')+'><div class="booking-main"><div class="booking-names">'+esc(b.venueName)+' <span style="color:var(--muted);">&#xB7;</span> '+esc(b.bandName)+'</div>';
    html+='<div class="booking-meta"><span class="status-badge '+sc+'">'+esc(b.status||'Pending')+'</span>';
    if(b.agentName) html+='<span>&#x1F464; '+esc(b.agentName)+'</span>';
    html+='</div></div><div style="text-align:right;"><div class="booking-date">'+ds+'</div>';
    if(pay>0){ html+='<div style="font-size:0.74rem;color:var(--muted);">Band: $'+pay.toLocaleString()+'</div>'; if(earn>0) html+='<div class="booking-pay">Commission: $'+earn.toLocaleString()+'</div>'; }
    html+='</div></div>';
  });
  document.getElementById('recentPanel').innerHTML=html;
}

function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function logout() {
  document.getElementById('loadingText').textContent = 'Signing out\u2026';
  document.getElementById('loadingOverlay').classList.add('show');
  callApi('logoutAdmin', []).finally(function() {
    sessionStorage.removeItem('dka_role');
    sessionStorage.removeItem('dka_id');
    window.location.href = 'index.html';
  });
}
