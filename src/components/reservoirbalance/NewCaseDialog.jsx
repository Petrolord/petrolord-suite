// New-case dialog for the Material Balance Studio (extracted verbatim from
// the pre-MB3 ReservoirBalance.jsx case-list page). Case creation needs more
// than a name (fluid system + initial conditions), so the studio's project
// manager delegates here via onRequestCreate.
import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Droplet, Wind, Layers } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { createCase, updateCase, upsertCaseDefaultConfig } from '@/pages/apps/reservoir-balance/lib/api';
import { useMaterialBalanceStudio } from '@/contexts/MaterialBalanceStudioContext';
import { emptyStudy, withStudy, DEFAULT_CORRELATIONS } from '@/pages/apps/reservoir-balance/lib/studyMeta';
import UnitField from './UnitField';

export const FLUID_SYSTEM_OPTIONS = [
  { value: 'oil', label: 'Oil reservoir', icon: Droplet, color: 'text-pl-primary-text' },
  { value: 'gas', label: 'Gas reservoir', icon: Wind, color: 'text-pl-primary-text' },
  { value: 'oil_with_gas_cap', label: 'Oil with gas cap', icon: Layers, color: 'text-pl-primary-text' },
];

export function fluidSystemDisplay(value) {
  return FLUID_SYSTEM_OPTIONS.find((o) => o.value === value) ?? {
    value,
    label: value,
    icon: Droplet,
    color: 'text-pl-muted',
  };
}

const EMPTY_FORM = {
  name: '',
  field_name: '',
  reservoir_name: '',
  fluid_system: 'oil',
  initial_pressure_psia: '',
  reservoir_temperature_f: '',
  initial_water_saturation: '',
  bubble_point_psia: '',
  volumetric_estimate: '',
  volumetric_estimate_source: '',
};

// the form holds engine units as text; a field hands back a number or null
const numText = (v) => (v == null ? '' : String(v));
const numOf = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));

// editCase (Material Balance T1): the same form edits an existing case's
// name and initial conditions; they had no editor once created (the
// "Overview tab" the studio pointed to no longer exists).
const NewCaseDialog = ({ open, onOpenChange, onCreated, prefill, handoffs = null, editCase = null, onSaved }) => {
  const { toast } = useToast();
  const { units } = useMaterialBalanceStudio();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  // Prefill from a well-test handoff (WT5): applied each time the dialog
  // opens with a prefill payload; the user edits freely afterwards.
  useEffect(() => {
    if (open && prefill) setForm((f) => ({ ...f, ...prefill }));
  }, [open, prefill]);
  useEffect(() => {
    if (open && editCase) {
      const str = (v) => (v == null ? '' : String(v));
      setForm({
        name: editCase.name || '', field_name: editCase.field_name || '', reservoir_name: editCase.reservoir_name || '',
        fluid_system: editCase.fluid_system || 'oil', initial_pressure_psia: str(editCase.initial_pressure_psia),
        reservoir_temperature_f: str(editCase.reservoir_temperature_f), initial_water_saturation: str(editCase.initial_water_saturation),
        bubble_point_psia: str(editCase.bubble_point_psia),
        volumetric_estimate: str(editCase.fluid_system === 'gas' ? editCase.volumetric_ogip_scf : editCase.volumetric_ooip_stb),
        volumetric_estimate_source: editCase.volumetric_estimate_source || '',
      });
    }
  }, [open, editCase]);

  const update = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e?.target?.value ?? e }));
  };

  const swi = numOf(form.initial_water_saturation);
  const swiError = form.initial_water_saturation !== '' && !(swi >= 0 && swi < 1) ? 'A fraction from 0 to below 1.' : null;
  const isGasForm = form.fluid_system === 'gas';
  const isValid =
    form.name.trim().length > 0 &&
    numOf(form.initial_pressure_psia) > 0 &&
    numOf(form.reservoir_temperature_f) != null &&
    swi != null && !swiError;

  const handleSubmit = async () => {
    if (!isValid) return;
    setSubmitting(true);

    const payload = {
      name: form.name.trim(),
      field_name: form.field_name.trim() || null,
      reservoir_name: form.reservoir_name.trim() || null,
      fluid_system: form.fluid_system,
      ...(editCase ? {} : { has_aquifer: false }), // default; user toggles in the Aquifer tab
      has_gas_cap: form.fluid_system === 'oil_with_gas_cap',
      initial_pressure_psia: numOf(form.initial_pressure_psia),
      reservoir_temperature_f: numOf(form.reservoir_temperature_f),
      initial_water_saturation: swi,
      bubble_point_psia: isGasForm ? null : numOf(form.bubble_point_psia),
      // the volumetric estimate is printed beside the material balance in the report
      volumetric_ooip_stb: isGasForm ? null : numOf(form.volumetric_estimate),
      volumetric_ogip_scf: isGasForm ? numOf(form.volumetric_estimate) : null,
      volumetric_estimate_source: form.volumetric_estimate_source.trim() || null,
    };

    if (editCase) {
      const { data, error } = await updateCase(editCase.id, payload);
      setSubmitting(false);
      if (error) {
        toast({ title: 'Failed to save the case', description: error.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Case saved', description: 'A change of the fluid system or the initial conditions needs a new run. A new name does not.' });
      onOpenChange(false);
      onSaved?.(data);
      return;
    }

    const { data, error } = await createCase(payload);
    setSubmitting(false);

    if (error) {
      toast({
        title: 'Failed to create case',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    // a value that came from another app is recorded with the case (RL11)
    if (handoffs && Object.keys(handoffs).length) {
      await upsertCaseDefaultConfig(data.id, { pvt_correlations: withStudy({ ...DEFAULT_CORRELATIONS }, { ...emptyStudy(), handoffs }) });
    }

    toast({
      title: 'Case created',
      description: `"${data.name}" is ready to receive production data.`,
    });
    onOpenChange(false);
    setForm(EMPTY_FORM);
    onCreated?.(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editCase ? 'Edit case' : 'New Material Balance Case'}</DialogTitle>
          <DialogDescription>
            {editCase
              ? 'Change the name, the identification and the initial conditions. A change of an initial condition needs a new run.'
              : 'Define a new material balance study. You can edit any of these fields later from the case card (Edit case).'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label htmlFor="name">Case name *</Label>
              <Input
                id="name"
                placeholder="e.g. Egbema-12 C2.0 Sand"
                value={form.name}
                onChange={update('name')}
              />
            </div>

            <div>
              <Label htmlFor="field">Field</Label>
              <Input
                id="field"
                placeholder="e.g. Egbema West"
                value={form.field_name}
                onChange={update('field_name')}
              />
            </div>
            <div>
              <Label htmlFor="reservoir">Reservoir</Label>
              <Input
                id="reservoir"
                placeholder="e.g. C2.0 Sand"
                value={form.reservoir_name}
                onChange={update('reservoir_name')}
              />
            </div>

            <div className="col-span-2">
              <Label>Fluid system *</Label>
              <Select
                value={form.fluid_system}
                onValueChange={(v) => setForm((f) => ({ ...f, fluid_system: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FLUID_SYSTEM_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <UnitField id="pi" testId="mbal-case-pi" label="Initial pressure" quantity="pressure" units={units} required
              value={numOf(form.initial_pressure_psia)} onCommit={(v) => setForm((f) => ({ ...f, initial_pressure_psia: numText(v) }))}
              placeholder={units.unit('pressure') === 'psi' ? 'e.g. 4500' : undefined}
              hint="Absolute pressure. The first data row must hold the same pressure." />
            <UnitField id="temp" testId="mbal-case-temp" label="Reservoir temperature" quantity="temperature" units={units} required
              value={numOf(form.reservoir_temperature_f)} onCommit={(v) => setForm((f) => ({ ...f, reservoir_temperature_f: numText(v) }))}
              placeholder={units.unit('temperature') === 'degF' ? 'e.g. 180' : undefined} />

            <UnitField id="swi" testId="mbal-case-swi" label="Initial water saturation" unitText="fraction" required
              value={numOf(form.initial_water_saturation)} onCommit={(v) => setForm((f) => ({ ...f, initial_water_saturation: numText(v) }))}
              placeholder="e.g. 0.20" error={swiError} />
            <UnitField id="pb" testId="mbal-case-pb" label={isGasForm ? 'Bubble point (does not apply to gas)' : 'Bubble point (optional)'} quantity="pressure" units={units}
              value={isGasForm ? null : numOf(form.bubble_point_psia)} onCommit={(v) => setForm((f) => ({ ...f, bubble_point_psia: numText(v) }))}
              disabled={isGasForm} placeholder={isGasForm ? '' : 'blank: the initial pressure'} />

            <UnitField id="vol" testId="mbal-case-volumetric" label={isGasForm ? 'Volumetric gas in place (optional)' : 'Volumetric oil in place (optional)'}
              quantity={isGasForm ? 'gasVolumeB' : 'stockVolumeMM'} units={units}
              value={numOf(form.volumetric_estimate)} onCommit={(v) => setForm((f) => ({ ...f, volumetric_estimate: numText(v) }))}
              hint="Printed in the report beside the material balance value. It does not enter the calculation." />
            <div className="space-y-1.5">
              <Label htmlFor="volsrc" className="text-xs text-pl-text">Source of the volumetric estimate</Label>
              <Input id="volsrc" className="h-9" placeholder="e.g. ReservoirCalc Pro, 2026 map" value={form.volumetric_estimate_source}
                onChange={update('volumetric_estimate_source')} data-testid="mbal-case-volumetric-source" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editCase ? 'Save case' : 'Create case'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewCaseDialog;
