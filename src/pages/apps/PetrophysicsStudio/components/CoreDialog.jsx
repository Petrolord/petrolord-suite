// Core calibration dialog (AppUpgrade PETRO-U2-007): the core plugs found on
// the well, a k-phi crossplot (log k against porosity) with the plugs, the
// log model's samples for comparison and the semi-log transform fitted per
// zone, the fit table, and a layout with the plugs on the tracks and the
// core-transform permeability K_CORE beside the log model's KPERM.

import React, { useMemo } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CHART_COLORS } from '@/utils/chartTheme';
import ChartLogo from '@/components/charts/ChartLogo';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { kFromFit } from '../services/coreData';

const W = 460; const H = 300; const M = { l: 50, r: 12, t: 12, b: 36 };
const FIT_COLORS = ['#7c3aed', '#0891b2', '#d97706', '#059669', '#be185d'];
const fmt = (v, d = 3) => (Number.isFinite(v) ? Number(v).toFixed(d) : EMPTY_VALUE);

export default function CoreDialog({ open, onOpenChange, core, fits, zones = [], logPhi = null, logK = null, onShowTracks }) {
  const pts = core?.points || [];
  const both = pts.filter((p) => Number.isFinite(p.phi) && p.k > 0);
  const X = (phi) => M.l + (phi / 0.4) * (W - M.l - M.r);
  const Y = (k) => M.t + (1 - (Math.log10(k) + 2) / 6) * (H - M.t - M.b); // 0.01 to 10000 mD
  const logCloud = useMemo(() => {
    if (!logPhi || !logK) return [];
    const out = [];
    for (let i = 0; i < logPhi.length; i += 2) if (Number.isFinite(logPhi[i]) && logK[i] > 0.01 && logK[i] < 10000) out.push([logPhi[i], logK[i]]);
    return out;
  }, [logPhi, logK]);
  const fitRows = [{ id: 'well', name: 'Whole well', fit: fits?.well }, ...zones.map((z) => ({ id: z.id, name: z.name, fit: fits?.zones?.[z.id] }))];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto" data-testid="petro-core-dialog">
        <DialogHeader>
          <DialogTitle>Core calibration</DialogTitle>
          <DialogDescription className="text-pl-muted">
            Core plugs against the logs, and the semi-log transform log10 k = a + b φ fitted by least squares (Nelson 1994,
            The Log Analyst 35(3)). Each zone fits its own plugs; the whole-well fit covers depths outside the zones.
          </DialogDescription>
        </DialogHeader>
        <p className="text-xs text-pl-muted" data-testid="petro-core-found">
          {core?.phiLog || core?.kLog
            ? `Core curves: ${[core.phiLog?.mnemonic, core.kLog?.mnemonic].filter(Boolean).join(', ')}; ${pts.length} plug${pts.length === 1 ? '' : 's'}, ${both.length} with porosity and permeability.`
            : 'No core curve on this well.'}
          {' '}{(core?.notes || []).join(' ')}
        </p>
        {both.length > 0 && (
          <div className="relative rounded border border-pl-border max-w-[460px]" style={{ background: CHART_COLORS.background }} data-testid="petro-core-crossplot">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-label="Core permeability against porosity">
              <rect x={M.l} y={M.t} width={W - M.l - M.r} height={H - M.t - M.b} fill={CHART_COLORS.plotArea} stroke={CHART_COLORS.axisLine} strokeWidth="0.8" />
              {[0.01, 0.1, 1, 10, 100, 1000, 10000].map((k) => (
                <g key={k}>
                  <line x1={M.l} x2={W - M.r} y1={Y(k)} y2={Y(k)} stroke={CHART_COLORS.grid} strokeWidth="0.6" />
                  <text x={M.l - 4} y={Y(k) + 3} fontSize="9" textAnchor="end" fill={CHART_COLORS.axisText}>{k}</text>
                </g>
              ))}
              {[0, 0.1, 0.2, 0.3, 0.4].map((p) => <text key={p} x={X(p)} y={H - M.b + 12} fontSize="9" textAnchor="middle" fill={CHART_COLORS.axisText}>{p}</text>)}
              <text x={(M.l + W - M.r) / 2} y={H - 6} fontSize="10" textAnchor="middle" fill={CHART_COLORS.axisLabel}>porosity (v/v): core φ, log φe</text>
              <text x={11} y={(M.t + H - M.b) / 2} fontSize="10" textAnchor="middle" fill={CHART_COLORS.axisLabel} transform={`rotate(-90 11 ${(M.t + H - M.b) / 2})`}>k (mD, log)</text>
              {logCloud.map(([p, k], i) => <circle key={`l${i}`} cx={X(p)} cy={Y(k)} r="1.3" fill="#94a3b8" />)}
              {fitRows.filter((r) => r.fit?.ok).map((r, i) => (
                <line key={r.id} data-testid={`petro-core-fitline-${r.name}`}
                  x1={X(r.fit.phiMin)} y1={Y(kFromFit(r.fit, r.fit.phiMin))} x2={X(r.fit.phiMax)} y2={Y(kFromFit(r.fit, r.fit.phiMax))}
                  stroke={FIT_COLORS[i % FIT_COLORS.length]} strokeWidth="1.6" strokeDasharray={r.id === 'well' ? '5 3' : undefined} />
              ))}
              {both.map((p) => <circle key={p.i} cx={X(p.phi)} cy={Y(p.k)} r="3" fill="#b91c1c" stroke="#fff" strokeWidth="0.8" data-testid="petro-core-plug" />)}
            </svg>
            <ChartLogo style={{ bottom: `${M.b + 4}px`, right: `${M.r + 4}px`, height: '24px' }} />
          </div>
        )}
        <table className="text-xs border-collapse min-w-full" data-testid="petro-core-fits">
          <thead><tr className="text-pl-muted">{['Fit', 'Plugs', 'a', 'b', 'R²', 'RMS (log cycles)', 'φ range'].map((h) => <th key={h} className="text-left px-2 py-1 font-normal">{h}</th>)}</tr></thead>
          <tbody>
            {fitRows.map((r, i) => (
              <tr key={r.id} className="border-t border-pl-border" data-testid={`petro-core-fit-${r.name}`}>
                <td className="px-2 py-1 text-pl-text"><span className="inline-block w-3 h-0.5 mr-1 align-middle" style={{ background: FIT_COLORS[i % FIT_COLORS.length] }} />{r.name}</td>
                <td className="px-2 py-1">{r.fit?.n ?? 0}</td>
                {r.fit?.ok ? (
                  <>
                    <td className="px-2 py-1">{fmt(r.fit.a)}</td>
                    <td className="px-2 py-1">{fmt(r.fit.b, 2)}</td>
                    <td className="px-2 py-1">{fmt(r.fit.r2)}</td>
                    <td className="px-2 py-1">{fmt(r.fit.rmsLog)}</td>
                    <td className="px-2 py-1">{fmt(r.fit.phiMin)} to {fmt(r.fit.phiMax)}</td>
                  </>
                ) : <td colSpan={5} className="px-2 py-1 text-pl-muted">{r.fit?.reason || 'no plugs'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
          <Button size="sm" data-testid="petro-core-tracks" disabled={!pts.length} onClick={onShowTracks}>Show on tracks</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
