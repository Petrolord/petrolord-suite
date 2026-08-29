// Trucking, fleet and station sizing (DS6).
import React from 'react';
import { Truck, Fuel, Leaf, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFuelPricing } from '@/contexts/FuelPricingContext';

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

const SupplyChainResults = () => {
  const { lane, fleet, station, applyLaneCostToTransport } = useFuelPricing();

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Truck className="w-4 h-4 text-cyan-400" /> The lane
          </h3>
          <Button size="sm" variant="outline" className="h-7 text-xs border-slate-700"
            onClick={applyLaneCostToTransport} disabled={!!lane.error || lane.costPerLitreDelivered === null}>
            Use this as the transport line
          </Button>
        </div>
        {lane.error ? (
          <p className="text-sm text-amber-300">{lane.error}</p>
        ) : (
          <>
            <p className="text-[11px] text-slate-500 mb-2">
              Trips per truck are derived from the cycle, not assumed. It is the cycle that decides
              how the fixed costs spread, which is why a slow lane carries more capital cost per
              trip than a fast one of the same length.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Cycle" value={`${fmt(lane.cycleHours)} h`} hint={`${fmt(lane.roundTripKm, 0)} km round trip`} />
              <Stat label="Trips per truck" value={fmt(lane.tripsPerTruckPerDay)} hint="per day" />
              <Stat label="Cost per trip" value={fmt(lane.costPerTrip, 0)} />
              <Stat label="Per litre delivered" value={fmt(lane.costPerLitreDelivered, 3)}
                hint={`${fmt(lane.deliveredLitresPerTrip, 0)} litres delivered of the load`} />
            </div>
            <div className="overflow-x-auto rounded border border-slate-800 mt-3">
              <table className="w-full text-xs">
                <thead className="bg-slate-900/80 text-slate-400">
                  <tr><th className="text-left px-2 py-1.5">Cost component</th><th className="text-right px-2 py-1.5">Per trip</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {lane.components.map((c) => (
                    <tr key={c.label} className={c.required ? 'bg-amber-950/20' : ''}>
                      <td className="px-2 py-1 text-slate-200">{c.label}</td>
                      <td className="px-2 py-1 text-right text-slate-200">{c.amount === null ? 'input required' : fmt(c.amount, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-400 mt-2 flex items-start gap-2">
              <Leaf className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
              {lane.carbonNote || `${fmt(lane.kgCo2ePerTrip, 1)} kgCO2e per trip, ${fmt(lane.kgCo2ePerLitreDelivered, 4)} per litre delivered, from the same diesel burn that priced the trip.`}
            </p>
          </>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
          <Fuel className="w-4 h-4 text-cyan-400" /> The fleet
        </h3>
        {fleet.error ? <p className="text-sm text-amber-300">{fleet.error}</p> : (
          <>
            <p className="text-[11px] text-slate-500 mb-2">
              Fleet size rounds up, because a fraction of a truck does not exist. The spare that
              rounding buys is shown rather than buried: it is the argument for whether the last
              truck should be owned or hired.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Trips needed" value={fmt(fleet.tripsNeededPerDay)} hint="per day" />
              <Stat label="Trucks required" value={fleet.trucksRequired} />
              <Stat label="Utilisation" value={`${fmt(fleet.utilisation * 100, 1)}%`} />
              <Stat label="Spare" value={`${fmt(fleet.spareLitresPerDay, 0)} L/day`} hint={`${fmt(fleet.spareTripsPerDay)} trips`} />
            </div>
          </>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-1">The station</h3>
        {station.error ? <p className="text-sm text-amber-300">{station.error}</p> : (
          <>
            <p className="text-[11px] text-slate-500 mb-2">
              A forecourt and a loading rack are the same queueing system in different units, so
              this calls the rack model rather than writing a second one that could disagree with
              the first. Utilisation alone is misleading: a forecourt at 85 percent does not have
              15 percent spare, it has a queue.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Peak hour" value={`${fmt(station.peakTransactionsPerHour, 0)} txn/h`}
                hint={`${fmt(station.transactionsPerDay, 0)} a day`} />
              <Stat label="Nozzle utilisation" value={`${fmt(station.queue.utilisation * 100, 1)}%`} />
              <Stat label="Average wait"
                value={station.queue.stable ? `${fmt(station.queue.averageWaitMinutes)} min` : 'unbounded'}
                hint={station.queue.stable ? null : 'arrivals exceed capacity'} />
              <Stat label="Tank cover" value={station.coverDays === null ? 'no tank entered' : `${fmt(station.coverDays)} days`}
                hint={station.usableTankLitres === null ? null : `${fmt(station.usableTankLitres, 0)} litres usable`} />
            </div>
            {station.ullageWarning && (
              <div className="mt-3 rounded border border-amber-800/60 bg-amber-950/30 p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-100">{station.ullageWarning}</p>
              </div>
            )}
            {station.payloadFitsUllage === true && (
              <p className="text-[11px] text-slate-500 mt-2">
                {`The delivery load fits the ${fmt(station.ullageAtReorderLitres, 0)} litres of ullage at the reorder level.`}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default SupplyChainResults;
