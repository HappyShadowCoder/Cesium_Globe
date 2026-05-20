// IndiaLayer.js — Population bubble map, choropleth, and clickable state pins
import * as Cesium from 'cesium';
import { get } from 'svelte/store';
import { selectedStateData } from '../stores/mapStore.js';

// ── State / UT capital coordinates ───────────────────────────────────────────
// States → legislative capital, UTs → representative central location
export const STATE_COORDS = {
  'Uttar Pradesh':                         { lon: 80.9462,  lat: 26.8467 },
  'Maharashtra':                           { lon: 72.8777,  lat: 19.0760 },
  'Bihar':                                 { lon: 85.1376,  lat: 25.5941 },
  'West Bengal':                           { lon: 88.3639,  lat: 22.5726 },
  'Madhya Pradesh':                        { lon: 77.4126,  lat: 23.2599 },
  'Tamil Nadu':                            { lon: 80.2707,  lat: 13.0827 },
  'Rajasthan':                             { lon: 75.7873,  lat: 26.9124 },
  'Karnataka':                             { lon: 77.5946,  lat: 12.9716 },
  'Gujarat':                               { lon: 72.6369,  lat: 23.2156 },
  'Andhra Pradesh':                        { lon: 80.3319,  lat: 16.5062 },
  'Odisha':                                { lon: 85.8314,  lat: 20.2961 },
  'Telangana':                             { lon: 78.4867,  lat: 17.3850 },
  'Kerala':                                { lon: 76.9366,  lat:  8.5241 },
  'Jharkhand':                             { lon: 85.3096,  lat: 23.3441 },
  'Assam':                                 { lon: 91.7362,  lat: 26.1445 },
  'Punjab':                                { lon: 76.7794,  lat: 30.7333 },
  'Chhattisgarh':                          { lon: 81.6296,  lat: 21.2514 },
  'Haryana':                               { lon: 76.7174,  lat: 29.0588 },
  'Jammu and Kashmir':                     { lon: 74.7973,  lat: 34.0837 },
  'Uttarakhand':                           { lon: 78.0322,  lat: 30.3165 },
  'Himachal Pradesh':                      { lon: 77.1734,  lat: 31.1048 },
  'Tripura':                               { lon: 91.2868,  lat: 23.8315 },
  'Meghalaya':                             { lon: 91.8933,  lat: 25.5788 },
  'Manipur':                               { lon: 93.9368,  lat: 24.8170 },
  'Nagaland':                              { lon: 94.1077,  lat: 25.6701 },
  'Goa':                                   { lon: 73.8278,  lat: 15.4909 },
  'Arunachal Pradesh':                     { lon: 93.6053,  lat: 27.0844 },
  'Mizoram':                               { lon: 92.7176,  lat: 23.7271 },
  'Sikkim':                                { lon: 88.6138,  lat: 27.3389 },
  // UTs
  'Delhi (UT)':                            { lon: 77.1025,  lat: 28.7041 },
  'Puducherry (UT)':                       { lon: 79.8083,  lat: 11.9416 },
  'Chandigarh (UT)':                       { lon: 76.7794,  lat: 30.7500 },
  'Andaman and Nicobar Islands (UT)':      { lon: 92.7265,  lat: 11.6234 },
  'Dadra and Nagar Haveli (UT)':           { lon: 73.0169,  lat: 20.2766 },
  'Daman and Diu (UT)':                    { lon: 72.8328,  lat: 20.3974 },
  'Lakshadweep (UT)':                      { lon: 72.6369,  lat: 10.5650 },
};

// ── GeoJSON st_nm → CSV name mapper ──────────────────────────────────────────
// GeoJSON uses short names; CSV uses official names with "(UT)" suffixes
const GEOJSON_TO_CSV = {
  'Delhi':                                       'Delhi (UT)',
  'Puducherry':                                  'Puducherry (UT)',
  'Chandigarh':                                  'Chandigarh (UT)',
  'Andaman and Nicobar Islands':                 'Andaman and Nicobar Islands (UT)',
  'Dadra and Nagar Haveli and Daman and Diu':    'Dadra and Nagar Haveli (UT)',  // merged UT
  'Lakshadweep':                                 'Lakshadweep (UT)',
  'Ladakh':                                      'Jammu and Kashmir',  // carved from J&K in 2019 — map to J&K data
};

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseCSVLine(line) {
  const result = [];
  let inQuote = false;
  let current = '';
  for (const c of line) {
    if (c === '"') { inQuote = !inQuote; }
    else if (c === ',' && !inQuote) { result.push(current.trim()); current = ''; }
    else { current += c; }
  }
  result.push(current.trim());
  return result;
}

function toInt(s) { return parseInt((s || '').replace(/[^0-9]/g, '')) || 0; }
function toFloat(s) { return parseFloat(s) || 0; }

let _csvCache = null;

export async function loadIndiaCSV() {
  if (_csvCache) return _csvCache;
  const text = await fetch('/PopulationOfIndia.csv').then(r => r.text());
  const lines = text.trim().split('\n');
  _csvCache = lines.slice(1)
    .filter(l => l.trim() && !l.startsWith('–'))
    .map(line => {
      const c = parseCSVLine(line);
      return {
        name:       c[1]?.trim(),
        population: toInt(c[2]),
        percent:    toFloat(c[3]),
        male:       toInt(c[4]),
        female:     toInt(c[5]),
        sexRatio:   toInt(c[7]),
        rural:      toInt(c[8]),
        urban:      toInt(c[9]),
        area:       toInt(c[10]),
        density:    toInt(c[11]),
        isUT:       (c[1] || '').includes('(UT)'),
      };
    });
  return _csvCache;
}

// ── Color helpers ─────────────────────────────────────────────────────────────
const LOG_MIN = Math.log10(17 + 1);     // Arunachal Pradesh
const LOG_MAX = Math.log10(11297 + 1);  // Delhi

function densityToColor(density, alpha = 0.75) {
  const t = Math.max(0, Math.min(1, (Math.log10(density + 1) - LOG_MIN) / (LOG_MAX - LOG_MIN)));
  // green(120°) → yellow(60°) → orange(30°) → red(0°)
  const hue = Math.round((1 - t) * 120);
  const sat = 85;
  const lig = 52;
  return Cesium.Color.fromCssColorString(`hsla(${hue},${sat}%,${lig}%,${alpha})`);
}

const POP_MIN = Math.log10(64473);       // Lakshadweep
const POP_MAX = Math.log10(199812341);   // UP

function populationToPixel(pop) {
  const t = Math.max(0, Math.min(1, (Math.log10(pop) - POP_MIN) / (POP_MAX - POP_MIN)));
  return Math.round(14 + t * 52); // 14–66 px
}

// ── Module state ──────────────────────────────────────────────────────────────
let _choroplethDS   = null;
let _bubbleEntities = [];
let _pinEntities    = [];
let _pinHandler     = null;
let _hoverHandler   = null;
let _hoverEl        = null;
let _hoveredEntity  = null;   // the district polygon currently highlighted

// ── Population number formatter ─────────────────────────────────────────────
function fmtPop(n) {
  if (n >= 1e7) return (n / 1e7).toFixed(2) + ' Cr';
  if (n >= 1e5) return (n / 1e5).toFixed(2) + ' L';
  return n.toLocaleString('en-IN');
}

// ── District hover tooltip ──────────────────────────────────────────────────
function setupHoverTooltip(viewer, byName) {
  // Create tooltip DOM element
  _hoverEl = document.createElement('div');
  Object.assign(_hoverEl.style, {
    position: 'fixed', zIndex: '90', pointerEvents: 'none',
    background: 'rgba(4,14,28,0.94)', border: '1px solid rgba(0,229,255,0.28)',
    borderRadius: '7px', padding: '8px 12px', display: 'none',
    fontFamily: 'IBM Plex Mono, monospace', color: '#cef',
    backdropFilter: 'blur(10px)',
    boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
    maxWidth: '220px', lineHeight: '1.5',
  });
  document.body.appendChild(_hoverEl);

  _hoverHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  _hoverHandler.setInputAction(({ endPosition }) => {
    const picked   = viewer.scene.pick(endPosition);
    const entity   = picked?.id;
    const props    = entity?.properties;
    const district = props?.district?.getValue?.();
    const stNm     = props?.st_nm?.getValue?.();

    // — Restore previous hover highlight —
    if (_hoveredEntity && _hoveredEntity !== entity) {
      if (_hoveredEntity.polygon) {
        _hoveredEntity.polygon.outlineColor = new Cesium.ConstantProperty(
          Cesium.Color.fromCssColorString('#001a2a').withAlpha(0.6));
        _hoveredEntity.polygon.outlineWidth = new Cesium.ConstantProperty(0.5);
      }
      _hoveredEntity = null;
    }

    if (district && stNm) {
      // — Highlight hovered district —
      if (entity?.polygon && entity !== _hoveredEntity) {
        entity.polygon.outlineColor = new Cesium.ConstantProperty(
          Cesium.Color.fromCssColorString('#ff2200').withAlpha(1.0));
        entity.polygon.outlineWidth = new Cesium.CallbackProperty(() => {
          if (!viewer?.camera) return 2.5;
          const height = viewer.camera.positionCartographic.height;
          // Calculate thickness based on distance: thicker when closer (up to 8px), thinner when far (1px)
          const minHeight = 100_000;
          const maxHeight = 5_000_000;
          const t = Math.max(0, Math.min(1, (maxHeight - height) / (maxHeight - minHeight)));
          return 1.0 + (t * 7.0); 
        }, false);
        _hoveredEntity = entity;
      }

      const csvName = GEOJSON_TO_CSV[stNm] ?? stNm;
      const sd      = byName[csvName];
      const rect    = viewer.scene.canvas.getBoundingClientRect();
      const sx = rect.left + endPosition.x + 16;
      const sy = rect.top  + endPosition.y - 10;

      _hoverEl.innerHTML = [
        `<div style="font-weight:700;font-size:12px;color:#fff">${district}</div>`,
        `<div style="font-size:9px;color:#5a8a9a;letter-spacing:.1em">[${stNm}]</div>`,
        sd ? `<div style="margin-top:5px;font-size:10px"><span style="color:#5a8a9a">State pop </span><span style="color:#00e5ff;font-weight:600">${fmtPop(sd.population)}</span></div>` : '',
      ].join('');
      _hoverEl.style.left    = sx + 'px';
      _hoverEl.style.top     = sy + 'px';
      _hoverEl.style.display = 'block';
    } else {
      _hoverEl.style.display = 'none';
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
}

function destroyHoverTooltip() {
  // Reset any lingering highlight
  if (_hoveredEntity?.polygon) {
    _hoveredEntity.polygon.outlineColor = new Cesium.ConstantProperty(
      Cesium.Color.fromCssColorString('#001a2a').withAlpha(0.6));
    _hoveredEntity.polygon.outlineWidth = new Cesium.ConstantProperty(0.5);
  }
  _hoveredEntity = null;
  _hoverHandler?.destroy(); _hoverHandler = null;
  _hoverEl?.remove();       _hoverEl = null;
}

// ── Bubble map (choropleth fill + bubble circles) ────────────────────────────
export async function showBubbleMap(viewer) {
  if (_choroplethDS || _bubbleEntities.length) return;  // already shown
  const data = await loadIndiaCSV();
  const byName = Object.fromEntries(data.map(d => [d.name, d]));

  // Build lookup: GeoJSON st_nm → CSV data
  function lookupState(stNm) {
    const mapped = GEOJSON_TO_CSV[stNm] ?? stNm;
    return byName[mapped] || null;
  }

  // Load GeoJSON with per-feature coloring
  _choroplethDS = await Cesium.GeoJsonDataSource.load('/india.geojson', {
    stroke:      Cesium.Color.fromCssColorString('#00e5ff').withAlpha(0.25),
    strokeWidth: 0.8,
    fill:        Cesium.Color.TRANSPARENT,
  });

  // Recolor each district polygon by its state density
  _choroplethDS.entities.values.forEach(entity => {
    const stNm = entity.properties?.st_nm?.getValue?.() ?? '';
    const sd   = lookupState(stNm);
    if (!sd) return;
    if (entity.polygon) {
      entity.polygon.material  = new Cesium.ColorMaterialProperty(densityToColor(sd.density, 0.68));
      entity.polygon.outline   = true;
      entity.polygon.outlineColor = new Cesium.ConstantProperty(
        Cesium.Color.fromCssColorString('#001a2a').withAlpha(0.6));
      entity.polygon.outlineWidth = new Cesium.ConstantProperty(0.5);
      entity.polygon.classificationType = Cesium.ClassificationType.TERRAIN;
    }
  });
  viewer.dataSources.add(_choroplethDS);

  // Bubble circles at state capitals
  data.forEach(sd => {
    const coord = STATE_COORDS[sd.name];
    if (!coord) return;
    const size  = populationToPixel(sd.population);
    const color = densityToColor(sd.density, 0.88);
    const e = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(coord.lon, coord.lat, 0),
      point: {
        pixelSize:    size,
        color:        color.withAlpha(0.55),
        outlineColor: color,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new Cesium.NearFarScalar(500_000, 1.0, 8_000_000, 0.4),
      },
    });
    _bubbleEntities.push(e);
  });

  // District hover tooltip
  setupHoverTooltip(viewer, byName);
}

export function hideBubbleMap(viewer) {
  if (!_choroplethDS && !_bubbleEntities.length) return;
  destroyHoverTooltip();
  if (_choroplethDS) { viewer.dataSources.remove(_choroplethDS, true); _choroplethDS = null; }
  _bubbleEntities.forEach(e => viewer.entities.remove(e));
  _bubbleEntities = [];
}

// ── State pins ────────────────────────────────────────────────────────────────
export async function showStatePins(viewer) {
  if (_pinEntities.length) return;  // already shown
  const data = await loadIndiaCSV();

  data.forEach(sd => {
    const coord = STATE_COORDS[sd.name];
    if (!coord) return;
    const isUT = sd.isUT;

    // Glowing dot + label
    const pin = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(coord.lon, coord.lat, 1000),
      point: {
        pixelSize:    10,
        color:        isUT
          ? Cesium.Color.fromCssColorString('#ffd600')
          : Cesium.Color.fromCssColorString('#00e5ff'),
        outlineColor: isUT
          ? Cesium.Color.fromCssColorString('#ff8800')
          : Cesium.Color.fromCssColorString('#0080ff'),
        outlineWidth: 3,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new Cesium.NearFarScalar(200_000, 1.4, 6_000_000, 0.5),
      },
      label: {
        text:                 sd.name.replace(' (UT)', ''),
        font:                 '10px IBM Plex Mono, monospace',
        fillColor:            Cesium.Color.WHITE,
        outlineColor:         Cesium.Color.fromCssColorString('#001a2a'),
        outlineWidth:         3,
        style:                Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin:       Cesium.VerticalOrigin.BOTTOM,
        pixelOffset:          new Cesium.Cartesian2(0, -14),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        translucencyByDistance: new Cesium.NearFarScalar(500_000, 1, 4_000_000, 0),
        scaleByDistance: new Cesium.NearFarScalar(200_000, 0.9, 3_000_000, 0.4),
      },
      // Custom property to carry state data for click handler
      _stateData: sd,
    });
    _pinEntities.push(pin);
  });

  // Click handler
  _pinHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  _pinHandler.setInputAction(({ position }) => {
    const picked = viewer.scene.pick(position);
    if (!picked?.id?._stateData) return;
    selectedStateData.set(picked.id._stateData);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

export function hideStatePins(viewer) {
  if (!_pinEntities.length) return;
  _pinHandler?.destroy(); _pinHandler = null;
  _pinEntities.forEach(e => viewer.entities.remove(e));
  _pinEntities = [];
  selectedStateData.set(null);
}
