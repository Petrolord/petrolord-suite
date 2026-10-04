// Left-rail inputs for the Displacement tab: rel-perm source (Corey or
// tabular), fluids, dip/gravity, polymer screening.
import React, { useState } from 'react';
import KrIntakeCard from '@/lib/inputProvenance/KrIntakeCard';
import { SCAL_INTAKE_FIELDS } from '@/components/waterflooddesign/scalKrIntake';
import { readScalProjectKr } from '@/lib/krSource';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Beaker, RotateCcw, Table2 } from 'lucide-react';
import { useWaterfloodDesign, DEFAULT_DISPLACEMENT } from '@/contexts/WaterfloodDesignContext';
import { validateKrTable } from '@/utils/fractionalFlowCalculations';
import { sampleFractionalFlowData } from '@/utils/fractionalFlowCalculations';
import { Field, UField, SectionLabel } from './primitives';

const COREY_FIELDS = [
  { k: 'Swc', label: 'Swc, connate water' },
  { k: 'Sor', label: 'Sor, residual oil' },
  { k: 'krwMax', label: 'krw @ Sor (endpoint)' },
  { k: 'kroMax', label: 'kro @ Swc (endpoint)' },
  { k: 'nw', label: 'nw, water exponent' },
  { k: 'no', label: 'no, oil exponent' },
];
const FLUID_FIELDS = [
  { k: 'muW', label: 'μw, water viscosity', kind: 'viscosity' },
  { k: 'muO', label: 'μo, oil viscosity', kind: 'viscosity' },
];
const GRAVITY_FIELDS = [
  { k: 'k_md', label: 'k, permeability', kind: 'permeability' },
  { k: 'A_ft2', label: 'A, flow area', kind: 'flowArea' },
  { k: 'qt_rbd', label: 'qt, total rate', kind: 'resRate' },
  { k: 'dipDeg', label: 'Dip α (updip +)', kind: 'angle' },
  { k: 'gammaW', label: 'γw, water SG', kind: 'gravity' },
  { k: 'gammaO', label: 'γo, oil SG', kind: 'gravity' },
];

const KrTableDialog = ({ onApply }) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState(null);

  const apply = () => {
    const rows = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !/^sw\b/i.test(line))
      .map((line) => {
        const parts = line.split(/[\s,;\t]+/).map(parseFloat);
        return { Sw: parts[0], krw: parts[1], kro: parts[2] };
      });
    const res = validateKrTable(rows);
    if (!res.ok) {
      setError(res.errors[0]);
      return;
    }
    onApply(res.table);
    setError(null);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          <Table2 className="w-4 h-4 mr-2" /> Paste kr table
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tabular relative permeability</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-pl-muted">
          One row per saturation: Sw, krw, kro (comma, space or tab separated). A header row starting with "Sw" is ignored.
          krw must start at 0 and kro must end at 0.
        </p>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder={'Sw, krw, kro\n0.20, 0.000, 1.000\n0.40, 0.045, 0.440\n0.60, 0.180, 0.110\n0.80, 0.400, 0.000'}
          className="font-pl-mono tabular-nums text-xs"
        />
        {error && <div className="text-xs text-pl-danger-text">{error}</div>}
        <DialogFooter>
          <Button onClick={apply}>Apply table</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const DisplacementPanel = () => {
  const { displacementInputs: d, setDisplacementField, setDisplacementInputs, addNotification, u } = useWaterfloodDesign();

  const loadSample = () => {
    const s = sampleFractionalFlowData();
    setDisplacementInputs({
      ...DEFAULT_DISPLACEMENT,
      Swc: String(s.params.Swc), Sor: String(s.params.Sor),
      krwMax: String(s.params.krwMax), kroMax: String(s.params.kroMax),
      nw: String(s.params.nw), no: String(s.params.no),
      muW: String(s.muW), muO: String(s.muO),
    });
    addNotification('Sample displacement case loaded', 'info');
  };

  return (
    <div className="space-y-6">
      <section>
        <SectionLabel>Relative permeability</SectionLabel>
        <Tabs value={d.krSource} onValueChange={(v) => setDisplacementField('krSource', v)}>
          <TabsList className="h-8 p-0.5 w-full">
            <TabsTrigger value="corey" className="h-7 text-xs flex-1">Corey</TabsTrigger>
            <TabsTrigger value="table" className="h-7 text-xs flex-1">Tabular</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="mt-3 space-y-3">
          {d.krIntake && (
            <KrIntakeCard intake={d.krIntake} current={d} fields={SCAL_INTAKE_FIELDS} readLatest={readScalProjectKr} />
          )}
          {d.krSource === 'corey' ? (
            <div className="grid grid-cols-2 gap-3">
              {COREY_FIELDS.map((f) => (
                <Field key={f.k} label={f.label} value={d[f.k]} onChange={(v) => setDisplacementField(f.k, v)} />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <KrTableDialog onApply={(table) => setDisplacementField('krTable', table)} />
              <div className="text-xs text-pl-muted">
                {d.krTable?.length
                  ? `${d.krTable.length} rows, Sw ${d.krTable[0].Sw} to ${d.krTable[d.krTable.length - 1].Sw}`
                  : 'No table loaded yet.'}
              </div>
            </div>
          )}
        </div>
      </section>

      <section>
        <SectionLabel>Fluids</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          {FLUID_FIELDS.map((f) => (
            <UField key={f.k} label={f.label} kind={f.kind} u={u} testId={`wds-${f.k}`} value={d[f.k]} onChange={(v) => setDisplacementField(f.k, v)} />
          ))}
        </div>

      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <SectionLabel>Dip / gravity term</SectionLabel>
          <Switch checked={d.gravityOn} onCheckedChange={(v) => setDisplacementField('gravityOn', v)} />
        </div>
        {d.gravityOn && (
          <div className="grid grid-cols-2 gap-3">
            {GRAVITY_FIELDS.map((f) => (
              <UField key={f.k} label={f.label} kind={f.kind} u={u} value={d[f.k]} onChange={(v) => setDisplacementField(f.k, v)} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <SectionLabel>Polymer screening</SectionLabel>
          <Switch checked={d.polymerOn} onCheckedChange={(v) => setDisplacementField('polymerOn', v)} />
        </div>
        {d.polymerOn && (
          <div className="space-y-2">
            <Field label="μw multiplier (viscosified water)" value={d.polymerMuMult} onChange={(v) => setDisplacementField('polymerMuMult', v)} />
            <Label className="text-[11px] text-pl-muted leading-snug block">
              Screening only: shifts fw via water viscosity. No adsorption, permeability reduction or rheology.
            </Label>
          </div>
        )}
      </section>

      <section className="flex gap-2">
        <Button variant="outline" size="sm" onClick={loadSample} className="flex-1">
          <Beaker className="w-4 h-4 mr-1" /> Sample
        </Button>
        <Button variant="outline" size="sm" onClick={() => setDisplacementInputs(DEFAULT_DISPLACEMENT)} className="flex-1">
          <RotateCcw className="w-4 h-4 mr-1" /> Reset
        </Button>
      </section>
    </div>
  );
};

export default DisplacementPanel;
