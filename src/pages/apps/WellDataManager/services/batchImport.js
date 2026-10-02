// Batch LAS import runner (AppUpgrade WDM-U2-004): executes the reviewed
// plan from engine/batchMatch.js through the injected backend, one file at
// a time. A file that fails is reported and the batch carries on; nothing
// already written is rolled back, and the summary says exactly which
// files landed where.
//
// Each file goes through the same merge rules as the single-file dialog
// (engine/mergeImport.js): into a well that has a depth curve the curves
// are resampled onto its grid, and a curve name the well already has is
// kept alongside with a :n suffix (never replaced in a batch).

import { planMerge, findDepthLog } from '../engine/mergeImport';
import { isDepthAlias } from '../engine/lasIndex';
import { topsFromLasBlocks } from '../engine/lasTops';
import { placeWellLocation } from '@/lib/crs/wellPlacement';
import { UNKNOWN } from '@/lib/crs/tags';
import { validateDatum } from '@/lib/wellDatum';

/**
 * @param {Object} p
 * @param {Object} p.backend
 * @param {Object[]} p.rows plan rows (planBatch, after the user's overrides)
 * @param {Object[]} p.files [{fileName, parsed}] by row index
 * @param {Object<number, {x: string, y: string}>} [p.typedXy] surface X/Y typed per row
 * @param {string} [p.xyUnit] unit of typed X/Y (and of file X/Y that state none)
 * @param {?string} [p.crsTag] CRS the X/Y are in (default: the Project CRS)
 * @param {Object} [p.crsContext]
 * @param {(p: {done: number, total: number, fileName: string}) => void} [p.onProgress]
 * @param {{cancelled: boolean}} [p.cancel] set cancelled = true to stop after the current file
 * @returns {Promise<{results: Object[], autoSetProject: ?string}>}
 */
/** A header proposal as a saveable datum: fields that fail the shared checks are left out, never guessed. */
function batchDatum(fields) {
  const full = validateDatum(fields);
  if (!full.errors.length) return full.datum;
  const bare = validateDatum({ refKind: fields.refKind, refElevM: fields.refElevM, elevUnit: fields.elevUnit });
  return bare.errors.length ? { refKind: null, refElevM: null } : bare.datum;
}

export async function runBatchImport({
  backend, rows, files, typedXy = {}, xyUnit = 'm', crsTag = null, crsContext = {}, onProgress = () => {}, cancel = null,
}) {
  const results = [];
  const created = new Map(); // newKey -> well id
  let autoSetProject = null;
  const total = rows.length;
  for (let k = 0; k < rows.length; k++) {
    const row = rows[k];
    onProgress({ done: k, total, fileName: row.fileName });
    if (cancel?.cancelled) {
      results.push({ row, status: 'skipped', message: 'cancelled before this file' });
      continue;
    }
    if (row.action === 'skip') {
      results.push({ row, status: 'skipped', message: row.reason || 'skipped' });
      continue;
    }
    try {
      const parsed = files[row.i].parsed;
      let wellId = row.wellId;
      let createdWell = false;
      if (row.action === 'new') {
        wellId = created.get(row.newKey) || null;
        if (!wellId) {
          const t = typedXy[row.i];
          const typed = t && String(t.x).trim() !== '' && String(t.y).trim() !== '';
          const x = typed ? Number(t.x) : row.xy?.x;
          const y = typed ? Number(t.y) : row.xy?.y;
          if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('a new well needs its surface X and Y');
          const placed = placeWellLocation({
            mode: 'xy', crsTag: crsTag || crsContext?.projectTag || UNKNOWN, x, y, xyUnit: typed ? xyUnit : (row.xy?.unit || xyUnit),
          }, crsContext || {});
          const well = await backend.saveWell({
            name: row.wellName, uwi: row.uwi || null, surfaceX: placed.surfaceX, surfaceY: placed.surfaceY,
            // a missing KB is "not set", never 0; the header's datum proposal
            // is the one the batch table showed
            ...(row.datum ? { datum: batchDatum(row.datum) } : { kbM: row.kbM ?? null }),
            tdMdM: row.tdMdM ?? null, crs: placed.crs, xyUnit: placed.xyUnit,
            crsProvenance: { ...placed.crsProvenance, source: 'wdm-batch-las' }, unitsNote: parsed.meta?.suggestedHeader?.unitsNote || null,
          });
          if (!autoSetProject && placed.autoSetProject) autoSetProject = placed.autoSetProject;
          wellId = well.id;
          created.set(row.newKey, wellId);
          createdWell = true;
        }
      }
      const existingLogs = await backend.listLogs(wellId);
      const depthLog = findDepthLog(existingLogs);
      const existingDepth = depthLog ? { log: depthLog, data: await backend.downloadCurve(depthLog) } : null;
      const keep = Object.fromEntries(parsed.prep.logs.map((l) => [l.mnemonic, true]));
      const plan = planMerge({ prepLogs: parsed.prep.logs, keep, existingLogs, existingDepth });
      if (plan.errors.length) throw new Error(plan.errors[0]);
      const saved = await backend.saveLogs(wellId, plan.logs);
      let nTops = 0;
      const lasTops = topsFromLasBlocks(parsed.meta?.blocks || {});
      if (lasTops.tops.length && backend.saveTop) {
        const have = new Set((await backend.listTops(wellId)).map((x) => String(x.name).trim().toUpperCase()));
        for (const tp of lasTops.tops) {
          if (have.has(tp.name.toUpperCase())) continue;
          await backend.saveTop(wellId, { name: tp.name, mdM: tp.md, interpreter: null });
          nTops++;
        }
      }
      const suffixed = plan.report.filter((r) => r.action === 'add-suffixed').length;
      const nCurves = saved.filter((l) => !isDepthAlias(l.mnemonic)).length;
      const parts = [
        `${nCurves} curve${nCurves === 1 ? '' : 's'}`,
        plan.resampled ? `${plan.resampled} resampled onto the well's depth grid` : '',
        suffixed ? `${suffixed} kept alongside with a :n suffix` : '',
        nTops ? `${nTops} tops from the Tops block` : '',
      ].filter(Boolean);
      results.push({ row, status: 'done', wellId, createdWell, message: parts.join(', ') });
    } catch (e) {
      results.push({ row, status: 'failed', message: e.message });
    }
  }
  onProgress({ done: total, total, fileName: null });
  return { results, autoSetProject };
}

/** Status-bar sentence for a finished batch. */
export function batchSummary(results) {
  const n = (s) => results.filter((r) => r.status === s).length;
  const wells = new Set(results.filter((r) => r.status === 'done').map((r) => r.wellId)).size;
  const createdN = results.filter((r) => r.createdWell).length;
  return `Batch LAS: ${n('done')} file${n('done') === 1 ? '' : 's'} imported into ${wells} well${wells === 1 ? '' : 's'}`
    + ` (${createdN} new), ${n('skipped')} skipped, ${n('failed')} failed.`;
}
