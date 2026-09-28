// CNG: bank inventory, cascade, compression, dispensing, trailer float (DS7).
import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { useLpgCng } from '@/contexts/LpgCngContext';

const fmt = (v, dp = 2) => (Number.isFinite(v)
  ? v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })
  : 'not supplied');

const Stat = ({ label, value, hint }) => (
  <div className="rounded-lg border border-pl-border bg-pl-surface p-3">
    <p className="text-[10px] uppercase tracking-wide text-pl-muted">{label}</p>
    <p className="font-pl-mono text-lg font-semibold tabular-nums text-pl-text">{value}</p>
    {hint && <p className="text-[11px] text-pl-muted mt-0.5">{hint}</p>}
  </div>
);

const CngResults = () => {
  const {
    bankInventory, cascade, compression, dispensing, trailerFleet,
  } = useLpgCng();

  const extrapolated = bankInventory.filter((b) => b.correlationInRange === false);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-pl-text mb-1">What the banks actually hold</h3>
        <p className="text-[11px] text-pl-muted mb-2">
          At 200 to 250 bar the compressibility factor is nowhere near one, so a bank holds
          appreciably more gas than the ideal gas law says. Sizing a cascade on ideal gas is wrong
          by about a fifth, in a direction nobody notices until the station is built. The factor
          used is shown so it can be checked against your own data.
        </p>
        <div className="overflow-x-auto rounded border border-pl-border">
          <table className="w-full text-xs">
            <thead className="bg-pl-sunken text-pl-muted">
              <tr>
                <th className="text-left px-2 py-1.5">Bank</th>
                <th className="text-right px-2 py-1.5">Z</th>
                <th className="text-right px-2 py-1.5">Real (kg)</th>
                <th className="text-right px-2 py-1.5">Ideal (kg)</th>
                <th className="text-right px-2 py-1.5">Real / ideal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pl-border">
              {bankInventory.map((b) => (
                <tr key={b.id}>
                  <td className="px-2 py-1 text-pl-text">{b.label}</td>
                  <td className="px-2 py-1 text-right text-pl-text">{fmt(b.z, 4)}</td>
                  <td className="px-2 py-1 text-right text-pl-text">{fmt(b.massKg, 1)}</td>
                  <td className="px-2 py-1 text-right text-pl-muted">{fmt(b.idealMassKg, 1)}</td>
                  <td className="px-2 py-1 text-right text-pl-text">{fmt(b.realVersusIdeal, 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {extrapolated.length > 0 && (
          <p className="text-[11px] text-pl-warning-text mt-2 flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            {extrapolated[0].correlationNote}
          </p>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-pl-text mb-1">The cascade</h3>
        {cascade.error ? <p className="text-sm text-pl-warning-text">{cascade.error}</p> : (
          <>
            <p className="text-[11px] text-pl-muted mb-2">{cascade.note}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Per fill" value={`${fmt(cascade.kgPerFill, 2)} kg`} />
              <Stat label="Fills before recharge" value={cascade.fillsBeforeRecharge} hint={`${fmt(cascade.deliveredKg, 0)} kg delivered`} />
              <Stat label="Left in the banks" value={`${fmt(cascade.leftInBanksKg, 0)} kg`} hint="for the compressor to bring back up" />
              <Stat label="Cascade efficiency" value={`${fmt(cascade.cascadeEfficiency * 100, 1)}%`} hint="of what the banks hold" />
            </div>
            <div className="overflow-x-auto rounded border border-pl-border mt-3">
              <table className="w-full text-xs">
                <thead className="bg-pl-sunken text-pl-muted">
                  <tr>
                    <th className="text-left px-2 py-1.5">Bank</th>
                    <th className="text-right px-2 py-1.5">Start (bar(a))</th>
                    <th className="text-right px-2 py-1.5">After the run (bar(a))</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pl-border">
                  {cascade.banksAfter.map((b) => (
                    <tr key={b.label}>
                      <td className="px-2 py-1 text-pl-text">{b.label}</td>
                      <td className="px-2 py-1 text-right text-pl-muted">{fmt(b.startBar, 1)}</td>
                      <td className="px-2 py-1 text-right text-pl-text">{fmt(b.endBar, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {cascade.nextVehicleReachesBar !== null && (
              <p className="text-[11px] text-pl-muted mt-2">
                {`The next vehicle would reach only ${fmt(cascade.nextVehicleReachesBar, 1)} bar(a), short of its target, so it is not counted as a fill: the compressor has to recharge the banks first.`}
              </p>
            )}
            {cascade.hitFillLimit && (
              <p className="text-[11px] text-pl-warning-text mt-1">The count stopped at the fill limit; the banks could fill more.</p>
            )}
          </>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-pl-text mb-1">Compression</h3>
        {compression.error ? <p className="text-sm text-pl-warning-text">{compression.error}</p> : (
          <>
            <p className="text-[11px] text-pl-muted mb-2">{compression.basis}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Stages" value={compression.stageCount} hint={compression.governedBy ? `governed by ${compression.governedBy}` : null} />
              <Stat label="Brake power" value={`${fmt(compression.totalBrakeKW, 1)} kW`} />
              <Stat label="Specific energy" value={`${fmt(compression.specificEnergyKWhPerKg, 3)} kWh/kg`} />
              <Stat label="Final discharge" value={`${fmt(compression.finalDischargeC, 0)} C`} />
            </div>
            <div className="overflow-x-auto rounded border border-pl-border mt-3">
              <table className="w-full text-xs">
                <thead className="bg-pl-sunken text-pl-muted">
                  <tr>
                    <th className="text-left px-2 py-1.5">Stage</th>
                    <th className="text-right px-2 py-1.5">Suction (bar(a))</th>
                    <th className="text-right px-2 py-1.5">Discharge (bar(a))</th>
                    <th className="text-right px-2 py-1.5">Discharge (C)</th>
                    <th className="text-right px-2 py-1.5">Z</th>
                    <th className="text-right px-2 py-1.5">kW</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pl-border">
                  {compression.stages.map((s) => (
                    <tr key={s.stage} className={s.warning ? 'bg-pl-warning-bg' : ''}>
                      <td className="px-2 py-1 text-pl-text">{s.stage}</td>
                      <td className="px-2 py-1 text-right text-pl-muted">{fmt(s.suctionBar, 1)}</td>
                      <td className="px-2 py-1 text-right text-pl-muted">{fmt(s.dischargeBar, 1)}</td>
                      <td className="px-2 py-1 text-right text-pl-text">{fmt(s.dischargeC, 0)}</td>
                      <td className="px-2 py-1 text-right text-pl-text">{fmt(s.z, 3)}</td>
                      <td className="px-2 py-1 text-right text-pl-text">{fmt(s.brakeKW, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-pl-text mb-1">Dispensing</h3>
        {dispensing.error ? <p className="text-sm text-pl-warning-text">{dispensing.error}</p> : (
          <>
            <p className="text-[11px] text-pl-muted mb-2">{dispensing.note}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Utilisation" value={`${fmt(dispensing.queue.utilisation * 100, 1)}%`} />
              <Stat label="Average wait"
                value={dispensing.queue.stable ? `${fmt(dispensing.queue.averageWaitMinutes, 1)} min` : 'unbounded'}
                hint={dispensing.queue.stable ? null : 'arrivals exceed capacity'} />
              <Stat label="Gas dispensed" value={dispensing.kgPerHour === null ? 'no fill size' : `${fmt(dispensing.kgPerHour, 0)} kg/h`} />
              <Stat label="At this rate" value={`${fmt(dispensing.vehiclesPerDayAtThisRate, 0)} veh/day`} />
            </div>
          </>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-pl-text mb-1">The trailer float</h3>
        <p className="text-[11px] text-pl-muted mb-2">
          A trailer shuttling to a daughter station is a fleet in a cycle, exactly like a cylinder,
          so it runs through the same model rather than a second one that could disagree.
        </p>
        {trailerFleet.error ? <p className="text-sm text-pl-warning-text">{trailerFleet.error}</p> : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Cycle" value={`${fmt(trailerFleet.cycleDays, 2)} days`} hint={`${trailerFleet.dominantStage} dominates`} />
            <Stat label="In circulation" value={fmt(trailerFleet.inCirculation, 2)} />
            <Stat label="Spares" value={fmt(trailerFleet.sparesAllowance, 2)} />
            <Stat label="Trailers required" value={trailerFleet.fleetRequired} />
          </div>
        )}
      </div>
    </div>
  );
};

export default CngResults;
