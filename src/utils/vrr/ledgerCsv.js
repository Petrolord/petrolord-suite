/**
 * The voidage ledger as a CSV file with a provenance header (VRR-U1, RL1
 * and RL11: the gap matrix found "no export of the ledger in RB with the
 * FVFs used"). Lines starting with '#' say where the numbers came from; the
 * table is the report's ledger by period, every term in the display units
 * with the unit in the column head, the FVF set of each period, and a totals
 * row. Built from the report model, so the file, the PDF and the screen
 * agree.
 *
 * Pure.
 */
import { vrrUnits } from './units.js';

const q = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const num = (v, digits = 10) => (typeof v === 'number' && Number.isFinite(v) ? String(parseFloat(v.toPrecision(digits))) : '');

/**
 * @param {{model: object, d: object}} a collectVrrReportArgs(...) (model and the derived state)
 * @param {{generatedAt?: Date, projectName?: string}} [o]
 * @returns {string}
 */
export function buildLedgerCsv({ model, d }, { generatedAt = new Date(), projectName = '' } = {}) {
  if (!model || !d) return '';
  const u = vrrUnits(model.system);
  const id = Object.fromEntries(model.identification);
  const source = (key) => model.inputs.rows.find((r) => r.key === key)?.source || '';
  const header = [
    '# Petrolord Voidage Replacement Monitor: voidage ledger by period',
    `# Project: ${projectName || id.Project || ''}`,
    `# Field: ${id.Field || ''}; reservoir or zone: ${id['Reservoir or zone'] || ''}; company: ${id.Company || ''}`,
    `# Generated: ${generatedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC; build: ${id['Software build'] || ''}`,
    `# Display units: ${model.displayUnits}`,
    `# Periods: ${id.Periods || ''}; data cut-off: ${id['Data cut-off'] || ''}`,
    `# Production and injection: ${source('periods')}`,
    `# FVFs per period: ${source('pvtMode')}`,
    `# Constant set: Bo ${source('Bo')}; Bw ${source('Bw')}; Bg ${source('Bg')}; Rs ${source('Rs')}`,
    `# Pressure: ${source('pressureSurveys')}; datum: ${source('datum')}`,
    `# Basis: voidage in reservoir volume at each period's pressure; produced = Np Bo + Wp Bw + max(0, Gp - Rs Np) Bg; injected = Wi Bw + Gi Bg; free gas floored at zero per period at field level`,
    `# Closure: the terms agree with the engine VRR series to a relative ${d.ledger.closure.toExponential(1)}`,
    ...(d.withheld ? [`# VRR withheld: ${d.withheld}`] : []),
  ];
  const R = u.label('reservoir');
  const head = [
    'period', `oil_${u.label('oil')}`, `water_${u.label('water')}`, `gas_${u.label('gas')}`, `water_inj_${u.label('water')}`, `gas_inj_${u.label('gas')}`,
    `Bo_${u.label('bo')}`, `Bw_${u.label('bw')}`, `Bg_${u.label('bg')}`, `Rs_${u.label('rs')}`, `pressure_${u.label('pressure')}`, 'fvf_set',
    `oil_voidage_${R}`, `water_voidage_${R}`, `free_gas_${u.label('gas')}`, `free_gas_voidage_${R}`, `produced_voidage_${R}`,
    `water_injected_${R}`, `gas_injected_${R}`, `injected_${R}`, 'vrr_instantaneous', 'vrr_rolling', 'vrr_cumulative',
  ];
  const lines = d.ledger.rows.map((r, i) => {
    const p = d.periodsWithPressure[i]?.pressure;
    const fromPeriod = Object.values(r.fvfFrom).includes('period');
    const set = !fromPeriod ? 'constant' : d.pvt.active && d.pvt.overrides?.[i] ? (d.pvt.mode === 'table' ? 'pvt-1 table' : 'correlations') : 'typed per period';
    return [
      r.label || `P${i + 1}`, num(u.show('oil', r.Np)), num(u.show('water', r.Wp)), num(u.show('gas', r.Gp)), num(u.show('water', r.Wi)), num(u.show('gas', r.Gi)),
      num(u.show('bo', r.fvf.Bo)), num(u.show('bw', r.fvf.Bw)), num(u.show('bg', r.fvf.Bg)), num(u.show('rs', r.fvf.Rs)), Number.isFinite(p) ? num(u.show('pressure', p)) : '', set,
      num(u.show('reservoir', r.oilRB)), num(u.show('reservoir', r.waterRB)), num(u.show('gas', r.freeGasMscf)), num(u.show('reservoir', r.freeGasRB)), num(u.show('reservoir', r.producedRB)),
      num(u.show('reservoir', r.injWaterRB)), num(u.show('reservoir', r.injGasRB)), num(u.show('reservoir', r.injectedRB)),
      d.withheld ? '' : num(r.instantaneousVRR), d.withheld ? '' : num(d.rolling[i]), d.withheld ? '' : num(r.cumulativeVRR),
    ];
  });
  const t = d.ledger.totals;
  lines.push([
    'total', num(u.show('oil', t.Np)), num(u.show('water', t.Wp)), num(u.show('gas', t.Gp)), num(u.show('water', t.Wi)), num(u.show('gas', t.Gi)),
    '', '', '', '', '', '',
    num(u.show('reservoir', t.oilRB)), num(u.show('reservoir', t.waterRB)), num(u.show('gas', t.freeGasMscf)), num(u.show('reservoir', t.freeGasRB)), num(u.show('reservoir', t.producedRB)),
    num(u.show('reservoir', t.injWaterRB)), num(u.show('reservoir', t.injGasRB)), num(u.show('reservoir', t.injectedRB)),
    '', '', d.withheld ? '' : num(t.cumulativeVRR),
  ]);
  return [...header.map((h) => h.replace(/\r?\n/g, ' ')), head.map(q).join(','), ...lines.map((l) => l.map(q).join(','))].join('\n');
}

export const ledgerCsvName = ({ projectName } = {}) => {
  const base = String(projectName || 'vrr').replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '_');
  return `VRR_Ledger_${base || 'vrr'}.csv`;
};

/**
 * The manual period grid as a file the grid's own import reads back
 * (label, Np, Wp, Gp, Wi, Gi with the display unit in each head). Values the
 * grid holds as typed text that is not a number are written as they are.
 */
export function buildGridCsv(periods, system = 'oilfield') {
  const u = vrrUnits(system);
  const kinds = { Np: 'oil', Wp: 'water', Gp: 'gas', Wi: 'water', Gi: 'gas' };
  const head = ['label', ...Object.keys(kinds).map((k) => `${k} (${u.label(kinds[k])})`)];
  const rows = (periods || []).map((p) => [p.label ?? '', ...Object.entries(kinds).map(([k, kind]) => u.text(kind, p[k] ?? ''))]);
  return [head.map(q).join(','), ...rows.map((r) => r.map(q).join(','))].join('\n');
}
