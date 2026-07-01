// ============================================================================
// venue-booking-request.js — logic for venue-booking-request.html
// Converted from google.script.run to callApi() (see api.js).
// venueId read from ?vid= URL param or sessionStorage.
// ============================================================================

var venueId      = null;
var matchedBands = [];
var currentRequestData = null;

window.onload = function() {
  var urlParams = new URLSearchParams(window.location.search);
  var vidParam  = urlParams.get('vid') || sessionStorage.getItem('dka_id');
  if (!vidParam) { window.location.href = 'index.html'; return; }

  var today = new Date().toISOString().split('T')[0];
  document.getElementById('eventDate').min = today;

  callApi('getCurrentVenueById', [vidParam]).then(function(venue) {
    if (!venue) { alert('Session expired. Please log in again.'); window.location.href = 'index.html'; return; }
    venueId = venue.id;

    if (venue.preferredGenres) {
      var saved = venue.preferredGenres.split(',').map(function(g){ return g.trim().toLowerCase(); });
      document.querySelectorAll('.checkbox-group input[type="checkbox"]').forEach(function(cb){
        if (saved.indexOf(cb.value.toLowerCase()) !== -1) cb.checked = true;
      });
    }

    if (venue.payRateBudget) {
      var b = parseFloat(venue.payRateBudget);
      var sel = document.getElementById('budgetRange');
      if      (b <= 500)  sel.value = '0-500';
      else if (b <= 1000) sel.value = '500-1000';
      else if (b <= 1500) sel.value = '1000-1500';
      else if (b <= 2000) sel.value = '1500-2000';
      else                sel.value = '2000+';
    }

    if (venue.minBandRating) {
      document.getElementById('minRating').value = venue.minBandRating;
    }
  }).catch(function(e) {
    alert('Error loading venue: ' + e.message);
    window.location.href = 'index.html';
  });
};

function getSelectedGenres() {
  var genres = [];
  document.querySelectorAll('.checkbox-group input[type="checkbox"]:checked').forEach(function(cb){
    genres.push(cb.value);
  });
  return genres;
}

function showError(msg) {
  var el = document.getElementById('errorMsg');
  el.textContent = msg; el.style.display = 'block';
}

function handleSubmit(event) {
  event.preventDefault();

  var genres = getSelectedGenres();
  if (genres.length === 0) { showError('Please select at least one genre.'); return false; }

  document.getElementById('requestForm').style.display = 'none';
  document.getElementById('loading').style.display = 'block';
  document.getElementById('errorMsg').style.display = 'none';

  var requestData = {
    venueId:         venueId,
    eventDate:       document.getElementById('eventDate').value,
    eventType:       document.getElementById('eventType').value,
    startTime:       document.getElementById('startTime').value,
    endTime:         document.getElementById('endTime').value,
    budgetRange:     document.getElementById('budgetRange').value,
    genres:          genres,
    minRating:       document.getElementById('minRating').value,
    soundLights:     document.getElementById('soundLights').value,
    additionalNotes: document.getElementById('additionalNotes').value
  };
  currentRequestData = requestData;

  callApi('findAvailableBands', [requestData]).then(function(bands) {
    document.getElementById('loading').style.display = 'none';
    matchedBands = bands || [];
    displayResults(matchedBands, requestData);
  }).catch(function(error) {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('requestForm').style.display = 'block';
    showError('Error finding bands: ' + error.message);
  });

  return false;
}

function displayResults(bands, requestData) {
  document.getElementById('results').style.display = 'block';
  document.getElementById('results').scrollIntoView({ behavior:'smooth', block:'start' });

  if (!bands || bands.length === 0) {
    document.getElementById('noResults').style.display = 'block';
    document.getElementById('bandsList').innerHTML = '';
    document.getElementById('resultsCount').textContent = 'No bands match your criteria on ' + requestData.eventDate;
    return;
  }

  document.getElementById('noResults').style.display = 'none';
  document.getElementById('resultsTitle').textContent = bands.length + ' Band' + (bands.length > 1 ? 's' : '') + ' Available';
  document.getElementById('resultsCount').textContent = 'For ' + requestData.eventDate + ' · sorted by best match';

  var html = '';
  bands.forEach(function(band) {
    var ratingKey = (band.rating || 'U').charAt(0).toUpperCase();
    if (['A','B','C','D'].indexOf(ratingKey) === -1) ratingKey = 'U';

    var payNoSound   = parseFloat(band.payRateNoSound)   || 0;
    var payWithSound = parseFloat(band.payRateWithSound) || 0;
    var payPrivate   = parseFloat(band.privatePartyRate) || 0;
    var matchPct     = band.matchScore || 0;

    html += '<div class="band-card" id="card-' + band.id + '" onclick="toggleSelect(this)">';

    html += '<div class="band-card-header">';
    html += '<div class="band-name-block">';
    html += '<div class="band-name">' + esc(band.name) + '</div>';
    html += '<span class="band-genre-tag">' + esc(band.genre) + '</span>';
    if (band.hometown) html += '<div class="band-hometown">&#128205; ' + esc(band.hometown) + '</div>';
    html += '</div>';
    html += '<div class="band-badges">';
    html += '<span class="badge badge-rating-' + ratingKey + '">Rating ' + ratingKey + '</span>';
    if (matchPct >= 60) html += '<span class="badge badge-match">&#11088; ' + matchPct + '% Match</span>';
    html += '<span class="badge badge-available">&#10003; Available</span>';
    html += '</div></div>';

    html += '<div class="band-meta">';
    html += metaItem('Members', band.numMembers || '—');
    html += metaItem('Typical Draw', (band.typicalDraw || '—') + ' people');
    html += metaItem('Can Travel', band.canTravel || '—');
    if (band.maxTravelDistance > 0) html += metaItem('Max Distance', band.maxTravelDistance + ' mi');
    html += metaItem('W9 Status', band.w9Current || '—', w9Class(band.w9Current));
    html += '</div>';

    html += '<div class="band-rates">';
    html += rateBlock('Without Sound/Lights', payNoSound,   requestData.soundLights === 'Venue');
    html += rateBlock('With Sound/Lights',    payWithSound, requestData.soundLights === 'Band');
    if (payPrivate > 0) html += rateBlock('Private Party', payPrivate, false);
    html += '</div>';

    var hasLinks = band.promoVideo || band.socialMedia || band.website;
    if (hasLinks) {
      html += '<div class="band-links">';
      if (band.promoVideo)  html += '<a class="band-link" href="'+esc(band.promoVideo)+'"  target="_blank" onclick="event.stopPropagation()">&#9654; Promo Video</a>';
      if (band.socialMedia) html += '<a class="band-link" href="'+esc(band.socialMedia)+'" target="_blank" onclick="event.stopPropagation()">&#128101; Social Media</a>';
      if (band.website)     html += '<a class="band-link" href="'+esc(band.website)+'"     target="_blank" onclick="event.stopPropagation()">&#127760; Website</a>';
      html += '</div>';
    }

    if (band.canTravel && band.canTravel !== 'No') {
      html += '<div class="band-travel">&#128661; This band is available to travel';
      if (band.maxTravelDistance > 0) html += ' up to ' + band.maxTravelDistance + ' miles';
      html += '</div>';
    }

    if (band.contact || band.email || band.phone) {
      html += '<div class="band-admin">';
      if (band.contact) html += '<span class="admin-item"><strong>Contact:</strong> ' + esc(band.contact) + '</span>';
      if (band.email)   html += '<span class="admin-item"><strong>Email:</strong> ' + esc(band.email) + '</span>';
      if (band.phone)   html += '<span class="admin-item"><strong>Phone:</strong> ' + esc(band.phone) + '</span>';
      html += '</div>';
    }

    html += '<div class="band-card-footer">';
    if (band.matchReasons && band.matchReasons.length > 0) {
      html += '<div class="match-reasons">';
      band.matchReasons.forEach(function(r){ html += '<span class="reason-chip">' + esc(r) + '</span>'; });
      html += '</div>';
    } else { html += '<div></div>'; }
    html += '<button class="request-btn" id="reqBtn-' + band.id + '" onclick="event.stopPropagation(); requestBooking(' + band.id + ', \'' + requestData.eventDate + '\')">Request Booking</button>';
    html += '</div>';

    html += '</div>';
  });

  document.getElementById('bandsList').innerHTML = html;
}

function metaItem(label, value, cssClass) {
  return '<div class="meta-item"><div class="meta-label">' + label + '</div><div class="meta-value ' + (cssClass||'') + '">' + esc(String(value)) + '</div></div>';
}

function rateBlock(label, pay, isActive) {
  return '<div class="rate-block' + (isActive ? ' rate-highlight' : '') + '">'
       + '<div class="rate-label">' + label + (isActive ? ' &#9733;' : '') + '</div>'
       + '<div class="rate-value">' + (pay > 0 ? '$' + pay.toLocaleString() : '—') + '</div>'
       + '</div>';
}

function w9Class(status) {
  if (!status) return '';
  var s = status.toLowerCase();
  if (s === 'yes') return 'w9-yes';
  if (s === 'no')  return 'w9-no';
  return 'w9-pend';
}

function esc(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function toggleSelect(card) { card.classList.toggle('selected'); }

function newSearch() {
  document.getElementById('results').style.display = 'none';
  document.getElementById('requestForm').style.display = 'block';
  window.scrollTo({ top:0, behavior:'smooth' });
}

function requestBooking(bandId, eventDate) {
  var band = matchedBands.find(function(b){ return b.id == bandId; });
  if (!band) return;

  var btn = document.getElementById('reqBtn-' + bandId);
  if (btn && btn.classList.contains('sent')) return;

  if (!confirm('Request booking for ' + band.name + ' on ' + eventDate + '?\n\nThis will notify your booking agent to confirm the date.')) return;

  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

  var venueName = (window._venueName) || 'Your Venue';
  callApi('api_sendBandRequest', [venueId, venueName, String(bandId), band.name, eventDate, '']).then(function(r) {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '&#10003; Requested';
      btn.classList.add('sent');
    }
    alert('Booking request sent! Your booking agent will be in touch to confirm.');
  }).catch(function(err) {
    if (btn) { btn.disabled = false; btn.textContent = 'Request Booking'; }
    alert('Error sending request: ' + err.message);
  });
}

function goBackToCalendar() {
  window.location.href = 'venue-calendar.html' + (venueId ? '?vid=' + venueId : '');
}

function logout() {
  callApi('logoutVenue', []).finally(function() {
    sessionStorage.removeItem('dka_role');
    sessionStorage.removeItem('dka_id');
    window.location.href = 'index.html';
  });
}
