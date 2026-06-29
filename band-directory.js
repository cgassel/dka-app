// ============================================================================
// band-directory.js — logic for band-directory.html
// Converted from google.script.run to callApi() (see api.js).
// agentId comes from sessionStorage instead of getCurrentAgentId().
// ============================================================================

var allBands = [], allAvailability = {}, filteredBands = [];
var sortColumn = 'name', sortDirection = 'asc';
var currentViewIndex = -1, editingBandId = null, isSaving = false;
var agentId = sessionStorage.getItem('dka_id');

var ALL_GENRES = ['Rock','Classic Rock','Blues','Jazz','Country','R&B/Soul','Folk','Alternative','Funk','Pop','Cover Band','Tribal Funk','Reggae','Hip-Hop','Metal','Other'];

function esc(v) {
  if (v===null||v===undefined) return '';
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function safeMoney(v) { if (!v||v==='0'||v==='') return '-'; return '$'+esc(v); }

window.onload = function() {
  if (!sessionStorage.getItem('dka_role') || !agentId) {
    window.location.href = 'index.html';
    return;
  }
  loadBands();
};

function loadBands() {
  var bl=false, al=false;
  function go() { if(bl&&al){updateStats(allBands);filterBands();} }
  callApi('api_getBandsFullData', []).then(function(b) {
    allBands = Array.isArray(b) ? b : [];
    bl = true; go();
  }).catch(function(e) {
    document.getElementById('tableWrapper').innerHTML = '<div class="empty-state"><h3>Error</h3><p>'+esc(e.message)+'</p></div>';
  });
  callApi('api_getAllBandAvailability', []).then(function(a) {
    allAvailability = a || {};
    al = true; go();
  }).catch(function() {
    allAvailability = {};
    al = true; go();
  });
}

function updateStats(bands) {
  document.getElementById('statTotal').textContent=bands.length;
  document.getElementById('statA').textContent=bands.filter(function(b){return b.rating&&b.rating.charAt(0)==='A';}).length;
  document.getElementById('statB').textContent=bands.filter(function(b){return b.rating&&b.rating.charAt(0)==='B';}).length;
  document.getElementById('statC').textContent=bands.filter(function(b){return b.rating&&b.rating.charAt(0)==='C';}).length;
  document.getElementById('statW9').textContent=bands.filter(function(b){return b.w9Current!=='Yes';}).length;
}

function filterBands() {
  var search=document.getElementById('searchBox').value.toLowerCase();
  var genre=document.getElementById('filterGenre').value;
  var rating=document.getElementById('filterRating').value;
  var size=document.getElementById('filterSize').value;
  var w9=document.getElementById('filterW9').value;
  var travel=document.getElementById('filterTravel').value;
  filteredBands=allBands.filter(function(b){
    if(search){var s=(b.name+' '+b.contact+' '+b.genre+' '+b.hometown).toLowerCase();if(s.indexOf(search)===-1)return false;}
    if(genre&&(!b.genre||b.genre.toLowerCase().indexOf(genre.toLowerCase())===-1))return false;
    if(rating){if(rating==='Unrated'){if(b.rating&&b.rating!=='Unrated')return false;}else{if(!b.rating||b.rating.charAt(0)!==rating)return false;}}
    if(size&&b.bandSize!==size)return false;
    if(w9&&b.w9Current!==w9)return false;
    if(travel&&b.canTravel!==travel)return false;
    return true;
  });
  sortBands();renderTable();
}

function sortBands() {
  filteredBands.sort(function(a,b){
    var vA=(a[sortColumn]||'').toString().toLowerCase();
    var vB=(b[sortColumn]||'').toString().toLowerCase();
    if(vA<vB)return sortDirection==='asc'?-1:1;
    if(vA>vB)return sortDirection==='asc'?1:-1;
    return 0;
  });
}
function setSort(col){sortDirection=(sortColumn===col&&sortDirection==='asc')?'desc':'asc';sortColumn=col;sortBands();renderTable();}
function sortTh(col,label){return '<th onclick="setSort(\''+col+'\')">'+label+' <span class="sort-icon">&#x21D5;</span></th>';}

function getSizeBadge(size){
  if(!size)return '-';
  var icons={'Solo':'&#127925;','Duo':'&#127926;','Trio':'&#127927;','Full Band':'&#127928;'};
  return '<span class="size-badge">'+(icons[size]||'')+' '+esc(size)+'</span>';
}
function getRatingBadge(r){
  if(!r)return '<span class="rating-u">Unrated</span>';
  var c=r.charAt(0);
  if(c==='A')return '<span class="rating-a">A</span>';
  if(c==='B')return '<span class="rating-b">B</span>';
  if(c==='C')return '<span class="rating-c">C</span>';
  if(c==='D')return '<span class="rating-d">D</span>';
  return '<span class="rating-u">Unrated</span>';
}
function getW9Badge(w9){
  if(w9==='Yes')return '<span class="w9-yes">&#10003; Yes</span>';
  if(w9==='Pending')return '<span class="w9-pending">&#x23F3; Pending</span>';
  return '<span class="w9-no">&#x2717; No</span>';
}
function getAvailabilityCell(bandId){
  var avail=allAvailability[bandId];
  if(!avail||!avail.dates||avail.dates.length===0)return '<span style="color:#ccc;font-size:0.8rem;">None</span>';
  var today=new Date();today.setHours(0,0,0,0);
  var future=avail.dates.filter(function(ds){return new Date(ds+'T00:00:00')>=today;});
  if(future.length===0)return '<span style="color:#e65100;font-size:0.78rem;">Expired</span>';
  var lu=avail.lastUpdated?new Date(avail.lastUpdated).toLocaleDateString():'';
  return '<span style="background:#e8f5e9;color:#2e7d32;padding:3px 8px;border-radius:10px;font-size:0.78rem;font-weight:700;" title="'+(lu?esc('Last updated: '+lu):'')+'">' +future.length+' date'+(future.length!==1?'s':'')+'</span>';
}

function renderTable() {
  document.getElementById('resultsCount').textContent='Showing '+filteredBands.length+' of '+allBands.length+' bands';
  if(filteredBands.length===0){document.getElementById('tableWrapper').innerHTML='<div class="empty-state"><h3>No bands found</h3><p>Try adjusting your search or filters</p></div>';return;}
  var html='<table><thead><tr>';
  html+=sortTh('name','Band Name');html+=sortTh('genre','Genre');html+=sortTh('bandSize','Size');
  html+=sortTh('rating','Rating');html+=sortTh('typicalDraw','Typical Draw');html+='<th>Pay Rate</th>';
  html+=sortTh('w9Current','W9');html+=sortTh('canTravel','Travel');html+=sortTh('hometown','Hometown');
  html+='<th>Avail.</th><th>Actions</th></tr></thead><tbody>';
  for(var i=0;i<filteredBands.length;i++){
    var b=filteredBands[i];
    html+='<tr>';
    html+='<td><strong>'+esc(b.name)+'</strong>'+(b.contact?'<br><small style="color:#666;">'+esc(b.contact)+'</small>':'')+'</td>';
    html+='<td>'+(b.genre?esc(b.genre):'-')+'</td>';
    html+='<td>'+getSizeBadge(b.bandSize)+'</td>';
    html+='<td>'+getRatingBadge(b.rating)+'</td>';
    html+='<td>'+(b.typicalDraw?esc(b.typicalDraw):'-')+'</td>';
    html+='<td>'+safeMoney(b.payRateNoSound)+' / '+safeMoney(b.payRateWithSound)+'</td>';
    html+='<td>'+getW9Badge(b.w9Current)+'</td>';
    html+='<td>'+(b.canTravel?esc(b.canTravel):'-')+'</td>';
    html+='<td>'+(b.hometown?esc(b.hometown):'-')+'</td>';
    html+='<td>'+getAvailabilityCell(String(b.id))+'</td>';
    html+='<td style="white-space:nowrap;"><button class="btn btn-primary btn-small" onclick="viewBand('+i+')" style="margin-right:3px;padding:4px 8px;font-size:0.72rem;">View</button><button class="btn btn-orange btn-small" onclick="openEdit('+i+')" style="margin-right:3px;padding:4px 8px;font-size:0.72rem;">Edit</button><button class="btn btn-delete btn-small" onclick="deleteBand('+i+')" style="padding:4px 8px;font-size:0.72rem;">Delete</button></td>';
    html+='</tr>';
  }
  html+='</tbody></table>';
  document.getElementById('tableWrapper').innerHTML=html;
}

function getEditSelectedGenres() {
  var checked = document.querySelectorAll('#eGenreGrid input[type="checkbox"]:checked');
  var genres = [];
  checked.forEach(function(cb){ genres.push(cb.value); });
  return genres;
}

function updateEditGenreDisplay() {
  var genres = getEditSelectedGenres();
  var grid   = document.getElementById('eGenreGrid');
  var disp   = document.getElementById('eGenreSelectedDisplay');
  if (genres.length === 0) {
    disp.textContent = '';
    grid.classList.remove('has-selection');
  } else {
    disp.textContent = '✓ Selected: ' + genres.join(', ');
    grid.classList.add('has-selection');
  }
}

function setEditGenres(genreString) {
  document.querySelectorAll('#eGenreGrid input[type="checkbox"]').forEach(function(cb){
    cb.checked = false;
  });
  if (!genreString) { updateEditGenreDisplay(); return; }
  var saved = genreString.split(',').map(function(g){ return g.trim().toLowerCase(); });
  document.querySelectorAll('#eGenreGrid input[type="checkbox"]').forEach(function(cb){
    if (saved.indexOf(cb.value.toLowerCase()) !== -1) cb.checked = true;
  });
  updateEditGenreDisplay();
}

function viewBand(index){
  currentViewIndex=index;
  var band=filteredBands[index];if(!band)return;
  document.getElementById('modalBandName').textContent=band.name||'';
  var html='';
  html+=section('Contact Information',[
    dRow('Contact',esc(band.contact)||'-'),
    dRow('Email',band.email?'<a class="link" href="mailto:'+esc(band.email)+'">'+esc(band.email)+'</a>':'-'),
    dRow('Phone',esc(band.phone)||'-'),dRow('W9 Name',esc(band.nameOnW9)||'-'),dRow('W9 Status',getW9Badge(band.w9Current))
  ]);
  html+=section('Performance Details',[
    dRow('Genre(s)',esc(band.genre)||'-'),dRow('Size',getSizeBadge(band.bandSize)),
    dRow('Members',esc(band.numMembers)||'-'),dRow('Typical Draw',esc(band.typicalDraw)||'-'),
    dRow('Rating',getRatingBadge(band.rating)),dRow('Hometown',esc(band.hometown)||'-')
  ]);
  var payRows=[dRow('Without Sound/Lights',safeMoney(band.payRateNoSound)),dRow('With Sound/Lights',safeMoney(band.payRateWithSound)),dRow('Private Party',safeMoney(band.privatePartyRate))];
  if(band.commission)payRows.push(dRow('Agency Commission',esc(band.commission)+'%'));
  html+=section('Pay Rates',payRows);
  html+=section('Travel',[dRow('Can Travel',esc(band.canTravel)||'-'),dRow('Max Distance',band.maxTravelDistance?esc(band.maxTravelDistance)+' miles':'-')]);
  var lr=[];
  if(band.promoVideo) lr.push(dRow('Promo Video','<a class="link" href="'+esc(band.promoVideo)+'" target="_blank">&#127916; Watch Video</a>'));
  if(band.socialMedia)lr.push(dRow('Facebook','<a class="link" href="'+esc(band.socialMedia)+'" target="_blank">&#128196; View Page</a>'));
  if(band.instagram)  lr.push(dRow('Instagram','<a class="insta-link" href="'+esc(band.instagram)+'" target="_blank">&#128247; Instagram</a>'));
  if(band.website)    lr.push(dRow('Website','<a class="link" href="'+esc(band.website)+'" target="_blank">&#127760; Visit Site</a>'));
  if(lr.length>0)html+=section('Links',lr);
  var avail=allAvailability[String(band.id)];
  html+='<div class="detail-section" style="border-left:4px solid #7CB342;padding-left:12px;"><div class="detail-section-title" style="color:#2e7d32;">Band Availability</div>';
  if(!avail||!avail.dates||avail.dates.length===0){html+='<p style="color:#aaa;font-style:italic;font-size:0.9rem;">No availability submitted yet.</p>';}
  else{
    var today=new Date();today.setHours(0,0,0,0);
    var future=avail.dates.filter(function(ds){return new Date(ds+'T00:00:00')>=today;}).sort();
    if(future.length===0){html+='<p style="color:#aaa;font-style:italic;font-size:0.9rem;">All submitted dates have passed.</p>';}
    else{
      html+='<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;">';
      future.forEach(function(ds){var lbl=new Date(ds+'T00:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});html+='<span style="background:#e8f5e9;color:#2e7d32;border:1.5px solid #a5d6a7;padding:4px 10px;border-radius:14px;font-size:0.78rem;font-weight:700;">'+esc(lbl)+'</span>';});
      html+='</div>';html+=dRow('Dates on File',future.length+' upcoming');
    }
    if(avail.lastUpdated)html+=dRow('Last Updated','<strong>'+esc(new Date(avail.lastUpdated).toLocaleString())+'</strong>');
    if(avail.note)html+=dRow('Band Note','<em style="color:#555;">'+esc(avail.note)+'</em>');
  }
  html+='</div>';
  if(band.notes){html+='<div class="detail-section"><div class="detail-section-title">Notes</div><p style="color:#333;line-height:1.6;">'+esc(band.notes)+'</p></div>';}
  document.getElementById('modalContent').innerHTML=html;
  var root=document.getElementById('viewModalRoot');root.classList.add('open');root.scrollTop=0;
}
function openEditFromView(){closeView();if(currentViewIndex>=0)openEdit(currentViewIndex);}
function closeView(){document.getElementById('viewModalRoot').classList.remove('open');}
function handleViewBackdrop(e){if(e.target===document.getElementById('viewModalRoot'))closeView();}

function openEdit(index){
  var band=filteredBands[index];if(!band)return;
  editingBandId=band.id;isSaving=false;
  document.getElementById('editSuccess').style.display='none';
  document.getElementById('editError').style.display='none';
  document.getElementById('editLoading').style.display='none';
  document.getElementById('editFormWrap').style.display='block';

  document.getElementById('eBandName').value=band.name||'';
  document.getElementById('eContactName').value=band.contact||'';
  document.getElementById('eNameOnW9').value=band.nameOnW9||'';
  document.getElementById('eEmail').value=band.email||'';
  document.getElementById('ePhone').value=band.phone||'';
  document.getElementById('eW9Current').value=band.w9Current||'No';
  document.getElementById('ePayRateNoSound').value=band.payRateNoSound||'';
  document.getElementById('ePayRateWithSound').value=band.payRateWithSound||'';
  document.getElementById('ePrivatePartyRate').value=band.privatePartyRate||'';
  document.getElementById('eAgencyCommission').value=band.commission||'';
  document.getElementById('eNumMembers').value=band.numMembers||'';
  document.getElementById('eTypicalDraw').value=band.typicalDraw||'';
  document.getElementById('eHometown').value=band.hometown||'';
  document.getElementById('eCanTravel').value=band.canTravel||'No';
  document.getElementById('eMaxTravelDistance').value=band.maxTravelDistance||'';
  document.getElementById('ePromoVideo').value=band.promoVideo||'';
  document.getElementById('eSocialMedia').value=band.socialMedia||'';
  document.getElementById('eInstagram').value=band.instagram||'';
  document.getElementById('eWebsite').value=band.website||'';
  document.getElementById('eNotes').value=band.notes||'';

  var radios=document.querySelectorAll('input[name="eBandSize"]');
  for(var i=0;i<radios.length;i++) radios[i].checked=(radios[i].value===band.bandSize);

  setEditGenres(band.genre);

  var root=document.getElementById('editModalRoot');root.classList.add('open');root.scrollTop=0;
}

function closeEdit(){document.getElementById('editModalRoot').classList.remove('open');}
function handleEditBackdrop(e){if(e.target===document.getElementById('editModalRoot'))closeEdit();}

function getEditBandSize(){
  var radios=document.querySelectorAll('input[name="eBandSize"]');
  for(var i=0;i<radios.length;i++){if(radios[i].checked)return radios[i].value;}
  return '';
}

async function submitEdit(){
  if(isSaving)return;
  var bandSize=getEditBandSize();
  if(!bandSize){
    document.getElementById('editError').style.display='block';
    document.getElementById('editError').textContent='Please select a band size.';
    return;
  }
  var genres=getEditSelectedGenres();
  if(genres.length===0){
    document.getElementById('editError').style.display='block';
    document.getElementById('editError').textContent='Please select at least one genre.';
    return;
  }
  isSaving=true;
  document.getElementById('editError').style.display='none';
  document.getElementById('editSuccess').style.display='none';
  document.getElementById('editFormWrap').style.display='none';
  document.getElementById('editLoading').style.display='block';

  var bandData={
    bandName:         document.getElementById('eBandName').value,
    contactName:      document.getElementById('eContactName').value,
    nameOnW9:         document.getElementById('eNameOnW9').value,
    w9Current:        document.getElementById('eW9Current').value,
    email:            document.getElementById('eEmail').value,
    phone:            document.getElementById('ePhone').value,
    payRateNoSound:   parseFloat(document.getElementById('ePayRateNoSound').value)||0,
    payRateWithSound: parseFloat(document.getElementById('ePayRateWithSound').value)||0,
    privatePartyRate: parseFloat(document.getElementById('ePrivatePartyRate').value)||0,
    agencyCommission: parseFloat(document.getElementById('eAgencyCommission').value)||0,
    genre:            genres.join(', '),
    numMembers:       parseInt(document.getElementById('eNumMembers').value)||0,
    typicalDraw:      parseInt(document.getElementById('eTypicalDraw').value)||0,
    hometown:         document.getElementById('eHometown').value,
    canTravel:        document.getElementById('eCanTravel').value,
    maxTravelDistance:parseInt(document.getElementById('eMaxTravelDistance').value)||0,
    promoVideo:       document.getElementById('ePromoVideo').value,
    socialMedia:      document.getElementById('eSocialMedia').value,
    instagram:        document.getElementById('eInstagram').value,
    website:          document.getElementById('eWebsite').value,
    bandSize:         bandSize,
    notes:            document.getElementById('eNotes').value
  };

  try {
    await callApi('api_updateBand', [editingBandId, bandData, agentId, 'Agent ' + agentId]);
    isSaving=false;
    document.getElementById('editLoading').style.display='none';
    document.getElementById('editSuccess').style.display='block';
    for(var i=0;i<allBands.length;i++){
      if(String(allBands[i].id)===String(editingBandId)){
        allBands[i].name=bandData.bandName;
        allBands[i].contact=bandData.contactName;
        allBands[i].nameOnW9=bandData.nameOnW9;
        allBands[i].w9Current=bandData.w9Current;
        allBands[i].email=bandData.email;
        allBands[i].phone=bandData.phone;
        allBands[i].payRateNoSound=bandData.payRateNoSound;
        allBands[i].payRateWithSound=bandData.payRateWithSound;
        allBands[i].privatePartyRate=bandData.privatePartyRate;
        allBands[i].commission=bandData.agencyCommission;
        allBands[i].genre=bandData.genre;
        allBands[i].numMembers=bandData.numMembers;
        allBands[i].typicalDraw=bandData.typicalDraw;
        allBands[i].hometown=bandData.hometown;
        allBands[i].canTravel=bandData.canTravel;
        allBands[i].maxTravelDistance=bandData.maxTravelDistance;
        allBands[i].promoVideo=bandData.promoVideo;
        allBands[i].socialMedia=bandData.socialMedia;
        allBands[i].instagram=bandData.instagram;
        allBands[i].website=bandData.website;
        allBands[i].bandSize=bandData.bandSize;
        allBands[i].notes=bandData.notes;
        break;
      }
    }
    updateStats(allBands);filterBands();
    setTimeout(function(){closeEdit();},1500);
  } catch (err) {
    isSaving=false;
    document.getElementById('editLoading').style.display='none';
    document.getElementById('editFormWrap').style.display='block';
    document.getElementById('editError').style.display='block';
    document.getElementById('editError').textContent='Error: '+err.message;
  }
}

function section(title,rows){return '<div class="detail-section"><div class="detail-section-title">'+title+'</div>'+rows.join('')+'</div>';}
function dRow(label,value){return '<div class="detail-row"><span class="detail-label">'+label+'</span><span class="detail-value">'+value+'</span></div>';}

function deleteFromView() {
  if (currentViewIndex < 0) return;
  closeView();
  deleteBand(currentViewIndex);
}

function deleteBand(index) {
  var band = filteredBands[index]; if (!band) return;
  if (!confirm('Delete ' + band.name + '? This cannot be undone.')) return;
  callApi('api_deleteBand', [band.id]).then(function() {
    allBands = allBands.filter(function(b) { return b.id !== band.id; });
    updateStats(allBands); filterBands();
  }).catch(function(err) {
    alert('Error deleting band: ' + err.message);
  });
}

function addBand(){ window.location.href = 'add-band.html'; }
function goToDashboard(){ window.location.href = 'agent-dashboard.html'; }
