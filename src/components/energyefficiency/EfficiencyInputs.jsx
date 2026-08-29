// Fuel, heater, steam, intensity and the stream table (DS8).
import React from 'react';
import { Trash2, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  useEnergyEfficiency, FUEL_REFERENCE_NOTE, HEATING_VALUE_BASIS,
} from '@/contexts/EnergyEfficiencyContext';

let cellSeq = 0;
const Cell = ({ label, value, onChange, unit, placeholder }) => {
  const id = React.useMemo(() => `ee-${(cellSeq += 1)}`, []);
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

const EfficiencyInputs = () => {
  const {
    inputs, setSection, setFuelRow, setPinchStream, addPinchStream, removePinchStream,
    setIntensityStream,
  } = useEnergyEfficiency();

  return (
    <div className="space-y-4">
      <Group title="Fuel gas" note={FUEL_REFERENCE_NOTE}>
        {inputs.fuel.map((f) => (
          <Cell key={f.id} label={f.label} unit="mole fraction" value={f.moleFraction}
            onChange={(v) => setFuelRow(f.id, { moleFraction: v })} />
        ))}
      </Group>

      <div>
        <h2 className="text-sm font-semibold text-white mb-1">The heater</h2>
        <p className="text-[10px] text-slate-500 mb-1.5">
          The radiation loss comes off a published chart against surface area and firing rate,
          and the oxygen below which this burner makes carbon monoxide depends on the burner.
          Neither is supplied here.
        </p>
        <div className="mb-2">
          <Label htmlFor="ee-basis" className="text-[10px] text-slate-400">Heating value basis</Label>
          <select id="ee-basis" value={inputs.heater.basis}
            onChange={(e) => setSection('heater', { basis: e.target.value })}
            className="h-7 w-full rounded bg-slate-950 border border-slate-700 text-xs px-2 text-white">
            <option value={HEATING_VALUE_BASIS.LHV}>LHV (lower heating value)</option>
            <option value={HEATING_VALUE_BASIS.HHV}>HHV (higher heating value)</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Cell label="Current stack O2" unit="%" value={inputs.heater.currentO2Percent} onChange={(v) => setSection('heater', { currentO2Percent: v })} />
          <Cell label="Target stack O2" unit="%" value={inputs.heater.targetO2Percent} onChange={(v) => setSection('heater', { targetO2Percent: v })} />
          <Cell label="Minimum safe O2" unit="%" value={inputs.heater.minimumSafeO2Percent} placeholder="required" onChange={(v) => setSection('heater', { minimumSafeO2Percent: v })} />
          <Cell label="Radiation loss" unit="%" value={inputs.heater.radiationLossPercent} placeholder="required" onChange={(v) => setSection('heater', { radiationLossPercent: v })} />
          <Cell label="Stack temp" unit="C" value={inputs.heater.stackTempC} onChange={(v) => setSection('heater', { stackTempC: v })} />
          <Cell label="Air temp" unit="C" value={inputs.heater.combustionAirTempC} onChange={(v) => setSection('heater', { combustionAirTempC: v })} />
          <Cell label="Flue gas cp" unit="kJ/kg.K" value={inputs.heater.flueGasCpKJkgK} onChange={(v) => setSection('heater', { flueGasCpKJkgK: v })} />
          <Cell label="Vapour cp" unit="kJ/kg.K" value={inputs.heater.waterVapourCpKJkgK} onChange={(v) => setSection('heater', { waterVapourCpKJkgK: v })} />
          <Cell label="Water latent heat" unit="kJ/kg" value={inputs.heater.waterLatentHeatKJkg} onChange={(v) => setSection('heater', { waterLatentHeatKJkg: v })} />
          <Cell label="Annual fuel" unit="GJ" value={inputs.heater.annualFuelEnergyGJ} onChange={(v) => setSection('heater', { annualFuelEnergyGJ: v })} />
        </div>
      </div>

      <Group title="Steam traps"
        note="The discharge coefficient depends on the orifice and on how the trap failed, so it is required rather than defaulted.">
        <Cell label="Failed traps" value={inputs.steam.trapCount} onChange={(v) => setSection('steam', { trapCount: v })} />
        <Cell label="Orifice" unit="mm" value={inputs.steam.orificeDiameterMm} onChange={(v) => setSection('steam', { orificeDiameterMm: v })} />
        <Cell label="Pressure" unit="bar a" value={inputs.steam.upstreamPressureBarA} onChange={(v) => setSection('steam', { upstreamPressureBarA: v })} />
        <Cell label="Discharge coeff" value={inputs.steam.dischargeCoefficient} placeholder="required" onChange={(v) => setSection('steam', { dischargeCoefficient: v })} />
        <Cell label="Steam density" unit="kg/m3" value={inputs.steam.steamDensityKgM3} onChange={(v) => setSection('steam', { steamDensityKgM3: v })} />
        <Cell label="Steam cost" unit="/t" value={inputs.steam.steamCostPerTonne} onChange={(v) => setSection('steam', { steamCostPerTonne: v })} />
      </Group>

      <Group title="Condensate return"
        note="The treatment cost is the term routinely left out of these business cases, so it is asked for separately.">
        <Cell label="Steam flow" unit="t/h" value={inputs.steam.steamTonnesPerHour} onChange={(v) => setSection('steam', { steamTonnesPerHour: v })} />
        <Cell label="Boiler efficiency" unit="fraction" value={inputs.steam.boilerEfficiencyFraction} onChange={(v) => setSection('steam', { boilerEfficiencyFraction: v })} />
        <Cell label="Return now" unit="fraction" value={inputs.steam.currentReturnFraction} onChange={(v) => setSection('steam', { currentReturnFraction: v })} />
        <Cell label="Return target" unit="fraction" value={inputs.steam.targetReturnFraction} onChange={(v) => setSection('steam', { targetReturnFraction: v })} />
        <Cell label="Condensate" unit="C" value={inputs.steam.condensateTempC} onChange={(v) => setSection('steam', { condensateTempC: v })} />
        <Cell label="Makeup" unit="C" value={inputs.steam.makeupTempC} onChange={(v) => setSection('steam', { makeupTempC: v })} />
        <Cell label="Water cost" unit="/t" value={inputs.steam.waterCostPerTonne} onChange={(v) => setSection('steam', { waterCostPerTonne: v })} />
        <Cell label="Treatment cost" unit="/t" value={inputs.steam.treatmentCostPerTonne} placeholder="required" onChange={(v) => setSection('steam', { treatmentCostPerTonne: v })} />
      </Group>

      <Group title="The ledger"
        note="One fuel cost and one emission factor price every saving on the register, so the money and the carbon cannot disagree.">
        <Cell label="Fuel cost" unit="/GJ" value={inputs.ledger.fuelCostPerGJ} onChange={(v) => setSection('ledger', { fuelCostPerGJ: v })} />
        <Cell label="Emission factor" unit="kgCO2e/GJ" value={inputs.ledger.emissionFactorKgCo2ePerGJ} placeholder="required for carbon" onChange={(v) => setSection('ledger', { emissionFactorKgCo2ePerGJ: v })} />
      </Group>

      <Group title="Energy intensity"
        note="Your own energy per tonne. Not EII, which is proprietary; any peer figure is one you supplied.">
        {inputs.intensity.streams.map((s) => (
          <Cell key={s.id} label={s.label} unit="GJ/yr" value={s.energyGJ}
            onChange={(v) => setIntensityStream(s.id, { energyGJ: v })} />
        ))}
        <Cell label="Throughput" unit="t/yr" value={inputs.intensity.throughputTonnes} onChange={(v) => setSection('intensity', { throughputTonnes: v })} />
        <Cell label="Peer intensity" unit="MJ/t" value={inputs.intensity.peerIntensityMJPerTonne} placeholder="yours to supply" onChange={(v) => setSection('intensity', { peerIntensityMJPerTonne: v })} />
      </Group>

      <div>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-white">The stream table</h2>
          <Button size="sm" variant="outline" className="h-6 text-[11px] border-slate-700" onClick={addPinchStream}>
            <Plus className="w-3 h-3 mr-1" /> Stream
          </Button>
        </div>
        <div className="mb-2">
          <Cell label="Minimum approach" unit="C" value={inputs.pinch.minimumApproachC}
            onChange={(v) => setSection('pinch', { minimumApproachC: v })} />
        </div>
        {inputs.pinch.streams.map((s) => (
          <div key={s.id} className="rounded border border-slate-800 bg-slate-900/60 p-2 mb-2">
            <div className="flex items-center gap-1 mb-1.5">
              <Input value={s.label} aria-label={`Stream name ${s.label}`}
                onChange={(e) => setPinchStream(s.id, { label: e.target.value })}
                className="h-7 bg-slate-950 border-slate-700 text-xs" />
              <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-500 hover:text-red-400"
                aria-label={`Remove ${s.label}`} onClick={() => removePinchStream(s.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Cell label="Supply" unit="C" value={s.supplyC} onChange={(v) => setPinchStream(s.id, { supplyC: v })} />
              <Cell label="Target" unit="C" value={s.targetC} onChange={(v) => setPinchStream(s.id, { targetC: v })} />
              <Cell label="CP" unit="kW/K" value={s.cpKWperK} onChange={(v) => setPinchStream(s.id, { cpKWperK: v })} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EfficiencyInputs;
