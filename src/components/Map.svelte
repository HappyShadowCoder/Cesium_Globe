<script>
  // Map.svelte — Viewer bootstrap, layer switching, view morphing, spy overlay
  import { onMount, createEventDispatcher } from "svelte";
  const dispatch = createEventDispatcher();
  import * as Cesium from "cesium";
  import "cesium/Build/Cesium/Widgets/widgets.css";
  import {
    effectiveLayer,
    viewMode,
    cameraHeight,
    spyMode,
    maskShape,
    maskRadius,
  } from "../stores/mapStore.js";
  import { get } from "svelte/store";
  import { buildSpyOverlay } from "./SpyMode.js";

  export let viewer = null;

  // ── Token-free imagery factories ─────────────────────────────────────────────
  const makeTopo = () =>
    new Cesium.UrlTemplateImageryProvider({
      url: "https://tile.opentopomap.org/{z}/{x}/{y}.png",
      maximumLevel: 17,
      credit: "OpenTopoMap",
    });

  const makeSat = () =>
    new Cesium.UrlTemplateImageryProvider({
      // Esri World Imagery — public, no token required
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      maximumLevel: 19,
      credit: "Esri",
    });

  // ── Cesium scene morph functions (no generic morphTo — must call per-mode) ───
  const MORPH_FN = {
    globe: (s) => s.morphTo3D(1.0),
    flat: (s) => s.morphTo2D(1.0),
    columbus: (s) => s.morphToColumbusView(1.0),
  };

  onMount(async () => {
    Cesium.Ion.defaultAccessToken = "";

    // Detached div → suppresses credit banner
    const _creditDiv = document.createElement("div");

    // ── ArcGIS World Elevation 3D ─────────────────────────────────────────────
    let terrainProvider;
    try {
      terrainProvider =
        await Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(
          "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer",
        );
    } catch (e) {
      console.warn("ArcGIS terrain unavailable, using flat ellipsoid:", e);
      terrainProvider = new Cesium.EllipsoidTerrainProvider();
    }

    viewer = new Cesium.Viewer("cesium-container", {
      imageryProvider: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: true,
      timeline: true,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      creditContainer: _creditDiv,
      terrainProvider,
    });

    // ── IST formatters ────────────────────────────────────────────────────────
    // IST = UTC + 5:30 (19800 seconds). We apply the offset manually using UTC
    // methods so the result is cross-browser and doesn't rely on OS locale TZ.
    const IST_MS = 5.5 * 3600 * 1000; // 19800000 ms

    function toIST(julianDate) {
      return new Date(Cesium.JulianDate.toDate(julianDate).getTime() + IST_MS);
    }

    // Animation widget (clock dial) — dateFormatter and timeFormatter are plain
    // function properties; Knockout picks them up on the next render tick.
    viewer.animation.viewModel.dateFormatter = (julianDate) => {
      const d = toIST(julianDate);
      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      return `${String(d.getUTCDate()).padStart(2,"0")} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    };
    viewer.animation.viewModel.timeFormatter = (julianDate) => {
      const d = toIST(julianDate);
      const hh = String(d.getUTCHours()).padStart(2, "0");
      const mm = String(d.getUTCMinutes()).padStart(2, "0");
      const ss = String(d.getUTCSeconds()).padStart(2, "0");
      return `${hh}:${mm}:${ss} IST`;
    };

    // Timeline widget tick labels
    viewer.timeline.makeLabel = (julianDate) => {
      const d = toIST(julianDate);
      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const hh = String(d.getUTCHours()).padStart(2, "0");
      const mm = String(d.getUTCMinutes()).padStart(2, "0");
      const ss = String(d.getUTCSeconds()).padStart(2, "0");
      return `${String(d.getUTCDate()).padStart(2,"0")} ${months[d.getUTCMonth()]} ${hh}:${mm}:${ss} IST`;
    };

    // Force the timeline to repaint its tick labels immediately
    viewer.timeline.zoomTo(viewer.clock.startTime, viewer.clock.stopTime);
    // And re-render the animation dial
    viewer.animation.viewModel.pauseViewModel.command();
    viewer.animation.viewModel.pauseViewModel.command();

    // Crisp rendering — use native device pixel ratio
    viewer.useBrowserRecommendedResolution = false;
    viewer.resolutionScale = window.devicePixelRatio;

    // 2.5× vertical exaggeration
    viewer.scene.verticalExaggeration = 2.5;
    viewer.scene.verticalExaggerationRelativeHeight = 0;

    // Default view
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(78.96, 22.59, 7000000),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 },
    });

    // ── Add both base layers ─────────────────────────────────────────────────
    viewer._topoLayer = viewer.imageryLayers.addImageryProvider(makeTopo());
    viewer._satLayer = viewer.imageryLayers.addImageryProvider(makeSat());

    // ── Drive cameraHeight store from camera position ─────────────────────────
    viewer.camera.changed.addEventListener(() => {
      cameraHeight.set(viewer.camera.positionCartographic.height);
    });

    // ── Unified layer visibility ─────────────────────────────────────────────
    function syncLayers() {
      if (!viewer) return;
      const isSpy = get(spyMode);
      const layer = get(effectiveLayer);
      viewer._topoLayer.show = isSpy ? true : layer === "topo";
      viewer._satLayer.show = isSpy ? false : layer === "sat";
    }

    const unsubLayer = effectiveLayer.subscribe(syncLayers);

    // ── Spy-mode overlay ─────────────────────────────────────────────────────
    let destroySpy = null;
    const unsubSpy = spyMode.subscribe((active) => {
      destroySpy?.();
      destroySpy = null;
      syncLayers();
      if (active) destroySpy = buildSpyOverlay(viewer, maskShape, maskRadius);
    });

    // ── Scene morph ──────────────────────────────────────────────────────────
    const unsubView = viewMode.subscribe((mode) => {
      if (!viewer) return;
      MORPH_FN[mode]?.(viewer.scene);

      if (mode === "columbus") {
        setTimeout(() => {
          viewer.camera.setView({
            orientation: {
              heading: Cesium.Math.toRadians(0),
              pitch: Cesium.Math.toRadians(-45),
              roll: 0,
            },
          });
        }, 1200);
      }
    });

    dispatch("ready", viewer);

    return () => {
      unsubLayer();
      unsubView();
      unsubSpy();
      destroySpy?.();
      viewer?.destroy();
    };
  });
</script>

<div id="cesium-container" style="width:100%;height:100vh;" />

<style>
  /* Kill the Cesium watermark and any credit text that sneaks through */
  :global(.cesium-widget-credits),
  :global(.cesium-credit-logoContainer),
  :global(.cesium-credit-lightbox-overlay) {
    display: none !important;
  }
</style>
