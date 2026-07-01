// ============================================================================
// band-stats.js — logic for band-stats.html
// Converted from google.script.run to callApi() (see api.js).
// agentId read from sessionStorage (set at login).
// ============================================================================

var allStats = [];
var filtered = [];

window.onload = function() {
  var agentId = sessionStorage.getItem('dka_id');
  if (!agentId) { window.location.href = 'index.html'; return; }

  callApi('api_getBandStats', [agentId]).then(function(stats) {
    allStats = stats || [];
    filtered = allStats.slice();
    renderSummary();
    sortTable();
  }).catch(function(err) {
    document.getElementById('tableWrap').innerHTML =
      '<div class="empty-state"><div class="empty-icon">&#10060;</div><p>Error loading stats: ' + esc(err.message) + '</p></div>';
  });
};

function renderSummary() {
  var totalPay = 0, totalComm = 0;
  allStats.forEach(function(b){ totalPay += (b.totalPay||0); totalComm += (b.totalCommission||0); });
  document.getElementById('sumBands').textContent = allStats.length;
  document.getElementById('sumPay').textContent   = fmt(totalPay);
  document.getElementById('sumComm').textContent  = fmt(totalComm);
}

function renderTable() {
  if (!filtered.length) {
    document.getElementById('tableWrap').innerHTML =
      '<div class="empty-state"><div class="empty-icon">&#127928;</div><p>No band booking data found.</p></div>';
    return;
  }
  var h = '<table><thead><tr>' +
    '<th style="width:36px;">#</th>' +
    '<th>Band</th>' +
    '<th class="num">Bookings</th>' +
    '<th class="num">Band Pay</th>' +
    '<th class="num">My Commission</th>' +
    '</tr></thead><tbody>';

  filtered.forEach(function(b, idx) {
    var rankClass = idx === 0 ? 'gold-r' : idx === 1 ? 'silver-r' : idx === 2 ? 'bronze-r' : '';
    h += '<tr>';
    h += '<td><span class="rank-badge ' + rankClass + '">' + (idx+1) + '</span></td>';
    h += '<td><div class="band-name">' + esc(b.bandName) + '</div>';
    if (b.lastBooked) h += '<div class="last-booked">Last booked: ' + esc(b.lastBooked) + '</div>';
    if (b.commPct)    h += '<div class="comm-pct">' + esc(String(b.commPct)) + '% commission rate</div>';
    h += '</td>';
    h += '<td class="num">' + (b.bookingCount||0) + '</td>';
    h += '<td class="num">' + fmt(b.totalPay) + '</td>';
    h += '<td class="num" style="color:var(--green);font-weight:700;">' + fmt(b.totalCommission) + '</td>';
    h += '</tr>';
  });

  h += '</tbody></table>';
  document.getElementById('tableWrap').innerHTML = h;
}

function filterTable() {
  var q = document.getElementById('searchBox').value.toLowerCase();
  filtered = q
    ? allStats.filter(function(b){ return (b.bandName||'').toLowerCase().indexOf(q) !== -1; })
    : allStats.slice();
  sortTable(true);
}

function sortTable(skipFilter) {
  var by = document.getElementById('sortSelect').value;
  filtered.sort(function(a, b) {
    if (by === 'bookings')   return (b.bookingCount||0)    - (a.bookingCount||0);
    if (by === 'pay')        return (b.totalPay||0)        - (a.totalPay||0);
    if (by === 'commission') return (b.totalCommission||0) - (a.totalCommission||0);
    return (a.bandName||'').localeCompare(b.bandName||'');
  });
  renderTable();
}

function fmt(n) { return '$' + (n||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0}); }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function goBack() { window.location.href = 'agent-dashboard.html'; }
