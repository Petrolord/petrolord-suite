/**
 * The laboratory data as the report and the screen state them
 * (FLUID-U2-001; RL1, RL6, RL8): which tables are loaded and how they were
 * read, the basis they are compared on, and the misfit of the model
 * against each measured property. One builder for the Report tab, the PDF,
 * the lab card on screen and the pvt-1 block.
 *
 * Pure formatting: the numbers are labMisfit's.
 */
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { labDataOf, labMisfit, labComparison, labSaturationPressure, LAB_KINDS } from './labData.js';

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const pct = (v, d = 1) => (finite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(d)}%` : EMPTY_VALUE);
const absPct = (v, d = 1) => (finite(v) ? `${Math.abs(v).toFixed(d)}%` : EMPTY_VALUE);
const th = (v) => (finite(v) ? Math.round(v).toLocaleString('en-US') : EMPTY_VALUE);

const BASIS_WORDS = {
  separator: 'Separator basis, as entered',
  adjusted: 'Differential, adjusted to the separator',
  differential: 'Differential against separator basis',
};

/** "Bo: 12 points, mean deviation 1.8 percent, largest 3.2 percent at 1,515 psia." */
export function misfitSentence(m, u) {
  if (!m.n) return `${m.label}: no laboratory point inside the pressure range of the table.`;
  const at = `${th(u.show('pressure', m.maxAt))} ${u.label('pressure')}`;
  const basis = m.basis === 'differential' ? ' (differential data against a separator-basis table)' : '';
  return `${m.label}: ${m.n} point${m.n === 1 ? '' : 's'}, mean deviation ${m.meanAbsPct.toFixed(1)} percent, largest ${m.maxAbsPct.toFixed(1)} percent at ${at}${basis}.`;
}

/**
 * @param {{inputs: object, rows: object[], pb: ?number, tempF: ?number, u: object}} a
 *   rows, pb and tempF are those of the table the report prints
 * @returns {?{tables: {head: string[], rows: string[][]}, misfit: {head: string[], rows: string[][], note: string},
 *   sentences: string[], notes: string[], stats: object[], comparison: object, saturation: ?object}}
 *   null when no laboratory table is loaded
 */
export function buildLabSection({ inputs, rows, pb, tempF, u }) {
  const labData = labDataOf(inputs);
  const kinds = ['cce', 'dl', 'viscosity'].filter((k) => labData[k]);
  if (!kinds.length) return null;
  const comparison = labComparison(labData);
  const stats = labMisfit({ labData, rows, pb });
  const saturation = labSaturationPressure(labData);
  const notes = [...comparison.notes];

  for (const k of kinds) {
    const t = labData[k];
    if (finite(t.tempF) && finite(tempF) && Math.abs(t.tempF - tempF) > 0.5) {
      notes.push(`The ${LAB_KINDS[k].label.toLowerCase()} was measured at ${Number(u.show('temperature', t.tempF).toFixed(1))} ${u.label('temperature')} and the model table is at ${Number(u.show('temperature', tempF).toFixed(1))} ${u.label('temperature')}: the comparison is across temperatures.`);
    }
  }
  if (saturation && finite(pb)) {
    const dev = (100 * (pb - saturation.pressure)) / saturation.pressure;
    notes.push(`Laboratory saturation pressure ${th(u.show('pressure', saturation.pressure))} ${u.label('pressure')}; the model has ${th(u.show('pressure', pb))} ${u.label('pressure')} (${pct(dev)}).`);
  }
  const outside = stats.reduce((s, m) => s + m.outside, 0);
  if (outside) notes.push(`${outside} laboratory value${outside === 1 ? ' lies' : 's lie'} outside the pressure range of the model table and ${outside === 1 ? 'is' : 'are'} not in the misfit.`);

  const tables = {
    head: ['Laboratory table', 'Rows', 'Test temperature', 'File and how it was read'],
    rows: kinds.map((k) => {
      const t = labData[k];
      return [
        LAB_KINDS[k].label, String(t.rows.length),
        finite(t.tempF) ? `${Number(u.show('temperature', t.tempF).toFixed(1))} ${u.label('temperature')}` : EMPTY_VALUE,
        [t.source?.name, t.source?.summary].filter(Boolean).join('. ') || EMPTY_VALUE,
      ];
    }),
  };
  const misfit = {
    head: ['Property', 'Lab points', 'Mean deviation', 'Bias', 'Largest deviation', u.head('At pressure', 'pressure'), 'Basis'],
    rows: stats.map((m) => [
      m.label, String(m.n), absPct(m.meanAbsPct), pct(m.biasPct), absPct(m.maxAbsPct), m.n ? th(u.show('pressure', m.maxAt)) : EMPTY_VALUE,
      m.basis ? BASIS_WORDS[m.basis] : 'As measured',
    ]),
    note: 'Deviation is model minus laboratory, as a percent of the laboratory value, with the model read at the laboratory pressure by linear interpolation in the table (never across the saturation pressure). Bias is the mean signed deviation.',
  };
  return { tables, misfit, sentences: stats.map((m) => misfitSentence(m, u)), notes, stats, comparison, saturation, labData };
}

/** The lab data as the pvt-1 block carries it: what was loaded and how well the table matches it. */
export function labContractBlock({ inputs, rows, pb }) {
  const labData = labDataOf(inputs);
  const kinds = ['cce', 'dl', 'viscosity'].filter((k) => labData[k]);
  if (!kinds.length) return null;
  const comparison = labComparison(labData);
  const saturation = labSaturationPressure(labData);
  return {
    tables: kinds.map((k) => ({
      kind: k, rows: labData[k].rows.length, temperature_degF: labData[k].tempF ?? null,
      source: labData[k].source?.name || null, imported_at: labData[k].source?.importedAt || null,
    })),
    oil_basis: comparison.basis.oil,
    separator_test: labData.dlBasis === 'differential' && labData.separatorTest.bofb ? { Bofb: labData.separatorTest.bofb, Rsfb: labData.separatorTest.rsfb } : null,
    saturation_pressure_psia: saturation ? saturation.pressure : null,
    misfit: labMisfit({ labData, rows, pb }).map((m) => ({
      property: m.key, points: m.n, outside_table: m.outside,
      mean_abs_percent: finite(m.meanAbsPct) ? Number(m.meanAbsPct.toFixed(3)) : null,
      bias_percent: finite(m.biasPct) ? Number(m.biasPct.toFixed(3)) : null,
      max_abs_percent: finite(m.maxAbsPct) ? Number(m.maxAbsPct.toFixed(3)) : null,
      max_at_psia: m.maxAt ?? null,
      basis: m.basis || 'as-measured',
    })),
  };
}
