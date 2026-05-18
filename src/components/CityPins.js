// CityPins.js — Billboard + label pins that ignore terrain depth
import * as Cesium from 'cesium';
import { selectedEntity } from '../stores/mapStore.js';

// Class → accent colour map
const PIN_COLORS = {
  default:  '#00e5ff',
  danger:   '#ff3d00',
  target:   '#ffd600',
  friendly: '#00e676',
};

// ── Canvas-generated pin icon (zero external assets) ──────────────────────────
function buildPinCanvas(pinClass = 'default') {
  const fill = PIN_COLORS[pinClass] ?? PIN_COLORS.default;
  const c = document.createElement('canvas');
  c.width = 32; c.height = 42;
  const ctx = c.getContext('2d');

  // Teardrop body
  ctx.beginPath();
  ctx.arc(16, 14, 12, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Tail spike
  ctx.beginPath();
  ctx.moveTo(10, 22); ctx.lineTo(16, 42); ctx.lineTo(22, 22);
  ctx.fillStyle = fill;
  ctx.fill();

  // Inner depth-dot
  ctx.beginPath();
  ctx.arc(16, 14, 5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fill();

  return c.toDataURL();
}

// ── plotPin — adds a depth-immune billboard + label entity ───────────────────
/**
 * @param {Cesium.Viewer} viewer
 * @param {{ lon, lat, alt?, name, timeframe, pinClass, description }} meta
 * @returns {Cesium.Entity}
 */
export function plotPin(viewer, meta) {
  const { lon, lat, alt = 0, name, timeframe, pinClass, description } = meta;

  return viewer.entities.add({
    id:       `pin-${lon}-${lat}-${Date.now()}`,
    position: Cesium.Cartesian3.fromDegrees(lon, lat, alt),
    properties: new Cesium.PropertyBag({ name, timeframe, pinClass, description, lon, lat, alt }),

    billboard: {
      image:  buildPinCanvas(pinClass),
      width:  32, height: 42,
      verticalOrigin:   Cesium.VerticalOrigin.BOTTOM,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      // KEY: never occluded — ignores scene depth buffer entirely
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      // Slight pull-toward-camera keeps it above terrain mesh edges
      eyeOffset: new Cesium.Cartesian3(0, 0, -500),
      scaleByDistance: new Cesium.NearFarScalar(1e3, 1.2, 8e6, 0.5),
    },

    label: {
      text:  name,
      font:  '12px "IBM Plex Mono", monospace',
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      fillColor:    Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset:    new Cesium.Cartesian2(0, -46),
      // Same depth override for labels
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      eyeOffset: new Cesium.Cartesian3(0, 0, -500),
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 6e6),
      translucencyByDistance:   new Cesium.NearFarScalar(4e5, 1.0, 6e6, 0.0),
    },
  });
}

// ── registerClickHandler — LEFT_CLICK → selectedEntity store ─────────────────
/**
 * @param {Cesium.Viewer} viewer
 * @returns {() => void} teardown function
 */
export function registerClickHandler(viewer) {
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

  handler.setInputAction(({ position }) => {
    const picked = viewer.scene.pick(position);

    // Clear selection if nothing hit or entity has no property bag
    if (!Cesium.defined(picked) || !picked.id?.properties) {
      selectedEntity.set(null);
      return;
    }

    const p = picked.id.properties;
    selectedEntity.set({
      name:        p.name?.getValue(),
      timeframe:   p.timeframe?.getValue(),
      pinClass:    p.pinClass?.getValue(),
      description: p.description?.getValue(),
      lon:         p.lon?.getValue(),
      lat:         p.lat?.getValue(),
    });
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  return () => handler.destroy();
}
