<script>
  import * as Cesium from "cesium";
  import Map from "./components/Map.svelte";
  import {
    layerMode,
    viewMode,
    spyMode,
    maskShape,
    maskRadius,
    cameraMode,
    playbackState,
    manualPinMode,
    selectedManualPin,
    manualPins,
    graticuleVisible,
    droneAddMode,
    trailMode,
    droneSatMode,
    trailVisible,
    controlPoints,
    bubbleMapVisible,
    stateDataVisible,
    selectedStateData,
  } from "./stores/mapStore.js";
  import {
    showBubbleMap,
    hideBubbleMap,
    showStatePins,
    hideStatePins,
    STATE_COORDS,
  } from "./components/IndiaLayer.js";
  import StateDialog from "./components/StateDialog.svelte";
  import {
    startPlayback,
    stopPlayback,
    resetPlayback,
    drawDronePath,
    enterDroneAddMode,
    exitDroneAddMode,
    saveDronePath,
    loadDronePath,
  } from "./components/DronePath.js";
  import { parseCSV, applyTimelineFilter } from "./components/CsvLayer.js";
  import {
    addManualPin,
    removeManualPin,
    updateManualPin,
    savePins,
    loadSavedPins,
    downloadPins,
    uploadPinsFile,
    enterAddMode,
    exitAddMode,
    registerPinClickHandler,
  } from "./components/ManualPin.js";
  import {
    addGraticule,
    removeGraticule,
  } from "./components/GraticuleModule.js";

  let viewer = null;
  let csvUnsub = null;

  // City search
  let query = "",
    suggestions = [],
    cities = [],
    citiesLoaded = false;

  // Pin editing — track by ID to avoid reactive override
  let editName = "";
  let editAlt  = 0;   // metres, synced from selected pin
  let _editingId = null;
  let panelVisible = true; // Controls visibility of the toolbox panel

  selectedManualPin.subscribe((pin) => {
    if (pin?.id !== _editingId) {
      _editingId = pin?.id ?? null;
      editName   = pin?.name ?? "";
      editAlt    = pin?.alt  ?? 0;
    }
  });

  // Graticule reactive toggle
  $: if (viewer) {
    if ($graticuleVisible) addGraticule(viewer);
    else removeGraticule(viewer);
  }

  function onViewerReady(v) {
    viewer = v;
    registerPinClickHandler(viewer);
    loadSavedPins(viewer);
    loadDronePath(viewer);
  }

  function flyToIndia() {
    if (!viewer) return;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(78.96, 22.59, 7000000),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 },
      duration: 2,
    });
  }

  function toggleAddMode() {
    manualPinMode.update((v) => {
      v ? exitAddMode(viewer) : enterAddMode(viewer);
      return !v;
    });
  }
  function toggleDroneAdd() {
    droneAddMode.update((v) => {
      v ? exitDroneAddMode(viewer) : enterDroneAddMode(viewer);
      return !v;
    });
  }

  function applyPinEdit() {
    if (!$selectedManualPin) return;
    updateManualPin(viewer, $selectedManualPin.id, {
      name: editName,
      rep:  $selectedManualPin.rep,
      alt:  editAlt,
    });
  }
  function setPinRep(rep) {
    if (!$selectedManualPin) return;
    updateManualPin(viewer, $selectedManualPin.id, { name: editName, rep, alt: editAlt });
  }

  function togglePlay() {
    playbackState.update((s) => {
      if (s === "playing") {
        stopPlayback();
        return "paused";
      }
      startPlayback(viewer);
      return "playing";
    });
  }

  function clearWaypoints() {
    stopPlayback();
    playbackState.set("idle");
    controlPoints.set([]);
    if (viewer) {
      resetPlayback(viewer);
      drawDronePath(viewer);
    }
  }

  async function onCSVUpload(e) {
    const file = e.target.files[0];
    if (!file || !viewer) return;
    parseCSV(viewer, await file.text());
    csvUnsub?.();
    csvUnsub = applyTimelineFilter(viewer);
  }

  async function loadCities() {
    if (citiesLoaded) return;
    citiesLoaded = true;
    const text = await fetch("/worldcities.csv").then((r) => r.text());
    cities = text
      .split("\n")
      .slice(1)
      .map((line) => {
        const p = line.replace(/^"|"$/g, "").split('","');
        return { name: p[0], lat: +p[2], lon: +p[3], country: p[4] };
      })
      .filter((c) => c.name && !isNaN(c.lat) && !isNaN(c.lon));
  }
  function onQueryInput() {
    const q = query.toLowerCase().trim();
    suggestions =
      q.length < 2
        ? []
        : cities.filter((c) => c.name.toLowerCase().startsWith(q)).slice(0, 8);
  }
  function selectCity(city) {
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(city.lon, city.lat, 250_000),
      duration: 1.5,
    });
    addManualPin(viewer, {
      lon: city.lon,
      lat: city.lat,
      name: `${city.name}, ${city.country}`,
      rep: "default",
    });
    query = "";
    suggestions = [];
  }

  const REPS = {
    default: "#00e5ff",
    danger: "#ff3d00",
    target: "#ffd600",
    friendly: "#00e676",
  };

  // ── India Layer reactive toggles ────────────────────────────────────────
  $: if (viewer) {
    if ($bubbleMapVisible) showBubbleMap(viewer);
    else hideBubbleMap(viewer);
  }
  $: if (viewer) {
    if ($stateDataVisible) showStatePins(viewer);
    else hideStatePins(viewer);
  }

  // ── Camera fly-in + zoom lock when state dialog opens ────────────────────
  $: if (viewer) {
    const ctrl = viewer.scene.screenSpaceCameraController;
    if ($selectedStateData) {
      // Fly to capital, offset west so dialog doesn't cover the state
      const coord = STATE_COORDS[$selectedStateData.name];
      if (coord) {
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(
            coord.lon - 1.8,   // shift west to keep state left-of-centre
            coord.lat - 0.4,
            280_000,           // 280 km altitude
          ),
          orientation: {
            heading: 0,
            pitch:   Cesium.Math.toRadians(-42),  // 42° angle down
            roll:    0,
          },
          duration: 1.8,
          easingFunction: Cesium.EasingFunction.QUINTIC_IN_OUT,
        });
      }
      // Lock zoom while dialog is open
      ctrl.zoomEventTypes = [];
    } else {
      // Unlock zoom (restore Cesium defaults)
      ctrl.zoomEventTypes = [
        Cesium.CameraEventType.RIGHT_DRAG,
        Cesium.CameraEventType.WHEEL,
        Cesium.CameraEventType.PINCH,
      ];
    }
  }
</script>

<div class="app">
  <Map bind:viewer on:ready={(e) => onViewerReady(e.detail)} />
  <StateDialog />

  <aside class="panel" class:hidden={!panelVisible}>
    <!-- Logo + Home -->
    <div class="logo-row">
      <span class="logo">⬡ GEOOPS</span>
      <div style="display:flex; gap:4px">
        <button class="icon-btn" on:click={flyToIndia} title="Fly to India">🏠</button>
        <button class="icon-btn" on:click={() => panelVisible = false} title="Hide Toolbox">❯</button>
      </div>
    </div>

    <!-- Spy toggle (always) -->
    <div class="spy-row">
      <span class="slabel">SPY</span>
      <button
        class:active={$spyMode}
        class="spy-btn"
        on:click={() => spyMode.update((v) => !v)}
      >
        {$spyMode ? "● ON" : "○ OFF"}
      </button>
      {#if $spyMode}
        {#each ["circle", "square", "triangle"] as s}
          <button
            class="mini"
            class:active={$maskShape === s}
            on:click={() => maskShape.set(s)}
          >
            {s[0].toUpperCase()}
          </button>
        {/each}
        <input
          type="range"
          min="60"
          max="300"
          bind:value={$maskRadius}
          class="slider"
        />
      {/if}
    </div>

    <!-- Grids toggle (always) -->
    <div class="spy-row">
      <span class="slabel">GRID</span>
      <button
        class:active={$graticuleVisible}
        class="spy-btn"
        on:click={() => graticuleVisible.update((v) => !v)}
      >
        {$graticuleVisible ? "● ON" : "○ OFF"}
      </button>
    </div>

    <!-- India Data Layer -->
    <div class="grp india-grp">
      <span class="slabel">INDIA DATA</span>
      <div class="spy-row" style="margin-top:3px">
        <span class="slabel" style="font-size:7px;color:#5a8a9a">POP DENSITY</span>
        <button
          class="spy-btn"
          class:active={$bubbleMapVisible}
          title="Toggle population density choropleth + bubble map"
          on:click={() => bubbleMapVisible.update((v) => !v)}
        >
          {$bubbleMapVisible ? "● ON" : "○ OFF"}
        </button>
      </div>
      {#if $bubbleMapVisible}
        <div class="density-legend">
          <span style="color:#22cc44">Low</span>
          <div class="grad-bar" />
          <span style="color:#ff2222">High</span>
        </div>
      {/if}
      <div class="spy-row" style="margin-top:3px">
        <span class="slabel" style="font-size:7px;color:#5a8a9a">STATE DATA</span>
        <button
          class="spy-btn"
          class:active={$stateDataVisible}
          title="Toggle state capital pins — click a pin to view census data"
          on:click={() => stateDataVisible.update((v) => !v)}
        >
          {$stateDataVisible ? "● ON" : "○ OFF"}
        </button>
      </div>
      {#if $stateDataVisible}
        <div class="india-legend">
          <span class="leg-dot state-dot" />State capital
          <span class="leg-dot ut-dot" style="margin-left:6px" />UT
        </div>
      {/if}
    </div>

    {#if !$spyMode}
      <!-- City search -->
      <div class="search-wrap" on:focusin={loadCities}>
        <input
          class="sinput"
          placeholder="Search city…"
          bind:value={query}
          on:input={onQueryInput}
          autocomplete="off"
        />
        {#if suggestions.length}
          <ul class="sugg">
            {#each suggestions as city}
              <li onclick={() => selectCity(city)} onkeydown>
                <b>{city.name}</b><small>{city.country}</small>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <!-- Layer -->
      <div class="grp">
        <span class="slabel">LAYER</span>
        <div class="row">
          {#each ["sat", "topo", "auto"] as m}
            <button
              class:active={$layerMode === m}
              on:click={() => layerMode.set(m)}>{m}</button
            >
          {/each}
        </div>
      </div>

      <!-- View -->
      <div class="grp">
        <span class="slabel">VIEW</span>
        <div class="row">
          {#each ["globe", "flat", "columbus"] as m}
            <button
              class:active={$viewMode === m}
              on:click={() => viewMode.set(m)}>{m}</button
            >
          {/each}
        </div>
      </div>

      <!-- CSV -->
      <div class="grp">
        <span class="slabel">CSV</span>
        <input
          type="file"
          accept=".csv"
          on:change={onCSVUpload}
          class="file-input"
        />
      </div>

      <!-- Manual Points -->
      <div class="grp">
        <span class="slabel">POINTS</span>
        <div class="row">
          <button class:active={$manualPinMode} on:click={toggleAddMode}>
            {$manualPinMode ? "✕ Cancel" : "＋ Add"}
          </button>
          <button on:click={() => downloadPins("json")} title="Download JSON">↓JSON</button>
          <button on:click={() => downloadPins("csv")} title="Download CSV">↓CSV</button>
          <button on:click={() => document.getElementById('pin-upload').click()} title="Upload Pins">↑UP</button>
          <input type="file" id="pin-upload" accept=".json,.csv" style="display:none" on:change={(e) => { uploadPinsFile(viewer, e.target.files[0]); e.target.value = ''; }} />
        </div>

        {#if $manualPins && $manualPins.length > 0}
          <div class="pin-list">
            {#each $manualPins as pin}
              <div class="pin-item" class:active-pin={$selectedManualPin?.id === pin.id} on:click={() => selectedManualPin.set(pin)}>
                <span class="pin-dot" style="background: {pin.rep.startsWith('#') ? pin.rep : REPS[pin.rep] || REPS.default}"></span>
                <span class="pin-name">{pin.name}</span>
                <button class="pin-del" on:click|stopPropagation={() => removeManualPin(viewer, pin.id)}>✕</button>
              </div>
              
              {#if $selectedManualPin?.id === pin.id}
                <div class="pin-editor">
                  <input class="name-in" value={editName} on:input={(e) => (editName = e.target.value)} placeholder="Name…" />
                  
                  <div class="rep-row">
                    {#each Object.entries(REPS) as [rep, col]}
                      <button class="dot" class:active-dot={$selectedManualPin.rep === rep} style="background:{col}" on:click={() => setPinRep(rep)} title={rep} />
                    {/each}
                    <input type="color" class="dot custom-color-picker" class:active-dot={$selectedManualPin.rep.startsWith('#')} value={$selectedManualPin.rep.startsWith('#') ? $selectedManualPin.rep : '#ffffff'} on:input={(e) => setPinRep(e.target.value)} title="Custom Color" />
                  </div>

                  <div class="alt-row">
                    <span class="slabel">ALT</span>
                    <input type="range" class="alt-slider" min="0" max="10000" step="100" bind:value={editAlt} />
                    <span class="alt-val">{(editAlt / 1000).toFixed(2)} km</span>
                  </div>

                  <div class="coord-box">
                    <span class="coord-lbl">LON</span><span class="coord-val">{$selectedManualPin.lon.toFixed(4)}°</span>
                    <span class="coord-lbl">LAT</span><span class="coord-val">{$selectedManualPin.lat.toFixed(4)}°</span>
                  </div>

                  <div class="row" style="margin-top:6px">
                    <button on:click={applyPinEdit}>✓ Apply</button>
                    <button on:click={() => selectedManualPin.set(null)}>Close</button>
                  </div>
                </div>
              {/if}
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Camera — always visible -->
    <div class="grp">
      <span class="slabel">CAMERA</span>
      <div class="row">
        {#each ["free", "satellite", "follow"] as m}
          <button
            class:active={$cameraMode === m}
            on:click={() => cameraMode.set(m)}>{m}</button
          >
        {/each}
      </div>
    </div>

    <!-- Drone Path — always visible, independent of spy mode -->
    <div class="grp">
      <span class="slabel">DRONE PATH</span>
      <div class="row">
        <button class:active={$droneAddMode} on:click={toggleDroneAdd}>
          {$droneAddMode ? "✕" : "＋WP"}
        </button>
        <button on:click={togglePlay}
          >{$playbackState === "playing" ? "⏸" : "▶"}</button
        >
        <button
          on:click={() => {
            resetPlayback(viewer);
            playbackState.set("idle");
          }}>↺</button
        >
        <button on:click={() => viewer && drawDronePath(viewer)}>⟳</button>
        <button on:click={saveDronePath}>💾</button>
        <button class="del" title="Remove all waypoints" on:click={clearWaypoints}>🗑 WP</button>
      </div>
      <div class="spy-row" style="margin-top:4px">
        <span class="slabel">PATH AHEAD</span>
        <button
          class="spy-btn"
          class:active={$trailMode}
          on:click={() => trailMode.update((v) => !v)}
        >
          {$trailMode ? "● Hidden" : "○ Visible"}
        </button>
      </div>
      <div class="spy-row" style="margin-top:2px">
        <span class="slabel">TRAIL LINE</span>
        <button
          class="spy-btn"
          class:active={!$trailVisible}
          on:click={() => trailVisible.update((v) => !v)}
        >
          {$trailVisible ? "○ Visible" : "● Hidden"}
        </button>
      </div>
      <div class="spy-row" style="margin-top:2px">
        <span class="slabel">DRONE SAT</span>
        <button
          class="spy-btn"
          class:active={$droneSatMode}
          title="Spy circle locks to drone position (shows SAT beneath drone)"
          on:click={() => droneSatMode.update((v) => !v)}
        >
          {$droneSatMode ? "● ON" : "○ OFF"}
        </button>
      </div>
    </div>
  </aside>

  <!-- Floating Open Button when Panel is Hidden -->
  {#if !panelVisible}
    <button class="panel-toggle-btn" on:click={() => panelVisible = true} title="Open Toolbox">
      ☰
    </button>
  {/if}
</div>

<style>
  :global(body) {
    margin: 0;
    background: #000;
    overflow: hidden;
  }
  /* Force hide any remaining Cesium credits/logos */
  :global(.cesium-widget-credits) {
    display: none !important;
  }
  .app {
    position: relative;
    width: 100vw;
    height: 100vh;
    font-family: "IBM Plex Mono", monospace;
  }

  /* ── Panel squeezed top-right ── */
  .panel {
    position: fixed;
    right: 0;
    top: 0;
    bottom: 40px;
    width: 200px;
    z-index: 15;
    background: rgba(4, 12, 24, 0.94);
    backdrop-filter: blur(12px);
    border-left: 1px solid rgba(0, 229, 255, 0.13);
    padding: 10px 10px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .panel.hidden {
    transform: translateX(100%);
  }

  .panel-toggle-btn {
    position: fixed;
    right: 15px;
    top: 15px;
    z-index: 20;
    background: rgba(4, 12, 24, 0.94);
    border: 1px solid rgba(0, 229, 255, 0.25);
    color: #00e5ff;
    padding: 6px 10px;
    font-size: 16px;
    border-radius: 4px;
    cursor: pointer;
    backdrop-filter: blur(12px);
    transition: background 0.15s;
  }
  .panel-toggle-btn:hover {
    background: rgba(0, 229, 255, 0.15);
  }

  .logo-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .logo {
    color: #00e5ff;
    font-size: 13px;
    letter-spacing: 0.2em;
    font-weight: 700;
  }
  .icon-btn {
    background: rgba(0, 229, 255, 0.1);
    border: 1px solid rgba(0, 229, 255, 0.25);
    color: #fff;
    border-radius: 3px;
    padding: 2px 6px;
    cursor: pointer;
    font-size: 13px;
  }
  .icon-btn:hover {
    background: rgba(0, 229, 255, 0.22);
  }

  .slabel {
    font-size: 8px;
    letter-spacing: 0.18em;
    color: #fff;
    text-transform: uppercase;
  }
  .spy-row {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
  }
  .grp {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .spy-btn {
    background: rgba(0, 229, 255, 0.07);
    border: 1px solid rgba(0, 229, 255, 0.2);
    color: #7dd;
    padding: 3px 8px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 10px;
    font-family: inherit;
    transition: background 0.15s;
  }
  .spy-btn.active {
    background: rgba(0, 229, 255, 0.25);
    border-color: #00e5ff;
    color: #fff;
  }
  .mini {
    background: rgba(0, 229, 255, 0.06);
    border: 1px solid rgba(0, 229, 255, 0.15);
    color: #7dd;
    padding: 2px 5px;
    border-radius: 2px;
    cursor: pointer;
    font-size: 10px;
    font-family: inherit;
  }
  .mini.active {
    background: rgba(0, 229, 255, 0.22);
    border-color: #00e5ff;
    color: #fff;
  }
  .slider {
    width: 100%;
    accent-color: #00e5ff;
    margin-top: 2px;
  }

  .row {
    display: flex;
    gap: 3px;
    flex-wrap: wrap;
  }
  button {
    background: rgba(0, 229, 255, 0.07);
    border: 1px solid rgba(0, 229, 255, 0.18);
    color: #7dd;
    padding: 3px 7px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 10px;
    font-family: inherit;
    transition:
      background 0.12s,
      color 0.12s;
  }
  button:hover {
    background: rgba(0, 229, 255, 0.17);
    color: #fff;
  }
  button.active {
    background: rgba(0, 229, 255, 0.26);
    border-color: #00e5ff;
    color: #fff;
  }

  .file-input {
    color: #7dd;
    font-size: 9px;
  }

  /* Search */
  .search-wrap {
    position: relative;
  }
  .sinput {
    width: 100%;
    box-sizing: border-box;
    background: rgba(0, 229, 255, 0.05);
    border: 1px solid rgba(0, 229, 255, 0.18);
    color: #cef;
    padding: 5px 7px;
    border-radius: 3px;
    font-size: 10px;
    font-family: inherit;
    outline: none;
  }
  .sinput:focus {
    border-color: #00e5ff;
  }
  .sugg {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 50;
    background: rgba(4, 12, 24, 0.98);
    border: 1px solid rgba(0, 229, 255, 0.2);
    border-top: none;
    border-radius: 0 0 3px 3px;
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 200px;
    overflow-y: auto;
  }
  .sugg li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 5px 8px;
    cursor: pointer;
    font-size: 10px;
    color: #cef;
    border-bottom: 1px solid rgba(0, 229, 255, 0.06);
  }
  .sugg li:hover {
    background: rgba(0, 229, 255, 0.1);
  }
  .sugg li b {
    color: #fff;
    font-weight: normal;
  }
  .sugg li small {
    color: #446;
  }

  /* Pin list in sidebar */
  .pin-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 6px;
  }
  .pin-item {
    display: flex;
    align-items: center;
    background: rgba(0, 229, 255, 0.05);
    border: 1px solid rgba(0, 229, 255, 0.1);
    padding: 4px 6px;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.1s;
  }
  .pin-item:hover {
    background: rgba(0, 229, 255, 0.12);
  }
  .pin-item.active-pin {
    background: rgba(0, 229, 255, 0.18);
    border-color: rgba(0, 229, 255, 0.4);
  }
  .pin-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 6px;
    flex-shrink: 0;
  }
  .pin-name {
    flex: 1;
    font-size: 10px;
    color: #cef;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pin-del {
    background: none;
    border: none;
    color: #ff7043;
    cursor: pointer;
    font-size: 10px;
    padding: 0 4px;
  }
  .pin-del:hover {
    color: #ff3d00;
  }
  .pin-editor {
    background: rgba(0, 0, 0, 0.3);
    border-left: 2px solid #00e5ff;
    padding: 8px;
    margin-top: 2px;
    border-radius: 0 4px 4px 0;
  }
  .name-in {
    width: 100%;
    box-sizing: border-box;
    background: rgba(0, 229, 255, 0.05);
    border: 1px solid rgba(0, 229, 255, 0.2);
    color: #fff;
    padding: 4px 6px;
    border-radius: 3px;
    font-size: 10px;
    font-family: inherit;
    margin-bottom: 7px;
    outline: none;
  }
  .name-in:focus {
    border-color: #00e5ff;
  }
  .rep-row {
    display: flex;
    gap: 5px;
  }
  .dot {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    padding: 0;
    transition:
      border-color 0.12s,
      transform 0.1s;
  }
  .dot.active-dot {
    border-color: #fff;
    transform: scale(1.25);
  }
  .custom-color-picker {
    appearance: none;
    -webkit-appearance: none;
    background: transparent;
    border: none;
    outline: none;
  }
  .custom-color-picker::-webkit-color-swatch-wrapper {
    padding: 0;
  }
  .custom-color-picker::-webkit-color-swatch {
    border: 2px solid transparent;
    border-radius: 50%;
  }
  .custom-color-picker.active-dot::-webkit-color-swatch {
    border-color: #fff;
  }
  .del {
    border-color: rgba(255, 61, 0, 0.35);
    color: #ff7043;
  }
  .del:hover {
    background: rgba(255, 61, 0, 0.12);
  }

  /* Altitude slider row inside pin-card */
  .alt-row {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 8px;
  }
  .alt-slider {
    flex: 1;
    accent-color: #00e5ff;
    height: 3px;
    cursor: pointer;
  }
  .alt-val {
    font-size: 9px;
    color: #00e5ff;
    min-width: 36px;
    text-align: right;
    flex-shrink: 0;
  }

  /* Coordinate read-out grid */
  .coord-box {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 6px;
    margin-top: 7px;
    padding: 5px 6px;
    background: rgba(0, 229, 255, 0.05);
    border: 1px solid rgba(0, 229, 255, 0.12);
    border-radius: 3px;
  }
  .coord-lbl {
    font-size: 7px;
    letter-spacing: 0.14em;
    color: #446;
    text-transform: uppercase;
    align-self: center;
  }
  .coord-val {
    font-size: 9px;
    color: #cef;
    font-family: "IBM Plex Mono", monospace;
  }

  /* ── India Data Layer ────────────────────────────────────────────────────── */
  .india-grp {
    border-top: 1px solid rgba(0,229,255,0.1);
    padding-top: 7px;
  }
  .density-legend {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 4px;
    font-size: 8px;
    font-family: inherit;
  }
  .grad-bar {
    flex: 1;
    height: 5px;
    border-radius: 3px;
    background: linear-gradient(90deg,
      hsl(120,85%,52%) 0%,
      hsl(60,85%,52%)  40%,
      hsl(30,85%,52%)  65%,
      hsl(0,85%,52%)   100%);
    box-shadow: 0 0 6px rgba(0,0,0,0.4);
  }
  .india-legend {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 8px;
    margin-top: 4px;
    color: #7dd;
  }
  .leg-dot {
    display: inline-block;
    width: 7px; height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .state-dot { background: #00e5ff; outline: 2px solid #0080ff; outline-offset: 1px; }
  .ut-dot    { background: #ffd600; outline: 2px solid #ff8800; outline-offset: 1px; }
</style>
