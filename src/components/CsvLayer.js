// CsvLayer.js — CSV temporal parser + reactive entity visibility toggle
import * as Cesium from 'cesium';
import { csvRows, activeRows } from '../stores/mapStore.js';
import { plotPin } from './CityPins.js';

// ── CSV format: lon,lat,date,time,class[,name,description] ───────────────────
// date: YYYY-MM-DD   time: HH:MM:SS (UTC)
// class: 'default' | 'danger' | 'target' | 'friendly'

/**
 * parseCSV — Parses raw CSV text, plots entities (hidden), updates csvRows store.
 * @param {Cesium.Viewer} viewer
 * @param {string} rawText
 */
export function parseCSV(viewer, rawText) {
  const lines = rawText.trim().split('\n');
  const header = lines[0].toLowerCase();              // detect column order
  const hasHeader = /lon|lat|date/.test(header);

  const rows = (hasHeader ? lines.slice(1) : lines).map(line => {
    const [lon, lat, date, time = '00:00:00', cls = 'default', name = '', ...rest] =
      line.split(',').map(s => s.trim());

    const ts = Date.parse(`${date}T${time}Z`);        // → Unix ms (NaN if bad row)
    if (isNaN(ts)) return null;

    const entity = plotPin(viewer, {
      lon: +lon, lat: +lat, alt: 0,
      name: name || cls,
      pinClass: cls,
      timeframe: `${date} ${time}`,
      description: rest.join(', '),
    });
    entity.show = false;                              // hidden until slider reveals it

    return { lon: +lon, lat: +lat, ts, cls, entity };
  }).filter(Boolean);

  csvRows.set(rows);
}

/**
 * applyTimelineFilter — subscribes to activeRows; toggles entity.show.
 * Returns an unsubscribe function.
 * @param {Cesium.Viewer} _viewer   (unused but kept for API symmetry)
 * @returns {() => void}
 */
export function applyTimelineFilter(_viewer) {
  let prevVisible = new Set();

  return activeRows.subscribe(active => {
    const nextVisible = new Set(active.map(r => r.entity));

    // Hide entities that scrolled out of window
    for (const ent of prevVisible) {
      if (!nextVisible.has(ent)) ent.show = false;
    }
    // Reveal newly included entities
    for (const ent of nextVisible) {
      ent.show = true;
    }

    prevVisible = nextVisible;
  });
}

// ── Timeline bounds helper ────────────────────────────────────────────────────
/**
 * Returns [minTs, maxTs] from the parsed rows array for slider min/max.
 * Falls back to a 24-hour window around now if no data loaded.
 * @param {Array<{ts:number}>} rows
 * @returns {[number, number]}
 */
export function getTimelineBounds(rows) {
  if (!rows.length) {
    const now = Date.now();
    return [now - 864e5, now];                         // last 24 h
  }
  const ts = rows.map(r => r.ts);
  return [Math.min(...ts), Math.max(...ts)];
}
