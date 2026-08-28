// The point-of-injection construction (Injection Point tab). Pressure
// across, depth down: the flowing gradient drawn from the wellhead
// against the injection line drawn from the surface injection pressure.
// Where they meet, less the transfer differential, is the deepest the
// available casing pressure can put gas into this well.
import React, { useMemo } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceDot,
} from 'recharts';
import { Target } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useGasLift } from '@/contexts/GasLiftDesignContext';
import { psiaToPsig } from '@/utils/production/gasLift';

const fmt = (v, digits = 0) => (Number.isFinite(v)
  ? v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  : '--');

const InjectionPointPanel = () => {
  const { installation, constructionTraverse, injectionPoint, inputs } = useGasLift();
  const design = installation.design;

  const data = useMemo(() => {
    if (!design || !constructionTraverse?.points?.length) return [];
    const curve = design.injectionCurve;
    const dp = parseFloat(inputs.design.dpTransferPsi) || 0;
    const stations = constructionTraverse.points
      .map((p) => ({ tvd: p.tvd, psig: psiaToPsig(p.p) }))
      .sort((a, b) => a.tvd - b.tvd);
    const injAt = (tvd) => {
      const ds = curve.depths;
      if (tvd <= ds[0]) return curve.pressures[0];
      if (tvd >= ds[ds.length - 1]) return curve.pressures[ds.length - 1];
      let i = 1;
      while (i < ds.length && ds[i] < tvd) i += 1;
      const f = (tvd - ds[i - 1]) / (ds[i] - ds[i - 1]);
      return curve.pressures[i - 1] + f * (curve.pressures[i] - curve.pressures[i - 1]);
    };
    return stations.map((s) => ({
      tvd: s.tvd,
      flowing: s.psig,
      injection: psiaToPsig(injAt(s.tvd)),
      injectionLessTransfer: psiaToPsig(injAt(s.tvd)) - dp,
    }));
  }, [design, constructionTraverse, inputs.design.dpTransferPsi]);

  if (!design) {
    return (
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="py-10 text-center text-slate-500 text-sm px-8">
          Complete the design inputs in the left rail to draw the injection-point construction.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="w-4 h-4 text-emerald-400" /> Deepest point of injection
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-slate-500">Depth</p>
            <p className="text-xl font-semibold text-slate-100 tabular-nums">
              {fmt(injectionPoint?.depthFt)} <span className="text-sm font-normal text-slate-500">ft TVD</span>
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-slate-500">Casing there</p>
            <p className="text-xl font-semibold text-slate-100 tabular-nums">
              {fmt(injectionPoint ? psiaToPsig(injectionPoint.pInjPsia) : NaN)}
              <span className="text-sm font-normal text-slate-500"> psig</span>
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-slate-500">Tubing there</p>
            <p className="text-xl font-semibold text-slate-100 tabular-nums">
              {fmt(injectionPoint ? psiaToPsig(injectionPoint.pProdPsia) : NaN)}
              <span className="text-sm font-normal text-slate-500"> psig</span>
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-slate-500">Limited by</p>
            <p className="text-sm text-slate-300 mt-1">
              {injectionPoint?.limitedBy === 'depth'
                ? 'Well depth: the gas still wins at the bottom of the traverse.'
                : 'Injection pressure: the lines cross above the packer.'}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            The construction
            <span className="block text-xs font-normal text-slate-500 mt-0.5">
              Flowing gradient at {fmt(inputs.injection.designRateStbd)} stb/d fully lifted, against
              the injection line at {fmt(inputs.injection.operatingPsig)} psig.
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ChartFrame height={420} exportFilename="gas-lift-injection-point">
            <ComposedChart layout="vertical" data={data} margin={{ top: 8, right: 28, bottom: 12, left: 8 }}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis
                type="number"
                stroke={CHART_COLORS.axisLine}
                domain={[0, 'dataMax + 100']}
                tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                label={{
                  value: 'Pressure (psig)', position: 'insideBottom', offset: -8,
                  fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                }}
              />
              <YAxis
                type="number" dataKey="tvd" reversed stroke={CHART_COLORS.axisLine}
                domain={[0, 'dataMax']}
                tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                label={{
                  value: 'True vertical depth (ft)', angle: -90, position: 'insideLeft',
                  fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                }}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: CHART_COLORS.tooltipText }}
                itemStyle={{ color: CHART_COLORS.tooltipText }}
                formatter={(value, name) => [`${Math.round(Number(value))} psig`, name]}
                labelFormatter={(v) => `${Math.round(Number(v))} ft TVD`}
              />
              <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
              <Line dataKey="injection" name="Injection gas" stroke="#d97706" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line dataKey="injectionLessTransfer" name="Less transfer drop" stroke="#f59e0b" strokeWidth={1.2} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
              <Line dataKey="flowing" name="Flowing gradient" stroke="#059669" strokeWidth={2} dot={false} isAnimationActive={false} />
              {injectionPoint && (
                <ReferenceDot
                  x={psiaToPsig(injectionPoint.pProdPsia)}
                  y={injectionPoint.depthFt}
                  r={6}
                  fill="#dc2626"
                  stroke="#ffffff"
                  strokeWidth={1}
                  isFront
                  label={{
                    value: 'Point of injection', position: 'left', fill: '#dc2626', fontSize: 10,
                  }}
                />
              )}
            </ComposedChart>
          </ChartFrame>
        </CardContent>
      </Card>
    </div>
  );
};

export default InjectionPointPanel;
