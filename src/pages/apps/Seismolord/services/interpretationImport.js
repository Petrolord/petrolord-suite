// Landing and saving imported INTERPRETATION files (horizon picks and
// fault sticks) on the active volume. The dialog parses with the
// tolerant engine readers (engine/horizonImport, engine/faultImport);
// this module turns a parse into seismic_horizons / seismic_faults rows
// so the dialog path is testable without React.
//
// Z sign: the file's z is converted to a sample index through the
// volume's sample rate. sign = -1 reads suite negative-down files,
// +1 Petrel positive-down files.

import { rowsToPickLattice } from '../engine/pickImport';
import { gridToPickLattice } from '../engine/horizonImport';
import { faultSticksToLattice } from '../engine/faultImport';
import { surveyAffine } from '../engine/surveyGeometry';
import { geomFromManifest } from '../engine/sliceAssembly';
import { saveHorizon } from './horizonsService';
import { saveFault } from './faultsService';

const NULL_F32 = Math.fround(1.0e30);

/** Lattice, affine, line numbering and sample rate of a volume. */
export function surveyFrame(manifest) {
  const geo = manifest.geometry;
  return {
    geom: geomFromManifest(manifest),
    affine: surveyAffine(geo),
    lines: { il0: geo.il.min, ilStep: geo.il.step, xl0: geo.xl.min, xlStep: geo.xl.step },
    dtMs: geo.dt_us / 1000,
    dtUs: geo.dt_us,
  };
}

/**
 * Land every chosen horizon of a parse on the lattice. A horizon that
 * lands nothing is reported with its reason; the others still land.
 *
 * @param {Object} p
 * @param {Object} p.parsed parseHorizonFile output (points or grid)
 * @param {Object} p.manifest volume manifest
 * @param {1|-1} p.sign +1 positive-down file, -1 negative-down
 * @param {?string[]} [p.include] horizon names to land (default all)
 * @returns {{landed: Array<{name, picks, placed, skipped, collisions,
 *   seed}>, failed: Array<{name, error}>}}
 */
export function landHorizons({ parsed, manifest, sign, include = null }) {
  const { geom, affine, lines, dtMs } = surveyFrame(manifest);
  const zToSample = (z) => (sign * z) / dtMs;
  const landed = [];
  const failed = [];
  for (const h of parsed.horizons) {
    if (include && !include.includes(h.name)) continue;
    try {
      const out = parsed.kind === 'grid'
        ? { collisions: 0, ...gridToPickLattice(parsed.grid, geom, affine, zToSample) }
        : rowsToPickLattice(h.rows, geom, lines, affine, zToSample);
      const seedCell = out.picks.findIndex((v) => v !== NULL_F32);
      landed.push({
        name: h.name,
        ...out,
        seed: {
          ilIdx: Math.floor(seedCell / geom.nXl),
          xlIdx: seedCell % geom.nXl,
          sample: out.picks[seedCell],
        },
      });
    } catch (e) {
      failed.push({ name: h.name, error: e.message });
    }
  }
  if (!landed.length) {
    throw new Error(failed.length === 1 ? failed[0].error
      : `None of the ${failed.length} horizons landed on this volume. ${failed[0].error}`);
  }
  return { landed, failed };
}

/**
 * Land and save imported horizons, one seismic_horizons row per name.
 *
 * @param {Object} p
 * @param {Object} p.volume seismic_volumes row
 * @param {Object} p.manifest
 * @param {Object} p.parsed parseHorizonFile output
 * @param {1|-1} p.sign
 * @param {?string[]} [p.include] names to import (default all)
 * @param {?string} [p.singleName] name for a single-horizon import
 * @param {Object} p.source provenance (file name, z sign, CRS)
 * @returns {Promise<{saved: Object[], landed: Object[], failed: Object[]}>}
 */
export async function saveImportedHorizons({
  volume, manifest, parsed, sign, include = null, singleName = null, source,
}) {
  const { landed, failed } = landHorizons({ parsed, manifest, sign, include });
  const { dtUs } = surveyFrame(manifest);
  const saved = [];
  for (const h of landed) {
    // eslint-disable-next-line no-await-in-loop
    saved.push(await saveHorizon({
      volume,
      name: landed.length === 1 && singleName ? singleName : h.name,
      picks: h.picks,
      seed: h.seed,
      params: {
        mode: 'imported',
        source: {
          ...source,
          format: parsed.format,
          horizon_in_file: h.name,
          rows: parsed.kind === 'grid' ? null
            : (parsed.horizons.find((x) => x.name === h.name)?.rows.length ?? null),
          rejected_rows: parsed.rejectCount || 0,
          placed: h.placed,
          skipped: h.skipped,
          collisions: h.collisions,
        },
      },
      dtUs,
    }));
  }
  return { saved, landed, failed };
}

/**
 * Land and save imported fault sticks, one seismic_faults row per
 * named fault (stick order preserved).
 *
 * @returns {Promise<{saved: Object[], placed, skipped, droppedSticks}>}
 */
export async function saveImportedFaults({
  volume, manifest, parsed, sign, singleName = null, source,
}) {
  const { geom, affine, lines, dtMs } = surveyFrame(manifest);
  const { faults, placed, skipped, droppedSticks } = faultSticksToLattice(
    parsed.faults, geom, lines, affine, (z) => (sign * z) / dtMs,
  );
  const fullSource = {
    ...source,
    format: parsed.format,
    rows: parsed.points,
    rejected_rows: parsed.rejectCount || 0,
    placed,
    skipped,
    dropped_sticks: droppedSticks,
  };
  const saved = [];
  for (const f of faults) {
    // eslint-disable-next-line no-await-in-loop
    saved.push(await saveFault({
      volumeId: volume.id,
      name: faults.length === 1 && singleName ? singleName : f.name,
      sticks: f.sticks,
      params: { mode: 'imported', source: fullSource },
    }));
  }
  return {
    saved, placed, skipped, droppedSticks, faults,
  };
}
