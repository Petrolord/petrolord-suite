// Blend properties, stability and the distillation curve (DS1).
import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useCrudeAssay } from '@/contexts/CrudeAssayContext';

const SERIES = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#dc2626'];
const fmt = (v, dp = 2) => (Number.isFinite(v) ? v.toFixed(dp) : 'n/a');

const Stat = ({ label, value, basis }) => (
  <div className="rounded border border-slate-800 bg-slate-900/60 p-3">
    <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
    <p className="text-xl font-bold text-white mt-1">{value}</p>
    {basis && <p className="text-[10px] text-slate-500 mt-1">{basis}</p>}
  </div>
);

const BlendResults = () => {
  const { inputs, blend, blendedCurve, characterization } = useCrudeAssay();
  const p = blend.properties || {};
  const stability = blend.stability || {};
  const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };

  // One row per temperature, with a column per crude plus the blend, so the
  // blend can be read against its components rather than on its own.
  const chartRows = blendedCurve.map((point) => {
    const row = { temperatureF: point.temperatureF, Blend: point.volumePercent };
    inputs.crudes.forEach((c) => {
      const pts = (c.curve || []).slice().sort((a, b) => a.temperatureF - b.temperatureF);
      if (pts.length === 0) return;
      const t = point.temperatureF;
      let v;
      if (t <= pts[0].temperatureF) v = pts[0].volumePercent;
      else if (t >= pts[pts.length - 1].temperatureF) v = pts[pts.length - 1].volumePercent;
      else {
        const k = pts.findIndex((q) => q.temperatureF >= t);
        const lo = pts[k - 1];
        const hi = pts[k];
        const span = hi.temperatureF - lo.temperatureF;
        v = span > 0 ? lo.volumePercent + ((t - lo.temperatureF) / span) * (hi.volumePercent - lo.volumePercent) : hi.volumePercent;
      }
      row[c.name] = v;
    });
    return row;
  });

  const Icon = stability.stable === true ? CheckCircle2 : stability.stable === false ? AlertTriangle : HelpCircle;
  const tone = stability.stable === true
    ? 'border-emerald-800/60 bg-emerald-950/30 text-emerald-200'
    : stability.stable === false
      ? 'border-red-800/60 bg-red-950/30 text-red-200'
      : 'border-amber-800/60 bg-amber-950/30 text-amber-200';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Blend API" value={`${fmt(p.api, 2)}`} basis="from the volume-blended specific gravity" />
        <Stat label="Sulfur" value={p.sulfurWtPct === null ? 'n/a' : `${fmt(p.sulfurWtPct, 3)} wt%`} basis="mass basis" />
        <Stat label="TAN" value={p.tanMgKohG === null ? 'n/a' : `${fmt(p.tanMgKohG, 2)}`} basis="mg KOH/g, mass basis" />
        <Stat label="Viscosity" value={p.viscosityCSt === null ? 'n/a' : `${fmt(p.viscosityCSt, 1)} cSt`} basis={blend.bases?.viscosityCSt} />
        <Stat label="Nitrogen" value={p.nitrogenWtPct === null ? 'n/a' : `${fmt(p.nitrogenWtPct, 3)} wt%`} basis="mass basis" />
        <Stat label="Nickel" value={p.nickelPpm === null ? 'n/a' : `${fmt(p.nickelPpm, 1)} ppm`} basis="mass basis" />
        <Stat label="Vanadium" value={p.vanadiumPpm === null ? 'n/a' : `${fmt(p.vanadiumPpm, 1)} ppm`} basis="mass basis" />
        <Stat
          label="Watson K"
          value={characterization?.watsonK ? fmt(characterization.watsonK, 2) : 'n/a'}
          basis="on the 50 percent point, a screening basis"
        />
      </div>

      <div className={`rounded-lg border p-4 flex items-start gap-3 ${tone}`}>
        <Icon className="w-5 h-5 mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">
            Asphaltene stability screen
            {stability.basis === 'cii' && Number.isFinite(stability.cii) && ` — CII ${stability.cii.toFixed(2)}`}
          </p>
          <p className="text-sm mt-1 opacity-90">{stability.message}</p>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-2">Distillation curves</h3>
        <ChartFrame height={340} exportFilename="crude-blend-tbp">
          <LineChart data={chartRows} margin={{ top: 12, right: 24, left: 8, bottom: 28 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis
              dataKey="temperatureF" type="number" domain={['dataMin', 'dataMax']}
              stroke={CHART_COLORS.axisLine} tick={tick}
              label={{
                value: 'Temperature (degrees F)', position: 'insideBottom', offset: -10,
                fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
              }}
            />
            <YAxis
              domain={[0, 100]} stroke={CHART_COLORS.axisLine} tick={tick}
              label={{
                value: 'Volume distilled (%)', angle: -90, position: 'insideLeft',
                fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
              }}
            />
            <Tooltip
              {...TOOLTIP_STYLE}
              formatter={(v, name) => [`${fmt(v, 1)} %`, name]}
              labelFormatter={(v) => `${fmt(v, 0)} F`}
            />
            <Legend verticalAlign="top" wrapperStyle={{ fontSize: '12px' }} />
            {inputs.cuts.filter((c) => c.toF !== null && c.toF !== undefined).map((c) => (
              <ReferenceLine key={c.id} x={c.toF} stroke={CHART_COLORS.axisLine} strokeDasharray="3 3" />
            ))}
            {inputs.crudes.map((c, i) => (
              <Line
                key={c.id} type="monotone" dataKey={c.name}
                stroke={SERIES[(i + 1) % SERIES.length]} strokeWidth={1.5} dot={false} strokeDasharray="4 3"
              />
            ))}
            <Line type="monotone" dataKey="Blend" stroke="#0f172a" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ChartFrame>
        <p className="text-[12px] text-slate-500 mt-2">
          The blend curve is built by mixing the component yields at each temperature, which is what
          is additive. Averaging the components&apos; temperatures instead would mean nothing. Dashed
          verticals are the cut points.
        </p>
      </div>
    </div>
  );
};

export default BlendResults;
