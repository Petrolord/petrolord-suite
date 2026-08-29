// The cargo, the build-up line items, and the lane (DS6).
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFuelPricing, RATE_DISCLAIMER, PRODUCT_REFERENCE } from '@/contexts/FuelPricingContext';

let cellSeq = 0;
const Cell = ({ label, value, onChange, unit, placeholder }) => {
  const id = React.useMemo(() => `fp-${(cellSeq += 1)}`, []);
  const text = `${label}${unit ? ` (${unit})` : ''}`;
  return (
    <div>
      <Label htmlFor={id} className="text-[10px] text-slate-400">{text}</Label>
      <Input id={id} type="number" step="any" value={value ?? ''} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 bg-slate-950 border-slate-700 text-xs" />
    </div>
  );
};

const RateRow = ({ row, onChange }) => (
  <div className="flex items-center gap-2 py-1">
    <div className="flex-1 min-w-0">
      <p className="text-[11px] text-slate-300 truncate">{row.label}</p>
      <p className="text-[10px] text-slate-500">{row.basis.replace(/_/g, ' ')}</p>
    </div>
    <Input type="number" step="any" aria-label={`${row.label} rate`}
      value={row.amount ?? ''} placeholder="required"
      onChange={(e) => onChange({ amount: e.target.value })}
      className="h-7 w-24 bg-slate-950 border-slate-700 text-xs" />
  </div>
);

const PricingInputs = () => {
  const {
    inputs, setSection, setField, setCharge, setElement, landed,
  } = useFuelPricing();
  const c = inputs.cargo;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-white mb-2">The cargo</h2>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="fp-product" className="text-[10px] text-slate-400">Product</Label>
            <select id="fp-product" value={c.product}
              onChange={(e) => {
                const ref = PRODUCT_REFERENCE.find((p) => p.code === e.target.value);
                setSection('cargo', { product: e.target.value, densityKgM3: ref ? ref.typicalDensityKgM3 : c.densityKgM3 });
              }}
              className="h-7 w-full rounded bg-slate-950 border border-slate-700 text-xs px-2 text-white">
              {PRODUCT_REFERENCE.map((p) => <option key={p.code} value={p.code}>{p.code}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="fp-unit" className="text-[10px] text-slate-400">Quantity unit</Label>
            <select id="fp-unit" value={c.quantityUnit}
              onChange={(e) => setSection('cargo', { quantityUnit: e.target.value })}
              className="h-7 w-full rounded bg-slate-950 border border-slate-700 text-xs px-2 text-white">
              {['tonne', 'm3', 'litre', 'bbl'].map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <Cell label="Quantity" value={c.quantity} onChange={(v) => setSection('cargo', { quantity: v })} />
          <Cell label="Density" unit="kg/m3" value={c.densityKgM3} onChange={(v) => setSection('cargo', { densityKgM3: v })} />
          <Cell label="FOB price" unit="$" value={c.fobPrice} onChange={(v) => setSection('cargo', { fobPrice: v })} />
          <div>
            <Label htmlFor="fp-fobbasis" className="text-[10px] text-slate-400">FOB basis</Label>
            <select id="fp-fobbasis" value={c.fobBasis}
              onChange={(e) => setSection('cargo', { fobBasis: e.target.value })}
              className="h-7 w-full rounded bg-slate-950 border border-slate-700 text-xs px-2 text-white">
              {['per_tonne', 'per_m3', 'per_bbl', 'per_litre'].map((u) => <option key={u} value={u}>{u.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <Cell label="Ocean loss" unit="%" value={c.oceanLossPercent} onChange={(v) => setSection('cargo', { oceanLossPercent: v })} />
          <Cell label="Exchange rate" unit="local/$" value={inputs.fxRate} onChange={(v) => setField('fxRate', v)} />
        </div>
        <p className="text-[10px] text-slate-500 mt-1">
          Density comes from the certificate of quality. The figure filled in with the product is
          typical for it, not measured for this cargo.
        </p>
      </div>

      <div className="rounded border border-amber-900/50 bg-amber-950/20 p-2">
        <p className="text-[11px] text-amber-200/90">{RATE_DISCLAIMER}</p>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-white mb-1">Import charges</h2>
        <p className="text-[10px] text-slate-500 mb-1">
          {landed.complete
            ? 'Every rate supplied.'
            : `${landed.missingRates.length} rate(s) still required. Until they are supplied the landed cost is a floor, not a cost.`}
        </p>
        <div className="divide-y divide-slate-800">
          {inputs.charges.map((row) => (
            <RateRow key={row.rowId} row={row} onChange={(p) => setCharge(row.rowId, p)} />
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-white mb-1">Depot gate to nozzle</h2>
        <div className="divide-y divide-slate-800">
          {inputs.elements.map((row) => (
            <RateRow key={row.rowId} row={row} onChange={(p) => setElement(row.rowId, p)} />
          ))}
        </div>
        <div className="mt-2">
          <Cell label="Regulated cap, if any" unit="local/litre" value={inputs.capPerLitre}
            onChange={(v) => setField('capPerLitre', v)} placeholder="none" />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-white mb-2">The lane</h2>
        <div className="grid grid-cols-2 gap-2">
          <Cell label="Distance" unit="km" value={inputs.lane.distanceKm} onChange={(v) => setSection('lane', { distanceKm: v })} />
          <Cell label="Payload" unit="litres" value={inputs.lane.payloadLitres} onChange={(v) => setSection('lane', { payloadLitres: v })} />
          <Cell label="Average speed" unit="km/h" value={inputs.lane.averageSpeedKmh} onChange={(v) => setSection('lane', { averageSpeedKmh: v })} />
          <Cell label="Queue at depot" unit="h" value={inputs.lane.queueHours} onChange={(v) => setSection('lane', { queueHours: v })} />
          <Cell label="Diesel use" unit="L/100km" value={inputs.lane.fuelConsumptionLPer100Km} onChange={(v) => setSection('lane', { fuelConsumptionLPer100Km: v })} />
          <Cell label="Diesel price" unit="/litre" value={inputs.lane.dieselPricePerLitre} onChange={(v) => setSection('lane', { dieselPricePerLitre: v })} />
          <Cell label="Truck capital" value={inputs.lane.truckCapitalCost} onChange={(v) => setSection('lane', { truckCapitalCost: v })} />
          <Cell label="Truck life" unit="yr" value={inputs.lane.truckLifeYears} onChange={(v) => setSection('lane', { truckLifeYears: v })} />
          <Cell label="Transit loss" unit="%" value={inputs.lane.transitLossPercent} onChange={(v) => setSection('lane', { transitLossPercent: v })} />
          <Cell label="Diesel factor" unit="kgCO2e/L" value={inputs.lane.dieselEmissionFactorKgCo2ePerLitre} onChange={(v) => setSection('lane', { dieselEmissionFactorKgCo2ePerLitre: v })} />
          <Cell label="Lane demand" unit="litres/day" value={inputs.demandLitresPerDay} onChange={(v) => setField('demandLitresPerDay', v)} />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-white mb-2">The station</h2>
        <div className="grid grid-cols-2 gap-2">
          <Cell label="Throughput" unit="litres/day" value={inputs.station.dailyThroughputLitres} onChange={(v) => setSection('station', { dailyThroughputLitres: v })} />
          <Cell label="Peak hour share" value={inputs.station.peakHourShare} onChange={(v) => setSection('station', { peakHourShare: v })} />
          <Cell label="Per transaction" unit="litres" value={inputs.station.litresPerTransaction} onChange={(v) => setSection('station', { litresPerTransaction: v })} />
          <Cell label="Dispense rate" unit="L/min" value={inputs.station.dispenseRateLitresPerMinute} onChange={(v) => setSection('station', { dispenseRateLitresPerMinute: v })} />
          <Cell label="Nozzles" value={inputs.station.nozzles} onChange={(v) => setSection('station', { nozzles: v })} />
          <Cell label="Tank capacity" unit="litres" value={inputs.station.tankCapacityLitres} onChange={(v) => setSection('station', { tankCapacityLitres: v })} />
          <Cell label="Dead stock" unit="litres" value={inputs.station.deadStockLitres} onChange={(v) => setSection('station', { deadStockLitres: v })} />
          <Cell label="Reorder at" unit="fraction of usable" value={inputs.station.reorderAtFraction} onChange={(v) => setSection('station', { reorderAtFraction: v })} />
        </div>
      </div>
    </div>
  );
};

export default PricingInputs;
