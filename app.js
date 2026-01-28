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

async function fetchWeather(lat, lng) {
    const cacheKey = `${lat.toFixed(2)}_${lng.toFixed(2)}`;

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
const PARTICLE_COUNT = 3000;
const PARTICLE_LINE_WIDTH = 1.5;

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

    for (let i = 0; i < PARTICLE_COUNT; i++) {
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

                // Gradient efekti için alpha değişimi
                const alpha = color.a * (1 - particle.age / particle.maxAge) * 0.8;
                ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
                ctx.lineWidth = PARTICLE_LINE_WIDTH;
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

    const waveContent = hasWave ? `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
            <div style="text-align: center; padding: 8px; background: #e3f2fd; border-radius: 6px;">
                <i class="fas fa-water" style="color: #0077b6;"></i><br>
                <strong>${waypoint.weather.waveHeight.toFixed(1)}</strong> m<br>
                <small style="color: #888;">Dalga</small>
            </div>
            <div style="text-align: center; padding: 8px; background: #e3f2fd; border-radius: 6px;">
                <i class="fas fa-stopwatch" style="color: #0077b6;"></i><br>
                <strong>${waypoint.weather.wavePeriod ? waypoint.weather.wavePeriod.toFixed(1) : '--'}</strong> sn<br>
                <small style="color: #888;">Periyot</small>
            </div>
        </div>
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
        const waveInfo = hasWave ? `<i class="fas fa-water"></i> ${wp.weather.waveHeight.toFixed(1)}m` : '';
        const weatherInfo = hasWeather
            ? `<i class="fas fa-wind"></i> ${wp.weather.windSpeed.toFixed(0)} km/s ${windDirection}
               &nbsp;
               <i class="fas fa-thermometer-half"></i> ${wp.weather.temperature.toFixed(0)}°C
               ${waveInfo ? '&nbsp; ' + waveInfo : ''}`
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
