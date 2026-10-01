// Angle gather panel (U2-003, 2026-10-01): the zone and a pad of rock
// around it as a synthetic angle gather, in situ beside the fluid
// substituted case at the same gain, with the amplitude against angle
// picked off the zone top and the intercept and gradient fitted to the
// picks. Reflectivity is exact Zoeppritz or Aki-Richards per angle; the
// wavelet is a Ricker or the wavelet Seismolord measured at the well.
// Settings live in avo.gather and save with the project.

import React, { useMemo } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Label, ReferenceLine,
} from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS, GRID_STYLE, TOOLTIP_STYLE, LEGEND_PROPS,
} from '@/utils/chartTheme';
import { computeZoneResult } from '../services/zoneResult';
import { zoneGather, gatherConfig, tieWavelet, DEFAULT_GATHER } from '../services/gather';
import { describeFluid } from '../services/publish';
import { DEFAULT_UNITS, tidyDepth, depthToDisplay, depthFromDisplay } from '../services/units';
import UnitInput from './UnitInput';
import GatherCanvas from './GatherCanvas';
import { EMPTY_VALUE } from '@/lib/emptyValue';

const f4 = (v) => (Number.isFinite(v) ? v.toFixed(4) : EMPTY_VALUE);
const AXIS_TICK = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };
const AXIS_LINE = { stroke: CHART_COLORS.axisLine, strokeWidth: 1 };
const INPUT = 'bg-pl-surface border border-pl-border-strong rounded px-1.5 py-0.5 text-right text-pl-text';
const same = (v) => v;

export default function GatherPanel({
  model, zones, scenario, rock, avo, onAvoChange, units = DEFAULT_UNITS, zoneId, onZoneChange, well = null, extra = null,
}) {
  const zone = zones.find((z) => z.id === zoneId) || zones[0] || null;
  const cfg = gatherConfig(avo.gather);
  const patch = (p) => onAvoChange({ ...avo, gather: { ...DEFAULT_GATHER, ...(avo.gather || {}), ...p } });
  const zU = units.depth;
  const tie = useMemo(() => tieWavelet(well), [well]);

  const result = useMemo(() => computeZoneResult(model, zone, scenario, rock), [model, zone, scenario, rock]);
  const gather = useMemo(() => {
    if (!model || !zone) return null;
    return zoneGather(model, zone, result && !result.error ? result.merged : null, avo.gather, well);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, zone, result, JSON.stringify(avo.gather || {}), well]);

  const ok = gather && !gather.error;
  const events = (side) => [
    { sample: side.topSample, label: `top ${zone.name}` },
    { sample: side.baseSample, label: 'base', color: '#64748b' },
  ];
  const ava = ok ? gather.angles.map((theta, k) => ({
    theta,
    inSitu: gather.inSitu.picks[k],
    substituted: gather.substituted ? gather.substituted.picks[k] : null,
  })) : [];
  const fluidB = describeFluid(scenario.fluidB);

  return (
    <div className="h-full min-h-0 overflow-y-auto p-3 space-y-3" data-testid="rp-gather-panel">
      <div className="flex flex-wrap items-center gap-3 text-[12px] text-pl-text">
        <label className="flex items-center gap-1">
          <span className="text-pl-muted">Zone</span>
          <select
            data-testid="rp-gather-zone"
            value={zone?.id || ''}
            onChange={(e) => onZoneChange?.(e.target.value)}
            className="bg-pl-surface border border-pl-border-strong rounded px-1.5 py-0.5 text-pl-text"
          >
            {zones.map((z) => (
              <option key={z.id} value={z.id}>{`${z.name} (${tidyDepth(z.top_md_m, zU)}–${tidyDepth(z.base_md_m, zU)} ${zU})`}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1" title="Rock above and below the zone included in the gather">
          pad
          <UnitInput testid="rp-gather-pad" value={cfg.padM} unit={zU} toDisplay={depthToDisplay} fromDisplay={depthFromDisplay} digits={0} onChange={(si) => { if (Number.isFinite(si) && si >= 0) patch({ padM: si }); }} className={`w-14 ${INPUT}`} />
          {zU}
        </label>
        <label className="flex items-center gap-1">
          angles 0 to
          <UnitInput testid="rp-gather-max-angle" value={cfg.maxAngle} unit="" toDisplay={same} fromDisplay={same} digits={0} onChange={(v) => { if (Number.isFinite(v)) patch({ maxAngle: v }); }} className={`w-12 ${INPUT}`} />
          ° every
          <UnitInput testid="rp-gather-angle-step" value={cfg.angleStep} unit="" toDisplay={same} fromDisplay={same} digits={0} onChange={(v) => { if (Number.isFinite(v) && v > 0) patch({ angleStep: v }); }} className={`w-10 ${INPUT}`} />
          °
        </label>
        <label className="flex items-center gap-1">
          <span className="text-pl-muted">Reflectivity</span>
          <select data-testid="rp-gather-method" value={cfg.method} onChange={(e) => patch({ method: e.target.value })} className="bg-pl-surface border border-pl-border-strong rounded px-1.5 py-0.5 text-pl-text">
            <option value="zoeppritz">Zoeppritz (exact)</option>
            <option value="aki-richards">Aki-Richards</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-pl-muted">Wavelet</span>
          <select data-testid="rp-gather-wavelet" value={cfg.wavelet} onChange={(e) => patch({ wavelet: e.target.value })} className="bg-pl-surface border border-pl-border-strong rounded px-1.5 py-0.5 text-pl-text">
            <option value="ricker">Ricker</option>
            <option value="tie" disabled={!tie}>{tie ? `Seismolord tie wavelet (${tie.peakHz.toFixed(1)} Hz, ${tie.phaseDeg.toFixed(0)}°)` : 'Seismolord tie wavelet (none stored on this well)'}</option>
          </select>
        </label>
        {cfg.wavelet === 'ricker' && (
          <>
            <label className="flex items-center gap-1">
              <UnitInput testid="rp-gather-freq" value={cfg.freqHz} unit="" toDisplay={same} fromDisplay={same} digits={1} onChange={(v) => { if (Number.isFinite(v) && v > 0) patch({ freqHz: v }); }} className={`w-12 ${INPUT}`} />
              Hz
            </label>
            <label className="flex items-center gap-1" title="Constant phase rotation of the Ricker (0 is zero phase)">
              phase
              <UnitInput testid="rp-gather-phase" value={cfg.phaseDeg} unit="" toDisplay={same} fromDisplay={same} digits={0} onChange={(v) => { if (Number.isFinite(v)) patch({ phaseDeg: v }); }} className={`w-12 ${INPUT}`} />
              °
            </label>
          </>
        )}
        {!zones.length && <span className="text-pl-muted">no zones on this well. Add them in Petrophysics Studio.</span>}
      </div>

      {result?.error && <p className="text-[12px] text-pl-warning-text" data-testid="rp-gather-sub-error">Fluid substitution: {result.error} The in situ gather is still drawn.</p>}
      {gather?.error && <p className="text-[12px] text-pl-warning-text" data-testid="rp-gather-error">{gather.error}</p>}

      {ok && (
        <>
          <p className="text-[12px] text-pl-muted" data-testid="rp-gather-summary">
            {zone.name} with {tidyDepth(cfg.padM, zU)} {zU} above and below · {gather.angles.length} angles · {gather.method === 'zoeppritz' ? 'exact Zoeppritz' : 'Aki-Richards'} per angle · {gather.wavelet.label} · {gather.dtMs} ms sampling · primaries only, one incidence angle per trace, both panels at one gain
          </p>
          {gather.notes.length > 0 && (
            <ul className="text-[12px] text-pl-warning-text space-y-0.5" data-testid="rp-gather-notes">
              {gather.notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          )}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <GatherCanvas testid="rp-gather-insitu" traces={gather.inSitu.traces} angles={gather.angles} dtMs={gather.dtMs} gain={gather.gain} events={events(gather.inSitu)} title="In situ" />
            {gather.substituted && (
              <GatherCanvas testid="rp-gather-substituted" traces={gather.substituted.traces} angles={gather.angles} dtMs={gather.dtMs} gain={gather.gain} events={events(gather.substituted)} title={`Zone with ${fluidB}`} />
            )}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <div className="bg-white rounded-lg p-3 relative" data-canvas="chart" style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={ava} margin={CHART_MARGINS.legend}>
                  <CartesianGrid {...GRID_STYLE} />
                  <XAxis dataKey="theta" type="number" domain={[0, cfg.maxAngle]} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={AXIS_LINE}>
                    <Label value="Incidence angle θ (°)" position="insideBottom" offset={-5} style={{ fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }} />
                  </XAxis>
                  <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={AXIS_LINE} tickFormatter={(v) => v.toFixed(2)}>
                    <Label value="Amplitude at the zone top" angle={-90} position="insideLeft" style={{ fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }} />
                  </YAxis>
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => f4(v)} labelFormatter={(v) => `θ = ${v}°`} />
                  <Legend {...LEGEND_PROPS} verticalAlign="top" wrapperStyle={{ fontSize: `${CHART_TYPOGRAPHY.legendFontSize}px`, color: CHART_COLORS.legendText, paddingBottom: 4 }} />
                  <ReferenceLine y={0} stroke={CHART_COLORS.axisLine} />
                  <Line type="monotone" dataKey="inSitu" isAnimationActive={false} stroke="#0f172a" strokeWidth={2} dot={{ r: 2.5 }} name="in situ" />
                  {gather.substituted && <Line type="monotone" dataKey="substituted" isAnimationActive={false} stroke="#d97706" strokeWidth={2} dot={{ r: 2.5 }} name={`zone with ${fluidB}`} />}
                </LineChart>
              </ResponsiveContainer>
              <ChartLogo />
            </div>
            <div className="rounded border border-pl-border p-2 self-start">
              <div className="text-[11px] uppercase tracking-wider text-pl-muted mb-1">Intercept and gradient at the zone top</div>
              <table className="w-full text-[12px] text-pl-text" data-testid="rp-gather-ab">
                <thead>
                  <tr className="text-pl-muted text-left">
                    <th className="font-normal">Case</th>
                    <th className="font-normal text-right" title="Least squares of the picked amplitudes on sin² θ, angles to 30°">A picked</th>
                    <th className="font-normal text-right">B picked</th>
                    <th className="font-normal text-right" title="Shuey's A and B of the interface, from the mean logs just above and below the top">A interface</th>
                    <th className="font-normal text-right">B interface</th>
                  </tr>
                </thead>
                <tbody>
                  {[['in situ', gather.inSitu, 'a'], [`zone with ${fluidB}`, gather.substituted, 'b']].filter(([, side]) => side).map(([label, side, id]) => (
                    <tr key={id} className="border-t border-pl-border">
                      <td className="py-1">{label}</td>
                      <td className="py-1 text-right" data-testid={`rp-gather-a-${id}`}>{f4(side.fit?.a)}</td>
                      <td className="py-1 text-right" data-testid={`rp-gather-b-${id}`}>{f4(side.fit?.b)}</td>
                      <td className="py-1 text-right" data-testid={`rp-gather-ia-${id}`}>{f4(side.interface?.a)}</td>
                      <td className="py-1 text-right" data-testid={`rp-gather-ib-${id}`}>{f4(side.interface?.b)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-pl-muted">
                The picks carry the wavelet and any interference from the zone base and nearby beds, so they differ from the single-interface values when the zone is near tuning. Amplitudes are reflection coefficients (unit-peak wavelet).
              </p>
              {extra}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
