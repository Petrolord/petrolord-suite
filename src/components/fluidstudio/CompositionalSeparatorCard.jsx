import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Factory } from 'lucide-react';
import FluidStudioTierBadge from '@/components/fluidstudio/FluidStudioTierBadge';

const fmt = (v, d = 1) => (v == null || !Number.isFinite(v) ? 'n/a' : Number(v).toFixed(d));

const Stat = ({ label, value, unit }) => (
  <div className="rounded-md bg-slate-800/60 border border-slate-700 px-3 py-2">
    <p className="text-[11px] text-slate-400">{label}</p>
    <p className="text-sm font-semibold text-white">{value}<span className="ml-1 text-xs font-normal text-slate-400">{unit}</span></p>
  </div>
);

/**
 * Compositional separator train (FS6): the same stage inputs as the
 * black-oil Separator Train tab, flashed per stage with the PR78 engine.
 * Replaces the black-oil card's staged-liberation approximation and its
 * multistage-Bo heuristic when the EOS fluid model is selected.
 */
const CompositionalSeparatorCard = ({ separator, tuned = false }) => {
  if (!separator) return null;
  const { stages, stockTank, totals, bo, warnings } = separator;

  return (
    <Card className="bg-slate-800/50 border-slate-700 text-white">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center text-base">
            <Factory className="w-4 h-4 mr-2 text-cyan-300" />
            Compositional separator train
          </CardTitle>
          <div className="flex gap-2">
            {tuned && <FluidStudioTierBadge tier="lab_tuned" />}
            <FluidStudioTierBadge tier="oracle_gated" />
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Each stage is a rigorous PR78 flash of the wellstream. The vapor is taken off as surface gas and the equilibrium liquid feeds the next stage, ending at stock tank conditions (14.7 psia and 60 °F). Stage pressures and temperatures come from the Separator Train inputs.
        </p>
        {warnings.length > 0 && (
          <div className="mt-2 text-xs text-amber-300 flex gap-2 items-start">
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
              <tr className="text-slate-400 border-b border-slate-700">
                <th className="text-left py-1.5 pr-2 font-medium">Stage</th>
                <th className="text-right py-1.5 px-2 font-medium">P (psia)</th>
                <th className="text-right py-1.5 px-2 font-medium">T (°F)</th>
                <th className="text-right py-1.5 px-2 font-medium">Vapor (mol%)</th>
                <th className="text-right py-1.5 px-2 font-medium">Gas SG</th>
                <th className="text-right py-1.5 pl-2 font-medium">GOR (scf/STB)</th>
              </tr>
            </thead>
            <tbody>
              {stages.map((s) => (
                <tr key={s.name} className="border-b border-slate-800 text-slate-200">
                  <td className="py-1 pr-2">{s.name}</td>
                  <td className="text-right py-1 px-2 font-mono text-xs">{fmt(s.pressure, 1)}</td>
                  <td className="text-right py-1 px-2 font-mono text-xs">{fmt(s.temperature, 0)}</td>
                  <td className="text-right py-1 px-2 font-mono text-xs">{fmt(s.vaporMolePct, 2)}</td>
                  <td className="text-right py-1 px-2 font-mono text-xs">{fmt(s.gasGravity, 3)}</td>
                  <td className="text-right py-1 pl-2 font-mono text-xs">{fmt(s.gor, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-slate-500 mt-1">Vapor mol% is per 100 moles of wellstream feed.</p>
        </div>

        {totals && stockTank && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Stat label="Total GOR" value={fmt(totals.totalGor, 1)} unit="scf/STB" />
            <Stat label="Separator GOR" value={fmt(totals.separatorGor, 1)} unit="scf/STB" />
            <Stat label="Stock tank GOR" value={fmt(totals.stockTankGor, 1)} unit="scf/STB" />
            <Stat label="Surface gas SG" value={fmt(totals.surfaceGasGravity, 3)} unit="air = 1" />
            <Stat label="Stock tank oil" value={fmt(stockTank.api, 1)} unit="°API" />
            <Stat label="STO density" value={fmt(stockTank.density, 2)} unit="lb/ft³" />
            <Stat label="STO molecular weight" value={fmt(stockTank.apparentMw, 1)} unit="lb/lb-mol" />
            {bo && bo.reservoirPhases === 1 && (
              <Stat label="Bo (this train)" value={fmt(bo.multistage, 4)} unit="rb/STB" />
            )}
          </div>
        )}

        {bo && bo.reservoirPhases === 1 && bo.singleStage != null && (
          <p className="text-xs text-slate-400">
            A single flash straight to stock tank would give Bo {fmt(bo.singleStage, 4)} rb/STB and GOR {fmt(bo.singleStageGor, 1)} scf/STB. Staging keeps more of the intermediates in the liquid, so the multistage numbers above are the ones to use.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default CompositionalSeparatorCard;
