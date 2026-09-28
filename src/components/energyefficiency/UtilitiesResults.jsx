// Steam losses, condensate, energy intensity and the savings register (DS8).
import React from 'react';
import { AlertTriangle, Leaf } from 'lucide-react';
import { useEnergyEfficiency } from '@/contexts/EnergyEfficiencyContext';
import {
  NumericTable, NumTh, NumRow, RowLabel, NumCell,
} from '@/components/ui/numeric-table';

const fmt = (v, dp = 2) => (Number.isFinite(v)
  ? v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })
  : 'not supplied');

const Stat = ({ label, value, hint }) => (
  <div className="rounded border border-pl-border bg-pl-surface p-3">
    <p className="text-[10px] uppercase tracking-wide text-pl-muted">{label}</p>
    <p className="text-lg font-semibold text-pl-text">{value}</p>
    {hint && <p className="text-[11px] text-pl-muted mt-0.5">{hint}</p>}
  </div>
);

const UtilitiesResults = () => {
  const {
    trap, trapPopulation, condensate, intensity, register,
  } = useEnergyEfficiency();

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-pl-text mb-1">Failed steam traps</h3>
        {trap.error ? (
          <div className="rounded-lg border border-pl-warning/40 bg-pl-warning-bg p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-pl-warning-text mt-0.5 shrink-0" />
            <p className="text-sm text-pl-warning-text">{trap.error}</p>
          </div>
        ) : (
          <>
            <p className={`text-[11px] mb-2 ${trap.choked ? 'text-pl-muted' : 'text-pl-warning-text'}`}>
              {`${trap.choked ? 'Choked' : 'Not choked'}: discharging at ${fmt(trap.downstreamPressureBarA, 3)} bar a, a pressure ratio of ${fmt(trap.pressureRatio, 4)} against the critical ${fmt(trap.criticalPressureRatio, 4)}. `}
              {trap.chokedNote}
            </p>
            {trapPopulation.error && <p className="text-sm text-pl-warning-text mb-2">{trapPopulation.error}</p>}
            {trap.fuelNote && <p className="text-[11px] text-pl-warning-text mb-2">{trap.fuelNote}</p>}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Per trap" value={`${fmt(trap.kgPerHour, 1)} kg/h`} hint={`${fmt(trap.tonnesPerYear, 0)} t a year`} />
              <Stat label={trapPopulation.error ? 'All traps' : `All ${trapPopulation.count} traps`} value={`${fmt(trapPopulation.tonnesPerYear, 0)} t/yr`} />
              <Stat label="Annual cost" value={trapPopulation.annualCost == null ? 'not priced' : fmt(trapPopulation.annualCost, 0)} hint={trapPopulation.annualCost == null ? null : 'at your steam cost per tonne'} />
              <Stat label="Carbon"
                value={trapPopulation.annualTonnesCo2e == null ? 'absent' : `${fmt(trapPopulation.annualTonnesCo2e, 0)} tCO2e/yr`}
                hint={trapPopulation.annualTonnesCo2e == null ? 'needs an emission factor' : null} />
            </div>
          </>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-pl-text mb-1">Condensate return</h3>
        {condensate.error ? <p className="text-sm text-pl-warning-text">{condensate.error}</p> : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Extra condensate" value={`${fmt(condensate.extraCondensateTonnesPerYear, 0)} t/yr`} />
              <Stat label="Energy saved" value={`${fmt(condensate.energySavedGJPerYear, 0)} GJ/yr`} />
              <Stat label="Annual value" value={fmt(condensate.annualValue, 0)} hint={condensate.complete ? null : 'a floor'} />
              <Stat label="Carbon"
                value={condensate.annualTonnesCo2e === null ? 'absent' : `${fmt(condensate.annualTonnesCo2e, 0)} tCO2e/yr`} />
            </div>
            <NumericTable className="mt-3 p-0" data-testid="condensate-value-table">
              <thead>
                <tr><NumTh sticky>Component of the value</NumTh><NumTh numeric>Per year</NumTh></tr>
              </thead>
              <tbody>
                {condensate.components.map((c) => (
                  <NumRow key={c.label} className={c.amount === null ? 'bg-pl-warning-bg' : ''}>
                    <RowLabel className={c.amount === null ? 'bg-pl-warning-bg' : ''}>{c.label}</RowLabel>
                    <NumCell value={c.amount}>{c.amount === null ? 'not priced' : fmt(c.amount, 0)}</NumCell>
                  </NumRow>
                ))}
              </tbody>
            </NumericTable>
            {condensate.valueNote && <p className="text-[11px] text-pl-warning-text mt-2">{condensate.valueNote}</p>}
          </>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-pl-text mb-1">Energy intensity</h3>
        {intensity.error ? <p className="text-sm text-pl-warning-text">{intensity.error}</p> : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Total energy" value={`${fmt(intensity.totalEnergyGJ, 0)} GJ/yr`} />
              <Stat label="Intensity" value={`${fmt(intensity.intensityMJPerTonne, 1)} MJ/t`} />
              <Stat label="Versus peer"
                value={intensity.versusPeer === null ? 'no peer figure' : `${fmt(intensity.versusPeer * 100, 0)}%`} />
              <Stat label="Gap"
                value={intensity.gapMJPerTonne === null ? '-' : `${fmt(intensity.gapMJPerTonne, 1)} MJ/t`} />
            </div>
            {intensity.peerNote && <p className="text-[11px] text-pl-warning-text mt-2">{intensity.peerNote}</p>}
            <p className="text-[11px] text-pl-warning-text mt-2">{intensity.disclaimer}</p>
            {!intensity.complete && (
              <p className="text-[11px] text-pl-warning-text mt-1">
                {`Not counted: ${intensity.missingStreams.join(', ')}.`}
              </p>
            )}
          </>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-pl-text mb-1">The savings register</h3>
        <p className="text-[11px] text-pl-muted mb-2">
          Money and carbon from the same energy, in the same run, so the two cannot disagree. The
          abatement cost per tonne is handed on for the Carbon Studio to rank rather than ranked
          here. Every row is valued as fuel at the ledger price, so a trap repair here is the steam's
          boiler fuel (steam energy over boiler efficiency) and can differ from the trap card's cost,
          which prices the steam at your steam cost per tonne.
        </p>
        <NumericTable className="p-0" data-testid="savings-register-table">
          <thead>
            <tr>
              <NumTh sticky>Measure</NumTh>
              <NumTh numeric>GJ/yr</NumTh>
              <NumTh numeric>Value/yr</NumTh>
              <NumTh numeric>tCO2e/yr</NumTh>
            </tr>
          </thead>
          <tbody>
            {register.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-2 text-xs text-pl-muted">
                No measure is fully specified yet. Supply the inputs each one names.
              </td></tr>
            )}
            {register.map((r) => (
              <NumRow key={r.id}>
                <RowLabel>
                  {r.label}
                  {r.error && <span className="block text-[11px] font-normal text-pl-warning-text">{r.error}</span>}
                </RowLabel>
                <NumCell value={r.energySavedGJ}>{fmt(r.energySavedGJ, 0)}</NumCell>
                <NumCell value={r.annualValue}>{r.annualValue === null ? 'not priced' : fmt(r.annualValue, 0)}</NumCell>
                <NumCell value={r.annualTonnesCo2e}>{r.annualTonnesCo2e === null ? 'absent' : fmt(r.annualTonnesCo2e, 1)}</NumCell>
              </NumRow>
            ))}
          </tbody>
        </NumericTable>
        {register.some((r) => r.basisNote) && (
          <p className="text-[11px] text-pl-muted mt-2">{register.find((r) => r.basisNote).basisNote}</p>
        )}
        {register.some((r) => r.carbonNote) && (
          <p className="text-[11px] text-pl-muted mt-2 flex items-start gap-1.5">
            <Leaf className="w-3.5 h-3.5 text-pl-muted mt-0.5 shrink-0" />
            {register.find((r) => r.carbonNote).carbonNote}
          </p>
        )}
      </div>
    </div>
  );
};

export default UtilitiesResults;
