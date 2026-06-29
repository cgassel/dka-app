// ============================================================================
// add-band.js — logic for add-band.html
// Converted from google.script.run to callApi() (see api.js).
// agentId comes from sessionStorage instead of getCurrentAgentId().
// Note: the original nav-overlay pattern existed to work around Apps
// Script's sandboxed iframe restriction on async navigation. GitHub Pages
// has no such restriction, so we navigate directly with window.location.href.
// ============================================================================

var agentId = sessionStorage.getItem('dka_id');

(function checkSession() {
  if (!sessionStorage.getItem('dka_role') || !agentId) {
    window.location.href = 'index.html';
  }
})();

function toggleRoster() {
  var checked = document.getElementById('onRoster').checked;
  var wrap    = document.getElementById('rosterWrap');
  if (checked) wrap.classList.add('active');
  else         wrap.classList.remove('active');
}

document.getElementById('typicalDraw').addEventListener('input', function() {
  var draw = parseInt(this.value) || 0;
  var rating = draw >= 150 ? 'A (150+)' : draw >= 75 ? 'B (75+)' : draw >= 40 ? 'C (40+)' : draw >= 25 ? 'D (25+)' : 'Unrated';
  document.getElementById('bandRating').value = rating;
});

function getSelectedGenres() {
  var checked = document.querySelectorAll('#genreGrid input[type="checkbox"]:checked');
  var genres = [];
  checked.forEach(function(cb) { genres.push(cb.value); });
  return genres;
}

function updateGenreDisplay() {
  var genres = getSelectedGenres();
  var grid   = document.getElementById('genreGrid');
  var disp   = document.getElementById('genreSelectedDisplay');
  if (genres.length === 0) {
    disp.textContent = '';
    grid.classList.remove('has-selection');
  } else {
    disp.textContent = '✓ Selected: ' + genres.join(', ');
    grid.classList.add('has-selection');
  }
}

function updateCommissionPreview() {
  var pctRaw    = parseFloat(document.getElementById('agencyCommission').value);
  var noSound   = parseFloat(document.getElementById('payRateNoSound').value)   || 0;
  var withSound = parseFloat(document.getElementById('payRateWithSound').value) || 0;
  var priv      = parseFloat(document.getElementById('privatePartyRate').value) || 0;
  var preview   = document.getElementById('commissionPreview');
  if (isNaN(pctRaw) || pctRaw <= 0 || (noSound === 0 && withSound === 0)) {
    preview.style.display = 'none'; return;
  }
  var pct = Math.min(Math.max(pctRaw, 0), 100);
  function fmt(val)  { return '$' + val.toLocaleString('en-US', {minimumFractionDigits:0, maximumFractionDigits:0}); }
  function earn(pay) { return fmt(Math.round(pay * pct / 100)); }
  document.getElementById('prevPayNoSound').textContent    = noSound   > 0 ? fmt(noSound)   : '—';
  document.getElementById('prevEarnNoSound').textContent   = noSound   > 0 ? earn(noSound)  : '—';
  document.getElementById('prevPayWithSound').textContent  = withSound > 0 ? fmt(withSound) : '—';
  document.getElementById('prevEarnWithSound').textContent = withSound > 0 ? earn(withSound): '—';
  var privRow = ['prevLabelPrivate','prevPayPrivate','prevEarnPrivate'].map(function(id){ return document.getElementById(id); });
  if (priv > 0) {
    privRow.forEach(function(el){ el.style.display = ''; });
    document.getElementById('prevPayPrivate').textContent  = fmt(priv);
    document.getElementById('prevEarnPrivate').textContent = earn(priv);
  } else {
    privRow.forEach(function(el){ el.style.display = 'none'; });
  }
  preview.style.display = 'block';
}

function getBandSize() {
  var radios = document.querySelectorAll('input[name="bandSize"]');
  for (var i = 0; i < radios.length; i++) {
    if (radios[i].checked) return radios[i].value;
  }
  return '';
}

async function handleSubmit(event) {
  event.preventDefault();

  var bandSize = getBandSize();
  if (!bandSize) {
    showError('Please select a band size.');
    return false;
  }

  var genres = getSelectedGenres();
  if (genres.length === 0) {
    showError('Please select at least one genre.');
    return false;
  }

  document.getElementById('successMsg').style.display  = 'none';
  document.getElementById('errorMsg').style.display    = 'none';
  var submitBtn = document.getElementById('submitBtn');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Saving...'; }
  document.getElementById('addBandForm').style.display = 'none';
  document.getElementById('buttonGroup').style.display = 'none';
  document.getElementById('loading').style.display     = 'block';

  var bandData = {
    bandName:          document.getElementById('bandName').value,
    contactName:       document.getElementById('contactName').value,
    nameOnW9:          document.getElementById('nameOnW9').value,
    w9Current:         document.getElementById('w9Current').value,
    email:             document.getElementById('email').value,
    phone:             document.getElementById('phone').value,
    payRateNoSound:    parseFloat(document.getElementById('payRateNoSound').value),
    payRateWithSound:  parseFloat(document.getElementById('payRateWithSound').value),
    privatePartyRate:  parseFloat(document.getElementById('privatePartyRate').value) || 0,
    agencyCommission:  parseFloat(document.getElementById('agencyCommission').value) || 0,
    genre:             genres.join(', '),
    numMembers:        parseInt(document.getElementById('numMembers').value),
    typicalDraw:       parseInt(document.getElementById('typicalDraw').value),
    canTravel:         document.getElementById('canTravel').value,
    maxTravelDistance: parseInt(document.getElementById('maxTravelDistance').value) || 0,
    promoVideo:        document.getElementById('promoVideo').value,
    socialMedia:       document.getElementById('socialMedia').value,
    instagram:         document.getElementById('instagram').value,
    website:           document.getElementById('website').value,
    hometown:          document.getElementById('hometown').value,
    bandSize:          bandSize,
    onRoster:          document.getElementById('onRoster').checked ? 'Yes' : 'No',
    notes:             document.getElementById('notes').value
  };

  try {
    await callApi('api_addBand', [bandData, agentId, 'Agent ' + agentId]);
    document.getElementById('loading').style.display = 'none';
    document.getElementById('successMsg').style.display = 'block';
    window.scrollTo(0, 0);
    setTimeout(goToDashboard, 2000);
  } catch (error) {
    document.getElementById('loading').style.display     = 'none';
    document.getElementById('addBandForm').style.display = 'block';
    document.getElementById('buttonGroup').style.display = 'flex';
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Add Band'; }
    showError(error.message);
  }

  return false;
}

function showError(msg) {
  var el = document.getElementById('errorMsg');
  el.style.display = 'block';
  el.innerHTML = '<strong>Error:</strong> ' + msg;
  window.scrollTo(0, 0);
}

function addAnother() {
  document.getElementById('successMsg').style.display        = 'none';
  document.getElementById('addBandForm').style.display       = 'block';
  document.getElementById('buttonGroup').style.display       = 'flex';
  document.getElementById('addBandForm').reset();
  var submitBtn = document.getElementById('submitBtn');
  if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Add Band'; }
  document.getElementById('bandRating').value                = '';
  document.getElementById('commissionPreview').style.display = 'none';
  document.getElementById('genreSelectedDisplay').textContent = '';
  document.getElementById('genreGrid').classList.remove('has-selection');
  document.getElementById('onRoster').checked = false;
  document.getElementById('rosterWrap').classList.remove('active');
  window.scrollTo(0, 0);
}

function goToDashboard() {
  window.location.href = 'agent-dashboard.html';
}
