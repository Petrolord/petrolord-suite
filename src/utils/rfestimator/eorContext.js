// The EOR screening result beside the recovery factor estimate (RF reader
// of `eor-screen-1`, built in the EOR round, EOR-U2-003). Read BY ID from a
// saved EOR Screening project (src/lib/eorScreenSource.js), kept with the RF
// project as a summary with the record's content fingerprint, read again to
// say "source changed since". Context only: it changes no RF number. Pure.
import { EOR_SCREEN_CONTRACT, validateEorScreenRecord } from '@/lib/eorScreenSource';

const OUTCOME = Object.freeze({ qualified: 'Qualified', marginal: 'Marginal', 'screened out': 'Screened out', 'not screened': 'Not screened' });
const MMP_WORDS = Object.freeze({ miscible: 'miscible (reservoir pressure above the MMP)', immiscible: 'immiscible (reservoir pressure below the MMP)' });

/** The summary kept with the RF project, from an eor-screen-1 record. */
export function eorContextFrom(record, { takenAt = new Date().toISOString() } = {}) {
  const check = validateEorScreenRecord(record);
  if (!check.ok) return { ok: false, errors: check.errors };
  const mmp = record.mmp;
  return {
    ok: true,
    context: {
      contract: EOR_SCREEN_CONTRACT,
      projectId: record.project?.id ?? null,
      projectName: record.project?.name ?? null,
      savedAt: record.project?.saved_at ?? null,
      criteria: record.criteria?.short ?? null,
      sample: Boolean(record.sample),
      fingerprint: record.fingerprint,
      takenAt,
      methods: record.methods.map((m) => ({ id: m.id, name: m.name, outcome: m.outcome, passes: m.passes, screened: m.passes + m.marginals + m.fails })),
      mmp: mmp && mmp.status !== 'not made' ? { verdict: mmp.verdict ?? null, mmpPsia: mmp.mmp_psia ?? null, withinError: Boolean(mmp.within_error), correlation: mmp.correlation_short ?? null, extrapolated: Boolean(mmp.outside?.length) } : null,
    },
  };
}

/** "Source changed since" against the record read again by id; null when it is the same. */
export function eorContextChanged(context, latest) {
  if (!context) return null;
  if (!latest) return 'The EOR Screening project is no longer readable.';
  return latest.fingerprint === context.fingerprint ? null : 'The EOR screening changed after it was taken (different inputs or verdicts). Take it again to use it.';
}

/** Report rows: one per method, then the CO2 MMP line. */
export function eorContextRows(context, { fmtPressure = (p) => `${Math.round(p)} psia` } = {}) {
  if (!context) return null;
  const rows = context.methods.map((m) => [m.name, OUTCOME[m.outcome] || m.outcome, m.screened ? `${m.passes} of ${m.screened}` : '']);
  if (context.mmp) {
    rows.push(['CO2 MMP check', context.mmp.verdict ? `${MMP_WORDS[context.mmp.verdict]}${context.mmp.withinError ? ', within the error of the correlation' : ''}${context.mmp.extrapolated ? ', extrapolated' : ''}` : 'MMP only (no reservoir pressure)', Number.isFinite(context.mmp.mmpPsia) ? `MMP ${fmtPressure(context.mmp.mmpPsia)} (${context.mmp.correlation})` : '']);
  }
  return {
    head: ['EOR method', 'Screening outcome', 'Criteria passed'],
    rows,
    note: `Context only, it changes no recovery factor here: EOR Screening project "${context.projectName || context.projectId}", criteria ${context.criteria}, read by id as ${EOR_SCREEN_CONTRACT} (content ${context.fingerprint}), taken ${String(context.takenAt || '').slice(0, 16).replace('T', ' ')} UTC.${context.sample ? ' The screening still holds built-in sample values.' : ''} Screening shortlists methods; it predicts no incremental recovery.`,
  };
}
