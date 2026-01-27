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
    windOverlayVisible: false,
    waveOverlayVisible: false,
    windLayer: null,
    waveLayer: null,
    weatherCache: new Map(), // API sonuçlarını cache'le
    settings: {
        boatName: '',
        boatType: 'motorlu',
        avgSpeed: 20,
        fuelRate: 15,
        tankCapacity: 200,
        fuelPrice: 45
    }
};

// ===== Open-Meteo API =====
const OPEN_METEO_MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine';
const OPEN_METEO_WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';

async function fetchMarineWeather(lat, lng) {
    const cacheKey = `${lat.toFixed(2)}_${lng.toFixed(2)}`;

    // Cache kontrolü (1 saat geçerli)
    if (state.weatherCache.has(cacheKey)) {
        const cached = state.weatherCache.get(cacheKey);
        if (Date.now() - cached.timestamp < 3600000) {
            return cached.data;
        }
    }

    try {
        // Marine API (dalga verileri)
        const marineParams = new URLSearchParams({
            latitude: lat.toFixed(4),
            longitude: lng.toFixed(4),
            hourly: 'wave_height,wave_direction,wave_period',
            forecast_days: 7,
            timezone: 'auto'
        });

        // Weather API (rüzgar ve sıcaklık)
        const weatherParams = new URLSearchParams({
            latitude: lat.toFixed(4),
            longitude: lng.toFixed(4),
            hourly: 'wind_speed_10m,wind_direction_10m,temperature_2m',
            forecast_days: 7,
            timezone: 'auto'
        });

        const [marineRes, weatherRes] = await Promise.all([
            fetch(`${OPEN_METEO_MARINE_URL}?${marineParams}`),
            fetch(`${OPEN_METEO_WEATHER_URL}?${weatherParams}`)
        ]);

        if (!marineRes.ok || !weatherRes.ok) {
            throw new Error('API hatası');
        }

        const marineData = await marineRes.json();
        const weatherData = await weatherRes.json();

        const result = {
            marine: marineData,
            weather: weatherData
        };

        // Cache'e kaydet
        state.weatherCache.set(cacheKey, {
            timestamp: Date.now(),
            data: result
        });

        return result;
    } catch (error) {
        console.error('Hava durumu API hatası:', error);
        return null;
    }
}

function getWeatherFromAPI(apiData, dateTime) {
    if (!apiData || !apiData.marine || !apiData.weather) {
        return null;
    }

    const targetTime = dateTime.toISOString().slice(0, 13) + ':00';

    // Marine verileri
    const marineHourly = apiData.marine.hourly;
    const marineIndex = marineHourly.time.findIndex(t => t === targetTime);

    // Weather verileri
    const weatherHourly = apiData.weather.hourly;
    const weatherIndex = weatherHourly.time.findIndex(t => t === targetTime);

    // En yakın saati bul (eğer exact match yoksa)
    const mIdx = marineIndex >= 0 ? marineIndex : findClosestTimeIndex(marineHourly.time, dateTime);
    const wIdx = weatherIndex >= 0 ? weatherIndex : findClosestTimeIndex(weatherHourly.time, dateTime);

    if (mIdx < 0 || wIdx < 0) {
        return null;
    }

    return {
        waveHeight: marineHourly.wave_height?.[mIdx] || 0,
        waveDirection: marineHourly.wave_direction?.[mIdx] || 0,
        wavePeriod: marineHourly.wave_period?.[mIdx] || 0,
        windSpeed: (weatherHourly.wind_speed_10m?.[wIdx] || 0), // km/s
        windDirection: weatherHourly.wind_direction_10m?.[wIdx] || 0,
        temperature: weatherHourly.temperature_2m?.[wIdx] || 20
    };
}

function findClosestTimeIndex(times, targetDate) {
    const targetMs = targetDate.getTime();
    let closestIdx = 0;
    let closestDiff = Infinity;

    for (let i = 0; i < times.length; i++) {
        const diff = Math.abs(new Date(times[i]).getTime() - targetMs);
        if (diff < closestDiff) {
            closestDiff = diff;
            closestIdx = i;
        }
    }

    return closestIdx;
}

// ===== Map Initialization =====
let map;

function initMap() {
    map = L.map('map', {
        center: [40.7, 28.9],
        zoom: 9,
        zoomControl: true
    });

    // Base map layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    // Sea map overlay
    L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenSeaMap contributors'
    }).addTo(map);

    // Map click handler
    map.on('click', handleMapClick);

    // Create wind/wave overlay layers
    createWeatherOverlays();
}

// ===== Weather Overlays =====
function createWeatherOverlays() {
    state.windLayer = L.layerGroup();
    state.waveLayer = L.layerGroup();
}

// Türkiye çevresindeki deniz alanları (basit polygon kontrolü)
const SEA_AREAS = [
    // Marmara Denizi
    { name: 'Marmara', bounds: { minLat: 40.3, maxLat: 41.1, minLng: 26.5, maxLng: 29.9 } },
    // Ege Denizi (Türkiye kıyıları)
    { name: 'Ege', bounds: { minLat: 36.5, maxLat: 40.3, minLng: 25.5, maxLng: 27.5 } },
    // Karadeniz (Türkiye kıyıları)
    { name: 'Karadeniz', bounds: { minLat: 41.0, maxLat: 43.0, minLng: 28.0, maxLng: 41.5 } },
    // Akdeniz (Türkiye kıyıları)
    { name: 'Akdeniz', bounds: { minLat: 35.5, maxLat: 37.0, minLng: 27.5, maxLng: 36.5 } },
    // İstanbul Boğazı
    { name: 'Boğaz', bounds: { minLat: 40.9, maxLat: 41.3, minLng: 28.9, maxLng: 29.2 } },
];

// Kara alanları (deniz içindeki yarımadalar ve büyük adalar hariç tutmak için)
const LAND_EXCLUSIONS = [
    // Trakya yarımadası (Marmara'nın kuzeyinde)
    { minLat: 40.85, maxLat: 42.0, minLng: 26.5, maxLng: 28.0 },
    // Anadolu (Marmara'nın güneyinde)
    { minLat: 39.8, maxLat: 40.55, minLng: 28.5, maxLng: 30.5 },
    // Kapıdağ Yarımadası
    { minLat: 40.35, maxLat: 40.55, minLng: 27.8, maxLng: 28.3 },
];

function isInSea(lat, lng) {
    // Önce deniz alanında mı kontrol et
    let inSea = false;
    for (const sea of SEA_AREAS) {
        if (lat >= sea.bounds.minLat && lat <= sea.bounds.maxLat &&
            lng >= sea.bounds.minLng && lng <= sea.bounds.maxLng) {
            inSea = true;
            break;
        }
    }

    if (!inSea) return false;

    // Kara hariç tutma alanlarında mı kontrol et
    for (const land of LAND_EXCLUSIONS) {
        if (lat >= land.minLat && lat <= land.maxLat &&
            lng >= land.minLng && lng <= land.maxLng) {
            return false;
        }
    }

    return true;
}

function generateWindOverlay() {
    state.windLayer.clearLayers();

    const bounds = map.getBounds();
    const departureDate = getDepartureDateTime();

    // Generate wind arrows grid - only on sea
    const latStep = (bounds.getNorth() - bounds.getSouth()) / 8;
    const lngStep = (bounds.getEast() - bounds.getWest()) / 10;

    for (let lat = bounds.getSouth(); lat <= bounds.getNorth(); lat += latStep) {
        for (let lng = bounds.getWest(); lng <= bounds.getEast(); lng += lngStep) {
            // Sadece deniz alanlarında göster
            if (!isInSea(lat, lng)) continue;

            const weather = getWeatherForDateTime(lat, lng, departureDate);
            // Veri yoksa atla
            if (!weather) continue;

            const arrow = createWindArrow(lat, lng, weather);
            state.windLayer.addLayer(arrow);
        }
    }

    state.windLayer.addTo(map);
}

function createWindArrow(lat, lng, weather) {
    const color = getWindColor(weather.windSpeed);
    const rotation = weather.windDirection;
    const size = Math.min(30, 15 + weather.windSpeed / 3);

    const icon = L.divIcon({
        className: 'wind-arrow',
        html: `<div style="
            transform: rotate(${rotation}deg);
            color: ${color};
            font-size: ${size}px;
            text-shadow: 0 1px 2px rgba(0,0,0,0.5);
        "><i class="fas fa-location-arrow"></i></div>`,
        iconSize: [size, size],
        iconAnchor: [size/2, size/2]
    });

    return L.marker([lat, lng], { icon, interactive: false });
}

function getWindColor(speed) {
    if (speed < 10) return '#2ecc71';
    if (speed < 20) return '#f1c40f';
    if (speed < 30) return '#e67e22';
    if (speed < 40) return '#e74c3c';
    return '#8e44ad';
}

function generateWaveOverlay() {
    state.waveLayer.clearLayers();

    const bounds = map.getBounds();
    const departureDate = getDepartureDateTime();

    const latStep = (bounds.getNorth() - bounds.getSouth()) / 10;
    const lngStep = (bounds.getEast() - bounds.getWest()) / 12;

    for (let lat = bounds.getSouth(); lat <= bounds.getNorth(); lat += latStep) {
        for (let lng = bounds.getWest(); lng <= bounds.getEast(); lng += lngStep) {
            // Sadece deniz alanlarında göster
            if (!isInSea(lat, lng)) continue;

            const weather = getWeatherForDateTime(lat, lng, departureDate);
            // Veri yoksa atla
            if (!weather) continue;

            const waveMarker = createWaveMarker(lat, lng, weather);
            state.waveLayer.addLayer(waveMarker);
        }
    }

    state.waveLayer.addTo(map);
}

function createWaveMarker(lat, lng, weather) {
    const color = getWaveColor(weather.waveHeight);

    const icon = L.divIcon({
        className: 'wave-marker',
        html: `<div style="
            width: 24px;
            height: 24px;
            background: ${color};
            border-radius: 50%;
            opacity: 0.6;
            border: 2px solid white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            color: white;
            font-weight: bold;
        ">${weather.waveHeight.toFixed(1)}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });

    return L.marker([lat, lng], { icon, interactive: false });
}

function getWaveColor(height) {
    if (height < 0.5) return '#3498db';
    if (height < 1) return '#2ecc71';
    if (height < 1.5) return '#f1c40f';
    if (height < 2) return '#e67e22';
    return '#e74c3c';
}

function toggleWindOverlay() {
    const btn = document.getElementById('toggleWindBtn');
    state.windOverlayVisible = !state.windOverlayVisible;

    if (state.windOverlayVisible) {
        btn.classList.add('active');
        document.getElementById('windLegend').classList.remove('hidden');
        generateWindOverlay();
        map.on('moveend', generateWindOverlay);
    } else {
        btn.classList.remove('active');
        document.getElementById('windLegend').classList.add('hidden');
        state.windLayer.clearLayers();
        map.off('moveend', generateWindOverlay);
    }
}

function toggleWaveOverlay() {
    const btn = document.getElementById('toggleWaveBtn');
    state.waveOverlayVisible = !state.waveOverlayVisible;

    if (state.waveOverlayVisible) {
        btn.classList.add('active');
        document.getElementById('waveLegend').classList.remove('hidden');
        generateWaveOverlay();
        map.on('moveend', generateWaveOverlay);
    } else {
        btn.classList.remove('active');
        document.getElementById('waveLegend').classList.add('hidden');
        state.waveLayer.clearLayers();
        map.off('moveend', generateWaveOverlay);
    }
}

// ===== Event Handlers =====
function handleMapClick(e) {
    const { lat, lng } = e.latlng;

    if (state.routeMode) {
        addWaypoint(lat, lng);
    } else {
        showWeatherPanel(lat, lng);
    }
}

async function showWeatherPanel(lat, lng) {
    const panel = document.getElementById('weatherPanel');
    const inSea = isInSea(lat, lng);

    // Loading durumu göster
    document.getElementById('weatherCoords').textContent =
        `${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E` + (inSea ? '' : ' (Kara)');
    document.getElementById('weatherWind').textContent = 'Yükleniyor...';
    document.getElementById('weatherDirection').textContent = '--';
    document.getElementById('weatherWave').textContent = inSea ? 'Yükleniyor...' : '-- (kara)';
    document.getElementById('weatherTemp').textContent = '--';
    panel.classList.remove('hidden');

    // API'den veri al
    const departureDate = getDepartureDateTime();
    const weather = await getWeatherForDateTimeAsync(lat, lng, departureDate);

    // Veri yoksa göster
    if (!weather) {
        document.getElementById('weatherWind').textContent = 'Veri yok';
        document.getElementById('weatherDirection').textContent = '--';
        document.getElementById('weatherWave').textContent = 'Veri yok';
        document.getElementById('weatherTemp').textContent = '--';
    } else {
        const windDirection = getWindDirectionText(weather.windDirection);
        document.getElementById('weatherWind').textContent =
            `${weather.windSpeed.toFixed(1)} km/s`;
        document.getElementById('weatherDirection').textContent =
            `${windDirection} (${weather.windDirection}°)`;
        document.getElementById('weatherWave').textContent =
            inSea ? `${weather.waveHeight.toFixed(1)} m` : '-- (kara)';
        document.getElementById('weatherTemp').textContent =
            `${weather.temperature.toFixed(0)} °C`;
    }

    // Windy link
    const windyUrl = `https://windy.app/tr/forecast2/spot/${Math.abs(Math.floor(lat * 100))}${Math.abs(Math.floor(lng * 100))}/Konum+${lat.toFixed(2)}+${lng.toFixed(2)}`;
    document.getElementById('windyLink').href = windyUrl;
}

function closeWeatherPanel() {
    document.getElementById('weatherPanel').classList.add('hidden');
}

function toggleRouteMode() {
    state.routeMode = !state.routeMode;
    const btn = document.getElementById('routeModeBtn');
    const instructions = document.getElementById('mapInstructions');

    if (state.routeMode) {
        btn.classList.add('active');
        instructions.classList.remove('hidden');
        closeWeatherPanel();
    } else {
        btn.classList.remove('active');
        instructions.classList.add('hidden');
    }
}

function clearRoute() {
    state.markers.forEach(marker => map.removeLayer(marker));
    state.markers = [];
    state.waypoints = [];

    if (state.polyline) {
        map.removeLayer(state.polyline);
        state.polyline = null;
    }

    updateRouteStats();
    updateWaypointsList();
}

// ===== Waypoint Management =====
async function addWaypoint(lat, lng) {
    const departureDate = getDepartureDateTime();

    // Önce placeholder waypoint ekle (loading durumu)
    const waypoint = {
        id: Date.now(),
        lat,
        lng,
        weather: null,
        riskLevel: 'gray',
        loading: true
    };

    state.waypoints.push(waypoint);
    const marker = createMarker(waypoint, state.waypoints.length);
    state.markers.push(marker);
    marker.addTo(map);

    updatePolyline();
    updateRouteStats();
    updateWaypointsList();

    // API'den gerçek veri al
    const weather = await getWeatherForDateTimeAsync(lat, lng, departureDate);
    const idx = state.waypoints.length - 1;

    state.waypoints[idx] = {
        ...waypoint,
        weather,
        riskLevel: weather ? calculateRiskLevel(weather) : 'gray',
        loading: false
    };

    // Marker'ı güncelle
    map.removeLayer(state.markers[idx]);
    const newMarker = createMarker(state.waypoints[idx], idx + 1);
    state.markers[idx] = newMarker;
    newMarker.addTo(map);

    updatePolyline();
    updateRouteStats();
    updateWaypointsList();
}

function removeWaypoint(index) {
    map.removeLayer(state.markers[index]);
    state.markers.splice(index, 1);
    state.waypoints.splice(index, 1);

    // Renumber markers
    state.markers.forEach((marker, i) => {
        map.removeLayer(marker);
        const newMarker = createMarker(state.waypoints[i], i + 1);
        state.markers[i] = newMarker;
        newMarker.addTo(map);
    });

    updatePolyline();
    updateRouteStats();
    updateWaypointsList();
}

async function updateWaypointPosition(index, lat, lng) {
    const departureDate = getDepartureDateTime();

    // Önce konumu güncelle (hızlı feedback için)
    state.waypoints[index].lat = lat;
    state.waypoints[index].lng = lng;
    state.waypoints[index].riskLevel = 'gray';
    state.waypoints[index].loading = true;
    updatePolyline();
    updateRouteStats();

    // API'den yeni hava durumu al
    const weather = await getWeatherForDateTimeAsync(lat, lng, departureDate);

    state.waypoints[index] = {
        ...state.waypoints[index],
        lat,
        lng,
        weather,
        riskLevel: weather ? calculateRiskLevel(weather) : 'gray',
        loading: false
    };

    // Marker'ı güncelle
    map.removeLayer(state.markers[index]);
    const newMarker = createMarker(state.waypoints[index], index + 1);
    state.markers[index] = newMarker;
    newMarker.addTo(map);

    updateWaypointsList();
}

function createMarker(waypoint, number) {
    const riskClass = waypoint.riskLevel;

    const icon = L.divIcon({
        className: 'custom-marker',
        html: `
            <div class="marker-pin ${riskClass}"></div>
            <div class="marker-number">${number}</div>
        `,
        iconSize: [32, 42],
        iconAnchor: [16, 42],
        popupAnchor: [0, -35]
    });

    // Create DRAGGABLE marker
    const marker = L.marker([waypoint.lat, waypoint.lng], {
        icon,
        draggable: true
    });

    // Drag event handlers
    marker.on('dragstart', function() {
        if (state.polyline) {
            state.polyline.setStyle({ opacity: 0.3 });
        }
    });

    marker.on('drag', function(e) {
        const idx = state.markers.indexOf(marker);
        if (idx !== -1 && state.polyline) {
            const latlngs = state.polyline.getLatLngs();
            latlngs[idx] = e.latlng;
            state.polyline.setLatLngs(latlngs);
        }
    });

    marker.on('dragend', function(e) {
        const idx = state.markers.indexOf(marker);
        if (idx !== -1) {
            const { lat, lng } = e.target.getLatLng();
            updateWaypointPosition(idx, lat, lng);
        }
        if (state.polyline) {
            state.polyline.setStyle({ opacity: 0.8 });
        }
    });

    // Popup
    const popupContent = createPopupContent(waypoint, number);
    marker.bindPopup(popupContent);

    return marker;
}

function createPopupContent(waypoint, number) {
    const hasWeather = waypoint.weather !== null;
    const windDirection = hasWeather ? getWindDirectionText(waypoint.weather.windDirection) : '--';
    const departureDate = getDepartureDateTime();
    const dateStr = departureDate.toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    });

    const windyUrl = `https://windy.app/tr/forecast2/spot/${Math.abs(Math.floor(waypoint.lat * 100))}${Math.abs(Math.floor(waypoint.lng * 100))}/Nokta${number}`;

    const weatherContent = hasWeather ? `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
            <div style="text-align: center; padding: 8px; background: #f1f3f5; border-radius: 6px;">
                <i class="fas fa-wind" style="color: #0077b6;"></i><br>
                <strong>${waypoint.weather.windSpeed.toFixed(1)}</strong> km/s<br>
                <small style="color: #888;">${windDirection}</small>
            </div>
            <div style="text-align: center; padding: 8px; background: #f1f3f5; border-radius: 6px;">
                <i class="fas fa-water" style="color: #0077b6;"></i><br>
                <strong>${waypoint.weather.waveHeight.toFixed(1)}</strong> m<br>
                <small style="color: #888;">Dalga</small>
            </div>
        </div>
    ` : `
        <div style="text-align: center; padding: 16px; background: #f1f3f5; border-radius: 6px; margin-bottom: 12px; color: #666;">
            <i class="fas fa-exclamation-circle" style="font-size: 1.5rem; margin-bottom: 8px; display: block;"></i>
            Bu konum için hava durumu verisi bulunamadı
        </div>
    `;

    return `
        <div style="padding: 12px; min-width: 200px;">
            <div style="background: linear-gradient(135deg, #0077b6, #00b4d8); color: white; margin: -12px -12px 12px -12px; padding: 10px 12px; font-weight: 600;">
                <i class="fas fa-map-marker-alt"></i> Nokta ${number}
            </div>
            <div style="font-size: 0.8rem; color: #666; margin-bottom: 8px;">
                <i class="fas fa-calendar"></i> ${dateStr}
            </div>
            ${weatherContent}
            <a href="${windyUrl}" target="_blank" style="
                display: block;
                background: linear-gradient(135deg, #48cae4, #0096c7);
                color: white;
                text-decoration: none;
                padding: 8px;
                border-radius: 6px;
                text-align: center;
                font-weight: 500;
                font-size: 0.85rem;
            ">
                <i class="fas fa-external-link-alt"></i> Windy.app'te Aç
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

// ===== Date/Time Based Weather =====
function getDepartureDateTime() {
    const dateInput = document.getElementById('departureDate').value;
    const timeInput = document.getElementById('departureTime').value;

    if (dateInput && timeInput) {
        return new Date(`${dateInput}T${timeInput}`);
    }
    return new Date();
}

// Async versiyon - API'den veri çeker (fallback yok)
async function getWeatherForDateTimeAsync(lat, lng, dateTime) {
    try {
        const apiData = await fetchMarineWeather(lat, lng);
        if (apiData) {
            const weather = getWeatherFromAPI(apiData, dateTime);
            if (weather) {
                return weather;
            }
        }
    } catch (error) {
        console.warn('API hatası:', error);
    }

    // Veri yoksa null döndür
    return null;
}

// Senkron versiyon (overlay'ler için - sadece cache'den bakar)
function getWeatherForDateTime(lat, lng, dateTime) {
    const cacheKey = `${lat.toFixed(2)}_${lng.toFixed(2)}`;

    // Cache'de varsa API verisini kullan
    if (state.weatherCache.has(cacheKey)) {
        const cached = state.weatherCache.get(cacheKey);
        const weather = getWeatherFromAPI(cached.data, dateTime);
        if (weather) return weather;
    }

    // Veri yoksa null döndür
    return null;
}

function getDayOfYear(date) {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date - start;
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
}

async function updateAllWeatherData() {
    const departureDate = getDepartureDateTime();
    const btn = document.getElementById('updateWeatherBtn');

    // Loading durumu
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
        // Tüm waypoint'ler için paralel API çağrıları
        const weatherPromises = state.waypoints.map(wp =>
            getWeatherForDateTimeAsync(wp.lat, wp.lng, departureDate)
        );

        const weatherResults = await Promise.all(weatherPromises);

        // Waypoint'leri güncelle
        weatherResults.forEach((weather, index) => {
            state.waypoints[index].weather = weather;
            state.waypoints[index].riskLevel = weather ? calculateRiskLevel(weather) : 'gray';

            // Marker'ı güncelle
            map.removeLayer(state.markers[index]);
            const newMarker = createMarker(state.waypoints[index], index + 1);
            state.markers[index] = newMarker;
            newMarker.addTo(map);
        });

        // Overlay'leri güncelle
        if (state.windOverlayVisible) {
            generateWindOverlay();
        }
        if (state.waveOverlayVisible) {
            generateWaveOverlay();
        }

        updateWaypointsList();
        updateRouteStats();

    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-sync-alt"></i>';
    }
}

// ===== Calculations =====
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371;
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
    if (weather.windSpeed >= 30 || weather.waveHeight >= 1.5) return 'red';
    if (weather.windSpeed >= 15 || weather.waveHeight >= 0.5) return 'yellow';
    return 'green';
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

    document.getElementById('totalDistance').textContent = totalDistance.toFixed(1);
    document.getElementById('estimatedTime').textContent = formatDurationShort(estimatedHours);
    document.getElementById('fuelConsumption').textContent = fuelNeeded.toFixed(0);
    document.getElementById('fuelCost').textContent = fuelCost.toFixed(0);

    // Fuel warning
    const fuelEl = document.getElementById('fuelConsumption');
    if (fuelNeeded > state.settings.tankCapacity) {
        fuelEl.style.color = '#e63946';
    } else {
        fuelEl.style.color = '';
    }

    updateEstimatedArrival(estimatedHours);
}

function formatDurationShort(hours) {
    if (hours < 1) return Math.round(hours * 60) + ' dk';
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m > 0 ? `${h}:${m.toString().padStart(2, '0')}` : h.toString();
}

function updateEstimatedArrival(estimatedHours) {
    const arrivalEl = document.getElementById('estimatedArrival');

    if (state.waypoints.length < 2) {
        arrivalEl.textContent = '--';
        return;
    }

    const departure = getDepartureDateTime();
    const arrival = new Date(departure.getTime() + estimatedHours * 60 * 60 * 1000);

    const options = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' };
    arrivalEl.textContent = arrival.toLocaleDateString('tr-TR', options);
}

function updateWaypointsList() {
    const container = document.getElementById('waypointsList');
    const countBadge = document.getElementById('waypointCount');

    countBadge.textContent = state.waypoints.length;

    if (state.waypoints.length === 0) {
        container.innerHTML = `
            <p class="empty-message">
                <i class="fas fa-hand-pointer"></i>
                Rota modunu açıp haritaya tıklayın
            </p>
        `;
        return;
    }

    container.innerHTML = state.waypoints.map((wp, index) => {
        const hasWeather = wp.weather !== null;
        const windDirection = hasWeather ? getWindDirectionText(wp.weather.windDirection) : '--';
        const weatherInfo = hasWeather
            ? `<i class="fas fa-wind"></i> ${wp.weather.windSpeed.toFixed(0)} km/s ${windDirection}
               &nbsp;
               <i class="fas fa-water"></i> ${wp.weather.waveHeight.toFixed(1)}m`
            : '<i class="fas fa-exclamation-circle"></i> Veri yok';

        return `
            <div class="waypoint-item ${wp.riskLevel}" onclick="focusWaypoint(${index})">
                <span class="waypoint-number ${wp.riskLevel}">${index + 1}</span>
                <div class="waypoint-info">
                    <div class="waypoint-coords">${wp.lat.toFixed(4)}°, ${wp.lng.toFixed(4)}°</div>
                    <div class="waypoint-weather">
                        ${weatherInfo}
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

    localStorage.setItem('denizRotaSettings', JSON.stringify(state.settings));
    updateRouteStats();
    closeSettings();
}

function loadSettings() {
    const saved = localStorage.getItem('denizRotaSettings');
    if (saved) {
        try {
            state.settings = { ...state.settings, ...JSON.parse(saved) };
        } catch (e) {
            console.warn('Settings could not be loaded:', e);
        }
    }
}

// ===== Initialization =====
function init() {
    initMap();
    loadSettings();

    // Default date/time
    const now = new Date();
    document.getElementById('departureDate').value = now.toISOString().split('T')[0];
    document.getElementById('departureTime').value = now.toTimeString().slice(0, 5);

    // Event listeners
    document.getElementById('routeModeBtn').addEventListener('click', toggleRouteMode);
    document.getElementById('clearRouteBtn').addEventListener('click', clearRoute);
    document.getElementById('toggleWindBtn').addEventListener('click', toggleWindOverlay);
    document.getElementById('toggleWaveBtn').addEventListener('click', toggleWaveOverlay);
    document.getElementById('settingsBtn').addEventListener('click', openSettings);
    document.getElementById('closeSettingsBtn').addEventListener('click', closeSettings);
    document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
    document.getElementById('closeWeatherPanel').addEventListener('click', closeWeatherPanel);
    document.getElementById('updateWeatherBtn').addEventListener('click', updateAllWeatherData);

    // Modal overlay click
    document.querySelector('.modal-overlay').addEventListener('click', closeSettings);

    // Date/time change
    document.getElementById('departureDate').addEventListener('change', updateAllWeatherData);
    document.getElementById('departureTime').addEventListener('change', updateAllWeatherData);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (!document.getElementById('settingsModal').classList.contains('hidden')) {
                closeSettings();
            } else if (!document.getElementById('weatherPanel').classList.contains('hidden')) {
                closeWeatherPanel();
            } else if (state.routeMode) {
                toggleRouteMode();
            }
        }
        if (e.key === 'r' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== 'INPUT') {
            toggleRouteMode();
        }
    });

    console.log('DenizRota v2.0 başlatıldı! 🚤');
}

document.addEventListener('DOMContentLoaded', init);

// Global functions for HTML onclick
window.removeWaypoint = removeWaypoint;
window.focusWaypoint = focusWaypoint;
