// LPG and CNG inputs, and the conversion case (DS7).
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLpgCng, LPG_PROPERTY_NOTE } from '@/contexts/LpgCngContext';

let cellSeq = 0;
const Cell = ({ label, value, onChange, unit, placeholder }) => {
  const id = React.useMemo(() => `lc-${(cellSeq += 1)}`, []);
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

const Group = ({ title, children, note }) => (
  <div>
    <h2 className="text-sm font-semibold text-white mb-1">{title}</h2>
    {note && <p className="text-[10px] text-slate-500 mb-1.5">{note}</p>}
    <div className="grid grid-cols-2 gap-2">{children}</div>
  </div>
);

const RolloutInputs = () => {
  const {
    inputs, setLpg, setCng, setConversion, setLpgSection, setCngSection,
    setBank, setComponent, setCycleStage,
  } = useLpgCng();

  return (
    <div className="space-y-4">
      <Group title="LPG blend" note={LPG_PROPERTY_NOTE}>
        {inputs.lpg.components.map((c) => (
          <Cell key={c.id} label={c.label} unit="volume fraction"
            value={c.volumeFraction}
            onChange={(v) => setComponent(c.id, { volumeFraction: v })} />
        ))}
      </Group>

      <Group title="LPG storage"
        note="The maximum fill ratio is a code limit for the product and the vessel and is not supplied by this app: LPG expands and a vessel filled liquid-full ruptures hydraulically.">
        <Cell label="Vessel capacity" unit="m3" value={inputs.lpg.vesselCapacityM3} onChange={(v) => setLpg({ vesselCapacityM3: v })} />
        <Cell label="Max fill ratio" value={inputs.lpg.maxFillRatio} placeholder="required" onChange={(v) => setLpg({ maxFillRatio: v })} />
        <Cell label="Demand" unit="t/day" value={inputs.lpg.demandTonnesPerDay} onChange={(v) => setLpg({ demandTonnesPerDay: v })} />
        <Cell label="Delivery" unit="t" value={inputs.lpg.deliveryTonnes} onChange={(v) => setLpg({ deliveryTonnes: v })} />
        <Cell label="Lead time" unit="days" value={inputs.lpg.leadTimeDays} onChange={(v) => setLpg({ leadTimeDays: v })} />
        <Cell label="Safety stock" unit="days" value={inputs.lpg.safetyDays} onChange={(v) => setLpg({ safetyDays: v })} />
      </Group>

      <Group title="Vaporizer">
        <Cell label="Mass flow" unit="kg/h" value={inputs.lpg.vaporizer.massFlowKgHr} onChange={(v) => setLpgSection('vaporizer', { massFlowKgHr: v })} />
        <Cell label="Liquid cp" unit="kJ/kg.K" value={inputs.lpg.vaporizer.liquidCpKJkgK} onChange={(v) => setLpgSection('vaporizer', { liquidCpKJkgK: v })} />
        <Cell label="Inlet" unit="C" value={inputs.lpg.vaporizer.inletTempC} onChange={(v) => setLpgSection('vaporizer', { inletTempC: v })} />
        <Cell label="Vapour cp" unit="kJ/kg.K" value={inputs.lpg.vaporizer.vapourCpKJkgK} onChange={(v) => setLpgSection('vaporizer', { vapourCpKJkgK: v })} />
        <Cell label="Outlet" unit="C" value={inputs.lpg.vaporizer.outletTempC} onChange={(v) => setLpgSection('vaporizer', { outletTempC: v })} />
        <Cell label="Design margin" unit="%" value={inputs.lpg.vaporizer.designMarginPercent} onChange={(v) => setLpgSection('vaporizer', { designMarginPercent: v })} />
      </Group>

      <Group title="Bottling plant">
        <Cell label="Cylinders" unit="/day" value={inputs.lpg.bottling.cylindersPerDay} onChange={(v) => setLpgSection('bottling', { cylindersPerDay: v })} />
        <Cell label="Fill time" unit="min" value={inputs.lpg.bottling.fillMinutesPerCylinder} onChange={(v) => setLpgSection('bottling', { fillMinutesPerCylinder: v })} />
        <Cell label="Positions" value={inputs.lpg.bottling.positions} onChange={(v) => setLpgSection('bottling', { positions: v })} />
        <Cell label="Shift" unit="h/day" value={inputs.lpg.bottling.shiftHoursPerDay} onChange={(v) => setLpgSection('bottling', { shiftHoursPerDay: v })} />
        <Cell label="Availability" unit="fraction" value={inputs.lpg.bottling.availabilityFraction} onChange={(v) => setLpgSection('bottling', { availabilityFraction: v })} />
        <Cell label="Cylinder spares" unit="fraction" value={inputs.lpg.cylinderSparesFraction} onChange={(v) => setLpg({ cylinderSparesFraction: v })} />
      </Group>

      <Group title="Cylinder cycle" note="The time a cylinder spends at the customer is usually most of the fleet, and it is the only stage the operator can negotiate.">
        {inputs.lpg.cylinderCycle.map((s) => (
          <Cell key={s.id} label={s.label} unit="days" value={s.days}
            onChange={(v) => setCycleStage('lpg', s.id, { days: v })} />
        ))}
      </Group>

      <Group title="CNG cascade">
        <Cell label="Gas gravity" value={inputs.cng.gasSg} onChange={(v) => setCng({ gasSg: v })} />
        <Cell label="Temperature" unit="C" value={inputs.cng.temperatureC} onChange={(v) => setCng({ temperatureC: v })} />
        {inputs.cng.banks.map((b) => (
          <React.Fragment key={b.id}>
            <Cell label={`${b.label} volume`} unit="m3" value={b.volumeM3} onChange={(v) => setBank(b.id, { volumeM3: v })} />
            <Cell label={`${b.label} pressure`} unit="bar" value={b.pressureBar} onChange={(v) => setBank(b.id, { pressureBar: v })} />
          </React.Fragment>
        ))}
        <Cell label="Vehicle tank" unit="m3" value={inputs.cng.vehicleTankM3} onChange={(v) => setCng({ vehicleTankM3: v })} />
        <Cell label="Vehicle start" unit="bar" value={inputs.cng.vehicleStartBar} onChange={(v) => setCng({ vehicleStartBar: v })} />
        <Cell label="Vehicle target" unit="bar" value={inputs.cng.vehicleTargetBar} onChange={(v) => setCng({ vehicleTargetBar: v })} />
      </Group>

      <Group title="Compression and dispensing">
        <Cell label="Throughput" unit="kg/h" value={inputs.cng.compression.throughputKgPerHour} onChange={(v) => setCngSection('compression', { throughputKgPerHour: v })} />
        <Cell label="Suction" unit="bar" value={inputs.cng.compression.suctionBar} onChange={(v) => setCngSection('compression', { suctionBar: v })} />
        <Cell label="Discharge" unit="bar" value={inputs.cng.compression.dischargeBar} onChange={(v) => setCngSection('compression', { dischargeBar: v })} />
        <Cell label="Suction temp" unit="C" value={inputs.cng.compression.suctionTempC} onChange={(v) => setCngSection('compression', { suctionTempC: v })} />
        <Cell label="Vehicles" unit="/h" value={inputs.cng.dispensing.vehiclesPerHour} onChange={(v) => setCngSection('dispensing', { vehiclesPerHour: v })} />
        <Cell label="Fill time" unit="min" value={inputs.cng.dispensing.fillMinutes} onChange={(v) => setCngSection('dispensing', { fillMinutes: v })} />
        <Cell label="Dispensers" value={inputs.cng.dispensing.dispensers} onChange={(v) => setCngSection('dispensing', { dispensers: v })} />
        <Cell label="Trailer trips" unit="/day" value={inputs.cng.trailerTripsPerDay} onChange={(v) => setCng({ trailerTripsPerDay: v })} />
      </Group>

      <Group title="Trailer cycle" note="A trailer shuttling to a daughter station is the same problem as a cylinder in circulation, and runs through the same model.">
        {inputs.cng.trailerCycle.map((s) => (
          <Cell key={s.id} label={s.label} unit="days" value={s.days}
            onChange={(v) => setCycleStage('cng', s.id, { days: v })} />
        ))}
        <Cell label="Trailer spares" unit="fraction" value={inputs.cng.trailerSparesFraction} onChange={(v) => setCng({ trailerSparesFraction: v })} />
      </Group>

      <Group title="The conversion case"
        note="Leave the new fuel's consumption blank to derive it from energy equivalence; the efficiency ratio is then the assumption doing the work, so it is on screen rather than buried.">
        <Cell label="Annual distance" unit="km" value={inputs.conversion.annualDistanceKm} onChange={(v) => setConversion({ annualDistanceKm: v })} />
        <Cell label="Efficiency ratio" value={inputs.conversion.efficiencyRatio} onChange={(v) => setConversion({ efficiencyRatio: v })} />
        <Cell label="Base use" unit="/100km" value={inputs.conversion.baseConsumptionPer100Km} onChange={(v) => setConversion({ baseConsumptionPer100Km: v })} />
        <Cell label="Base price" unit="/unit" value={inputs.conversion.basePricePerUnit} onChange={(v) => setConversion({ basePricePerUnit: v })} />
        <Cell label="Base energy" unit="MJ/unit" value={inputs.conversion.baseEnergyPerUnitMJ} onChange={(v) => setConversion({ baseEnergyPerUnitMJ: v })} />
        <Cell label="Base factor" unit="kgCO2e/unit" value={inputs.conversion.baseEmissionFactor} placeholder="required for carbon" onChange={(v) => setConversion({ baseEmissionFactor: v })} />
        <Cell label="New use" unit="/100km" value={inputs.conversion.newConsumptionPer100Km} placeholder="derive" onChange={(v) => setConversion({ newConsumptionPer100Km: v })} />
        <Cell label="New price" unit="/unit" value={inputs.conversion.newPricePerUnit} onChange={(v) => setConversion({ newPricePerUnit: v })} />
        <Cell label="New energy" unit="MJ/unit" value={inputs.conversion.newEnergyPerUnitMJ} onChange={(v) => setConversion({ newEnergyPerUnitMJ: v })} />
        <Cell label="New factor" unit="kgCO2e/unit" value={inputs.conversion.newEmissionFactor} placeholder="required for carbon" onChange={(v) => setConversion({ newEmissionFactor: v })} />
        <Cell label="Conversion cost" value={inputs.conversion.conversionCost} onChange={(v) => setConversion({ conversionCost: v })} />
        <Cell label="Extra maintenance" unit="/yr" value={inputs.conversion.annualExtraMaintenance} onChange={(v) => setConversion({ annualExtraMaintenance: v })} />
      </Group>
    </div>
  );
};

export default RolloutInputs;
