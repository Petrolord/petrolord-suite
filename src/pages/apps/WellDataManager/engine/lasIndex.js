// The LAS index curve at the registry door (AppUpgrade WDM-U1-001..003).
//
// The registry stores every log against ONE ascending measured-depth
// vector, and every downstream app (Petrophysics Studio, Well
// Correlation, Stratigraphy, Rock Physics ...) finds that vector by the
// DEPT alias family in src/components/wells/curveMap.js. Real LAS files
// break that three ways, and before this module each one was stored
// without a word:
//
//   1. indexed by TVD, TVDSS or time: stored as if it were MD. Refused
//      here with the reason, before anything is written.
//   2. logged bottom-up (negative STEP): the depth vector descended, so
//      the step read as irregular, the quick view plotted by sample
//      index, the suggested TD was the SHALLOW end and a merge into an
//      existing well blanked every sample. Every curve is now reversed
//      so depth ascends, and the preview says so.
//   3. an MD index under a name outside the DEPT family (TDEP, INDEX,
//      DEPTH_M ...): downstream apps saw a well with no depth curve and a
//      second LAS into the same well wrote a second depth curve. The
//      index is saved as DEPT, the file's name kept in provenance.
//
// Pure functions, worker-safe, no I/O. The vendored engines (parseLas,
// prepareLogs) are untouched; this is the Suite's import policy on top.

import { uniformStepM, prepareLogs, suggestWellHeader } from './lasImport';
import { proposeDatumFromLas } from '@/lib/wellDatum';
import { CURVE_ALIASES } from '@/components/wells/curveMap';

const base = (m) => String(m || '').trim().toUpperCase().split(':')[0];

/** Index mnemonics that name a vertical depth (TVD below KB or subsea). */
const TVD_INDEX = /^(TVD|TVDSS|TVD_SS|TVDSS_M|SSTVD|TVDKB|TVDRKB|TVDMSL|TVDBML|TVDGL|TVD_M|TVDSS_FT|TVD_FT|Z|ELEV)$/;
/** Index mnemonics that name time. */
const TIME_INDEX = /^(TIME|ETIM|ETIME|TWT|OWT|TIME_MS|TIME_S|DATETIME|TIMESTAMP|TIM)$/;
const TIME_UNITS = /^(S|SEC|MS|MSEC|MIN|H|HR|HRS|D|DAY|DAYS|DATETIME)$/i;

/**
 * Refuse an index the registry cannot store as MD, with the reason.
 * @param {{curves: Array<{mnemonic: string, unit: string, descr?: string}>}} parsed parseLas output
 * @returns {void} throws a plain Error naming the index and what to do
 */
export function checkLasIndex(parsed) {
  const idx = parsed?.curves?.[0];
  if (!idx) return;
  const m = base(idx.mnemonic);
  const descr = String(idx.descr || '');
  const unit = String(idx.unit || '').trim();
  if (TIME_INDEX.test(m) || TIME_UNITS.test(unit)) {
    throw new Error(`This file is indexed by time (${idx.mnemonic}${unit ? ` in ${unit}` : ''}), so it has no depth to store the curves against. `
      + 'Export the logs against measured depth from the acquisition or interpretation software, then import that file.');
  }
  if (TVD_INDEX.test(m) || /true\s+vertical|sub-?sea|\btvd/i.test(descr)) {
    throw new Error(`This file is indexed by ${idx.mnemonic} (a vertical depth), and the registry stores logs against measured depth (MD). `
      + 'Storing it as MD would put every sample at the wrong depth in a deviated well. Export the logs against MD, then import that file.');
  }
}

/** True for a mnemonic in the DEPT alias family downstream apps read. */
export const isDepthAlias = (mnemonic) => CURVE_ALIASES.DEPT.includes(base(mnemonic));

/**
 * Orient and name the index of a prepareLogs result for the registry:
 * ascending depth, index saved as DEPT when its name is outside the DEPT
 * family. Returns a NEW prep object (input arrays are not mutated) plus
 * the notes the import preview shows.
 *
 * @param {ReturnType<typeof prepareLogs>} prep
 * @returns {{prep: Object, notes: string[], reversed: boolean, renamedFrom: ?string}}
 */
export function orientLasIndex(prep) {
  const notes = [];
  if (!prep?.logs?.length) return { prep, notes, reversed: false, renamedFrom: null };
  const depth = prep.logs[0].data;
  let first = null;
  let last = null;
  for (let i = 0; i < depth.length; i++) if (Number.isFinite(depth[i])) { first = depth[i]; break; }
  for (let i = depth.length - 1; i >= 0; i--) if (Number.isFinite(depth[i])) { last = depth[i]; break; }
  const reversed = first != null && last != null && last < first;

  let logs = prep.logs;
  let { stepM, startMdM, stopMdM } = prep;
  if (reversed) {
    logs = logs.map((l) => {
      const data = Float32Array.from(l.data).reverse();
      return { ...l, data };
    });
    const d = logs[0].data;
    stepM = uniformStepM(d);
    startMdM = Number.isFinite(d[0]) ? d[0] : null;
    stopMdM = Number.isFinite(d[d.length - 1]) ? d[d.length - 1] : null;
    logs = logs.map((l) => ({
      ...l, startMdM, stopMdM, stepM, provenance: { ...(l.provenance || {}), reversed_from_bottom_up: true },
    }));
    notes.push(`Logged bottom-up: every curve was reversed so depth increases (${startMdM?.toFixed(1)} to ${stopMdM?.toFixed(1)} m).`);
  }

  let renamedFrom = null;
  const idx = logs[0];
  if (!isDepthAlias(idx.mnemonic)) {
    renamedFrom = idx.mnemonic;
    logs = [{ ...idx, mnemonic: 'DEPT', kind: 'depth', provenance: { ...(idx.provenance || {}), source_mnemonic: idx.mnemonic } }, ...logs.slice(1)];
    notes.push(`The depth index ${renamedFrom} is saved as DEPT so every app finds it.`);
  }

  return { prep: { ...prep, logs, stepM, startMdM, stopMdM }, notes, reversed, renamedFrom };
}

/**
 * The whole Suite-side LAS preparation: index check, SI prep (vendored
 * engine), orientation and naming, and the header suggestion corrected
 * for bottom-up files (TD is the deepest sample, never STOP).
 * Used by the parse worker and the in-memory backend alike.
 *
 * @param {Object} parsed parseLas output
 * @param {{sourceFile?: ?string}} [opts]
 */
export function prepareLasForRegistry(parsed, opts = {}) {
  checkLasIndex(parsed);
  const raw = prepareLogs(parsed, opts);
  const { prep, notes } = orientLasIndex(raw);
  const suggested = suggestWellHeader(parsed);
  const deepest = Math.max(prep.startMdM ?? -Infinity, prep.stopMdM ?? -Infinity);
  if (Number.isFinite(deepest)) suggested.tdMdM = deepest;
  const loc = suggestSurfaceLocation(parsed);
  // WDM-U2-007: what the header says about the depth reference (EKB, EGL,
  // EDF, APD, EPD, LMF, DMF, PDAT), as a proposal for the user to confirm.
  // It replaces the bare KB: an EKB of 0 or the null value is not an elevation.
  const datumProposal = proposeDatumFromLas(parsed);
  suggested.kbM = datumProposal.fields.refElevM;
  return { prep, notes, suggestedHeader: { ...suggested, ...loc, datumProposal } };
}

const X_KEYS = ['XWELL', 'X', 'XCOORD', 'XCOO', 'X_COORD', 'EAST', 'EASTING', 'XLOC', 'SURFX', 'XSURF'];
const Y_KEYS = ['YWELL', 'Y', 'YCOORD', 'YCOO', 'Y_COORD', 'NORT', 'NORTH', 'NORTHING', 'YLOC', 'SURFY', 'YSURF'];
const LAT_KEYS = ['LATI', 'LAT', 'LATITUDE'];
const LON_KEYS = ['LONG', 'LON', 'LONGITUDE'];

/**
 * Surface location offered from ~Well / ~Parameter (WDM-U1-008): Petrel
 * and many service-company exports carry XWELL/YWELL or X/Y. Offered as a
 * suggestion with the unit the file states; the user still confirms the
 * CRS. Lat/long are reported for the note only (the LAS door takes XY).
 * @returns {{surfaceX?: number, surfaceY?: number, xyUnit?: ?string, latLon?: {lat:number, lon:number}}}
 */
export function suggestSurfaceLocation(parsed) {
  const pick = (keys) => {
    for (const k of keys) {
      const item = parsed?.well?.[k] || parsed?.params?.[k];
      if (item && typeof item.value === 'number' && Number.isFinite(item.value)) return item;
    }
    return null;
  };
  const out = {};
  const x = pick(X_KEYS);
  const y = pick(Y_KEYS);
  if (x && y) {
    out.surfaceX = x.value;
    out.surfaceY = y.value;
    const u = String(x.unit || y.unit || '').trim().toUpperCase();
    out.xyUnit = u === 'M' || u === 'METRES' || u === 'METERS' ? 'm'
      : (u === 'F' || u === 'FT' || u === 'FEET' ? 'ft' : (u === 'USFT' || u === 'FTUS' ? 'ftUS' : null));
  }
  const lat = pick(LAT_KEYS);
  const lon = pick(LON_KEYS);
  if (lat && lon && Math.abs(lat.value) <= 90 && Math.abs(lon.value) <= 180) out.latLon = { lat: lat.value, lon: lon.value };
  return out;
}
