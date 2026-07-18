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
import { createCase } from '@/pages/apps/reservoir-balance/lib/api';

export const FLUID_SYSTEM_OPTIONS = [
  { value: 'oil', label: 'Oil reservoir', icon: Droplet, color: 'text-green-500' },
  { value: 'gas', label: 'Gas reservoir', icon: Wind, color: 'text-blue-500' },
  { value: 'oil_with_gas_cap', label: 'Oil with gas cap', icon: Layers, color: 'text-purple-500' },
];

export function fluidSystemDisplay(value) {
  return FLUID_SYSTEM_OPTIONS.find((o) => o.value === value) ?? {
    value,
    label: value,
    icon: Droplet,
    color: 'text-gray-500',
  };
}

const EMPTY_FORM = {
  name: '',
  field_name: '',
  reservoir_name: '',
  fluid_system: 'oil',
  initial_pressure_psia: '',
  reservoir_temperature_f: '',
  initial_water_saturation: '0.20',
  bubble_point_psia: '',
};

const NewCaseDialog = ({ open, onOpenChange, onCreated, prefill }) => {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  // Prefill from a well-test handoff (WT5): applied each time the dialog
  // opens with a prefill payload; the user edits freely afterwards.
  useEffect(() => {
    if (open && prefill) setForm((f) => ({ ...f, ...prefill }));
  }, [open, prefill]);

  const update = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e?.target?.value ?? e }));
  };

  const isValid =
    form.name.trim().length > 0 &&
    form.initial_pressure_psia !== '' &&
    !isNaN(parseFloat(form.initial_pressure_psia)) &&
    form.reservoir_temperature_f !== '' &&
    !isNaN(parseFloat(form.reservoir_temperature_f)) &&
    form.initial_water_saturation !== '' &&
    !isNaN(parseFloat(form.initial_water_saturation));

  const handleSubmit = async () => {
    if (!isValid) return;
    setSubmitting(true);

    const payload = {
      name: form.name.trim(),
      field_name: form.field_name.trim() || null,
      reservoir_name: form.reservoir_name.trim() || null,
      fluid_system: form.fluid_system,
      has_aquifer: false, // default; user toggles in the Aquifer tab
      has_gas_cap: form.fluid_system === 'oil_with_gas_cap',
      initial_pressure_psia: parseFloat(form.initial_pressure_psia),
      reservoir_temperature_f: parseFloat(form.reservoir_temperature_f),
      initial_water_saturation: parseFloat(form.initial_water_saturation),
      bubble_point_psia: form.bubble_point_psia
        ? parseFloat(form.bubble_point_psia)
        : null,
    };

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
          <DialogTitle>New Material Balance Case</DialogTitle>
          <DialogDescription>
            Define a new material balance study. You can edit any of these fields later inside the studio.
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

            <div>
              <Label htmlFor="pi">Initial pressure (psia) *</Label>
              <Input
                id="pi"
                type="number"
                placeholder="e.g. 4500"
                value={form.initial_pressure_psia}
                onChange={update('initial_pressure_psia')}
              />
            </div>
            <div>
              <Label htmlFor="temp">Temperature (°F) *</Label>
              <Input
                id="temp"
                type="number"
                placeholder="e.g. 180"
                value={form.reservoir_temperature_f}
                onChange={update('reservoir_temperature_f')}
              />
            </div>

            <div>
              <Label htmlFor="swi">Initial water saturation *</Label>
              <Input
                id="swi"
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={form.initial_water_saturation}
                onChange={update('initial_water_saturation')}
              />
            </div>
            <div>
              <Label htmlFor="pb">
                Bubble point (psia){' '}
                <span className="text-xs text-muted-foreground">
                  {form.fluid_system === 'gas' ? '(not applicable)' : '(optional)'}
                </span>
              </Label>
              <Input
                id="pb"
                type="number"
                placeholder="e.g. 3200"
                value={form.bubble_point_psia}
                onChange={update('bubble_point_psia')}
                disabled={form.fluid_system === 'gas'}
              />
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
            Create case
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewCaseDialog;
