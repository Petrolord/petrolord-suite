// Results as charts (Earth Modeling 3D grid upgrade, 2026-10-17): the
// histograms of the well logs, the upscaled cells and the model; the phi-k
// crossplot coloured by facies; the volumes of each zone; the STOIIP tornado;
// and the probability curve of the volume distribution (P90, P50, P10). The
// tables moved to the Details tab. House chart standard: a white chart card
// whatever the page theme, chartTheme tokens, the Petrolord mark.

import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Line, Scatter, ScatterChart, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, Cell, LabelList,
} from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { histogramData, crossplotData, volumesByZone, tornadoData, exceedanceCurve } from '../services/grid3d/charts';
import { faciesName, faciesColor } from '../services/grid3d/properties';
import { volumeValue, volumeUnitLabel } from '../services/units';
import DistributionCard from './DistributionCard';

const LOGO = { height: '28px' };
const axisTick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };
const axisLabel = (value, angle = 0, dx = 0) => ({ value, angle, position: angle ? 'insideLeft' : 'insideBottom', offset: angle ? 8 : -2, dx, fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize });
const selCls = 'rounded bg-white border border-slate-300 text-slate-800 px-1.5 py-0.5 text-[11px]';
const PROP_LABEL = { phi: 'Porosity (v/v)', sw: 'Sw (v/v)', vsh: 'Vsh (v/v)', perm: 'Permeability (md)', ntg: 'NTG' };
const tick3 = (v) => (Number.isFinite(v) ? (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(3)) : '');
const tickVol = (v) => (Number.isFinite(v) ? (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)) : '');

function ChartCard({ title, subtitle, testid, children, controls = null, height = 280 }) {
  return (
    // the chart surface stays white in both themes (house chart standard), like a canvas
    <div className="rounded border border-pl-border bg-white" data-testid={testid} data-canvas="light">
      <div className="flex items-center gap-2 px-3 pt-2">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-slate-900">{title}</div>
          {subtitle && <div className="text-[10px] text-slate-500">{subtitle}</div>}
        </div>
        <div className="ml-auto flex items-center gap-1">{controls}</div>
      </div>
      <div className="relative bg-white" style={{ height }}>
        {children}
        <div className="absolute bottom-1 right-2"><ChartLogo style={LOGO} /></div>
      </div>
    </div>
  );
}

export default function ResultsCharts({ built, volumeUnits = 'field', depthUnit = 'ft', onDistribution }) {
  const [hProp, setHProp] = useState('phi');
  const [hZone, setHZone] = useState(-1);
  const hist = useMemo(() => histogramData(built, hProp, hZone), [built, hProp, hZone]);
  const xp = useMemo(() => crossplotData(built), [built]);
  const vols = useMemo(() => volumesByZone(built), [built]);
  const oil = vols.some((v) => Number.isFinite(v.stoiip_m3));
  const volKey = oil ? 'stoiip_m3' : 'hcpv_m3';
  const volUnit = volumeUnitLabel(volKey, volumeUnits);
  const contactM = depthUnit === 'ft' ? 30 * 0.3048 : 10;
  const tornado = useMemo(() => (oil ? tornadoData(built, { contactM, pct: 10 }) : null), [built, oil, contactM]);
  const dist = built.distribution;
  const curve = useMemo(() => exceedanceCurve(dist?.total?.samples?.[volKey]), [dist, volKey]);
  const v = (m3) => volumeValue(m3, volKey, volumeUnits);

  const faciesCodes = [...new Set([...xp.wells, ...xp.model].map((p) => p.facies).filter((c) => c !== null))].sort((a, b) => a - b);
  const contactText = depthUnit === 'ft' ? '30 ft' : '10 m';
  return (
    <div className="space-y-3" data-testid="em-charts">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <ChartCard title="Histograms: well logs, upscaled cells and the model" testid="em-chart-hist"
          subtitle={hist ? `${hist.counts.logs.toLocaleString('en-US')} log samples, ${hist.counts.upscaled} upscaled cells, ${hist.counts.model.toLocaleString('en-US')} model cells${hist.means.model !== null ? `; means ${[hist.means.logs, hist.means.upscaled, hist.means.model].map((m) => (m === null ? 'none' : tick3(m))).join(', ')}` : ''}` : 'No property to show'}
          controls={(
            <>
              <select className={selCls} data-testid="em-chart-hist-prop" value={hProp} onChange={(e) => setHProp(e.target.value)}>
                {['phi', 'sw', 'vsh', 'perm'].map((k) => <option key={k} value={k}>{PROP_LABEL[k]}</option>)}
              </select>
              <select className={selCls} data-testid="em-chart-hist-zone" value={hZone} onChange={(e) => setHZone(Number(e.target.value))}>
                <option value={-1}>all reservoir zones</option>
                {built.zones.map((z, i) => <option key={z.name} value={i}>{z.name}</option>)}
              </select>
            </>
          )}>
          {hist && (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={hist.bins} margin={{ top: 10, right: 20, left: 10, bottom: 34 }}>
                <CartesianGrid {...GRID_STYLE} />
                <XAxis dataKey="x" tick={axisTick} tickFormatter={tick3} label={axisLabel(PROP_LABEL[hProp])} />
                <YAxis tick={axisTick} tickFormatter={(x) => `${x}`} label={axisLabel('Percent of each set', -90)} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(val, name) => [Number.isFinite(val) ? `${val.toFixed(1)}%` : 'none', name]} labelFormatter={(x) => `${PROP_LABEL[hProp]} ${tick3(x)}`} />
                <Legend verticalAlign="top" height={22} wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize }} />
                <Bar dataKey="model" name="Model cells" fill="#93c5fd" isAnimationActive={false} />
                <Line dataKey="upscaled" name="Upscaled cells" stroke="#059669" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} connectNulls />
                <Line dataKey="logs" name="Well logs" stroke="#dc2626" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Porosity against permeability, coloured by facies" testid="em-chart-phik"
          subtitle={(() => {
            const pk = built.zones.find((z) => z.phiK)?.phiK;
            const base = `${xp.wells.length} upscaled well cells (large), ${xp.model.length.toLocaleString('en-US')} model cells (small)`;
            return pk ? `${base}. The wells' permeability log is a porosity transform, so its cells lie on a line; the model scatters about it by ${pk.sigma.toFixed(2)} decades from ${pk.sigmaSource} (seeded).` : base;
          })()}>
          {(xp.wells.length > 0 || xp.model.length > 0) && (
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 20, left: 10, bottom: 34 }}>
                <CartesianGrid {...GRID_STYLE} />
                <XAxis type="number" dataKey="phi" name="Porosity" domain={[0, 'auto']} tick={axisTick} tickFormatter={tick3} label={axisLabel('Porosity (v/v)')} />
                <YAxis type="number" dataKey="perm" name="Permeability" scale="log" domain={['auto', 'auto']} allowDataOverflow tick={axisTick} tickFormatter={tick3} label={axisLabel('Permeability (md)', -90)} />
                <ZAxis range={[14, 14]} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(val, name) => [tick3(val), name]} />
                <Legend verticalAlign="top" height={22} wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize }} />
                {(faciesCodes.length ? faciesCodes : [null]).map((c) => (
                  <Scatter key={`m${c}`} name={c === null ? 'model cells' : faciesName(c)} data={xp.model.filter((p) => p.facies === c)} fill={c === null ? '#64748b' : faciesColor(c)} fillOpacity={0.45} isAnimationActive={false} shape="circle" />
                ))}
                <Scatter name="well cells" data={xp.wells} fill="#0f172a" isAnimationActive={false} shape={(p) => (
                  <circle cx={p.cx} cy={p.cy} r={4.5} fill={p.payload.facies === null ? '#0f172a' : faciesColor(p.payload.facies)} stroke="#0f172a" strokeWidth={1.2} />
                )} />
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title={`${oil ? 'STOIIP' : 'HCPV'} by zone (${volUnit})`} testid="em-chart-volumes"
          subtitle={`Total ${tickVol(v(vols.reduce((a, z) => a + (z[volKey] || 0), 0)))} ${volUnit}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={vols.map((z) => ({ zone: z.zone, value: v(z[volKey] || 0) }))} margin={{ top: 24, right: 20, left: 10, bottom: 20 }}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis dataKey="zone" tick={{ ...axisTick, fontSize: 10 }} interval={0} angle={-12} textAnchor="end" height={44} />
              <YAxis tick={axisTick} tickFormatter={tickVol} label={axisLabel(volUnit, -90)} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(val) => [`${tickVol(val)} ${volUnit}`, oil ? 'STOIIP' : 'HCPV']} />
              <Bar dataKey="value" isAnimationActive={false}>
                {vols.map((z, i) => <Cell key={z.zone} fill={['#64748b', '#059669', '#2563eb', '#d97706', '#7c3aed'][i % 5]} />)}
                <LabelList dataKey="value" position="top" formatter={tickVol} style={{ fontSize: 11, fill: CHART_COLORS.axisText }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={`STOIIP tornado (${volUnit})`} testid="em-chart-tornado"
          subtitle={tornado ? `Base ${tickVol(v(tornado.base))} ${volUnit}; contact ${contactText} up and down, the others plus and minus ${tornado.pct} percent, one at a time` : 'Needs an OWC and Bo'}>
          {tornado && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={tornado.bars.map((b) => ({ label: `${b.label}: ${tickVol(v(b.low))} to ${tickVol(v(b.high))}`, low: v(b.low) - v(tornado.base), high: v(b.high) - v(tornado.base), lowAbs: v(b.low), highAbs: v(b.high) }))}
                margin={{ top: 10, right: 40, left: 20, bottom: 34 }} stackOffset="sign">
                <CartesianGrid {...GRID_STYLE} />
                <XAxis type="number" tick={axisTick} tickFormatter={(x) => tickVol(x + v(tornado.base))} label={axisLabel(`STOIIP (${volUnit})`)} />
                <YAxis type="category" dataKey="label" tick={axisTick} width={150} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(val, name, p) => [`${tickVol(name === 'low case' ? p.payload.lowAbs : p.payload.highAbs)} ${volUnit}`, name]} />
                <ReferenceLine x={0} stroke="#0f172a" />
                <Bar dataKey="low" name="low case" stackId="t" fill="#dc2626" isAnimationActive={false} />
                <Bar dataKey="high" name="high case" stackId="t" fill="#059669" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <ChartCard title={`Probability of at least this ${oil ? 'STOIIP' : 'HCPV'} (${volUnit})`} testid="em-chart-probability" height={300}
        subtitle={curve ? `${curve.n} trials, seed ${dist.seed}: P90 ${tickVol(v(curve.p90))}, P50 ${tickVol(v(curve.p50))}, P10 ${tickVol(v(curve.p10))} ${volUnit}. P90 is the low case.` : 'Run the volume distribution below to draw the curve'}>
        {curve && (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={curve.points.map((p) => ({ v: v(p.v), p: p.p }))} margin={{ top: 16, right: 30, left: 10, bottom: 34 }}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis type="number" dataKey="v" domain={['auto', 'auto']} tick={axisTick} tickFormatter={tickVol} label={axisLabel(`${oil ? 'STOIIP' : 'HCPV'} (${volUnit})`)} />
              <YAxis type="number" domain={[0, 100]} ticks={[0, 10, 25, 50, 75, 90, 100]} tick={axisTick} label={axisLabel('Probability (%)', -90)} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(val, name) => (name === 'p' ? [`${val.toFixed(0)}%`, 'probability'] : [tickVol(val), volUnit])} />
              <Line dataKey="p" stroke="#2563eb" strokeWidth={2.5} dot={false} isAnimationActive={false} />
              {[['P90', curve.p90, 90], ['P50', curve.p50, 50], ['P10', curve.p10, 10]].map(([lab, x, p]) => (
                <ReferenceLine key={lab} x={v(x)} stroke="#d97706" strokeDasharray="4 3" label={{ value: `${lab} ${tickVol(v(x))}`, position: 'top', fill: '#92400e', fontSize: 11 }} ifOverflow="extendDomain" segment={undefined} />
              ))}
              {[90, 50, 10].map((p) => <ReferenceLine key={`h${p}`} y={p} stroke="#94a3b8" strokeDasharray="2 3" />)}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
      <DistributionCard built={built} volumeUnits={volumeUnits} depthUnit={depthUnit} onResult={onDistribution} />
    </div>
  );
}
