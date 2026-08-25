// 3D scene geometry for the Well Design Studio cube view (WD5). Pure
// math, jest-tested: takes wells/targets/tops in the shared site frame
// (site-CRS easting/northing metres, TVDSS positive down) and builds
// normalized line-segment soups + label anchors for the WebGL2
// renderer. Model space follows the Seismolord cube convention
// (right-handed, y up): x = east, y = up (depth increases downward,
// so y = -depth), z = north. Everything is normalized so the largest
// horizontal extent is 1; the vertical carries the user's exaggeration.

import { computeWellPath, positionAtMd } from '../engine/surveyMath';
import { horizontalEllipse } from '../engine/errorModel';

const RING_SEGS = 36;
const CIRCLE_SEGS = 48;

/** Push a polyline as line segments into out (flat xyz pairs). */
function pushPolyline(out, pts) {
  for (let i = 1; i < pts.length; i++) {
    out.push(pts[i - 1][0], pts[i - 1][1], pts[i - 1][2],
      pts[i][0], pts[i][1], pts[i][2]);
  }
}

/**
 * Build the 3D scene.
 *
 * wells: [{id, label, color, stations (grid metres), headX, headY,
 *   kbElevM, cov?, kind: 'plan'|'actual'|'offset'}] — cov aligned 1:1
 *   with stations enables EOU rings.
 * targets: wp_targets rows (site coords + tvdss_m + kind/geometry).
 * tops: [{wellId, name, mdM, color?}] — markers on that well's path.
 * options: {vexag, eouK, eouEvery, padFrac}.
 *
 * Returns {ext: {X, D, Z}, world: {minE, minN, minT, scale, vexag},
 *   wells: [{id, label, color, kind, positions: Float32Array}],
 *   eouRings: [{wellId, color, positions}],
 *   targets: [{id, color, positions}],
 *   tops: [{wellId, name, color, positions, anchor}],
 *   axes: {edges: Float32Array, ticks: [{pos, text, axis}]},
 *   northArrow: {positions: Float32Array, anchor},
 *   labels: [{pos, text, color, kind}]}.
 */
export function buildScene({
  wells = [], targets = [], tops = [],
} = {}, {
  vexag = 1, eouK = 2, eouEvery = 6, padFrac = 0.06,
} = {}) {
  // ---- world paths + bounds ----------------------------------------------
  const paths = new Map(); // wellId -> {stations, path (world e/n/tvdss)}
  let minE = Infinity; let maxE = -Infinity;
  let minN = Infinity; let maxN = -Infinity;
  let minT = Infinity; let maxT = -Infinity;
  const seen = (e, n, t) => {
    if (e < minE) minE = e; if (e > maxE) maxE = e;
    if (n < minN) minN = n; if (n > maxN) maxN = n;
    if (t < minT) minT = t; if (t > maxT) maxT = t;
  };

  for (const w of wells) {
    if (!Array.isArray(w.stations) || w.stations.length < 2) continue;
    const path = computeWellPath(w.stations, {
      surfaceX: w.headX ?? 0, surfaceY: w.headY ?? 0, kb: w.kbElevM ?? 0,
    });
    paths.set(w.id, { stations: w.stations, path });
    for (const p of path) seen(p.x, p.y, p.tvdss);
  }
  for (const t of targets) {
    if (!Number.isFinite(t.center_x) || !Number.isFinite(t.tvdss_m)) continue;
    const r = t.geometry?.radius_m || t.geometry?.semi_major_m || 0;
    seen(t.center_x - r, t.center_y - r, t.tvdss_m);
    seen(t.center_x + r, t.center_y + r, t.tvdss_m);
    for (const [px, py] of (t.geometry?.points || [])) seen(px, py, t.tvdss_m);
  }
  if (!Number.isFinite(minE)) return null;

  // pad the box so wells don't touch the frame
  const spanE = Math.max(maxE - minE, 1);
  const spanN = Math.max(maxN - minN, 1);
  const spanT = Math.max(maxT - minT, 1);
  minE -= spanE * padFrac; maxE += spanE * padFrac;
  minN -= spanN * padFrac; maxN += spanN * padFrac;
  minT -= spanT * padFrac; maxT += spanT * padFrac;

  const scale = Math.max(maxE - minE, maxN - minN);
  const world = { minE, minN, minT, scale, vexag };
  const toModel = (e, n, t) => [
    (e - minE) / scale,
    -((t - minT) / scale) * vexag,
    (n - minN) / scale,
  ];
  const ext = {
    X: (maxE - minE) / scale,
    D: ((maxT - minT) / scale) * vexag,
    Z: (maxN - minN) / scale,
  };

  // ---- wells --------------------------------------------------------------
  const outWells = [];
  const outRings = [];
  const outTops = [];
  const labels = [];
  for (const w of wells) {
    const entry = paths.get(w.id);
    if (!entry) continue;
    const pts = entry.path.map((p) => toModel(p.x, p.y, p.tvdss));
    const seg = [];
    pushPolyline(seg, pts);
    outWells.push({
      id: w.id, label: w.label, color: w.color, kind: w.kind || 'plan',
      positions: new Float32Array(seg),
    });
    labels.push({
      pos: pts[0], text: w.label, color: w.color, kind: 'wellhead',
    });
    labels.push({
      pos: pts[pts.length - 1],
      text: `TD ${entry.stations[entry.stations.length - 1].md.toFixed(0)}m`,
      color: w.color,
      kind: 'td',
    });

    // EOU rings: horizontal 2σ ellipse at sampled stations
    if (Array.isArray(w.cov) && w.cov.length === entry.path.length) {
      const ringSeg = [];
      for (let i = 0; i < entry.path.length; i++) {
        if (i !== entry.path.length - 1 && (i === 0 || i % eouEvery !== 0)) continue;
        const ell = horizontalEllipse(w.cov[i], { k: eouK });
        if (!(ell.semiMajor > 0.01)) continue;
        const az = (ell.azimuthDeg * Math.PI) / 180;
        const p = entry.path[i];
        const ring = [];
        for (let s = 0; s <= RING_SEGS; s++) {
          const th = (s / RING_SEGS) * 2 * Math.PI;
          // ellipse local frame: u along major axis (bearing az), v minor
          const u = ell.semiMajor * Math.cos(th);
          const v = ell.semiMinor * Math.sin(th);
          const dn = u * Math.cos(az) - v * Math.sin(az);
          const de = u * Math.sin(az) + v * Math.cos(az);
          ring.push(toModel(p.x + de, p.y + dn, p.tvdss));
        }
        pushPolyline(ringSeg, ring);
      }
      if (ringSeg.length) {
        outRings.push({
          wellId: w.id, color: w.color, positions: new Float32Array(ringSeg),
        });
      }
    }
  }

  // ---- tops (markers on their well's path) --------------------------------
  for (const t of tops) {
    const entry = paths.get(t.wellId);
    if (!entry || !Number.isFinite(t.mdM)) continue;
    const pos = positionAtMd(entry.stations, entry.path, t.mdM);
    if (!pos) continue;
    const r = scale * 0.012;
    const ring = [];
    for (let s = 0; s <= RING_SEGS; s++) {
      const th = (s / RING_SEGS) * 2 * Math.PI;
      ring.push(toModel(pos.x + r * Math.cos(th), pos.y + r * Math.sin(th), pos.tvdss));
    }
    const seg = [];
    pushPolyline(seg, ring);
    const anchor = toModel(pos.x + r, pos.y, pos.tvdss);
    outTops.push({
      wellId: t.wellId, name: t.name, color: t.color || '#e879f9',
      positions: new Float32Array(seg), anchor,
    });
    labels.push({ pos: anchor, text: t.name, color: t.color || '#e879f9', kind: 'top' });
  }

  // ---- targets -------------------------------------------------------------
  const outTargets = [];
  for (const t of targets) {
    if (!Number.isFinite(t.center_x) || !Number.isFinite(t.tvdss_m)) continue;
    const seg = [];
    const g = t.geometry || {};
    const center = toModel(t.center_x, t.center_y, t.tvdss_m);
    if (t.kind === 'polygon' && Array.isArray(g.points) && g.points.length >= 3) {
      const ring = g.points.map(([px, py]) => toModel(px, py, t.tvdss_m));
      ring.push(ring[0]);
      pushPolyline(seg, ring);
    } else if ((t.kind === 'circle' || t.kind === 'ellipse') && (g.radius_m || g.semi_major_m)) {
      const a = g.semi_major_m || g.radius_m;
      const b = g.semi_minor_m || g.radius_m || a;
      const rot = ((g.rotation_deg || 0) * Math.PI) / 180;
      const ring = [];
      for (let s = 0; s <= CIRCLE_SEGS; s++) {
        const th = (s / CIRCLE_SEGS) * 2 * Math.PI;
        const u = a * Math.cos(th);
        const v = b * Math.sin(th);
        const dn = u * Math.cos(rot) - v * Math.sin(rot);
        const de = u * Math.sin(rot) + v * Math.cos(rot);
        ring.push(toModel(t.center_x + de, t.center_y + dn, t.tvdss_m));
      }
      pushPolyline(seg, ring);
    } else {
      // point target: 3-axis cross
      const h = scale * 0.015;
      pushPolyline(seg, [toModel(t.center_x - h, t.center_y, t.tvdss_m), toModel(t.center_x + h, t.center_y, t.tvdss_m)]);
      pushPolyline(seg, [toModel(t.center_x, t.center_y - h, t.tvdss_m), toModel(t.center_x, t.center_y + h, t.tvdss_m)]);
    }
    outTargets.push({
      id: t.id, color: t.color || '#d97706', positions: new Float32Array(seg),
    });
    labels.push({ pos: center, text: t.name, color: t.color || '#d97706', kind: 'target' });
  }

  // ---- axes box + ticks ----------------------------------------------------
  const { X, D, Z } = ext;
  const corners = [
    [0, 0, 0], [X, 0, 0], [X, 0, Z], [0, 0, Z],
    [0, -D, 0], [X, -D, 0], [X, -D, Z], [0, -D, Z],
  ];
  const edgePairs = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const edges = [];
  for (const [a, b] of edgePairs) {
    edges.push(...corners[a], ...corners[b]);
  }
  const ticks = [];
  for (const e of niceTicksLocal(minE, maxE)) {
    ticks.push({ pos: toModel(e, minN, minT), text: e.toFixed(0), axis: 'E' });
  }
  for (const n of niceTicksLocal(minN, maxN)) {
    ticks.push({ pos: toModel(minE, n, minT), text: n.toFixed(0), axis: 'N' });
  }
  for (const t of niceTicksLocal(minT, maxT)) {
    ticks.push({ pos: toModel(minE, minN, t), text: t.toFixed(0), axis: 'TVDSS' });
  }

  // ---- north arrow (top face, near the +N/+E corner) -----------------------
  const naBase = [X * 0.94, 0.02, Z * 0.86];
  const naLen = 0.08;
  const northArrowSeg = [];
  pushPolyline(northArrowSeg, [naBase, [naBase[0], naBase[1], naBase[2] + naLen]]);
  pushPolyline(northArrowSeg, [
    [naBase[0] - 0.015, naBase[1], naBase[2] + naLen * 0.7],
    [naBase[0], naBase[1], naBase[2] + naLen],
  ]);
  pushPolyline(northArrowSeg, [
    [naBase[0] + 0.015, naBase[1], naBase[2] + naLen * 0.7],
    [naBase[0], naBase[1], naBase[2] + naLen],
  ]);

  return {
    ext,
    world,
    wells: outWells,
    eouRings: outRings,
    targets: outTargets,
    tops: outTops,
    axes: { edges: new Float32Array(edges), ticks },
    northArrow: {
      positions: new Float32Array(northArrowSeg),
      anchor: [naBase[0], naBase[1], naBase[2] + naLen],
    },
    labels,
  };
}

/** ~5 nice tick values inside [min, max]. */
function niceTicksLocal(min, max, n = 5) {
  if (!(max > min)) return [min];
  const raw = (max - min) / Math.max(n - 1, 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2.5 ? 5 : norm >= 1.5 ? 2 : 1) * mag;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) {
    out.push(Number(v.toPrecision(12)));
  }
  return out.length ? out : [min];
}
