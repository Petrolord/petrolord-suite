// Pigging tab: liquids management as arithmetic you can check. The
// holdup can come straight from the Multiphase tab's Beggs & Brill
// answer, because a pigging estimate is only as honest as the holdup
// it is fed.
import React from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLineSizing } from '@/contexts/LineSizingContext';
import { fmt, Stat, ErrorNote, Field, NumberInput } from './fields';

const PiggingInputs = () => {
  const { inputs, setSection } = useLineSizing();
  return (
    <div className="space-y-4">
      <Field label="Holdup source">
        <Select value={inputs.pigging.holdupSource} onValueChange={(v) => setSection('pigging', 'holdupSource', v)}>
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="multiphase">Beggs &amp; Brill (Multiphase tab)</SelectItem>
            <SelectItem value="manual">Type a holdup fraction</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {inputs.pigging.holdupSource === 'manual' && (
        <Field label="Liquid holdup (fraction)"><NumberInput section="pigging" name="holdupFrac" step="0.01" /></Field>
      )}
      <Field label="Pig speed (ft/s)" hint="Typically 3 to 15 ft/s for a cleaning pig; excursions outside that damage cups or leave liquid behind.">
        <NumberInput section="pigging" name="pigSpeedFtS" step="0.1" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Slug catcher limit (bbl)"><NumberInput section="pigging" name="maxSlugBbl" /></Field>
        <Field label="Liquid dropout (bpd)"><NumberInput section="pigging" name="dropoutBpd" /></Field>
      </div>
    </div>
  );
};

const PiggingPanel = () => {
  const { pigging } = useLineSizing();
  return (
    <Card className="bg-slate-900/60 border-slate-800">
      <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Pigging estimates</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {pigging.error ? <ErrorNote>{pigging.error}</ErrorNote> : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Line volume" value={fmt(pigging.lineVolumeBbl, 0)} unit="bbl" />
              <Stat label="Holdup used" value={fmt(pigging.holdupFrac, 3)} hint={pigging.holdupNote} />
              <Stat label="Swept liquid" value={fmt(pigging.sweptBbl, 0)} unit="bbl"
                hint="what arrives ahead of the pig" />
              <Stat label="Run time" value={fmt(pigging.runHours, 1)} unit="hours" />
            </div>
            {pigging.intervalError
              ? <ErrorNote>{pigging.intervalError}</ErrorNote>
              : (
                <Stat label="Pigging interval" value={fmt(pigging.intervalDays, 1)} unit="days"
                  hint="the accumulation between runs plus the sweep stays inside the catcher" />
              )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export { PiggingInputs };
export default PiggingPanel;
