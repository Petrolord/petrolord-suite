// Coefficients tab: fitting the Gilbert family to this well's own tests.
//
// This is worth more than any published set. Gilbert, Ros, Baxendell,
// Achong and Pilehvari span a factor of twelve in their leading
// constant and are not interchangeable; picking one by habit is how a
// choke calculation goes quietly wrong. A well with a handful of tests
// on the production spine can have its own, and the correlation being a
// power law in every variable means the fit is an ordinary least
// squares once logs are taken.
import React, { useMemo } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { Sigma, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useChoke } from '@/contexts/ChokePerformanceContext';
import { Field, fmt, Stat, Row } from './fields';

const CoefficientsPanel = () => {
  const {
    inputs, setSection, chokePoints, fitted, runFit, chokeCoeffs, model,
  } = useChoke();

  const scatter = useMemo(() => (fitted?.ok ? fitted.residuals.map((r) => ({
    measured: r.pwh, predicted: r.predictedPwh, date: r.date, s64: r.s64,
  })) : []), [fitted]);

  const span = useMemo(() => {
    if (!scatter.length) return [0, 1];
    const all = scatter.flatMap((p) => [p.measured, p.predicted]);
    return [Math.min(...all) * 0.9, Math.max(...all) * 1.1];
  }, [scatter]);

  if (model?.phase === 'gas') {
    return (
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="py-8">
          <p className="text-sm text-slate-500 text-center">
            Coefficient fitting is for the Gilbert-family multiphase correlations. A gas well runs
            on the single-phase gas choke, whose discharge coefficient is the one number to tune and
            sits on the Operating Point inputs.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            <span className="flex items-center gap-2">
              <Sigma className="w-4 h-4 text-sky-400" /> Fit the correlation to this well
            </span>
            <span className="block text-xs font-normal text-slate-500 mt-0.5">
              From the well tests on the production spine. A test needs a rate, a gas-liquid ratio,
              a bean size and a tubing head pressure to be usable.
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <Field
              label="What to fit"
              hint="Fitting all three needs at least three tests that vary in both gas-liquid ratio and bean size."
            >
              <Select value={inputs.fit.mode} onValueChange={(v) => setSection('fit', 'mode', v)}>
                <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
                  <SelectItem value="all">All three coefficients</SelectItem>
                  <SelectItem value="cOnly">The leading constant only</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {inputs.fit.mode === 'cOnly' && (
              <Field label="Hold the exponents at">
                <Select value={inputs.fit.fixedSet} onValueChange={(v) => setSection('fit', 'fixedSet', v)}>
                  <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
                    {Object.entries(chokeCoeffs).map(([id, k]) => (
                      <SelectItem key={id} value={id}>
                        {id.charAt(0).toUpperCase() + id.slice(1)} (m {k.m}, n {k.n})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
            <Button onClick={runFit} className="h-9">
              <Sigma className="w-3.5 h-3.5 mr-1" /> Fit to {chokePoints.length} test
              {chokePoints.length === 1 ? '' : 's'}
            </Button>
          </div>

          {!chokePoints.length && (
            <p className="text-sm text-slate-500 py-4 text-center">
              No usable well tests on the spine. Link a field on the Well Model tab; tests import
              through the Surveillance Studio.
            </p>
          )}

          {fitted && !fitted.ok && (
            <div className="rounded-md border border-amber-900/60 bg-amber-950/30 p-3">
              <p className="text-[11px] text-amber-200/90 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {fitted.error}
              </p>
            </div>
          )}

          {fitted?.ok && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 border-t border-slate-800 pt-4">
                <Stat label="c" value={fmt(fitted.c, 3)} hint="leading constant" />
                <Stat label="m" value={fmt(fitted.m, 4)} hint="gas-liquid ratio exponent" />
                <Stat label="n" value={fmt(fitted.n, 4)} hint="bean exponent" />
                <Stat
                  label="Misses by"
                  value={fmt(fitted.rmsePct, 1)}
                  unit="%"
                  accent={fitted.rmsePct > 15 ? 'text-amber-300' : 'text-emerald-400'}
                />
                <Stat label="R squared" value={fmt(fitted.r2, 4)} />
              </div>

              <div className="border-t border-slate-800 pt-4">
                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">
                  Against the published sets
                </p>
                {Object.entries(chokeCoeffs).map(([id, k]) => (
                  <Row
                    key={id}
                    label={id.charAt(0).toUpperCase() + id.slice(1)}
                    value={`c ${k.c}, m ${k.m}, n ${k.n}`}
                    hint={`this well's c is ${(fitted.c / k.c).toFixed(2)} times ${id}'s`}
                  />
                ))}
              </div>

              {fitted.warnings.length > 0 && (
                <ul className="space-y-2 border-t border-slate-800 pt-4">
                  {fitted.warnings.map((w) => (
                    <li key={w.code} className="text-sm text-amber-100/80 flex gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400" />
                      <span>{w.message}</span>
                    </li>
                  ))}
                </ul>
              )}

              {scatter.length > 1 && (
                <ChartFrame height={320} exportFilename="choke-coefficient-fit">
                  <ScatterChart margin={{ top: 8, right: 28, bottom: 12, left: 8 }}>
                    <CartesianGrid {...GRID_STYLE} />
                    <XAxis
                      type="number"
                      dataKey="measured"
                      domain={span}
                      stroke={CHART_COLORS.axisLine}
                      tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                      label={{
                        value: 'Measured wellhead pressure (psia)', position: 'insideBottom', offset: -8,
                        fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                      }}
                    />
                    <YAxis
                      type="number"
                      dataKey="predicted"
                      domain={span}
                      stroke={CHART_COLORS.axisLine}
                      tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                      label={{
                        value: 'Correlation (psia)', angle: -90, position: 'insideLeft',
                        fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                      }}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      labelStyle={{ color: CHART_COLORS.tooltipText }}
                      itemStyle={{ color: CHART_COLORS.tooltipText }}
                      formatter={(v, name) => [`${Math.round(Number(v))} psia`, name]}
                    />
                    <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
                    <ReferenceLine
                      segment={[{ x: span[0], y: span[0] }, { x: span[1], y: span[1] }]}
                      stroke={CHART_COLORS.axisLine}
                      strokeDasharray="4 4"
                    />
                    <Scatter name="Tests" data={scatter} fill="#2563eb" />
                  </ScatterChart>
                </ChartFrame>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                      <th className="text-left font-semibold px-3 py-2">Test</th>
                      <th className="text-right font-semibold px-3 py-2">Bean</th>
                      <th className="text-right font-semibold px-3 py-2">Liquid (stb/d)</th>
                      <th className="text-right font-semibold px-3 py-2">GLR (scf/stb)</th>
                      <th className="text-right font-semibold px-3 py-2">Measured (psia)</th>
                      <th className="text-right font-semibold px-3 py-2">Fitted (psia)</th>
                      <th className="text-right font-semibold px-3 py-2">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fitted.residuals.map((r) => (
                      <tr key={r.id || `${r.date}-${r.s64}`} className="border-b border-slate-800/60 last:border-0">
                        <td className="px-3 py-2 text-slate-300">{r.date || '--'}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-300">{r.s64}/64</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-300">{fmt(r.q)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-300">{fmt(r.glr)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-300">{fmt(r.pwh)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-300">{fmt(r.predictedPwh)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${Math.abs(r.errorPct) > 15 ? 'text-amber-300' : 'text-slate-300'}`}>
                          {fmt(r.errorPct, 1)} %
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CoefficientsPanel;
