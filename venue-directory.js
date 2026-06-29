// ============================================================================
// venue-directory.js — logic for venue-directory.html
// Converted from google.script.run to callApi() (see api.js).
// agentId comes from sessionStorage instead of getCurrentAgentId().
// ============================================================================

var allVenues = [], filteredVenues = [];
var sortCol = 'name', sortDir = 'asc';
var viewIdx = -1, editId = null, saving = false;
var isAgent = true;
var agentId = sessionStorage.getItem('dka_id');

function agentVis() {
  document.querySelectorAll('.agent-only').forEach(function(el) {
    el.style.display = isAgent ? '' : 'none';
  });
}
function e(v) {
  if (v == null) return '';
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

window.onload = function() {
  if (!sessionStorage.getItem('dka_role') || !agentId) {
    window.location.href = 'index.html';
    return;
  }
  isAgent = !!(agentId && String(agentId).trim());
  agentVis();
  load();
};

function load() {
  callApi('api_getVenuesFullData', []).then(function(data) {
    allVenues = Array.isArray(data) ? data : [];
    buildStates(); stats(); filter();
  }).catch(function(err) {
    document.getElementById('tableWrapper').innerHTML =
      '<div class="empty-state"><h3>Error</h3><p>' + (err ? err.message : 'Unknown') + '</p></div>';
  });
}

function buildStates() {
  var map = {};
  allVenues.forEach(function(v) { if (v.state) map[v.state] = 1; });
  var sel = document.getElementById('filterState');
  Object.keys(map).sort().forEach(function(s) {
    var o = document.createElement('option'); o.value = s; o.textContent = s; sel.appendChild(o);
  });
}

function stats() {
  var now = new Date(), ago = new Date(now - 30*864e5);
  var s=0, l=0, c=0;
  allVenues.forEach(function(v) {
    if (v.hasSound === 'Yes') s++;
    if (v.hasLighting === 'Yes') l++;
    var d = v.lastContactDate ? new Date(v.lastContactDate) : null;
    if (!d || d < ago) c++;
  });
  document.getElementById('statTotal').textContent    = allVenues.length;
  document.getElementById('statSound').textContent    = s;
  document.getElementById('statLighting').textContent = l;
  document.getElementById('statContact').textContent  = c;
}

function filter() {
  var q  = document.getElementById('searchBox').value.toLowerCase();
  var st = document.getElementById('filterState').value;
  var so = document.getElementById('filterSound').value;
  var li = document.getElementById('filterLighting').value;
  var ex = document.getElementById('filterExcl').value;
  filteredVenues = allVenues.filter(function(v) {
    if (q) { var s=(v.name+' '+v.contact+' '+v.city+' '+v.state+' '+(v.preferredGenres||'')).toLowerCase(); if (s.indexOf(q)<0) return false; }
    if (st && v.state       !== st) return false;
    if (so && v.hasSound    !== so) return false;
    if (li && v.hasLighting !== li) return false;
    if (ex && v.exclusivity !== ex) return false;
    return true;
  });
  doSort(); draw();
}
function filterVenues() { filter(); }

function doSort() {
  filteredVenues.sort(function(a,b) {
    var x=(a[sortCol]||'').toString().toLowerCase(), y=(b[sortCol]||'').toString().toLowerCase();
    return sortDir==='asc' ? x.localeCompare(y) : y.localeCompare(x);
  });
}
var COLS = ['name','city','contact','capacity','rating','exclusivity','payRateBudget','lastContactDate'];
function setSort(n) {
  var col = COLS[n];
  sortDir = (sortCol===col && sortDir==='asc') ? 'desc' : 'asc';
  sortCol = col; doSort(); draw();
}

function rBadge(r) {
  if (!r) return '-';
  var c=r.charAt(0);
  if (c==='A') return '<span class="rating-a">A</span>';
  if (c==='B') return '<span class="rating-b">B</span>';
  if (c==='C') return '<span class="rating-c">C</span>';
  if (c==='D') return '<span class="rating-d">D</span>';
  return '-';
}
function ynBadge(v) {
  if (v==='Yes') return '<span class="w9-yes">&#10003; Yes</span>';
  if (v==='No')  return '<span class="w9-no">&#x2717; No</span>';
  return '-';
}
function lcBadge(ds) {
  if (!ds) return '<span style="color:#D32F2F;font-weight:700">Never</span>';
  var d=new Date(ds), days=Math.floor((new Date()-d)/864e5);
  var fmt=d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'});
  return days>30 ? '<span style="color:#D32F2F;font-weight:700">'+fmt+'</span>'
                 : '<span style="color:#2e7d32">'+fmt+'</span>';
}

function draw() {
  document.getElementById('resultsCount').textContent =
    'Showing ' + filteredVenues.length + ' of ' + allVenues.length + ' venues';
  if (!filteredVenues.length) {
    document.getElementById('tableWrapper').innerHTML =
      '<div class="empty-state"><h3>No venues found</h3><p>Try adjusting filters</p></div>';
    return;
  }
  var h = '<table><thead><tr>';
  h += '<th onclick="setSort(0)">Venue Name &#x21D5;</th>';
  h += '<th onclick="setSort(1)">City / State &#x21D5;</th>';
  h += '<th onclick="setSort(2)">Contact &#x21D5;</th>';
  h += '<th onclick="setSort(3)">Cap. &#x21D5;</th>';
  h += '<th onclick="setSort(4)">Rating &#x21D5;</th>';
  h += '<th>Sound</th><th>Lights</th>';
  h += '<th onclick="setSort(5)">Exclusivity &#x21D5;</th>';
  h += '<th onclick="setSort(6)">Budget &#x21D5;</th>';
  h += '<th onclick="setSort(7)">Last Contact &#x21D5;</th>';
  h += '<th>Actions</th></tr></thead><tbody>';
  for (var i=0; i<filteredVenues.length; i++) {
    var v = filteredVenues[i];
    h += '<tr>';
    h += '<td><strong>' + e(v.name) + '</strong>' + (v.preferredGenres ? '<br><small style="color:#666">' + e(v.preferredGenres) + '</small>' : '') + '</td>';
    h += '<td>' + e(v.city) + (v.state ? ', '+e(v.state) : '') + '</td>';
    h += '<td>' + e(v.contact) + (v.phone ? '<br><small style="color:#666">'+e(v.phone)+'</small>' : '') + '</td>';
    h += '<td>' + (v.capacity||'-') + '</td>';
    h += '<td>' + rBadge(v.rating) + '</td>';
    h += '<td>' + ynBadge(v.hasSound) + '</td>';
    h += '<td>' + ynBadge(v.hasLighting) + '</td>';
    h += '<td>' + (v.exclusivity ? e(v.exclusivity) : '-') + '</td>';
    h += '<td>' + (v.payRateBudget ? '$'+e(String(v.payRateBudget)) : '-') + '</td>';
    h += '<td>' + lcBadge(v.lastContactDate) + '</td>';
    h += '<td style="white-space:nowrap">';
    h += '<button class="btn btn-primary btn-small" onclick="vView(' + i + ')" style="margin-right:3px;padding:4px 8px;font-size:0.72rem">View</button>';
    h += '<button class="btn btn-orange btn-small" onclick="vEdit(' + i + ')" style="padding:4px 8px;font-size:0.72rem">Edit</button>';
    h += '<button class="btn btn-delete btn-small" onclick="vDelete(' + i + ')" style="padding:4px 8px;font-size:0.72rem;margin-left:3px">Delete</button>';
    h += '</td></tr>';
  }
  h += '</tbody></table>';
  document.getElementById('tableWrapper').innerHTML = h;
}

function sect(t,rows){return '<div class="detail-section"><div class="detail-section-title">'+t+'</div>'+rows.join('')+'</div>';}
function dr(l,v){return '<div class="detail-row"><span class="detail-label">'+l+'</span><span class="detail-value">'+v+'</span></div>';}

function vView(i) {
  viewIdx = i;
  var v = filteredVenues[i]; if (!v) return;
  document.getElementById('modalVenueName').textContent = v.name || '';
  var h = '';
  h += sect('Contact', [dr('Contact',e(v.contact)||'-'), dr('Email', v.email ? '<a class="link" href="mailto:'+v.email+'">'+e(v.email)+'</a>' : '-'), dr('Phone',e(v.phone)||'-'), dr('Address',[v.address,v.city,v.state,v.zip].filter(Boolean).map(e).join(', ')||'-')]);
  h += sect('Venue Details', [dr('Capacity',e(v.capacity)||'-'), dr('Rating',rBadge(v.rating)), dr('Pay Budget',v.payRateBudget?'$'+e(String(v.payRateBudget)):'-'), dr('Has Sound',ynBadge(v.hasSound)), dr('Has Lighting',ynBadge(v.hasLighting)), dr('Exclusivity',e(v.exclusivity)||'-')]);
  h += sect('Preferences', [dr('Genres',e(v.preferredGenres)||'-'), dr('Band Sizes',e(v.prefBandSizes)||'-'), dr('Min Rating',e(v.minBandRating)||'Any'), dr('Min Draw',v.minDraw?e(String(v.minDraw)):'-'), dr('Travel',e(v.travelPref)||'Any')]);
  h += sect('Contact History', [dr('Last Contact',lcBadge(v.lastContactDate)), dr('Notes',e(v.lastContactNotes)||'-')]);
  if (v.notes) h += '<div class="detail-section"><div class="detail-section-title">Notes</div><p>'+e(v.notes)+'</p></div>';
  document.getElementById('modalContent').innerHTML = h;
  var r=document.getElementById('viewModalRoot'); r.classList.add('open'); r.scrollTop=0;
}
function openEditFromView() { closeView(); if (viewIdx>=0) vEdit(viewIdx); }
function closeView() { document.getElementById('viewModalRoot').classList.remove('open'); }
function handleViewBackdrop(ev) { if (ev.target===document.getElementById('viewModalRoot')) closeView(); }

function vEdit(i) {
  var v=filteredVenues[i]; if (!v) return;
  editId=v.id; saving=false;
  document.getElementById('editSuccess').style.display='none';
  document.getElementById('editError').style.display='none';
  document.getElementById('editLoading').style.display='none';
  document.getElementById('editFormWrap').style.display='block';
  document.getElementById('eVenueName').value    =v.name||'';
  document.getElementById('eContactName').value  =v.contact||'';
  document.getElementById('ePhone').value        =v.phone||'';
  document.getElementById('eEmail').value        =v.email||'';
  document.getElementById('eAddress').value      =v.address||'';
  document.getElementById('eCity').value         =v.city||'';
  document.getElementById('eState').value        =v.state||'';
  document.getElementById('eZip').value          =v.zip||'';
  document.getElementById('eCapacity').value     =v.capacity||'';
  document.getElementById('ePayRateBudget').value=v.payRateBudget||'';
  document.getElementById('eExclusivity').value  =v.exclusivity||'';
  document.getElementById('eHasSound').value     =v.hasSound||'';
  document.getElementById('eHasLighting').value  =v.hasLighting||'';
  document.getElementById('ePrefGenres').value   =v.preferredGenres||'';
  document.getElementById('ePrefBandSizes').value=v.prefBandSizes||'';
  document.getElementById('eMinBandRating').value=v.minBandRating||'';
  document.getElementById('eMinDraw').value      =v.minDraw||'';
  document.getElementById('eTravelPref').value   =v.travelPref||'Any';
  document.getElementById('eNotes').value        =v.notes||'';
  document.getElementById('eContactNotes').value =v.lastContactNotes||'';
  var r=document.getElementById('editModalRoot'); r.classList.add('open'); r.scrollTop=0;
  agentVis();
}
function closeEdit() { document.getElementById('editModalRoot').classList.remove('open'); }
function handleEditBackdrop(ev) { if (ev.target===document.getElementById('editModalRoot')) closeEdit(); }

async function submitEdit() {
  if (saving) return; saving=true;
  document.getElementById('editError').style.display='none';
  document.getElementById('editSuccess').style.display='none';
  document.getElementById('editFormWrap').style.display='none';
  document.getElementById('editLoading').style.display='block';
  var d={
    venueName:       document.getElementById('eVenueName').value,
    contactName:     document.getElementById('eContactName').value,
    phone:           document.getElementById('ePhone').value,
    email:           document.getElementById('eEmail').value,
    address:         document.getElementById('eAddress').value,
    city:            document.getElementById('eCity').value,
    state:           document.getElementById('eState').value,
    zip:             document.getElementById('eZip').value,
    capacity:        parseInt(document.getElementById('eCapacity').value)||0,
    payRateBudget:   parseFloat(document.getElementById('ePayRateBudget').value)||0,
    exclusivity:     document.getElementById('eExclusivity').value,
    hasSound:        document.getElementById('eHasSound').value,
    hasLighting:     document.getElementById('eHasLighting').value,
    preferredGenres: document.getElementById('ePrefGenres').value,
    prefBandSizes:   document.getElementById('ePrefBandSizes').value,
    minBandRating:   document.getElementById('eMinBandRating').value,
    minDraw:         parseInt(document.getElementById('eMinDraw').value)||0,
    travelPref:      document.getElementById('eTravelPref').value,
    notes:           document.getElementById('eNotes').value,
    lastContactNotes:document.getElementById('eContactNotes').value
  };

  try {
    await callApi('api_updateVenue', [editId, d, agentId, 'Agent ' + agentId]);
    saving=false;
    document.getElementById('editLoading').style.display='none';
    document.getElementById('editSuccess').style.display='block';
    for (var i=0;i<allVenues.length;i++) {
      if (String(allVenues[i].id)===String(editId)) {
        allVenues[i].name=d.venueName; allVenues[i].contact=d.contactName;
        allVenues[i].phone=d.phone; allVenues[i].email=d.email;
        allVenues[i].address=d.address; allVenues[i].city=d.city;
        allVenues[i].state=d.state; allVenues[i].zip=d.zip;
        allVenues[i].capacity=d.capacity; allVenues[i].payRateBudget=d.payRateBudget;
        allVenues[i].exclusivity=d.exclusivity; allVenues[i].hasSound=d.hasSound;
        allVenues[i].hasLighting=d.hasLighting; allVenues[i].preferredGenres=d.preferredGenres;
        allVenues[i].prefBandSizes=d.prefBandSizes; allVenues[i].minBandRating=d.minBandRating;
        allVenues[i].minDraw=d.minDraw; allVenues[i].travelPref=d.travelPref;
        allVenues[i].notes=d.notes; allVenues[i].lastContactNotes=d.lastContactNotes;
        break;
      }
    }
    stats(); filter();
    setTimeout(closeEdit, 1500);
  } catch (err) {
    saving=false;
    document.getElementById('editLoading').style.display='none';
    document.getElementById('editFormWrap').style.display='block';
    document.getElementById('editError').style.display='block';
    document.getElementById('editError').textContent='Error: '+err.message;
  }
}

function deleteFromView() {
  if (viewIdx < 0) return;
  var v = filteredVenues[viewIdx];
  closeView();
  vDelete(viewIdx);
}

function vDelete(i) {
  var v = filteredVenues[i]; if (!v) return;
  if (!confirm('Delete ' + v.name + '? This cannot be undone.')) return;
  callApi('api_deleteVenue', [v.id]).then(function() {
    allVenues = allVenues.filter(function(x) { return x.id !== v.id; });
    stats(); filter();
  }).catch(function(err) {
    alert('Error deleting venue: ' + err.message);
  });
}

function addVenue()      { window.location.href = 'add-venue.html'; }
function goToDashboard() { window.location.href = 'agent-dashboard.html'; }
