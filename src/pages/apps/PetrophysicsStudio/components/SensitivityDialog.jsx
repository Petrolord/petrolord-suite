// Cutoff sensitivity dialog (AppUpgrade PETRO-U2-005). One zone at a time:
// net pay, net reservoir and hydrocarbon pore thickness against each of the
// three cutoffs, with the others held at the zone's own values and the
// current cutoff marked. Analytic chart on the Suite standard (white
// chartTheme, ChartLogo). Numbers come from services/cutoffSensitivity.js.

import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CHART_COLORS } from '@/utils/chartTheme';
import ChartLogo from '@/components/charts/ChartLogo';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { toDisplay } from '../viewer/depthModes';
import { SENSITIVITY_CUTOFFS, zoneSensitivities, pointsAround, relativeSwing } from '../services/cutoffSensitivity';

const fmt = (v, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? EMPTY_VALUE : Number(v).toFixed(d));
const SERIES = [
  { field: 'net_m', label: 'Net pay', color: '#2563eb' },
  { field: 'net_res_m', label: 'Net reservoir', color: '#059669', dash: '4 3' },
  { field: 'hcpv_m', label: 'HCPV', color: '#d97706' },
];
const W = 300;
const H = 190;
const M = { l: 40, r: 10, t: 10, b: 34 };

/** One sweep as an SVG line chart (x the cutoff, y thickness in the display unit). */
export function SensitivityChart({ sweep, depthUnit = 'm', testId }) {
  const pts = sweep.points;
  const xs = pts.map((p) => p.value);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  let yMax = 0;
  for (const p of pts) for (const s of SERIES) if (Number.isFinite(p[s.field])) yMax = Math.max(yMax, toDisplay(p[s.field], depthUnit));
  yMax = yMax > 0 ? yMax * 1.08 : 1;
  const X = (v) => M.l + ((v - x0) / (x1 - x0 || 1)) * (W - M.l - M.r);
  const Y = (v) => M.t + (1 - v / yMax) * (H - M.t - M.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => x0 + f * (x1 - x0));
  const yTicks = [0, 0.5, 1].map((f) => f * yMax);
  const u = depthUnit === 'ft' ? 'ft' : 'm';
  return (
    <div className="relative rounded border border-pl-border" style={{ background: CHART_COLORS.background }} data-testid={testId}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-label={`Net pay and HCPV against the ${sweep.def.short} cutoff`}>
        <rect x={M.l} y={M.t} width={W - M.l - M.r} height={H - M.t - M.b} fill={CHART_COLORS.plotArea} stroke={CHART_COLORS.axisLine} strokeWidth="0.8" />
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={M.l} x2={W - M.r} y1={Y(t)} y2={Y(t)} stroke={CHART_COLORS.grid} strokeWidth="0.6" />
            <text x={M.l - 3} y={Y(t) + 3} fontSize="8" textAnchor="end" fill={CHART_COLORS.axisText}>{t.toFixed(t < 10 ? 1 : 0)}</text>
          </g>
        ))}
        {ticks.map((t) => (
          <text key={`x${t}`} x={X(t)} y={H - M.b + 11} fontSize="8" textAnchor="middle" fill={CHART_COLORS.axisText}>{t.toFixed(2)}</text>
        ))}
        <text x={(M.l + W - M.r) / 2} y={H - 6} fontSize="9" textAnchor="middle" fill={CHART_COLORS.axisLabel}>{sweep.def.label}</text>
        <text x={9} y={(M.t + H - M.b) / 2} fontSize="9" textAnchor="middle" fill={CHART_COLORS.axisLabel} transform={`rotate(-90 9 ${(M.t + H - M.b) / 2})`}>thickness ({u})</text>
        {SERIES.map((s) => (
          <polyline
            key={s.field}
            fill="none"
            stroke={s.color}
            strokeWidth="1.6"
            strokeDasharray={s.dash || undefined}
            data-series={s.field}
            points={pts.filter((p) => Number.isFinite(p[s.field])).map((p) => `${X(p.value).toFixed(1)},${Y(toDisplay(p[s.field], depthUnit)).toFixed(1)}`).join(' ')}
          />
        ))}
        {Number.isFinite(sweep.current) && (
          <g data-testid={testId ? `${testId}-current` : undefined} data-value={sweep.current}>
            <line x1={X(sweep.current)} x2={X(sweep.current)} y1={M.t} y2={H - M.b} stroke="#dc2626" strokeWidth="1" strokeDasharray="3 2" />
            <text x={Math.min(X(sweep.current) + 3, W - M.r - 40)} y={M.t + 9} fontSize="8" fill="#dc2626">now {sweep.current}</text>
          </g>
        )}
      </svg>
      <ChartLogo style={{ bottom: `${M.b + 4}px`, right: `${M.r + 4}px`, height: '22px' }} />
    </div>
  );
}

export default function SensitivityDialog({
  open, onOpenChange, curves, outputs, params, zones = [], zoneParams = {}, vth = null, depthUnit = 'm', initialZoneId = null,
}) {
  const [zoneId, setZoneId] = useState(initialZoneId);
  useEffect(() => {
    if (!open) return;
    if (!zones.some((z) => z.id === zoneId)) setZoneId(initialZoneId && zones.some((z) => z.id === initialZoneId) ? initialZoneId : zones[0]?.id ?? null);
  }, [open, zones, zoneId, initialZoneId]);
  const sens = useMemo(() => (open ? zoneSensitivities({ curves, outputs, params, zones, zoneParams, vth }) : {}), [open, curves, outputs, params, zones, zoneParams, vth]);
  const zone = zones.find((z) => z.id === zoneId) || null;
  const s = zone ? sens[zone.id] : null;
  const u = depthUnit === 'ft' ? 'ft' : 'm';
  const d = (v, n = 2) => (Number.isFinite(v) ? fmt(toDisplay(v, depthUnit), n) : EMPTY_VALUE);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto" data-testid="petro-sensitivity-dialog">
        <DialogHeader>
          <DialogTitle>Cutoff sensitivity</DialogTitle>
          <DialogDescription className="text-pl-muted">
            Net pay, net reservoir and hydrocarbon pore thickness (HCPV) as one cutoff moves and the other two stay at
            this zone&apos;s values (Worthington and Cosentino 2005, SPE 84387). A steep curve at the dashed line means the
            answer depends on that choice.
          </DialogDescription>
        </DialogHeader>
        <label className="flex items-center gap-2 text-xs">
          <span className="text-pl-muted">Zone</span>
          <select className="rounded bg-pl-surface border border-pl-border-strong text-pl-text px-1.5 py-0.5" value={zoneId || ''}
            onChange={(e) => setZoneId(e.target.value)} data-testid="petro-sensitivity-zone">
            {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
          {s && (
            <span className="text-pl-muted" data-testid="petro-sensitivity-current">
              now: net pay {d(s.current.net_m)} {u}, HCPV {d(s.current.hcpv_m, 3)} {u}
            </span>
          )}
        </label>
        {!zones.length && <p className="text-xs text-pl-muted">Add a zone first: the sensitivity is per zone.</p>}
        {zone && !s && <p className="text-xs text-pl-muted" data-testid="petro-sensitivity-empty">This zone has no PHIE, Vsh and Sw to summarise yet.</p>}
        {s && (
          <>
            <div className="flex flex-wrap gap-3 text-[11px] text-pl-muted">
              {SERIES.map((x) => (
                <span key={x.field} className="flex items-center gap-1">
                  <span className="inline-block w-4 h-0.5" style={{ background: x.color }} />{x.label}
                </span>
              ))}
              <span className="flex items-center gap-1"><span className="inline-block w-4 border-t border-dashed border-red-600" />current cutoff</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {SENSITIVITY_CUTOFFS.map((def) => (
                <SensitivityChart key={def.key} sweep={s.sweeps[def.key]} depthUnit={depthUnit} testId={`petro-sensitivity-chart-${def.key}`} />
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="text-xs border-collapse min-w-full" data-testid="petro-sensitivity-table">
                <thead>
                  <tr className="text-pl-muted">
                    <th className="text-left px-2 py-1 font-normal">Cutoff</th>
                    <th className="text-left px-2 py-1 font-normal">Values either side (net pay {u} / HCPV {u})</th>
                    <th className="text-left px-2 py-1 font-normal" title="Change in net pay between the neighbouring grid values, as a fraction of today's net pay">Swing</th>
                  </tr>
                </thead>
                <tbody>
                  {SENSITIVITY_CUTOFFS.map((def) => {
                    const sw = s.sweeps[def.key];
                    const swing = relativeSwing(sw);
                    return (
                      <tr key={def.key} className="border-t border-pl-border">
                        <td className="px-2 py-1 whitespace-nowrap text-pl-text">{def.label}</td>
                        <td className="px-2 py-1 text-pl-muted">
                          {pointsAround(sw, 2).map((p) => (
                            <span key={p.value} className={`mr-3 whitespace-nowrap ${p.isCurrent ? 'font-semibold text-pl-text' : ''}`}>
                              {p.value}: {d(p.net_m)} / {d(p.hcpv_m, 3)}
                            </span>
                          ))}
                        </td>
                        <td className="px-2 py-1 text-pl-text" data-testid={`petro-sensitivity-swing-${def.key}`}>{swing === null ? EMPTY_VALUE : `${(swing * 100).toFixed(0)} %`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
