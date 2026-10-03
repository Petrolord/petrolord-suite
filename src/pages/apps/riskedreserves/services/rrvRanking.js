// Ranking (upgrade U2-008, 2026-10-02): the user's valuations and those
// colleagues shared, ranked by EMV, by risked volume or by commercial chance,
// with the basis of each row stated so a manager can see what each number
// rests on. Every value is the valuation engine's (valueProspect through the
// workstation); this module only orders, words and exports. Pure.

import { EMPTY_VALUE } from '@/lib/emptyValue';
import { PERCENTILE_CONVENTION, BOE_BASIS, valueBasisWord } from './rrvStore';

export const RANK_KEYS = Object.freeze({
  emv: { label: 'EMV', word: 'expected monetary value after the exploration well ($MM), largest first', of: (v) => v.emv },
  riskedMean: { label: 'Risked volume', word: 'risked mean volume (Pg x success-case mean), largest first', of: (v) => v.riskedMean },
  pc: { label: 'Commercial chance', word: 'commercial chance Pc (Pg x chance of at least the MEFS), largest first', of: (v) => v.pc },
});

const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const time = (iso) => { const d = iso ? new Date(iso) : null; return d && !Number.isNaN(d.getTime()) ? `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC` : null; };

/** What one row rests on, in words: the volumes, the value of a discovery, the MEFS. */
export function basisOf(p, up = null, epe = null) {
  const vols = p.source === 'rcp'
    ? `volumes from ReservoirCalc Pro${p.handoff?.recordName ? ` "${p.handoff.recordName}"` : ''}${p.basis && p.basis !== 'recoverable' ? ` (${p.basis === 'in-place' ? 'IN PLACE' : 'basis not stated'})` : ''}${up && ['changed', 'replaced', 'missing'].includes(up.state) ? `, ${up.state === 'changed' ? 'changed there since' : up.state === 'replaced' ? 'risked again there since' : 'record gone'}` : ''}`
    : 'volumes typed here';
  const value = p.econ?.value === 'epe' && p.econ.epe
    ? `value from Petroleum Economics Studio run "${p.econ.epe.runName}"${epe && epe.state === 'changed' ? ' (changed since)' : epe && epe.state === 'missing' ? ' (run gone)' : ''}`
    : `value: ${valueBasisWord(p)}`;
  const mefs = p.econ?.mefs === 'derived' ? 'MEFS derived' : 'MEFS typed';
  return `${vols}; ${value}; ${mefs}`;
}

/**
 * Rank valued prospects.
 * @param {Array<{p: object, v: ?object, problem?: ?string, shared?: boolean, owner?: ?string, up?: ?object, epe?: ?object}>} entries
 * @param {'emv'|'riskedMean'|'pc'} by
 * @returns {{by: string, rows: Array<object>, unranked: Array<{name: string, problem: string, shared: boolean}>}}
 *   rows carry rank, name, owner, the numbers and the basis; ties keep the name order
 */
export function rankValuations(entries, by = 'emv') {
  const key = RANK_KEYS[by] ? by : 'emv';
  const of = RANK_KEYS[key].of;
  const valued = entries.filter((x) => x.v && fin(of(x.v)));
  const unranked = entries.filter((x) => !(x.v && fin(of(x.v)))).map((x) => ({ name: x.p.name, problem: x.problem || 'not valued', shared: !!x.shared }));
  const rows = [...valued]
    .sort((a, b) => of(b.v) - of(a.v) || String(a.p.name).localeCompare(String(b.p.name)))
    .map((x, i) => ({
      rank: i + 1,
      id: x.p.id,
      name: x.p.name,
      shared: !!x.shared,
      owner: x.shared ? (x.owner || 'a colleague') : 'you',
      pg: x.v.pg,
      pc: x.v.pc,
      riskedMean: x.v.riskedMean,
      successMean: x.v.successCase.mean,
      emv: x.v.emv,
      wellCost: Number(x.p.wellCost),
      emvPerWellDollar: Number(x.p.wellCost) > 0 ? x.v.emv / Number(x.p.wellCost) : null,
      basis: basisOf(x.p, x.up, x.epe),
      savedAt: x.p.row?.updated_at || null,
    }));
  return { by: key, rows, unranked };
}

const q = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

/**
 * The ranking as CSV with a provenance header (lines starting with "#").
 * @param {{by: string, rows: Array, unranked: Array}} ranked rankValuations(...)
 * @param {{build?: string, generatedAt?: Date, units: object, includeShared?: boolean, savedWhere?: string}} meta
 */
export function rankingCsv(ranked, meta) {
  const u = meta.units;
  const at = (meta.generatedAt || new Date()).toISOString().slice(0, 16).replace('T', ' ');
  const lines = [
    '# Risked Reserves Valuation, ranking, Petrolord Suite',
    `# Build: ${meta.build || 'not stated'}`,
    `# Generated: ${at} UTC`,
    `# Ranked by: ${RANK_KEYS[ranked.by].word}`,
    `# Units: volumes ${u.volumeLabel} (oil equivalent, gas at ${BOE_BASIS}); money $MM`,
    `# Percentiles: ${PERCENTILE_CONVENTION}`,
    '# Each prospect is valued on its own; the ranking assumes nothing about dependence between prospects',
    `# Rows: ${meta.includeShared ? 'your valuations and those colleagues shared with you (marked shared)' : 'your valuations only'}`,
    ...(meta.savedWhere ? [`# Saved: ${meta.savedWhere}`] : []),
    ...ranked.unranked.map((x) => `# Not ranked: ${String(x.name).replace(/[\r\n]+/g, ' ')}${x.shared ? ' (shared)' : ''}: ${x.problem}`),
  ];
  lines.push(['rank', 'prospect', 'owner', 'pg', 'pc', `risked_mean_${u.volumeKey}`, `success_mean_${u.volumeKey}`, 'emv_musd', 'well_cost_musd', 'emv_per_well_dollar', 'basis', 'saved'].join(','));
  for (const r of ranked.rows) {
    lines.push([r.rank, r.name, r.owner, r.pg.toFixed(4), r.pc.toFixed(4), u.volume(r.riskedMean).toFixed(3), u.volume(r.successMean).toFixed(3), r.emv.toFixed(3),
      fin(r.wellCost) ? r.wellCost : '', fin(r.emvPerWellDollar) ? r.emvPerWellDollar.toFixed(3) : '', r.basis, time(r.savedAt) || EMPTY_VALUE].map(q).join(','));
  }
  return lines.join('\n');
}
