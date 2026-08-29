// Vessel tab: inputs (left) and the sizing chain + L/D family (main).
import React from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSeparator } from '@/contexts/SeparatorStudioContext';
import { fmt, Stat, ErrorNote, WarnNote, Field, NumberInput, TextInput } from './fields';

export const VesselInputs = () => {
  const { inputs, setSection, internalsOptions } = useSeparator();
  const v = inputs.vessel;
  const threePhase = v.type === 'horizontal3';
  return (
    <div className="space-y-4">
      <Field label="Vessel type">
        <Select value={v.type} onValueChange={(val) => setSection('vessel', 'type', val)}>
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="horizontal2">Horizontal, two phase</SelectItem>
            <SelectItem value="horizontal3">Horizontal, three phase</SelectItem>
            <SelectItem value="vertical2">Vertical, two phase</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Mist extractor" hint="Sets the base K; the pressure derating is applied automatically.">
        <Select value={v.internalsId} onValueChange={(val) => setSection('vessel', 'internalsId', val)}>
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent>
            {internalsOptions.map((k) => (
              <SelectItem key={k.id} value={k.id}>{k.label} (K = {k.k})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="K override (ft/s)" hint="A vendor K wins over the correlation. Leave blank to use the derated value.">
        <NumberInput section="vessel" name="kOverride" step="0.01" />
      </Field>
      {v.type !== 'vertical2' && (
        <Field label="Liquid level (fraction of diameter)" hint="Half full is customary; the geometry is exact at whatever you set.">
          <NumberInput section="vessel" name="liquidLevelFrac" step="0.05" />
        </Field>
      )}
      {v.type === 'vertical2' && (
        <Field label="Height allowance (ft)" hint="Inlet device, disengagement space and mist extractor.">
          <NumberInput section="vessel" name="allowanceFt" step="0.5" />
        </Field>
      )}
      <Field label="Candidate diameters (ft)" hint="Comma separated; the studio sizes each and reports the family.">
        <TextInput section="vessel" name="diametersFt" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="L/D minimum"><NumberInput section="vessel" name="ldMin" step="0.5" /></Field>
        <Field label="L/D maximum"><NumberInput section="vessel" name="ldMax" step="0.5" /></Field>
      </div>

      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold pt-2">Process</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Gas (MMscfd)"><NumberInput section="process" name="qGasMMscfd" step="0.1" /></Field>
        <Field label="Pressure (psig)"><NumberInput section="process" name="pPsig" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Temperature (F)"><NumberInput section="process" name="tF" /></Field>
        <Field label="Gas gravity"><NumberInput section="process" name="gasSg" step="0.01" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Oil (bpd)"><NumberInput section="process" name="qOilBpd" /></Field>
        <Field label="Water (bpd)"><NumberInput section="process" name="qWaterBpd" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Oil gravity (API)"><NumberInput section="process" name="oilApi" step="0.1" /></Field>
        <Field label="Water SG"><NumberInput section="process" name="waterSg" step="0.01" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label={threePhase ? 'Oil retention (min)' : 'Liquid retention (min)'}>
          <NumberInput section="process" name="oilRetentionMin" step="0.5" />
        </Field>
        {threePhase && (
          <Field label="Water retention (min)"><NumberInput section="process" name="waterRetentionMin" step="0.5" /></Field>
        )}
      </div>
      {threePhase && (
        <div className="grid grid-cols-3 gap-2">
          <Field label="Oil visc (cp)"><NumberInput section="process" name="muOilCp" step="0.1" /></Field>
          <Field label="Water visc"><NumberInput section="process" name="muWaterCp" step="0.1" /></Field>
          <Field label="Droplet (um)"><NumberInput section="process" name="dropletMicron" /></Field>
        </div>
      )}
    </div>
  );
};

const ConditionsCard = () => {
  const { conditions } = useSeparator();
  if (conditions.error) return <ErrorNote>{conditions.error}</ErrorNote>;
  return (
    <Card className="bg-slate-900/60 border-slate-800">
      <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">At separator conditions</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="z-factor" value={fmt(conditions.z, 4)}
            hint="from the validated correlation, not assumed" />
          <Stat label="Gas density" value={fmt(conditions.rhoGas, 3)} unit="lb/ft3" />
          <Stat label="Liquid density" value={fmt(conditions.rhoLiquid, 2)} unit="lb/ft3"
            hint="oil and water at their production split" />
          <Stat label="Actual gas rate" value={fmt(conditions.qGasActFt3S, 2)} unit="ft3/s" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="K used" value={fmt(conditions.k, 3)} unit="ft/s"
            hint={conditions.kResult.source === 'typed'
              ? 'typed override'
              : `${conditions.kResult.kBase} base${conditions.kResult.derated ? ', derated for pressure' : ''}`} />
          <Stat label="Settling velocity" value={fmt(conditions.vTerminalFtS, 3)} unit="ft/s" />
        </div>
        {conditions.kResult?.warning && <WarnNote>{conditions.kResult.warning}</WarnNote>}
      </CardContent>
    </Card>
  );
};

const SweepTable = () => {
  const { sweep, inputs } = useSeparator();
  if (sweep.error) return <ErrorNote>{sweep.error}</ErrorNote>;
  const vertical = inputs.vessel.type === 'vertical2';
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
            <th className="py-2 pr-3">Diameter (ft)</th>
            <th className="py-2 pr-3">{vertical ? 'Height (ft)' : 'Length (ft)'}</th>
            <th className="py-2 pr-3">L/D</th>
            {!vertical && <th className="py-2 pr-3">Set by</th>}
            <th className="py-2">Verdict</th>
          </tr>
        </thead>
        <tbody>
          {sweep.rows.map((r) => (
            <tr key={r.diameterFt} className={`border-b border-slate-800/60 ${sweep.preferred?.diameterFt === r.diameterFt ? 'bg-emerald-900/20' : ''}`}>
              <td className="py-1.5 pr-3 tabular-nums text-slate-300">{fmt(r.diameterFt, 1)}</td>
              <td className="py-1.5 pr-3 tabular-nums">{r.error ? '--' : fmt(r.lengthFt, 1)}</td>
              <td className="py-1.5 pr-3 tabular-nums">{r.error ? '--' : fmt(r.ldRatio, 2)}</td>
              {!vertical && <td className="py-1.5 pr-3 text-slate-400">{r.controlling || '--'}</td>}
              <td className={`py-1.5 font-semibold ${r.inRange ? 'text-emerald-400' : 'text-amber-400'}`}>
                {r.error ? 'error' : (r.inRange
                  ? (sweep.preferred?.diameterFt === r.diameterFt ? 'PREFERRED' : 'in range')
                  : 'outside L/D')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-slate-600 mt-2">
        Slenderness between {fmt(sweep.ldMin, 1)} and {fmt(sweep.ldMax, 1)} is the customary band.
        A vessel outside it still separates; it is just an awkward thing to build, ship and support.
      </p>
    </div>
  );
};

const SelectedCard = () => {
  const { selected, detail, inputs } = useSeparator();
  if (selected.error) return <ErrorNote>{selected.error}</ErrorNote>;
  const threePhase = inputs.vessel.type === 'horizontal3';
  const vertical = inputs.vessel.type === 'vertical2';
  return (
    <Card className="bg-slate-900/60 border-slate-800">
      <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Selected vessel</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Diameter" value={fmt(selected.diameterFt, 1)} unit="ft" />
          <Stat label={vertical ? 'Height' : 'Length'} value={fmt(selected.lengthFt, 1)} unit="ft" />
          <Stat label="L/D" value={fmt(selected.ldRatio, 2)}
            accent={selected.inRange ? 'text-emerald-400' : 'text-amber-400'} />
          <Stat label="Gas velocity" value={fmt(detail.gasVelocityFtS, 3)} unit="ft/s"
            hint="in the vessel just sized" />
        </div>
        {!vertical && !threePhase && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Stat label="Length the gas needs" value={fmt(detail.lengthGasFt, 1)} unit="ft" />
            <Stat label="Length the liquid needs" value={fmt(detail.lengthLiquidFt, 1)} unit="ft" />
            <Stat label="Controlling" value={detail.controlling} />
          </div>
        )}
        {threePhase && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Oil retention needs" value={fmt(detail.lengthOilFt, 1)} unit="ft" />
              <Stat label="Water retention needs" value={fmt(detail.lengthWaterFt, 1)} unit="ft" />
              <Stat label="Gas needs" value={fmt(detail.lengthGasFt, 1)} unit="ft" />
              <Stat label="Controlling" value={detail.controlling} accent="text-emerald-400" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Interface" value={fmt(detail.waterShare * 100, 0)} unit="% water"
                hint="of the liquid cross-section" />
              <Stat label="Water drop fall time" value={fmt(detail.dropChecks?.waterDropFallS, 0)} unit="s"
                hint={`against ${fmt(detail.dropChecks?.residenceOilS, 0)} s of oil residence`}
                accent={detail.dropChecks?.waterCarryover ? 'text-red-400' : 'text-emerald-400'} />
              <Stat label="Oil drop rise time" value={fmt(detail.dropChecks?.oilDropRiseS, 0)} unit="s"
                hint={`against ${fmt(detail.dropChecks?.residenceWaterS, 0)} s of water residence`}
                accent={detail.dropChecks?.oilCarryunder ? 'text-red-400' : 'text-emerald-400'} />
            </div>
          </>
        )}
        {vertical && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Stat label="Liquid height" value={fmt(detail.hLiquidFt, 1)} unit="ft" />
            <Stat label="Diameter the gas needs" value={fmt(detail.diameterGasFt, 1)} unit="ft" />
            <Stat label="Velocity margin" value={fmt(detail.velocityMargin, 2)} unit="x"
              hint="settling velocity over actual" />
          </div>
        )}
        {detail?.warning && <WarnNote>{detail.warning}</WarnNote>}
      </CardContent>
    </Card>
  );
};

export const VesselResults = () => (
  <div className="space-y-4">
    <ConditionsCard />
    <SelectedCard />
    <Card className="bg-slate-900/60 border-slate-800">
      <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">The L/D family</CardTitle></CardHeader>
      <CardContent><SweepTable /></CardContent>
    </Card>
  </div>
);
