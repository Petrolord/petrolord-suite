/**
 * The saved model of a SCAL Studio project beyond the engine inputs
 * (SCAL-U1; reviewer lens RL1, RL4, RL8, RL11):
 *
 *   identification   who and what the analysis is about (report header)
 *   sample pedigree  per core sample: lab or analog, methods, wettability,
 *                    drainage or imbibition, temperature, fluids, depth
 *                    and its reference
 *   curve origin     whether the working Corey set was typed or applied
 *                    from a fit to a sample's lab table, with the fit
 *                    statistics, and whether it was edited after the fit
 *   input sources    the per-input provenance map (src/lib/inputProvenance)
 *
 * Everything lives in the project jsonb (saved_scal_projects.inputs_data),
 * so no migration. A project saved before this opens with none of it and
 * prints n/a, or "Entered, source not stated".
 *
 * Pure.
 */
import { EMPTY_VALUE } from '@/lib/emptyValue';

const text = (v) => (v != null && String(v).trim() !== '' ? String(v).trim() : '');

/** [key, label, hint] of the identification block, in report order. */
export const IDENTIFICATION_FIELDS = Object.freeze([
  ['company', 'Company', 'Operator or client'],
  ['field', 'Field', ''],
  ['licence', 'Licence or block', ''],
  ['well', 'Well', 'Cored well'],
  ['reservoir', 'Reservoir or zone', ''],
  ['interval', 'Cored interval', 'e.g. 8,440 to 8,500 ft MD'],
  ['laboratory', 'Laboratory', ''],
  ['labReport', 'Lab report number', ''],
  ['testDates', 'Test dates', 'When the lab measured'],
  ['analyst', 'Analyst', ''],
  ['analysisDate', 'Analysis date', 'YYYY-MM-DD'],
]);

export const EMPTY_IDENTIFICATION = Object.freeze(Object.fromEntries(IDENTIFICATION_FIELDS.map(([k]) => [k, ''])));

export const identificationOf = (state) => ({ ...EMPTY_IDENTIFICATION, ...(state?.identification || {}) });

/** Option lists of the sample pedigree. '' is "not stated". */
export const PEDIGREE_OPTIONS = Object.freeze({
  origin: [['', 'Not stated'], ['lab', 'Lab measurement on this core'], ['analog', 'Analog (another field or a published set)']],
  depthRef: [['', 'Not stated'], ['MD', 'MD'], ['TVD', 'TVD'], ['TVDSS', 'TVDSS']],
  krMethod: [['', 'Not stated'], ['unsteady-state', 'Unsteady state (JBN)'], ['steady-state', 'Steady state'], ['centrifuge', 'Centrifuge'], ['other', 'Other']],
  pcMethod: [['', 'Not stated'], ['porous-plate', 'Porous plate'], ['centrifuge', 'Centrifuge'], ['mercury-injection', 'Mercury injection (MICP)'], ['other', 'Other']],
  process: [['', 'Not stated'], ['drainage', 'Drainage'], ['imbibition', 'Imbibition']],
  wettability: [['', 'Not stated'], ['water-wet', 'Water-wet'], ['intermediate', 'Intermediate'], ['mixed-wet', 'Mixed-wet'], ['oil-wet', 'Oil-wet']],
  condition: [['', 'Not stated'], ['native', 'Native state'], ['restored', 'Restored state'], ['cleaned', 'Cleaned']],
});

export const optionLabel = (list, value) => (PEDIGREE_OPTIONS[list] || []).find(([k]) => k === (value || ''))?.[1] || 'Not stated';

/**
 * The pedigree fields a sample carries. `testTempF` is stored in degF (the
 * engine's family) as the studio's string form state.
 */
export const PEDIGREE_FIELDS = Object.freeze([
  'origin', 'analogNote', 'depthRef', 'laboratory', 'labReport', 'krMethod', 'krProcess', 'pcMethod', 'pcProcess',
  'wettability', 'condition', 'testTempF', 'fluids',
]);

/** One sample's pedigree, with every field present ('' when not stated). */
export function pedigreeOf(sample) {
  const out = {};
  for (const k of PEDIGREE_FIELDS) out[k] = text(sample?.[k]);
  return out;
}

/** The fluids of a lab system preset, as words. */
export const LAB_SYSTEM_FLUIDS = Object.freeze({ air_brine: 'Air and brine', air_mercury: 'Air and mercury', oil_brine: 'Oil and brine' });

// ---------------------------------------------------------------------------
// The working curves: entered, or fitted to a sample (RL8, RL11)
// ---------------------------------------------------------------------------

export const OW_KEYS = Object.freeze(['Swc', 'Sor', 'krwMax', 'kroMax', 'nw', 'no']);
export const GO_KEYS = Object.freeze(['Swc', 'Sgc', 'Sorg', 'krgMax', 'krogMax', 'ng', 'nog']);

/**
 * The record kept when a sample's fit is applied to the Curves tab.
 * @param {{sample: object, fit: object, applied: object, at?: string}} a
 */
export function fittedOrigin({ sample, fit, applied, at = new Date().toISOString() }) {
  return {
    kind: 'fitted',
    sampleId: sample.id,
    sampleName: sample.name,
    at,
    applied: { ...applied },
    fit: {
      nw: fit.params.nw,
      no: fit.params.no,
      ci95: { nw: fit.ci95?.nw || null, no: fit.ci95?.no || null },
      rmsLog: fit.rmsLog,
      r2Log: fit.r2Log,
      pointsUsed: fit.pointsUsed,
      converged: !!fit.converged,
      iterations: fit.iterations,
      // fitCoreyToKrTable reads Swc and Sor from the first and last rows of
      // the table and the end point kr from the end rows; only nw and no are fitted
      endpoints: 'Swc and Sor from the first and last Sw of the lab table; krw at Sor and kro at Swc from the end rows of the table',
      residuals: 'log10 kr of both curves; points with kr at or below 1e-4 left out',
    },
  };
}

const sameNumber = (a, b) => {
  const x = Number(a); const y = Number(b);
  return Number.isFinite(x) && Number.isFinite(y) ? Math.abs(x - y) <= 1e-12 * Math.max(1, Math.abs(y)) : String(a) === String(b);
};

/**
 * Where the working oil-water set came from now.
 * @returns {{kind: 'entered'|'fitted'|'edited-after-fit', origin: ?object, edited: string[], text: string}}
 */
export function curveOriginStatus(values, origin, keys = OW_KEYS) {
  if (!origin || origin.kind !== 'fitted') {
    return { kind: 'entered', origin: null, edited: [], text: 'Entered by the user' };
  }
  const edited = keys.filter((k) => !sameNumber(values?.[k], origin.applied?.[k]));
  if (edited.length) {
    return {
      kind: 'edited-after-fit',
      origin,
      edited,
      text: `Fitted to sample "${origin.sampleName}", then edited by the user (${edited.join(', ')}); the fit statistics no longer describe the set`,
    };
  }
  const f = origin.fit || {};
  const r2 = Number.isFinite(f.r2Log) ? `, r2 ${f.r2Log.toFixed(3)} in log space` : '';
  return { kind: 'fitted', origin, edited: [], text: `Fitted to the lab table of sample "${origin.sampleName}"${r2}` };
}

// ---------------------------------------------------------------------------
// Input sources (RL1)
// ---------------------------------------------------------------------------

/** [key, label] of every input group with a source control, in report order. */
export const SOURCE_KEYS = Object.freeze([
  ['ow', 'Corey oil-water set'],
  ['go', 'Corey gas-oil set'],
  ['jManual', 'Leverett J (typed power law)'],
  ['k_md', 'Reservoir permeability k'],
  ['phi', 'Reservoir porosity'],
  ['sigma', 'Interfacial tension at reservoir conditions'],
  ['theta', 'Contact angle at reservoir conditions'],
  ['gammaW', 'Water specific gravity'],
  ['gammaHc', 'Hydrocarbon specific gravity'],
  ['fwl', 'Free water level'],
  ['mu', 'Viscosities of the fw preview'],
]);

/** The note a value still at the app's starting sample prints (FLUID-U1-012 pattern). */
export const SAMPLE_NOTE = 'Assumed: the starting value of the app, not field data';

export const blankText = (v) => (text(v) || EMPTY_VALUE);
