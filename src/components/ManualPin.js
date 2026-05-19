// ManualPin.js — user pins as dots with capsule labels, terrain-locked pole, save/load/download
import * as Cesium from 'cesium';
import { get } from 'svelte/store';
import { manualPins, selectedManualPin, manualPinMode } from '../stores/mapStore.js';

const DEFAULT_ALT = 0;
const COLORS  = { default:'#00e5ff', danger:'#ff3d00', target:'#ffd600', friendly:'#00e676' };
const LS_KEY  = 'geoops_pins';

const DOT_SIZE    = 14;
const DOT_OUTLINE = 3;

// ── WCAG contrast helper ──────────────────────────────────────────────────────
function getLuminance(hex) {
  const r = parseInt(hex.slice(1,3),16)/255;
  const g = parseInt(hex.slice(3,5),16)/255;
  const b = parseInt(hex.slice(5,7),16)/255;
  const lin = c => c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4);
  return 0.2126*lin(r) + 0.7152*lin(g) + 0.0722*lin(b);
}
function contrastTextColor(hex) {
  return getLuminance(hex) > 0.35
    ? Cesium.Color.fromCssColorString('#111111')
    : Cesium.Color.WHITE;
}

// ── Compute the WGS84 height that visually sits on the rendered terrain ───────
// globe.getHeight() returns the geometric height; we scale by verticalExaggeration
// because Cesium moves the terrain MESH vertices (not entity positions) by that factor,
// so entity WGS84 height must equal geometric_h * exag to sit on the visual surface.
function exaggeratedFloor(viewer, carto) {
  const h    = viewer.scene.globe.getHeight(carto) ?? 0;
  const exag = viewer.scene.verticalExaggeration ?? 1;
  const rel  = viewer.scene.verticalExaggerationRelativeHeight ?? 0;
  return (h - rel) * exag + rel;
}

// ── Canvas Pill Label Generator ───────────────────────────────────────────────
// Cesium's native label doesn't support border-radius. We draw a true capsule 
// to a canvas and use it as a billboard image for a perfect UI look.
function buildCapsuleCanvas(text, bgCesColor, textCesColor) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = '11px "IBM Plex Mono", monospace';
  
  // High-DPI scaling for crisp text
  const dpr = window.devicePixelRatio || 2;
  
  // Measure text
  ctx.font = font;
  const textWidth = ctx.measureText(text).width;
  
  // Capsule dimensions
  const paddingX = 10;
  const paddingY = 4;
  const height = 11 + paddingY * 2; // ~19px
  const width = textWidth + paddingX * 2;
  const radius = height / 2;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  // Draw capsule path
  ctx.fillStyle = bgCesColor.toCssColorString();
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(width - radius, 0);
  ctx.arc(width - radius, radius, radius, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(radius, height);
  ctx.arc(radius, radius, radius, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
  ctx.fill();

  // Draw text
  ctx.font = font;
  ctx.fillStyle = textCesColor.toCssColorString();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2 + 1);

  return canvas;
}

export function addManualPin(viewer, { id, lon, lat, alt = DEFAULT_ALT, name = 'Pin', rep = 'default' }) {
  const pinId    = id || `mp-${Date.now()}`;
  const color    = COLORS[rep] || (rep.startsWith('#') ? rep : COLORS.default);
  const cesColor = Cesium.Color.fromCssColorString(color);
  const carto    = Cesium.Cartographic.fromDegrees(lon, lat);

  // ── Scratch buffers (re-used per frame by CallbackProperty) ──────────────
  const _groundScratch = new Cesium.Cartesian3();
  const _topScratch    = new Cesium.Cartesian3();

  // ── Pole — starts with per-frame CallbackProperty, then locks to sampled height ──
  const poleEntity = viewer.entities.add({
    id: `pole-${pinId}`,
    polyline: {
      positions: new Cesium.CallbackProperty(() => {
        const floor = exaggeratedFloor(viewer, carto);
        Cesium.Cartesian3.fromDegrees(lon, lat, floor,       undefined, _groundScratch);
        Cesium.Cartesian3.fromDegrees(lon, lat, floor + alt, undefined, _topScratch);
        return [_groundScratch, _topScratch];
      }, false),
      width: 1.5,
      material:          cesColor.withAlpha(0.55),
      depthFailMaterial: cesColor.withAlpha(0.25),
    },
  });

  // ── Dot + label — same: CallbackProperty initially, locked after sample ──
  const pinEntity = viewer.entities.add({
    id:       pinId,
    position: new Cesium.CallbackProperty(() =>
      Cesium.Cartesian3.fromDegrees(lon, lat, exaggeratedFloor(viewer, carto) + alt), false),
    properties: new Cesium.PropertyBag({ isManualPin: true, pinId, name, rep, lon, lat, alt }),

    point: {
      pixelSize:    DOT_SIZE,
      color:        cesColor,
      outlineColor: Cesium.Color.fromCssColorString('#000000').withAlpha(0.7),
      outlineWidth: DOT_OUTLINE,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      heightReference: Cesium.HeightReference.NONE,
    },

    // ── True Capsule Canvas Billboard (replaces native Label) ─────────────────
    billboard: {
      image: buildCapsuleCanvas(name, cesColor.withAlpha(0.88), contrastTextColor(color)),
      verticalOrigin:   Cesium.VerticalOrigin.BOTTOM,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      pixelOffset: new Cesium.Cartesian2(0, -(DOT_SIZE + DOT_OUTLINE + 2)),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      eyeOffset: new Cesium.Cartesian3(0, 0, -500),
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 6e6),
      translucencyByDistance:   new Cesium.NearFarScalar(4e5, 1.0, 6e6, 0.0),
    },
  });

  // ── Sample terrain at full resolution, then LOCK to static positions ──────
  // This eliminates all LOD-based drift: once the authoritative height is known,
  // the CallbackProperty is replaced with a fixed Cartesian3 that never moves.
  Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, [carto])
    .then(([sampled]) => {
      const h     = sampled.height ?? 0;
      const exag  = viewer.scene.verticalExaggeration ?? 1;
      const rel   = viewer.scene.verticalExaggerationRelativeHeight ?? 0;
      const floor = (h - rel) * exag + rel;

      const groundPos = Cesium.Cartesian3.fromDegrees(lon, lat, floor);
      const topPos    = Cesium.Cartesian3.fromDegrees(lon, lat, floor + alt);

      // Replace dynamic CallbackProperty with a static, drift-free position
      poleEntity.polyline.positions = [groundPos, topPos];
      pinEntity.position            = topPos;
    })
    .catch(() => { /* keep CallbackProperty if terrain sampling fails */ });

  const pin = { id: pinId, lon, lat, alt, name, rep, poleEntity, pinEntity };
  manualPins.update(p => [...p, pin]);
  return pin;
}

export function removeManualPin(viewer, pinId) {
  const pin = get(manualPins).find(p => p.id === pinId);
  if (!pin) return;
  viewer.entities.remove(pin.poleEntity);
  viewer.entities.remove(pin.pinEntity);
  manualPins.update(p => p.filter(x => x.id !== pinId));
  selectedManualPin.set(null);
  savePins();
}

export function updateManualPin(viewer, pinId, changes) {
  const pin = get(manualPins).find(p => p.id === pinId);
  if (!pin) return;
  viewer.entities.remove(pin.poleEntity);
  viewer.entities.remove(pin.pinEntity);
  manualPins.update(p => p.filter(x => x.id !== pinId));
  const updated = addManualPin(viewer, { ...pin, ...changes });
  setTimeout(() => selectedManualPin.set(updated), 0);
}

export function savePins() {
  const data = get(manualPins).map(({ id, lon, lat, alt, name, rep }) => ({ id, lon, lat, alt, name, rep }));
  localStorage.setItem(LS_KEY, JSON.stringify(data));
}

export function loadSavedPins(viewer) {
  try {
    JSON.parse(localStorage.getItem(LS_KEY) || '[]').forEach(p => addManualPin(viewer, p));
  } catch {}
}

export function downloadPins(format) {
  const rows = get(manualPins).map(({ id, lon, lat, alt, name, rep }) =>
    ({ id, lon, lat, alt, name, color: rep }));
  let content, mime, ext;
  if (format === 'csv') {
    content = 'id,lon,lat,alt,name,color\n' +
      rows.map(r => `${r.id},${r.lon},${r.lat},${r.alt},"${r.name}",${r.color}`).join('\n');
    mime = 'text/csv'; ext = 'csv';
  } else {
    content = JSON.stringify(rows, null, 2); mime = 'application/json'; ext = 'json';
  }
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([content], { type: mime })),
    download: `geoops_pins.${ext}`,
  });
  a.click(); URL.revokeObjectURL(a.href);
}

export function uploadPinsFile(viewer, file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    try {
      if (file.name.endsWith('.json')) {
        const data = JSON.parse(text);
        data.forEach(p => addManualPin(viewer, { ...p, rep: p.color || p.rep || 'default' }));
      } else if (file.name.endsWith('.csv')) {
        // Simple CSV parser for id,lon,lat,alt,"name",color
        const lines = text.trim().split('\n').slice(1);
        lines.forEach(line => {
          const parts = line.split(',');
          if (parts.length >= 6) {
            const nameMatch = line.match(/"([^"]*)"/);
            const name = nameMatch ? nameMatch[1] : parts[4];
            const color = parts[parts.length - 1].trim();
            addManualPin(viewer, {
              id: parts[0],
              lon: parseFloat(parts[1]),
              lat: parseFloat(parts[2]),
              alt: parseFloat(parts[3]),
              name,
              rep: color
            });
          }
        });
      }
    } catch(err) {
      console.error('Failed to parse uploaded pins', err);
    }
  };
  reader.readAsText(file);
}

let _addHandler = null;
export function enterAddMode(viewer) {
  viewer.scene.canvas.style.cursor = 'crosshair';
  _addHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  _addHandler.setInputAction(({ position }) => {
    const ray = viewer.camera.getPickRay(position);
    const pos = viewer.scene.globe.pick(ray, viewer.scene);
    if (!pos) return;
    const c = Cesium.Cartographic.fromCartesian(pos);
    addManualPin(viewer, {
      lon:  Cesium.Math.toDegrees(c.longitude),
      lat:  Cesium.Math.toDegrees(c.latitude),
      alt:  DEFAULT_ALT,
      name: `Point ${get(manualPins).length + 1}`,
    });
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}
export function exitAddMode(viewer) {
  viewer.scene.canvas.style.cursor = '';
  _addHandler?.destroy(); _addHandler = null;
}

export function registerPinClickHandler(viewer) {
  const h = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  h.setInputAction(({ position }) => {
    if (get(manualPinMode)) return;
    const picked = viewer.scene.pick(position);
    if (!picked?.id?.properties) { selectedManualPin.set(null); return; }
    const props = picked.id.properties;
    if (props.isManualPin?.getValue()) {
      const id = props.pinId?.getValue();
      selectedManualPin.set(get(manualPins).find(p => p.id === id) || null);
    } else {
      selectedManualPin.set(null);
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  return () => h.destroy();
}
