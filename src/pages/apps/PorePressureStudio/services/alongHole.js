// A layer cake read along the hole, with the seismic datum declared
// (AppUpgrade PP-U2-008, fixes PP-U1-027). Before, the layer boundaries were
// sampled at the well's surface location and the model's datum was taken
// as sea level. A deviated well crosses each boundary away from the
// wellhead, where a dipping boundary sits at another time; and a survey
// processed to a seismic reference datum (SRD) above sea level, or an
// onshore well whose ground is not at sea level, puts the mudline at
// another depth below the model's datum. Pure.

/**
 * Depth of the mudline (or ground) below the seismic datum.
 * @param {{waterDepthM?: number, mudlineMdM?: number, seismicDatumElevM?: number}} params
 * @param {{kbM?: ?number}} ctx kbM: KB elevation above sea level
 * @returns {{value: number, mudlineElevM: number, note: ?string}}
 */
export function datumToMudline(params = {}, { kbM = null } = {}) {
  const wd = Number(params.waterDepthM) || 0;
  const srd = Number(params.seismicDatumElevM) || 0;
  const ml = Number(params.mudlineMdM) || 0;
  let mudlineElevM; let note = null;
  if (wd > 0) mudlineElevM = -wd;
  else if (Number.isFinite(kbM) && ml > 0) mudlineElevM = kbM - ml; // onshore: ground below the KB by the mudline MD
  else {
    mudlineElevM = 0;
    note = 'Onshore with no KB and mudline MD: the ground is taken at sea level.';
  }
  if (!srd) note = [note, 'The seismic datum is taken at sea level (SRD 0 m); set it in Parameters if the survey was processed to another datum.'].filter(Boolean).join(' ');
  return { value: srd - mudlineElevM, mudlineElevM, note };
}

/**
 * Boundary times where the hole crosses each boundary: start at the
 * wellhead, place each boundary at its depth, move to where the hole is at
 * that depth, read the time there, and repeat until the times settle.
 * @param {{sampleAt: (x: number, y: number) => (number|null)[], depthsBelowDatum: (times: (number|null)[]) => number[],
 *   xyAtDepthBelowDatum: (z: number) => ?{x: number, y: number}, surface: {x: number, y: number}, maxIter?: number, tolMs?: number}} a
 * @returns {{boundaryTwtMs: (number|null)[], positions: ({x, y}|null)[], iterations: number, converged: boolean, offWell: number[]}}
 */
export function boundariesAlongHole({ sampleAt, depthsBelowDatum, xyAtDepthBelowDatum, surface, maxIter = 12, tolMs = 0.01 }) {
  let times = sampleAt(surface.x, surface.y);
  const n = times.length;
  let positions = new Array(n).fill(surface);
  let it = 0; let converged = false;
  const offWell = [];
  for (; it < maxIter; it++) {
    const z = depthsBelowDatum(times);
    const next = []; const pos = [];
    for (let i = 0; i < n; i++) {
      const p = Number.isFinite(z[i]) ? xyAtDepthBelowDatum(z[i]) : null;
      if (!p) { next.push(times[i]); pos.push(positions[i]); if (it === 0) offWell.push(i); continue; }
      const t = sampleAt(p.x, p.y)[i];
      next.push(t == null ? times[i] : t);
      pos.push(p);
    }
    const moved = Math.max(0, ...next.map((t, i) => (t == null || times[i] == null ? 0 : Math.abs(t - times[i]))));
    times = next; positions = pos;
    if (moved < tolMs) { converged = true; it += 1; break; }
  }
  return { boundaryTwtMs: times, positions, iterations: it, converged, offWell };
}

/**
 * The layer cake's boundary times along one well: the surface location
 * (in the boundaries' CRS) plus the survey's offsets at each crossing.
 * @param {{sampleAt: (x, y) => (number|null)[], layers: {v0, k}[], layercakeDepthM: Function,
 *   surface: {x: number, y: number}, frame: ?{tvdssToMd: Function, mdToPosition: Function}, srdElevM?: number}} a
 * @returns {{boundaryTwtMs: (number|null)[], note: string, alongHole: boolean}}
 */
export function layerCakeAlongWell({ sampleAt, layers, layercakeDepthM, surface, frame, srdElevM = 0 }) {
  const depthsBelowDatum = (t) => t.map((v) => (v == null ? NaN : layercakeDepthM(layers, t, v)));
  if (!frame) {
    return { boundaryTwtMs: sampleAt(surface.x, surface.y), alongHole: false, note: 'Boundaries read at the wellhead (no deviation survey: a vertical well).' };
  }
  const xyAt = (zBelowDatum) => {
    const hit = frame.tvdssToMd(zBelowDatum - srdElevM);
    if (!hit) return null;
    const p = frame.mdToPosition(hit.md);
    return { x: surface.x + p.x, y: surface.y + p.y };
  };
  const r = boundariesAlongHole({ sampleAt, depthsBelowDatum, xyAtDepthBelowDatum: xyAt, surface });
  const off = r.positions.map((p) => (p ? Math.hypot(p.x - surface.x, p.y - surface.y) : 0));
  return {
    boundaryTwtMs: r.boundaryTwtMs,
    alongHole: true,
    note: `Boundaries read where the hole crosses them (up to ${Math.round(Math.max(0, ...off))} m from the wellhead${r.converged ? '' : '; the crossing did not settle, the last reading is used'}).`,
  };
}
