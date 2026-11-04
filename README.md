# Cafe Finder

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-typed-blue.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8-green.svg)](https://vitejs.dev/)
[![MapLibre](https://img.shields.io/badge/MapLibre-6.x-blue.svg)](https://maplibre.org/)

A map-based cafe discovery application that loads cafe data specifically within the **visible map area (viewport)** using a **Bounding Box** approach. No API key is required.

## Features

- **Viewport-based loading**: Fetches cafes only within the currently visible map area. When panning or zooming, the app re-fetches cafe data for the visible coordinates via the `moveend` event. This minimizes data payload and ensures instant loading.
- **Limited active radius/location**: The sidebar list is restricted to a ~10-20 km radius around the user's GPS location. Users won't be cluttered with cafes from distant cities or foreign countries in their nearest list.
- **Strict `amenity=cafe` filtering**: Displays only actual cafes, automatically excluding general food stalls and restaurants.
- **Sidebar cafe list**: Displays cafe names, addresses, and relative distances from the user's location.
- **Nearest / Farthest sorting**: Toggle sort order in the sidebar.
- **Driving routes**: Provides travel duration and driving distance from the user's location to the selected cafe (via OSRM, free without API key).
- **Route camera focus**: Automatically adjusts map bounds to fit the actual route geometry when generated.
- **Anchored pin labels**: Uses `bottom-center` anchoring on every cafe marker for accurate pin placement.
- **City/Place search**: Geocoding integrated via Nominatim (OpenStreetMap).
- **Use My Location**: Quickly re-centers the map to the user's current GPS position.
- **Light / Dark theme support**.

## Tech Stack

- **Framework**: React 19 + TypeScript
- **Map**: MapLibre GL JS (`maplibre-gl`)
- **Build Tool**: Vite 8
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Routing**: OSRM (Open Source Routing Machine, free / no API key)
- **Cafe Data**: Overpass API (OpenStreetMap)
- **Geocoding**: Nominatim (OpenStreetMap)

## Project Structure

```
cafe-finder/
├─ src/
│  ├─ App.tsx           # Main component: state, map, routing, geolocation
│  ├─ main.tsx          # Application entry point
│  ├─ index.css         # Global styles
│  ├─ lib/
│  │  ├─ cafes.ts        # Fetch cafes via Overpass (bbox + around), non-cafe filtering
│  │  ├─ routes.ts       # Driving route calculation via OSRM
│  │  └─ mapCafeLayer.ts # Viewport bounding box layer (moveend listener)
│  └─ components/
│     ├─ ui/            # UI components (map, card, button, etc.)
│     └─ CafeList.tsx   # Sidebar cafe list component
├─ public/
├─ vite.config.ts
├─ tsconfig.json
└─ package.json
```

## Installation

```bash
# Clone the repository
git clone https://github.com/<username>/cafe-finder.git
cd cafe-finder

# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

The application will be available at `http://localhost:5173`.

## Usage

1. Open the application. Grant location permissions when prompted to focus the map on your current GPS position and display nearby cafes.
2. Use the search bar at the top to search for cities or places (e.g., "Bandung", "Jakarta", "Malmo").
3. Pan or zoom the map to explore cafes in different areas. Each `moveend` event will reload cafes for the new viewport.
4. Select a cafe from the right sidebar to:
   - Highlight the cafe on the map (with pin label)
   - Render a driving route from your location to the cafe
   - Display distance and estimated travel time
5. Toggle the **Nearest / Farthest** button in the sidebar to reorder the list.
6. Click **Use My Location** to snap the map view back to your GPS coordinates.

## Short Description (for GitHub Repo)

> Cafe Finder - A map-based cafe discovery application with viewport bounding box data loading. Loads cafes only within the visible area, filters within a ~10-20 km user radius, and restricts results to `amenity=cafe`. Features driving routes, travel time estimates, distance calculations, and near/far sorting. Completely free and open-source without requiring any API key.

**Alternative One-Liner:**
```
Cafe Finder • Bounding box viewport loading • Cafe & user radius filter • OSRM routing • Sort near/far • No API key
```

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.
