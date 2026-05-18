// ManualPin.js — user pins with terrain pole, save/load/download
import * as Cesium from 'cesium';
import { get } from 'svelte/store';
import { manualPins, selectedManualPin, manualPinMode } from '../stores/mapStore.js';

const PIN_ALT = 30_000;
const COLORS  = { default:'#00e5ff', danger:'#ff3d00', target:'#ffd600', friendly:'#00e676' };
const LS_KEY  = 'geoops_pins';

function buildCanvas(color) {
  const c = document.createElement('canvas'); c.width=32; c.height=42;
  const x = c.getContext('2d');
  x.beginPath(); x.arc(16,14,12,0,Math.PI*2); x.fillStyle=color; x.fill();
  x.strokeStyle='rgba(0,0,0,.55)'; x.lineWidth=2; x.stroke();
  x.beginPath(); x.moveTo(10,22); x.lineTo(16,42); x.lineTo(22,22);
  x.fillStyle=color; x.fill();
  x.beginPath(); x.arc(16,14,5,0,Math.PI*2); x.fillStyle='rgba(0,0,0,.4)'; x.fill();
  return c.toDataURL();
}

export function addManualPin(viewer, { id, lon, lat, name='Pin', rep='default' }) {
  const pinId = id || `mp-${Date.now()}`;
  const color = COLORS[rep] || COLORS.default;
  const ground = Cesium.Cartesian3.fromDegrees(lon, lat, 0);
  const top    = Cesium.Cartesian3.fromDegrees(lon, lat, PIN_ALT);

  const poleEntity = viewer.entities.add({
    id: `pole-${pinId}`,
    polyline: {
      positions: [ground, top], width: 1.5,
      material:          Cesium.Color.fromCssColorString(color).withAlpha(0.55),
      depthFailMaterial: Cesium.Color.fromCssColorString(color).withAlpha(0.25),
    }
  });

  const pinEntity = viewer.entities.add({
    id: pinId, position: top,
    properties: new Cesium.PropertyBag({ isManualPin:true, pinId, name, rep, lon, lat }),
    billboard: {
      image: buildCanvas(color), width:32, height:42,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      eyeOffset: new Cesium.Cartesian3(0,0,-500),
      scaleByDistance: new Cesium.NearFarScalar(1e3,1.2,8e6,0.5),
    },
    label: {
      text: name, font:'12px "IBM Plex Mono",monospace',
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth:2,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0,-46),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      eyeOffset: new Cesium.Cartesian3(0,0,-500),
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0,6e6),
    },
  });

  const pin = { id:pinId, lon, lat, name, rep, poleEntity, pinEntity };
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
  // Persist immediately so the pin doesn't reappear on refresh
  savePins();
}

export function updateManualPin(viewer, pinId, changes) {
  const pin = get(manualPins).find(p => p.id === pinId);
  if (!pin) return;
  viewer.entities.remove(pin.poleEntity);
  viewer.entities.remove(pin.pinEntity);
  manualPins.update(p => p.filter(x => x.id !== pinId));
  const updated = addManualPin(viewer, { ...pin, ...changes });
  // Delay store set so Svelte reactive statements don't immediately override editName
  setTimeout(() => selectedManualPin.set(updated), 0);
}

export function savePins() {
  const data = get(manualPins).map(({ id,lon,lat,name,rep }) => ({ id,lon,lat,name,rep }));
  localStorage.setItem(LS_KEY, JSON.stringify(data));
}

export function loadSavedPins(viewer) {
  try { JSON.parse(localStorage.getItem(LS_KEY)||'[]').forEach(p => addManualPin(viewer, p)); }
  catch {}
}

export function downloadPins(format) {
  const rows = get(manualPins).map(({ id,lon,lat,name,rep }) =>
    ({ id, lon, lat, name, color: rep }));
  let content, mime, ext;
  if (format === 'csv') {
    content = 'id,lon,lat,name,color\n' +
      rows.map(r => `${r.id},${r.lon},${r.lat},"${r.name}",${r.color}`).join('\n');
    mime = 'text/csv'; ext = 'csv';
  } else {
    content = JSON.stringify(rows, null, 2); mime = 'application/json'; ext = 'json';
  }
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([content],{type:mime})),
    download: `geoops_pins.${ext}`,
  });
  a.click(); URL.revokeObjectURL(a.href);
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
      lon: Cesium.Math.toDegrees(c.longitude),
      lat: Cesium.Math.toDegrees(c.latitude),
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
