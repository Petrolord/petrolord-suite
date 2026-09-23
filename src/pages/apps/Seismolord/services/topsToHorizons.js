// Tops to Horizons, main-thread side: gathering what the worker needs
// (wells in the pipeline's shape, their sonic and density logs for the
// automatic tie, the stratigraphic order from the column) and saving what
// the interpreter accepts (named horizons, automatic faults). Nothing is
// saved without Accept; every saved object records how it was made in
// its params, so it can be audited and undone.

import { guessCurveKind } from '@/pages/apps/WellDataManager/engine/lasImport';
import { effectiveCheckshots } from './wellsService';

/**
 * Wells in the pipeline's shape (placed, CRS-converted viewer wells).
 * @param {Array} wells viewer wells {id, name, surfaceX, surfaceY, kbM,
 *   tops, checkshots, checkshots_derived, deviation, path}
 * @param {Map<string, ?Object>} [logsByWell] wellId -> {md, dtUsPerM, rho}
 */
export function pipelineWells(wells, logsByWell = new Map()) {
  return wells.map((w) => {
    const eff = effectiveCheckshots(w);
    const td = w.path && w.path.length ? w.path[w.path.length - 1].md : null;
    return {
      id: w.id,
      name: w.name,
      surfaceX: w.surfaceX,
      surfaceY: w.surfaceY,
      kbM: w.kbM || 0,
      tdMdM: td,
      deviation: w.deviation || [],
      tops: (w.tops || []).map((t) => ({ name: t.name, md: t.md })),
      checkshots: eff.rows,
      checkshotsDerived: eff.derived,
      logs: logsByWell.get(w.id) || null,
    };
  });
}

/**
 * Sonic (and density) logs for the automatic tie, in SI: the first curve
 * of each kind by mnemonic, on its regular MD grid or its depth curve.
 * A well without a sonic gets null (it is matched through its checkshots
 * or the velocity model, with a wider uncertainty).
 *
 * @param {Array} wells viewer wells
 * @param {{listLogs: Function, downloadCurve: Function}} io
 * @returns {Promise<Map<string, ?{md: Float64Array, dtUsPerM: Float32Array, rho: ?Float32Array}>>}
 */
export async function loadTieLogs(wells, { listLogs, downloadCurve }) {
  const out = new Map();
  for (const w of wells) {
    try {
      const logs = await listLogs(w.id);
      const kind = (l) => guessCurveKind(l.mnemonic);
      const sonic = logs.find((l) => kind(l) === 'sonic');
      if (!sonic) { out.set(w.id, null); continue; }
      const density = logs.find((l) => kind(l) === 'density') || null;
      const dt = await downloadCurve(sonic);
      const rhoAll = density ? await downloadCurve(density) : null;
      let md;
      if (sonic.step_m != null) {
        md = new Float64Array(dt.length);
        for (let i = 0; i < md.length; i++) md[i] = sonic.start_md_m + i * sonic.step_m;
      } else {
        const depth = logs.find((l) => kind(l) === 'depth');
        if (!depth) { out.set(w.id, null); continue; }
        md = Float64Array.from(await downloadCurve(depth));
      }
      // density on the sonic's grid only when it shares it (same length and start)
      const rho = rhoAll && rhoAll.length === dt.length
        && (density.start_md_m ?? null) === (sonic.start_md_m ?? null) ? rhoAll : null;
      out.set(w.id, { md, dtUsPerM: dt, rho });
    } catch {
      out.set(w.id, null);
    }
  }
  return out;
}

/**
 * The field's stratigraphic order of top names: by the column (tops whose
 * unit is in the ordered column come in column order), the rest by their
 * mean MD across the wells. Null when there is nothing to order.
 *
 * @param {Array} wells viewer wells (tops may carry unitId)
 * @param {Array} [orderedUnits] stratigraphy orderedUnits(units)
 */
export function fieldTopOrder(wells, orderedUnits = []) {
  const rankOfUnit = new Map(orderedUnits.map((u, i) => [u.id, i]));
  const stats = new Map();
  for (const w of wells) {
    for (const t of w.tops || []) {
      const s = stats.get(t.name) || { sum: 0, n: 0, unitRank: null };
      s.sum += t.md; s.n += 1;
      if (t.unitId && rankOfUnit.has(t.unitId)) s.unitRank = rankOfUnit.get(t.unitId);
      stats.set(t.name, s);
    }
  }
  if (!stats.size) return null;
  return [...stats.entries()].sort((a, b) => {
    const ra = a[1].unitRank;
    const rb = b[1].unitRank;
    if (ra != null && rb != null && ra !== rb) return ra - rb;
    return a[1].sum / a[1].n - b[1].sum / b[1].n;
  }).map(([name]) => name);
}

/** A name not already taken: "TOP_A", then "TOP_A (2)", ... */
export function freeName(name, taken) {
  if (!taken.has(name)) return name;
  let k = 2;
  while (taken.has(`${name} (${k})`)) k += 1;
  return `${name} (${k})`;
}

/**
 * Save the accepted framework: one horizon per top, named after it, with
 * its provenance in params (source 'well_tops', the top, its role, event
 * kind, seeds with their scores, fault jumps, the tie convention and the
 * leave-one-well-out error).
 *
 * @param {Object} p
 * @param {Object} p.volume @param {number} p.dtUs
 * @param {Array} p.horizons runFrameworkTrack().horizons
 * @param {Object} p.convention field tie convention
 * @param {Set<string>} p.takenNames existing horizon names
 * @param {Function} p.saveHorizon horizonsService.saveHorizon
 * @returns {Promise<Array<{row, picks, confidence, save}>>}
 */
export async function saveFramework({
  volume, dtUs, horizons, convention, takenNames, saveHorizon,
}) {
  const taken = new Set(takenNames);
  const saved = [];
  for (const h of horizons) {
    const name = freeName(h.name, taken);
    taken.add(name);
    const seed = h.seeds[0] ? { ilIdx: h.seeds[0].il, xlIdx: h.seeds[0].xl, sample: h.seeds[0].sample } : null;
    const save = {
      name,
      seed,
      params: {
        source: 'well_tops',
        top_name: h.name,
        role: h.role,
        representative: h.representative || null,
        // a conformable horizon snaps nothing: it carries its representative's kind
        mode: h.kind || horizons.find((x) => x.name === h.representative)?.kind || 'peak',
        seeds: h.seeds,
        jumps: h.jumps,
        stats: h.stats,
        lowo: h.lowo ? { rmsMs: h.lowo.rmsMs, reached: h.lowo.reached, n: h.lowo.n } : null,
        tie_convention: convention ? { polarity: convention.polarity, phaseDeg: convention.phaseDeg } : null,
      },
    };
    const row = await saveHorizon({
      volume, picks: h.picks, dtUs, confidence: h.confidence, ...save,
    });
    saved.push({
      row, picks: h.picks, confidence: h.confidence, save,
    });
  }
  return saved;
}

/**
 * Save accepted automatic faults (source 'auto', with confidence and the
 * patch statistics in params).
 */
export async function saveAutoFaults({
  volumeId, faults, takenNames, saveFault, aoi = null,
}) {
  const taken = new Set(takenNames);
  const rows = [];
  for (const f of faults) {
    const name = freeName(f.name, taken);
    taken.add(name);
    rows.push(await saveFault({
      volumeId,
      name,
      sticks: f.sticks,
      params: {
        source: 'auto', confidence: f.confidence, stats: f.stats, aoi,
      },
    }));
  }
  return rows;
}
