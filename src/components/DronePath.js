// DronePath.js — red path, yellow dot, trail toggle, satellite/follow cameras
import * as Cesium from 'cesium';
import { get } from 'svelte/store';
import {
  controlPoints, splinePositions, playbackT,
  cameraMode, droneAddMode, trailMode, droneSatMode, trailVisible, spyAnchorPos,
} from '../stores/mapStore.js';

const DRONE_SPEED = 0.18;   // ~200 km/h military UAV feel
const LS_DRONE    = 'geoops_drone_path';

// ── Module-level state — read by CallbackProperty every frame ────────────────
let _path = [];
let _t    = 0;

// ── Entities ─────────────────────────────────────────────────────────────────
let _trailEntity = null;   // red: 0 → _t (always visible)
let _aheadEntity = null;   // dimmer red: _t → end (hidden when trailMode ON)
let _droneEntity = null;   // big yellow dot at _t

function clear(viewer) {
  [_trailEntity, _aheadEntity, _droneEntity].forEach(e => e && viewer.entities.remove(e));
  _trailEntity = _aheadEntity = _droneEntity = null;
}

// ── Spline ────────────────────────────────────────────────────────────────────
export function computeSpline(pts, steps = 60) {
  if (pts.length < 2) return [];
  const spline = new Cesium.CatmullRomSpline({ times: pts.map((_,i)=>i), points: pts });
  const total = (pts.length - 1) * steps;
  return Array.from({length: total+1}, (_,i) =>
    spline.evaluate((i/total) * (pts.length-1)));
}

// ── Draw / rebuild ────────────────────────────────────────────────────────────
export function drawDronePath(viewer) {
  const cartesians = get(controlPoints).map(p =>
    Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.alt ?? 5000));
  const positions = computeSpline(cartesians);
  _path = positions;
  _t    = 0;
  splinePositions.set(positions);
  clear(viewer);
  if (positions.length < 2) return;

  // Travelled segment — bright red glow, dynamic end point
  _trailEntity = viewer.entities.add({ polyline: {
    positions: new Cesium.CallbackProperty(() =>
      _path.slice(0, Math.min(Math.floor(_t) + 2, _path.length)), false),
    width: 4,
    material: new Cesium.PolylineGlowMaterialProperty({
      glowPower: 0.45, color: Cesium.Color.RED }),
    depthFailMaterial: new Cesium.ColorMaterialProperty(
      Cesium.Color.RED.withAlpha(0.45)),
  }});

  // Ahead segment — dimmer red, hidden when trail mode ON
  _aheadEntity = viewer.entities.add({ polyline: {
    positions: new Cesium.CallbackProperty(() =>
      _path.slice(Math.max(0, Math.floor(_t))), false),
    width: 3,
    material: new Cesium.PolylineGlowMaterialProperty({
      glowPower: 0.15,
      color: Cesium.Color.fromCssColorString('#ff2222').withAlpha(0.55) }),
    depthFailMaterial: new Cesium.ColorMaterialProperty(
      Cesium.Color.RED.withAlpha(0.2)),
  }});

  // Drone — big yellow dot, always on top, scales with zoom
  _droneEntity = viewer.entities.add({
    position: new Cesium.CallbackProperty(() =>
      _path.length
        ? _path[Math.min(Math.floor(_t), _path.length - 1)]
        : Cesium.Cartesian3.ZERO, false),
    point: {
      pixelSize:    24,
      color:        Cesium.Color.fromCssColorString('#ffd600'),
      outlineColor: Cesium.Color.fromCssColorString('#ff8800'),
      outlineWidth: 4,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      scaleByDistance: new Cesium.NearFarScalar(500, 2.8, 6e6, 0.6),
    },
  });
}

// ── Playback ──────────────────────────────────────────────────────────────────
let _rafId = null;

export function startPlayback(viewer) {
  if (_path.length < 2) return;
  _t = get(playbackT) * (_path.length - 1);

  function tick() {
    _t = (_t + DRONE_SPEED) % (_path.length - 1);
    playbackT.set(_t / (_path.length - 1));

    const idx  = Math.floor(_t);
    const pos  = _path[Math.min(idx,     _path.length - 1)];
    const next = _path[Math.min(idx + 1, _path.length - 1)];

    // Trail ahead visibility
    if (_aheadEntity) _aheadEntity.show = !get(trailMode);
    // Trail line visibility
    if (_trailEntity) _trailEntity.show = get(trailVisible);

    // Drone SAT mode: lock spy circle to drone screen position
    if (get(droneSatMode)) {
      const screen = Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, pos);
      if (screen) spyAnchorPos.set({ x: screen.x, y: screen.y });
    } else {
      spyAnchorPos.set(null);   // release — spy follows mouse
    }

    const mode = get(cameraMode);

    if (mode === 'satellite') {
      // Top-down overhead, tight above drone
      viewer.camera.setView({
        destination: Cesium.Cartesian3.add(
          pos, new Cesium.Cartesian3(0, 0, 2500), new Cesium.Cartesian3()),
        orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 },
      });
    } else if (mode === 'follow') {
      // Chase cam: 400 m behind & slightly above, looking at drone
      viewer.camera.lookAt(
        pos,
        new Cesium.HeadingPitchRange(
          viewer.camera.heading,
          Cesium.Math.toRadians(-18),
          400
        )
      );
    }

    _rafId = requestAnimationFrame(tick);
  }
  _rafId = requestAnimationFrame(tick);
}

export function stopPlayback() {
  if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
}

export function resetPlayback(viewer) {
  stopPlayback();
  _t = 0; playbackT.set(0);
  if (_aheadEntity) _aheadEntity.show = true;
  viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
}

// ── Drone-waypoint add mode ───────────────────────────────────────────────────
let _droneHandler = null;

export function enterDroneAddMode(viewer) {
  viewer.scene.canvas.style.cursor = 'crosshair';
  _droneHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  _droneHandler.setInputAction(({ position }) => {
    const ray = viewer.camera.getPickRay(position);
    const pos = viewer.scene.globe.pick(ray, viewer.scene);
    if (!pos) return;
    const c = Cesium.Cartographic.fromCartesian(pos);
    controlPoints.update(pts => [...pts, {
      lon: Cesium.Math.toDegrees(c.longitude),
      lat: Cesium.Math.toDegrees(c.latitude),
      alt: 5000, id: `wp-${Date.now()}`,
    }]);
    drawDronePath(viewer);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

export function exitDroneAddMode(viewer) {
  viewer.scene.canvas.style.cursor = '';
  _droneHandler?.destroy(); _droneHandler = null;
}

// ── Persist drone path ────────────────────────────────────────────────────────
export function saveDronePath() {
  localStorage.setItem(LS_DRONE,
    JSON.stringify(get(controlPoints).map(({ lon,lat,alt,id }) => ({ lon,lat,alt,id }))));
}

export function loadDronePath(viewer) {
  try {
    const pts = JSON.parse(localStorage.getItem(LS_DRONE) || '[]');
    if (pts.length) { controlPoints.set(pts); drawDronePath(viewer); }
  } catch {}
}
