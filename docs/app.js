/**
 * SMART CAMPUS FLORA - COMPREHENSIVE APPLICATION CONTROLLER
 * Full Potential Edition: Interactive Botanical Herbarium & AI Classifier
 */

// Configurable API Base Resolution
function resolveApiBase() {
  if (typeof window !== 'undefined' && window.FLORA_API_BASE) {
    return window.FLORA_API_BASE.replace(/\/+$/, '');
  }
  try {
    const saved = localStorage.getItem('flora_api_base');
    if (saved) return saved.replace(/\/+$/, '');
  } catch (e) {}

  if (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
    if (window.location.port === '8000' || window.location.port === '') {
      return window.location.origin;
    }
    return window.location.protocol + '//' + window.location.hostname + ':8000';
  }

  return 'http://localhost:8000';
}

const API_BASE = resolveApiBase();
console.log('[SmartCampusFlora] Configured API Base URL: ' + API_BASE);

function resolveAssetUrl(path) {
  if (!path) return 'https://placehold.co/400x300?text=No+Photo';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (path.startsWith('/dataset_images/')) {
    if (typeof window !== 'undefined' && window.location && window.location.hostname.endsWith('github.io')) {
      return path.replace('/dataset_images/', './dataset/');
    }
    return `${API_BASE}${path}`;
  }
  if (path.startsWith('dataset/')) {
    if (typeof window !== 'undefined' && window.location && window.location.hostname.endsWith('github.io')) {
      return './' + path;
    }
    return `${API_BASE}/${path.replace('dataset/', 'dataset_images/')}`;
  }
  return path.startsWith('/') ? `${API_BASE}${path}` : `${API_BASE}/${path}`;
}

// Global State
let speciesCache = [];
let campusZonesCache = [];
let selectedImageFile = null;
let currentFilter = 'all';
let currentSort = 'name-asc';
let currentViewMode = 'grid'; // 'grid' or 'list'
let activeModalSpecies = null;
let currentQuizData = [];
let currentQuizIndex = 0;
let quizScore = 0;

// ==========================================================================
// Initialization
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setupNavigation();
  setupHeroActions();
  setupCatalogueEvents();
  setupIdentifyEvents();
  setupMapModule();
  setupDiagnosticsEvents();
  setupQuizModule();
  setupModalEvents();
  setupGlobalHotkeys();

  // Initial Data Fetching
  checkBackendHealth();
  loadSpeciesCatalogue();
  loadCampusZones();
  loadDatasetStudioStats();
});

// ==========================================================================
// Theme Manager (Dark / Light Mode)
// ==========================================================================
function initTheme() {
  const saved = localStorage.getItem('flora_theme') || 'light';
  applyTheme(saved);

  const toggleBtn = document.getElementById('themeToggleBtn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      const next = current === 'light' ? 'dark' : 'light';
      applyTheme(next);
      localStorage.setItem('flora_theme', next);
    });
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const svg = document.getElementById('themeIconSvg');
  if (svg) {
    if (theme === 'dark') {
      svg.innerHTML = '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>';
    } else {
      svg.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
    }
  }
}

// ==========================================================================
// Navigation & Hero Actions
// ==========================================================================
function setupNavigation() {
  const tabs = document.querySelectorAll('.nav-tab');
  const panes = document.querySelectorAll('.view-pane');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.getAttribute('data-tab');
      switchTab(tabId);
    });
  });
}

function switchTab(tabId) {
  const tabs = document.querySelectorAll('.nav-tab');
  const panes = document.querySelectorAll('.view-pane');

  tabs.forEach(t => t.classList.toggle('active', t.getAttribute('data-tab') === tabId));
  panes.forEach(p => p.classList.toggle('active', p.id === tabId));

  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Specific tab triggers
  if (tabId === 'map-tab') {
    renderCampusSvgMap();
  } else if (tabId === 'diagnostics-tab') {
    loadDatasetStudioStats();
  } else if (tabId === 'quiz-tab' && currentQuizData.length === 0) {
    startNewQuiz();
  }
}

function setupHeroActions() {
  const scanBtn = document.getElementById('heroScanBtn');
  const mapBtn = document.getElementById('heroMapBtn');
  const quizBtn = document.getElementById('heroQuizBtn');

  if (scanBtn) scanBtn.addEventListener('click', () => switchTab('identify-tab'));
  if (mapBtn) mapBtn.addEventListener('click', () => switchTab('map-tab'));
  if (quizBtn) quizBtn.addEventListener('click', () => switchTab('quiz-tab'));
}

// ==========================================================================
// Backend Health Check
// ==========================================================================
async function checkBackendHealth() {
  const statusPill = document.getElementById('backendStatusPill');
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    if (res.ok) {
      statusPill.innerHTML = `
        <span class="status-dot online"></span>
        <span class="status-label">FastAPI Online</span>
      `;
    } else {
      throw new Error();
    }
  } catch (e) {
    statusPill.innerHTML = `
      <span class="status-dot offline"></span>
      <span class="status-label">Backend Offline</span>
    `;
  }
}

// ==========================================================================
// 1. Catalogue & Inventory Module
// ==========================================================================
async function loadSpeciesCatalogue() {
  const grid = document.getElementById('speciesGrid');
  try {
    let res;
    try {
      res = await fetch(`${API_BASE}/api/species`);
      if (!res.ok) throw new Error('Status ' + res.status);
    } catch (netErr) {
      console.log('Loading local species fallback...');
      res = await fetch('./species.json');
    }
    const data = await res.json();
    speciesCache = data.species || [];

    // Update KPI & counts
    const totalCount = speciesCache.length;
    const treeCount = speciesCache.filter(s => s.category === 'Tree').length;
    const plantCount = speciesCache.filter(s => s.category === 'Plant').length;
    const weedCount = speciesCache.filter(s => s.category === 'Weed').length;
    const totalPhotos = speciesCache.reduce((acc, s) => acc + s.image_count, 0);

    document.getElementById('navSpeciesCount').innerText = totalCount;
    document.getElementById('kpiSpeciesCount').innerText = totalCount;
    document.getElementById('kpiImageCount').innerText = totalPhotos;
    document.getElementById('chipAllCount').innerText = totalCount;
    document.getElementById('chipTreeCount').innerText = treeCount;
    document.getElementById('chipPlantCount').innerText = plantCount;
    document.getElementById('chipWeedCount').innerText = weedCount;

    renderCatalogueView();
    populateSamplePicker();
  } catch (e) {
    grid.innerHTML = `
      <div class="loading-state">
        <p style="color: #ef4444; font-weight: 600;">Failed to load catalogue from ${API_BASE}.</p>
        <button class="btn btn-sm btn-primary" onclick="loadSpeciesCatalogue()" style="margin-top: 10px;">Retry</button>
      </div>
    `;
  }
}

function renderCatalogueView() {
  const grid = document.getElementById('speciesGrid');
  const query = (document.getElementById('catalogueSearch').value || '').toLowerCase().trim();

  // Filter
  let filtered = speciesCache.filter(sp => {
    const matchesCat = (currentFilter === 'all') || (sp.category === currentFilter);
    const matchesQuery = !query || 
      sp.common_name.toLowerCase().includes(query) ||
      sp.scientific_name.toLowerCase().includes(query) ||
      sp.folder_name.toLowerCase().includes(query) ||
      sp.campus_location.toLowerCase().includes(query);
    return matchesCat && matchesQuery;
  });

  // Sort
  filtered.sort((a, b) => {
    if (currentSort === 'name-asc') return a.common_name.localeCompare(b.common_name);
    if (currentSort === 'name-desc') return b.common_name.localeCompare(a.common_name);
    if (currentSort === 'photos-desc') return b.image_count - a.image_count;
    if (currentSort === 'category') return a.category.localeCompare(b.category);
    return 0;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="loading-state" style="grid-column: 1 / -1;">
        <p>No campus flora matching current filters.</p>
      </div>
    `;
    return;
  }

  grid.className = `species-container ${currentViewMode}-view`;
  grid.innerHTML = filtered.map(sp => {
    const catClass = sp.category.toLowerCase();
    const thumbUrl = resolveAssetUrl(sp.thumbnail);

    return `
      <div class="species-card" onclick="openSpeciesModal('${sp.species_id}')">
        <div class="card-thumb-wrap">
          <img src="${thumbUrl}" alt="${sp.common_name}" loading="lazy" onerror="this.src='https://placehold.co/400x300?text=Campus+Specimen'">
          <div class="card-badge-row">
            <span class="category-pill ${catClass}">${sp.category}</span>
            <span class="photo-count-pill">${sp.image_count} photo${sp.image_count > 1 ? 's' : ''}</span>
          </div>
        </div>
        <div class="card-body-content">
          <h3 class="card-species-name">${sp.common_name}</h3>
          <p class="card-scientific">${sp.scientific_name}</p>
          <div class="card-location-row">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
            <span class="card-location-text">${sp.campus_location || 'Campus location pending'}</span>
          </div>
        </div>
        <div class="card-action-bar">
          <button class="btn btn-sm btn-outline" onclick="event.stopPropagation(); pronounceLatin('${sp.scientific_name}')" title="Pronounce Latin Binomial">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
          </button>
          <button class="btn btn-sm btn-outline-light" style="flex:1;" onclick="event.stopPropagation(); openSpeciesModal('${sp.species_id}')">
            <span>Factsheet & Records</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function setupCatalogueEvents() {
  const searchInput = document.getElementById('catalogueSearch');
  const clearBtn = document.getElementById('clearSearchBtn');
  const sortSelect = document.getElementById('speciesSortSelect');
  const chips = document.querySelectorAll('#categoryChips .chip');
  const gridBtn = document.getElementById('viewGridBtn');
  const listBtn = document.getElementById('viewListBtn');

  searchInput.addEventListener('input', () => {
    clearBtn.classList.toggle('hidden', !searchInput.value);
    renderCatalogueView();
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.classList.add('hidden');
    renderCatalogueView();
  });

  sortSelect.addEventListener('change', () => {
    currentSort = sortSelect.value;
    renderCatalogueView();
  });

  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.getAttribute('data-filter');
      renderCatalogueView();
    });
  });

  gridBtn.addEventListener('click', () => {
    currentViewMode = 'grid';
    gridBtn.classList.add('active');
    listBtn.classList.remove('active');
    renderCatalogueView();
  });

  listBtn.addEventListener('click', () => {
    currentViewMode = 'list';
    listBtn.classList.add('active');
    gridBtn.classList.remove('active');
    renderCatalogueView();
  });

  // Export Registry JSON
  document.getElementById('exportRegistryBtn').addEventListener('click', async () => {
    try {
      const res = await fetch(`${API_BASE}/api/export`);
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `SmartCampusFlora_Registry_${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Failed to export registry.');
    }
  });
}

// Audio Pronunciation using Web Speech API
window.pronounceLatin = function(name) {
  if (!name || name === 'Pending Botanical Record') return;
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(name);
    utterance.rate = 0.85; // slightly slower for clear botanical pronunciation
    utterance.lang = 'la'; // Latin pronunciation
    window.speechSynthesis.speak(utterance);
  } else {
    alert(`Latin pronunciation: ${name}`);
  }
};

// ==========================================================================
// 2. AI Plant Identifier Module
// ==========================================================================
function populateSamplePicker() {
  const container = document.getElementById('samplePillsList');
  if (!container || speciesCache.length === 0) return;

  // Pick 6 prominent specimens from our actual dataset
  const showcase = ['foxtail palm', 'lxora plant', 'aloe vera', 'neem', 'hibiscus', 'areca palm'];
  const samples = speciesCache.filter(s => showcase.includes(s.species_id));

  container.innerHTML = samples.map(sp => `
    <button type="button" class="sample-pill-btn" onclick="testWithSample('${sp.species_id}')">
      <span class="pill-dot" style="margin-right:6px;"></span>${sp.common_name}
    </button>
  `).join('');
}

window.testWithSample = async function(speciesId) {
  const sp = speciesCache.find(s => s.species_id === speciesId);
  if (!sp || !sp.thumbnail) return;

  switchTab('identify-tab');

  try {
    const res = await fetch(`${API_BASE}${sp.thumbnail}`);
    const blob = await res.blob();
    const file = new File([blob], `${speciesId}_sample.jpeg`, { type: 'image/jpeg' });
    handleSelectedImageFile(file);
    performAIIdentification();
  } catch (e) {
    alert('Failed to load sample image.');
  }
};

function setupIdentifyEvents() {
  const selectPhotoBtn = document.getElementById('selectPhotoBtn');
  const imageInput = document.getElementById('imageInput');
  const dropzone = document.getElementById('dropzone');
  const changePhotoBtn = document.getElementById('changePhotoBtn');
  const classifyBtn = document.getElementById('classifyBtn');

  selectPhotoBtn.addEventListener('click', async () => {
    if (isCapacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Camera) {
      try {
        const image = await window.Capacitor.Plugins.Camera.getPhoto({
          quality: 90,
          allowEditing: false,
          resultType: 'uri',
          source: 'PROMPT'
        });
        const response = await fetch(image.webPath);
        const blob = await response.blob();
        handleSelectedImageFile(new File([blob], "specimen.jpg", { type: "image/jpeg" }));
        return;
      } catch (e) {
        console.log("Capacitor camera fallback to file input");
      }
    }
    imageInput.click();
  });

  changePhotoBtn.addEventListener('click', () => imageInput.click());

  imageInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleSelectedImageFile(e.target.files[0]);
    }
  });

  // Drag and drop
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleSelectedImageFile(e.dataTransfer.files[0]);
    }
  });

  // Clipboard Paste (Ctrl+V) for photos!
  window.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        switchTab('identify-tab');
        handleSelectedImageFile(file);
        break;
      }
    }
  });

  classifyBtn.addEventListener('click', performAIIdentification);
}

function handleSelectedImageFile(file) {
  selectedImageFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('imagePreview').src = e.target.result;
    document.getElementById('dropzonePrompt').classList.add('hidden');
    document.getElementById('previewContainer').classList.remove('hidden');
    document.getElementById('classifyBtn').disabled = false;

    // Reset result state
    document.getElementById('resultPlaceholder').classList.remove('hidden');
    document.getElementById('resultContent').classList.add('hidden');
    document.getElementById('aiStatusPill').innerText = 'Ready to Analyze';
    document.getElementById('aiStatusPill').className = 'badge badge-accent';
  };
  reader.readAsDataURL(file);
}

async function performAIIdentification() {
  if (!selectedImageFile) {
    alert('Please select or capture a plant photo first.');
    return;
  }

  const btn = document.getElementById('classifyBtn');
  btn.disabled = true;
  btn.innerHTML = '<span>⏳ Processing MobileNetV2 Inference...</span>';
  document.getElementById('aiStatusPill').innerText = 'Classifying...';
  document.getElementById('aiStatusPill').className = 'badge badge-accent';

  const formData = new FormData();
  formData.append('file', selectedImageFile);

  try {
    const res = await fetch(`${API_BASE}/api/predict`, {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      let detail = `Prediction API returned status ${res.status} (${res.statusText})`;
      try {
        const errJson = await res.json();
        if (errJson && errJson.detail) detail = errJson.detail;
      } catch (e) {}
      throw new Error(detail);
    }

    const data = await res.json();
    renderPredictionReport(data);
  } catch (err) {
    console.error('AI Identification error:', err);
    displayIdentificationError(err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg><span>Run AI Identification</span>';
  }
}

function displayIdentificationError(err) {
  document.getElementById('resultPlaceholder').classList.add('hidden');
  document.getElementById('resultContent').classList.remove('hidden');

  const alertBanner = document.getElementById('confidenceAlert');
  const aiStatusPill = document.getElementById('aiStatusPill');

  aiStatusPill.innerText = 'Service Error';
  aiStatusPill.className = 'badge badge-weed';

  alertBanner.className = 'alert-banner alert-low';
  alertBanner.classList.remove('hidden');

  const isNetwork = err.message.includes('Failed to fetch') || err.message.includes('NetworkError');
  const title = isNetwork ? 'Backend Connection Error' : 'Prediction Error';
  const desc = isNetwork 
    ? `Could not reach prediction service at <code>${API_BASE}</code>. Please ensure the FastAPI backend is running.`
    : err.message;

  alertBanner.innerHTML = `<strong>⚠️ ${title}:</strong> <p style="margin-top:6px;font-size:0.9rem;">${desc}</p>`;
  document.getElementById('topMatchHero').classList.add('hidden');
  document.getElementById('runnerUpsSection').classList.add('hidden');
}

function renderPredictionReport(data) {
  document.getElementById('resultPlaceholder').classList.add('hidden');
  document.getElementById('resultContent').classList.remove('hidden');

  const alertBanner = document.getElementById('confidenceAlert');
  const aiStatusPill = document.getElementById('aiStatusPill');

  if (!data || data.status === 'model_untrained' || !data.top_prediction) {
    alertBanner.className = 'alert-banner alert-low';
    alertBanner.classList.remove('hidden');
    const msg = data && data.message ? data.message : 'No prediction generated by model.';
    alertBanner.innerHTML = `<strong>⚠️ Notice:</strong> ${msg}`;
    aiStatusPill.innerText = data && data.status === 'model_untrained' ? 'Model Untrained' : 'Inference Notice';
    aiStatusPill.className = 'badge badge-weed';
    document.getElementById('topMatchHero').classList.add('hidden');
    document.getElementById('runnerUpsSection').classList.add('hidden');
    return;
  }

  document.getElementById('topMatchHero').classList.remove('hidden');
  const top = data.top_prediction;

  if (data.is_confident) {
    alertBanner.className = 'alert-banner alert-success';
    alertBanner.innerHTML = `<strong>✅ Match Identified:</strong> ${data.message}`;
    aiStatusPill.innerText = 'High Confidence';
    aiStatusPill.className = 'badge badge-plant';
  } else {
    alertBanner.className = 'alert-banner alert-low';
    alertBanner.innerHTML = `<strong>⚠️ ${data.message}</strong>`;
    aiStatusPill.innerText = 'Low Confidence';
    aiStatusPill.className = 'badge badge-weed';
  }

  const catClass = (top.category || 'Plant').toLowerCase();
  const catPill = document.getElementById('resCategoryBadge');
  catPill.className = `category-pill ${catClass}`;
  catPill.innerText = top.category;

  document.getElementById('resCommonName').innerText = top.common_name;
  document.getElementById('resScientificName').innerText = top.scientific_name;
  document.getElementById('resConfidenceVal').innerText = top.confidence_percentage;
  document.getElementById('resLocation').innerText = top.campus_location;
  document.getElementById('resFolder').innerText = top.species_name;
  document.getElementById('resDescription').innerText = top.description || 'Verified campus botanical specimen.';

  // Runner Ups Probability Breakdown
  const candidates = data.top_candidates || [];
  const runnerSection = document.getElementById('runnerUpsSection');
  const runnerList = document.getElementById('runnerUpsList');

  if (candidates.length > 0) {
    runnerSection.classList.remove('hidden');
    runnerList.innerHTML = candidates.map(c => `
      <div class="candidate-bar-item">
        <div class="candidate-bar-labels">
          <span><strong>${c.common_name}</strong> <em class="text-subtle">(${c.scientific_name})</em></span>
          <span style="font-weight:700;">${c.confidence_percentage}</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width: ${c.confidence_percentage};"></div>
        </div>
      </div>
    `).join('');
  } else {
    runnerSection.classList.add('hidden');
  }
}

// ==========================================================================
// 3. Campus Flora GIS Map Module
// ==========================================================================
async function loadCampusZones() {
  try {
    const res = await fetch(`${API_BASE}/api/campus/zones`);
    const data = await res.json();
    campusZonesCache = data.zones || [];
    renderCampusSvgMap();
  } catch (e) {
    console.log("Failed to load campus zones", e);
  }
}

function renderCampusSvgMap() {
  const group = document.getElementById('svgZoneMarkersGroup');
  if (!group || campusZonesCache.length === 0) return;

  // Map coordinates in 1000x650 viewport
  group.innerHTML = campusZonesCache.map(zone => {
    const cx = (zone.x / 100) * 1000;
    const cy = (zone.y / 100) * 650;
    const color = getZoneColor(zone.id);

    return `
      <g class="map-zone-pin" onclick="selectCampusZone('${zone.id}')" transform="translate(${cx}, ${cy})">
        <circle r="22" fill="${color}" opacity="0.3" class="zone-pulse-circle">
          <animate attributeName="r" values="18;28;18" dur="2.5s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.4;0.1;0.4" dur="2.5s" repeatCount="indefinite"/>
        </circle>
        <circle r="14" fill="${color}" stroke="#ffffff" stroke-width="3" filter="drop-shadow(0 3px 6px rgba(0,0,0,0.3))"/>
        <text y="4" text-anchor="middle" font-size="9" font-weight="800" fill="#ffffff">${zone.code.slice(-1)}</text>
        <rect x="-60" y="-36" width="120" height="20" rx="4" fill="rgba(19,42,34,0.85)" stroke="${color}" stroke-width="1"/>
        <text x="0" y="-23" text-anchor="middle" font-size="9.5" font-weight="700" fill="#ffffff">${zone.name}</text>
      </g>
    `;
  }).join('');

  // Default selection
  if (campusZonesCache.length > 0) {
    selectCampusZone(campusZonesCache[0].id);
  }
}

function getZoneColor(zoneId) {
  switch (zoneId) {
    case 'zone-herbal': return '#10b981';
    case 'zone-admin': return '#3b82f6';
    case 'zone-avenue': return '#f59e0b';
    case 'zone-academic': return '#8b5cf6';
    case 'zone-perimeter': return '#ec4899';
    case 'zone-orchard': return '#14b8a6';
    default: return '#2d936c';
  }
}

window.selectCampusZone = function(zoneId) {
  const zone = campusZonesCache.find(z => z.id === zoneId);
  if (!zone) return;

  document.getElementById('selectedZoneBadge').innerText = zone.code;
  document.getElementById('selectedZoneName').innerText = zone.name;
  document.getElementById('selectedZoneDesc').innerText = zone.description;

  const floraList = document.getElementById('zoneSpeciesList');
  const matchedFlora = speciesCache.filter(sp => zone.species_ids.includes(sp.species_id));

  if (matchedFlora.length === 0) {
    floraList.innerHTML = '<p class="text-subtle">No species mapped to this zone yet.</p>';
    return;
  }

  floraList.innerHTML = matchedFlora.map(sp => {
    const thumbUrl = resolveAssetUrl(sp.thumbnail);
    return `
      <div class="zone-flora-item" onclick="openSpeciesModal('${sp.species_id}')">
        <img src="${thumbUrl}" alt="${sp.common_name}" class="zone-flora-thumb">
        <div class="zone-flora-info">
          <div class="zone-flora-title">${sp.common_name}</div>
          <div class="zone-flora-sub">${sp.scientific_name}</div>
        </div>
        <span class="category-pill ${sp.category.toLowerCase()}">${sp.category}</span>
      </div>
    `;
  }).join('');
};

function setupMapModule() {
  // Handlers initialized via renderCampusSvgMap
}

// ==========================================================================
// 4. Dataset Health & AI Studio Module
// ==========================================================================
async function loadDatasetStudioStats() {
  try {
    const res = await fetch(`${API_BASE}/api/dataset/stats`);
    const stats = await res.json();
    renderClassDistributionChart(stats.species || []);
    checkModelMetrics();
  } catch (e) {
    console.error("Failed to load studio stats", e);
  }
}

function renderClassDistributionChart(speciesList) {
  const container = document.getElementById('distributionChartBox');
  if (!container || speciesList.length === 0) return;

  const maxVal = Math.max(...speciesList.map(s => s.image_count), 6);
  const chartHeight = 220;
  const barWidth = 24;
  const gap = 14;
  const totalWidth = speciesList.length * (barWidth + gap) + 40;

  const svgBars = speciesList.map((sp, idx) => {
    const count = sp.image_count;
    const h = (count / maxVal) * 150;
    const x = idx * (barWidth + gap) + 30;
    const y = 170 - h;
    const isCritical = count <= 1;
    const fill = isCritical ? '#ef4444' : (count < 3 ? '#f59e0b' : '#10b981');

    return `
      <g>
        <rect x="${x}" y="${y}" width="${barWidth}" height="${h}" rx="4" fill="${fill}" opacity="0.9">
          <title>${sp.species_name}: ${count} photos</title>
        </rect>
        <text x="${x + barWidth/2}" y="${y - 6}" text-anchor="middle" font-size="10" font-weight="700" fill="var(--text-main)">${count}</text>
        <text x="${x + barWidth/2}" y="195" text-anchor="end" font-size="9" fill="var(--text-subtle)" transform="rotate(-45, ${x + barWidth/2}, 195)">
          ${sp.species_name.slice(0, 10)}
        </text>
      </g>
    `;
  }).join('');

  container.innerHTML = `
    <svg width="${totalWidth}" height="${chartHeight}" viewBox="0 0 ${totalWidth} ${chartHeight}">
      <!-- Baseline -->
      <line x1="20" y1="170" x2="${totalWidth - 10}" y2="170" stroke="var(--border-color)" stroke-width="2"/>
      ${svgBars}
    </svg>
  `;
}

async function checkModelMetrics() {
  try {
    const res = await fetch(`${API_BASE}/api/model/status`);
    const data = await res.json();
    const badge = document.getElementById('studioModelBadge');
    const heroStatus = document.getElementById('kpiModelStatus');

    if (data.is_trained) {
      badge.innerText = 'Trained & Active';
      badge.className = 'badge badge-plant';
      heroStatus.innerText = 'Active';

      const m = data.metrics || {};
      if (m.train_accuracy !== undefined) {
        document.getElementById('kpiTrainAcc').innerText = `${(m.train_accuracy * 100).toFixed(1)}%`;
        document.getElementById('kpiValAcc').innerText = `${(m.val_accuracy * 100).toFixed(1)}%`;
        document.getElementById('kpiTrainSamples').innerText = m.train_samples;
        document.getElementById('kpiValSamples').innerText = m.val_samples;
        document.getElementById('studioAuditText').innerHTML = `
          <strong>Honest Evaluation Notice:</strong> ${m.honest_assessment}
        `;
      }
    } else {
      badge.innerText = 'Untrained';
      badge.className = 'badge badge-weed';
      heroStatus.innerText = 'Untrained';
    }
  } catch (e) {
    console.error("Failed to load model status", e);
  }
}

function setupDiagnosticsEvents() {
  const trainBtn = document.getElementById('studioTrainBtn');
  const epochsSelect = document.getElementById('studioEpochsSelect');
  const progressBox = document.getElementById('studioProgressBox');

  trainBtn.addEventListener('click', async () => {
    const epochs = parseInt(epochsSelect.value, 10) || 15;
    trainBtn.disabled = true;
    progressBox.classList.remove('hidden');

    try {
      const res = await fetch(`${API_BASE}/api/train?epochs=${epochs}`, { method: 'POST' });
      if (!res.ok) throw new Error('Training request failed');
      const metrics = await res.json();
      await checkModelMetrics();
      alert(`Model trained successfully!\nValidation Accuracy (Zero Leakage): ${(metrics.val_accuracy * 100).toFixed(1)}%\nSee Honest Evaluation report.`);
    } catch (err) {
      alert(`Training error: ${err.message}`);
    } finally {
      trainBtn.disabled = false;
      progressBox.classList.add('hidden');
    }
  });
}

// ==========================================================================
// 5. Campus Flora Quest / Quiz Module
// ==========================================================================
function setupQuizModule() {
  document.getElementById('restartQuizBtn').addEventListener('click', startNewQuiz);
}

async function startNewQuiz() {
  const container = document.getElementById('quizContainer');
  container.innerHTML = `
    <div class="loading-state">
      <div class="nature-spinner"></div>
      <p>Generating new botanical quiz from campus dataset...</p>
    </div>
  `;

  try {
    const res = await fetch(`${API_BASE}/api/quiz`);
    const data = await res.json();
    currentQuizData = data.questions || [];
    currentQuizIndex = 0;
    quizScore = 0;
    renderCurrentQuizQuestion();
  } catch (e) {
    container.innerHTML = '<p class="text-danger">Failed to generate quiz.</p>';
  }
}

function renderCurrentQuizQuestion() {
  const container = document.getElementById('quizContainer');
  if (currentQuizIndex >= currentQuizData.length) {
    renderQuizFinalScore();
    return;
  }

  const q = currentQuizData[currentQuizIndex];
  container.innerHTML = `
    <div class="quiz-question-header" style="display:flex; justify-content:space-between; margin-bottom:14px;">
      <span class="badge badge-accent">Question ${currentQuizIndex + 1} of ${currentQuizData.length}</span>
      <span style="font-weight:700;">Score: ${quizScore}</span>
    </div>

    <div class="quiz-img-box">
      <img src="${API_BASE}${q.image_url}" alt="Quiz Specimen">
    </div>

    <h3 class="quiz-question-title">${q.question}</h3>
    <p class="text-subtle" style="margin-bottom:18px;">💡 <em>${q.scientific_hint}</em> &bull; ${q.location_hint}</p>

    <div class="quiz-options-list">
      ${q.options.map(opt => `
        <button type="button" class="quiz-opt-btn" onclick="submitQuizAnswer(this, '${escapeHtml(opt)}', '${escapeHtml(q.correct_answer)}', '${escapeHtml(q.explanation)}')">
          ${opt}
        </button>
      `).join('')}
    </div>

    <div id="quizFeedbackArea" class="hidden"></div>
  `;
}

window.submitQuizAnswer = function(button, chosen, correct, explanation) {
  const btns = document.querySelectorAll('.quiz-opt-btn');
  btns.forEach(b => b.disabled = true);

  const feedbackArea = document.getElementById('quizFeedbackArea');
  const isCorrect = chosen === correct;

  if (isCorrect) {
    button.classList.add('correct');
    quizScore++;
  } else {
    button.classList.add('wrong');
    btns.forEach(b => {
      if (b.innerText.trim() === correct) b.classList.add('correct');
    });
  }

  feedbackArea.className = 'quiz-feedback-box';
  feedbackArea.classList.remove('hidden');
  feedbackArea.innerHTML = `
    <strong>${isCorrect ? '🎉 Correct!' : '❌ Incorrect.'}</strong>
    <p>${explanation}</p>
    <button class="btn btn-primary" onclick="nextQuizQuestion()" style="margin-top:10px;">
      ${currentQuizIndex + 1 === currentQuizData.length ? 'See Final Score 🏆' : 'Next Question ➔'}
    </button>
  `;
};

window.nextQuizQuestion = function() {
  currentQuizIndex++;
  renderCurrentQuizQuestion();
};

function renderQuizFinalScore() {
  const container = document.getElementById('quizContainer');
  let badgeTitle = 'Campus Explorer 🍃';
  if (quizScore === currentQuizData.length) badgeTitle = 'Master Campus Botanist 🌿';
  else if (quizScore >= 3) badgeTitle = 'Flora Naturalist 🌱';

  container.innerHTML = `
    <div style="text-align: center; padding: 24px 0;">
      <div style="font-size: 4rem; margin-bottom: 12px;">🏆</div>
      <h3 style="font-size: 1.8rem;">Quest Completed!</h3>
      <p style="font-size: 1.2rem; font-weight: 700; color: var(--primary); margin: 10px 0;">
        You scored ${quizScore} out of ${currentQuizData.length}
      </p>
      <div class="badge badge-accent" style="font-size: 0.95rem; padding: 6px 16px; margin-bottom: 20px;">
        Botanical Rank: ${badgeTitle}
      </div>
      <p class="text-subtle" style="max-width: 480px; margin: 0 auto 24px;">
        You have explored the distinct floral characteristics of our campus specimens. Continue discovering more plants in the catalogue!
      </p>
      <button class="btn btn-primary btn-lg" onclick="startNewQuiz()">
        <span>🔄 Play Again</span>
      </button>
    </div>
  `;
}

// ==========================================================================
// 6. Species Modal, Factsheet, QR Generator, & Metadata Editor
// ==========================================================================
window.openSpeciesModal = function(speciesId) {
  const sp = speciesCache.find(s => s.species_id === speciesId);
  if (!sp) return;

  activeModalSpecies = sp;

  document.getElementById('modalTitle').innerText = sp.common_name;
  document.getElementById('modalSub').innerText = `${sp.scientific_name} • ${sp.folder_name}`;
  document.getElementById('modalCategoryPill').innerText = sp.category;
  document.getElementById('modalCategoryPill').className = `category-pill ${sp.category.toLowerCase()}`;

  // Form Fields
  document.getElementById('editSpeciesId').value = sp.species_id;
  document.getElementById('editCommonName').value = sp.common_name;
  document.getElementById('editScientificName').value = sp.scientific_name;
  document.getElementById('editCategory').value = sp.category || 'Plant';
  document.getElementById('editFolder').value = `${sp.folder_name} (${sp.image_count} photos)`;
  document.getElementById('editLocation').value = sp.campus_location || '';
  document.getElementById('editDescription').value = sp.description || '';

  // Gallery
  const images = sp.images || [];
  const mainImg = document.getElementById('modalMainImg');
  const thumbsRow = document.getElementById('modalThumbsRow');
  const badge = document.getElementById('modalPhotoCountBadge');

  if (images.length > 0) {
    mainImg.src = resolveAssetUrl(images[0]);
    badge.innerText = `Photo 1 of ${images.length}`;
    thumbsRow.innerHTML = images.map((img, i) => `
      <img src="${API_BASE}${img}" alt="${sp.common_name}" class="thumb-mini ${i === 0 ? 'active' : ''}" onclick="switchModalPhoto(this, resolveAssetUrl('${img}'), ${i+1}, ${images.length})">
    `).join('');
  } else {
    mainImg.src = 'https://placehold.co/400x300?text=No+Specimen+Photo';
    thumbsRow.innerHTML = '';
  }

  // Generate SVG QR Code Tag for physical tree signage
  generateCampusQrTag(sp);

  document.getElementById('speciesModal').classList.remove('hidden');
};

window.switchModalPhoto = function(el, src, index, total) {
  document.getElementById('modalMainImg').src = src;
  document.getElementById('modalPhotoCountBadge').innerText = `Photo ${index} of ${total}`;
  document.querySelectorAll('.thumb-mini').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
};

function generateCampusQrTag(sp) {
  const qrWrap = document.getElementById('qrSvgWrap');
  // Client-side aesthetic QR Code simulation matrix
  const qrUrl = `${API_BASE}/#species=${encodeURIComponent(sp.species_id)}`;
  qrWrap.innerHTML = `
    <svg width="120" height="120" viewBox="0 0 100 100" style="display:block;">
      <!-- Corner Markers -->
      <rect x="5" y="5" width="26" height="26" fill="#1b4332" rx="4"/>
      <rect x="10" y="10" width="16" height="16" fill="#ffffff" rx="2"/>
      <rect x="14" y="14" width="8" height="8" fill="#1b4332" rx="1"/>

      <rect x="69" y="5" width="26" height="26" fill="#1b4332" rx="4"/>
      <rect x="74" y="10" width="16" height="16" fill="#ffffff" rx="2"/>
      <rect x="78" y="14" width="8" height="8" fill="#1b4332" rx="1"/>

      <rect x="5" y="69" width="26" height="26" fill="#1b4332" rx="4"/>
      <rect x="10" y="74" width="16" height="16" fill="#ffffff" rx="2"/>
      <rect x="14" y="78" width="8" height="8" fill="#1b4332" rx="1"/>

      <!-- Random simulated data pixels for visual QR pattern -->
      <rect x="36" y="8" width="6" height="6" fill="#1b4332"/>
      <rect x="46" y="8" width="6" height="6" fill="#1b4332"/>
      <rect x="36" y="18" width="6" height="6" fill="#1b4332"/>
      <rect x="56" y="18" width="6" height="6" fill="#1b4332"/>
      <rect x="8" y="38" width="6" height="6" fill="#1b4332"/>
      <rect x="18" y="48" width="6" height="6" fill="#1b4332"/>
      <rect x="38" y="38" width="8" height="8" fill="#1b4332"/>
      <rect x="50" y="48" width="8" height="8" fill="#1b4332"/>
      <rect x="64" y="38" width="6" height="6" fill="#1b4332"/>
      <rect x="76" y="48" width="6" height="6" fill="#1b4332"/>
      <rect x="42" y="64" width="6" height="6" fill="#1b4332"/>
      <rect x="52" y="74" width="6" height="6" fill="#1b4332"/>
      <rect x="68" y="68" width="8" height="8" fill="#1b4332"/>
      <rect x="82" y="78" width="6" height="6" fill="#1b4332"/>
      <rect x="48" y="82" width="6" height="6" fill="#1b4332"/>
    </svg>
  `;
}

function setupModalEvents() {
  const modal = document.getElementById('speciesModal');
  const close = () => modal.classList.add('hidden');

  document.getElementById('closeModalBtn').addEventListener('click', close);
  document.getElementById('cancelModalBtn').addEventListener('click', close);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  // Latin pronunciation from modal
  document.getElementById('pronounceBtn').addEventListener('click', () => {
    if (activeModalSpecies) {
      pronounceLatin(activeModalSpecies.scientific_name);
    }
  });

  // Toggle QR popout
  document.getElementById('showQrBtn').addEventListener('click', () => {
    const popout = document.getElementById('qrPopoutCard');
    popout.classList.toggle('hidden');
  });

  // Print QR tag
  document.getElementById('printQrBtn').addEventListener('click', () => {
    window.print();
  });

  // Add Specimen Photo button
  const addPhotoBtn = document.getElementById('modalAddPhotoBtn');
  const photoInput = document.getElementById('modalPhotoInput');
  const feedback = document.getElementById('modalUploadFeedback');

  addPhotoBtn.addEventListener('click', () => photoInput.click());

  photoInput.addEventListener('change', async (e) => {
    if (!activeModalSpecies || !e.target.files[0]) return;
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append('file', file);

    feedback.innerText = 'Uploading new specimen photo...';
    try {
      const res = await fetch(`${API_BASE}/api/species/${encodeURIComponent(activeModalSpecies.species_id)}/add-photo`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      feedback.innerText = '✅ Photo added! Reloading catalogue...';
      await loadSpeciesCatalogue();
      openSpeciesModal(activeModalSpecies.species_id);
    } catch (err) {
      feedback.innerText = '❌ Upload failed.';
    }
  });

  // Save Botanical Record
  document.getElementById('speciesEditForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeModalSpecies) return;

    const saveBtn = document.getElementById('saveRecordBtn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span>⏳ Saving...</span>';

    const payload = {
      common_name: document.getElementById('editCommonName').value.trim(),
      scientific_name: document.getElementById('editScientificName').value.trim(),
      category: document.getElementById('editCategory').value,
      campus_location: document.getElementById('editLocation').value.trim(),
      description: document.getElementById('editDescription').value.trim()
    };

    try {
      const res = await fetch(`${API_BASE}/api/species/${encodeURIComponent(activeModalSpecies.species_id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Failed to update record');

      // Update in cache
      Object.assign(activeModalSpecies, payload);
      renderCatalogueView();
      close();
    } catch (err) {
      alert(`Save error: ${err.message}`);
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<span>💾 Save Botanical Record</span>';
    }
  });
}

// Global hotkeys (Ctrl+K or / to search)
function setupGlobalHotkeys() {
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey && e.key === 'k') || (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA')) {
      e.preventDefault();
      switchTab('catalogue-tab');
      document.getElementById('catalogueSearch').focus();
    }
  });
}

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/[&<>"']/g, function(m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
  });
}
