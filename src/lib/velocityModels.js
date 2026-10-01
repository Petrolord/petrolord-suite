// Seismolord velocity models for the other apps (Seismolord U2-006): the
// read-only contract Mapping & Surface Studio (time-to-depth) and Pore
// Pressure Studio (seismic velocity trend) import. No schema change.
//
// Where a model lives: since W0.2 a volume's velocity model is stored on
// its seismic_volumes row (velocity_model, velocity_calibration), and the
// manifest's copy is only the pre-W0.2 fallback (row authoritative once
// interp_rev > 0). Readers that took manifest.velocity alone missed every
// model saved after W0.2; volumeVelocity is the one resolution.
//
// Layer cakes, published: a layer cake's boundaries are Seismolord
// horizons (picks on the seismic lattice). They reach the other apps as
// the time surfaces Seismolord publishes to the registry (Make surface in
// TWT; provenance.horizon.id names the horizon). resolveLayerCake finds
// each boundary's newest published time surface; a boundary with none is
// named, never skipped, because a missing boundary would move every depth
// below it. Then the boundaries go onto the reader's frame (Mapping) or
// are sampled at one place (Pore Pressure at a well).

import {
  normalizeVelocity, layercakeDepthM, describeVelocity,
} from '@/pages/apps/Seismolord/engine/velocityModel';
import { resampleTo, sampleAtXY, isNull } from '@/lib/gridding/gridmath';
import { surfaceTimeToPositiveMs } from '@/lib/surfaceConvention';

const NULL_F32 = Math.fround(1.0e30);

/** The velocity model of a volume row, with the manifest as the pre-W0.2 fallback. */
export function volumeVelocity(row, manifest) {
  if (row && Number(row.interp_rev) > 0) {
    return { velocity: row.velocity_model || null, calibration: row.velocity_model ? row.velocity_calibration || null : null };
  }
  return {
    velocity: row?.velocity_model || manifest?.velocity || null,
    calibration: row?.velocity_model ? row.velocity_calibration || null : manifest?.velocity_calibration || null,
  };
}

/**
 * A picker entry for one volume's model, or null when it has none.
 * @returns {?{id, name, kind: 'linear'|'layercake', velocity: Object,
 *   model: Object, calibration: ?Object, boundaries: {layer: number, horizonId: ?string}[], crs: ?string}}
 */
export function velocityEntryFor(row, manifest) {
  const { velocity, calibration } = volumeVelocity(row, manifest);
  const m = normalizeVelocity(velocity);
  if (!m) return null;
  return {
    id: row.id,
    name: row.name || row.file_name || row.id,
    kind: m.kind,
    velocity,
    model: m,
    calibration,
    crs: row.crs || null,
    boundaries: m.kind === 'layercake'
      ? m.layers.slice(0, -1).map((l, i) => ({ layer: i, horizonId: l.baseHorizonId }))
      : [],
    label: describeVelocity(m),
  };
}

/** Every volume's model the caller can read (attribute volumes carry none). */
export async function listPublishedVelocityModels({ listVolumes, getManifest }) {
  const out = [];
  let volumes = [];
  try { volumes = await listVolumes(); } catch { return out; }
  for (const v of volumes) {
    if (v.kind === 'attribute') continue;
    let manifest = null;
    if (!(Number(v.interp_rev) > 0) || !v.velocity_model) {
      // eslint-disable-next-line no-await-in-loop
      try { manifest = await getManifest(v); } catch { manifest = null; }
    }
    const e = velocityEntryFor(v, manifest);
    if (e) out.push(e);
  }
  return out;
}

/** The newest registry time surface Seismolord published from a horizon. */
export function boundarySurfaceFor(surfaces, horizonId) {
  if (!horizonId) return null;
  const rows = (surfaces || []).filter((s) => s?.provenance?.app === 'seismolord'
    && s?.provenance?.horizon?.id === horizonId && s.z_domain === 'time');
  rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  return rows[0] || null;
}

/**
 * Resolve a layer cake's boundaries to published time surfaces.
 * @param {Object} entry velocityEntryFor result
 * @param {{surfaces: Array, downloadGrid: (row) => Promise<ArrayLike<number>>, horizonName?: (id) => ?string}} ctx
 * @returns {Promise<{ok: true, boundaries: {layer, horizonId, row, twtMs: Float32Array, spec: Object}[]}|{ok: false, reason: string, missing: string[]}>}
 */
export async function resolveLayerCake(entry, { surfaces, downloadGrid }) {
  if (!entry || entry.kind !== 'layercake') return { ok: false, reason: 'Not a layer-cake velocity model.', missing: [] };
  const missing = [];
  const found = [];
  for (const b of entry.boundaries) {
    const row = boundarySurfaceFor(surfaces, b.horizonId);
    if (!row) missing.push(b.horizonId ? `layer ${b.layer + 1} base (horizon ${b.horizonId.slice(0, 8)})` : `layer ${b.layer + 1} base (no horizon chosen)`);
    else found.push({ ...b, row });
  }
  if (missing.length) {
    return {
      ok: false,
      missing,
      reason: `The layer cake on ${entry.name} needs every layer boundary published as a time surface; ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not. In Seismolord open the velocity model and press Publish boundaries (or Make surface in TWT on each boundary horizon).`,
    };
  }
  const boundaries = [];
  for (const f of found) {
    // eslint-disable-next-line no-await-in-loop
    const grid = await downloadGrid(f.row);
    boundaries.push({
      ...f,
      twtMs: surfaceTimeToPositiveMs(Float32Array.from(grid)),
      spec: {
        x0: f.row.origin_x, y0: f.row.origin_y, dx: f.row.dx, dy: f.row.dy, nx: f.row.nx, ny: f.row.ny,
        ...(f.row.rotation_deg ? { rotation_deg: f.row.rotation_deg } : {}),
      },
    });
  }
  return { ok: true, boundaries };
}

/** The resolved boundaries resampled onto a frame (Mapping's time surface). */
export function boundariesOnSpec(resolved, spec) {
  return resolved.boundaries.map((b) => resampleTo(b.twtMs, b.spec, spec));
}

/** The boundary times at one place (null where a boundary has no value there). */
export function boundariesAt(resolved, x, y) {
  return resolved.boundaries.map((b) => {
    const v = sampleAtXY(b.twtMs, b.spec, x, y);
    return isNull(v) || v === NULL_F32 ? null : v;
  });
}

/**
 * Pseudo-sonic from a layer cake at one column (Pore Pressure's trend
 * input, the shape of its pseudoSonicFromLinearVelocity): within layer i
 * the instantaneous velocity is v0_i + k_i (z - zTop_i), the layer tops
 * taken from Seismolord's layercakeDepthM at the boundary times.
 * @param {Object} model layer-cake model (any accepted shape)
 * @param {(number|null)[]} boundaryTwtMs base TWT of layers 0..n-2 at the column
 * @param {{datumToMudlineM: number, zMaxM: number, stepM: number}} grid
 * @returns {{zBmlM: number[], dtUsPerM: number[], rhoKgM3: null, layerTopsM: number[]}}
 */
export function layerCakeProfile(model, boundaryTwtMs, { datumToMudlineM, zMaxM, stepM }) {
  const m = normalizeVelocity(model);
  if (!m || m.kind !== 'layercake') throw new Error('Not a layer-cake velocity model.');
  if (!(datumToMudlineM >= 0)) throw new Error('Datum-to-mudline offset must be >= 0.');
  if (!(zMaxM > 0) || !(stepM > 0)) throw new Error('Grid needs zMax > 0 and step > 0.');
  const layers = m.layers;
  // the same walk as layercakeDepthM: layer i runs to the first boundary
  // defined at or below it; layers whose boundary is missing here merge
  // into the one above (zero thickness), crossing picks clamp
  const segs = [];
  let tTop = 0;
  let zTop = 0;
  for (let i = 0; i < layers.length;) {
    let tBase = Infinity;
    let next = layers.length;
    for (let b = i; b < layers.length - 1; b++) {
      const v = boundaryTwtMs[b];
      if (v != null && Number.isFinite(v) && Math.abs(v) < 1e29) { tBase = v; next = b + 1; break; }
    }
    const base = Math.max(tBase, tTop);
    const zBase = Number.isFinite(base) ? layercakeDepthM(layers, boundaryTwtMs, base) : Infinity;
    segs.push({ layer: i, zTop, zBase });
    zTop = zBase;
    tTop = base;
    i = next;
  }
  const tops = segs.map((g) => g.zTop);
  const n = Math.floor(zMaxM / stepM) + 1;
  const zBmlM = new Array(n);
  const dtUsPerM = new Array(n);
  for (let s = 0; s < n; s++) {
    const zb = s * stepM;
    const z = datumToMudlineM + zb;
    const g = segs.find((q) => z < q.zBase) || segs[segs.length - 1];
    const l = layers[g.layer];
    const v = l.v0 + l.k * (z - g.zTop);
    if (!(v > 0)) throw new Error(`Layer ${g.layer + 1} velocity goes non-positive at ${z.toFixed(0)} m (k < 0).`);
    zBmlM[s] = zb;
    dtUsPerM[s] = 1e6 / v;
  }
  return {
    zBmlM, dtUsPerM, rhoKgM3: null, layerTopsM: tops,
  };
}
