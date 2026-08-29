// Dehydration tab: inputs (left rail) and results (main).
import React from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useGasProcessing } from '@/contexts/GasProcessingContext';
import { fmt, Stat, ErrorNote, WarnNote, Field, NumberInput } from './fields';

export const DehydrationInputs = () => {
  const { inputs, setSection } = useGasProcessing();
  const t = inputs.teg;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Gas rate (MMscfd)"><NumberInput section="teg" name="gasMMscfd" step="0.1" /></Field>
        <Field label="Pressure (psia)"><NumberInput section="teg" name="pPsia" /></Field>
      </div>
      <Field label="Gas temperature (F)"><NumberInput section="teg" name="tF" /></Field>
      <Field label="Inlet water content">
        <Select value={t.inletMode} onValueChange={(v) => setSection('teg', 'inletMode', v)}>
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="saturated">Water saturated at line conditions</SelectItem>
            <SelectItem value="typed">Type it (lb/MMscf)</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {t.inletMode === 'typed' && (
        <Field label="Inlet water (lb/MMscf)"><NumberInput section="teg" name="inletLbMMscf" step="0.1" /></Field>
      )}
      <Field label="Outlet spec (lb/MMscf)" hint="Pipeline custom is 7; cryogenic feeds want far less.">
        <NumberInput section="teg" name="outletLbMMscf" step="0.1" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Circulation (gal TEG per lb H2O)" hint="Customary 2 to 5.">
          <NumberInput section="teg" name="circulationGalPerLb" step="0.1" />
        </Field>
        <Field label="Lean TEG (wt %)"><NumberInput section="teg" name="leanTegWtPct" step="0.1" /></Field>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Absorber T (F)"><NumberInput section="teg" name="absorberTF" /></Field>
        <Field label="Reboiler T (F)"><NumberInput section="teg" name="reboilerTF" /></Field>
        <Field label="Reflux ratio"><NumberInput section="teg" name="refluxRatio" step="0.05" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Theoretical stages"><NumberInput section="teg" name="stages" step="0.5" /></Field>
        <Field label="Absorption factor A" hint="L over V K at lean conditions; from equilibrium data.">
          <NumberInput section="teg" name="absorptionFactor" step="0.1" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="BTEX inlet (ppmv)"><NumberInput section="teg" name="btexInletPpmv" /></Field>
        <Field label="BTEX absorbed fraction" hint="Operating value, customary 0.1 to 0.2.">
          <NumberInput section="teg" name="btexAbsorbedFrac" step="0.01" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Gas gravity"><NumberInput section="teg" name="gasSg" step="0.01" /></Field>
        <Field label="Contactor K (ft/s)" hint="0.3 customary for structured packing; trays lower.">
          <NumberInput section="teg" name="ksFtS" step="0.01" />
        </Field>
      </div>
    </div>
  );
};

export const DehydrationResults = () => {
  const { dehydration: d } = useGasProcessing();
  if (d.error) return <ErrorNote>{d.error}</ErrorNote>;
  return (
    <div className="space-y-4">
      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Water balance</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Inlet water" value={fmt(d.inletLbMMscf, 1)} unit="lb/MMscf"
              hint={d.saturated && !d.saturated.error ? 'saturated at line conditions (ideal VLE)' : 'typed'} />
            <Stat label="Water removed" value={fmt(d.waterLbDay, 0)} unit="lb/day" />
            <Stat label="TEG circulation" value={fmt(d.circGpm, 1)} unit="gpm" />
            <Stat label="Reboiler duty" value={fmt(d.reboilerMMBtuHr, 2)} unit="MMBtu/hr"
              hint={`${fmt(d.sensiblePerGal, 0)} sensible + ${fmt(d.vaporPerGal, 0)} overhead Btu/gal`} />
          </div>
          {d.saturated?.warning && <WarnNote>{d.saturated.warning}</WarnNote>}
          {d.warning && <WarnNote>{d.warning}</WarnNote>}
        </CardContent>
      </Card>

      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Absorber</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Removal the spec demands" value={fmt(d.removalNeeded * 100, 1)} unit="%" />
            <Stat label="Stages the spec demands"
              value={d.stagesNeeded?.error ? 'unreachable' : fmt(d.stagesNeeded.stages, 1)}
              accent={d.stagesNeeded?.error ? 'text-red-400' : 'text-slate-100'}
              hint={d.stagesNeeded?.error || 'Kremser at the stated absorption factor'} />
            <Stat label="Removal at the stated stages" value={fmt(d.fractionAtStages * 100, 1)} unit="%" />
            <Stat label="Contactor diameter"
              value={d.contactor?.error ? '--' : fmt(d.contactor.diameterFt, 1)} unit="ft"
              hint={d.contactor?.error || `Souders-Brown at z = ${fmt(d.contactor?.z, 3)}`} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Stat label="BTEX absorbed" value={fmt(d.btexTonsYear, 1)} unit="tons/yr"
              hint="still overheads; an emissions question" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
