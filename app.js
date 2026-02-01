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
    windLayer: null,
    windCanvas: null,
    windAnimationId: null,
    windParticles: [],
    waveOverlayVisible: false,
    waveLayer: null,
    waveCanvas: null,
    waveAnimationId: null,
    weatherCache: new Map(), // API sonuçlarını cache'le
    windGridData: [], // Rüzgar grid verisi
    waveGridData: [], // Dalga grid verisi
    // Weather auto-refresh
    weatherRefreshInterval: null,
    // Fullscreen state
    isFullscreen: false,
    // Trip tracking state
    tripActive: false,
    tripStartTime: null,
    tripTimerInterval: null,
    tripWatchId: null,
    tripPositions: [],
    tripCurrentSpeed: 0,
    tripMaxSpeed: 0,
    tripTotalDistance: 0,
    tripLastPosition: null,
    currentTrip: null,
    // User location marker
    userLocationMarker: null,
    userAccuracyCircle: null,
    // Trip route polyline
    tripPolyline: null,
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
const OPEN_METEO_WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const OPEN_METEO_MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine';

// ===== Türkiye Kıyı Çizgisi (Basitleştirilmiş) =====
// Ege ve Akdeniz kıyıları için fetch hesaplamasında kullanılır
// Format: [lng, lat] - her nokta bir kıyı noktası

const COASTLINE_POINTS = [
    // Datça Yarımadası - Kuzey Kıyı (Hisarönü/Gökova tarafı)
    [27.70, 36.75], [27.75, 36.76], [27.80, 36.77], [27.85, 36.78],
    [27.90, 36.78], [27.95, 36.77], [28.00, 36.76], [28.05, 36.75],
    [28.10, 36.74], [28.15, 36.73], [28.20, 36.72], [28.25, 36.72],
    [28.30, 36.71], [28.35, 36.71], [28.40, 36.71], [28.45, 36.71],
    [28.50, 36.72], [28.55, 36.72], [28.60, 36.73], [28.65, 36.74],
    [28.70, 36.75], [28.75, 36.76],

    // Datça Yarımadası - Güney Kıyı (Akdeniz tarafı)
    [27.70, 36.70], [27.75, 36.69], [27.80, 36.68], [27.85, 36.68],
    [27.90, 36.67], [27.95, 36.67], [28.00, 36.67], [28.05, 36.67],
    [28.10, 36.68], [28.15, 36.68], [28.20, 36.69], [28.25, 36.69],
    [28.30, 36.69], [28.35, 36.69], [28.40, 36.70], [28.45, 36.70],
    [28.50, 36.70], [28.55, 36.70], [28.60, 36.71],

    // Datça Yarımadası Ucu (Knidos)
    [28.70, 36.69], [28.72, 36.68], [28.75, 36.68],

    // Bozburun Yarımadası
    [28.00, 36.65], [28.05, 36.62], [28.10, 36.60], [28.15, 36.58],
    [28.20, 36.60], [28.25, 36.62], [28.30, 36.65],

    // Marmaris - Bozburun arası
    [28.30, 36.78], [28.35, 36.80], [28.40, 36.82], [28.45, 36.84],
    [28.50, 36.85], [28.55, 36.84], [28.60, 36.82], [28.65, 36.80],

    // Symi Adası (Yunanistan) - Fetch hesabı için önemli
    [27.80, 36.60], [27.82, 36.58], [27.85, 36.56], [27.87, 36.55],
    [27.88, 36.58], [27.86, 36.61], [27.83, 36.62],

    // Kos Adası (kuzey kıyısı)
    [27.00, 36.85], [27.05, 36.87], [27.10, 36.88], [27.15, 36.88],
    [27.20, 36.87], [27.25, 36.86],

    // Bodrum Yarımadası
    [27.20, 37.05], [27.25, 37.03], [27.30, 37.00], [27.35, 36.98],
    [27.40, 36.95], [27.42, 36.92], [27.40, 36.88], [27.35, 36.85],
    [27.30, 36.83], [27.25, 36.82], [27.20, 36.83], [27.15, 36.85],
    [27.12, 36.88], [27.10, 36.92], [27.12, 36.96], [27.15, 37.00],

    // Gökova Körfezi Kuzey Kıyısı
    [27.50, 37.05], [27.55, 37.06], [27.60, 37.07], [27.65, 37.08],
    [27.70, 37.08], [27.75, 37.08], [27.80, 37.07], [27.85, 37.06],
    [27.90, 37.04], [27.95, 37.02], [28.00, 37.00], [28.05, 36.98],
    [28.10, 36.95], [28.15, 36.92], [28.20, 36.88], [28.25, 36.85],

    // Fethiye - Ölüdeniz
    [29.00, 36.65], [29.05, 36.62], [29.10, 36.58], [29.12, 36.55],
    [29.10, 36.52], [29.05, 36.50], [29.00, 36.48],

    // Kaş - Kalkan
    [29.60, 36.20], [29.65, 36.18], [29.70, 36.15], [29.75, 36.12],
    [29.80, 36.10], [29.85, 36.12], [29.90, 36.15],

    // Meis Adası (Kastellorizo)
    [29.58, 36.14], [29.60, 36.12], [29.62, 36.10], [29.58, 36.08],
    [29.55, 36.10], [29.55, 36.13]
];

// ===== Fetch (Rüzgar Mesafesi) Hesaplama =====
/**
 * Verilen noktadan rüzgar yönüne doğru en yakın kıyıya olan mesafeyi hesaplar
 * Basitleştirilmiş algoritma: rüzgarın geldiği yöndeki en yakın kıyı noktasını bul
 */
function calculateFetch(lat, lng, windDirection) {
    if (windDirection === null || windDirection === undefined) {
        return { fetchKm: 999, isOffshore: false, hitCoast: false };
    }

    // Rüzgarın geldiği yön (derece) - örn: 180 = güneyden esiyor
    const windFromRad = (windDirection * Math.PI) / 180;

    // Rüzgarın geldiği yöndeki birim vektör
    const windDirX = Math.sin(windFromRad); // Doğu-Batı komponenti
    const windDirY = Math.cos(windFromRad); // Kuzey-Güney komponenti

    let minFetch = 999;
    let foundCoast = false;

    // Her kıyı noktası için kontrol et
    for (const [coastLng, coastLat] of COASTLINE_POINTS) {
        // Kıyı noktasına olan vektör
        const dLat = coastLat - lat;
        const dLng = (coastLng - lng) * Math.cos(lat * Math.PI / 180); // Boylam düzeltmesi

        // Mesafe (km)
        const distance = Math.sqrt(dLat * dLat + dLng * dLng) * 111;

        // Bu kıyı noktası rüzgarın geldiği yönde mi?
        // Dot product ile kontrol - pozitifse aynı yönde
        const dotProduct = dLng * windDirX + dLat * windDirY;

        // Açı kontrolü - ±60 derece içinde olmalı
        if (dotProduct > 0) {
            const coastAngle = Math.atan2(dLng, dLat);
            const angleDiff = Math.abs(windFromRad - coastAngle);
            const normalizedDiff = Math.min(angleDiff, 2 * Math.PI - angleDiff);

            // ±60 derece (1.05 radyan) içindeyse fetch'e dahil et
            if (normalizedDiff < 1.05 && distance < minFetch) {
                minFetch = distance;
                foundCoast = true;
            }
        }
    }

    // Offshore = rüzgar karadan esiyorsa (kısa fetch)
    const isOffshore = foundCoast && minFetch < 15;

    return {
        fetchKm: Math.round(minFetch),
        isOffshore: isOffshore,
        hitCoast: foundCoast
    };
}

/**
 * Fetch mesafesine göre dalga düzeltme faktörü
 */
function getWaveAdjustmentFactor(fetchKm) {
    if (fetchKm < 3) return 0.1;   // Çok kısa fetch - neredeyse düz
    if (fetchKm < 5) return 0.2;   // Kısa fetch
    if (fetchKm < 10) return 0.35; // Orta-kısa fetch
    if (fetchKm < 20) return 0.5;  // Orta fetch
    if (fetchKm < 50) return 0.7;  // Uzun fetch
    return 1.0;                     // Açık deniz
}

/**
 * Dalga yüksekliğini fetch'e göre düzelt
 */
function adjustWaveForFetch(waveHeight, fetchKm) {
    if (waveHeight === null) return null;
    const factor = getWaveAdjustmentFactor(fetchKm);
    return waveHeight * factor;
}

async function fetchWeather(lat, lng, retryCount = 0) {
    const cacheKey = `${lat.toFixed(2)}_${lng.toFixed(2)}`;
    const MAX_RETRIES = 3;
    const RETRY_DELAYS = [2000, 4000, 8000]; // Exponential backoff: 2s, 4s, 8s

    // Cache kontrolü (1 saat geçerli)
    if (state.weatherCache.has(cacheKey)) {
        const cached = state.weatherCache.get(cacheKey);
        if (Date.now() - cached.timestamp < 3600000) {
            return cached.data;
        }
    }

    try {
        // Weather API (rüzgar ve sıcaklık)
        const weatherParams = new URLSearchParams({
            latitude: lat.toFixed(4),
            longitude: lng.toFixed(4),
            hourly: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m',
            forecast_days: 7,
            timezone: 'auto'
        });

        // Marine API (dalga verileri)
        const marineParams = new URLSearchParams({
            latitude: lat.toFixed(4),
            longitude: lng.toFixed(4),
            hourly: 'wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_period',
            forecast_days: 7,
            timezone: 'auto'
        });

        // Paralel API çağrıları
        const [weatherRes, marineRes] = await Promise.all([
            fetch(`${OPEN_METEO_WEATHER_URL}?${weatherParams}`),
            fetch(`${OPEN_METEO_MARINE_URL}?${marineParams}`).catch(() => null)
        ]);

        if (!weatherRes.ok) {
            throw new Error('API hatası');
        }

        const weatherData = await weatherRes.json();
        let marineData = null;

        // Marine API opsiyonel - başarısız olsa da devam et
        if (marineRes && marineRes.ok) {
            marineData = await marineRes.json();
        }

        const result = {
            weather: weatherData,
            marine: marineData
        };

        // Cache'e kaydet
        state.weatherCache.set(cacheKey, {
            timestamp: Date.now(),
            data: result
        });

        return result;
    } catch (error) {
        console.error('Hava durumu API hatası:', error);

        // Otomatik yeniden deneme (exponential backoff)
        if (retryCount < MAX_RETRIES) {
            console.log(`Yeniden deneniyor... (${retryCount + 1}/${MAX_RETRIES})`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[retryCount]));
            return fetchWeather(lat, lng, retryCount + 1);
        }

        return null;
    }
}

function getWeatherFromAPI(apiData, dateTime) {
    if (!apiData || !apiData.weather) {
        return null;
    }

    const targetTime = dateTime.toISOString().slice(0, 13) + ':00';

    // Weather verileri
    const weatherHourly = apiData.weather.hourly;
    const weatherIndex = weatherHourly.time.findIndex(t => t === targetTime);

    // En yakın saati bul (eğer exact match yoksa)
    const wIdx = weatherIndex >= 0 ? weatherIndex : findClosestTimeIndex(weatherHourly.time, dateTime);

    if (wIdx < 0) {
        return null;
    }

    const result = {
        windSpeed: (weatherHourly.wind_speed_10m?.[wIdx] || 0), // km/s
        windDirection: weatherHourly.wind_direction_10m?.[wIdx] || 0,
        windGusts: weatherHourly.wind_gusts_10m?.[wIdx] || 0,
        temperature: weatherHourly.temperature_2m?.[wIdx] || 20,
        waveHeight: null,
        waveDirection: null,
        wavePeriod: null,
        swellHeight: null,
        swellPeriod: null
    };

    // Marine verileri (varsa)
    if (apiData.marine && apiData.marine.hourly) {
        const marineHourly = apiData.marine.hourly;
        const mIdx = marineHourly.time.findIndex(t => t === targetTime);
        const marineIdx = mIdx >= 0 ? mIdx : findClosestTimeIndex(marineHourly.time, dateTime);

        if (marineIdx >= 0) {
            result.waveHeight = marineHourly.wave_height?.[marineIdx] || null;
            result.waveDirection = marineHourly.wave_direction?.[marineIdx] || null;
            result.wavePeriod = marineHourly.wave_period?.[marineIdx] || null;
            result.swellHeight = marineHourly.swell_wave_height?.[marineIdx] || null;
            result.swellPeriod = marineHourly.swell_wave_period?.[marineIdx] || null;
        }
    }

    return result;
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

// ===== Wind Particle Animation System =====
// Mobil cihazlar için daha az parçacık kullan
function getParticleCount() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const screenArea = width * height;

    // Mobil cihazlar (< 768px genişlik veya küçük ekran alanı)
    if (width < 768 || screenArea < 500000) {
        return 600; // Mobil için optimize edilmiş
    }
    // Tablet boyutu
    if (width < 1024 || screenArea < 900000) {
        return 1200;
    }
    // Desktop
    return 3000;
}

function getParticleLineWidth() {
    // Mobilde daha ince çizgiler (daha az görsel yoğunluk)
    return window.innerWidth < 768 ? 1.0 : 1.5;
}

function getWindColor(speed) {
    // km/s -> knots (1 km/s ≈ 1.944 knots, ama basitlik için 1:1 kullanıyoruz)
    if (speed < 10) return { r: 46, g: 204, b: 113, a: 0.8 };   // Yeşil - sakin
    if (speed < 20) return { r: 241, g: 196, b: 15, a: 0.9 };   // Sarı - orta
    if (speed < 30) return { r: 230, g: 126, b: 34, a: 0.95 };  // Turuncu - güçlü
    if (speed < 40) return { r: 231, g: 76, b: 60, a: 1.0 };    // Kırmızı - tehlikeli
    return { r: 142, g: 68, b: 173, a: 1.0 };                    // Mor - çok tehlikeli
}

function createWindCanvas() {
    const container = document.getElementById('map');
    const canvas = document.createElement('canvas');
    canvas.id = 'windCanvas';
    canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:450;';
    canvas.width = container.offsetWidth;
    canvas.height = container.offsetHeight;
    container.appendChild(canvas);
    state.windCanvas = canvas;
    return canvas;
}

function removeWindCanvas() {
    if (state.windCanvas) {
        state.windCanvas.remove();
        state.windCanvas = null;
    }
    if (state.windAnimationId) {
        cancelAnimationFrame(state.windAnimationId);
        state.windAnimationId = null;
    }
    state.windParticles = [];
}

async function loadWindGridData() {
    const bounds = map.getBounds();
    const departureDate = getDepartureDateTime();
    state.windGridData = [];

    const gridSize = 6;
    const latStep = (bounds.getNorth() - bounds.getSouth()) / gridSize;
    const lngStep = (bounds.getEast() - bounds.getWest()) / gridSize;

    const promises = [];
    const coords = [];

    for (let i = 0; i <= gridSize; i++) {
        for (let j = 0; j <= gridSize; j++) {
            const lat = bounds.getSouth() + i * latStep;
            const lng = bounds.getWest() + j * lngStep;
            coords.push({ lat, lng, i, j });
            promises.push(getWeatherForDateTimeAsync(lat, lng, departureDate));
        }
    }

    const results = await Promise.all(promises);

    results.forEach((weather, idx) => {
        const { lat, lng, i, j } = coords[idx];
        if (weather && isInSea(lat, lng)) {
            state.windGridData.push({
                lat, lng, i, j,
                speed: weather.windSpeed,
                direction: weather.windDirection,
                gusts: weather.windGusts || weather.windSpeed
            });
        }
    });
}

function getWindAtPoint(lat, lng) {
    if (state.windGridData.length === 0) return null;

    // En yakın grid noktasını bul ve interpolasyon yap
    let totalWeight = 0;
    let speedSum = 0;
    let dirXSum = 0;
    let dirYSum = 0;
    let gustSum = 0;

    state.windGridData.forEach(point => {
        const dist = Math.sqrt(Math.pow(lat - point.lat, 2) + Math.pow(lng - point.lng, 2));
        if (dist < 0.0001) {
            // Çok yakın nokta
            return { speed: point.speed, direction: point.direction, gusts: point.gusts };
        }
        const weight = 1 / (dist * dist);
        totalWeight += weight;
        speedSum += point.speed * weight;
        gustSum += point.gusts * weight;
        // Yön için birim vektör kullan
        const rad = (point.direction * Math.PI) / 180;
        dirXSum += Math.sin(rad) * weight;
        dirYSum += Math.cos(rad) * weight;
    });

    if (totalWeight === 0) return null;

    const avgDirection = (Math.atan2(dirXSum, dirYSum) * 180 / Math.PI + 360) % 360;
    return {
        speed: speedSum / totalWeight,
        direction: avgDirection,
        gusts: gustSum / totalWeight
    };
}

function initWindParticles() {
    state.windParticles = [];
    const canvas = state.windCanvas;
    if (!canvas) return;

    const particleCount = getParticleCount();
    for (let i = 0; i < particleCount; i++) {
        state.windParticles.push(createWindParticle(canvas));
    }
}

function createWindParticle(canvas) {
    return {
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        age: Math.random() * 100,
        maxAge: 50 + Math.random() * 50,
        trail: [] // Kuyruk için pozisyon geçmişi
    };
}

function animateWindParticles() {
    const canvas = state.windCanvas;
    if (!canvas || !state.windOverlayVisible) return;

    const ctx = canvas.getContext('2d');
    const bounds = map.getBounds();

    // Canvas'ı temizle (harita görünür kalır)
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    state.windParticles.forEach(particle => {
        // Ekran koordinatlarını lat/lng'ye çevir
        const lngRange = bounds.getEast() - bounds.getWest();
        const latRange = bounds.getNorth() - bounds.getSouth();
        const lng = bounds.getWest() + (particle.x / canvas.width) * lngRange;
        const lat = bounds.getNorth() - (particle.y / canvas.height) * latRange;

        const wind = getWindAtPoint(lat, lng);

        if (wind && isInSea(lat, lng)) {
            const color = getWindColor(wind.speed);
            const speed = wind.speed / 5; // Hız faktörü
            const gustFactor = wind.gusts - wind.speed;

            // Yön (derece -> radyan, kuzey = 0)
            let dirRad = ((wind.direction + 180) * Math.PI) / 180;

            // Gust efekti: yüksek gust farkında titreme
            if (gustFactor > 10) {
                const turbulence = (gustFactor - 10) / 20;
                const noise = (Math.random() - 0.5) * turbulence * Math.PI * 0.3;
                dirRad += noise;
            }

            const dx = Math.sin(dirRad) * speed;
            const dy = -Math.cos(dirRad) * speed;

            // Eski pozisyonu kuyruk listesine ekle
            particle.trail.push({ x: particle.x, y: particle.y });

            // Kuyruk uzunluğunu hıza göre ayarla (max 15 nokta)
            const maxTrailLength = Math.min(Math.floor(speed * 3) + 5, 15);
            while (particle.trail.length > maxTrailLength) {
                particle.trail.shift();
            }

            // Yeni pozisyon
            particle.x += dx;
            particle.y += dy;
            particle.age++;

            // Kuyruğu çiz
            if (particle.trail.length > 1) {
                ctx.beginPath();
                ctx.moveTo(particle.trail[0].x, particle.trail[0].y);

                for (let i = 1; i < particle.trail.length; i++) {
                    ctx.lineTo(particle.trail[i].x, particle.trail[i].y);
                }
                ctx.lineTo(particle.x, particle.y);

                // Gradient efekti için alpha değişimi (mobilde daha şeffaf)
                const mobileOpacity = window.innerWidth < 768 ? 0.6 : 0.8;
                const alpha = color.a * (1 - particle.age / particle.maxAge) * mobileOpacity;
                ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
                ctx.lineWidth = getParticleLineWidth();
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.stroke();
            }

            // Yaşlanma ve yeniden doğum
            if (particle.age > particle.maxAge ||
                particle.x < 0 || particle.x > canvas.width ||
                particle.y < 0 || particle.y > canvas.height) {
                particle.x = Math.random() * canvas.width;
                particle.y = Math.random() * canvas.height;
                particle.age = 0;
                particle.maxAge = 50 + Math.random() * 50;
                particle.trail = [];
            }
        } else {
            // Deniz dışında: parçacığı yeniden konumlandır
            particle.x = Math.random() * canvas.width;
            particle.y = Math.random() * canvas.height;
            particle.age = 0;
            particle.trail = [];
        }
    });

    state.windAnimationId = requestAnimationFrame(animateWindParticles);
}

async function toggleWindOverlay() {
    const btn = document.getElementById('toggleWindBtn');
    state.windOverlayVisible = !state.windOverlayVisible;

    if (state.windOverlayVisible) {
        btn.classList.add('active');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        document.getElementById('windLegend').classList.remove('hidden');

        createWindCanvas();
        await loadWindGridData();
        initWindParticles();
        animateWindParticles();

        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-wind"></i>';

        map.on('moveend', onWindMapMove);
        map.on('resize', onWindCanvasResize);
    } else {
        btn.classList.remove('active');
        document.getElementById('windLegend').classList.add('hidden');
        removeWindCanvas();
        map.off('moveend', onWindMapMove);
        map.off('resize', onWindCanvasResize);
    }
}

async function onWindMapMove() {
    if (!state.windOverlayVisible) return;
    const canvas = state.windCanvas;
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    await loadWindGridData();
    initWindParticles();
}

function onWindCanvasResize() {
    if (state.windCanvas) {
        const container = document.getElementById('map');
        state.windCanvas.width = container.offsetWidth;
        state.windCanvas.height = container.offsetHeight;
        initWindParticles();
    }
}

// ===== Wave Texture Animation System =====
function getWaveColor(height) {
    if (height < 0.5) return { r: 46, g: 204, b: 113 };   // Yeşil - sakin
    if (height < 1.0) return { r: 52, g: 152, b: 219 };   // Mavi - hafif
    if (height < 1.5) return { r: 241, g: 196, b: 15 };   // Sarı - orta
    if (height < 2.0) return { r: 230, g: 126, b: 34 };   // Turuncu - yüksek
    if (height < 3.0) return { r: 231, g: 76, b: 60 };    // Kırmızı - tehlikeli
    return { r: 142, g: 68, b: 173 };                      // Mor - çok tehlikeli
}

function createWaveCanvas() {
    const container = document.getElementById('map');
    const canvas = document.createElement('canvas');
    canvas.id = 'waveCanvas';
    canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:440;';
    canvas.width = container.offsetWidth;
    canvas.height = container.offsetHeight;
    container.appendChild(canvas);
    state.waveCanvas = canvas;
    return canvas;
}

function removeWaveCanvas() {
    if (state.waveCanvas) {
        state.waveCanvas.remove();
        state.waveCanvas = null;
    }
    if (state.waveAnimationId) {
        cancelAnimationFrame(state.waveAnimationId);
        state.waveAnimationId = null;
    }
}

async function loadWaveGridData() {
    const bounds = map.getBounds();
    const departureDate = getDepartureDateTime();
    state.waveGridData = [];

    const gridSize = 8;
    const latStep = (bounds.getNorth() - bounds.getSouth()) / gridSize;
    const lngStep = (bounds.getEast() - bounds.getWest()) / gridSize;

    const promises = [];
    const coords = [];

    for (let i = 0; i <= gridSize; i++) {
        for (let j = 0; j <= gridSize; j++) {
            const lat = bounds.getSouth() + i * latStep;
            const lng = bounds.getWest() + j * lngStep;
            coords.push({ lat, lng, i, j });
            promises.push(getWeatherForDateTimeAsync(lat, lng, departureDate));
        }
    }

    const results = await Promise.all(promises);

    results.forEach((weather, idx) => {
        const { lat, lng, i, j } = coords[idx];
        if (weather && weather.waveHeight !== null && isInSea(lat, lng)) {
            state.waveGridData.push({
                lat, lng, i, j,
                height: weather.waveHeight,
                direction: weather.waveDirection || 0,
                period: weather.swellPeriod || weather.wavePeriod || 6
            });
        }
    });
}

function getWaveAtPoint(lat, lng) {
    if (state.waveGridData.length === 0) return null;

    let totalWeight = 0;
    let heightSum = 0;
    let periodSum = 0;
    let dirXSum = 0;
    let dirYSum = 0;

    state.waveGridData.forEach(point => {
        const dist = Math.sqrt(Math.pow(lat - point.lat, 2) + Math.pow(lng - point.lng, 2));
        if (dist < 0.0001) {
            return { height: point.height, direction: point.direction, period: point.period };
        }
        const weight = 1 / (dist * dist);
        totalWeight += weight;
        heightSum += point.height * weight;
        periodSum += point.period * weight;
        const rad = (point.direction * Math.PI) / 180;
        dirXSum += Math.sin(rad) * weight;
        dirYSum += Math.cos(rad) * weight;
    });

    if (totalWeight === 0) return null;

    return {
        height: heightSum / totalWeight,
        direction: (Math.atan2(dirXSum, dirYSum) * 180 / Math.PI + 360) % 360,
        period: periodSum / totalWeight
    };
}

let waveAnimationTime = 0;

function animateWaveTexture() {
    const canvas = state.waveCanvas;
    if (!canvas || !state.waveOverlayVisible) return;

    const ctx = canvas.getContext('2d');
    const bounds = map.getBounds();

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    waveAnimationTime += 0.05;

    const cellSize = 30;
    const cols = Math.ceil(canvas.width / cellSize);
    const rows = Math.ceil(canvas.height / cellSize);

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const x = col * cellSize + cellSize / 2;
            const y = row * cellSize + cellSize / 2;

            // Ekran koordinatlarını lat/lng'ye çevir
            const lngRange = bounds.getEast() - bounds.getWest();
            const latRange = bounds.getNorth() - bounds.getSouth();
            const lng = bounds.getWest() + (x / canvas.width) * lngRange;
            const lat = bounds.getNorth() - (y / canvas.height) * latRange;

            if (!isInSea(lat, lng)) continue;

            const wave = getWaveAtPoint(lat, lng);
            if (!wave) continue;

            const color = getWaveColor(wave.height);
            const period = wave.period || 6;
            const dirRad = (wave.direction * Math.PI) / 180;

            // Dalga şekli: periyoda göre morph
            // Period > 8s: yumuşak sinüs (swell)
            // Period < 5s: keskin testere dişi (choppy)
            const isSmooth = period > 8;
            const isChoppy = period < 5;

            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(dirRad);

            // Dalga yüksekliğine göre amplitüd
            const amplitude = wave.height * 5;
            const frequency = isChoppy ? 0.5 : 0.3;
            const waveWidth = cellSize * 0.8;

            ctx.beginPath();

            if (isSmooth) {
                // Yumuşak sinüs dalgası
                for (let i = -waveWidth / 2; i <= waveWidth / 2; i += 2) {
                    const yOffset = Math.sin((i * frequency + waveAnimationTime) * 2) * amplitude;
                    if (i === -waveWidth / 2) {
                        ctx.moveTo(i, yOffset);
                    } else {
                        ctx.lineTo(i, yOffset);
                    }
                }
            } else if (isChoppy) {
                // Keskin testere dişi
                const segments = 4;
                const segmentWidth = waveWidth / segments;
                for (let i = 0; i < segments; i++) {
                    const startX = -waveWidth / 2 + i * segmentWidth;
                    const phase = (waveAnimationTime + i * 0.5) % 1;
                    const peakX = startX + segmentWidth * 0.3;
                    const endX = startX + segmentWidth;

                    if (i === 0) {
                        ctx.moveTo(startX, amplitude * 0.3);
                    }
                    ctx.lineTo(peakX, -amplitude);
                    ctx.lineTo(endX, amplitude * 0.3);
                }
            } else {
                // Orta seviye - hafif dalgalı
                for (let i = -waveWidth / 2; i <= waveWidth / 2; i += 2) {
                    const yOffset = Math.sin((i * frequency + waveAnimationTime) * 1.5) * amplitude * 0.7;
                    if (i === -waveWidth / 2) {
                        ctx.moveTo(i, yOffset);
                    } else {
                        ctx.lineTo(i, yOffset);
                    }
                }
            }

            ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.7)`;
            ctx.lineWidth = isChoppy ? 2.5 : 2;
            ctx.stroke();

            // İkinci dalga çizgisi (derinlik efekti)
            ctx.beginPath();
            const offset = 5;
            if (isSmooth) {
                for (let i = -waveWidth / 2; i <= waveWidth / 2; i += 2) {
                    const yOffset = Math.sin((i * frequency + waveAnimationTime + 0.5) * 2) * amplitude * 0.6 + offset;
                    if (i === -waveWidth / 2) {
                        ctx.moveTo(i, yOffset);
                    } else {
                        ctx.lineTo(i, yOffset);
                    }
                }
            } else {
                for (let i = -waveWidth / 2; i <= waveWidth / 2; i += 2) {
                    const yOffset = Math.sin((i * frequency + waveAnimationTime + 0.5) * 1.5) * amplitude * 0.5 + offset;
                    if (i === -waveWidth / 2) {
                        ctx.moveTo(i, yOffset);
                    } else {
                        ctx.lineTo(i, yOffset);
                    }
                }
            }
            ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.4)`;
            ctx.lineWidth = 1.5;
            ctx.stroke();

            ctx.restore();
        }
    }

    state.waveAnimationId = requestAnimationFrame(animateWaveTexture);
}

async function toggleWaveOverlay() {
    const btn = document.getElementById('toggleWaveBtn');
    state.waveOverlayVisible = !state.waveOverlayVisible;

    if (state.waveOverlayVisible) {
        btn.classList.add('active');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        document.getElementById('waveLegend').classList.remove('hidden');

        createWaveCanvas();
        await loadWaveGridData();
        animateWaveTexture();

        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-water"></i>';

        map.on('moveend', onWaveMapMove);
        map.on('resize', onWaveCanvasResize);
    } else {
        btn.classList.remove('active');
        document.getElementById('waveLegend').classList.add('hidden');
        removeWaveCanvas();
        map.off('moveend', onWaveMapMove);
        map.off('resize', onWaveCanvasResize);
    }
}

async function onWaveMapMove() {
    if (!state.waveOverlayVisible) return;
    const canvas = state.waveCanvas;
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    await loadWaveGridData();
}

function onWaveCanvasResize() {
    if (state.waveCanvas) {
        const container = document.getElementById('map');
        state.waveCanvas.width = container.offsetWidth;
        state.waveCanvas.height = container.offsetHeight;
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
    document.getElementById('weatherTemp').textContent = '--';
    document.getElementById('weatherWave').textContent = '--';
    document.getElementById('weatherWavePeriod').textContent = '--';
    panel.classList.remove('hidden');

    // API'den veri al
    const departureDate = getDepartureDateTime();
    const weather = await getWeatherForDateTimeAsync(lat, lng, departureDate);

    // Veri yoksa göster
    if (!weather) {
        document.getElementById('weatherWind').textContent = 'Veri yok';
        document.getElementById('weatherDirection').textContent = '--';
        document.getElementById('weatherTemp').textContent = '--';
        document.getElementById('weatherWave').textContent = '--';
        document.getElementById('weatherWavePeriod').textContent = '--';
        document.getElementById('waveGrid').style.display = 'none';
    } else {
        const windDirection = getWindDirectionText(weather.windDirection);
        document.getElementById('weatherWind').textContent =
            `${weather.windSpeed.toFixed(1)} km/s`;
        document.getElementById('weatherDirection').textContent =
            `${windDirection} (${weather.windDirection}°)`;
        document.getElementById('weatherTemp').textContent =
            `${weather.temperature.toFixed(0)} °C`;

        // Dalga verisi
        if (weather.waveHeight !== null) {
            document.getElementById('waveGrid').style.display = '';
            document.getElementById('weatherWave').textContent =
                `${weather.waveHeight.toFixed(1)} m`;
            document.getElementById('weatherWavePeriod').textContent =
                weather.wavePeriod ? `${weather.wavePeriod.toFixed(1)} sn` : '--';
        } else {
            document.getElementById('waveGrid').style.display = 'none';
        }
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
        // Marker'ları sürüklenebilir yap
        state.markers.forEach(marker => marker.dragging.enable());
    } else {
        btn.classList.remove('active');
        instructions.classList.add('hidden');
        // Marker'ları sürüklenemez yap
        state.markers.forEach(marker => marker.dragging.disable());
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

    // Create marker (draggable only in route mode)
    const marker = L.marker([waypoint.lat, waypoint.lng], {
        icon,
        draggable: state.routeMode
    });

    // Drag event handlers
    marker.on('dragstart', function(e) {
        // Rota modu kapalıysa sürüklemeyi engelle
        if (!state.routeMode) {
            e.target.dragging.disable();
            return;
        }
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
    const hasWave = hasWeather && waypoint.weather.waveHeight !== null;
    const waveDirection = hasWave ? getWindDirectionText(waypoint.weather.waveDirection) : '--';
    const departureDate = getDepartureDateTime();
    const dateStr = departureDate.toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    });

    const windyUrl = `https://windy.app/tr/forecast2/spot/${Math.abs(Math.floor(waypoint.lat * 100))}${Math.abs(Math.floor(waypoint.lng * 100))}/Nokta${number}`;

    // Fetch hesaplama - kıyı modu için
    let fetchInfo = null;
    let adjustedWave = null;
    if (hasWeather && waypoint.weather.windDirection !== null) {
        fetchInfo = calculateFetch(waypoint.lat, waypoint.lng, waypoint.weather.windDirection);
        if (hasWave) {
            adjustedWave = adjustWaveForFetch(waypoint.weather.waveHeight, fetchInfo.fetchKm);
        }
    }

    // Kıyı durumu etiketi
    const coastalLabel = fetchInfo ? (
        fetchInfo.isOffshore
            ? `<span style="background: #d4edda; color: #155724; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem;">
                 <i class="fas fa-umbrella-beach"></i> Karadan rüzgar
               </span>`
            : fetchInfo.fetchKm < 50
                ? `<span style="background: #fff3cd; color: #856404; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem;">
                     <i class="fas fa-water"></i> Kıyı (${Math.round(fetchInfo.fetchKm)} km fetch)
                   </span>`
                : `<span style="background: #cce5ff; color: #004085; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem;">
                     <i class="fas fa-ship"></i> Açık deniz
                   </span>`
    ) : '';

    const waveContent = hasWave ? `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
            <div style="text-align: center; padding: 8px; background: #e3f2fd; border-radius: 6px;">
                <i class="fas fa-water" style="color: #0077b6;"></i><br>
                <strong>${adjustedWave !== null ? adjustedWave.toFixed(1) : waypoint.weather.waveHeight.toFixed(1)}</strong> m<br>
                <small style="color: #888;">Tahmini Dalga</small>
            </div>
            <div style="text-align: center; padding: 8px; background: #e3f2fd; border-radius: 6px;">
                <i class="fas fa-stopwatch" style="color: #0077b6;"></i><br>
                <strong>${waypoint.weather.wavePeriod ? waypoint.weather.wavePeriod.toFixed(1) : '--'}</strong> sn<br>
                <small style="color: #888;">Periyot</small>
            </div>
        </div>
        ${adjustedWave !== null && adjustedWave < waypoint.weather.waveHeight * 0.9 ? `
            <div style="background: #e8f5e9; padding: 6px 8px; border-radius: 4px; margin-bottom: 12px; font-size: 0.75rem; color: #2e7d32;">
                <i class="fas fa-info-circle"></i>
                Açık deniz: ${waypoint.weather.waveHeight.toFixed(1)}m → Bu konum: ~${adjustedWave.toFixed(1)}m
                ${fetchInfo && fetchInfo.isOffshore ? ' (karadan esen rüzgar)' : ''}
            </div>
        ` : '<div style="margin-bottom: 4px;"></div>'}
    ` : '';

    const weatherContent = hasWeather ? `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
            <div style="text-align: center; padding: 8px; background: #f1f3f5; border-radius: 6px;">
                <i class="fas fa-wind" style="color: #0077b6;"></i><br>
                <strong>${waypoint.weather.windSpeed.toFixed(1)}</strong> km/s<br>
                <small style="color: #888;">${windDirection}</small>
            </div>
            <div style="text-align: center; padding: 8px; background: #f1f3f5; border-radius: 6px;">
                <i class="fas fa-thermometer-half" style="color: #0077b6;"></i><br>
                <strong>${waypoint.weather.temperature.toFixed(0)}</strong> °C<br>
                <small style="color: #888;">Sıcaklık</small>
            </div>
        </div>
        ${waveContent}
    ` : `
        <div style="text-align: center; padding: 16px; background: #f1f3f5; border-radius: 6px; margin-bottom: 12px; color: #666;">
            <i class="fas fa-exclamation-circle" style="font-size: 1.5rem; margin-bottom: 8px; display: block;"></i>
            Bu konum için hava durumu verisi bulunamadı
        </div>
    `;

    return `
        <div style="padding: 12px; min-width: 220px;">
            <div style="background: linear-gradient(135deg, #0077b6, #00b4d8); color: white; margin: -12px -12px 12px -12px; padding: 10px 12px; font-weight: 600;">
                <i class="fas fa-map-marker-alt"></i> Nokta ${number}
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-size: 0.8rem; color: #666;">
                    <i class="fas fa-calendar"></i> ${dateStr}
                </span>
                ${coastalLabel}
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
        const apiData = await fetchWeather(lat, lng);
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
            await loadWindGridData();
            initWindParticles();
        }
        if (state.waveOverlayVisible) {
            await loadWaveGridData();
        }

        updateWaypointsList();
        updateRouteStats();

    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-sync-alt"></i>';
    }
}

// ===== Weather Auto-Refresh =====
const WEATHER_REFRESH_INTERVAL = 15 * 60 * 1000; // 15 dakika

function startWeatherAutoRefresh() {
    // Önceki interval varsa temizle
    if (state.weatherRefreshInterval) {
        clearInterval(state.weatherRefreshInterval);
    }

    // 15 dakikada bir otomatik güncelle
    state.weatherRefreshInterval = setInterval(() => {
        // Sadece waypoint varsa ve sayfa görünürse güncelle
        if (state.waypoints.length > 0 && !document.hidden) {
            console.log('Hava durumu otomatik güncelleniyor...');
            refreshWeatherSilently();
        }
    }, WEATHER_REFRESH_INTERVAL);

    // Sayfa görünürlük değiştiğinde kontrol et
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && state.waypoints.length > 0) {
            // Sayfa aktif olduğunda cache'i kontrol et
            const needsRefresh = state.waypoints.some(wp => {
                const cacheKey = `${wp.lat.toFixed(2)}_${wp.lng.toFixed(2)}`;
                const cached = state.weatherCache.get(cacheKey);
                // Cache 15 dakikadan eski mi?
                return !cached || (Date.now() - cached.timestamp > WEATHER_REFRESH_INTERVAL);
            });

            if (needsRefresh) {
                console.log('Sayfa aktif oldu - eski veriler yenileniyor...');
                refreshWeatherSilently();
            }
        }
    });
}

async function refreshWeatherSilently() {
    // UI'ı bloklamadan sessizce güncelle
    const departureDate = getDepartureDateTime();
    const btn = document.getElementById('updateWeatherBtn');

    // Küçük loading göstergesi (buton üzerinde)
    if (btn) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }

    try {
        // Cache'i temizle (yeni veri çekmek için)
        state.waypoints.forEach(wp => {
            const cacheKey = `${wp.lat.toFixed(2)}_${wp.lng.toFixed(2)}`;
            state.weatherCache.delete(cacheKey);
        });

        // Tüm waypoint'ler için paralel API çağrıları
        const weatherPromises = state.waypoints.map(wp =>
            getWeatherForDateTimeAsync(wp.lat, wp.lng, departureDate)
        );

        const weatherResults = await Promise.all(weatherPromises);

        // Waypoint'leri güncelle
        weatherResults.forEach((weather, index) => {
            if (index < state.waypoints.length) {
                state.waypoints[index].weather = weather;
                state.waypoints[index].riskLevel = weather ? calculateRiskLevel(weather) : 'gray';

                // Marker'ı güncelle
                if (state.markers[index]) {
                    map.removeLayer(state.markers[index]);
                    const newMarker = createMarker(state.waypoints[index], index + 1);
                    state.markers[index] = newMarker;
                    newMarker.addTo(map);
                }
            }
        });

        // Overlay'leri güncelle
        if (state.windOverlayVisible) {
            await loadWindGridData();
            initWindParticles();
        }
        if (state.waveOverlayVisible) {
            await loadWaveGridData();
        }

        updateWaypointsList();
        updateRouteStats();

    } finally {
        if (btn) {
            btn.innerHTML = '<i class="fas fa-sync-alt"></i>';
        }
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
    // Rüzgar risk seviyesi
    let windRisk = 0;
    if (weather.windSpeed >= 30) windRisk = 2;
    else if (weather.windSpeed >= 15) windRisk = 1;

    // Dalga risk seviyesi (varsa)
    let waveRisk = 0;
    if (weather.waveHeight !== null) {
        if (weather.waveHeight >= 2.0) waveRisk = 2;
        else if (weather.waveHeight >= 1.0) waveRisk = 1;
    }

    // En yüksek risk seviyesini al
    const maxRisk = Math.max(windRisk, waveRisk);

    if (maxRisk >= 2) return 'red';
    if (maxRisk >= 1) return 'yellow';
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

    // Rotayı Kaydet butonu görünürlüğünü güncelle
    updateSaveRouteButtonVisibility();

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
        const hasWave = hasWeather && wp.weather.waveHeight !== null;

        // Fetch hesaplama
        let waveDisplay = '';
        if (hasWave && hasWeather && wp.weather.windDirection !== null) {
            const fetchInfo = calculateFetch(wp.lat, wp.lng, wp.weather.windDirection);
            const adjustedWave = adjustWaveForFetch(wp.weather.waveHeight, fetchInfo.fetchKm);
            const waveText = adjustedWave !== null ? adjustedWave.toFixed(1) : wp.weather.waveHeight.toFixed(1);
            const offshoreIcon = fetchInfo.isOffshore ? ' <i class="fas fa-umbrella-beach" title="Karadan rüzgar"></i>' : '';
            waveDisplay = `<i class="fas fa-water"></i> ${waveText}m${offshoreIcon}`;
        } else if (hasWave) {
            waveDisplay = `<i class="fas fa-water"></i> ${wp.weather.waveHeight.toFixed(1)}m`;
        }

        const weatherInfo = hasWeather
            ? `<i class="fas fa-wind"></i> ${wp.weather.windSpeed.toFixed(0)} km/s ${windDirection}
               &nbsp;
               <i class="fas fa-thermometer-half"></i> ${wp.weather.temperature.toFixed(0)}°C
               ${waveDisplay ? '&nbsp; ' + waveDisplay : ''}`
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

// ===== Guide Modal =====
function openGuide() {
    document.getElementById('guideModal').classList.remove('hidden');
}

function closeGuide() {
    document.getElementById('guideModal').classList.add('hidden');
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

    // Firebase veya LocalStorage'a kaydet
    if (typeof firebaseDB !== 'undefined' && firebaseAuth && firebaseAuth.isLoggedIn()) {
        firebaseDB.saveSettings(state.settings);
    } else {
        localStorage.setItem('denizRotaSettings', JSON.stringify(state.settings));
    }

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

    // Firebase başlat
    initializeFirebaseAuth();

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
    document.getElementById('closeGuideBtn').addEventListener('click', closeGuide);
    document.getElementById('closeGuideFooterBtn').addEventListener('click', closeGuide);
    document.getElementById('closeWeatherPanel').addEventListener('click', closeWeatherPanel);
    document.getElementById('updateWeatherBtn').addEventListener('click', updateAllWeatherData);

    // Fullscreen button
    document.getElementById('fullscreenBtn').addEventListener('click', toggleFullscreen);

    // Trip tracking buttons
    document.getElementById('tripBtn').addEventListener('click', toggleTrip);
    document.getElementById('closeTripSummaryBtn').addEventListener('click', closeTripSummary);
    document.getElementById('saveTripBtn').addEventListener('click', saveCurrentTrip);
    document.getElementById('viewTripsHistoryBtn').addEventListener('click', () => {
        closeTripSummary();
        showTripHistory();
    });
    document.getElementById('closeTripHistoryBtn').addEventListener('click', closeTripHistory);
    document.getElementById('clearTripHistoryBtn').addEventListener('click', clearTripHistory);

    // Auth event listeners
    setupAuthEventListeners();

    // Route save event listeners
    setupRouteSaveEventListeners();

    // Modal overlay clicks
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', function() {
            this.closest('.modal').classList.add('hidden');
        });
    });

    // Date/time change
    document.getElementById('departureDate').addEventListener('change', updateAllWeatherData);
    document.getElementById('departureTime').addEventListener('change', updateAllWeatherData);

    // Otomatik hava durumu yenileme başlat (15 dakikada bir)
    startWeatherAutoRefresh();

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (!document.getElementById('authModal').classList.contains('hidden')) {
                closeAuthModal();
            } else if (!document.getElementById('saveRouteModal').classList.contains('hidden')) {
                closeSaveRouteModal();
            } else if (!document.getElementById('tripSummaryModal').classList.contains('hidden')) {
                closeTripSummary();
            } else if (!document.getElementById('tripHistoryModal').classList.contains('hidden')) {
                closeTripHistory();
            } else if (!document.getElementById('settingsModal').classList.contains('hidden')) {
                closeSettings();
            } else if (!document.getElementById('guideModal').classList.contains('hidden')) {
                closeGuide();
            } else if (!document.getElementById('weatherPanel').classList.contains('hidden')) {
                closeWeatherPanel();
            } else if (state.isFullscreen) {
                toggleFullscreen();
            } else if (state.routeMode) {
                toggleRouteMode();
            }
        }
        if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
            if (e.key === 'r' && !e.ctrlKey && !e.metaKey) {
                toggleRouteMode();
            }
            if (e.key === 'f' && !e.ctrlKey && !e.metaKey) {
                toggleFullscreen();
            }
        }
    });

    // Sayfa açıldığında kullanıcı konumunu göster
    showUserLocation();

    // Sidebar yolculuk listesini yükle
    updateSidebarTripsList();

    // Kayıtlı rotaları yükle
    updateSavedRoutesList();

    console.log('DenizRota v2.1 başlatıldı! 🚤');
}

// ===== Firebase Auth Integration =====
function initializeFirebaseAuth() {
    if (typeof firebaseAuth !== 'undefined' && firebaseAuth.initialize) {
        const initialized = firebaseAuth.initialize();
        if (!initialized) {
            console.log('Firebase yapılandırılmamış - çevrimdışı mod');
        }
    }
}

function setupAuthEventListeners() {
    // Login button
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', openAuthModal);
    }

    // Close auth modal
    const closeAuthBtn = document.getElementById('closeAuthBtn');
    if (closeAuthBtn) {
        closeAuthBtn.addEventListener('click', closeAuthModal);
    }

    // User avatar - toggle dropdown on click
    const userAvatar = document.getElementById('userAvatar');
    if (userAvatar) {
        userAvatar.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleUserDropdown();
        });
    }

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
        const userInfo = document.getElementById('userInfo');
        const dropdown = document.getElementById('userDropdown');
        if (userInfo && dropdown && !userInfo.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    });

    // Profile menu items
    const menuSavedRoutesBtn = document.getElementById('menuSavedRoutesBtn');
    if (menuSavedRoutesBtn) {
        menuSavedRoutesBtn.addEventListener('click', () => {
            document.getElementById('userDropdown').classList.add('hidden');
            scrollToSidebarSection('.saved-routes-section');
        });
    }

    const menuTripsBtn = document.getElementById('menuTripsBtn');
    if (menuTripsBtn) {
        menuTripsBtn.addEventListener('click', () => {
            document.getElementById('userDropdown').classList.add('hidden');
            scrollToSidebarSection('.trips-section');
        });
    }

    const menuGuideBtn = document.getElementById('menuGuideBtn');
    if (menuGuideBtn) {
        menuGuideBtn.addEventListener('click', () => {
            document.getElementById('userDropdown').classList.add('hidden');
            openGuide();
        });
    }

    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    // Sync data button
    const syncDataBtn = document.getElementById('syncDataBtn');
    if (syncDataBtn) {
        syncDataBtn.addEventListener('click', handleSyncData);
    }

    // Login form submit
    const loginSubmitBtn = document.getElementById('loginSubmitBtn');
    if (loginSubmitBtn) {
        loginSubmitBtn.addEventListener('click', handleEmailLogin);
    }

    // Google login
    const googleLoginBtn = document.getElementById('googleLoginBtn');
    if (googleLoginBtn) {
        googleLoginBtn.addEventListener('click', handleGoogleLogin);
    }

    // Register form submit
    const registerSubmitBtn = document.getElementById('registerSubmitBtn');
    if (registerSubmitBtn) {
        registerSubmitBtn.addEventListener('click', handleRegister);
    }

    // Forgot password submit
    const forgotSubmitBtn = document.getElementById('forgotSubmitBtn');
    if (forgotSubmitBtn) {
        forgotSubmitBtn.addEventListener('click', handleForgotPassword);
    }

    // Form navigation links
    const showRegister = document.getElementById('showRegister');
    if (showRegister) {
        showRegister.addEventListener('click', (e) => {
            e.preventDefault();
            showAuthForm('register');
        });
    }

    const showLogin = document.getElementById('showLogin');
    if (showLogin) {
        showLogin.addEventListener('click', (e) => {
            e.preventDefault();
            showAuthForm('login');
        });
    }

    const showForgotPassword = document.getElementById('showForgotPassword');
    if (showForgotPassword) {
        showForgotPassword.addEventListener('click', (e) => {
            e.preventDefault();
            showAuthForm('forgot');
        });
    }

    const backToLogin = document.getElementById('backToLogin');
    if (backToLogin) {
        backToLogin.addEventListener('click', (e) => {
            e.preventDefault();
            showAuthForm('login');
        });
    }

    // Enter key for form submit
    document.querySelectorAll('#loginEmail, #loginPassword').forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleEmailLogin();
        });
    });

    document.querySelectorAll('#registerName, #registerEmail, #registerPassword, #registerPasswordConfirm').forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleRegister();
        });
    });
}

function openAuthModal() {
    const modal = document.getElementById('authModal');
    const firebaseWarning = document.getElementById('firebaseWarning');

    // Firebase yapılandırılmamışsa uyarı göster
    if (typeof firebaseAuth !== 'undefined' && !firebaseAuth.isConfigured()) {
        if (firebaseWarning) firebaseWarning.classList.remove('hidden');
        document.getElementById('loginForm').classList.add('hidden');
    } else {
        if (firebaseWarning) firebaseWarning.classList.add('hidden');
        showAuthForm('login');
    }

    modal.classList.remove('hidden');
}

function closeAuthModal() {
    document.getElementById('authModal').classList.add('hidden');
    // Form alanlarını temizle
    document.querySelectorAll('#authModal input').forEach(input => input.value = '');
    document.querySelectorAll('.auth-message').forEach(msg => msg.classList.add('hidden'));
}

function showAuthForm(formType) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    const modalTitle = document.getElementById('authModalTitle');

    loginForm.classList.add('hidden');
    registerForm.classList.add('hidden');
    forgotPasswordForm.classList.add('hidden');

    if (formType === 'login') {
        loginForm.classList.remove('hidden');
        modalTitle.innerHTML = '<i class="fas fa-user-circle"></i> Giriş Yap';
    } else if (formType === 'register') {
        registerForm.classList.remove('hidden');
        modalTitle.innerHTML = '<i class="fas fa-user-plus"></i> Kayıt Ol';
    } else if (formType === 'forgot') {
        forgotPasswordForm.classList.remove('hidden');
        modalTitle.innerHTML = '<i class="fas fa-key"></i> Şifremi Unuttum';
    }
}

function toggleUserDropdown() {
    const dropdown = document.getElementById('userDropdown');
    dropdown.classList.toggle('hidden');
}

// Sidebar'da belirli bir bölüme scroll yap
function scrollToSidebarSection(sectionSelector) {
    const sidebar = document.querySelector('.sidebar-left');
    const section = document.querySelector(sectionSelector);

    if (sidebar && section) {
        // Mobilde sidebar'ı görünür yap
        if (window.innerWidth <= 768) {
            sidebar.scrollIntoView({ behavior: 'smooth' });
        }

        // Bölüme scroll
        setTimeout(() => {
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });

            // Bölümü vurgula
            section.classList.add('highlight');
            setTimeout(() => section.classList.remove('highlight'), 2000);
        }, 100);
    }
}

async function handleEmailLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const btn = document.getElementById('loginSubmitBtn');

    if (!email || !password) {
        showAuthErrorMessage('Email ve şifre gerekli');
        return;
    }

    btn.classList.add('loading');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Giriş yapılıyor...';

    try {
        const user = await firebaseAuth.signInWithEmail(email, password);
        if (user) {
            closeAuthModal();
        }
    } finally {
        btn.classList.remove('loading');
        btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Giriş Yap';
    }
}

async function handleGoogleLogin() {
    const btn = document.getElementById('googleLoginBtn');

    btn.classList.add('loading');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Bağlanıyor...';

    try {
        const user = await firebaseAuth.signInWithGoogle();
        if (user) {
            closeAuthModal();
        }
    } finally {
        btn.classList.remove('loading');
        btn.innerHTML = '<i class="fab fa-google"></i> Google ile Giriş Yap';
    }
}

async function handleRegister() {
    const name = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const passwordConfirm = document.getElementById('registerPasswordConfirm').value;
    const btn = document.getElementById('registerSubmitBtn');

    if (!email || !password) {
        showAuthErrorMessage('Email ve şifre gerekli');
        return;
    }

    if (password !== passwordConfirm) {
        showAuthErrorMessage('Şifreler eşleşmiyor');
        return;
    }

    if (password.length < 6) {
        showAuthErrorMessage('Şifre en az 6 karakter olmalı');
        return;
    }

    btn.classList.add('loading');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Kaydediliyor...';

    try {
        const user = await firebaseAuth.signUpWithEmail(email, password, name);
        if (user) {
            closeAuthModal();
        }
    } finally {
        btn.classList.remove('loading');
        btn.innerHTML = '<i class="fas fa-user-plus"></i> Kayıt Ol';
    }
}

async function handleForgotPassword() {
    const email = document.getElementById('forgotEmail').value.trim();
    const btn = document.getElementById('forgotSubmitBtn');

    if (!email) {
        showAuthErrorMessage('Email adresi gerekli');
        return;
    }

    btn.classList.add('loading');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gönderiliyor...';

    try {
        await firebaseAuth.sendPasswordReset(email);
        showAuthForm('login');
    } finally {
        btn.classList.remove('loading');
        btn.innerHTML = '<i class="fas fa-envelope"></i> Sıfırlama Linki Gönder';
    }
}

async function handleLogout() {
    const dropdown = document.getElementById('userDropdown');
    dropdown.classList.add('hidden');

    if (typeof firebaseAuth !== 'undefined') {
        await firebaseAuth.signOut();
    }
}

async function handleSyncData() {
    const dropdown = document.getElementById('userDropdown');
    dropdown.classList.add('hidden');

    if (typeof firebaseDB !== 'undefined' && firebaseAuth.isLoggedIn()) {
        await firebaseDB.migrateLocalData();
        // Listeleri güncelle
        updateSidebarTripsList();
        updateSavedRoutesList();
    }
}

function showAuthErrorMessage(message) {
    const errorEl = document.getElementById('authError');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
        setTimeout(() => errorEl.classList.add('hidden'), 5000);
    }
}

// Kullanıcı konumunu göster (sayfa açıldığında)
function showUserLocation() {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude, accuracy } = position.coords;
            updateUserLocationMarker(latitude, longitude, accuracy, false);

            // İlk açılışta haritayı kullanıcının konumuna ortala
            map.setView([latitude, longitude], 12);
        },
        (error) => {
            console.log('Konum alınamadı:', error.message);
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000
        }
    );
}

document.addEventListener('DOMContentLoaded', init);

// Global functions for HTML onclick
window.removeWaypoint = removeWaypoint;
window.focusWaypoint = focusWaypoint;

// ===== Fullscreen Mode =====
function toggleFullscreen() {
    const mainContainer = document.querySelector('.main-container');
    const btn = document.getElementById('fullscreenBtn');

    state.isFullscreen = !state.isFullscreen;

    if (state.isFullscreen) {
        mainContainer.classList.add('fullscreen-mode');
        btn.classList.add('active');
        btn.innerHTML = '<i class="fas fa-compress"></i>';
        btn.title = 'Tam Ekrandan Çık (F)';

        // Try native fullscreen API
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else if (document.documentElement.webkitRequestFullscreen) {
            document.documentElement.webkitRequestFullscreen();
        }
    } else {
        mainContainer.classList.remove('fullscreen-mode');
        btn.classList.remove('active');
        btn.innerHTML = '<i class="fas fa-expand"></i>';
        btn.title = 'Tam Ekran (F)';

        // Exit native fullscreen
        if (document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        }
    }

    // Harita boyutunu güncelle
    setTimeout(() => {
        map.invalidateSize();
    }, 100);
}

// Listen for native fullscreen change
document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && state.isFullscreen) {
        const mainContainer = document.querySelector('.main-container');
        const btn = document.getElementById('fullscreenBtn');

        state.isFullscreen = false;
        mainContainer.classList.remove('fullscreen-mode');
        btn.classList.remove('active');
        btn.innerHTML = '<i class="fas fa-expand"></i>';
        btn.title = 'Tam Ekran (F)';

        setTimeout(() => map.invalidateSize(), 100);
    }
});

// ===== Trip Tracking System =====
function toggleTrip() {
    if (state.tripActive) {
        endTrip();
    } else {
        startTrip();
    }
}

function startTrip() {
    // GPS desteği kontrol et
    if (!navigator.geolocation) {
        alert('Tarayıcınız konum servislerini desteklemiyor!');
        return;
    }

    const btn = document.getElementById('tripBtn');
    const speedPanel = document.getElementById('speedPanel');

    // State'i sıfırla
    state.tripActive = true;
    state.tripStartTime = Date.now();
    state.tripPositions = [];
    state.tripCurrentSpeed = 0;
    state.tripMaxSpeed = 0;
    state.tripTotalDistance = 0;
    state.tripLastPosition = null;

    // UI güncelle
    btn.classList.add('active');
    btn.innerHTML = '<i class="fas fa-stop"></i>';
    btn.title = 'Yolculuğu Bitir';
    speedPanel.classList.remove('hidden');

    // Timer başlat
    state.tripTimerInterval = setInterval(updateTripTimer, 1000);

    // GPS takibini başlat
    state.tripWatchId = navigator.geolocation.watchPosition(
        handlePositionUpdate,
        handlePositionError,
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );

    console.log('Yolculuk başladı! 🚤');
}

function endTrip() {
    if (!state.tripActive) return;

    const btn = document.getElementById('tripBtn');
    const speedPanel = document.getElementById('speedPanel');

    // GPS takibini durdur
    if (state.tripWatchId !== null) {
        navigator.geolocation.clearWatch(state.tripWatchId);
        state.tripWatchId = null;
    }

    // Timer'ı durdur
    if (state.tripTimerInterval) {
        clearInterval(state.tripTimerInterval);
        state.tripTimerInterval = null;
    }

    // Konum marker'larını kaldır
    if (state.userLocationMarker) {
        map.removeLayer(state.userLocationMarker);
        state.userLocationMarker = null;
    }
    if (state.userAccuracyCircle) {
        map.removeLayer(state.userAccuracyCircle);
        state.userAccuracyCircle = null;
    }

    // Rota çizgisini kaldır
    removeTripPolyline();

    // Trip verilerini kaydet
    const tripDuration = Date.now() - state.tripStartTime;
    const durationHours = tripDuration / 3600000;
    const avgSpeed = state.tripTotalDistance > 0 && durationHours > 0
        ? state.tripTotalDistance / durationHours
        : 0;

    // Yakıt hesabı (ayarlardaki yakıt tüketim oranına göre)
    const fuelUsed = durationHours * state.settings.fuelRate;
    const fuelCost = fuelUsed * state.settings.fuelPrice;

    state.currentTrip = {
        id: Date.now(),
        date: new Date().toISOString(),
        duration: tripDuration,
        distance: state.tripTotalDistance,
        avgSpeed: parseFloat(avgSpeed.toFixed(1)),
        maxSpeed: state.tripMaxSpeed,
        fuelUsed: parseFloat(fuelUsed.toFixed(1)),
        fuelCost: parseFloat(fuelCost.toFixed(0)),
        positions: state.tripPositions
    };

    // UI güncelle
    state.tripActive = false;
    btn.classList.remove('active');
    btn.innerHTML = '<i class="fas fa-play"></i>';
    btn.title = 'Yola Çık';
    speedPanel.classList.add('hidden');

    // Özet modalını göster
    showTripSummary();

    console.log('Yolculuk bitti! 🏁', state.currentTrip);
}

function handlePositionUpdate(position) {
    const { latitude, longitude, speed, accuracy } = position.coords;
    const timestamp = position.timestamp;

    // Hızı km/s'ye çevir (GPS m/s verir)
    let currentSpeed = 0;
    if (speed !== null && speed >= 0) {
        currentSpeed = speed * 3.6; // m/s -> km/s
    } else if (state.tripLastPosition) {
        // GPS hız vermezse hesapla
        const timeDiff = (timestamp - state.tripLastPosition.timestamp) / 1000; // saniye
        if (timeDiff > 0) {
            const dist = calculateDistance(
                state.tripLastPosition.lat,
                state.tripLastPosition.lng,
                latitude,
                longitude
            );
            currentSpeed = (dist / timeDiff) * 3600; // km/s
        }
    }

    // Düşük doğrulukta veya çok yüksek hız -> muhtemelen hata
    if (accuracy > 50 || currentSpeed > 150) {
        currentSpeed = state.tripCurrentSpeed; // Önceki değeri koru
    }

    state.tripCurrentSpeed = currentSpeed;

    // Max hız güncelle
    if (currentSpeed > state.tripMaxSpeed) {
        state.tripMaxSpeed = currentSpeed;
    }

    // Mesafe hesapla
    if (state.tripLastPosition && accuracy <= 50) {
        const dist = calculateDistance(
            state.tripLastPosition.lat,
            state.tripLastPosition.lng,
            latitude,
            longitude
        );
        // Sadece makul mesafeleri ekle (hata filtresi)
        if (dist < 1) { // 1 km'den az olmalı bir güncelleme arasında
            state.tripTotalDistance += dist;
        }
    }

    // Pozisyonu kaydet
    const posData = { lat: latitude, lng: longitude, timestamp, speed: currentSpeed };
    state.tripPositions.push(posData);
    state.tripLastPosition = posData;

    // UI güncelle
    updateSpeedDisplay();

    // Kullanıcı konumunu haritada göster
    updateUserLocationMarker(latitude, longitude, accuracy, currentSpeed > 2);

    // Rota çizgisini güncelle
    updateTripPolyline();

    // Haritayı kullanıcının konumuna ortala (yolculuk sırasında)
    if (state.tripActive) {
        map.setView([latitude, longitude], map.getZoom(), { animate: true });
    }
}

function updateUserLocationMarker(lat, lng, accuracy, isMoving) {
    // Konum marker'ını oluştur veya güncelle
    const markerIcon = L.divIcon({
        className: 'user-location-wrapper',
        html: `<div class="user-location-marker ${isMoving ? 'moving' : ''}"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });

    if (state.userLocationMarker) {
        state.userLocationMarker.setLatLng([lat, lng]);
        state.userLocationMarker.setIcon(markerIcon);
    } else {
        state.userLocationMarker = L.marker([lat, lng], {
            icon: markerIcon,
            zIndexOffset: 1000
        }).addTo(map);
    }

    // Doğruluk çemberini güncelle
    if (accuracy && accuracy < 500) {
        if (state.userAccuracyCircle) {
            state.userAccuracyCircle.setLatLng([lat, lng]);
            state.userAccuracyCircle.setRadius(accuracy);
        } else {
            state.userAccuracyCircle = L.circle([lat, lng], {
                radius: accuracy,
                className: 'user-location-accuracy',
                stroke: true,
                weight: 1,
                fill: true,
                fillOpacity: 0.15
            }).addTo(map);
        }
    }
}

function updateTripPolyline() {
    if (state.tripPositions.length < 2) return;

    const latlngs = state.tripPositions.map(p => [p.lat, p.lng]);

    if (state.tripPolyline) {
        state.tripPolyline.setLatLngs(latlngs);
    } else {
        state.tripPolyline = L.polyline(latlngs, {
            color: '#2a9d8f',
            weight: 4,
            opacity: 0.8,
            lineJoin: 'round',
            lineCap: 'round'
        }).addTo(map);
    }
}

function removeTripPolyline() {
    if (state.tripPolyline) {
        map.removeLayer(state.tripPolyline);
        state.tripPolyline = null;
    }
}

function handlePositionError(error) {
    console.warn('GPS hatası:', error.message);

    switch (error.code) {
        case error.PERMISSION_DENIED:
            alert('Konum izni reddedildi. Yolculuk takibi için konum iznine ihtiyaç var.');
            endTrip();
            break;
        case error.POSITION_UNAVAILABLE:
            // Sessizce devam et, sonraki güncellemeyi bekle
            break;
        case error.TIMEOUT:
            // Sessizce devam et
            break;
    }
}

function updateSpeedDisplay() {
    const speedEl = document.getElementById('currentSpeed');
    speedEl.textContent = Math.round(state.tripCurrentSpeed);
}

function updateTripTimer() {
    if (!state.tripStartTime) return;

    const elapsed = Date.now() - state.tripStartTime;
    const timerEl = document.getElementById('tripTimer');
    timerEl.textContent = formatDuration(elapsed);
}

function formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return [hours, minutes, seconds]
        .map(n => n.toString().padStart(2, '0'))
        .join(':');
}

function showTripSummary() {
    if (!state.currentTrip) return;

    const modal = document.getElementById('tripSummaryModal');

    // Değerleri doldur
    document.getElementById('tripDuration').textContent = formatDuration(state.currentTrip.duration);
    document.getElementById('tripDistance').textContent = state.currentTrip.distance.toFixed(2);
    document.getElementById('tripAvgSpeed').textContent = state.currentTrip.avgSpeed.toFixed(1);
    document.getElementById('tripMaxSpeed').textContent = state.currentTrip.maxSpeed.toFixed(1);
    document.getElementById('tripFuelUsed').textContent = state.currentTrip.fuelUsed.toFixed(1);
    document.getElementById('tripFuelCost').textContent = state.currentTrip.fuelCost.toFixed(0);

    modal.classList.remove('hidden');
}

function closeTripSummary() {
    document.getElementById('tripSummaryModal').classList.add('hidden');
}

async function saveCurrentTrip() {
    if (!state.currentTrip) return;

    // Firebase veya LocalStorage'a kaydet
    if (typeof firebaseDB !== 'undefined' && firebaseAuth && firebaseAuth.isLoggedIn()) {
        await firebaseDB.saveTrip(state.currentTrip);
        // Firestore'dan yeniden yükle
        await firebaseDB.loadTrips();
    } else {
        // Local storage'dan mevcut kayıtları al
        let trips = getTripHistory();

        // Yeni trip'i ekle
        trips.unshift(state.currentTrip);

        // Maksimum 50 kayıt tut
        if (trips.length > 50) {
            trips = trips.slice(0, 50);
        }

        // Kaydet
        localStorage.setItem('denizRotaTrips', JSON.stringify(trips));
    }

    // Modal'ı kapat
    closeTripSummary();
    state.currentTrip = null;

    // Sidebar listesini güncelle
    updateSidebarTripsList();

    console.log('Yolculuk kaydedildi! ✅');
}

function getTripHistory() {
    // Firebase'den veya LocalStorage'dan al
    if (typeof firebaseDB !== 'undefined' && firebaseAuth && firebaseAuth.isLoggedIn()) {
        return firebaseDB.getTrips();
    }

    try {
        const saved = localStorage.getItem('denizRotaTrips');
        return saved ? JSON.parse(saved) : [];
    } catch (e) {
        console.warn('Trip history yüklenemedi:', e);
        return [];
    }
}

function showTripHistory() {
    const modal = document.getElementById('tripHistoryModal');
    const listEl = document.getElementById('tripHistoryList');
    const trips = getTripHistory();

    if (trips.length === 0) {
        listEl.innerHTML = '<p class="empty-message"><i class="fas fa-ship"></i> Henüz kayıtlı yolculuk yok</p>';
    } else {
        listEl.innerHTML = trips.map(trip => {
            const date = new Date(trip.date);
            const dateStr = date.toLocaleDateString('tr-TR', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            return `
                <div class="trip-history-item">
                    <div class="trip-history-date">
                        <i class="fas fa-calendar"></i> ${dateStr}
                    </div>
                    <div class="trip-history-stats">
                        <div class="trip-history-stat">
                            <i class="fas fa-clock"></i>
                            <strong>${formatDuration(trip.duration)}</strong>
                        </div>
                        <div class="trip-history-stat">
                            <i class="fas fa-road"></i>
                            <strong>${trip.distance.toFixed(2)}</strong> km
                        </div>
                        <div class="trip-history-stat">
                            <i class="fas fa-tachometer-alt"></i>
                            <strong>${trip.avgSpeed.toFixed(1)}</strong> km/s ort.
                        </div>
                        <div class="trip-history-stat">
                            <i class="fas fa-bolt"></i>
                            <strong>${trip.maxSpeed.toFixed(1)}</strong> km/s max
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    modal.classList.remove('hidden');
}

function closeTripHistory() {
    document.getElementById('tripHistoryModal').classList.add('hidden');
}

async function clearTripHistory() {
    if (confirm('Tüm yolculuk geçmişini silmek istediğinize emin misiniz?')) {
        // Firebase veya LocalStorage'dan sil
        if (typeof firebaseDB !== 'undefined' && firebaseAuth && firebaseAuth.isLoggedIn()) {
            await firebaseDB.clearTrips();
            await firebaseDB.loadTrips();
        } else {
            localStorage.removeItem('denizRotaTrips');
        }

        showTripHistory(); // Modal listeyi yenile
        updateSidebarTripsList(); // Sidebar listeyi yenile
    }
}

// ===== Sidebar Trips List =====
function updateSidebarTripsList() {
    const container = document.getElementById('tripsList');
    const countBadge = document.getElementById('tripCount');
    const trips = getTripHistory();

    countBadge.textContent = trips.length;

    if (trips.length === 0) {
        container.innerHTML = `
            <p class="empty-message">
                <i class="fas fa-route"></i>
                Henüz kayıtlı yolculuk yok
            </p>
        `;
        return;
    }

    // Son 5 yolculuğu göster
    const recentTrips = trips.slice(0, 5);

    container.innerHTML = recentTrips.map((trip, index) => {
        const date = new Date(trip.date);
        const dateStr = date.toLocaleDateString('tr-TR', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });

        return `
            <div class="trip-item" onclick="showTripOnMap(${index})">
                <div class="trip-item-header">
                    <span class="trip-item-date"><i class="fas fa-calendar"></i> ${dateStr}</span>
                    <div class="trip-item-actions">
                        <button class="trip-item-btn" onclick="event.stopPropagation(); showTripOnMap(${index})" title="Haritada Göster">
                            <i class="fas fa-map-marked-alt"></i>
                        </button>
                        <button class="trip-item-btn delete" onclick="event.stopPropagation(); deleteTrip(${index})" title="Sil">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="trip-item-stats">
                    <span class="trip-item-stat"><i class="fas fa-clock"></i> ${formatDuration(trip.duration)}</span>
                    <span class="trip-item-stat"><i class="fas fa-road"></i> ${trip.distance.toFixed(1)} km</span>
                    <span class="trip-item-stat"><i class="fas fa-gas-pump"></i> ${(trip.fuelUsed || 0).toFixed(1)} lt</span>
                </div>
            </div>
        `;
    }).join('');

    // 5'ten fazla varsa "Tümünü Gör" butonu ekle
    if (trips.length > 5) {
        container.innerHTML += `
            <button class="btn btn-sm btn-secondary" style="width:100%; margin-top:8px;" onclick="showTripHistory()">
                <i class="fas fa-list"></i> Tümünü Gör (${trips.length})
            </button>
        `;
    }
}

// Haritada yolculuk rotasını göster
let displayedTripPolyline = null;

function showTripOnMap(index) {
    const trips = getTripHistory();
    const trip = trips[index];

    if (!trip || !trip.positions || trip.positions.length < 2) {
        alert('Bu yolculuğun rota verisi bulunamadı.');
        return;
    }

    // Önceki gösterilen rotayı kaldır
    if (displayedTripPolyline) {
        map.removeLayer(displayedTripPolyline);
    }

    // Rotayı çiz
    const latlngs = trip.positions.map(p => [p.lat, p.lng]);
    displayedTripPolyline = L.polyline(latlngs, {
        color: '#0077b6',
        weight: 4,
        opacity: 0.8,
        lineJoin: 'round',
        lineCap: 'round'
    }).addTo(map);

    // Başlangıç ve bitiş noktalarına marker ekle
    const startIcon = L.divIcon({
        className: 'trip-marker-start',
        html: '<div style="background:#2a9d8f;color:white;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"><i class="fas fa-play"></i></div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });

    const endIcon = L.divIcon({
        className: 'trip-marker-end',
        html: '<div style="background:#e63946;color:white;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"><i class="fas fa-flag-checkered"></i></div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });

    const startMarker = L.marker(latlngs[0], { icon: startIcon }).addTo(map);
    const endMarker = L.marker(latlngs[latlngs.length - 1], { icon: endIcon }).addTo(map);

    // Polyline'a marker referanslarını ekle (temizlik için)
    displayedTripPolyline.startMarker = startMarker;
    displayedTripPolyline.endMarker = endMarker;

    // Haritayı rotaya sığdır
    map.fitBounds(displayedTripPolyline.getBounds(), { padding: [50, 50] });

    // Popup ile bilgi göster
    const date = new Date(trip.date);
    const dateStr = date.toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    displayedTripPolyline.bindPopup(`
        <div style="min-width:180px;">
            <strong><i class="fas fa-ship"></i> Yolculuk</strong><br>
            <small>${dateStr}</small>
            <hr style="margin:8px 0;border:none;border-top:1px solid #eee;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.85rem;">
                <div><i class="fas fa-clock" style="color:#0077b6;"></i> ${formatDuration(trip.duration)}</div>
                <div><i class="fas fa-road" style="color:#0077b6;"></i> ${trip.distance.toFixed(2)} km</div>
                <div><i class="fas fa-tachometer-alt" style="color:#0077b6;"></i> ${trip.avgSpeed.toFixed(1)} km/s</div>
                <div><i class="fas fa-gas-pump" style="color:#0077b6;"></i> ${(trip.fuelUsed || 0).toFixed(1)} lt</div>
            </div>
            <button onclick="clearDisplayedTrip()" style="width:100%;margin-top:10px;padding:6px;background:#e63946;color:white;border:none;border-radius:4px;cursor:pointer;font-size:0.8rem;">
                <i class="fas fa-times"></i> Rotayı Kaldır
            </button>
        </div>
    `).openPopup();
}

function clearDisplayedTrip() {
    if (displayedTripPolyline) {
        if (displayedTripPolyline.startMarker) map.removeLayer(displayedTripPolyline.startMarker);
        if (displayedTripPolyline.endMarker) map.removeLayer(displayedTripPolyline.endMarker);
        map.removeLayer(displayedTripPolyline);
        displayedTripPolyline = null;
    }
}

async function deleteTrip(index) {
    if (!confirm('Bu yolculuğu silmek istediğinize emin misiniz?')) return;

    let trips = getTripHistory();
    const tripToDelete = trips[index];

    if (typeof firebaseDB !== 'undefined' && firebaseAuth && firebaseAuth.isLoggedIn()) {
        // Firestore'dan sil
        if (tripToDelete && tripToDelete.id) {
            await firebaseDB.deleteTrip(tripToDelete.id);
            await firebaseDB.loadTrips();
        }
    } else {
        // LocalStorage'dan sil
        trips.splice(index, 1);
        localStorage.setItem('denizRotaTrips', JSON.stringify(trips));
    }

    updateSidebarTripsList();
    showTripHistory(); // Modal açıksa onu da güncelle
}

// Global fonksiyonlar
window.showTripOnMap = showTripOnMap;
window.clearDisplayedTrip = clearDisplayedTrip;
window.deleteTrip = deleteTrip;

// ===== Route Save/Load System =====
function setupRouteSaveEventListeners() {
    // Save route button
    const saveRouteBtn = document.getElementById('saveRouteBtn');
    if (saveRouteBtn) {
        saveRouteBtn.addEventListener('click', openSaveRouteModal);
    }

    // Close save route modal
    const closeSaveRouteBtn = document.getElementById('closeSaveRouteBtn');
    if (closeSaveRouteBtn) {
        closeSaveRouteBtn.addEventListener('click', closeSaveRouteModal);
    }

    // Cancel save route
    const cancelSaveRouteBtn = document.getElementById('cancelSaveRouteBtn');
    if (cancelSaveRouteBtn) {
        cancelSaveRouteBtn.addEventListener('click', closeSaveRouteModal);
    }

    // Confirm save route
    const confirmSaveRouteBtn = document.getElementById('confirmSaveRouteBtn');
    if (confirmSaveRouteBtn) {
        confirmSaveRouteBtn.addEventListener('click', confirmSaveRoute);
    }
}

function openSaveRouteModal() {
    if (state.waypoints.length < 2) {
        alert('Kaydetmek için en az 2 rota noktası gerekli');
        return;
    }

    const modal = document.getElementById('saveRouteModal');
    document.getElementById('routeName').value = '';
    document.getElementById('routeDescription').value = '';
    modal.classList.remove('hidden');

    // Focus on name input
    setTimeout(() => document.getElementById('routeName').focus(), 100);
}

function closeSaveRouteModal() {
    document.getElementById('saveRouteModal').classList.add('hidden');
}

async function confirmSaveRoute() {
    const name = document.getElementById('routeName').value.trim();
    const description = document.getElementById('routeDescription').value.trim();

    if (!name) {
        alert('Rota adı gerekli');
        return;
    }

    const route = {
        id: Date.now().toString(),
        name: name,
        description: description,
        waypoints: state.waypoints.map(wp => ({
            lat: wp.lat,
            lng: wp.lng
        })),
        totalDistance: getTotalDistance(),
        waypointCount: state.waypoints.length,
        createdAt: new Date().toISOString()
    };

    // Firebase veya LocalStorage'a kaydet
    if (typeof firebaseDB !== 'undefined' && firebaseAuth && firebaseAuth.isLoggedIn()) {
        await firebaseDB.saveRoute(route);
    } else {
        let routes = JSON.parse(localStorage.getItem('denizRotaRoutes') || '[]');
        routes.unshift(route);
        if (routes.length > 50) routes = routes.slice(0, 50);
        localStorage.setItem('denizRotaRoutes', JSON.stringify(routes));
    }

    closeSaveRouteModal();
    updateSavedRoutesList();

    console.log('Rota kaydedildi:', route.name);
}

function getSavedRoutes() {
    // Firebase'den veya LocalStorage'dan al
    if (typeof firebaseDB !== 'undefined' && firebaseAuth && firebaseAuth.isLoggedIn()) {
        return firebaseDB.getRoutes();
    }
    return JSON.parse(localStorage.getItem('denizRotaRoutes') || '[]');
}

function updateSavedRoutesList() {
    const container = document.getElementById('savedRoutesList');
    const countBadge = document.getElementById('savedRouteCount');
    const routes = getSavedRoutes();

    if (!container || !countBadge) return;

    countBadge.textContent = routes.length;

    if (routes.length === 0) {
        container.innerHTML = `
            <p class="empty-message">
                <i class="fas fa-cloud"></i>
                Kayıtlı rota yok
            </p>
        `;
        return;
    }

    container.innerHTML = routes.slice(0, 5).map((route, index) => {
        const date = route.createdAt ? new Date(route.createdAt) : new Date();
        const dateStr = date.toLocaleDateString('tr-TR', {
            day: 'numeric',
            month: 'short'
        });

        return `
            <div class="route-item" onclick="loadSavedRoute('${route.id}')">
                <div class="route-item-header">
                    <span class="route-item-name" title="${route.name}">${route.name}</span>
                    <div class="route-item-actions">
                        <button class="route-item-btn" onclick="event.stopPropagation(); loadSavedRoute('${route.id}')" title="Yükle">
                            <i class="fas fa-upload"></i>
                        </button>
                        <button class="route-item-btn delete" onclick="event.stopPropagation(); deleteSavedRoute('${route.id}')" title="Sil">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="route-item-meta">
                    <span><i class="fas fa-map-marker-alt"></i> ${route.waypointCount || route.waypoints?.length || 0} nokta</span>
                    <span><i class="fas fa-ruler"></i> ${(route.totalDistance || 0).toFixed(1)} km</span>
                    <span><i class="fas fa-calendar"></i> ${dateStr}</span>
                </div>
            </div>
        `;
    }).join('');

    // 5'ten fazla varsa "Tümünü Gör" butonu ekle
    if (routes.length > 5) {
        container.innerHTML += `
            <button class="btn btn-sm btn-secondary" style="width:100%; margin-top:8px;" onclick="showAllSavedRoutes()">
                <i class="fas fa-list"></i> Tümünü Gör (${routes.length})
            </button>
        `;
    }
}

async function loadSavedRoute(routeId) {
    const routes = getSavedRoutes();
    const route = routes.find(r => r.id === routeId || r.id.toString() === routeId);

    if (!route || !route.waypoints) {
        alert('Rota bulunamadı');
        return;
    }

    // Mevcut rotayı temizle
    clearRoute();

    // Yeni rotayı yükle
    for (const wp of route.waypoints) {
        await addWaypoint(wp.lat, wp.lng);
    }

    // Haritayı rotaya sığdır
    if (state.polyline) {
        map.fitBounds(state.polyline.getBounds(), { padding: [50, 50] });
    }

    console.log('Rota yüklendi:', route.name);
}

async function deleteSavedRoute(routeId) {
    if (!confirm('Bu rotayı silmek istediğinize emin misiniz?')) return;

    if (typeof firebaseDB !== 'undefined' && firebaseAuth && firebaseAuth.isLoggedIn()) {
        await firebaseDB.deleteRoute(routeId);
        // Firestore'dan tekrar yükle
        await firebaseDB.loadRoutes();
    } else {
        let routes = JSON.parse(localStorage.getItem('denizRotaRoutes') || '[]');
        routes = routes.filter(r => r.id !== routeId && r.id.toString() !== routeId);
        localStorage.setItem('denizRotaRoutes', JSON.stringify(routes));
    }

    updateSavedRoutesList();
}

function showAllSavedRoutes() {
    // TODO: Modal ile tüm rotaları göster
    alert('Tüm rotalar: ' + getSavedRoutes().length);
}

// Waypoint sayısı değiştiğinde "Rotayı Kaydet" butonunu göster/gizle
function updateSaveRouteButtonVisibility() {
    const saveBtn = document.getElementById('saveRouteBtn');
    if (saveBtn) {
        if (state.waypoints.length >= 2) {
            saveBtn.classList.remove('hidden');
        } else {
            saveBtn.classList.add('hidden');
        }
    }
}

// Global fonksiyonlar
window.loadSavedRoute = loadSavedRoute;
window.deleteSavedRoute = deleteSavedRoute;
window.showAllSavedRoutes = showAllSavedRoutes;
