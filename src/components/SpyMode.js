// SpyMode.js — Dual-viewer spy: main=TOPO, clipped overlay=SAT
import * as Cesium from 'cesium';
import { get } from 'svelte/store';
import { spyAnchorPos } from '../stores/mapStore.js';

const SAT_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

function clipPath(shape, x, y, r) {
  switch (shape) {
    case 'square':
      return `polygon(${x-r}px ${y-r}px,${x+r}px ${y-r}px,${x+r}px ${y+r}px,${x-r}px ${y+r}px)`;
    case 'triangle': {
      const h = r * Math.sqrt(3) * 0.5;
      return `polygon(${x}px ${y - r*1.15}px,${x+r}px ${y+h}px,${x-r}px ${y+h}px)`;
    }
    default: // circle
      return `circle(${r}px at ${x}px ${y}px)`;
  }
}

export function buildSpyOverlay(mainViewer, shapeStore, radiusStore) {
  const container = mainViewer.container;
  if (getComputedStyle(container).position === 'static')
    container.style.position = 'relative';

  // ── Spy wrapper — full-size, clipped to spy shape ─────────────────────────
  const wrap = document.createElement('div');
  Object.assign(wrap.style, {
    position: 'absolute', top: '0', left: '0',
    width: '100%', height: '100%',
    pointerEvents: 'none', zIndex: '8',
    clipPath: 'circle(0px at 50% 50%)',
  });
  container.appendChild(wrap);

  // ── Second Cesium viewer — SAT imagery only ───────────────────────────────
  const spyViewer = new Cesium.Viewer(wrap, {
    imageryProvider:      false,
    baseLayerPicker:      false,
    geocoder:             false,
    homeButton:           false,
    sceneModePicker:      false,
    navigationHelpButton: false,
    animation:            false,
    timeline:             false,
    fullscreenButton:     false,
    infoBox:              false,
    selectionIndicator:   false,
    creditContainer:      document.createElement('div'),
    terrainProvider:      mainViewer.terrainProvider,
    skyBox:               false,
    skyAtmosphere:        false,
  });

  spyViewer.imageryLayers.removeAll();
  spyViewer.imageryLayers.addImageryProvider(
    new Cesium.UrlTemplateImageryProvider({ url: SAT_URL, maximumLevel: 19, credit: 'Esri' })
  );
  spyViewer.scene.verticalExaggeration = mainViewer.scene.verticalExaggeration;

  // Cesium sets pointer-events on its canvas independently of the parent div.
  // We must explicitly kill it so clicks fall through to the main viewer.
  spyViewer.scene.canvas.style.pointerEvents = 'none';
  // Also block the inner widget container Cesium creates
  wrap.querySelectorAll('*').forEach(el => { el.style.pointerEvents = 'none'; });
  // Observe future DOM additions by Cesium (widget overlays)
  new MutationObserver(() => {
    wrap.querySelectorAll('*').forEach(el => { el.style.pointerEvents = 'none'; });
  }).observe(wrap, { childList: true, subtree: true });

  // ── Camera sync + clip-path loop ──────────────────────────────────────────
  let rafId, mx = -999, my = -999;

  function tick() {
    const mc = mainViewer.camera;
    spyViewer.camera.setView({
      destination:  mc.position.clone(),
      orientation:  new Cesium.HeadingPitchRoll(mc.heading, mc.pitch, mc.roll),
    });
    // Use drone screen-pos anchor when set; otherwise follow mouse
    const anchor = get(spyAnchorPos);
    const cx = anchor ? anchor.x : mx;
    const cy = anchor ? anchor.y : my;
    wrap.style.clipPath = clipPath(get(shapeStore), cx, cy, get(radiusStore));
    rafId = requestAnimationFrame(tick);
  }

  function onMove(e) {
    const r = container.getBoundingClientRect();
    mx = e.clientX - r.left;
    my = e.clientY - r.top;
  }

  container.addEventListener('mousemove', onMove);
  tick();

  return function destroy() {
    cancelAnimationFrame(rafId);
    container.removeEventListener('mousemove', onMove);
    spyViewer.destroy();
    wrap.remove();
  };
}
