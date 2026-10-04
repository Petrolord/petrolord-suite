// Waterflood Design Studio as a receiver of a Voidage Replacement Monitor
// ledger (WF-U2-004): the `vrr-ledger-1` contract
// (src/utils/vrr/vrrLedgerContract.js), read by id, becomes the
// surveillance history of the Surveillance tab.
//
// The ledger holds VOLUMES per well per calendar month; the surveillance
// engine (analyzeWaterflood, time_weighting 'calendar') holds daily RATES
// per dated row and makes a volume as rate x the days the row stands for
// (rowDayWeights: the days to the next field date, the last row the gap
// before it). Each month becomes one row per well dated on the 1st, with the
// rate = volume / the engine's own weight of that date, so every monthly
// volume, the field totals and the VRR come back exactly as VRR Monitor
// holds them. The rate shown for the last month is its volume over the days
// of the month before it (the engine's rule for the last row); its volume is
// exact.
//
// Not carried: injection pressure (the ledger has none, so no Hall plot from
// this source), gas injection (the surveillance engine has no gas injection
// term; named in the intake notes when the ledger holds any). Pure.
import { rowDayWeights } from '@/utils/waterfloodCalculations';
import { VRR_LEDGER_SCHEMA } from '@/utils/vrr/vrrLedgerContract';

export const VRR_INTAKE_SOURCE = VRR_LEDGER_SCHEMA;

/**
 * @param {object} contract a vrr-ledger-1 contract
 * @param {{at?: string}} [opts]
 * @returns {{ok: true, rows: object[], intake: object}|{ok: false, reason: string}}
 */
export function surveillanceFromVrrLedger(contract, { at = new Date().toISOString() } = {}) {
  if (!contract || contract.schema !== VRR_LEDGER_SCHEMA) return { ok: false, reason: 'Not a Voidage Replacement Monitor ledger.' };
  const months = contract.months || [];
  if (!months.length) return { ok: false, reason: 'The ledger has no month.' };
  const dates = months.map((m) => `${m}-01`);
  const weights = rowDayWeights(dates, 'calendar');
  const wOf = new Map(dates.map((d, i) => [d, weights[i]]));
  const rows = [];
  for (const v of contract.volumes || []) {
    const date = `${v.month}-01`;
    const w = wOf.get(date) || 1;
    rows.push({
      date, well: v.well,
      oil_bbl: v.oil_stb / w, water_bbl: v.water_stb / w, gas_mcf: v.gas_mscf / w,
      inj_bbl: v.winj_stb / w, whp_psi: '',
    });
  }
  const notes = [
    'Monthly volumes per well from the VRR Monitor ledger, one row per well dated on the 1st of the month; rates are the volume over the days the row stands for, so volumes and VRR are those of VRR Monitor.',
    'No injection pressure in the ledger: no Hall plot from this source.',
  ];
  if (contract.totals?.ginj_mscf > 0) notes.push(`Gas injection of ${Math.round(contract.totals.ginj_mscf).toLocaleString('en-US')} Mscf in the ledger is not carried: the surveillance voidage has no gas injection term.`);
  const fvf = contract.fvf || {};
  const intake = {
    source: VRR_INTAKE_SOURCE,
    fileName: `Voidage Replacement Monitor project "${contract.projectName || 'unnamed'}"`,
    from: { app: contract.app, recordId: contract.projectId, recordName: contract.projectName, savedAt: contract.projectSavedAt ?? null, fingerprint: contract.fingerprint },
    readAt: at,
    months: { first: months[0], last: months[months.length - 1], count: months.length },
    wells: contract.wells,
    totals: contract.totals,
    fvfThere: { Bo: fvf.Bo ?? null, Bw: fvf.Bw ?? null, Bg: fvf.Bg ?? null, Rs: fvf.Rs ?? null },
    notes,
  };
  return { ok: true, rows, intake };
}

/** The read-back lines of an intake from VRR Monitor (the report and the panel print them). */
export function vrrIntakeLines(rb) {
  if (!rb || rb.source !== VRR_INTAKE_SOURCE) return [];
  const f = rb.fvfThere || {};
  return [
    `${rb.fileName}, read by id ${String(rb.readAt || '').slice(0, 10)}: ${rb.months.count} months (${rb.months.first} to ${rb.months.last}), injectors ${rb.wells?.injectors?.join(', ') || 'none'}, producers ${rb.wells?.producers?.join(', ') || 'none'}.`,
    ...rb.notes,
    `FVFs in that project (not taken; this app uses its own): Bo ${f.Bo ?? 'n/a'}, Bw ${f.Bw ?? 'n/a'}, Bg ${f.Bg ?? 'n/a'}, Rs ${f.Rs ?? 'n/a'}.`,
  ];
}
