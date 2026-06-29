// ============================================================================
// add-venue.js — logic for add-venue.html
// Converted from google.script.run to callApi() (see api.js).
// agentId comes from sessionStorage instead of getCurrentAgentId().
// ============================================================================

var geocodeTimeout = null;
var agentId = sessionStorage.getItem('dka_id');

(function checkSession() {
  if (!sessionStorage.getItem('dka_role') || !agentId) {
    window.location.href = 'index.html';
  }
})();

function updateVenueRating() {
  var cap = parseInt(document.getElementById('capacity').value) || 0;
  var badge = document.getElementById('ratingBadge');
  var desc  = document.getElementById('ratingDesc');
  var rating = '';

  if      (cap >= 300) { rating = 'A'; desc.innerHTML = '<strong>A-Tier Venue</strong><br>300+ capacity'; badge.style.background = '#A07018'; }
  else if (cap >= 200) { rating = 'B'; desc.innerHTML = '<strong>B-Tier Venue</strong><br>200–299 capacity'; badge.style.background = '#C8960C'; }
  else if (cap >= 100) { rating = 'C'; desc.innerHTML = '<strong>C-Tier Venue</strong><br>100–199 capacity'; badge.style.background = '#7CB342'; }
  else if (cap >    0) { rating = 'D'; desc.innerHTML = '<strong>D-Tier Venue</strong><br>&lt;100 capacity'; badge.style.background = '#D4A017'; }
  else                 { rating = '–'; desc.innerHTML = '<strong>Enter capacity</strong><br>to calculate'; badge.style.background = '#9e9e9e'; }

  badge.textContent = rating;
}

function updateBudgetDisplay() {
  var val = parseFloat(document.getElementById('payRateBudget').value) || 0;
  if (val > 0) {
    document.getElementById('budgetHelp').textContent =
      'Bands whose pay rate is ≤ $' + val.toLocaleString() + ' will be suggested for this venue';
  } else {
    document.getElementById('budgetHelp').textContent = 'Only bands whose rate falls within this budget will be shown';
  }
  updatePrefSummary();
}

function updateDrawDisplay() {
  var val = parseInt(document.getElementById('minDrawSlider').value);
  document.getElementById('minDrawVal').textContent = val > 0 ? val + '+' : 'Any';
  updatePrefSummary();
}

function triggerGeocode() {
  if (geocodeTimeout) clearTimeout(geocodeTimeout);
  var addr  = document.getElementById('address').value.trim();
  var city  = document.getElementById('city').value.trim();
  var state = document.getElementById('state').value.trim();
  if (!addr || !city || !state) return;

  geocodeTimeout = setTimeout(function() {
    var full = addr + ', ' + city + ', ' + state;
    var s = document.getElementById('geocodeStatus');
    s.className = 'geocode-status loading';
    s.textContent = '📍 Finding coordinates…';

    callApi('geocodeAddress', [full]).then(function(result) {
      if (result && result.lat && result.lng) {
        document.getElementById('latitude').value  = result.lat;
        document.getElementById('longitude').value = result.lng;
        s.className = 'geocode-status success';
        s.textContent = '✓ Coordinates found: ' + result.lat.toFixed(4) + ', ' + result.lng.toFixed(4);
      } else {
        s.className = 'geocode-status error';
        s.textContent = '⚠ Could not find coordinates — venue will not appear on map';
        document.getElementById('latitude').value  = '';
        document.getElementById('longitude').value = '';
      }
    }).catch(function(err) {
      s.className = 'geocode-status error';
      s.textContent = '⚠ Geocoding error: ' + err.message;
    });
  }, 900);
}

document.querySelectorAll('[name="genres"],[name="bandSizes"],[name="prefDays"],[name="minRating"],[name="travelPref"]')
  .forEach(function(el) { el.addEventListener('change', updatePrefSummary); });

function updatePrefSummary() {
  var chips = [];
  var budget = parseFloat(document.getElementById('payRateBudget').value) || 0;
  var draw   = parseInt(document.getElementById('minDrawSlider').value);

  document.querySelectorAll('[name="genres"]:checked').forEach(function(el) {
    chips.push({ label: el.value, cls: '' });
  });

  if (budget > 0) chips.push({ label: '≤ $' + budget.toLocaleString() + '/show', cls: 'teal' });
  if (draw > 0) chips.push({ label: 'Min draw: ' + draw, cls: 'teal' });

  var rat = document.querySelector('[name="minRating"]:checked');
  if (rat && rat.value) chips.push({ label: 'Rating ' + rat.value + '+', cls: 'green' });

  document.querySelectorAll('[name="bandSizes"]:checked').forEach(function(el) {
    chips.push({ label: el.parentElement.textContent.trim(), cls: 'green' });
  });

  var days = [];
  document.querySelectorAll('[name="prefDays"]:checked').forEach(function(el) { days.push(el.value.substring(0,3)); });
  if (days.length) chips.push({ label: days.join('/'), cls: 'gold' });

  var trav = document.querySelector('[name="travelPref"]:checked');
  if (trav && trav.value !== 'Any') chips.push({ label: trav.value, cls: 'gold' });

  var summary = document.getElementById('prefSummary');
  var chipsEl = document.getElementById('prefChips');

  if (chips.length === 0) {
    summary.style.display = 'none';
    return;
  }

  summary.style.display = 'block';
  chipsEl.innerHTML = chips.map(function(c) {
    return '<span class="pref-chip ' + c.cls + '">' + c.label + '</span>';
  }).join('');
}

function collectPreferences() {
  var genres = [];
  document.querySelectorAll('[name="genres"]:checked').forEach(function(el) { genres.push(el.value); });

  var bandSizes = [];
  document.querySelectorAll('[name="bandSizes"]:checked').forEach(function(el) { bandSizes.push(el.value); });

  var prefDays = [];
  document.querySelectorAll('[name="prefDays"]:checked').forEach(function(el) { prefDays.push(el.value); });

  var minRating = (document.querySelector('[name="minRating"]:checked') || {}).value || '';
  var travelPref = (document.querySelector('[name="travelPref"]:checked') || {}).value || 'Any';
  var minDraw    = parseInt(document.getElementById('minDrawSlider').value) || 0;

  return {
    genres:     genres.join(','),
    bandSizes:  bandSizes.join(','),
    prefDays:   prefDays.join(','),
    minRating:  minRating,
    travelPref: travelPref,
    minDraw:    minDraw,
    prefNotes:  document.getElementById('prefNotes').value
  };
}

async function handleSubmit(event) {
  event.preventDefault();

  var genres = document.querySelectorAll('[name="genres"]:checked');
  if (genres.length === 0) {
    var err = document.getElementById('errorMsg');
    err.style.display = 'block';
    err.textContent = 'Please select at least one preferred genre.';
    window.scrollTo({ top: err.offsetTop - 20, behavior: 'smooth' });
    return false;
  }

  document.getElementById('successMsg').style.display = 'none';
  document.getElementById('errorMsg').style.display   = 'none';
  document.getElementById('addVenueForm').style.display = 'none';
  document.getElementById('loading').style.display   = 'block';

  var prefs = collectPreferences();

  var venueData = {
    venueName:      document.getElementById('venueName').value,
    contactName:    document.getElementById('contactName').value,
    email:          document.getElementById('email').value,
    phone:          document.getElementById('phone').value,
    address:        document.getElementById('address').value,
    city:           document.getElementById('city').value,
    state:          document.getElementById('state').value,
    zip:            document.getElementById('zip').value,
    latitude:       parseFloat(document.getElementById('latitude').value)  || '',
    longitude:      parseFloat(document.getElementById('longitude').value) || '',
    capacity:       parseInt(document.getElementById('capacity').value),
    payRateBudget:  parseFloat(document.getElementById('payRateBudget').value),
    hasSound:       document.getElementById('hasSound').value,
    hasLighting:    document.getElementById('hasLighting').value,
    exclusivity:    document.getElementById('exclusivity').value,
    notes:          document.getElementById('notes').value,

    preferredGenres: prefs.genres,
    prefBandSizes:   prefs.bandSizes,
    prefDays:        prefs.prefDays,
    minBandRating:   prefs.minRating,
    travelPref:      prefs.travelPref,
    minDraw:         prefs.minDraw,
    prefNotes:       prefs.prefNotes
  };

  try {
    await callApi('api_addVenue', [venueData, agentId, 'Agent ' + agentId]);
    document.getElementById('loading').style.display = 'none';
    document.getElementById('successMsg').style.display = 'block';
    window.scrollTo(0, 0);
    setTimeout(goToDashboard, 2000);
  } catch (error) {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('addVenueForm').style.display = 'block';
    document.getElementById('errorMsg').style.display = 'block';
    document.getElementById('errorMsg').textContent = 'Error: ' + error.message;
  }

  return false;
}

function addAnother() {
  document.getElementById('successMsg').style.display   = 'none';
  document.getElementById('addVenueForm').style.display = 'block';
  document.getElementById('addVenueForm').reset();
  document.getElementById('ratingBadge').textContent    = '–';
  document.getElementById('ratingDesc').innerHTML       = '<strong>Enter capacity</strong><br>auto-calculated';
  document.getElementById('geocodeStatus').className    = 'geocode-status';
  document.getElementById('geocodeStatus').textContent  = '';
  document.getElementById('latitude').value  = '';
  document.getElementById('longitude').value = '';
  document.getElementById('minDrawVal').textContent = 'Any';
  document.getElementById('prefSummary').style.display = 'none';
  window.scrollTo(0, 0);
}

function goToDashboard() {
  window.location.href = 'agent-dashboard.html';
}
