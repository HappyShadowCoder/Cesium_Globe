<script>
import * as Cesium from 'cesium';
import Map      from './components/Map.svelte';
import Timeline from './components/Timeline.svelte';
import {
  layerMode, viewMode, spyMode, maskShape, maskRadius,
  cameraMode, playbackState, manualPinMode, selectedManualPin,
  graticuleVisible, droneAddMode, trailMode, droneSatMode, trailVisible,
} from './stores/mapStore.js';
import {
  startPlayback, stopPlayback, resetPlayback, drawDronePath,
  enterDroneAddMode, exitDroneAddMode, saveDronePath, loadDronePath,
} from './components/DronePath.js';
import { parseCSV, applyTimelineFilter } from './components/CsvLayer.js';
import {
  addManualPin, removeManualPin, updateManualPin,
  savePins, loadSavedPins, downloadPins,
  enterAddMode, exitAddMode, registerPinClickHandler,
} from './components/ManualPin.js';
import { addGraticule, removeGraticule } from './components/GraticuleModule.js';

let viewer   = null;
let csvUnsub = null;

// City search
let query = '', suggestions = [], cities = [], citiesLoaded = false;

// Pin editing — track by ID to avoid reactive override
let editName = '';
let _editingId = null;
selectedManualPin.subscribe(pin => {
  if (pin?.id !== _editingId) { _editingId = pin?.id ?? null; editName = pin?.name ?? ''; }
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
    destination: Cesium.Cartesian3.fromDegrees(78.96, 22.59, 2_800_000),
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-55), roll: 0 },
    duration: 2,
  });
}

function toggleAddMode() {
  manualPinMode.update(v => { v ? exitAddMode(viewer) : enterAddMode(viewer); return !v; });
}
function toggleDroneAdd() {
  droneAddMode.update(v => { v ? exitDroneAddMode(viewer) : enterDroneAddMode(viewer); return !v; });
}

function applyPinEdit() {
  if (!$selectedManualPin) return;
  updateManualPin(viewer, $selectedManualPin.id, { name: editName, rep: $selectedManualPin.rep });
}
function setPinRep(rep) {
  if (!$selectedManualPin) return;
  updateManualPin(viewer, $selectedManualPin.id, { name: editName, rep });
}

function togglePlay() {
  playbackState.update(s => {
    if (s==='playing') { stopPlayback(); return 'paused'; }
    startPlayback(viewer); return 'playing';
  });
}

async function onCSVUpload(e) {
  const file = e.target.files[0]; if (!file || !viewer) return;
  parseCSV(viewer, await file.text());
  csvUnsub?.(); csvUnsub = applyTimelineFilter(viewer);
}

async function loadCities() {
  if (citiesLoaded) return; citiesLoaded = true;
  const text = await fetch('/worldcities.csv').then(r => r.text());
  cities = text.split('\n').slice(1).map(line => {
    const p = line.replace(/^"|"$/g,'').split('","');
    return { name: p[0], lat: +p[2], lon: +p[3], country: p[4] };
  }).filter(c => c.name && !isNaN(c.lat) && !isNaN(c.lon));
}
function onQueryInput() {
  const q = query.toLowerCase().trim();
  suggestions = q.length < 2 ? [] : cities.filter(c => c.name.toLowerCase().startsWith(q)).slice(0,8);
}
function selectCity(city) {
  viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(city.lon, city.lat, 250_000), duration:1.5 });
  addManualPin(viewer, { lon:city.lon, lat:city.lat, name:`${city.name}, ${city.country}`, rep:'default' });
  query=''; suggestions=[];
}

const REPS = { default:'#00e5ff', danger:'#ff3d00', target:'#ffd600', friendly:'#00e676' };
</script>

<div class="app">
  <Map bind:viewer on:ready={e => onViewerReady(e.detail)} />

  <aside class="panel">
    <!-- Logo + Home -->
    <div class="logo-row">
      <span class="logo">⬡ GEOOPS</span>
      <button class="icon-btn" on:click={flyToIndia} title="Fly to India">🏠</button>
    </div>

    <!-- Spy toggle (always) -->
    <div class="spy-row">
      <span class="slabel">SPY</span>
      <button class:active={$spyMode} class="spy-btn" on:click={() => spyMode.update(v=>!v)}>
        {$spyMode ? '● ON' : '○ OFF'}
      </button>
      {#if $spyMode}
        {#each ['circle','square','triangle'] as s}
          <button class="mini" class:active={$maskShape===s} on:click={() => maskShape.set(s)}>
            {s[0].toUpperCase()}
          </button>
        {/each}
        <input type="range" min=60 max=300 bind:value={$maskRadius} class="slider" />
      {/if}
    </div>

    <!-- Grids toggle (always) -->
    <div class="spy-row">
      <span class="slabel">GRID</span>
      <button class:active={$graticuleVisible} class="spy-btn"
        on:click={() => graticuleVisible.update(v=>!v)}>
        {$graticuleVisible ? '● ON' : '○ OFF'}
      </button>
    </div>

    {#if !$spyMode}
      <!-- City search -->
      <div class="search-wrap" on:focusin={loadCities}>
        <input class="sinput" placeholder="Search city…" bind:value={query}
          on:input={onQueryInput} autocomplete="off" />
        {#if suggestions.length}
          <ul class="sugg">
            {#each suggestions as city}
              <li on:click={() => selectCity(city)} on:keydown>
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
          {#each ['sat','topo','auto'] as m}
            <button class:active={$layerMode===m} on:click={() => layerMode.set(m)}>{m}</button>
          {/each}
        </div>
      </div>

      <!-- View -->
      <div class="grp">
        <span class="slabel">VIEW</span>
        <div class="row">
          {#each ['globe','flat','columbus'] as m}
            <button class:active={$viewMode===m} on:click={() => viewMode.set(m)}>{m}</button>
          {/each}
        </div>
      </div>

      <!-- CSV -->
      <div class="grp">
        <span class="slabel">CSV</span>
        <input type="file" accept=".csv" on:change={onCSVUpload} class="file-input" />
      </div>

      <!-- Manual Points -->
      <div class="grp">
        <span class="slabel">POINTS</span>
        <div class="row">
          <button class:active={$manualPinMode} on:click={toggleAddMode}>
            {$manualPinMode ? '✕ Cancel' : '＋ Add'}
          </button>
          <button on:click={savePins}>💾</button>
          <button on:click={() => downloadPins('json')} title="Download JSON">↓JSON</button>
          <button on:click={() => downloadPins('csv')} title="Download CSV">↓CSV</button>
        </div>
      </div>
    {:else}
      <!-- Camera — spy mode only -->
      <div class="grp">
        <span class="slabel">CAMERA</span>
        <div class="row">
          {#each ['free','satellite','follow'] as m}
            <button class:active={$cameraMode===m} on:click={() => cameraMode.set(m)}>{m}</button>
          {/each}
        </div>
      </div>

      <div class="grp">
        <span class="slabel">DRONE PATH</span>
        <div class="row">
          <button class:active={$droneAddMode} on:click={toggleDroneAdd}>
            {$droneAddMode ? '✕' : '＋WP'}
          </button>
          <button on:click={togglePlay}>{$playbackState==='playing'?'⏸':'▶'}</button>
          <button on:click={() => { resetPlayback(viewer); playbackState.set('idle'); }}>↺</button>
          <button on:click={() => viewer && drawDronePath(viewer)}>⟳</button>
          <button on:click={saveDronePath}>💾</button>
        </div>
        <div class="spy-row" style="margin-top:4px">
          <span class="slabel">PATH AHEAD</span>
          <button class="spy-btn" class:active={$trailMode}
            on:click={() => trailMode.update(v => !v)}>
            {$trailMode ? '● Hidden' : '○ Visible'}
          </button>
        </div>
        <div class="spy-row" style="margin-top:2px">
          <span class="slabel">TRAIL LINE</span>
          <button class="spy-btn" class:active={!$trailVisible}
            on:click={() => trailVisible.update(v => !v)}>
            {$trailVisible ? '○ Visible' : '● Hidden'}
          </button>
        </div>
        <div class="spy-row" style="margin-top:2px">
          <span class="slabel">DRONE SAT</span>
          <button class="spy-btn" class:active={$droneSatMode}
            title="Spy circle locks to drone position (shows SAT beneath drone)"
            on:click={() => droneSatMode.update(v => !v)}>
            {$droneSatMode ? '● ON' : '○ OFF'}
          </button>
        </div>
      </div>
    {/if}
  </aside>

  <!-- Pin edit card -->
  {#if $selectedManualPin}
    <div class="pin-card">
      <button class="close" on:click={() => selectedManualPin.set(null)}>✕</button>
      <p class="card-title">EDIT PIN</p>
      <input class="name-in" value={editName}
        on:input={e => editName = e.target.value}
        placeholder="Name…" />
      <div class="rep-row">
        {#each Object.entries(REPS) as [rep, col]}
          <button class="dot" class:active-dot={$selectedManualPin.rep===rep}
            style="background:{col}" on:click={() => setPinRep(rep)} title={rep} />
        {/each}
      </div>
      <div class="row" style="margin-top:6px">
        <button on:click={applyPinEdit}>✓ Apply</button>
        <button class="del" on:click={() => removeManualPin(viewer,$selectedManualPin.id)}>🗑</button>
      </div>
    </div>
  {/if}

  <Timeline />
</div>

<style>
:global(body) { margin:0; background:#000; overflow:hidden; }
.app { position:relative; width:100vw; height:100vh; font-family:'IBM Plex Mono',monospace; }

/* ── Panel squeezed top-right ── */
.panel {
  position:fixed; right:0; top:0; bottom:40px; width:200px; z-index:15;
  background:rgba(4,12,24,0.94); backdrop-filter:blur(12px);
  border-left:1px solid rgba(0,229,255,0.13);
  padding:10px 10px; overflow-y:auto;
  display:flex; flex-direction:column; gap:8px;
}

.logo-row { display:flex; align-items:center; justify-content:space-between; }
.logo { color:#00e5ff; font-size:13px; letter-spacing:.2em; font-weight:700; }
.icon-btn {
  background:rgba(0,229,255,0.1); border:1px solid rgba(0,229,255,0.25);
  color:#fff; border-radius:3px; padding:2px 6px; cursor:pointer; font-size:13px;
}
.icon-btn:hover { background:rgba(0,229,255,0.22); }

.slabel { font-size:8px; letter-spacing:.18em; color:#446; text-transform:uppercase; }
.spy-row { display:flex; align-items:center; gap:5px; flex-wrap:wrap; }
.grp { display:flex; flex-direction:column; gap:4px; }
.spy-btn {
  background:rgba(0,229,255,0.07); border:1px solid rgba(0,229,255,0.2);
  color:#7dd; padding:3px 8px; border-radius:3px; cursor:pointer;
  font-size:10px; font-family:inherit; transition:background .15s;
}
.spy-btn.active { background:rgba(0,229,255,0.25); border-color:#00e5ff; color:#fff; }
.mini {
  background:rgba(0,229,255,0.06); border:1px solid rgba(0,229,255,0.15);
  color:#7dd; padding:2px 5px; border-radius:2px; cursor:pointer;
  font-size:10px; font-family:inherit;
}
.mini.active { background:rgba(0,229,255,0.22); border-color:#00e5ff; color:#fff; }
.slider { width:100%; accent-color:#00e5ff; margin-top:2px; }

.row { display:flex; gap:3px; flex-wrap:wrap; }
button {
  background:rgba(0,229,255,0.07); border:1px solid rgba(0,229,255,0.18);
  color:#7dd; padding:3px 7px; border-radius:3px; cursor:pointer;
  font-size:10px; font-family:inherit; transition:background .12s, color .12s;
}
button:hover  { background:rgba(0,229,255,0.17); color:#fff; }
button.active { background:rgba(0,229,255,0.26); border-color:#00e5ff; color:#fff; }

.file-input { color:#7dd; font-size:9px; }

/* Search */
.search-wrap { position:relative; }
.sinput {
  width:100%; box-sizing:border-box;
  background:rgba(0,229,255,0.05); border:1px solid rgba(0,229,255,0.18);
  color:#cef; padding:5px 7px; border-radius:3px; font-size:10px;
  font-family:inherit; outline:none;
}
.sinput:focus { border-color:#00e5ff; }
.sugg {
  position:absolute; top:100%; left:0; right:0; z-index:50;
  background:rgba(4,12,24,0.98); border:1px solid rgba(0,229,255,0.2);
  border-top:none; border-radius:0 0 3px 3px;
  list-style:none; margin:0; padding:0; max-height:200px; overflow-y:auto;
}
.sugg li {
  display:flex; justify-content:space-between; align-items:center;
  padding:5px 8px; cursor:pointer; font-size:10px; color:#cef;
  border-bottom:1px solid rgba(0,229,255,0.06);
}
.sugg li:hover { background:rgba(0,229,255,0.1); }
.sugg li b { color:#fff; font-weight:normal; }
.sugg li small { color:#446; }

/* Pin edit card */
.pin-card {
  position:fixed; right:206px; top:14px; z-index:20; width:185px;
  background:rgba(4,12,24,0.97); border:1px solid rgba(0,229,255,0.28);
  border-radius:5px; padding:10px 12px; color:#cef; font-size:11px;
}
.card-title { color:#00e5ff; font-size:8px; letter-spacing:.18em; margin:0 0 7px; }
.close {
  position:absolute; top:5px; right:7px;
  background:none; border:none; color:#446; font-size:12px; cursor:pointer;
}
.name-in {
  width:100%; box-sizing:border-box;
  background:rgba(0,229,255,0.05); border:1px solid rgba(0,229,255,0.2);
  color:#fff; padding:4px 6px; border-radius:3px; font-size:10px;
  font-family:inherit; margin-bottom:7px; outline:none;
}
.name-in:focus { border-color:#00e5ff; }
.rep-row { display:flex; gap:5px; }
.dot {
  width:18px; height:18px; border-radius:50%;
  border:2px solid transparent; cursor:pointer; padding:0;
  transition:border-color .12s, transform .1s;
}
.dot.active-dot { border-color:#fff; transform:scale(1.25); }
.del { border-color:rgba(255,61,0,.35); color:#ff7043; }
.del:hover { background:rgba(255,61,0,.12); }
</style>
