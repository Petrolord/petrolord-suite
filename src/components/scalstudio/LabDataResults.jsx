// Lab Data tab, main area (SC4): per-sample kr data with the Corey fit
// overlay (CIs, fit quality, apply-to-Curves), plus the normalized overlay
// across samples for exponent-consistency judgment.
import React, { useMemo } from 'react';
import {
  ComposedChart, Line, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRightCircle } from 'lucide-react';
import ChartFrame from '@/components/charts/ChartFrame';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE,
} from '@/utils/chartTheme';
import { useScalStudio } from '@/contexts/ScalStudioContext';
import { buildCoreyOilWater, normalizeKrTable } from '@/utils/scalCalculations';
import { Kpi, LINE, fmt, SCENARIO_COLORS } from '@/components/waterflooddesign/primitives';

const axisProps = {
  stroke: CHART_COLORS.axisLine,
  tick: { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize },
};

const ci = (pair) => (Array.isArray(pair) && pair.every(Number.isFinite)
  ? `${pair[0].toFixed(2)} to ${pair[1].toFixed(2)}`
  : 'n/a');

const LabDataResults = ({ selectedId }) => {
  const { samplesDerived, applyKrFitToCurves } = useScalStudio();
  const selected = samplesDerived.find((s) => s.id === selectedId) ?? null;

  const fitCurveRows = useMemo(() => {
    if (!selected?.krFit?.params) return null;
    return buildCoreyOilWater(selected.krFit.params, { n: 80 }).rows;
  }, [selected]);

  const normalizedOverlay = useMemo(() => {
    const usable = samplesDerived
      .map((s) => ({ s, norm: (s.krRows?.length ?? 0) >= 3 ? normalizeKrTable(s.krRows) : null }))
      .filter((x) => x.norm?.ok);
    return usable.map(({ s, norm }, i) => ({
      id: s.id,
      name: s.name,
      color: SCENARIO_COLORS[i % SCENARIO_COLORS.length],
      rows: norm.rows,
    }));
  }, [samplesDerived]);

  if (!selected) {
    return (
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="py-10 text-center text-sm text-slate-400">
          Select or add a core sample in the left rail. Each sample carries its own kr and Pc tables; the Capillary
          tab consumes the Pc data through the J-function.
        </CardContent>
      </Card>
    );
  }

  const fit = selected.krFit;

  return (
    <div className="space-y-4">
      {fit ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi title="nw (fit)" value={`${fmt.f2(fit.params.nw)}`} unit={`CI ${ci(fit.ci95.nw)}`} />
            <Kpi title="no (fit)" value={`${fmt.f2(fit.params.no)}`} unit={`CI ${ci(fit.ci95.no)}`} />
            <Kpi title="RMS (log10 kr)" value={fmt.f3(fit.rmsLog)} />
            <Kpi title="r² (log space)" value={fmt.f3(fit.r2Log)} accent={fit.r2Log > 0.98} />
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={() => applyKrFitToCurves(selected.id)}>
              <ArrowRightCircle className="w-4 h-4 mr-1.5" /> Use fit on the Curves tab
            </Button>
            {!fit.converged && (
              <p className="text-xs text-amber-400">The fit stopped at the iteration cap; treat the numbers as approximate.</p>
            )}
          </div>
        </>
      ) : (
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="py-4 text-sm text-slate-400">
            {selected.krFitError
              ?? 'Import a kr table (at least 3 rows) to fit Corey exponents for this sample.'}
          </CardContent>
        </Card>
      )}

      {(selected.krRows?.length ?? 0) >= 3 && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Lab kr with Corey fit — {selected.name}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ChartFrame height={300} exportFilename="scal-lab-kr-fit">
              <ComposedChart margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid {...GRID_STYLE} vertical={false} />
                <XAxis
                  dataKey="Sw" type="number" domain={[0, 1]}
                  tickFormatter={(v) => v.toFixed(1)} {...axisProps}
                  label={{ value: 'Water saturation Sw', position: 'insideBottom', offset: -4, fill: CHART_COLORS.axisText, fontSize: 11 }}
                />
                <YAxis
                  domain={[0, 1]} tickFormatter={(v) => v.toFixed(1)} {...axisProps}
                  label={{ value: 'kr', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={{ color: CHART_COLORS.tooltipText }}
                  formatter={(v, name) => [Number(v).toFixed(4), name]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Scatter data={selected.krRows} dataKey="krw" name="krw (lab)" fill={LINE.water} />
                <Scatter data={selected.krRows} dataKey="kro" name="kro (lab)" fill={LINE.oil} />
                {fitCurveRows && (
                  <>
                    <Line data={fitCurveRows} dataKey="krw" name="krw (Corey fit)" stroke={LINE.water} strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
                    <Line data={fitCurveRows} dataKey="kro" name="kro (Corey fit)" stroke={LINE.oil} strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
                  </>
                )}
              </ComposedChart>
            </ChartFrame>
          </CardContent>
        </Card>
      )}

      {normalizedOverlay.length >= 2 && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Normalized curves across samples</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ChartFrame height={280} exportFilename="scal-normalized-kr">
              <ComposedChart margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid {...GRID_STYLE} vertical={false} />
                <XAxis
                  dataKey="Swn" type="number" domain={[0, 1]}
                  tickFormatter={(v) => v.toFixed(1)} {...axisProps}
                  label={{ value: 'Normalized saturation Sw*', position: 'insideBottom', offset: -4, fill: CHART_COLORS.axisText, fontSize: 11 }}
                />
                <YAxis
                  domain={[0, 1]} tickFormatter={(v) => v.toFixed(1)} {...axisProps}
                  label={{ value: 'Normalized kr', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={{ color: CHART_COLORS.tooltipText }}
                  formatter={(v, name) => [Number(v).toFixed(4), name]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {normalizedOverlay.map((o) => (
                  <React.Fragment key={o.id}>
                    <Line data={o.rows} dataKey="krwN" name={`${o.name} krwN`} stroke={o.color} strokeWidth={1.5} dot={false} />
                    <Line data={o.rows} dataKey="kroN" name={`${o.name} kroN`} stroke={o.color} strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                  </React.Fragment>
                ))}
              </ComposedChart>
            </ChartFrame>
            <p className="text-[11px] text-slate-500 px-4 pb-3">
              Endpoint-normalized shapes. Samples from the same rock type should overlay; systematic spread means
              the Corey exponents genuinely differ and one averaged set will smear real character. Averaging stays
              a human decision: fit each sample, compare the exponents here, then type your chosen set on the
              Curves tab.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default LabDataResults;
