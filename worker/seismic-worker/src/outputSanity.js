// Output sanity for the QI jobs (F3 benchmark F-3, 2026-10-15). An inversion
// whose wavelet scale had collapsed returned blind AI errors of 1e29 percent
// and wrote overflowed samples as nulls, and the job reported success. These
// checks make such a job fail (or carry a warning) instead:
//  - blind rows: an absolute error over 100 percent, or one that is not a
//    number where the well had samples, fails the job;
//  - property rows: a left-out RMS over 0.5 (fraction units) fails it;
//  - volumes: samples where the input was live but the output is not a
//    finite number are counted; over 0.1 percent of the live samples fails
//    the job, fewer are reported as a warning.
const fin = Number.isFinite;
export const MAX_BLIND_ERROR_PCT = 100;
export const MAX_PROPERTY_RMS = 0.5;
export const MAX_BAD_SHARE = 0.001;

const scoresOf = (b) => {
  if (!b || typeof b !== 'object') return [];
  if ('rmsPct' in b || 'corr' in b) return [['', b]];
  return Object.entries(b).filter(([, v]) => v && typeof v === 'object' && ('rmsPct' in v || 'corr' in v));
};

/** Why a blind-well table is absurd, or null. Rows: {name, blind: score | {key: score}}; score {corr, rmsPct, n}. */
export function blindTableProblem(rows = []) {
  const bad = [];
  for (const r of rows || []) {
    for (const [key, s] of scoresOf(r.blind)) {
      if (!(s.n >= 3)) continue;
      const label = key ? `${r.name} (${key})` : r.name;
      if (s.rmsPct != null && !(fin(s.rmsPct) && s.rmsPct <= MAX_BLIND_ERROR_PCT)) bad.push(`${label}: blind error ${fin(s.rmsPct) ? `${s.rmsPct.toPrecision(3)} percent` : 'not a number'}`);
      else if (s.corr != null && !fin(s.corr) && s.rmsPct == null) bad.push(`${label}: blind correlation not a number`);
    }
  }
  return bad.length ? `The blind-well check is not credible (${bad.join('; ')}), so the result would not be trustworthy. Check the ties and the wavelet before inverting.` : null;
}

/** Why property check rows are absurd, or null. */
export function propertyRowsProblem(rows = []) {
  const bad = (rows || []).filter((r) => !r.error && r.n > 0 && 'rms' in r && !(fin(r.rms) && r.rms <= MAX_PROPERTY_RMS));
  return bad.length ? `The left-out well check is not credible (${bad.map((r) => `${r.name}: RMS ${fin(r.rms) ? r.rms.toPrecision(3) : 'not a number'}`).join('; ')}). Check the inversion it was predicted from.` : null;
}

/** Counts input-live samples whose output is not finite. */
export function makeSanityCounter() {
  let live = 0; let bad = 0;
  return {
    add(inputLive, value) { if (!inputLive) return; live += 1; if (!fin(value)) bad += 1; },
    get live() { return live; },
    get bad() { return bad; },
    /** {fail: string|null, warning: string|null} */
    verdict(what = 'the volume') {
      if (!bad) return { fail: null, warning: null };
      const share = live ? bad / live : 1;
      const text = `${bad} of ${live} samples of ${what} (${(100 * share).toPrecision(2)} percent) came out as no number where the seismic had data and were written as nulls.`;
      return share > MAX_BAD_SHARE ? { fail: `${text} The inversion is unstable; check the ties and the wavelet scale.`, warning: null } : { fail: null, warning: text };
    },
  };
}
