// The recipe, what it achieves, what it gives away, and what each spec costs (DS2).
import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
} from 'recharts';
import { AlertTriangle, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useBlendOptimizer } from '@/contexts/BlendOptimizerContext';

const fmt = (v, dp = 2) => (Number.isFinite(v) ? v.toFixed(dp) : 'n/a');
const COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#dc2626', '#0891b2'];

const RecipeResults = () => {
  const { result, giveaway, inputs, setUnitValue } = useBlendOptimizer();

  if (result.status === 'invalid') {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-6 text-slate-300">
        {result.error}
      </div>
    );
  }

  if (result.status !== 'optimal') {
    return (
      <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <h3 className="font-semibold text-amber-200">No recipe meets these specifications</h3>
            <p className="text-sm text-amber-100/90 mt-2">{result.error}</p>
            <p className="text-sm text-amber-100/70 mt-2">
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
        <div className="rounded border border-slate-800 bg-slate-900/60 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Blend cost</p>
          <p className="text-xl font-bold text-lime-300 mt-1">${fmt(result.unitCost)}/bbl</p>
        </div>
        <div className="rounded border border-slate-800 bg-slate-900/60 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Total</p>
          <p className="text-xl font-bold text-white mt-1">${fmt(result.totalCost, 0)}</p>
        </div>
        <div className="rounded border border-slate-800 bg-slate-900/60 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Volume</p>
          <p className="text-xl font-bold text-white mt-1">{fmt(result.totalVolume, 0)} bbl</p>
        </div>
        <div className="rounded border border-slate-800 bg-slate-900/60 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Binding specs</p>
          <p className="text-sm font-medium text-amber-300 mt-1">
            {result.bindingSpecs.length > 0 ? result.bindingSpecs.join(', ') : 'none'}
          </p>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-2">The recipe</h3>
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
            <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [`${fmt(v, 1)} bbl`, 'Volume']} />
            <Legend verticalAlign="top" wrapperStyle={{ fontSize: '12px' }} />
            <Bar dataKey="volume" name="Volume">
              {recipeRows.map((r, i) => <Cell key={r.id} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ChartFrame>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-2">What the blend achieves</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left">
                <th className="p-2 text-slate-400 font-medium">Property</th>
                <th className="p-2 text-slate-400 font-medium">Basis</th>
                <th className="p-2 text-slate-400 font-medium text-right">Limit</th>
                <th className="p-2 text-slate-400 font-medium text-right">Achieved</th>
                <th className="p-2 text-slate-400 font-medium text-right">Giveaway</th>
                <th className="p-2 text-slate-400 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {result.achieved.map((a) => (
                <tr key={a.id} className="border-b border-slate-800/60">
                  <td className="p-2 text-white">{a.name}{a.unit ? ` (${a.unit})` : ''}</td>
                  <td className="p-2 text-slate-500 text-xs">{a.basis}</td>
                  <td className="p-2 text-right font-mono text-slate-400">
                    {a.min !== null ? `min ${a.min}` : ''}{a.min !== null && a.max !== null ? ' / ' : ''}{a.max !== null ? `max ${a.max}` : ''}
                  </td>
                  <td className="p-2 text-right font-mono text-white">{fmt(a.value, 2)}</td>
                  <td className="p-2 text-right font-mono text-slate-300">
                    {a.applied && a.giveaway !== null ? fmt(a.giveaway, 2) : '-'}
                  </td>
                  <td className="p-2 text-xs">
                    {!a.applied
                      ? <span className="text-amber-300">not applied</span>
                      : a.binding
                        ? <span className="text-amber-300">binding</span>
                        : <span className="text-slate-500">slack</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {result.skippedSpecs.length > 0 && (
          <div className="mt-2 flex items-start gap-2 rounded border border-amber-800/60 bg-amber-950/30 p-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-200">
              {result.skippedSpecs.map((s) => s.name).join(', ')} could not be applied: not every
              component carries the property. The recipe above does not guarantee them, and it says so
              rather than appearing to meet a specification nobody checked.
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="text-sm font-semibold text-white mb-1">Quality giveaway</h3>
          <p className="text-[11px] text-slate-500 mb-3">
            Quality handed over for nothing: how far inside each limit the blend sits. Put a value on
            a unit of the property to price it. Where you do not, the gap is still shown without a
            price, because a giveaway figure built on a guessed unit value is worse than none.
          </p>
          {giveaway.length === 0 ? (
            <p className="text-sm text-slate-400">
              Nothing is being given away: every applied specification is binding or has no room.
            </p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {giveaway.map((g) => (
                  <tr key={g.id} className="border-b border-slate-800/60 last:border-0">
                    <td className="py-2 text-slate-300">{g.name}</td>
                    <td className="py-2 text-right font-mono text-slate-300">{fmt(g.giveaway, 2)} {g.unit}</td>
                    <td className="py-2 pl-3 w-24">
                      <Input
                        type="number" step="any" placeholder="$/unit"
                        value={inputs.unitValues[g.id] ?? ''}
                        onChange={(e) => setUnitValue(g.id, e.target.value)}
                        className="h-7 bg-slate-950 border-slate-700 text-xs text-right"
                      />
                    </td>
                    <td className="py-2 text-right font-mono text-lime-300 w-24">
                      {g.value === null ? 'not priced' : `$${fmt(g.value, 0)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="text-sm font-semibold text-white mb-1">What each constraint is costing</h3>
          <p className="text-[11px] text-slate-500 mb-3">
            The shadow price of a row: what one unit of relief on it would save. Zero means the
            constraint is not binding and relaxing it buys nothing.
          </p>
          <table className="w-full text-sm">
            <tbody>
              {result.shadowPrices.map((row) => (
                <tr key={row.name} className="border-b border-slate-800/60 last:border-0">
                  <td className="py-2 text-slate-300">{row.name}</td>
                  <td className="py-2 text-right font-mono text-white">
                    {Number.isFinite(row.price) ? `$${fmt(Math.abs(row.price), 3)}` : 'n/a'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-slate-500 mt-3 flex items-start gap-1">
            <Info className="w-3 h-3 mt-0.5 shrink-0" />
            The volume row&apos;s price is the marginal cost of one more barrel of product.
          </p>
        </div>
      </div>
    </div>
  );
};

export default RecipeResults;
