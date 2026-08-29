// The gas, the screening, and the bid comparison (DS10).
import React from 'react';
import { AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react';
import { useFlareToValue } from '@/contexts/FlareToValueContext';

const fmt = (v, dp = 2) => (Number.isFinite(v)
  ? v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })
  : 'not available');

const Stat = ({ label, value, hint }) => (
  <div className="rounded border border-slate-800 bg-slate-900/60 p-3">
    <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
    <p className="text-lg font-semibold text-white">{value}</p>
    {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
  </div>
);

const VERDICT = {
  passes: { icon: CheckCircle2, cls: 'text-emerald-400', label: 'passes' },
  fails: { icon: AlertTriangle, cls: 'text-red-400', label: 'fails' },
  'not fully screened': { icon: HelpCircle, cls: 'text-amber-400', label: 'not fully screened' },
};

const ScreeningResults = () => {
  const { gas, screenings, comparison } = useFlareToValue();

  if (gas.error) {
    return (
      <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
        <p className="text-sm text-amber-100">{gas.error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-white mb-1">The gas that is actually there</h3>
        <p className="text-[11px] text-slate-500 mb-2">{gas.gpmBasis}</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Heating value" value={gas.ghvBtuScf === null ? 'not available' : `${fmt(gas.ghvBtuScf, 0)} Btu/scf`} hint={gas.ghvNote ? 'a component is missing one' : null} />
          <Stat label="Inerts" value={`${fmt(gas.inertMoleFraction * 100, 1)}%`} hint={`${fmt(gas.co2MoleFraction * 100, 1)}% of it CO2`} />
          <Stat label="Liquids" value={`${fmt(gas.gpmC3Plus, 2)} gal/Mscf`} hint={`C3+, and the gas is ${gas.richness}`} />
          <Stat label="Carbon" value={`${fmt(gas.carbonPerMol, 2)} per mol`} hint="what the flare turns into CO2" />
        </div>
        {gas.missingLiquidDensity.length > 0 && (
          <p className="text-[11px] text-amber-300 mt-2">
            {`No liquid density for ${gas.missingLiquidDensity.join(', ')}, so those are left out of the liquids content rather than counted as nothing.`}
          </p>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-1">Screening</h3>
        <p className="text-[11px] text-slate-500 mb-2">
          A requirement with no limit set is reported as unchecked rather than passed, because an
          unset limit is not a satisfied one. A failure names which requirement failed and by how
          much, since &quot;not feasible&quot; is not an answer anybody can act on.
        </p>
        <div className="space-y-2">
          {screenings.filter((s) => !s.error).map((s) => {
            const v = VERDICT[s.verdict];
            const Icon = v.icon;
            return (
              <div key={s.routeId} className="rounded border border-slate-800 bg-slate-900/60 p-3">
                <p className="flex items-center gap-2 font-medium text-white text-sm">
                  <Icon className={`w-4 h-4 ${v.cls}`} />
                  {s.label}
                  <span className={`text-xs ${v.cls}`}>{v.label}</span>
                </p>
                {s.failures.length > 0 && (
                  <ul className="text-[11px] text-red-200 mt-1.5 list-disc pl-5">
                    {s.failures.map((f) => (
                      <li key={f.requirement}>
                        {`${f.requirement}: ${fmt(f.actual, 3)} against a limit of ${fmt(f.limit, 3)} ${f.unit}, short by ${fmt(f.shortfall, 3)}.`}
                      </li>
                    ))}
                  </ul>
                )}
                {s.uncheckedRequirements.length > 0 && (
                  <p className="text-[11px] text-amber-300 mt-1.5">
                    {`Not checked: ${s.uncheckedRequirements.join(', ')}. Set the limits your licensor or your market require.`}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-1">The bid comparison</h3>
        <p className="text-[11px] text-slate-500 mb-2">
          A route that failed screening stays in the table with its failure named. A route missing
          from a comparison reads as one nobody considered, and in a bid that is the difference
          between thorough and careless.
        </p>
        <div className="overflow-x-auto rounded border border-slate-800">
          <table className="w-full text-xs">
            <thead className="bg-slate-900/80 text-slate-400">
              <tr>
                <th className="text-left px-2 py-1.5">Route</th>
                <th className="text-left px-2 py-1.5">Screening</th>
                <th className="text-right px-2 py-1.5">Capital</th>
                <th className="text-right px-2 py-1.5">Margin/yr</th>
                <th className="text-right px-2 py-1.5">Value/Mscf</th>
                <th className="text-right px-2 py-1.5">Abatement t/yr</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {comparison.rows.map((r) => (
                <tr key={r.routeId} className={r.verdict === 'fails' ? 'bg-red-950/20' : ''}>
                  <td className="px-2 py-1 text-slate-200">
                    {r.label}
                    {comparison.bestByValuePerMscf === r.routeId && (
                      <span className="ml-2 text-[10px] text-emerald-300">best on value</span>
                    )}
                  </td>
                  <td className={`px-2 py-1 ${VERDICT[r.verdict].cls}`}>{r.verdict}</td>
                  <td className="px-2 py-1 text-right text-slate-300">{r.capitalCost === null ? '-' : fmt(r.capitalCost, 0)}</td>
                  <td className="px-2 py-1 text-right text-slate-300">{r.grossMarginPerYear === null ? '-' : fmt(r.grossMarginPerYear, 0)}</td>
                  <td className="px-2 py-1 text-right text-white">{r.valuePerMscf === null ? '-' : fmt(r.valuePerMscf, 3)}</td>
                  <td className="px-2 py-1 text-right text-emerald-300">
                    {r.netAbatementTonnesCo2ePerYear === null ? 'not stated' : fmt(r.netAbatementTonnesCo2ePerYear, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-500 mt-2">{comparison.rankingNote}</p>
      </div>
    </div>
  );
};

export default ScreeningResults;
