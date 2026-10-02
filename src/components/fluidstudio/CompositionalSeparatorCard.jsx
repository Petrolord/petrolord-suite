import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Factory } from 'lucide-react';
import FluidStudioTierBadge from '@/components/fluidstudio/FluidStudioTierBadge';
import { useFluidUnits } from '@/components/fluidstudio/FluidUnitsContext';
import { EMPTY_VALUE } from '@/lib/emptyValue';

const fmt = (v, d = 1) => (v == null || !Number.isFinite(v) ? EMPTY_VALUE : Number(v).toFixed(d));

const Stat = ({ label, value, unit }) => (
  <div className="rounded-md bg-pl-sunken border border-pl-border px-3 py-2">
    <p className="text-[11px] text-pl-muted">{label}</p>
    <p className="text-sm font-semibold text-pl-text">{value}<span className="ml-1 text-xs font-normal text-pl-muted">{unit}</span></p>
  </div>
);

/**
 * Compositional separator train (FS6): the same stage inputs as the
 * black-oil Separator Train tab, flashed per stage with the PR78 engine.
 * Replaces the black-oil card's staged-liberation approximation and its
 * multistage-Bo heuristic when the EOS fluid model is selected.
 */
const CompositionalSeparatorCard = ({ separator, tuned = false }) => {
  const u = useFluidUnits();
  const gd = u.system === 'si' ? 2 : 1;
  if (!separator) return null;
  const { stages, stockTank, totals, bo, warnings } = separator;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center text-base">
            <Factory className="w-4 h-4 mr-2 text-pl-muted" />
            Compositional separator train
          </CardTitle>
          <div className="flex gap-2">
            {tuned && <FluidStudioTierBadge tier="lab_tuned" />}
            <FluidStudioTierBadge tier="oracle_gated" />
          </div>
        </div>
        <p className="text-xs text-pl-muted mt-1">
          Each stage is a rigorous PR78 flash of the wellstream. The vapor is taken off as surface gas and the equilibrium liquid feeds the next stage, ending at stock tank conditions ({fmt(u.show('pressure', 14.696), 1)} {u.label('pressure')} and {fmt(u.show('temperature', 60), 1)} {u.label('temperature')}). Stage pressures and temperatures come from the Separator Train inputs.
        </p>
        {warnings.length > 0 && (
          <div className="mt-2 text-xs text-pl-warning-text flex gap-2 items-start">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <ul className="space-y-0.5">
              {warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-pl-muted border-b border-pl-border">
                <th className="text-left py-1.5 pr-2 font-medium">Stage</th>
                <th className="text-right py-1.5 px-2 font-medium">{u.head('P', 'pressure')}</th>
                <th className="text-right py-1.5 px-2 font-medium">{u.head('T', 'temperature')}</th>
                <th className="text-right py-1.5 px-2 font-medium">Vapor (mol%)</th>
                <th className="text-right py-1.5 px-2 font-medium">Gas SG</th>
                <th className="text-right py-1.5 pl-2 font-medium">{u.head('GOR', 'gor')}</th>
              </tr>
            </thead>
            <tbody>
              {stages.map((s) => (
                <tr key={s.name} className="border-b border-pl-border text-pl-text">
                  <td className="py-1 pr-2">{s.name}</td>
                  <td className="text-right py-1 px-2 font-pl-mono tabular-nums text-xs">{fmt(u.show('pressure', s.pressure), 1)}</td>
                  <td className="text-right py-1 px-2 font-pl-mono tabular-nums text-xs">{fmt(u.show('temperature', s.temperature), 0)}</td>
                  <td className="text-right py-1 px-2 font-pl-mono tabular-nums text-xs">{fmt(s.vaporMolePct, 2)}</td>
                  <td className="text-right py-1 px-2 font-pl-mono tabular-nums text-xs">{fmt(s.gasGravity, 3)}</td>
                  <td className="text-right py-1 pl-2 font-pl-mono tabular-nums text-xs">{fmt(u.show('gor', s.gor), gd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-pl-muted mt-1">Vapor mol% is per 100 moles of wellstream feed.</p>
        </div>

        {totals && stockTank && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Stat label="Total GOR" value={fmt(u.show('gor', totals.totalGor), gd)} unit={u.label('gor')} />
            <Stat label="Separator GOR" value={fmt(u.show('gor', totals.separatorGor), gd)} unit={u.label('gor')} />
            <Stat label="Stock tank GOR" value={fmt(u.show('gor', totals.stockTankGor), gd)} unit={u.label('gor')} />
            <Stat label="Surface gas SG" value={fmt(totals.surfaceGasGravity, 3)} unit="air = 1" />
            <Stat label="Stock tank oil" value={fmt(stockTank.api, 1)} unit={u.label('api')} />
            <Stat label="STO density" value={fmt(u.show('density', stockTank.density), u.system === 'si' ? 1 : 2)} unit={u.label('density')} />
            <Stat label="STO molecular weight" value={fmt(stockTank.apparentMw, 1)} unit={u.label('molecularWeight')} />
            {bo && bo.reservoirPhases === 1 && (
              <Stat label="Bo (this train)" value={fmt(u.show('fvfOil', bo.multistage), 4)} unit={u.label('fvfOil')} />
            )}
          </div>
        )}

        {bo && bo.reservoirPhases === 1 && bo.singleStage != null && (
          <p className="text-xs text-pl-muted">
            A single flash straight to stock tank would give Bo {fmt(u.show('fvfOil', bo.singleStage), 4)} {u.label('fvfOil')} and GOR {fmt(u.show('gor', bo.singleStageGor), gd)} {u.label('gor')}. Staging keeps more of the intermediates in the liquid, so the multistage numbers above are the ones to use.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default CompositionalSeparatorCard;
