# CLAUDE.md - DenizRota Codebase Guide

This document provides guidance for AI assistants working with the DenizRota codebase.

## Project Overview

**DenizRota** (Turkish: "Sea Route") is a web-based boat route planning and trip tracking application for amateur sailors. The application is entirely in Turkish.

### Key Features
- Interactive map-based route planning with waypoints
- Real-time weather and marine forecasts along routes
- Wind and wave overlay visualizations with particle animations
- **Coastal fetch calculation** for realistic wave predictions near shore
- Fuel consumption and cost calculations
- GPS-based trip tracking with history
- User authentication (Email/Password, Google OAuth)
- Cloud sync with Firebase Firestore
- Saved routes management
- Weather auto-refresh capability
- Responsive design for mobile and desktop

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Frontend | Vanilla JavaScript (ES6+) |
| Map Library | Leaflet.js v1.9.4 |
| Marine Overlay | OpenSeaMap tiles |
| Weather APIs | Open-Meteo (Weather + Marine) |
| Icons | FontAwesome v6.4.0 |
| Storage | Browser LocalStorage |
| Backend | Firebase (Auth + Firestore) |
| GPS | Geolocation API |

## File Structure

```
/DenizRota
├── index.html          # HTML structure and UI components (~730 lines)
├── app.js              # Core application logic (~3160 lines)
├── firebase-config.js  # Firebase Auth & Firestore integration (~690 lines)
├── styles.css          # Styling and responsive design (~1860 lines)
└── CLAUDE.md           # This file
```

**Note:** This is a simple, build-free project with no package.json or build tools. All dependencies are loaded from CDN.

## Architecture

### State Management
The application uses a single centralized `state` object in `app.js:7-52`:

```javascript
const state = {
    routeMode: false,           // Route editing mode
    waypoints: [],              // Route waypoints with weather data
    markers: [],                // Leaflet markers
    polyline: null,             // Route line
    windOverlayVisible: false,
    windLayer: null,
    windCanvas: null,
    windAnimationId: null,
    windParticles: [],
    waveOverlayVisible: false,
    waveLayer: null,
    waveCanvas: null,
    waveAnimationId: null,
    weatherCache: new Map(),    // API response cache
    windGridData: [],           // Wind grid data
    waveGridData: [],           // Wave grid data
    weatherRefreshInterval: null, // Auto-refresh timer
    isFullscreen: false,
    tripActive: false,          // GPS tracking state
    tripStartTime: null,
    tripTimerInterval: null,
    tripWatchId: null,
    tripPositions: [],          // GPS track history
    tripCurrentSpeed: 0,
    tripMaxSpeed: 0,
    tripTotalDistance: 0,
    tripLastPosition: null,
    currentTrip: null,
    userLocationMarker: null,
    userAccuracyCircle: null,
    tripPolyline: null,
    settings: { ... }           // Boat configuration
};
```

### Main Modules (in app.js)

| Section | Lines | Description |
|---------|-------|-------------|
| State Management | 7-52 | Central state object |
| Open-Meteo API | 54-356 | Weather and marine data fetching |
| Fetch Calculation | 58-216 | Coastal wind distance calculation |
| Map Initialization | 358-437 | Leaflet setup with OpenSeaMap |
| Wind Particle System | 439-700+ | Canvas-based particle animation |
| Wave Overlay | 700-900+ | Animated wave visualization |
| Waypoint Management | varies | Add, move, delete waypoints |
| Route Calculations | varies | Distance, time, fuel calculations |
| Trip Tracking | varies | GPS tracking and speed monitoring |
| Trip History | varies | LocalStorage persistence |
| Saved Routes | 2951-3162 | Route saving and loading |
| Settings | varies | Boat configuration management |
| UI Event Handlers | varies | Button clicks, keyboard shortcuts |

### Firebase Module (in firebase-config.js)

| Section | Description |
|---------|-------------|
| Firebase Initialization | App configuration and setup |
| Authentication | Email/password and Google OAuth |
| Firestore Settings | Cloud settings sync |
| Firestore Trips | Cloud trip storage |
| Firestore Routes | Cloud route storage |
| Data Migration | LocalStorage to cloud migration |
| UI Updates | Auth state UI handling |

## API Endpoints

The app uses free Open-Meteo APIs (no authentication required):

```javascript
const OPEN_METEO_WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const OPEN_METEO_MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine';
```

**API Features:**
- 7-day forecast horizon
- Hourly data resolution
- Automatic timezone handling
- Exponential backoff retry (3 retries: 2s, 4s, 8s delays)

**Caching:** API responses are cached for 1 hour per 0.01° grid cell.

## Coastal Fetch Calculation

The application includes a sophisticated fetch calculation system for more accurate wave predictions near coastlines.

### What is Fetch?
**Fetch** is the distance over open water that wind travels before reaching a point. Short fetch = smaller waves, even with strong winds.

### Implementation (app.js:58-216)

```javascript
// Key functions:
calculateFetch(lat, lng, windDirection)  // Calculate fetch distance
isPointOnLand(lat, lng)                  // Check if point is on land
isInsideCoastline(lat, lng)              // Ray casting for land detection
getWaveAdjustmentFactor(fetchKm)         // Get wave reduction factor
adjustWaveForFetch(waveHeight, fetchKm)  // Apply fetch adjustment
```

### Fetch Adjustment Factors

| Fetch Distance | Wave Factor | Description |
|----------------|-------------|-------------|
| < 3 km | 0.1 | Very short fetch - almost flat |
| 3-5 km | 0.2 | Short fetch |
| 5-10 km | 0.35 | Medium-short fetch |
| 10-20 km | 0.5 | Medium fetch |
| 20-50 km | 0.7 | Long fetch |
| > 50 km | 1.0 | Open sea |

### Turkey Coastline Data
The app includes simplified coastline coordinates (`TURKEY_COASTLINE` array) covering:
- Northern Aegean (Çanakkale - İzmir)
- Southern Aegean (Bodrum - Marmaris)
- Datça Peninsula
- Mediterranean coast (Fethiye - Mersin)
- Gökova and Hisarönü Bays

## Code Conventions

### Language
- **UI and comments are in Turkish**
- Variable names and functions use English camelCase

### Naming Patterns
```javascript
// Functions: camelCase with descriptive verbs
toggleWindOverlay()
updateWaypointPosition()
calculateRouteStats()
calculateFetch()

// Event handlers exposed globally for HTML onclick
window.removeWaypoint = function(id) { ... }
window.loadSavedRoute = function(routeId) { ... }
```

### Section Organization
Code sections are marked with comment delimiters:
```javascript
// ===== Section Name =====
```

### CSS Conventions
- CSS custom properties (variables) in `:root`
- `.hidden` class for visibility toggling
- `.active` class for active button states
- BEM-like naming for components

### Key CSS Variables (styles.css)
```css
--primary-color: #0077b6;
--secondary-color: #00b4d8;
--danger-color: #e63946;
--warning-color: #f4a261;
--success-color: #2a9d8f;
--sidebar-width: 320px;
--header-height: 60px;
```

## Data Structures

### Waypoint
```javascript
{
    id: timestamp,
    lat: number,
    lng: number,
    weather: {
        windSpeed: number,      // km/h
        windDirection: number,  // degrees
        windGusts: number,      // km/h
        temperature: number,    // celsius
        waveHeight: number,     // meters (fetch-adjusted)
        waveDirection: number,  // degrees
        wavePeriod: number,     // seconds
        swellHeight: number,    // meters
        swellPeriod: number     // seconds
    },
    riskLevel: 'green' | 'yellow' | 'red' | 'gray',
    loading: boolean
}
```

### Trip (stored in LocalStorage/Firestore)
```javascript
{
    id: timestamp,
    date: ISO string,
    duration: milliseconds,
    distance: km,
    avgSpeed: km/h,
    maxSpeed: km/h,
    fuelUsed: liters,
    fuelCost: TRY,
    positions: [{ lat, lng, timestamp, speed }]
}
```

### Saved Route
```javascript
{
    id: string,
    name: string,
    description: string,
    waypoints: [{ lat, lng }],
    totalDistance: number,
    waypointCount: number,
    createdAt: ISO string
}
```

### Settings (stored in LocalStorage/Firestore)
```javascript
{
    boatName: string,
    boatType: 'motorlu' | 'yelkenli' | 'gulet' | 'katamaran' | 'sürat',
    avgSpeed: number,       // km/h
    fuelRate: number,       // liters/hour
    tankCapacity: number,   // liters
    fuelPrice: number       // TRY/liter
}
```

## LocalStorage Keys

| Key | Description |
|-----|-------------|
| `denizRotaSettings` | Boat configuration |
| `denizRotaTrips` | Trip history (max 50 trips) |
| `denizRotaRoutes` | Saved routes (max 50 routes) |

**Note:** When Firebase authentication is enabled and a user is logged in, data is stored in Firestore instead of LocalStorage. LocalStorage serves as a fallback for offline use or when not authenticated.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `R` | Toggle route mode |
| `F` | Toggle fullscreen |
| `Escape` | Close modals / Exit fullscreen |

## Risk Level Classification

Weather risk is calculated based on wind and wave conditions:

| Level | Wind (km/h) | Wave Height (m) | Marker Color |
|-------|-------------|-----------------|--------------|
| Green | 0-15 | < 0.5 | Green |
| Yellow | 15-30 | 0.5-1.5 | Yellow/Orange |
| Red | 30+ | > 1.5 | Red |
| Gray | No data | No data | Gray |

## Mobile Optimizations

The application includes specific optimizations for mobile devices:

### Particle Count Optimization
```javascript
function getParticleCount() {
    // Mobile (< 768px): 600 particles
    // Tablet: 1200 particles
    // Desktop: 3000 particles
}
```

### Mobile-specific CSS
- Collapsible sidebar on mobile
- Touch-friendly button sizes
- Responsive map controls
- Compact speed panel positioning

## Development Workflow

### Running the Application
Simply open `index.html` in a browser - no build step required.

### Making Changes
1. Edit the relevant file (index.html, app.js, or styles.css)
2. Refresh the browser to see changes
3. Test on mobile viewport (responsive design)

### Testing Checklist
- Route creation and waypoint management
- Weather data loading for waypoints
- Wind/wave overlay toggle
- Trip tracking start/stop
- Settings persistence
- Saved routes save/load
- Mobile responsiveness
- Firebase authentication (if configured)

## Common Modification Patterns

### Adding a New UI Element
1. Add HTML in `index.html`
2. Add styles in `styles.css`
3. Add event handler in `app.js` (in `init()` function or as global function)

### Adding a New State Property
1. Add to `state` object in `app.js:7-52`
2. Initialize in `init()` if needed
3. Save/load from LocalStorage if persistence needed

### Modifying Weather Processing
- `fetchWeather()` - API calls with retry logic
- `getWeatherFromAPI()` - Data extraction
- `calculateFetch()` - Coastal wave adjustment
- `getRiskLevel()` - Risk classification
- `updateWaypointWeather()` - UI updates

### Modifying Map Behavior
- Map initialization in `initMap()`
- Marker creation in `addWaypoint()`
- Overlay rendering in `renderWindOverlay()` and `renderWaveOverlay()`

### Adding New Boat Types
1. Add option in `index.html` Settings Modal (`#boatType` select)
2. No code changes needed - type is stored as string

## Performance Considerations

- **Canvas rendering** for overlays (not DOM elements)
- **RequestAnimationFrame** for smooth animations
- **Promise.all()** for parallel API calls
- **Adaptive particle count** based on device screen size
- **Geolocation filtering**: Accuracy > 50m ignored
- **Distance jump filtering**: > 1km jumps ignored (GPS noise)
- **API caching**: 1 hour per location
- **Exponential backoff**: Auto-retry failed API calls

## Important Functions Reference

| Function | Location | Purpose |
|----------|----------|---------|
| `init()` | app.js | Application entry point |
| `initMap()` | app.js | Leaflet map setup |
| `addWaypoint()` | app.js | Create new route point |
| `fetchWeather()` | app.js:218 | Get weather data with retry |
| `calculateFetch()` | app.js:100 | Coastal fetch distance |
| `getWaveAdjustmentFactor()` | app.js:200 | Fetch-based wave reduction |
| `calculateRouteStats()` | app.js | Distance/time/fuel calculations |
| `toggleWindOverlay()` | app.js | Wind particle animation |
| `toggleWaveOverlay()` | app.js | Wave visualization |
| `getParticleCount()` | app.js:441 | Device-adaptive particle count |
| `startTrip()` | app.js | Begin GPS tracking |
| `endTrip()` | app.js | Stop tracking, save trip |
| `loadSettings()` | app.js | Load from LocalStorage |
| `saveSettings()` | app.js | Save to LocalStorage |
| `loadSavedRoute()` | app.js:3101 | Load saved route |
| `confirmSaveRoute()` | app.js:2997 | Save current route |

## Firebase Integration

The application supports optional Firebase Authentication and Firestore for cloud data storage.

### Firebase Configuration (`firebase-config.js`)

| Function | Purpose |
|----------|---------|
| `initializeFirebase()` | Initialize Firebase app |
| `signUpWithEmail()` | Email/password registration |
| `signInWithEmail()` | Email/password login |
| `signInWithGoogle()` | Google OAuth login |
| `signOut()` | User logout |
| `saveSettingsToFirestore()` | Cloud settings sync |
| `saveTripToFirestore()` | Cloud trip storage |
| `saveRouteToFirestore()` | Cloud route storage |
| `migrateLocalDataToFirestore()` | Migrate LocalStorage to cloud |

### Global Exports

Firebase functions are exposed via window objects:
- `window.firebaseAuth` - Authentication methods
- `window.firebaseDB` - Database operations

### Firestore Data Structure

```
users/{userId}/
├── settings: { ... }           # User settings
├── trips/{tripId}/             # Trip history subcollection
│   └── { date, distance, ... }
└── routes/{routeId}/           # Saved routes subcollection
    └── { name, waypoints, ... }
```

## Sea Area Detection

The app defines sea areas around Turkey for overlay rendering:

```javascript
const SEA_AREAS = [
    { name: 'Marmara', bounds: {...} },
    { name: 'Ege', bounds: {...} },
    { name: 'Karadeniz', bounds: {...} },
    { name: 'Akdeniz', bounds: {...} },
    { name: 'Boğaz', bounds: {...} }
];
```

Land exclusion areas prevent rendering overlays on peninsulas and large landmasses.

## Gotchas and Edge Cases

1. **Marine API is optional** - The app continues if marine data fails
2. **Land detection** - Overlays exclude land areas around Turkey
3. **Fullscreen API** - Uses webkit fallbacks for Safari
4. **GPS accuracy** - Positions with accuracy > 50m are filtered out
5. **Trip distance** - Jumps > 1km between positions are ignored (GPS noise)
6. **LocalStorage limits** - Trip/route history capped at 50 entries
7. **Firebase is optional** - App works fully offline with LocalStorage when Firebase is not configured
8. **Data migration** - Users can migrate LocalStorage data to Firestore after signing in
9. **Fetch calculation** - Only applies to Turkish coastlines; open sea gets full wave values
10. **API retry** - Failed weather calls retry 3 times with exponential backoff

## Version Information

Files are versioned via query parameters for cache busting:
- `styles.css?v=2.3`
- `app.js?v=2.5`
- `firebase-config.js?v=1.0`

Update these version numbers when making changes to ensure browsers load fresh files.
