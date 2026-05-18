// GraticuleModule.js — zoom-based labeled graticule, equator & tropics
import * as Cesium from 'cesium';

const SPECIALS = [
  { lat:  0,      color: '#ffd600', text: 'Equator',            w: 2.5 },
  { lat:  23.436, color: '#ff9800', text: 'Tropic of Cancer',   w: 2   },
  { lat: -23.436, color: '#ff9800', text: 'Tropic of Capricorn',w: 2   },
];
const SPECIAL_LATS = new Set(SPECIALS.map(s => s.lat));

// ── Polyline position generators ─────────────────────────────────────────────
const latPts = lat => Array.from({length:181}, (_,i) =>
  Cesium.Cartesian3.fromDegrees(-180 + i*2, lat, 800));

const lonPts = lon => Array.from({length:91}, (_,i) =>
  Cesium.Cartesian3.fromDegrees(lon, -90 + i*2, 800));

// ── Label helper ─────────────────────────────────────────────────────────────
// NO disableDepthTestDistance → globe correctly occludes back-side labels
function lbl(viewer, lon, lat, text, hexColor, maxDist) {
  return viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(lon, lat, 5000),
    label: {
      text,
      font: '14px "IBM Plex Mono", monospace',
      fillColor:    Cesium.Color.fromCssColorString(hexColor),
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 4,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      scale: 1.0,
      pixelOffset: new Cesium.Cartesian2(4, 0),
      // Appear only when camera is within maxDist metres of label
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, maxDist),
      // Fade near the far edge so labels don't pop
      translucencyByDistance: new Cesium.NearFarScalar(500e3, 1.0, maxDist * 0.85, 0.15),
    },
  });
}

let _ents = [];

export function addGraticule(viewer) {
  removeGraticule(viewer);

  // ── Meridians every 10° ──────────────────────────────────────────────────
  for (let lon = -180; lon <= 180; lon += 10) {
    const major = lon % 30 === 0;
    _ents.push(viewer.entities.add({ polyline: {
      positions: lonPts(lon), width: major ? 1.2 : 0.5,
      material: Cesium.Color.WHITE.withAlpha(major ? 0.28 : 0.09),
    }}));

    if (lon !== -180 && lon !== 180) {
      const tag = lon === 0 ? '0°' : `${Math.abs(lon)}°${lon < 0 ? 'W' : 'E'}`;
      // Major labels visible from global zoom; minor only when close
      _ents.push(lbl(viewer, lon, 3, tag, major ? '#ffffffcc' : '#ffffff88',
        major ? 14e6 : 4e6));
    }
  }

  // ── Parallels every 10° ──────────────────────────────────────────────────
  for (let lat = -90; lat <= 90; lat += 10) {
    if (SPECIAL_LATS.has(lat)) continue;
    const major = lat % 30 === 0;
    _ents.push(viewer.entities.add({ polyline: {
      positions: latPts(lat), width: major ? 1.2 : 0.5,
      material: Cesium.Color.WHITE.withAlpha(major ? 0.28 : 0.09),
    }}));

    if (lat !== 0) {
      const tag = `${Math.abs(lat)}°${lat > 0 ? 'N' : 'S'}`;
      _ents.push(lbl(viewer, 2, lat, tag,
        major ? '#ffffffcc' : '#ffffff88',
        major ? 14e6 : 4e6));
    }
  }

  // ── Special lines: equator, tropics ──────────────────────────────────────
  for (const { lat, color, text, w } of SPECIALS) {
    _ents.push(viewer.entities.add({ polyline: {
      positions: latPts(lat), width: w,
      material: Cesium.Color.fromCssColorString(color).withAlpha(0.85),
    }}));

    // Repeated labels along the line so one stays on screen while panning
    for (const ln of [-150, -90, -30, 30, 90, 150]) {
      _ents.push(lbl(viewer, ln, lat + 2.5, text, color, 18e6));
    }
    // Degree label at prime meridian side
    const degTag = lat === 0 ? '0°' : `${Math.abs(lat)}°${lat > 0 ? 'N' : 'S'}`;
    _ents.push(lbl(viewer, 2, lat, degTag, color, 18e6));
  }
}

export function removeGraticule(viewer) {
  _ents.forEach(e => viewer.entities.remove(e));
  _ents = [];
}
