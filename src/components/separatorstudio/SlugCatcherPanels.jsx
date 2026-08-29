// Slug Catcher tab.
import React from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSeparator } from '@/contexts/SeparatorStudioContext';
import { fmt, Stat, ErrorNote, WarnNote, Field, NumberInput } from './fields';

export const SlugInputs = () => {
  const { inputs, setSection } = useSeparator();
  const s = inputs.slug;
  return (
    <div className="space-y-4">
      <Field label="Catcher type">
        <Select value={s.mode} onValueChange={(v) => setSection('slug', 'mode', v)}>
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="vessel">Vessel type</SelectItem>
            <SelectItem value="finger">Finger (harp) type</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Slug volume (bbl)" hint="The Pipeline & Line Sizing Studio's pigging tab computes this from the line and its holdup.">
        <NumberInput section="slug" name="slugBbl" />
      </Field>
      {s.mode === 'vessel' ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Normal liquid (bpd)"><NumberInput section="slug" name="qLiquidBpd" /></Field>
            <Field label="Normal hold (min)"><NumberInput section="slug" name="holdMin" step="0.5" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Fill fraction" hint="Freeboard for the gas; 0.6 to 0.7 customary.">
              <NumberInput section="slug" name="fillFraction" step="0.05" />
            </Field>
            <Field label="L/D ratio"><NumberInput section="slug" name="ldRatio" step="0.5" /></Field>
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Finger bore (in)"><NumberInput section="slug" name="fingerIdIn" step="1" /></Field>
            <Field label="Number of fingers"><NumberInput section="slug" name="nFingers" step="1" /></Field>
          </div>
          <Field label="Fill fraction"><NumberInput section="slug" name="fingerFill" step="0.05" /></Field>
          <p className="text-[11px] text-slate-600">
            Pipe is cheaper than vessel per unit volume and needs no vessel code stamp, which is why
            large slugs are caught in a harp of parallel fingers rather than one enormous drum.
          </p>
        </>
      )}
    </div>
  );
};

export const SlugResults = () => {
  const { slug, inputs } = useSeparator();
  if (slug.error) return <ErrorNote>{slug.error}</ErrorNote>;
  const finger = inputs.slug.mode === 'finger';
  return (
    <Card className="bg-slate-900/60 border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-slate-300">
          {finger ? 'Finger slug catcher' : 'Vessel slug catcher'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {finger ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Volume needed" value={fmt(slug.totalVolumeFt3, 0)} unit="ft3"
              hint="the slug at the stated fill fraction" />
            <Stat label="Length per finger" value={fmt(slug.fingerLengthFt, 0)} unit="ft" />
            <Stat label="Total pipe" value={fmt(slug.totalPipeFt, 0)} unit="ft" />
            <Stat label="Area per finger" value={fmt(slug.areaPerFingerFt2, 2)} unit="ft2" />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Normal inventory" value={fmt(slug.normalBbl, 0)} unit="bbl" />
            <Stat label="Working volume" value={fmt(slug.workingBbl, 0)} unit="bbl"
              hint="slug plus normal level" />
            <Stat label="Diameter" value={fmt(slug.diameterFt, 1)} unit="ft" />
            <Stat label="Length" value={fmt(slug.lengthFt, 1)} unit="ft"
              hint={`L/D ${fmt(slug.ldRatio, 1)}`} />
          </div>
        )}
        {slug.warning && <WarnNote>{slug.warning}</WarnNote>}
      </CardContent>
    </Card>
  );
};
