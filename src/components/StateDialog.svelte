<script>
  import { onMount, onDestroy } from 'svelte';
  import { selectedStateData } from '../stores/mapStore.js';

  let data = null;
  let visible = false;

  // Animate arcs after mount
  let animating = false;
  let animFrame = 0;

  const unsub = selectedStateData.subscribe(d => {
    data = d;
    visible = !!d;
    if (visible) {
      animating = false;
      cancelAnimationFrame(animFrame);
      // Tiny delay so Svelte renders the SVG first
      setTimeout(() => startAnimation(), 30);
    }
  });

  onDestroy(() => {
    unsub();
    cancelAnimationFrame(animFrame);
  });

  // ── Donut chart helpers ───────────────────────────────────────────────────
  const R = 52;         // outer radius
  const r = 30;         // inner radius (hole)
  const CX = 70, CY = 70;  // centre
  const VIEW = 140;

  function polarToXY(cx, cy, radius, angleDeg) {
    const a = (angleDeg - 90) * (Math.PI / 180);
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
  }

  function arcPath(cx, cy, R, r, startDeg, endDeg) {
    // Clamp sweep to avoid full-circle SVG arc ambiguity
    const sweep = Math.min(endDeg - startDeg, 359.99);
    const o1 = polarToXY(cx, cy, R, startDeg);
    const o2 = polarToXY(cx, cy, R, startDeg + sweep);
    const i1 = polarToXY(cx, cy, r, startDeg + sweep);
    const i2 = polarToXY(cx, cy, r, startDeg);
    const lg = sweep > 180 ? 1 : 0;
    return [
      `M ${o1.x.toFixed(2)} ${o1.y.toFixed(2)}`,
      `A ${R} ${R} 0 ${lg} 1 ${o2.x.toFixed(2)} ${o2.y.toFixed(2)}`,
      `L ${i1.x.toFixed(2)} ${i1.y.toFixed(2)}`,
      `A ${r} ${r} 0 ${lg} 0 ${i2.x.toFixed(2)} ${i2.y.toFixed(2)}`,
      'Z',
    ].join(' ');
  }

  // Animated progress (0→1)
  let prog = 0;
  function startAnimation() {
    prog = 0;
    const start = performance.now();
    const duration = 900;
    function step(now) {
      const t = Math.min(1, (now - start) / duration);
      prog = easeOutQuart(t);
      if (t < 1) animFrame = requestAnimationFrame(step);
    }
    animFrame = requestAnimationFrame(step);
  }
  function easeOutQuart(t) { return 1 - Math.pow(1 - t, 4); }

  // Build arc segments for a two-part donut
  function makeArcs(valA, valB, colorA, colorB, p = prog) {
    const total = valA + valB;
    if (!total) return [];
    const degA = (valA / total) * 360 * p;
    const degB = (valB / total) * 360 * p;
    return [
      { path: arcPath(CX, CY, R, r, 0,    degA),         color: colorA, value: valA, total },
      { path: arcPath(CX, CY, R, r, degA, degA + degB),  color: colorB, value: valB, total },
    ];
  }

  $: mfArcs  = data ? makeArcs(data.male,  data.female, '#4fc3f7', '#f48fb1', prog) : [];
  $: ruArcs  = data ? makeArcs(data.rural, data.urban,  '#66bb6a', '#ffa726', prog) : [];
  $: mfPct   = data ? ((data.male / data.population) * 100).toFixed(1) : 0;
  $: ruPct   = data ? ((data.rural / data.population) * 100).toFixed(1) : 0;

  function fmt(n) {
    if (n >= 1e7)  return (n / 1e7).toFixed(2)  + ' Cr';
    if (n >= 1e5)  return (n / 1e5).toFixed(2)  + ' L';
    return n.toLocaleString('en-IN');
  }
  function fmtArea(n) { return n.toLocaleString('en-IN') + ' km²'; }

  function close() { selectedStateData.set(null); }
</script>

{#if visible && data}
  <!-- No backdrop — dialog floats on right, map stays interactive -->

  <!-- Dialog -->
  <div class="dialog" role="dialog" aria-modal="true">
    <!-- Header -->
    <div class="dlg-header">
      <div class="dlg-title-row">
        <h2 class="dlg-title">{data.name.replace(' (UT)', '')}</h2>
        <span class="badge" class:ut={data.isUT}>{data.isUT ? 'UT' : 'STATE'}</span>
      </div>
      <p class="dlg-sub">Census 2011 · India</p>
      <button class="close-btn" on:click={close} title="Close">✕</button>
    </div>

    <!-- Population share bar -->
    <div class="share-row">
      <span class="share-label">INDIA</span>
      <div class="share-track">
        <div class="share-fill" style="width:{data.percent * prog}%" />
      </div>
      <span class="share-pct">{(data.percent * prog).toFixed(2)}%</span>
    </div>

    <!-- Stats grid -->
    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-val">{fmt(data.population)}</span>
        <span class="stat-key">Population</span>
      </div>
      <div class="stat-card">
        <span class="stat-val">{data.density.toLocaleString()}</span>
        <span class="stat-key">Density /km²</span>
      </div>
      <div class="stat-card">
        <span class="stat-val">{data.sexRatio}</span>
        <span class="stat-key">Sex Ratio ♀/1000♂</span>
      </div>
      <div class="stat-card">
        <span class="stat-val">{fmtArea(data.area)}</span>
        <span class="stat-key">Area</span>
      </div>
    </div>

    <!-- Charts row -->
    <div class="charts-row">
      <!-- Male / Female donut -->
      <div class="chart-card">
        <p class="chart-title">GENDER SPLIT</p>
        <svg viewBox="0 0 {VIEW} {VIEW}" class="donut-svg">
          {#each mfArcs as seg}
            <path d={seg.path} fill={seg.color} class="arc-seg" />
          {/each}
          <!-- Centre label -->
          <text x={CX} y={CY - 5}  text-anchor="middle" class="donut-num">{mfPct}%</text>
          <text x={CX} y={CY + 12} text-anchor="middle" class="donut-sub">MALE</text>
        </svg>
        <div class="legend">
          <span class="leg-dot" style="background:#4fc3f7" /> <span>{fmt(data.male)} ♂</span>
          <span class="leg-dot" style="background:#f48fb1" /> <span>{fmt(data.female)} ♀</span>
        </div>
      </div>

      <!-- Rural / Urban donut -->
      <div class="chart-card">
        <p class="chart-title">RURAL / URBAN</p>
        <svg viewBox="0 0 {VIEW} {VIEW}" class="donut-svg">
          {#each ruArcs as seg}
            <path d={seg.path} fill={seg.color} class="arc-seg" />
          {/each}
          <text x={CX} y={CY - 5}  text-anchor="middle" class="donut-num">{ruPct}%</text>
          <text x={CX} y={CY + 12} text-anchor="middle" class="donut-sub">RURAL</text>
        </svg>
        <div class="legend">
          <span class="leg-dot" style="background:#66bb6a" /> <span>{fmt(data.rural)} Rural</span>
          <span class="leg-dot" style="background:#ffa726" /> <span>{fmt(data.urban)} Urban</span>
        </div>
      </div>
    </div>

    <!-- Density gauge bar -->
    <div class="density-section">
      <div class="density-header">
        <span class="slabel">POPULATION DENSITY</span>
        <span class="density-val">{data.density} / km²</span>
      </div>
      <div class="density-track">
        <div
          class="density-fill"
          style="
            width:{Math.min(100, (Math.log10(data.density + 1) / Math.log10(11297 + 1)) * 100 * prog)}%;
            background: hsl({Math.round((1 - Math.min(1,(Math.log10(data.density+1)/Math.log10(11298)))) * 120)},85%,52%);
          "
        />
      </div>
      <div class="density-scale">
        <span>Low (17)</span><span>High (11,297)</span>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(0,5,15,0.5);
    backdrop-filter: blur(3px);
    animation: fadeIn 0.2s ease;
  }
  .dialog {
    position: fixed;
    top: 50%;
    right: 210px;               /* sits left of the 200px panel */
    transform: translateY(-50%);
    z-index: 101;
    width: 350px;
    max-width: calc(100vw - 230px);
    max-height: 92vh;
    overflow-y: auto;
    background: rgba(4,14,28,0.97);
    border: 1px solid rgba(0,229,255,0.22);
    border-radius: 12px;
    backdrop-filter: blur(18px);
    padding: 18px 18px 16px;
    box-shadow: -6px 0 40px rgba(0,0,0,0.5), 0 0 60px rgba(0,229,255,0.06);
    font-family: 'IBM Plex Mono', monospace;
    color: #cef;
    animation: slideIn 0.28s cubic-bezier(0.34,1.56,0.64,1);
  }
  @keyframes fadeIn  { from { opacity:0 } to { opacity:1 } }
  @keyframes slideIn { from { opacity:0; transform:translateY(-50%) translateX(30px) } to { opacity:1; transform:translateY(-50%) translateX(0) } }

  /* Header */
  .dlg-header {
    position: relative;
    margin-bottom: 16px;
    padding-bottom: 14px;
    border-bottom: 1px solid rgba(0,229,255,0.12);
  }
  .dlg-title-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .dlg-title {
    margin: 0;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: #fff;
    line-height: 1.2;
  }
  .badge {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.15em;
    background: rgba(0,229,255,0.15);
    border: 1px solid rgba(0,229,255,0.35);
    color: #00e5ff;
    padding: 2px 7px;
    border-radius: 3px;
  }
  .badge.ut {
    background: rgba(255,214,0,0.12);
    border-color: rgba(255,214,0,0.4);
    color: #ffd600;
  }
  .dlg-sub {
    margin: 4px 0 0;
    font-size: 10px;
    color: #5a8a9a;
    letter-spacing: 0.1em;
  }
  .close-btn {
    position: absolute;
    top: 0; right: 0;
    background: none;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 50%;
    color: #7dd;
    width: 26px; height: 26px;
    cursor: pointer;
    font-size: 11px;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.15s, color 0.15s;
    font-family: inherit;
    padding: 0;
  }
  .close-btn:hover { background: rgba(255,60,60,0.15); color: #ff5555; }

  /* Share bar */
  .share-row {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 14px;
    overflow: hidden;
  }
  .share-label {
    font-size: 8px;
    letter-spacing: 0.18em;
    color: #5a8a9a;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .share-track {
    flex: 1;
    height: 5px;
    background: rgba(0,229,255,0.08);
    border-radius: 3px;
    overflow: hidden;
    min-width: 0;
  }
  .share-fill {
    height: 100%;
    background: linear-gradient(90deg, #0080ff, #00e5ff);
    border-radius: 3px;
    min-width: 2px;
    transition: width 0.05s;
    box-shadow: 0 0 8px #00e5ff55;
  }
  .share-pct {
    font-size: 10px;
    color: #00e5ff;
    font-weight: 600;
    flex-shrink: 0;
    min-width: 38px;
    text-align: right;
  }

  /* Stats grid */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(2,1fr);
    gap: 7px;
    margin-bottom: 14px;
  }
  .stat-card {
    background: rgba(0,229,255,0.05);
    border: 1px solid rgba(0,229,255,0.1);
    border-radius: 8px;
    padding: 10px 8px 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .stat-val {
    font-size: 13px;
    font-weight: 700;
    color: #fff;
    text-align: center;
    line-height: 1.2;
  }
  .stat-key {
    font-size: 7.5px;
    letter-spacing: 0.1em;
    color: #5a8a9a;
    text-align: center;
    line-height: 1.4;
  }

  /* Charts row */
  .charts-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 18px;
  }
  .chart-card {
    background: rgba(0,229,255,0.04);
    border: 1px solid rgba(0,229,255,0.09);
    border-radius: 10px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .chart-title {
    margin: 0;
    font-size: 8px;
    letter-spacing: 0.18em;
    color: #5a8a9a;
  }
  .donut-svg {
    width: 130px;
    height: 130px;
    overflow: visible;
    filter: drop-shadow(0 0 6px rgba(0,0,0,0.4));
  }
  .arc-seg {
    transition: opacity 0.2s;
  }
  .arc-seg:hover { opacity: 0.85; }
  .donut-num {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 14px;
    font-weight: 700;
    fill: #fff;
  }
  .donut-sub {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 8px;
    fill: #5a8a9a;
    letter-spacing: 0.15em;
  }
  .legend {
    display: flex;
    flex-direction: column;
    gap: 3px;
    width: 100%;
    font-size: 9px;
    color: #9bc;
  }
  .legend span { display: flex; align-items: center; gap: 5px; }
  .leg-dot {
    display: inline-block;
    width: 8px; height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  /* Density gauge */
  .density-section {
    border-top: 1px solid rgba(0,229,255,0.1);
    padding-top: 14px;
  }
  .density-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }
  .slabel {
    font-size: 8px;
    letter-spacing: 0.18em;
    color: #5a8a9a;
  }
  .density-val {
    font-size: 12px;
    font-weight: 700;
    color: #fff;
  }
  .density-track {
    height: 8px;
    background: rgba(255,255,255,0.06);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 4px;
  }
  .density-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.05s;
    box-shadow: 0 0 10px currentColor;
  }
  .density-scale {
    display: flex;
    justify-content: space-between;
    font-size: 7.5px;
    color: #3a5a6a;
  }
</style>
