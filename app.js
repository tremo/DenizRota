/**
 * DenizRota - Tekne Rota Planlayıcı
 * Amatör denizciler için harita tabanlı rota planlama uygulaması
 */

// ===== State Management =====
const state = {
    routeMode: false,
    waypoints: [],
    markers: [],
    polyline: null,
    settings: {
        boatName: '',
        boatType: 'motorlu',
        avgSpeed: 20, // km/saat
        fuelRate: 15, // litre/saat
        tankCapacity: 200, // litre
        fuelPrice: 45 // ₺/litre
    }
};

// ===== Map Initialization =====
let map;

function initMap() {
    // Marmara Denizi merkezi
    map = L.map('map', {
        center: [40.7, 28.9],
        zoom: 9,
        zoomControl: true
    });

    // OpenStreetMap tile layer with sea detail
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Alternatif deniz haritası layer'ı ekle
    const seaLayer = L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="http://www.openseamap.org">OpenSeaMap</a> contributors'
    });
    seaLayer.addTo(map);

    // Harita tıklama event'i
    map.on('click', handleMapClick);
}

// ===== Event Handlers =====
function handleMapClick(e) {
    if (!state.routeMode) return;

    const { lat, lng } = e.latlng;
    addWaypoint(lat, lng);
}

function toggleRouteMode() {
    state.routeMode = !state.routeMode;
    const btn = document.getElementById('routeModeBtn');
    const instructions = document.getElementById('mapInstructions');

    if (state.routeMode) {
        btn.classList.add('active');
        btn.innerHTML = '<i class="fas fa-check"></i><span>Rota Modu Aktif</span>';
        instructions.classList.remove('hidden');
        map.getContainer().style.cursor = 'crosshair';
    } else {
        btn.classList.remove('active');
        btn.innerHTML = '<i class="fas fa-route"></i><span>Rota Modu</span>';
        instructions.classList.add('hidden');
        map.getContainer().style.cursor = 'grab';
    }
}

function clearRoute() {
    // Tüm marker'ları kaldır
    state.markers.forEach(marker => map.removeLayer(marker));
    state.markers = [];
    state.waypoints = [];

    // Polyline'ı kaldır
    if (state.polyline) {
        map.removeLayer(state.polyline);
        state.polyline = null;
    }

    // UI güncelle
    updateRouteStats();
    updateWaypointsList();
}

// ===== Waypoint Management =====
function addWaypoint(lat, lng) {
    // Simüle edilmiş hava durumu verisi al
    const weather = simulateWeatherData(lat, lng);

    const waypoint = {
        id: Date.now(),
        lat,
        lng,
        weather,
        riskLevel: calculateRiskLevel(weather)
    };

    state.waypoints.push(waypoint);

    // Marker oluştur
    const marker = createMarker(waypoint, state.waypoints.length);
    state.markers.push(marker);
    marker.addTo(map);

    // Rotayı güncelle
    updatePolyline();
    updateRouteStats();
    updateWaypointsList();
}

function removeWaypoint(index) {
    // Marker'ı kaldır
    map.removeLayer(state.markers[index]);
    state.markers.splice(index, 1);
    state.waypoints.splice(index, 1);

    // Marker numaralarını güncelle
    state.markers.forEach((marker, i) => {
        map.removeLayer(marker);
        const newMarker = createMarker(state.waypoints[i], i + 1);
        state.markers[i] = newMarker;
        newMarker.addTo(map);
    });

    // UI güncelle
    updatePolyline();
    updateRouteStats();
    updateWaypointsList();
}

function createMarker(waypoint, number) {
    const riskClass = waypoint.riskLevel;

    // Custom icon oluştur
    const icon = L.divIcon({
        className: 'custom-marker',
        html: `
            <div class="marker-pin ${riskClass}"></div>
            <div class="marker-number">${number}</div>
        `,
        iconSize: [30, 42],
        iconAnchor: [15, 42],
        popupAnchor: [0, -35]
    });

    const marker = L.marker([waypoint.lat, waypoint.lng], { icon });

    // Popup içeriği
    const popupContent = createPopupContent(waypoint);
    marker.bindPopup(popupContent);

    return marker;
}

function createPopupContent(waypoint) {
    const windDirection = getWindDirectionText(waypoint.weather.windDirection);
    const windyUrl = `https://windy.app/tr/forecast2/spot/${Math.floor(waypoint.lat * 1000)}${Math.floor(waypoint.lng * 1000)}/Konum`;

    return `
        <div class="weather-popup">
            <div class="weather-header">
                <span class="weather-title">Hava Durumu</span>
                <span class="weather-coords">${waypoint.lat.toFixed(4)}°, ${waypoint.lng.toFixed(4)}°</span>
            </div>
            <div class="weather-body">
                <div class="weather-item">
                    <i class="fas fa-wind"></i>
                    <span>${waypoint.weather.windSpeed.toFixed(1)} km/s</span>
                </div>
                <div class="weather-item">
                    <i class="fas fa-water"></i>
                    <span>${waypoint.weather.waveHeight.toFixed(1)} m dalga</span>
                </div>
                <div class="weather-item">
                    <i class="fas fa-compass"></i>
                    <span>${windDirection} (${waypoint.weather.windDirection}°)</span>
                </div>
            </div>
            <a class="windy-link" href="${windyUrl}" target="_blank">
                <i class="fas fa-external-link-alt"></i> Windy.app'te Görüntüle
            </a>
        </div>
    `;
}

// ===== Route Drawing =====
function updatePolyline() {
    if (state.polyline) {
        map.removeLayer(state.polyline);
    }

    if (state.waypoints.length < 2) return;

    const latlngs = state.waypoints.map(wp => [wp.lat, wp.lng]);

    state.polyline = L.polyline(latlngs, {
        color: '#0077b6',
        weight: 4,
        opacity: 0.8,
        dashArray: '10, 10',
        lineJoin: 'round'
    }).addTo(map);
}

// ===== Calculations =====
function calculateDistance(lat1, lng1, lat2, lng2) {
    // Haversine formülü
    const R = 6371; // Dünya'nın yarıçapı (km)
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toRad(deg) {
    return deg * (Math.PI / 180);
}

function getTotalDistance() {
    let total = 0;
    for (let i = 1; i < state.waypoints.length; i++) {
        const prev = state.waypoints[i - 1];
        const curr = state.waypoints[i];
        total += calculateDistance(prev.lat, prev.lng, curr.lat, curr.lng);
    }
    return total;
}

function calculateRiskLevel(weather) {
    // Rüzgar hızına göre risk seviyesi
    if (weather.windSpeed < 15) return 'green';
    if (weather.windSpeed < 30) return 'yellow';
    return 'red';
}

// ===== Weather Simulation =====
function simulateWeatherData(lat, lng) {
    // Gerçek API yerine simüle edilmiş veri
    // Gerçek uygulamada OpenWeatherMap veya benzeri API kullanılabilir
    const baseWind = 5 + Math.random() * 35;
    const baseWave = 0.2 + Math.random() * 2.5;
    const windDirection = Math.floor(Math.random() * 360);

    // Konum bazlı varyasyon
    const latFactor = (lat - 40) * 2;
    const lngFactor = (lng - 28) * 1.5;

    return {
        windSpeed: Math.max(0, baseWind + latFactor + lngFactor),
        waveHeight: Math.max(0.1, baseWave + (latFactor + lngFactor) / 20),
        windDirection
    };
}

function getWindDirectionText(degrees) {
    const directions = ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB'];
    const index = Math.round(degrees / 45) % 8;
    return directions[index];
}

// ===== UI Updates =====
function updateRouteStats() {
    const totalDistance = getTotalDistance();
    const estimatedHours = totalDistance / state.settings.avgSpeed;
    const fuelNeeded = estimatedHours * state.settings.fuelRate;
    const fuelCost = fuelNeeded * state.settings.fuelPrice;

    document.getElementById('totalDistance').textContent =
        `${totalDistance.toFixed(1)} km`;
    document.getElementById('estimatedTime').textContent =
        formatDuration(estimatedHours);
    document.getElementById('fuelConsumption').textContent =
        `${fuelNeeded.toFixed(1)} litre`;
    document.getElementById('fuelCost').textContent =
        `${fuelCost.toFixed(0)} ₺`;

    // Yakıt uyarısı
    if (fuelNeeded > state.settings.tankCapacity) {
        document.getElementById('fuelConsumption').style.color = '#e63946';
        document.getElementById('fuelConsumption').textContent += ' ⚠️';
    } else {
        document.getElementById('fuelConsumption').style.color = '';
    }

    // Tahmini varış güncelle
    updateEstimatedArrival(estimatedHours);
}

function formatDuration(hours) {
    if (hours < 1) {
        return `${Math.round(hours * 60)} dakika`;
    }
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    if (m === 0) {
        return `${h} saat`;
    }
    return `${h} saat ${m} dk`;
}

function updateEstimatedArrival(estimatedHours) {
    const dateInput = document.getElementById('departureDate');
    const timeInput = document.getElementById('departureTime');
    const arrivalEl = document.getElementById('estimatedArrival');

    if (!dateInput.value || !timeInput.value || state.waypoints.length < 2) {
        arrivalEl.textContent = '--';
        return;
    }

    const departure = new Date(`${dateInput.value}T${timeInput.value}`);
    const arrival = new Date(departure.getTime() + estimatedHours * 60 * 60 * 1000);

    const options = {
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit'
    };
    arrivalEl.textContent = arrival.toLocaleDateString('tr-TR', options);
}

function updateWaypointsList() {
    const container = document.getElementById('waypointsList');

    if (state.waypoints.length === 0) {
        container.innerHTML = '<p class="empty-message">Henüz nokta eklenmedi</p>';
        return;
    }

    container.innerHTML = state.waypoints.map((wp, index) => {
        const windDirection = getWindDirectionText(wp.weather.windDirection);
        return `
            <div class="waypoint-item" onclick="focusWaypoint(${index})">
                <span class="waypoint-number ${wp.riskLevel}">${index + 1}</span>
                <div class="waypoint-info">
                    <div class="waypoint-coords">${wp.lat.toFixed(4)}°, ${wp.lng.toFixed(4)}°</div>
                    <div class="waypoint-weather">
                        <i class="fas fa-wind"></i> ${wp.weather.windSpeed.toFixed(0)} km/s ${windDirection}
                        <i class="fas fa-water"></i> ${wp.weather.waveHeight.toFixed(1)}m
                    </div>
                </div>
                <button class="waypoint-delete" onclick="event.stopPropagation(); removeWaypoint(${index})" title="Sil">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
    }).join('');
}

function focusWaypoint(index) {
    const wp = state.waypoints[index];
    map.setView([wp.lat, wp.lng], 12);
    state.markers[index].openPopup();
}

// ===== Settings =====
function openSettings() {
    document.getElementById('settingsModal').classList.remove('hidden');
    loadSettingsToForm();
}

function closeSettings() {
    document.getElementById('settingsModal').classList.add('hidden');
}

function loadSettingsToForm() {
    document.getElementById('boatName').value = state.settings.boatName;
    document.getElementById('boatType').value = state.settings.boatType;
    document.getElementById('avgSpeed').value = state.settings.avgSpeed;
    document.getElementById('fuelRate').value = state.settings.fuelRate;
    document.getElementById('tankCapacity').value = state.settings.tankCapacity;
    document.getElementById('fuelPrice').value = state.settings.fuelPrice;
}

function saveSettings() {
    state.settings = {
        boatName: document.getElementById('boatName').value,
        boatType: document.getElementById('boatType').value,
        avgSpeed: parseFloat(document.getElementById('avgSpeed').value) || 20,
        fuelRate: parseFloat(document.getElementById('fuelRate').value) || 15,
        tankCapacity: parseFloat(document.getElementById('tankCapacity').value) || 200,
        fuelPrice: parseFloat(document.getElementById('fuelPrice').value) || 45
    };

    // LocalStorage'a kaydet
    localStorage.setItem('denizRotaSettings', JSON.stringify(state.settings));

    // Rota istatistiklerini güncelle
    updateRouteStats();
    closeSettings();
}

function loadSettings() {
    const saved = localStorage.getItem('denizRotaSettings');
    if (saved) {
        try {
            state.settings = { ...state.settings, ...JSON.parse(saved) };
        } catch (e) {
            console.warn('Ayarlar yüklenemedi:', e);
        }
    }
}

// ===== Initialization =====
function init() {
    // Haritayı başlat
    initMap();

    // Ayarları yükle
    loadSettings();

    // Varsayılan tarih/saat
    const now = new Date();
    document.getElementById('departureDate').value = now.toISOString().split('T')[0];
    document.getElementById('departureTime').value = now.toTimeString().slice(0, 5);

    // Event listeners
    document.getElementById('routeModeBtn').addEventListener('click', toggleRouteMode);
    document.getElementById('clearRouteBtn').addEventListener('click', clearRoute);
    document.getElementById('settingsBtn').addEventListener('click', openSettings);
    document.getElementById('closeSettingsBtn').addEventListener('click', closeSettings);
    document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);

    // Modal overlay tıklama
    document.querySelector('.modal-overlay').addEventListener('click', closeSettings);

    // Tarih/saat değişikliği
    document.getElementById('departureDate').addEventListener('change', () => updateRouteStats());
    document.getElementById('departureTime').addEventListener('change', () => updateRouteStats());

    // Keyboard shortcut
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (!document.getElementById('settingsModal').classList.contains('hidden')) {
                closeSettings();
            } else if (state.routeMode) {
                toggleRouteMode();
            }
        }
        // R tuşu ile rota modu toggle
        if (e.key === 'r' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== 'INPUT') {
            toggleRouteMode();
        }
    });

    console.log('DenizRota başlatıldı! 🚤');
}

// Sayfa yüklendiğinde başlat
document.addEventListener('DOMContentLoaded', init);

// Global fonksiyonlar (HTML onclick için)
window.removeWaypoint = removeWaypoint;
window.focusWaypoint = focusWaypoint;
