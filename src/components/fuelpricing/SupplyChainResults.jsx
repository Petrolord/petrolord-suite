// Trucking, fleet and station sizing (DS6).
import React from 'react';
import { Truck, Fuel, Leaf, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFuelPricing } from '@/contexts/FuelPricingContext';
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

const SupplyChainResults = () => {
  const { lane, fleet, station, applyLaneCostToTransport } = useFuelPricing();

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-pl-text flex items-center gap-2">
            <Truck className="w-4 h-4 text-pl-muted" /> The lane
          </h3>
          <Button size="sm" variant="outline" className="h-7 text-xs border-pl-border"
            onClick={applyLaneCostToTransport} disabled={!!lane.error || lane.costPerLitreDelivered === null}>
            Use this as the transport line
          </Button>
        </div>
        {lane.error ? (
          <p className="text-sm text-pl-warning-text">{lane.error}</p>
        ) : (
          <>
            <p className="text-[11px] text-pl-muted mb-2">
              Trips per truck are derived from the cycle, so nothing is assumed. It is the cycle that decides
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
            <NumericTable className="mt-3 p-0" data-testid="lane-cost-table">
              <thead>
                <tr><NumTh sticky>Cost component</NumTh><NumTh numeric>Per trip</NumTh></tr>
              </thead>
              <tbody>
                {lane.components.map((c) => (
                  <NumRow key={c.label} className={c.required ? 'bg-pl-warning-bg' : ''}>
                    <RowLabel className={c.required ? 'bg-pl-warning-bg' : ''}>{c.label}</RowLabel>
                    <NumCell value={c.amount}>{c.amount === null ? 'input required' : fmt(c.amount, 0)}</NumCell>
                  </NumRow>
                ))}
              </tbody>
            </NumericTable>
            <p className="text-[11px] text-pl-muted mt-2 flex items-start gap-2">
              <Leaf className="w-3.5 h-3.5 text-pl-muted mt-0.5 shrink-0" />
              {lane.carbonNote || `${fmt(lane.kgCo2ePerTrip, 1)} kgCO2e per trip, ${fmt(lane.kgCo2ePerLitreDelivered, 4)} per litre delivered, from the same diesel burn that priced the trip.`}
            </p>
          </>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-pl-text mb-1 flex items-center gap-2">
          <Fuel className="w-4 h-4 text-pl-muted" /> The fleet
        </h3>
        {fleet.error ? <p className="text-sm text-pl-warning-text">{fleet.error}</p> : (
          <>
            <p className="text-[11px] text-pl-muted mb-2">
              Fleet size rounds up, because a fraction of a truck does not exist. The spare that
              rounding buys is shown in the open: it is the argument for whether the last
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
        <h3 className="text-sm font-semibold text-pl-text mb-1">The station</h3>
        {station.error ? <p className="text-sm text-pl-warning-text">{station.error}</p> : (
          <>
            <p className="text-[11px] text-pl-muted mb-2">
              A forecourt and a loading rack are the same queueing system in different units, so
              this calls the rack model, speaking in nozzles, and keeps one model with no second
              copy to disagree with it. Utilisation alone is misleading: a forecourt at 85 percent does not have
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
              <div className="mt-3 rounded border border-pl-warning/40 bg-pl-warning-bg p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-pl-warning-text mt-0.5 shrink-0" />
                <p className="text-xs text-pl-warning-text">{station.ullageWarning}</p>
              </div>
            )}
            {station.payloadFitsUllage === true && (
              <p className="text-[11px] text-pl-muted mt-2">
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
