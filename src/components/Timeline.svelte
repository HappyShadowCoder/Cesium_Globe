<script>
// Timeline.svelte — Bottom slider driving timelineValue store
import { derived } from 'svelte/store';
import { csvRows, timelineValue, activeRows } from '../stores/mapStore.js';
import { getTimelineBounds } from './CsvLayer.js';

const bounds = derived(csvRows, $r => getTimelineBounds($r));

function fmt(ts) {
  if (!ts) return '--';
  return new Date(ts).toUTCString().slice(0, 25);
}
</script>

<div class="bar">
  <span class="lbl">{fmt($bounds[0])}</span>

  <input
    type="range"
    min={$bounds[0]}
    max={$bounds[1]}
    step={60_000}
    bind:value={$timelineValue}
    class="slider"
  />

  <span class="lbl">{fmt($timelineValue)}</span>
  <span class="count">{$activeRows.length} pts</span>
</div>

<style>
.bar {
  position:fixed; bottom:0; left:0; right:0; z-index:20;
  display:flex; align-items:center; gap:12px; padding:8px 16px;
  background:rgba(5,10,20,0.88); backdrop-filter:blur(8px);
  border-top:1px solid rgba(0,229,255,0.18);
  font-family:'IBM Plex Mono', monospace; font-size:11px; color:#aee;
}
.slider { flex:1; accent-color:#00e5ff; height:4px; }
.count  { color:#00e5ff; min-width:52px; text-align:right; }
</style>
