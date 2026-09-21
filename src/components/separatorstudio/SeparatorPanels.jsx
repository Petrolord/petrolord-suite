// Vessel tab: inputs (left) and the sizing chain + L/D family (main).
import React from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSeparator } from '@/contexts/SeparatorStudioContext';
import { SWEEP_REASON_TEXT } from '@/contexts/SeparatorStudioContext';
import { fmt, Stat, ErrorNote, WarnNote, Field, NumberInput, TextInput, ExampleCaseNote } from './fields';

/** The length requirement that set the vessel, in words (FC1-0 names). */
const CONTROLLING_TEXT = {
  gas: 'gas',
  liquid: 'liquid retention',
  'liquid-retention': 'liquid retention',
};
const controllingText = (c) => CONTROLLING_TEXT[c] || c || '--';

export const VesselInputs = () => {
  const { inputs, setSection, internalsOptions, ldBand } = useSeparator();
  const v = inputs.vessel;
  const threePhase = v.type === 'horizontal3';
  return (
    <div className="space-y-4">
      <ExampleCaseNote />
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
      <p className="text-[11px] text-slate-600 -mt-2">
        Customary band for {v.type === 'vertical2' ? 'vertical' : 'horizontal'} vessels: {ldBand.min} to {ldBand.max}.
      </p>

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
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Oil visc (cp)"><NumberInput section="process" name="muOilCp" step="0.1" /></Field>
            <Field label="Water visc"><NumberInput section="process" name="muWaterCp" step="0.1" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Water droplet in oil (um)" hint="The water drops to remove from the oil; 500 micron is customary.">
              <NumberInput section="process" name="waterDropletMicron" />
            </Field>
            <Field label="Oil droplet in water (um)" hint="The oil drops to remove from the water; 200 micron is customary.">
              <NumberInput section="process" name="oilDropletMicron" />
            </Field>
          </div>
        </>
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Ppr" value={fmt(conditions.ppr, 3)} hint="pseudo-reduced pressure behind the z-factor" />
          <Stat label="Tpr" value={fmt(conditions.tpr, 3)} hint="pseudo-reduced temperature behind the z-factor" />
        </div>
        {conditions.kResult?.warning && <WarnNote>{conditions.kResult.warning}</WarnNote>}
        {conditions.gasNote && <WarnNote>{conditions.gasNote}</WarnNote>}
      </CardContent>
    </Card>
  );
};

/**
 * What one L/D family row is (FC1-0, engines #188). A row that cannot carry
 * the gas, or whose droplet checks fail, is not feasible and can never be
 * preferred, whatever its slenderness, so the table says which it is.
 */
export const verdictOf = (row, preferred) => {
  if (row.error) return 'error';
  if (preferred && preferred.diameterFt === row.diameterFt) return 'PREFERRED';
  if (!row.feasible) {
    return (row.reasons || [])
      .filter((r) => r !== 'ld-out-of-band')
      .map((r) => SWEEP_REASON_TEXT[r] || r)
      .join(', ') || 'not feasible';
  }
  return row.inRange ? 'in range' : 'outside L/D';
};

const verdictColour = (row, preferred) => {
  if (row.error) return 'text-red-400';
  if (preferred && preferred.diameterFt === row.diameterFt) return 'text-emerald-400';
  if (!row.feasible) return 'text-red-400';
  return row.inRange ? 'text-emerald-400' : 'text-amber-400';
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
              {!vertical && <td className="py-1.5 pr-3 text-slate-400">{r.error ? '--' : controllingText(r.controlling)}</td>}
              <td className={`py-1.5 font-semibold ${verdictColour(r, sweep.preferred)}`}>
                {verdictOf(r, sweep.preferred)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-slate-600 mt-2">
        Band used: slenderness between {fmt(sweep.ldMin, 1)} and {fmt(sweep.ldMax, 1)}. The customary
        band is 3 to 5 for horizontal separators and 2 to 4 for vertical ones.
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
            <Stat label="Controlling" value={controllingText(detail.controlling)} />
          </div>
        )}
        {threePhase && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Liquid retention needs" value={fmt(detail.liquidRetentionLengthFt, 1)} unit="ft"
                hint="oil and water share the length at the proportional interface" />
              <Stat label="Gas needs" value={fmt(detail.lengthGasFt, 1)} unit="ft" />
              <Stat label="Controlling" value={controllingText(detail.controlling)} accent="text-emerald-400" />
              <Stat label="Interface" value={fmt(detail.waterShare * 100, 0)} unit="% water"
                hint="of the liquid cross-section" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Interface height" value={fmt(detail.interfaceHeightFt, 2)} unit="ft"
                hint="above the vessel bottom, from the exact segment area" />
              <Stat label="Water layer" value={fmt(detail.waterLayerFt, 2)} unit="ft" />
              <Stat label="Oil layer" value={fmt(detail.oilLayerFt, 2)} unit="ft" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Water drop fall time" value={fmt(detail.dropChecks?.waterDropFallS, 0)} unit="s"
                hint={`a ${fmt(detail.dropChecks?.waterDropletMicron, 0)} micron drop, against ${fmt(detail.dropChecks?.residenceOilS, 0)} s of oil residence in the sized vessel`}
                accent={detail.dropChecks?.waterCarryover ? 'text-red-400' : 'text-emerald-400'} />
              <Stat label="Oil drop rise time" value={fmt(detail.dropChecks?.oilDropRiseS, 0)} unit="s"
                hint={`a ${fmt(detail.dropChecks?.oilDropletMicron, 0)} micron drop, against ${fmt(detail.dropChecks?.residenceWaterS, 0)} s of water residence in the sized vessel`}
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
        {(detail?.warnings?.length ? detail.warnings : (detail?.warning ? [detail.warning] : []))
          .map((w) => <WarnNote key={w}>{w}</WarnNote>)}
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
