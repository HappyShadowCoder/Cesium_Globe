<script>
// Map.svelte — Viewer bootstrap, layer switching, view morphing, spy overlay
import { onMount, createEventDispatcher } from 'svelte';
const dispatch = createEventDispatcher();
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { effectiveLayer, viewMode, cameraHeight,
  spyMode, maskShape, maskRadius
} from '../stores/mapStore.js';
import { get } from 'svelte/store';
import { buildSpyOverlay } from './SpyMode.js';

export let viewer = null;

// ── Token-free imagery factories ─────────────────────────────────────────────
const makeTopo = () => new Cesium.UrlTemplateImageryProvider({
  url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
  maximumLevel: 17, credit: 'OpenTopoMap'
});

const makeSat = () => new Cesium.UrlTemplateImageryProvider({
  // Esri World Imagery — public, no token required
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  maximumLevel: 19, credit: 'Esri'
});

// ── Cesium scene morph functions (no generic morphTo — must call per-mode) ───
// viewer.scene.morphTo(mode, duration) does NOT exist in the Cesium API.
// The correct methods are: morphTo3D(), morphTo2D(), morphToColumbusView()
const MORPH_FN = {
  globe:    s => s.morphTo3D(1.0),
  flat:     s => s.morphTo2D(1.0),
  columbus: s => s.morphToColumbusView(1.0),
};

onMount(async () => {
  Cesium.Ion.defaultAccessToken = '';

  // Detached div → suppresses credit banner without accessing viewer.creditContainer
  const _creditDiv = document.createElement('div');

  // ── ArcGIS World Elevation 3D — public, zero Cesium Ion token needed ─────────
  let terrainProvider;
  try {
    terrainProvider = await Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(
      'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer'
    );
  } catch (e) {
    console.warn('ArcGIS terrain unavailable, using flat ellipsoid:', e);
    terrainProvider = new Cesium.EllipsoidTerrainProvider();
  }

  viewer = new Cesium.Viewer('cesium-container', {
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
    creditContainer:      _creditDiv,
    terrainProvider,
  });

  // Crisp rendering — use native device pixel ratio instead of browser-downscaled
  viewer.useBrowserRecommendedResolution = false;
  viewer.resolutionScale = window.devicePixelRatio;

  // 2.5× vertical exaggeration — makes Himalayas/Rockies dramatically visible
  viewer.scene.verticalExaggeration = 2.5;
  viewer.scene.verticalExaggerationRelativeHeight = 0;

  // Default view: whole Indian subcontinent visible on load (instant, no animation)
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(82.0, 22.0, 3_500_000),
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-55), roll: 0 },
  });

  // ── Add both base layers; visibility toggled reactively ─────────────────────
  viewer._topoLayer = viewer.imageryLayers.addImageryProvider(makeTopo());
  viewer._satLayer  = viewer.imageryLayers.addImageryProvider(makeSat());

  // ── Drive cameraHeight store from camera position ─────────────────────────
  viewer.camera.changed.addEventListener(() => {
    cameraHeight.set(viewer.camera.positionCartographic.height);
  });

  // ── Unified layer visibility: spy mode forces TOPO on main viewer ────────
  function syncLayers() {
    if (!viewer) return;
    const isSpy  = get(spyMode);
    const layer  = get(effectiveLayer);
    // In spy mode, main viewer is always TOPO; SAT shown by the clipped spy viewer
    viewer._topoLayer.show = isSpy ? true  : (layer === 'topo');
    viewer._satLayer.show  = isSpy ? false : (layer === 'sat');
  }

  const unsubLayer = effectiveLayer.subscribe(syncLayers);

  // ── Reactive: spy-mode overlay (also re-syncs layers on toggle) ──────────
  let destroySpy = null;
  const unsubSpy = spyMode.subscribe(active => {
    destroySpy?.();
    destroySpy = null;
    syncLayers();                        // update main viewer layers immediately
    if (active) destroySpy = buildSpyOverlay(viewer, maskShape, maskRadius);
  });

  // ── Reactive: morph scene mode ───────────────────────────────────────────
  const unsubView = viewMode.subscribe(mode => {
    if (!viewer) return;
    // Use MORPH_FN lookup — morphTo3D/morphTo2D/morphToColumbusView
    MORPH_FN[mode]?.(viewer.scene);

    // Columbus: tilt to 45° isometric after morph animation settles
    if (mode === 'columbus') {
      setTimeout(() => {
        viewer.camera.setView({
          orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch:   Cesium.Math.toRadians(-45),
            roll:    0,
          }
        });
      }, 1200);
    }
  });


  // Notify App.svelte that viewer is live (for click handler registration)
  dispatch('ready', viewer);

  return () => { unsubLayer(); unsubView(); unsubSpy(); destroySpy?.(); viewer?.destroy(); };
});
</script>

<div id="cesium-container" style="width:100%;height:100vh;" />
