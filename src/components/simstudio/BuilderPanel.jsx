// Model Builder tab (S3/S4): a guided form that generates a runnable
// Eclipse deck from Suite engine data — Fluid Studio correlation PVT,
// SCAL Corey curves (optional Leverett-J Pc), a layer-cake grid on a
// uniform or surface-sampled structure, vertical or survey-deviated
// wells, and a prediction schedule with an optional MBAL history phase.
// Generate = compose + attach to the case; the worker treats it exactly
// like an uploaded deck.
import React, { useState } from 'react';
import { Wand2, Plus, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSimStudio } from '@/contexts/SimStudioContext';
import { defaultBuilderForm, buildDeckFromForm } from '@/utils/simDeckBuilder';
import StructureCard from '@/components/simstudio/builder/StructureCard';
import HistoryCard from '@/components/simstudio/builder/HistoryCard';
import TrajectoryEditor from '@/components/simstudio/builder/TrajectoryEditor';

const Field = ({ label, value, onChange, className = '' }) => (
  <div className={`space-y-1 ${className}`}>
    <Label className="text-[11px] text-slate-400">{label}</Label>
    <Input value={value} onChange={(e) => onChange(e.target.value)}
      className="h-8 bg-slate-800 border-slate-700 text-xs" />
  </div>
);

const Section = ({ title, children, aside }) => (
  <Card className="bg-slate-900 border-slate-800">
    <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
      <CardTitle className="text-sm">{title}</CardTitle>
      {aside}
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
);

const BuilderPanel = () => {
  const { activeCase, busy, uploadGeneratedDeck, addNotification } = useSimStudio();
  const [form, setForm] = useState(defaultBuilderForm);
  const [errors, setErrors] = useState(null);

  const set = (path, value) => {
    setForm((prev) => {
      const next = structuredClone(prev);
      const keys = path.split('.');
      let obj = next;
      for (let i = 0; i < keys.length - 1; i += 1) obj = obj[keys[i]];
      obj[keys[keys.length - 1]] = value;
      return next;
    });
  };

  const nz = Math.max(1, Math.round(parseFloat(form.grid.nz) || 1));
  const cellCount = Math.round(parseFloat(form.grid.nx) || 0)
    * Math.round(parseFloat(form.grid.ny) || 0) * nz;

  // Keep the layers array in step with NZ.
  const layers = form.grid.layers.slice(0, nz);
  while (layers.length < nz) layers.push({ dz: '30', poro: '0.2', permx: '100', permz: '10' });

  const generate = async () => {
    setErrors(null);
    const out = buildDeckFromForm({ ...form, grid: { ...form.grid, layers } });
    if (!out.ok) {
      setErrors(out.errors);
      addNotification('Deck generation failed — fix the model inputs', 'error');
      return;
    }
    const name = `${(form.title || 'MODEL').replace(/[^A-Za-z0-9]/g, '_').toUpperCase().slice(0, 24) || 'MODEL'}.DATA`;
    const done = await uploadGeneratedDeck(out.deck, name);
    if (done) {
      const extras = [
        form.structure?.mode === 'surface' && 'structural tops',
        form.wells.some((w) => w.trajectory?.enabled) && 'deviated wells',
        form.history?.enabled && form.history?.periods && 'history phase',
      ].filter(Boolean);
      addNotification(
        `Model generated (Pb ${out.pb.toFixed(0)} psia, ${cellCount.toLocaleString()} cells${extras.length ? `, ${extras.join(' + ')}` : ''}) — see the Deck tab, then Run`,
        'success',
      );
    }
  };

  if (!activeCase) {
    return (
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="py-10 text-center text-sm text-slate-500">
          Create or open a case first — the generated deck attaches to it.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Section title="Model">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Title" value={form.title} onChange={(v) => set('title', v)} className="col-span-2" />
          <Field label="Start date (YYYY-MM-DD)" value={form.startDate} onChange={(v) => set('startDate', v)} />
          <Field label="Duration (years)" value={form.schedule.years} onChange={(v) => set('schedule.years', v)} />
        </div>
      </Section>

      <Section title={`Grid — ${cellCount.toLocaleString()} cells (limit 200,000)`}>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          <Field label="NX" value={form.grid.nx} onChange={(v) => set('grid.nx', v)} />
          <Field label="NY" value={form.grid.ny} onChange={(v) => set('grid.ny', v)} />
          <Field label="NZ (layers)" value={form.grid.nz} onChange={(v) => set('grid.nz', v)} />
          <Field label="DX (ft)" value={form.grid.dx} onChange={(v) => set('grid.dx', v)} />
          <Field label="DY (ft)" value={form.grid.dy} onChange={(v) => set('grid.dy', v)} />
          <Field label="Top depth (ft)" value={form.grid.topsDepth} onChange={(v) => set('grid.topsDepth', v)} />
        </div>
        <div className="mt-3 space-y-2">
          {layers.map((l, idx) => (
            <div key={idx} className="grid grid-cols-4 gap-3 items-end">
              <Field label={`Layer ${idx + 1} — DZ (ft)`} value={l.dz} onChange={(v) => set(`grid.layers.${idx}.dz`, v)} />
              <Field label="Porosity (frac)" value={l.poro} onChange={(v) => set(`grid.layers.${idx}.poro`, v)} />
              <Field label="Perm kh (mD)" value={l.permx} onChange={(v) => set(`grid.layers.${idx}.permx`, v)} />
              <Field label="Perm kv (mD)" value={l.permz} onChange={(v) => set(`grid.layers.${idx}.permz`, v)} />
            </div>
          ))}
        </div>
        {form.structure?.mode === 'surface' && (
          <p className="text-[11px] text-slate-500 mt-2">
            DX/DY and the top depth are taken from the sampled structure below while surface mode is on.
          </p>
        )}
      </Section>

      <StructureCard form={form} set={set} addNotification={addNotification} />

      <Section title="Fluid (black oil — correlations from Fluid Studio)">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Field label="Oil API" value={form.fluid.api} onChange={(v) => set('fluid.api', v)} />
          <Field label="Gas SG (air=1)" value={form.fluid.gasSg} onChange={(v) => set('fluid.gasSg', v)} />
          <Field label="Reservoir T (°F)" value={form.fluid.tempF} onChange={(v) => set('fluid.tempF', v)} />
          <Field label="Solution GOR (scf/STB)" value={form.fluid.gor} onChange={(v) => set('fluid.gor', v)} />
          <Field label="Salinity (ppm)" value={form.fluid.salinityPpm} onChange={(v) => set('fluid.salinityPpm', v)} />
        </div>
        <p className="text-[11px] text-slate-500 mt-2">
          PVTO/PVDG tables come from the Standing and Beggs-Robinson correlation set; the bubble point is solved from the GOR.
        </p>
      </Section>

      <Section title="Water and rock">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Field label="Bw (RB/STB)" value={form.water.bw} onChange={(v) => set('water.bw', v)} />
          <Field label="cw (1/psi)" value={form.water.cw} onChange={(v) => set('water.cw', v)} />
          <Field label="μw (cp)" value={form.water.muw} onChange={(v) => set('water.muw', v)} />
          <Field label="Water ρ (lb/ft³)" value={form.water.rhoLbFt3} onChange={(v) => set('water.rhoLbFt3', v)} />
          <Field label="Ref p (psia)" value={form.water.pref} onChange={(v) => { set('water.pref', v); set('rock.pref', v); }} />
          <Field label="Rock cr (1/psi)" value={form.rock.cr} onChange={(v) => set('rock.cr', v)} />
        </div>
      </Section>

      <Section
        title="Relative permeability (Corey — SCAL Studio model)"
        aside={(
          <label className="flex items-center gap-2 text-[11px] text-slate-400">
            <input type="checkbox" checked={form.scal.pc.enabled}
              onChange={(e) => set('scal.pc.enabled', e.target.checked)} />
            Leverett-J capillary pressure
          </label>
        )}
      >
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          <Field label="Swc" value={form.scal.ow.Swc} onChange={(v) => { set('scal.ow.Swc', v); }} />
          <Field label="Sor" value={form.scal.ow.Sor} onChange={(v) => set('scal.ow.Sor', v)} />
          <Field label="krw max" value={form.scal.ow.krwMax} onChange={(v) => set('scal.ow.krwMax', v)} />
          <Field label="kro max" value={form.scal.ow.kroMax} onChange={(v) => set('scal.ow.kroMax', v)} />
          <Field label="nw" value={form.scal.ow.nw} onChange={(v) => set('scal.ow.nw', v)} />
          <Field label="no" value={form.scal.ow.no} onChange={(v) => set('scal.ow.no', v)} />
          <Field label="Sgc" value={form.scal.go.Sgc} onChange={(v) => set('scal.go.Sgc', v)} />
          <Field label="Sorg" value={form.scal.go.Sorg} onChange={(v) => set('scal.go.Sorg', v)} />
          <Field label="krg max" value={form.scal.go.krgMax} onChange={(v) => set('scal.go.krgMax', v)} />
          <Field label="krog max" value={form.scal.go.krogMax} onChange={(v) => set('scal.go.krogMax', v)} />
          <Field label="ng" value={form.scal.go.ng} onChange={(v) => set('scal.go.ng', v)} />
          <Field label="nog" value={form.scal.go.nog} onChange={(v) => set('scal.go.nog', v)} />
        </div>
        {form.scal.pc.enabled && (
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mt-3 pt-3 border-t border-slate-800">
            <Field label="J: a" value={form.scal.pc.jA} onChange={(v) => set('scal.pc.jA', v)} />
            <Field label="J: b" value={form.scal.pc.jB} onChange={(v) => set('scal.pc.jB', v)} />
            <Field label="k (mD)" value={form.scal.pc.k_md} onChange={(v) => set('scal.pc.k_md', v)} />
            <Field label="φ (frac)" value={form.scal.pc.phi} onChange={(v) => set('scal.pc.phi', v)} />
            <Field label="σ (dyn/cm)" value={form.scal.pc.sigma_dyncm} onChange={(v) => set('scal.pc.sigma_dyncm', v)} />
            <Field label="θ (deg)" value={form.scal.pc.thetaDeg} onChange={(v) => set('scal.pc.thetaDeg', v)} />
          </div>
        )}
      </Section>

      <Section title="Equilibration">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Datum depth (ft)" value={form.equil.datumDepth} onChange={(v) => set('equil.datumDepth', v)} />
          <Field label="p @ datum (psia)" value={form.equil.datumPressure} onChange={(v) => set('equil.datumPressure', v)} />
          <Field label="OWC depth (ft)" value={form.equil.owc} onChange={(v) => set('equil.owc', v)} />
          <Field label="GOC depth (ft)" value={form.equil.goc} onChange={(v) => set('equil.goc', v)} />
        </div>
      </Section>

      <Section
        title="Wells (vertical I/J/K window, or deviated from a survey)"
        aside={(
          <Button size="sm" variant="ghost" className="h-6 text-xs text-slate-300"
            onClick={() => set('wells', [...form.wells, {
              name: `W${form.wells.length + 1}`, type: 'producer', i: '5', j: '5', k1: '1',
              k2: String(nz), refDepth: form.grid.topsDepth, mode: 'ORAT', rate: '2000', bhp: '1200',
              trajectory: null,
            }])}>
            <Plus className="w-3 h-3 mr-1" /> Add well
          </Button>
        )}
      >
        <div className="space-y-2">
          {form.wells.map((w, idx) => (
            <React.Fragment key={idx}>
              <div className="grid grid-cols-4 md:grid-cols-9 gap-2 items-end">
                <Field label="Name" value={w.name} onChange={(v) => set(`wells.${idx}.name`, v)} />
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-400">Type</Label>
                  <select value={w.type} onChange={(e) => set(`wells.${idx}.type`, e.target.value)}
                    className="w-full h-8 rounded-md bg-slate-800 border border-slate-700 px-1 text-xs">
                    <option value="producer">Producer</option>
                    <option value="water_injector">Water inj</option>
                    <option value="gas_injector">Gas inj</option>
                  </select>
                </div>
                {w.trajectory?.enabled ? (
                  <div className="col-span-2 md:col-span-4 text-[11px] text-slate-500 pb-2">
                    Completion from the survey below — cells are computed at generate time.
                  </div>
                ) : (
                  <>
                    <Field label="I" value={w.i} onChange={(v) => set(`wells.${idx}.i`, v)} />
                    <Field label="J" value={w.j} onChange={(v) => set(`wells.${idx}.j`, v)} />
                    <Field label="K1" value={w.k1} onChange={(v) => set(`wells.${idx}.k1`, v)} />
                    <Field label="K2" value={w.k2} onChange={(v) => set(`wells.${idx}.k2`, v)} />
                  </>
                )}
                <Field label={w.type === 'producer' ? 'Oil rate (STB/d)' : w.type === 'gas_injector' ? 'Gas rate (Mscf/d)' : 'Water rate (STB/d)'}
                  value={w.rate} onChange={(v) => set(`wells.${idx}.rate`, v)} />
                <Field label={w.type === 'producer' ? 'BHP min (psia)' : 'BHP max (psia)'}
                  value={w.bhp} onChange={(v) => set(`wells.${idx}.bhp`, v)} />
                <div className="flex items-end gap-1">
                  <label className="flex items-center gap-1 text-[11px] text-slate-400 h-8"
                    title="Complete this well along a deviated survey">
                    <input type="checkbox" checked={!!w.trajectory?.enabled}
                      data-testid={`well-deviated-${idx}`}
                      onChange={(e) => set(`wells.${idx}.trajectory`, e.target.checked
                        ? { enabled: true, text: w.trajectory?.text || '', mdUnit: w.trajectory?.mdUnit || 'ft', wellheadX: w.trajectory?.wellheadX ?? '', wellheadY: w.trajectory?.wellheadY ?? '', kbToDatum: w.trajectory?.kbToDatum ?? '0' }
                        : null)} />
                    Deviated
                  </label>
                  <Button size="sm" variant="ghost" className="h-8 text-red-400"
                    onClick={() => set('wells', form.wells.filter((_, k) => k !== idx))}
                    title="Remove well">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              {w.trajectory?.enabled && (
                <TrajectoryEditor form={{ ...form, grid: { ...form.grid, layers } }} wellIdx={idx} set={set} />
              )}
            </React.Fragment>
          ))}
        </div>
      </Section>

      <HistoryCard form={form} set={set} addNotification={addNotification} />

      {errors && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-amber-300 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="space-y-1">{errors.map((e, i) => <div key={i}>{e}</div>)}</div>
        </div>
      )}

      <div className="flex justify-end">
        <Button className="bg-lime-600 hover:bg-lime-700" disabled={busy} onClick={generate} data-testid="generate-deck">
          {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
          Generate deck
        </Button>
      </div>
    </div>
  );
};

export default BuilderPanel;
