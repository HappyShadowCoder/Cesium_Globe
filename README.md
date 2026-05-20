# ⬡ GEOOPS — Geospatial Intelligence Drone Dashboard

A high-performance, token-free, tactical geospatial dashboard built with **Svelte**, **Vite**, and **CesiumJS**. Engineered for situational awareness, tactical flight planning, and real-time spatial-temporal analysis.

---

## 📸 Overview & Tactical Capabilities

`GEOOPS` is a lightweight, high-performance web dashboard designed for military simulation, drone mission control, and geospatial intelligence analysis. The application runs entirely **token-free**, utilizing public topographic and satellite imagery layers coupled with 3D elevation servers to produce a visually stunning, responsive tactical console.

```
                  ┌─────────────────────────────────────┐
                  │          GEOOPS CORE VIEWER         │
                  │   - OpenTopoMap (Topographic)       │
                  │   - 2.5x Elevation Exaggeration     │
                  └──────────────────┬──────────────────┘
                                     │
                     ┌───────────────┴───────────────┐
                     ▼                               ▼
       ┌──────────────────────────┐    ┌──────────────────────────┐
       │   TACTICAL MISSION CTRL   │    │  TEMPORAL DATA SCRUBBER  │
       │   - Catmull-Rom Splines  │    │  - Time-series CSVs      │
       │   - Follow / Satellite   │    │  - Dynamic filtering     │
       │   - Waypoint persistence │    │  - Class color-coding    │
       └──────────────────────────┘    └──────────────────────────┘
```

---

## 🛠️ Key Intelligence Features

### 📡 1. Tactical Dual-Viewer Spy Mode Overlay
* **Dual-Synchronized Rendering:** Runs two simultaneous Cesium viewer engines inside a parent viewport. The main viewer displays a topographic map, while the second viewer renders high-resolution satellite imagery inside a clipped mask.
* **Geometrical Clip Masks:** The spy-mode overlay shape can be dynamically toggled between a **Circle**, **Square**, and **Triangle**. Adjust the scan radius seamlessly in real-time.
* **Drone-Lock Satellite Overlay:** In standard mode, the spy window tracks your mouse pointer. Enabling **Drone Sat Mode** locks the spy overlay directly onto the active flight drone, showing real-time satellite imagery of the ground immediately beneath it while the rest of the world remains in topographic view.

### 🚁 2. Flight Path Planner & Mission Playback
* **Interactive Waypoint Plotting:** Enable `+WP` mode to drop flight path waypoints on the globe with standard mouse clicks.
* **Catmull-Rom Splines:** Smooths discrete waypoints into continuous, aerodynamic flight paths in real-time.
* **Chase Cam & Satellite Lock:** Synchronize the camera during playback:
  * **Free:** Retain manual camera controls.
  * **Satellite:** Locks the camera into a tight, top-down overhead vertical look directly above the drone.
  * **Follow:** Locks the camera into a 3D isometric chase view ($400\text{m}$ behind and looking down at the UAV).
* **Visibility Adjustments:** Toggle the entire trail polyline, hide/reveal the upcoming path ahead of the drone (`Trail Mode`), and automatically save/load drone tracks to `LocalStorage`.

### 📍 3. Manual Tactical Pin Management
* **Dynamic Canvas Billboards:** Generates custom tactical pins on-the-fly using an HTML5 Canvas helper. Pins feature perfectly rounded **capsule-shaped labels** that automatically calculate optimal WCAG text contrast based on their background color. Requires **zero external images or network assets**.
* **Depth-Immune Rendering:** Pins and labels bypass the Cesium depth-buffer completely (`disableDepthTestDistance: Infinity`), ensuring they are never occluded by high mountain peaks or terrain features.
* **Terrain-Anchored 3D Poles:** Connects the exact rendered terrain elevation to the pin billboard with a semi-transparent pole line. Employs asynchronous terrain sampling (`sampleTerrainMostDetailed`) to completely eliminate LOD-based shifting/sliding at high zoom levels.
* **Inline Sidebar Management:** Manage all active pins directly from an interactive sidebar list. Click a pin to instantly adjust its custom altitude, rename it, or change its color.
* **Factions & Custom Colors:** Categorize pins under quick faction palettes (Cyan, Green, Yellow, Red) or use the **native OS Color Picker** to assign any hex color on the fly.
* **Export & Import Utilities:** Download current manual pins instantly to your system as `.json` or `.csv` files, and **upload** them back seamlessly to restore previous tactical layouts.

### ⏱️ 4. Temporal Data Scrubber & IST Timeline
* **Native Optimization:** Utilizes Cesium's highly optimized native Animation and Timeline widgets for temporal scrubbing.
* **IST Formatting:** The entire timeline and clock dial are custom-formatted to explicitly run in **Indian Standard Time (IST / UTC+5:30)** via dynamic JS offset injection, preventing cross-browser local timezone bugs.

### 🌐 5. Interactive Labeled Graticules (Gridlines)
* **Meridians & Parallels:** Renders white gridlines every 10° of latitude and longitude, adapting line width dynamically for major 30° bounds.
* **Special Geodesics:** Highlights the **Equator**, **Tropic of Cancer**, and **Tropic of Capricorn** in dedicated visual color profiles (yellow, orange).
* **Occlusion & Fade:** Grid labels disappear when on the opposite side of the globe and automatically fade out using distance display conditions to prevent UI clutter at high altitudes.

### 🗺️ 6. Global City Search (Geocoder)
* **High-Performance Offline Search:** Integrates a dataset of over 10,000+ world cities (`worldcities.csv`) parsed entirely in-browser.
* **Fly-To Coordinate Triggers:** Typing a city offers instant autocomplete. Selecting one executes a cinematic fly-to animation and plots a tactical pin.

### 🇮🇳 7. India Demographic Data & Bubble Map
* **Dynamic Choropleth & Bubble Layers:** Render population density across India using an interactive bubble map (graduated circle sizes) coupled with high-performance `india.geojson` district choropleths.
* **Capital Data Pins & Interactive State Tooltips:** Instantly visualizes state/UT capitals as glowing tactical pins. Hovering over districts reveals dynamic tooltips with population counts. Clicking a state pin unlocks a glassmorphism data dialog summarizing Census 2011 gender and rural/urban splits via animated SVG donut charts.
* **Camera Fly-In & Zoom Locks:** Cinematic camera routing instantly repositions altitude and pitch when examining specific state data, with zoom-locking to prevent accidental map displacement.

---

## 🗺️ Which Maps & Elevation Servers Are Used?

To maintain a zero-token, high-speed bootstrap process, `GEOOPS` avoids proprietary endpoints and integrates three token-free public map resources:

| Layer Type | Provider / Source | URL Pattern / Endpoint | Notes |
| :--- | :--- | :--- | :--- |
| **Topographic Base** | **OpenTopoMap** | `https://tile.opentopomap.org/{z}/{x}/{y}.png` | High-contrast, tactical topography up to zoom level 17. |
| **Satellite Base** | **Esri World Imagery** | `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` | High-resolution satellite tiles up to zoom level 19. |
| **3D Terrain Model** | **ArcGIS World Elevation 3D** | `https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer` | Yields high-fidelity mountain ranges, exaggerated by **2.5×** in viewer config. |

---

## 📂 Modular Architecture & Directory Map

```
cesium-svelte-geoops/
├── public/
│   └── worldcities.csv      # 5MB database containing world city coordinates
├── src/
│   ├── components/
│   │   ├── CityPins.js      # Billboard & label generators with depth-immune overrides
│   │   ├── CsvLayer.js      # CSV temporal parser & active timeline filter
│   │   ├── DronePath.js     # Catmull-Rom spline compiler, playback loops, and chase cameras
│   │   ├── GraticuleModule.js # Meridians, parallels, equators, and distance fading
│   │   ├── ManualPin.js     # User pin placements, 3D tactical poles, save/export scripts
│   │   ├── Map.svelte       # Main double-viewer bootstrap, scene morphing, and spy overlays
│   │   ├── SpyMode.js       # Camera-sync and dynamic clip-path overlays (CSS masking)
│   │   └── Timeline.svelte  # Temporal control bar slider
│   ├── stores/
│   │   └── mapStore.js      # Centralized reactive state system (Svelte stores)
│   ├── App.svelte           # Main control panel layout and button routing
│   └── main.js              # Standard Svelte mount logic
├── index.html
├── package.json             # NPM dependencies (Cesium, Svelte, Vite)
└── vite.config.js           # Vite server configuration & vite-plugin-cesium hook
```

---

## ⚙️ Setup & Installation Guide

Follow these steps to configure your local development environment and run the application.

### Prerequisites
* **Node.js** (Version 18.x or higher recommended)
* **npm** (Version 9.x or higher)

### 1. Clone & Enter Repository
```bash
git clone https://github.com/HappyShadowCoder/Cesium_Globe.git
cd Cesium_Globe
```

### 2. Install Project Dependencies
Use npm to download and link libraries (Svelte, CesiumJS, Vite):
```bash
npm install
```

### 3. Run Local Development Server
Boot up the high-speed Vite dev server:
```bash
npm run dev
```
Once initialized, open your browser and navigate to the local network port displayed in your terminal (usually `http://localhost:5173`).

### 4. Build for Production
To generate a highly optimized static bundle inside the `dist/` directory:
```bash
npm run build
```

### 5. Preview Production Build Locally
Verify that the production bundle loads flawlessly:
```bash
npm run preview
```

---

## 📊 Temporal CSV Schema

To upload a custom CSV dataset using the dashboard's temporal visualizer, structure your CSV file according to the following layout:

```csv
lon,lat,date,time,class,name,description
72.8777,19.0760,2026-05-18,12:00:00,danger,Mumbai Objective,High priority observation zone
77.2167,28.6448,2026-05-18,13:30:00,target,New Delhi HQ,Tactical drone tracking target
88.3639,22.5726,2026-05-18,15:45:00,friendly,Kolkata Depot,Allied re-supply station
80.2707,13.0827,2026-05-18,18:20:00,default,Chennai Port,Coastal maritime radar check
```

### Column Metadata:
1. **lon / lat**: Floating point longitude and latitude coordinates (WGS84).
2. **date**: Event date structured as `YYYY-MM-DD`.
3. **time**: Event UTC time structured as `HH:MM:SS` (Defaults to `00:00:00` if omitted).
4. **class**: Visual classification class defining the pin color:
   * `default` (Cyan)
   * `friendly` (Green)
   * `target` (Yellow)
   * `danger` (Red)
5. **name**: Name display label overlaying the plotted billboard.
6. **description**: Descriptive paragraph rendered in the entity inspect sidebar window.
