import { writable, derived } from 'svelte/store';

export const layerMode    = writable('auto');
export const viewMode     = writable('globe');
export const cameraHeight = writable(Infinity);
export const effectiveLayer = derived(
  [layerMode, cameraHeight],
  ([$m, $h]) => $m !== 'auto' ? $m : ($h > 800_000 ? 'topo' : 'sat')
);
export const spyMode    = writable(false);
export const maskShape  = writable('circle');
export const maskRadius = writable(120);
export const controlPoints   = writable([]);
export const splinePositions = writable([]);
export const playbackState   = writable('idle');
export const playbackT       = writable(0);
export const cameraMode      = writable('free');
export const timelineValue   = writable(Date.now());
export const csvRows         = writable([]);
export const activeRows      = derived(
  [csvRows, timelineValue], ([$r, $t]) => $r.filter(r => r.ts <= $t)
);
export const selectedEntity    = writable(null);
export const manualPinMode     = writable(false);
export const manualPins        = writable([]);
export const selectedManualPin = writable(null);
export const graticuleVisible  = writable(false);
export const sunlightVisible   = writable(false);
export const droneAddMode      = writable(false);
export const trailMode         = writable(false);  // ON = hide path ahead of drone
export const droneSatMode      = writable(false);  // spy circle follows drone, not mouse
export const trailVisible      = writable(true);   // show/hide trail polyline
export const spyAnchorPos      = writable(null);   // {x,y} screen pos override for spy circle

// ── India Data Layer ──────────────────────────────────────────────────────────
export const bubbleMapVisible  = writable(false);  // population density choropleth + bubbles
export const stateDataVisible  = writable(false);  // clickable state capital pins
export const selectedStateData = writable(null);   // state data object for dialog
