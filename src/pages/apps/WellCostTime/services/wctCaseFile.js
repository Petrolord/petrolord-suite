// Well Cost & Time case file (W3): a whole estimate as one JSON file, so a
// case can be carried between wellbores, shared, or handed to a learner
// (the NextGen wellcost capstone publishes MERLIN A-12 this way, at
// /course-cases/wellcost-merlin-a12-advanced.wct.json). The file holds the
// studio's own case doc (program, costs, risk with its iterations and seed,
// params, notes) under a format marker; nothing is derived or rounded, so a
// loaded case reruns bit-identically, Monte Carlo included.
//
// NO React, NO supabase, NO '@/' aliases (imported by jest and node).

export const CASE_FILE_FORMAT = 'petrolord-wct-case';
export const CASE_FILE_VERSION = 1;
export const CASE_FILE_EXTENSION = '.wct.json';

const clone = (x) => JSON.parse(JSON.stringify(x));

export function caseFileFromDraft(draft) {
  return {
    format: CASE_FILE_FORMAT,
    version: CASE_FILE_VERSION,
    name: draft.name || 'Estimate',
    program: clone(draft.program),
    costs: clone(draft.costs),
    risk: clone(draft.risk || { iterations: 2000, seed: 1, uncertainties: [] }),
    params: clone(draft.params || {}),
    notes: draft.notes ?? '',
  };
}

export function caseFileText(draft) {
  return `${JSON.stringify(caseFileFromDraft(draft), null, 2)}\n`;
}

export function caseFilename(name) {
  const slug = String(name || 'estimate').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'estimate';
  return `${slug}${CASE_FILE_EXTENSION}`;
}

// Parse and check a case file. Returns the case doc fields ready for
// backend.saveCase; throws an Error whose message says what is wrong.
export function caseDocFromFile(textOrObject) {
  let f = textOrObject;
  if (typeof f === 'string') {
    try { f = JSON.parse(f); } catch { throw new Error('The file is not JSON.'); }
  }
  if (!f || typeof f !== 'object') throw new Error('The file holds no case.');
  if (f.format !== CASE_FILE_FORMAT) throw new Error(`The file is not a Well Cost & Time case (format "${f.format ?? 'missing'}").`);
  if (!(Number(f.version) >= 1 && Number(f.version) <= CASE_FILE_VERSION)) throw new Error(`Case file version ${f.version} is not supported.`);
  if (!Array.isArray(f.program?.activities) || !f.program.activities.length) throw new Error('The case has no activities.');
  if (!Array.isArray(f.costs?.items)) throw new Error('The case has no cost items.');
  const risk = f.risk && typeof f.risk === 'object' ? clone(f.risk) : { iterations: 2000, seed: 1, uncertainties: [] };
  if (!Array.isArray(risk.uncertainties)) risk.uncertainties = [];
  return {
    name: String(f.name || 'Imported estimate'),
    program: clone(f.program),
    costs: clone(f.costs),
    risk,
    params: f.params && typeof f.params === 'object' ? clone(f.params) : {},
    notes: typeof f.notes === 'string' ? f.notes : '',
  };
}
