// The recipe, what it achieves, what it gives away, and what each spec costs (DS2).
import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts';
import { AlertTriangle, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { NumericTable, NumTh, NumRow, NumCell, NUMERIC_TABLE } from '@/components/ui/numeric-table';
import { useBlendOptimizer } from '@/contexts/BlendOptimizerContext';
import { useFullPrecision } from '@/components/fullprecision/FullPrecision';

// Senior test T1: thousands grouped ($86,123, not $86123) and a solver's
// -1e-12 shown as 0.00, not -0.00.
const fmt = (v, dp = 2) => {
  if (!Number.isFinite(v)) return 'n/a';
  const x = Math.abs(v) < 0.5 * 10 ** -dp ? 0 : v;
  return x.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
};
const COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#dc2626', '#0891b2'];

// Theme-role pieces (design system rollout w5e).
const PANEL = 'rounded-lg border border-pl-border bg-pl-surface p-4 shadow-pl-sm';
const TILE = 'rounded-lg border border-pl-border bg-pl-surface p-3 shadow-pl-sm';
const TILE_LABEL = 'text-[11px] uppercase tracking-wide text-pl-muted';
const TILE_VALUE = 'text-xl font-semibold font-pl-mono tabular-nums text-pl-text mt-1';
// A specification's state is status, so it carries its word and a tone.
const SPEC_STATE = {
  'not applied': 'border-pl-warning/40 bg-pl-warning-bg text-pl-warning-text',
  binding: 'border-pl-info/40 bg-pl-info-bg text-pl-info-text',
  slack: 'border-pl-border bg-pl-sunken text-pl-muted',
};
const SpecState = ({ state }) => (
  <span className={`inline-block rounded border px-1.5 py-0.5 text-[11px] font-medium ${SPEC_STATE[state]}`}>{state}</span>
);
// The two small money tables sit inside a panel, so they drop the card.
const SIDE_TABLE = 'border-0 bg-transparent p-0';

const RecipeResults = () => {
  const { result, giveaway, inputs, setUnitValue } = useBlendOptimizer();
  const { show } = useFullPrecision();

  if (result.status === 'invalid') {
    return (
      <div className="rounded-lg border border-pl-border bg-pl-surface p-6 text-pl-text">
        {result.error}
      </div>
    );
  }

  if (result.status !== 'optimal') {
    return (
      <div className="rounded-lg border border-pl-warning/40 bg-pl-warning-bg p-6 text-pl-warning-text">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <h3 className="font-semibold">No recipe meets these specifications</h3>
            <p className="text-sm mt-2">{result.error}</p>
            <p className="text-sm mt-2">
              That is a real answer about the problem, not a failure to solve it. Either a limit has
              to move or the pool needs a component that can reach it.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const recipeRows = result.recipe.filter((r) => r.volume > 1e-6);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className={TILE}>
          <p className={TILE_LABEL}>Blend cost</p>
          <p className={TILE_VALUE}>${fmt(result.unitCost)}/bbl</p>
        </div>
        <div className={TILE}>
          <p className={TILE_LABEL}>Total</p>
          <p className={`${TILE_VALUE} break-words`}>${show(fmt(result.totalCost, 0), result.totalCost)}</p>
        </div>
        <div className={TILE}>
          <p className={TILE_LABEL}>Volume</p>
          <p className={TILE_VALUE}>{fmt(result.totalVolume, 0)} bbl</p>
        </div>
        <div className={TILE}>
          <p className={TILE_LABEL}>Binding specs</p>
          <p className="text-sm font-medium text-pl-text mt-1">
            {result.bindingSpecs.length > 0 ? result.bindingSpecs.join(', ') : 'none'}
          </p>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-pl-text mb-2">The recipe</h3>
        <ChartFrame height={260} exportFilename="blend-recipe">
          <BarChart data={recipeRows} margin={{ top: 12, right: 24, left: 8, bottom: 40 }}>
            <CartesianGrid {...GRID_STYLE} vertical={false} />
            <XAxis
              dataKey="name" stroke={CHART_COLORS.axisLine}
              tick={{ fill: CHART_COLORS.axisText, fontSize: 11 }}
              interval={0} angle={-15} textAnchor="end" height={55}
            />
            <YAxis
              stroke={CHART_COLORS.axisLine}
              tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
              label={{
                value: 'Volume (bbl)', angle: -90, position: 'insideLeft',
                fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
              }}
            />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${show(fmt(v, 1), v)} bbl`, 'Volume']} />
            <Bar dataKey="volume" name="Volume">
              {recipeRows.map((r, i) => <Cell key={r.id} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ChartFrame>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-pl-text mb-2">What the blend achieves</h3>
        <NumericTable>
          <thead>
            <tr>
              <NumTh sticky>Property</NumTh>
              <NumTh>Basis</NumTh>
              <NumTh numeric>Limit</NumTh>
              <NumTh numeric>Achieved</NumTh>
              <NumTh numeric>Giveaway</NumTh>
              <NumTh>Status</NumTh>
            </tr>
          </thead>
          <tbody>
            {result.achieved.map((a) => (
              <NumRow key={a.id}>
                <td className={NUMERIC_TABLE.rowLabel}>{a.name}{a.unit ? ` (${a.unit})` : ''}</td>
                <td className="border-b border-pl-border px-3 py-2 text-xs text-pl-muted">{a.basis}</td>
                <NumCell signed={false} tone="text-pl-muted">
                  {a.min !== null ? `min ${a.min}` : ''}{a.min !== null && a.max !== null ? ' / ' : ''}{a.max !== null ? `max ${a.max}` : ''}
                </NumCell>
                <NumCell signed={false}>{fmt(a.value, 2)}</NumCell>
                <NumCell signed={false}>
                  {a.applied && a.giveaway !== null ? fmt(a.giveaway, 2) : '-'}
                </NumCell>
                <td className="border-b border-pl-border px-3 py-2 text-xs">
                  <SpecState state={!a.applied ? 'not applied' : a.binding ? 'binding' : 'slack'} />
                </td>
              </NumRow>
            ))}
          </tbody>
        </NumericTable>
        {result.skippedSpecs.length > 0 && (
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-pl-warning/40 bg-pl-warning-bg p-3 text-pl-warning-text">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            <p className="text-xs">
              {result.skippedSpecs.map((s) => s.name).join(', ')} could not be applied: not every
              component carries the property. The recipe above does not guarantee them, and it says so
              rather than appearing to meet a specification nobody checked.
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={PANEL}>
          <h3 className="text-sm font-semibold text-pl-text mb-1">Quality giveaway</h3>
          <p className="text-[11px] text-pl-muted mb-3">
            Quality handed over for nothing: how far inside each limit the blend sits. Put a value on
            a unit of the property to price it. Where you do not, the gap is still shown without a
            price, because a giveaway figure built on a guessed unit value is worse than none.
          </p>
          {giveaway.length === 0 ? (
            <p className="text-sm text-pl-muted">
              Nothing is being given away: every applied specification is binding or has no room.
            </p>
          ) : (
            <NumericTable className={SIDE_TABLE}>
              <tbody>
                {giveaway.map((g) => (
                  <NumRow key={g.id}>
                    <td className={NUMERIC_TABLE.rowLabel}>{g.name}</td>
                    <NumCell signed={false}>{fmt(g.giveaway, 2)} {g.unit}</NumCell>
                    <td className="border-b border-pl-border px-3 py-2 w-24">
                      <Input
                        type="number" step="any" placeholder="$/unit"
                        value={inputs.unitValues[g.id] ?? ''}
                        onChange={(e) => setUnitValue(g.id, e.target.value)}
                        className="h-7 text-xs text-right"
                      />
                    </td>
                    <NumCell value={g.value} tone={g.value === null ? 'text-pl-muted' : undefined} className={g.value === null ? 'font-pl-sans w-24' : 'w-24'}>
                      {g.value === null ? 'not priced' : `$${fmt(g.value, 0)}`}
                    </NumCell>
                  </NumRow>
                ))}
              </tbody>
            </NumericTable>
          )}
        </div>

        <div className={PANEL}>
          <h3 className="text-sm font-semibold text-pl-text mb-1">What each constraint is costing</h3>
          <p className="text-[11px] text-pl-muted mb-3">
            What one unit of relief on each specification would save over this blend, per unit
            of the property: per ppm of sulfur, per psi of RVP, per octane number. Relief means
            raising a maximum or lowering a minimum. Zero means the constraint is not binding and
            relaxing it buys nothing.
          </p>
          <NumericTable className={SIDE_TABLE}>
            <tbody>
              {result.shadowPrices.map((row) => (
                <NumRow key={row.name}>
                  <td className={NUMERIC_TABLE.rowLabel}>{row.name}</td>
                  <NumCell signed={false}>
                    {Number.isFinite(row.price) ? `$${show(fmt(row.price, 2), row.price)}` : 'n/a'}
                    <span className="text-[10px] text-pl-muted font-pl-sans">
                      {' '}per {row.per}
                    </span>
                  </NumCell>
                </NumRow>
              ))}
            </tbody>
          </NumericTable>
          <p className="text-[11px] text-pl-muted mt-3 flex items-start gap-1">
            <Info className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />
            The volume row&apos;s price is the marginal cost of one more barrel of product.
          </p>
        </div>
      </div>
    </div>
  );
};

export default RecipeResults;
