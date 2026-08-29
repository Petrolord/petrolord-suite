// Steam losses, condensate, energy intensity and the savings register (DS8).
import React from 'react';
import { AlertTriangle, Leaf } from 'lucide-react';
import { useEnergyEfficiency } from '@/contexts/EnergyEfficiencyContext';

const fmt = (v, dp = 2) => (Number.isFinite(v)
  ? v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })
  : 'not supplied');

const Stat = ({ label, value, hint }) => (
  <div className="rounded border border-slate-800 bg-slate-900/60 p-3">
    <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
    <p className="text-lg font-semibold text-white">{value}</p>
    {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
  </div>
);

const UtilitiesResults = () => {
  const {
    trap, trapPopulation, condensate, intensity, register,
  } = useEnergyEfficiency();

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-white mb-1">Failed steam traps</h3>
        {trap.error ? (
          <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-100">{trap.error}</p>
          </div>
        ) : (
          <>
            <p className="text-[11px] text-slate-500 mb-2">{trap.chokedNote}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Per trap" value={`${fmt(trap.kgPerHour, 1)} kg/h`} hint={`${fmt(trap.tonnesPerYear, 0)} t a year`} />
              <Stat label={`All ${trapPopulation.count} traps`} value={`${fmt(trapPopulation.tonnesPerYear, 0)} t/yr`} />
              <Stat label="Annual cost" value={trapPopulation.annualCost === null ? 'not priced' : fmt(trapPopulation.annualCost, 0)} />
              <Stat label="Carbon"
                value={trapPopulation.annualTonnesCo2e === null ? 'absent' : `${fmt(trapPopulation.annualTonnesCo2e, 0)} tCO2e/yr`}
                hint={trapPopulation.annualTonnesCo2e === null ? 'needs an emission factor' : null} />
            </div>
          </>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-1">Condensate return</h3>
        {condensate.error ? <p className="text-sm text-amber-300">{condensate.error}</p> : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Extra condensate" value={`${fmt(condensate.extraCondensateTonnesPerYear, 0)} t/yr`} />
              <Stat label="Energy saved" value={`${fmt(condensate.energySavedGJPerYear, 0)} GJ/yr`} />
              <Stat label="Annual value" value={fmt(condensate.annualValue, 0)} hint={condensate.complete ? null : 'a floor'} />
              <Stat label="Carbon"
                value={condensate.annualTonnesCo2e === null ? 'absent' : `${fmt(condensate.annualTonnesCo2e, 0)} tCO2e/yr`} />
            </div>
            <div className="overflow-x-auto rounded border border-slate-800 mt-3">
              <table className="w-full text-xs">
                <thead className="bg-slate-900/80 text-slate-400">
                  <tr><th className="text-left px-2 py-1.5">Component of the value</th><th className="text-right px-2 py-1.5">Per year</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {condensate.components.map((c) => (
                    <tr key={c.label} className={c.amount === null ? 'bg-amber-950/20' : ''}>
                      <td className="px-2 py-1 text-slate-200">{c.label}</td>
                      <td className="px-2 py-1 text-right text-slate-200">{c.amount === null ? 'not priced' : fmt(c.amount, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {condensate.valueNote && <p className="text-[11px] text-amber-300 mt-2">{condensate.valueNote}</p>}
          </>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-1">Energy intensity</h3>
        {intensity.error ? <p className="text-sm text-amber-300">{intensity.error}</p> : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Total energy" value={`${fmt(intensity.totalEnergyGJ, 0)} GJ/yr`} />
              <Stat label="Intensity" value={`${fmt(intensity.intensityMJPerTonne, 1)} MJ/t`} />
              <Stat label="Versus peer"
                value={intensity.versusPeer === null ? 'no peer figure' : `${fmt(intensity.versusPeer * 100, 0)}%`} />
              <Stat label="Gap"
                value={intensity.gapMJPerTonne === null ? '-' : `${fmt(intensity.gapMJPerTonne, 1)} MJ/t`} />
            </div>
            <p className="text-[11px] text-amber-200/90 mt-2">{intensity.disclaimer}</p>
            {!intensity.complete && (
              <p className="text-[11px] text-amber-300 mt-1">
                {`Not counted: ${intensity.missingStreams.join(', ')}.`}
              </p>
            )}
          </>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-1">The savings register</h3>
        <p className="text-[11px] text-slate-500 mb-2">
          Money and carbon from the same energy, in the same run, so the two cannot disagree. The
          abatement cost per tonne is handed on for the Carbon Studio to rank rather than ranked
          here.
        </p>
        <div className="overflow-x-auto rounded border border-slate-800">
          <table className="w-full text-xs">
            <thead className="bg-slate-900/80 text-slate-400">
              <tr>
                <th className="text-left px-2 py-1.5">Measure</th>
                <th className="text-right px-2 py-1.5">GJ/yr</th>
                <th className="text-right px-2 py-1.5">Value/yr</th>
                <th className="text-right px-2 py-1.5">tCO2e/yr</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {register.length === 0 && (
                <tr><td colSpan={4} className="px-2 py-2 text-slate-500">
                  No measure is fully specified yet. Supply the inputs each one names.
                </td></tr>
              )}
              {register.map((r) => (
                <tr key={r.id}>
                  <td className="px-2 py-1 text-slate-200">{r.label}</td>
                  <td className="px-2 py-1 text-right text-slate-300">{fmt(r.energySavedGJ, 0)}</td>
                  <td className="px-2 py-1 text-right text-white">{r.annualValue === null ? 'not priced' : fmt(r.annualValue, 0)}</td>
                  <td className="px-2 py-1 text-right text-emerald-300">{r.annualTonnesCo2e === null ? 'absent' : fmt(r.annualTonnesCo2e, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {register.some((r) => r.carbonNote) && (
          <p className="text-[11px] text-slate-400 mt-2 flex items-start gap-1.5">
            <Leaf className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
            {register.find((r) => r.carbonNote).carbonNote}
          </p>
        )}
      </div>
    </div>
  );
};

export default UtilitiesResults;
