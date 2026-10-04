// Model Builder tab (S3/S4; SIM-U1): a guided form that generates a runnable
// Eclipse deck from Suite data: PVT typed or taken from a Fluid Systems
// Studio project (pvt-1), Corey curves typed or taken from a SCAL Studio
// project (kr-1) with Leverett-J Pc, a layer-cake grid on a uniform or
// surface-sampled structure, vertical or survey-deviated wells with their
// depth reference, and a prediction schedule with an optional history.
// SIM-U1: the form is the case's (context), saved with it; every
// dimensional field shows the display unit and stores FIELD, the deck's
// units; Generate records the SHA-256 of the deck it made.
import React, { useState } from 'react';
import { Wand2, Plus, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSimStudio } from '@/contexts/SimStudioContext';
import { buildDeckFromForm } from '@/utils/simDeckBuilder';
import StructureCard from '@/components/simstudio/builder/StructureCard';
import HistoryCard from '@/components/simstudio/builder/HistoryCard';
import TrajectoryEditor from '@/components/simstudio/builder/TrajectoryEditor';
import Grid3DView from '@/components/simstudio/builder/Grid3DView';
import { FluidIntake, ScalIntake } from '@/components/simstudio/builder/IntakeCards';
import { IDENTIFICATION } from '@/utils/simstudio/reportModel';

/** A text field; with `kind` it shows the display unit and stores FIELD. */
const Field = ({ label, value, onChange, className = '', kind = null, u = null, disabled = false, ro = false, testId }) => {
  const shown = kind && u ? u.text(kind, value) : value;
  const [draft, setDraft] = useState(null);
  return (
    <div className={`space-y-1 ${className}`}>
      <Label className="text-[11px] text-pl-muted">{kind && u && u.label(kind) ? `${label} (${u.label(kind)})` : label}</Label>
      <Input
        value={draft ?? shown ?? ''}
        disabled={disabled || ro}
        inputMode="decimal"
        data-testid={testId}
        onChange={(e) => {
          const t = e.target.value;
          if (!kind || !u) { onChange(t); return; }
          const stored = u.toState(kind, t);
          if (stored === null) { setDraft(t); return; }   // "-" or "2." in SI: keep typing
          setDraft(u.system === 'si' ? t : null);
          onChange(stored);
        }}
        onBlur={() => setDraft(null)}
        className="h-8 text-xs"
      />
    </div>
  );
};

const Section = ({ title, children, aside }) => (
  <Card>
    <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
      <CardTitle className="text-sm">{title}</CardTitle>
      {aside}
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
);

const SAVE_WORDS = {
  idle: 'Not saved yet: the form is saved with the case as you edit.',
  saving: 'Saving the form with the case.',
  saved: 'Saved with the case.',
};

const BuilderPanel = () => {
  const {
    activeCase, busy, uploadGeneratedDeck, addNotification, form, setForm, formSave, u, system,
    canWrite, ownerOnlyReason,
  } = useSimStudio();
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
  const fluidLocked = form.pvtSource?.mode === 'fluid' || !canWrite;

  const generate = async () => {
    setErrors(null);
    const out = buildDeckFromForm({ ...form, grid: { ...form.grid, layers } });
    if (!out.ok) {
      setErrors(out.errors);
      addNotification('Deck generation failed. Fix the model inputs listed below.', 'error');
      return;
    }
    const name = `${(form.title || 'MODEL').replace(/[^A-Za-z0-9]/g, '_').toUpperCase().slice(0, 24) || 'MODEL'}.DATA`;
    const done = await uploadGeneratedDeck(out.deck, name);
    if (done) {
      const extras = [
        form.structure?.mode === 'surface' && 'structural tops',
        form.wells.some((w) => w.trajectory?.enabled) && 'deviated wells',
        form.history?.enabled && form.history?.periods && 'history phase',
        form.pvtSource?.mode === 'fluid' && 'PVT from Fluid Systems Studio',
        form.krSource?.mode === 'scal' && 'curves from SCAL Studio',
      ].filter(Boolean);
      addNotification(
        `Model generated (Pb ${Math.round(u.show('pressure', out.pb))} ${u.label('pressure')}, ${cellCount.toLocaleString()} cells${extras.length ? `, ${extras.join(', ')}` : ''}). Review it on the Deck tab, then run it from Runs.`,
        'success',
      );
    }
  };

  if (!activeCase) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-pl-muted">
          Create or open a case first: the generated deck attaches to it.
        </CardContent>
      </Card>
    );
  }

  const replacing = activeCase.deck_path && activeCase.deck_source !== 'generated';

  return (
    <div className="space-y-4" data-testid="sim-builder">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]" data-testid="sim-form-save" data-state={formSave.state}>
        <span className={formSave.state === 'error' ? 'text-pl-danger-text' : 'text-pl-muted'}>
          {formSave.state === 'error' ? formSave.error : SAVE_WORDS[formSave.state]}
          {formSave.state === 'saved' && formSave.where === 'file' ? ' (kept beside the deck until the builder_form column is added)' : ''}
        </span>
        <label className="flex items-center gap-2 text-pl-muted">
          Display units
          <select value={system} disabled={!canWrite} data-testid="sim-unit-system"
            onChange={(e) => set('unitSystem', e.target.value)}
            className="h-7 rounded-md border border-pl-border-strong bg-pl-surface px-2 text-xs text-pl-text">
            <option value="oilfield">Oilfield</option>
            <option value="si">SI</option>
          </select>
        </label>
      </div>
      <p className="text-[11px] text-pl-muted">
        The deck is written in FIELD units (ft, psia, STB, Mscf). The fields show the display units and convert what you type.
      </p>

      <Section title="Identification (printed on the report)">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {IDENTIFICATION.map(([key, label]) => (
            <Field u={u} ro={!canWrite} key={key} label={label} value={form.identification?.[key] ?? ''} onChange={(v) => set(`identification.${key}`, v)} />
          ))}
        </div>
      </Section>

      <Section title="Model">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field u={u} ro={!canWrite} label="Title" value={form.title} onChange={(v) => set('title', v)} className="col-span-2" />
          <Field u={u} ro={!canWrite} label="Start date (YYYY-MM-DD)" value={form.startDate} onChange={(v) => set('startDate', v)} />
          <Field u={u} ro={!canWrite} label="Duration (years)" value={form.schedule.years} onChange={(v) => set('schedule.years', v)} />
        </div>
      </Section>

      <Section title={`Grid: ${cellCount.toLocaleString()} cells (limit 200,000)`}>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          <Field u={u} ro={!canWrite} label="NX" value={form.grid.nx} onChange={(v) => set('grid.nx', v)} />
          <Field u={u} ro={!canWrite} label="NY" value={form.grid.ny} onChange={(v) => set('grid.ny', v)} />
          <Field u={u} ro={!canWrite} label="NZ (layers)" value={form.grid.nz} onChange={(v) => set('grid.nz', v)} />
          <Field u={u} ro={!canWrite} label="DX" kind="length" value={form.grid.dx} onChange={(v) => set('grid.dx', v)} />
          <Field u={u} ro={!canWrite} label="DY" kind="length" value={form.grid.dy} onChange={(v) => set('grid.dy', v)} />
          <Field u={u} ro={!canWrite} label="Top depth, TVDSS" kind="depth" value={form.grid.topsDepth} onChange={(v) => set('grid.topsDepth', v)} />
        </div>
        <div className="mt-3 space-y-2">
          {layers.map((l, idx) => (
            <div key={idx} className="grid grid-cols-4 gap-3 items-end">
              <Field u={u} ro={!canWrite} label={`Layer ${idx + 1} DZ`} kind="length" value={l.dz} onChange={(v) => set(`grid.layers.${idx}.dz`, v)} />
              <Field u={u} ro={!canWrite} label="Porosity (frac)" value={l.poro} onChange={(v) => set(`grid.layers.${idx}.poro`, v)} />
              <Field u={u} ro={!canWrite} label="Perm kh (mD)" value={l.permx} onChange={(v) => set(`grid.layers.${idx}.permx`, v)} />
              <Field u={u} ro={!canWrite} label="Perm kv (mD)" value={l.permz} onChange={(v) => set(`grid.layers.${idx}.permz`, v)} />
            </div>
          ))}
        </div>
        {form.structure?.mode === 'surface' && (
          <p className="text-[11px] text-pl-muted mt-2">
            DX/DY and the top depth are taken from the sampled structure below while surface mode is on.
          </p>
        )}
      </Section>

      <StructureCard form={form} set={set} addNotification={addNotification} />

      <Grid3DView form={{ ...form, grid: { ...form.grid, layers } }} />

      <Section title="Fluid (black oil)">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Field u={u} ro={!canWrite} label="Oil API" value={form.fluid.api} disabled={fluidLocked} onChange={(v) => set('fluid.api', v)} />
          <Field u={u} ro={!canWrite} label="Gas SG (air=1)" value={form.fluid.gasSg} disabled={fluidLocked} onChange={(v) => set('fluid.gasSg', v)} />
          <Field u={u} ro={!canWrite} label="Reservoir T" kind="temperature" value={form.fluid.tempF} disabled={fluidLocked} onChange={(v) => set('fluid.tempF', v)} />
          <Field u={u} ro={!canWrite} label="Solution GOR" kind="solutionGor" value={form.fluid.gor} disabled={fluidLocked} onChange={(v) => set('fluid.gor', v)} />
          <Field u={u} ro={!canWrite} label="Salinity (ppm)" value={form.fluid.salinityPpm} disabled={fluidLocked} onChange={(v) => set('fluid.salinityPpm', v)} />
        </div>
        <FluidIntake form={form} setForm={setForm} canWrite={canWrite} addNotification={addNotification} />
      </Section>

      <Section title="Water and rock">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Field u={u} ro={!canWrite} label="Bw" kind="bo" value={form.water.bw} disabled={fluidLocked} onChange={(v) => set('water.bw', v)} />
          <Field u={u} ro={!canWrite} label="cw" kind="compressibility" value={form.water.cw} disabled={fluidLocked} onChange={(v) => set('water.cw', v)} />
          <Field u={u} ro={!canWrite} label="Water viscosity" kind="viscosity" value={form.water.muw} disabled={fluidLocked} onChange={(v) => set('water.muw', v)} />
          <Field u={u} ro={!canWrite} label="Water density" kind="density" value={form.water.rhoLbFt3} onChange={(v) => set('water.rhoLbFt3', v)} />
          <Field u={u} ro={!canWrite} label="Ref p" kind="pressure" value={form.water.pref} disabled={fluidLocked} onChange={(v) => { set('water.pref', v); set('rock.pref', v); }} />
          <Field u={u} ro={!canWrite} label="Rock cr" kind="compressibility" value={form.rock.cr} onChange={(v) => set('rock.cr', v)} />
        </div>
      </Section>

      <Section
        title="Relative permeability (Corey) and capillary pressure"
        aside={(
          <label className="flex items-center gap-2 text-[11px] text-pl-muted">
            <input type="checkbox" checked={form.scal.pc.enabled} disabled={!canWrite}
              onChange={(e) => set('scal.pc.enabled', e.target.checked)} />
            Leverett-J capillary pressure
          </label>
        )}
      >
        <ScalIntake form={form} setForm={setForm} canWrite={canWrite} addNotification={addNotification} />
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          <Field u={u} ro={!canWrite} label="Swc" value={form.scal.ow.Swc} onChange={(v) => set('scal.ow.Swc', v)} />
          <Field u={u} ro={!canWrite} label="Sor" value={form.scal.ow.Sor} onChange={(v) => set('scal.ow.Sor', v)} />
          <Field u={u} ro={!canWrite} label="krw max" value={form.scal.ow.krwMax} onChange={(v) => set('scal.ow.krwMax', v)} />
          <Field u={u} ro={!canWrite} label="kro max" value={form.scal.ow.kroMax} onChange={(v) => set('scal.ow.kroMax', v)} />
          <Field u={u} ro={!canWrite} label="nw" value={form.scal.ow.nw} onChange={(v) => set('scal.ow.nw', v)} />
          <Field u={u} ro={!canWrite} label="no" value={form.scal.ow.no} onChange={(v) => set('scal.ow.no', v)} />
          <Field u={u} ro={!canWrite} label="Sgc" value={form.scal.go.Sgc} onChange={(v) => set('scal.go.Sgc', v)} />
          <Field u={u} ro={!canWrite} label="Sorg" value={form.scal.go.Sorg} onChange={(v) => set('scal.go.Sorg', v)} />
          <Field u={u} ro={!canWrite} label="krg max" value={form.scal.go.krgMax} onChange={(v) => set('scal.go.krgMax', v)} />
          <Field u={u} ro={!canWrite} label="krog max" value={form.scal.go.krogMax} onChange={(v) => set('scal.go.krogMax', v)} />
          <Field u={u} ro={!canWrite} label="ng" value={form.scal.go.ng} onChange={(v) => set('scal.go.ng', v)} />
          <Field u={u} ro={!canWrite} label="nog" value={form.scal.go.nog} onChange={(v) => set('scal.go.nog', v)} />
        </div>
        {form.scal.pc.enabled && (
          <div className="grid grid-cols-3 md:grid-cols-7 gap-3 mt-3 pt-3 border-t border-pl-border">
            <Field u={u} ro={!canWrite} label="J: a" value={form.scal.pc.jA} onChange={(v) => set('scal.pc.jA', v)} />
            <Field u={u} ro={!canWrite} label="J: b" value={form.scal.pc.jB} onChange={(v) => set('scal.pc.jB', v)} />
            <Field u={u} ro={!canWrite} label="J: Swirr (blank = Swc)" value={form.scal.pc.swirr ?? ''} onChange={(v) => set('scal.pc.swirr', v)} />
            <Field u={u} ro={!canWrite} label="k (mD)" value={form.scal.pc.k_md} onChange={(v) => set('scal.pc.k_md', v)} />
            <Field u={u} ro={!canWrite} label="porosity (frac)" value={form.scal.pc.phi} onChange={(v) => set('scal.pc.phi', v)} />
            <Field u={u} ro={!canWrite} label="IFT (dyn/cm)" value={form.scal.pc.sigma_dyncm} onChange={(v) => set('scal.pc.sigma_dyncm', v)} />
            <Field u={u} ro={!canWrite} label="Contact angle (deg)" value={form.scal.pc.thetaDeg} onChange={(v) => set('scal.pc.thetaDeg', v)} />
          </div>
        )}
      </Section>

      <Section title="Equilibration">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field u={u} ro={!canWrite} label="Datum depth, TVDSS" kind="depth" value={form.equil.datumDepth} onChange={(v) => set('equil.datumDepth', v)} />
          <Field u={u} ro={!canWrite} label="Pressure at datum" kind="pressure" value={form.equil.datumPressure} onChange={(v) => set('equil.datumPressure', v)} />
          <Field u={u} ro={!canWrite} label="OWC, TVDSS (blank: none)" kind="depth" value={form.equil.owc} onChange={(v) => set('equil.owc', v)} />
          <Field u={u} ro={!canWrite} label="GOC, TVDSS (blank: none)" kind="depth" value={form.equil.goc} onChange={(v) => set('equil.goc', v)} />
        </div>
        <p className="text-[11px] text-pl-muted mt-2">
          Deck depths are true vertical depth below the datum (TVDSS, positive down); pressures are absolute. A blank contact
          is placed outside the grid (no water leg, no gas cap) and the report says so.
        </p>
      </Section>

      <Section
        title="Wells (vertical I/J/K window, or deviated from a survey)"
        aside={canWrite ? (
          <Button size="sm" variant="ghost" className="h-6 text-xs text-pl-text"
            onClick={() => set('wells', [...form.wells, {
              name: `W${form.wells.length + 1}`, type: 'producer', i: '5', j: '5', k1: '1',
              k2: String(nz), refDepth: form.grid.topsDepth, mode: 'ORAT', rate: '2000', bhp: '1200',
              trajectory: null,
            }])}>
            <Plus className="w-3 h-3 mr-1" /> Add well
          </Button>
        ) : null}
      >
        <div className="space-y-2">
          {form.wells.map((w, idx) => (
            <React.Fragment key={idx}>
              <div className="grid grid-cols-4 md:grid-cols-9 gap-2 items-end">
                <Field u={u} ro={!canWrite} label="Name" value={w.name} onChange={(v) => set(`wells.${idx}.name`, v)} />
                <div className="space-y-1">
                  <Label className="text-[11px] text-pl-muted">Type</Label>
                  <select value={w.type} disabled={!canWrite} onChange={(e) => set(`wells.${idx}.type`, e.target.value)}
                    className="w-full h-8 rounded-md border border-pl-border-strong bg-pl-surface px-1 text-xs text-pl-text">
                    <option value="producer">Producer</option>
                    <option value="water_injector">Water inj</option>
                    <option value="gas_injector">Gas inj</option>
                  </select>
                </div>
                {w.trajectory?.enabled ? (
                  <div className="col-span-2 md:col-span-4 text-[11px] text-pl-muted pb-2">
                    Completion from the survey below; cells are computed at generate time.
                  </div>
                ) : (
                  <>
                    <Field u={u} ro={!canWrite} label="I" value={w.i} onChange={(v) => set(`wells.${idx}.i`, v)} />
                    <Field u={u} ro={!canWrite} label="J" value={w.j} onChange={(v) => set(`wells.${idx}.j`, v)} />
                    <Field u={u} ro={!canWrite} label="K1" value={w.k1} onChange={(v) => set(`wells.${idx}.k1`, v)} />
                    <Field u={u} ro={!canWrite} label="K2" value={w.k2} onChange={(v) => set(`wells.${idx}.k2`, v)} />
                  </>
                )}
                <Field u={u} ro={!canWrite} label={w.type === 'producer' ? 'Oil rate' : w.type === 'gas_injector' ? 'Gas rate' : 'Water rate'}
                  kind={w.type === 'producer' ? 'oilRate' : w.type === 'gas_injector' ? 'gasRate' : 'waterRate'}
                  value={w.rate} onChange={(v) => set(`wells.${idx}.rate`, v)} />
                <Field u={u} ro={!canWrite} label={w.type === 'producer' ? 'BHP min' : 'BHP max'} kind="pressure"
                  value={w.bhp} onChange={(v) => set(`wells.${idx}.bhp`, v)} />
                <div className="flex items-end gap-1">
                  <label className="flex items-center gap-1 text-[11px] text-pl-muted h-8"
                    title="Complete this well along a deviated survey">
                    <input type="checkbox" checked={!!w.trajectory?.enabled} disabled={!canWrite}
                      data-testid={`well-deviated-${idx}`}
                      onChange={(e) => set(`wells.${idx}.trajectory`, e.target.checked
                        ? {
                          enabled: true, text: w.trajectory?.text || '', mdUnit: w.trajectory?.mdUnit || 'ft',
                          wellheadX: w.trajectory?.wellheadX ?? '', wellheadY: w.trajectory?.wellheadY ?? '',
                          refKind: w.trajectory?.refKind || 'KB', refElevFt: w.trajectory?.refElevFt ?? '0',
                          datumSource: w.trajectory?.datumSource || 'entered', wellId: w.trajectory?.wellId || null, wellName: w.trajectory?.wellName || '',
                        }
                        : null)} />
                    Deviated
                  </label>
                  {canWrite && (
                    <Button size="sm" variant="ghost" className="h-8 text-pl-danger-text"
                      onClick={() => set('wells', form.wells.filter((_, k) => k !== idx))}
                      title="Remove well">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              {w.trajectory?.enabled && (
                <TrajectoryEditor form={{ ...form, grid: { ...form.grid, layers } }} wellIdx={idx} set={set} u={u} />
              )}
            </React.Fragment>
          ))}
        </div>
      </Section>

      <HistoryCard form={form} set={set} addNotification={addNotification} />

      {errors && (
        <div className="flex items-start gap-2 rounded-lg border border-pl-warning/40 bg-pl-warning-bg px-3 py-2.5 text-pl-warning-text text-xs" data-testid="sim-builder-errors">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="space-y-1">{errors.map((e, i) => <div key={i}>{e}</div>)}</div>
        </div>
      )}

      {replacing && (
        <p className="text-[11px] text-pl-warning-text" data-testid="sim-generate-replaces">
          Generate replaces this case&apos;s deck ({activeCase.deck_path.split('/').pop()}, {activeCase.deck_source === 'template' ? 'a template' : 'uploaded'}) as the deck that runs.
          Its files stay in the case&apos;s storage; past runs keep their results.
        </p>
      )}
      {ownerOnlyReason && <p className="text-[11px] text-pl-warning-text">{ownerOnlyReason}</p>}

      <div className="flex justify-end">
        <Button disabled={busy || !!ownerOnlyReason} onClick={generate} data-testid="generate-deck">
          {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
          Generate deck
        </Button>
      </div>
    </div>
  );
};

export default BuilderPanel;
