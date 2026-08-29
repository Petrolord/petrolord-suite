// CNG: bank inventory, cascade, compression, dispensing, trailer float (DS7).
import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { useLpgCng } from '@/contexts/LpgCngContext';

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

const CngResults = () => {
  const {
    bankInventory, cascade, compression, dispensing, trailerFleet,
  } = useLpgCng();

  const extrapolated = bankInventory.filter((b) => b.correlationInRange === false);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-white mb-1">What the banks actually hold</h3>
        <p className="text-[11px] text-slate-500 mb-2">
          At 200 to 250 bar the compressibility factor is nowhere near one, so a bank holds
          appreciably more gas than the ideal gas law says. Sizing a cascade on ideal gas is wrong
          by about a fifth, in a direction nobody notices until the station is built. The factor
          used is shown so it can be checked against your own data.
        </p>
        <div className="overflow-x-auto rounded border border-slate-800">
          <table className="w-full text-xs">
            <thead className="bg-slate-900/80 text-slate-400">
              <tr>
                <th className="text-left px-2 py-1.5">Bank</th>
                <th className="text-right px-2 py-1.5">Z</th>
                <th className="text-right px-2 py-1.5">Real (kg)</th>
                <th className="text-right px-2 py-1.5">Ideal (kg)</th>
                <th className="text-right px-2 py-1.5">Real / ideal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {bankInventory.map((b) => (
                <tr key={b.id}>
                  <td className="px-2 py-1 text-slate-200">{b.label}</td>
                  <td className="px-2 py-1 text-right text-slate-300">{fmt(b.z, 4)}</td>
                  <td className="px-2 py-1 text-right text-white">{fmt(b.massKg, 1)}</td>
                  <td className="px-2 py-1 text-right text-slate-400">{fmt(b.idealMassKg, 1)}</td>
                  <td className="px-2 py-1 text-right text-slate-300">{fmt(b.realVersusIdeal, 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {extrapolated.length > 0 && (
          <p className="text-[11px] text-amber-300 mt-2 flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            {extrapolated[0].correlationNote}
          </p>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-1">The cascade</h3>
        {cascade.error ? <p className="text-sm text-amber-300">{cascade.error}</p> : (
          <>
            <p className="text-[11px] text-slate-500 mb-2">{cascade.note}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Per fill" value={`${fmt(cascade.kgPerFill, 2)} kg`} />
              <Stat label="Fills before recharge" value={cascade.fillsBeforeRecharge} hint={`${fmt(cascade.deliveredKg, 0)} kg delivered`} />
              <Stat label="Stranded below target" value={`${fmt(cascade.strandedBelowTargetKg, 0)} kg`} hint="inventory, but not usable" />
              <Stat label="Cascade efficiency" value={`${fmt(cascade.cascadeEfficiency * 100, 1)}%`} hint="of what the banks hold" />
            </div>
            <div className="overflow-x-auto rounded border border-slate-800 mt-3">
              <table className="w-full text-xs">
                <thead className="bg-slate-900/80 text-slate-400">
                  <tr>
                    <th className="text-left px-2 py-1.5">Bank</th>
                    <th className="text-right px-2 py-1.5">Start (bar)</th>
                    <th className="text-right px-2 py-1.5">After the run (bar)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {cascade.banksAfter.map((b) => (
                    <tr key={b.label}>
                      <td className="px-2 py-1 text-slate-200">{b.label}</td>
                      <td className="px-2 py-1 text-right text-slate-400">{fmt(b.startBar, 1)}</td>
                      <td className="px-2 py-1 text-right text-white">{fmt(b.endBar, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              {`${fmt(cascade.partialFillAvailableKg, 1)} kg is left above the target: real gas, but less than one whole fill, so it is not counted as a fill.`}
            </p>
          </>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-1">Compression</h3>
        {compression.error ? <p className="text-sm text-amber-300">{compression.error}</p> : (
          <>
            <p className="text-[11px] text-slate-500 mb-2">{compression.basis}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Stages" value={compression.stageCount} hint={compression.governedBy ? `governed by ${compression.governedBy}` : null} />
              <Stat label="Brake power" value={`${fmt(compression.totalBrakeKW, 1)} kW`} />
              <Stat label="Specific energy" value={`${fmt(compression.specificEnergyKWhPerKg, 3)} kWh/kg`} />
              <Stat label="Final discharge" value={`${fmt(compression.finalDischargeC, 0)} C`} />
            </div>
            <div className="overflow-x-auto rounded border border-slate-800 mt-3">
              <table className="w-full text-xs">
                <thead className="bg-slate-900/80 text-slate-400">
                  <tr>
                    <th className="text-left px-2 py-1.5">Stage</th>
                    <th className="text-right px-2 py-1.5">Suction (bar)</th>
                    <th className="text-right px-2 py-1.5">Discharge (bar)</th>
                    <th className="text-right px-2 py-1.5">Discharge (C)</th>
                    <th className="text-right px-2 py-1.5">Z</th>
                    <th className="text-right px-2 py-1.5">kW</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {compression.stages.map((s) => (
                    <tr key={s.stage} className={s.warning ? 'bg-amber-950/20' : ''}>
                      <td className="px-2 py-1 text-slate-200">{s.stage}</td>
                      <td className="px-2 py-1 text-right text-slate-400">{fmt(s.suctionBar, 1)}</td>
                      <td className="px-2 py-1 text-right text-slate-400">{fmt(s.dischargeBar, 1)}</td>
                      <td className="px-2 py-1 text-right text-slate-300">{fmt(s.dischargeC, 0)}</td>
                      <td className="px-2 py-1 text-right text-slate-300">{fmt(s.z, 3)}</td>
                      <td className="px-2 py-1 text-right text-white">{fmt(s.brakeKW, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-1">Dispensing</h3>
        {dispensing.error ? <p className="text-sm text-amber-300">{dispensing.error}</p> : (
          <>
            <p className="text-[11px] text-slate-500 mb-2">{dispensing.note}</p>
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
        <h3 className="text-sm font-semibold text-white mb-1">The trailer float</h3>
        <p className="text-[11px] text-slate-500 mb-2">
          A trailer shuttling to a daughter station is a fleet in a cycle, exactly like a cylinder,
          so it runs through the same model rather than a second one that could disagree.
        </p>
        {trailerFleet.error ? <p className="text-sm text-amber-300">{trailerFleet.error}</p> : (
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
