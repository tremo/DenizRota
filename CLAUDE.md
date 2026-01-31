# CLAUDE.md - DenizRota Codebase Guide

This document provides guidance for AI assistants working with the DenizRota codebase.

## Project Overview

**DenizRota** (Turkish: "Sea Route") is a web-based boat route planning and trip tracking application for amateur sailors. The application is entirely in Turkish.

### Key Features
- Interactive map-based route planning with waypoints
- Real-time weather and marine forecasts along routes
- Wind and wave overlay visualizations
- Fuel consumption and cost calculations
- GPS-based trip tracking with history
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
| GPS | Geolocation API |

## File Structure

```
/DenizRota
├── index.html      # HTML structure and UI components
├── app.js          # Complete application logic (~2200 lines)
├── styles.css      # Styling and responsive design (~1300 lines)
└── CLAUDE.md       # This file
```

**Note:** This is a simple, build-free project with no package.json or build tools. All dependencies are loaded from CDN.

## Architecture

### State Management
The application uses a single centralized `state` object in `app.js:7-50`:

```javascript
const state = {
    routeMode: false,       // Route editing mode
    waypoints: [],          // Route waypoints with weather data
    markers: [],            // Leaflet markers
    polyline: null,         // Route line
    windOverlayVisible: false,
    waveOverlayVisible: false,
    tripActive: false,      // GPS tracking state
    tripPositions: [],      // GPS track history
    settings: { ... }       // Boat configuration
};
```

### Main Modules (in app.js)

| Section | Description |
|---------|-------------|
| State Management | Central state object |
| Open-Meteo API | Weather and marine data fetching |
| Map Initialization | Leaflet setup with OpenSeaMap |
| Waypoint Management | Add, move, delete waypoints |
| Route Calculations | Distance, time, fuel calculations |
| Wind Overlay | Canvas-based particle animation |
| Wave Overlay | Animated wave visualization |
| Trip Tracking | GPS tracking and speed monitoring |
| Trip History | LocalStorage persistence |
| Settings | Boat configuration management |
| UI Event Handlers | Button clicks, keyboard shortcuts |

## API Endpoints

The app uses free Open-Meteo APIs (no authentication required):

```javascript
const OPEN_METEO_WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const OPEN_METEO_MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine';
```

**Caching:** API responses are cached for 1 hour per 0.01° grid cell.

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

// Event handlers exposed globally for HTML onclick
window.removeWaypoint = function(id) { ... }
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
        temperature: number,    // celsius
        waveHeight: number,     // meters
        wavePeriod: number      // seconds
    },
    riskLevel: 'green' | 'yellow' | 'red' | 'gray',
    loading: boolean
}
```

### Trip (stored in LocalStorage)
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

### Settings (stored in LocalStorage)
```javascript
{
    boatName: string,
    boatType: 'motorlu' | 'yelkenli',
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
| Green | < 20 | < 1 | Green |
| Yellow | 20-30 | 1-2 | Yellow/Orange |
| Red | > 30 | > 2 | Red |
| Gray | No data | No data | Gray |

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
- Mobile responsiveness

## Common Modification Patterns

### Adding a New UI Element
1. Add HTML in `index.html`
2. Add styles in `styles.css`
3. Add event handler in `app.js` (in `init()` function or as global function)

### Adding a New State Property
1. Add to `state` object in `app.js:7-50`
2. Initialize in `init()` if needed
3. Save/load from LocalStorage if persistence needed

### Modifying Weather Processing
- `fetchWeather()` - API calls
- `getWeatherFromAPI()` - Data extraction
- `getRiskLevel()` - Risk classification
- `updateWaypointWeather()` - UI updates

### Modifying Map Behavior
- Map initialization in `initMap()`
- Marker creation in `addWaypoint()`
- Overlay rendering in `renderWindOverlay()` and `renderWaveOverlay()`

## Performance Considerations

- **Canvas rendering** for overlays (not DOM elements)
- **RequestAnimationFrame** for smooth animations
- **Promise.all()** for parallel API calls
- **Geolocation filtering**: Accuracy > 50m ignored
- **Distance jump filtering**: > 1km jumps ignored (GPS noise)
- **API caching**: 1 hour per location

## Important Functions Reference

| Function | Location | Purpose |
|----------|----------|---------|
| `init()` | app.js | Application entry point |
| `initMap()` | app.js | Leaflet map setup |
| `addWaypoint()` | app.js | Create new route point |
| `fetchWeather()` | app.js:56 | Get weather data |
| `calculateRouteStats()` | app.js | Distance/time/fuel calculations |
| `toggleWindOverlay()` | app.js | Wind particle animation |
| `toggleWaveOverlay()` | app.js | Wave visualization |
| `startTrip()` | app.js | Begin GPS tracking |
| `endTrip()` | app.js | Stop tracking, save trip |
| `loadSettings()` | app.js | Load from LocalStorage |
| `saveSettings()` | app.js | Save to LocalStorage |

## Gotchas and Edge Cases

1. **Marine API is optional** - The app continues if marine data fails
2. **Land detection** - Overlays exclude land areas around Turkey
3. **Fullscreen API** - Uses webkit fallbacks for Safari
4. **GPS accuracy** - Positions with accuracy > 50m are filtered out
5. **Trip distance** - Jumps > 1km between positions are ignored (GPS noise)
6. **LocalStorage limits** - Trip history capped at 50 entries

## Version Information

CSS files are versioned via query parameters:
- `styles.css?v=2.2`

This helps with cache busting during development.
