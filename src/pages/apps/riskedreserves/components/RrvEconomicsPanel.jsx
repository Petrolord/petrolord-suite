// The Economics tab of Risked Reserves Valuation (upgrade U2-002,
// 2026-10-02): where the value of a discovery and the minimum economic
// field size of the selected prospect come from. A small stated economic
// model on the canonical screening NPV gives both, so they cannot
// contradict each other; entered values and a typed MEFS stay possible, and
// the panel says which is in use. The table and the plot are the report's
// own rows and series (services/rrvReportModel economicsModel).

import React from 'react';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import NumCell from './NumCell';
import ValueSizeChart from './ValueSizeChart';
import { ECON_MODEL_FIELDS, ECON_ENGINE } from '../services/rrvEconomics';
import { F } from '../services/rrvReportModel';

const card = 'rounded border border-pl-border bg-pl-surface p-3';
const h = 'text-xs font-semibold text-pl-text mb-2';
const NUMERIC = /^[-\d.,%/ ]+$/;

const VALUE_CHOICES = [
  ['model', 'Economic model', 'Value per barrel, development cost and MEFS follow from the assumptions below'],
  ['entered', 'Entered values', 'Type the value per barrel and the development cost in the prospect table'],
];
const MEFS_CHOICES = [
  ['derived', 'Derived', 'The size at which a discovery is worth zero under the value above'],
  ['typed', 'Typed', 'Type the MEFS in the prospect table'],
];

function Choice({ name, value, choices, onChange, disabled, testId }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1" role="radiogroup" aria-label={name} data-testid={testId} data-value={value}>
      {choices.map(([id, label, hint]) => (
        <label key={id} className="inline-flex items-center gap-1.5 text-xs text-pl-text" title={hint}>
          <input type="radio" name={name} value={id} checked={value === id} disabled={disabled} onChange={() => onChange(id)} data-testid={`${testId}-${id}`} />
          {label}
        </label>
      ))}
    </div>
  );
}

/**
 * @param {{prospect: object, model: ?object, resolved: object, units: object, readOnly?: boolean,
 *   onValueBasis: function(string): void, onMefsBasis: function(string): void, onModel: function(string, *): void,
 *   extraChoices?: Array, children?: *}} props
 *   `model` is the report model of the prospect (its `economics` block holds the rows and the series)
 */
export default function RrvEconomicsPanel({ prospect, model, resolved, units, readOnly = false, onValueBasis, onMefsBasis, onModel, extraChoices = [], children = null }) {
  const econ = prospect.econ || { value: 'entered', mefs: 'typed', model: {} };
  const ec = model?.valued ? model.economics : null;
  const cx = (pts) => (pts ? pts.map(([x, y]) => [units.volume(x), y]) : null);
  const e = model?.e;
  const sc = { p90: Number(prospect.p90), p50: Number(prospect.p50), p10: Number(prospect.p10) };
  return (
    <div className="space-y-3" data-testid="rrv-economics">
      <div className={card}>
        <div className={h}>Where the economics of {prospect.name} come from</div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div>
            <div className="text-[11px] text-pl-muted mb-1">Value of a discovery (value per barrel u and development cost D)</div>
            <Choice name={`rrv-value-basis-${prospect.id}`} testId="rrv-value-basis" value={econ.value} disabled={readOnly} onChange={onValueBasis}
              choices={[VALUE_CHOICES[0], ...extraChoices, VALUE_CHOICES[1]]} />
          </div>
          <div>
            <div className="text-[11px] text-pl-muted mb-1">Minimum economic field size (MEFS)</div>
            <Choice name={`rrv-mefs-basis-${prospect.id}`} testId="rrv-mefs-basis" value={econ.mefs} disabled={readOnly} onChange={onMefsBasis} choices={MEFS_CHOICES} />
          </div>
        </div>
        {resolved.problem && <p className="mt-2 text-xs text-pl-warning-text" data-testid="rrv-economics-problem">{resolved.problem}</p>}
        <dl className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-1 text-xs" data-testid="rrv-economics-derived">
          {[
            ['MEFS in use', resolved.mefs === '' || resolved.mefs == null ? EMPTY_VALUE : `${F.plain(units.volume(Number(resolved.mefs)))} ${units.volumeLabel}`, econ.mefs === 'derived' ? 'derived' : 'typed', 'mefs'],
            ['Value per barrel u', resolved.unitValue === '' || resolved.unitValue == null ? EMPTY_VALUE : `${F.plain(units.unitValue(Number(resolved.unitValue)))} ${units.unitValueLabel}`, econ.value === 'model' ? 'derived' : econ.value === 'epe' ? 'from the case' : 'entered', 'unitValue'],
            ['Development cost D', resolved.devCost === '' || resolved.devCost == null ? EMPTY_VALUE : `${F.plain(Number(resolved.devCost))} $MM`, econ.value === 'model' ? 'derived' : econ.value === 'epe' ? 'from the case' : 'entered', 'devCost'],
          ].map(([k, val, how, id]) => (
            <div key={k} className="flex gap-2"><dt className="text-pl-muted">{k}</dt><dd className="font-pl-mono tabular-nums text-pl-text" data-testid={`rrv-econ-${id}`}>{val}</dd><dd className="text-pl-muted">({how})</dd></div>
          ))}
        </dl>
        {econ.mefs === 'typed' && Number.isFinite(resolved.derivedMefs) && (
          <p className="mt-1 text-[11px] text-pl-muted" data-testid="rrv-econ-size-that-pays">
            The size that pays under the stated value is {F.plain(units.volume(resolved.derivedMefs))} {units.volumeLabel}.
          </p>
        )}
      </div>

      {children}

      {econ.value === 'model' && (
        <div className={card} data-testid="rrv-econ-model">
          <div className={h}>Economic model (screening)</div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
            {ECON_MODEL_FIELDS.map(([k, label, unit, kind]) => {
              const perVolume = kind === 'perVolume';
              return (
                <label key={k} className="text-[11px] text-pl-muted">{label}, {perVolume ? units.unitValueLabel : unit}
                  <NumCell value={econ.model?.[k]} disabled={readOnly} aria-label={`Economic model: ${label}`} data-testid={`rrv-model-${k}`}
                    show={(x) => (perVolume ? units.unitValue(x) : x)} read={(x) => (perVolume ? units.unitValueIn(x) : x)}
                    onCommit={(val) => onModel(k, val)} />
                </label>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-pl-muted">
            Every net present value is the Suite screening engine: {ECON_ENGINE}. The development capex is spent in the year before first production; production declines exponentially over the producing life. This is the model ReservoirCalc Pro uses for its success-case economics.
          </p>
        </div>
      )}

      {ec && (
        <>
          <div className={card} data-testid="rrv-econ-basis">
            <div className={h}>The MEFS and the value of a discovery</div>
            <dl className="space-y-1 text-xs">
              {ec.basis.map(([k, val]) => (
                <div key={k} className="flex flex-wrap gap-x-2"><dt className="w-56 shrink-0 text-pl-muted">{k}</dt><dd className="flex-1 min-w-[200px] text-pl-text">{val}</dd></div>
              ))}
            </dl>
          </div>
          <ValueSizeChart curve={cx(ec.series.curve)} line={cx(ec.series.line)} mefs={units.volume(e.mefs)} volumeLabel={units.volumeLabel}
            marks={{ p90: units.volume(sc.p90), p50: units.volume(sc.p50), p10: units.volume(sc.p10) }} />
          <div className={card} data-testid="rrv-econ-table">
            <div className={h}>Value by field size</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-pl-muted"><tr>{ec.table.head.map((c) => <th key={c} className="text-left font-medium px-1.5 py-1 border-b border-pl-border">{c}</th>)}</tr></thead>
                <tbody>
                  {ec.table.body.map((row) => (
                    <tr key={row[0]} className="border-b border-pl-border last:border-0">
                      {row.map((c, j) => (
                        // eslint-disable-next-line react/no-array-index-key
                        <td key={j} className={`px-1.5 py-1 text-pl-text ${NUMERIC.test(String(c ?? '')) ? 'font-pl-mono tabular-nums' : ''}`}>{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-pl-muted">{ec.table.note}</p>
          </div>
        </>
      )}
    </div>
  );
}
