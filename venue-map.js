// ============================================================================
// venue-map.js — logic for venue-map.html
// Converted from google.script.run to callApi() (see api.js).
// agentId comes from sessionStorage instead of being passed as empty strings.
// ============================================================================

var map;
var allVenues = [];
var filteredVenues = [];
var markers = {};
var activeFilters = { exclusive: true, shared: true, competitor: true, noagency: true };
var activeVenueId = null;
var agentId = sessionStorage.getItem('dka_id');

var COLORS = {
  exclusive: '#2E7D32',
  shared: '#F9A825',
  competitor: '#D32F2F',
  noagency: '#1565C0',
  unknown: '#757575'
};

window.onload = function() {
  if (!sessionStorage.getItem('dka_role') || !agentId) {
    window.location.href = 'index.html';
    return;
  }

  try {
    map = L.map('map', {
      center: [38.627, -90.199],
      zoom: 8,
      zoomControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors © CARTO',
      maxZoom: 19
    }).addTo(map);

    callApi('api_getVenuesFullData', []).then(function(venues) {
      if (!venues || venues.length === 0) {
        document.getElementById('loadingOverlay').innerHTML =
          '<div style="color:#F9A825;font-family:Inter;font-size:1.2rem;letter-spacing:2px;text-transform:uppercase;">No Venues Found<br><small style="font-size:0.9rem;margin-top:10px;display:block;">Add venues with coordinates to see them on the map</small></div>';
        document.getElementById('venueList').innerHTML = '<div class="no-venues">No venues in directory</div>';
        return;
      }
      allVenues = venues;
      updateStats(venues);
      filterAndRender();
      document.getElementById('loadingOverlay').classList.add('hidden');
    }).catch(function(error) {
      document.getElementById('loadingOverlay').innerHTML =
        '<div style="color:#D32F2F;font-family:Inter;font-size:1.2rem;letter-spacing:2px;text-transform:uppercase;">Error Loading Venues<br><small style="font-size:0.9rem;margin-top:10px;display:block;">' + error.message + '</small></div>';
    });
  } catch (e) {
    document.getElementById('loadingOverlay').innerHTML =
      '<div style="color:#D32F2F;font-family:Inter;font-size:1.2rem;letter-spacing:2px;text-transform:uppercase;">Map Error<br><small style="font-size:0.9rem;margin-top:10px;display:block;">' + e.message + '</small></div>';
  }
};

function getVenueCategory(exclusivity) {
  if (!exclusivity) return 'unknown';
  var e = exclusivity.toLowerCase();
  if (e.indexOf('exclusive') !== -1 && e.indexOf('competitor') === -1) return 'exclusive';
  if (e.indexOf('shared') !== -1) return 'shared';
  if (e.indexOf('competitor') !== -1) return 'competitor';
  if (e.indexOf('no agency') !== -1) return 'noagency';
  return 'unknown';
}

function createMarkerIcon(category, size) {
  size = size || 14;
  var color = COLORS[category] || COLORS.unknown;

  return L.divIcon({
    className: '',
    html: '<div style="' +
      'width:' + size + 'px;' +
      'height:' + size + 'px;' +
      'background:' + color + ';' +
      'border-radius:50%;' +
      'border:2px solid rgba(255,255,255,0.7);' +
      'box-shadow: 0 0 8px ' + color + ', 0 0 16px ' + color + '40;' +
      'cursor:pointer;' +
      'transition: transform 0.2s;' +
      '"></div>',
    iconSize: [size, size],
    iconAnchor: [size/2, size/2],
    popupAnchor: [0, -size/2]
  });
}

function filterAndRender() {
  var search = document.getElementById('panelSearch').value.toLowerCase();

  Object.values(markers).forEach(function(m) { map.removeLayer(m); });
  markers = {};

  filteredVenues = allVenues.filter(function(venue) {
    var category = getVenueCategory(venue.exclusivity);
    if (!activeFilters[category]) return false;
    if (search) {
      var str = (venue.name + ' ' + venue.city + ' ' + venue.state).toLowerCase();
      if (str.indexOf(search) === -1) return false;
    }
    return true;
  });

  filteredVenues.forEach(function(venue) {
    if (!venue.latitude || !venue.longitude) return;

    var lat = parseFloat(venue.latitude);
    var lng = parseFloat(venue.longitude);
    if (isNaN(lat) || isNaN(lng)) return;

    var category = getVenueCategory(venue.exclusivity);
    var marker = L.marker([lat, lng], {
      icon: createMarkerIcon(category, activeVenueId === venue.id ? 20 : 14)
    });

    var popupContent = '<div class="popup-name">' + venue.name + '</div>' +
      '<div class="popup-row"><strong>City:</strong>' + (venue.city || '-') + ', ' + (venue.state || '') + '</div>' +
      '<div class="popup-row"><strong>Capacity:</strong>' + (venue.capacity || '-') + '</div>' +
      '<div class="popup-row"><strong>Budget:</strong>' + (venue.payRateBudget ? '$' + venue.payRateBudget : '-') + '</div>' +
      '<div class="popup-row"><strong>Contact:</strong>' + (venue.contact || '-') + '</div>' +
      '<div>' + getPopupBadge(category) + '</div>';

    marker.bindPopup(popupContent, { maxWidth: 220 });

    marker.on('click', function() {
      selectVenue(venue.id);
    });

    marker.addTo(map);
    markers[venue.id] = marker;
  });

  renderList();
  document.getElementById('venueCount').textContent = filteredVenues.length + ' venues';
}

function getPopupBadge(category) {
  var labels = {
    exclusive: '🟢 Exclusive',
    shared: '🟡 Shared',
    competitor: '🔴 Competitor',
    noagency: '🔵 No Agency',
    unknown: '⚪ Unknown'
  };
  var colors = {
    exclusive: COLORS.exclusive,
    shared: COLORS.shared,
    competitor: COLORS.competitor,
    noagency: COLORS.noagency,
    unknown: COLORS.unknown
  };
  return '<span class="popup-badge" style="background:' + (colors[category] || '#757575') + '20;border:1px solid ' + (colors[category] || '#757575') + ';color:white;">' + (labels[category] || 'Unknown') + '</span>';
}

function renderList() {
  var list = document.getElementById('venueList');

  if (filteredVenues.length === 0) {
    list.innerHTML = '<div class="no-venues">No venues match your filters</div>';
    return;
  }

  var html = '';
  filteredVenues.forEach(function(venue) {
    var category = getVenueCategory(venue.exclusivity);
    var color = COLORS[category] || COLORS.unknown;
    var ratingColor = venue.rating && venue.rating.startsWith('A') ? '#2E7D32' :
                      venue.rating && venue.rating.startsWith('B') ? '#7CB342' :
                      venue.rating && venue.rating.startsWith('C') ? '#D4A017' : '#D32F2F';
    var isActive = activeVenueId === venue.id;

    html += '<div class="venue-item ' + (isActive ? 'active' : '') + '" onclick="selectVenue(\'' + venue.id + '\')" id="item-' + venue.id + '">';
    html += '<div class="venue-dot" style="background:' + color + ';"></div>';
    html += '<div class="venue-item-info">';
    html += '<div class="venue-item-name">' + venue.name + '</div>';
    html += '<div class="venue-item-meta">' + (venue.city || '-') + ', ' + (venue.state || '') + ' · Cap: ' + (venue.capacity || '-') + '</div>';
    html += '</div>';
    if (venue.rating) {
      html += '<div class="venue-rating-badge" style="background:' + ratingColor + '30;color:' + ratingColor + ';">' + venue.rating.charAt(0) + '</div>';
    }
    var needsContact = (category === 'competitor' || category === 'noagency' || category === 'unknown');
    if (needsContact) {
      var daysSince = getDaysSinceContact(venue.lastContactDate);
      if (daysSince === null || daysSince > 30) {
        var overdue = daysSince === null || daysSince > 60;
        html += '<div class="contact-reminder' + (overdue ? ' overdue' : '') + '">';
        html += daysSince === null ? 'Never contacted' : daysSince + 'd ago';
        html += '</div>';
      }
    }
    html += '</div>';
  });

  list.innerHTML = html;
}

function selectVenue(venueId) {
  activeVenueId = venueId;

  var venue = allVenues.find(function(v) { return v.id == venueId; });
  if (!venue) return;

  renderList();

  var item = document.getElementById('item-' + venueId);
  if (item) item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  if (venue.latitude && venue.longitude) {
    var lat = parseFloat(venue.latitude);
    var lng = parseFloat(venue.longitude);
    if (!isNaN(lat) && !isNaN(lng)) {
      map.flyTo([lat, lng], 13, { duration: 1 });
      if (markers[venueId]) {
        setTimeout(function() {
          markers[venueId].openPopup();
        }, 800);
      }
    }
  }

  var category = getVenueCategory(venue.exclusivity);
  var color = COLORS[category] || COLORS.unknown;

  document.getElementById('detailName').textContent = venue.name;
  document.getElementById('detailCity').textContent = (venue.city || '-') + ', ' + (venue.state || '');
  document.getElementById('detailCapacity').textContent = venue.capacity || '-';
  document.getElementById('detailBudget').textContent = venue.payRateBudget ? '$' + venue.payRateBudget : '-';
  document.getElementById('detailRating').textContent = venue.rating || '-';
  document.getElementById('detailSound').textContent = venue.hasSound || '-';
  document.getElementById('detailLighting').textContent = venue.hasLighting || '-';
  document.getElementById('detailContact').textContent = venue.contact || '-';
  document.getElementById('detailPhone').textContent = venue.phone || '-';
  document.getElementById('detailBadge').innerHTML = getPopupBadge(category);

  var flyerSection  = document.getElementById('detailFlyerSection');
  var flyerStatus   = document.getElementById('flyerStatus');
  var lastContactEl = document.getElementById('lastContactNote');
  var flyerBtn      = document.getElementById('btnSendFlyer');
  var needsContact  = (category === 'competitor' || category === 'noagency' || category === 'unknown');

  if (needsContact) {
    flyerSection.style.display  = 'block';
    flyerStatus.textContent     = '';
    flyerStatus.className       = 'flyer-status';
    flyerBtn.disabled           = false;
    flyerBtn.textContent        = venue.email
      ? '\u2709 Send Dave Kalz Agency Flyer to ' + venue.contact
      : '\u2709 Send Flyer (no email on file)';
    flyerBtn.disabled           = !venue.email;

    var daysSince = getDaysSinceContact(venue.lastContactDate);
    if (daysSince === null) {
      lastContactEl.textContent = 'Never contacted';
    } else {
      lastContactEl.textContent = 'Last contacted ' + daysSince + ' days ago';
    }
  } else {
    flyerSection.style.display = 'none';
  }

  document.getElementById('venueDetail').classList.add('open');
}

function openVenueEdit() {
  var venue = allVenues.find(function(v) { return v.id == activeVenueId; });
  if (!venue) return;

  document.getElementById('vmEditId').value          = venue.id;
  document.getElementById('vmEditTitle').textContent = 'Edit: ' + venue.name;
  document.getElementById('vmEditName').value        = venue.name           || '';
  document.getElementById('vmEditContact').value     = venue.contact        || '';
  document.getElementById('vmEditPhone').value       = venue.phone          || '';
  document.getElementById('vmEditEmail').value       = venue.email          || '';
  document.getElementById('vmEditAddress').value     = venue.address        || '';
  document.getElementById('vmEditCity').value        = venue.city           || '';
  document.getElementById('vmEditState').value       = venue.state          || '';
  document.getElementById('vmEditZip').value         = venue.zip            || '';
  document.getElementById('vmEditCapacity').value    = venue.capacity       || '';
  document.getElementById('vmEditBudget').value      = venue.payRateBudget  || '';
  document.getElementById('vmEditSound').value       = venue.hasSound       || 'Yes';
  document.getElementById('vmEditLighting').value    = venue.hasLighting    || 'Yes';
  document.getElementById('vmEditExclusivity').value = venue.exclusivity    || 'Unknown';
  document.getElementById('vmEditGenres').value      = venue.preferredGenres|| '';
  document.getElementById('vmEditBandSizes').value   = venue.prefBandSizes  || '';
  document.getElementById('vmEditContactNotes').value= venue.lastContactNotes||'';
  document.getElementById('vmEditNotes').value       = venue.notes          || '';
  document.getElementById('vmEditError').style.display = 'none';

  document.getElementById('vmEditOverlay').classList.add('open');
}

function closeVenueEdit() {
  document.getElementById('vmEditOverlay').classList.remove('open');
}

async function saveVenueEdit() {
  var venueId  = document.getElementById('vmEditId').value;
  var saveBtn  = document.getElementById('vmEditSaveBtn');
  var errorDiv = document.getElementById('vmEditError');
  errorDiv.style.display = 'none';

  var venueName = document.getElementById('vmEditName').value.trim();
  if (!venueName) {
    errorDiv.textContent   = 'Venue name is required.';
    errorDiv.style.display = 'block';
    return;
  }

  var venueData = {
    venueName:         venueName,
    contactName:       document.getElementById('vmEditContact').value.trim(),
    phone:             document.getElementById('vmEditPhone').value.trim(),
    email:             document.getElementById('vmEditEmail').value.trim(),
    address:           document.getElementById('vmEditAddress').value.trim(),
    city:              document.getElementById('vmEditCity').value.trim(),
    state:             document.getElementById('vmEditState').value.trim(),
    zip:               document.getElementById('vmEditZip').value.trim(),
    capacity:          document.getElementById('vmEditCapacity').value,
    payRateBudget:     document.getElementById('vmEditBudget').value,
    hasSound:          document.getElementById('vmEditSound').value,
    hasLighting:       document.getElementById('vmEditLighting').value,
    exclusivity:       document.getElementById('vmEditExclusivity').value,
    preferredGenres:   document.getElementById('vmEditGenres').value.trim(),
    prefBandSizes:     document.getElementById('vmEditBandSizes').value.trim(),
    lastContactNotes:  document.getElementById('vmEditContactNotes').value.trim(),
    notes:             document.getElementById('vmEditNotes').value.trim()
  };

  saveBtn.textContent = 'Saving...';
  saveBtn.disabled    = true;

  try {
    await callApi('api_updateVenue', [venueId, venueData, agentId, 'Agent ' + agentId]);
    var venue = allVenues.find(function(v) { return v.id == venueId; });
    if (venue) {
      venue.name             = venueData.venueName;
      venue.contact          = venueData.contactName;
      venue.phone            = venueData.phone;
      venue.email            = venueData.email;
      venue.address          = venueData.address;
      venue.city             = venueData.city;
      venue.state            = venueData.state;
      venue.zip              = venueData.zip;
      venue.capacity         = venueData.capacity;
      venue.payRateBudget    = venueData.payRateBudget;
      venue.hasSound         = venueData.hasSound;
      venue.hasLighting      = venueData.hasLighting;
      venue.exclusivity      = venueData.exclusivity;
      venue.preferredGenres  = venueData.preferredGenres;
      venue.prefBandSizes    = venueData.prefBandSizes;
      venue.lastContactNotes = venueData.lastContactNotes;
      venue.notes            = venueData.notes;
    }
    closeVenueEdit();
    selectVenue(venueId);
    filterAndRender();
    saveBtn.textContent = 'Save Changes';
    saveBtn.disabled    = false;
  } catch (err) {
    errorDiv.textContent   = 'Error: ' + err.message;
    errorDiv.style.display = 'block';
    saveBtn.textContent    = 'Save Changes';
    saveBtn.disabled       = false;
  }
}

function getDaysSinceContact(dateStr) {
  if (!dateStr || dateStr === '' || dateStr === 'undefined') return null;
  try {
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    var diff = (new Date() - d) / (1000 * 60 * 60 * 24);
    return Math.floor(diff);
  } catch(e) { return null; }
}

function sendFlyer() {
  var venue = allVenues.find(function(v) { return v.id == activeVenueId; });
  if (!venue || !venue.email) return;
  var btn    = document.getElementById('btnSendFlyer');
  var status = document.getElementById('flyerStatus');
  btn.disabled     = true;
  btn.textContent  = 'Sending\u2026';
  status.textContent = '';
  status.className   = 'flyer-status';

  callApi('api_sendVenueFlyer', [activeVenueId]).then(function() {
    btn.textContent  = '\u2713 Flyer Sent!';
    status.textContent = 'Email sent to ' + venue.email;
    status.className   = 'flyer-status';
    venue.lastContactDate = new Date().toISOString().substring(0, 10);
    document.getElementById('lastContactNote').textContent = 'Last contacted today';
    renderList();
    setTimeout(function() {
      btn.disabled     = false;
      btn.textContent  = '\u2709 Send Dave Kalz Agency Flyer to ' + venue.contact;
    }, 5000);
  }).catch(function(err) {
    btn.disabled     = false;
    btn.textContent  = '\u2709 Send Dave Kalz Agency Flyer to ' + venue.contact;
    status.textContent = 'Error: ' + err.message;
    status.className   = 'flyer-status error';
  });
}

function logContactOnly() {
  if (!activeVenueId) return;
  var venue = allVenues.find(function(v) { return v.id == activeVenueId; });
  if (!venue) return;
  var status = document.getElementById('flyerStatus');
  status.textContent = 'Logging contact\u2026';

  callApi('api_logVenueContact', [activeVenueId, '', 'Contacted via map']).then(function() {
    venue.lastContactDate = new Date().toISOString().substring(0, 10);
    document.getElementById('lastContactNote').textContent = 'Last contacted today';
    status.textContent = 'Contact logged successfully';
    status.className   = 'flyer-status';
    renderList();
  }).catch(function(err) {
    status.textContent = 'Error: ' + err.message;
    status.className   = 'flyer-status error';
  });
}

function closeDetail() {
  activeVenueId = null;
  document.getElementById('venueDetail').classList.remove('open');
  renderList();
}

function toggleFilter(type) {
  activeFilters[type] = !activeFilters[type];
  var el = document.getElementById('leg-' + type);
  if (activeFilters[type]) {
    el.classList.remove('inactive');
  } else {
    el.classList.add('inactive');
  }
  filterAndRender();
}

function filterList() {
  filterAndRender();
}

function fitAllMarkers() {
  var points = [];
  filteredVenues.forEach(function(venue) {
    if (venue.latitude && venue.longitude) {
      var lat = parseFloat(venue.latitude);
      var lng = parseFloat(venue.longitude);
      if (!isNaN(lat) && !isNaN(lng)) {
        points.push([lat, lng]);
      }
    }
  });

  if (points.length > 0) {
    map.fitBounds(points, { padding: [40, 40] });
  }
}

function updateStats(venues) {
  document.getElementById('footerTotal').textContent = venues.length;
  document.getElementById('footerExclusive').textContent =
    venues.filter(function(v) { return getVenueCategory(v.exclusivity) === 'exclusive'; }).length;
  document.getElementById('footerShared').textContent =
    venues.filter(function(v) { return getVenueCategory(v.exclusivity) === 'shared'; }).length;
  document.getElementById('footerCompetitor').textContent =
    venues.filter(function(v) { return getVenueCategory(v.exclusivity) === 'competitor'; }).length;
  document.getElementById('footerNoAgency').textContent =
    venues.filter(function(v) { return getVenueCategory(v.exclusivity) === 'noagency'; }).length;
}

function goToDashboard() {
  window.location.href = 'agent-dashboard.html';
}
