// Main area for the Displacement tab: KPI row, mobility banner, kr / fw+Welge
// / recovery charts (the white ChartFrame standard), moved from the retired
// FractionalFlowAnalyzer page and driven by the generalized engine.
import React, { useMemo } from 'react';
import { Info } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Legend,
} from 'recharts';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useWaterfloodDesign } from '@/contexts/WaterfloodDesignContext';
import { ChartCard, Kpi, LINE, WarningBanner, fmt } from './primitives';

const axisProps = { stroke: CHART_COLORS.axisLine, tick: { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize } };
const tooltipProps = { contentStyle: TOOLTIP_STYLE, labelStyle: { color: CHART_COLORS.tooltipText }, itemStyle: { color: CHART_COLORS.tooltipText } };
const legendProps = { wrapperStyle: { fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText } };

const TONE = {
  good: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
  info: 'text-sky-400 border-sky-500/40 bg-sky-500/10',
  warn: 'text-amber-400 border-amber-500/40 bg-amber-500/10',
  neutral: 'text-slate-400 border-slate-600/40 bg-slate-700/20',
};

const DisplacementResults = () => {
  const { displacement, displacementSpec } = useWaterfloodDesign();
  const bl = displacement?.bl;
  const M = displacement?.M;
  const Swc = displacement?.curves?.[0]?.Sw;

  const krData = useMemo(
    () => (displacement ? displacement.curves.map((c) => ({ Sw: Number(c.Sw.toFixed(3)), krw: Number(c.krw.toFixed(4)), kro: Number(c.kro.toFixed(4)) })) : []),
    [displacement],
  );

  const fwData = useMemo(() => {
    if (!displacement || Swc == null) return [];
    return displacement.curves.map((c) => {
      const tan = bl?.fwPrimeF != null ? bl.fwPrimeF * (c.Sw - Swc) : null;
      const tangent = tan != null && c.Sw <= (bl.SwAvgBt ?? -Infinity) && tan <= 1.0001 ? Number(Math.min(1, tan).toFixed(4)) : null;
      return { Sw: Number(c.Sw.toFixed(3)), fw: Number(c.fw.toFixed(4)), tangent };
    });
  }, [displacement, bl, Swc]);

  const recData = useMemo(
    () => (displacement ? displacement.recovery.filter((r) => r.Qi <= 8).map((r) => ({ Qi: Number(r.Qi.toFixed(3)), ED: Number((r.ED * 100).toFixed(2)) })) : []),
    [displacement],
  );

  if (!displacement) {
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 px-4 py-3 text-sm">
        {displacementSpec.error || 'Enter valid displacement inputs.'}
      </div>
    );
  }

  const mobilityTone = M == null ? 'neutral' : M <= 1 ? 'good' : M <= 3 ? 'info' : 'warn';

  return (
    <div className="space-y-4 overflow-y-auto">
      <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
        <Kpi title="Mobility ratio M" value={fmt.f2(M)} accent />
        <Kpi title="Front Sw (Swf)" value={fmt.f3(bl?.Swf)} />
        <Kpi title="fw at front" value={fmt.f2(bl?.fwf)} />
        <Kpi title="PV inj. @ breakthrough" value={fmt.f2(bl?.QiBt)} unit="PV" />
        <Kpi title="Recovery @ BT" value={fmt.pct(bl?.EDbt)} />
        <Kpi title="Ultimate recovery ED" value={fmt.pct(bl?.EDmax)} />
      </div>

      <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${TONE[mobilityTone]}`}>
        <Info className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="text-sm">
          <span className="font-semibold">Endpoint mobility ratio M = {fmt.f2(M)}. </span>
          {M == null ? 'Enter valid inputs.' : M <= 1
            ? 'Favorable displacement (M ≤ 1) with piston-like sweep and late water breakthrough.'
            : M <= 3
            ? 'Moderately unfavorable (1 < M ≤ 3) with some viscous fingering and earlier breakthrough.'
            : 'Unfavorable displacement (M > 3): strong fingering, early breakthrough, prolonged high-water-cut tail.'}
        </div>
      </div>

      <WarningBanner warnings={displacement.warnings} />

      <div className="grid xl:grid-cols-2 gap-4">
        <ChartCard title="Relative permeability">
          <LineChart data={krData} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis dataKey="Sw" {...axisProps} type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => v.toFixed(1)} />
            <YAxis {...axisProps} domain={[0, 'auto']} />
            <Tooltip {...tooltipProps} />
            <Legend {...legendProps} />
            <Line type="monotone" dataKey="krw" name="krw" stroke={LINE.water} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="kro" name="kro" stroke={LINE.oil} strokeWidth={2} dot={false} />
          </LineChart>
        </ChartCard>

        <ChartCard title="Fractional flow fw with Welge tangent">
          <LineChart data={fwData} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis dataKey="Sw" {...axisProps} type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => v.toFixed(1)} />
            <YAxis {...axisProps} domain={[0, 1]} />
            <Tooltip {...tooltipProps} />
            <Legend {...legendProps} />
            {bl?.Swf != null && <ReferenceLine x={Number(bl.Swf.toFixed(3))} stroke={LINE.fw} strokeDasharray="4 4" label={{ value: 'Swf', fill: LINE.fw, fontSize: 11, position: 'top' }} />}
            <Line type="monotone" dataKey="fw" name="fw" stroke={LINE.fw} strokeWidth={2} dot={false} />
            <Line type="linear" dataKey="tangent" name="Welge tangent" stroke={LINE.tangent} strokeWidth={1.5} strokeDasharray="5 4" dot={false} connectNulls />
          </LineChart>
        </ChartCard>
      </div>

      <ChartCard title="Oil recovery vs pore volumes injected">
        <LineChart data={recData} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis dataKey="Qi" {...axisProps} type="number" domain={[0, 'dataMax']} tickFormatter={(v) => v.toFixed(1)} label={{ value: 'PV injected', fill: CHART_COLORS.axisLabel, fontSize: 11, position: 'insideBottom', dy: 12 }} />
          <YAxis {...axisProps} domain={[0, 'auto']} label={{ value: 'ED (%)', angle: -90, fill: CHART_COLORS.axisLabel, fontSize: 11, position: 'insideLeft', dy: 20 }} />
          <Tooltip {...tooltipProps} />
          {bl?.EDmax != null && <ReferenceLine y={Number((bl.EDmax * 100).toFixed(1))} stroke={LINE.ref} strokeDasharray="5 5" label={{ value: 'ED max', fill: LINE.ref, fontSize: 11, position: 'right' }} />}
          <Line type="monotone" dataKey="ED" name="Recovery ED" stroke={LINE.oil} strokeWidth={2} dot={false} />
        </LineChart>
      </ChartCard>

      <p className="text-xs text-slate-500">
        1-D Buckley-Leverett displacement, capillary pressure neglected. Front saturation from the Welge tangent to fw from (Swc, 0);
        PV injected at breakthrough = 1 / fw′(Swf). With the dip term on, fw carries the field-unit gravity correction (updip positive).
      </p>
    </div>
  );
};

export default DisplacementResults;
