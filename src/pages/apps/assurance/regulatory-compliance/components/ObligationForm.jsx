import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Info } from 'lucide-react';
import {
  DEFAULT_LEAD_TIME_DAYS,
  FREQUENCIES,
  LIFECYCLES,
  OBLIGATION_TYPES,
  REGIMES,
  explainStatus,
} from '@/lib/complianceStatus';
import { validateObligation } from '../utils/obligationPayload';
import { StatusBadge } from './SharedComponents';

const EMPTY = {
  title: '',
  description: '',
  authority_id: '',
  facility: '',
  regime: '',
  obligation_type: '',
  jurisdiction: '',
  reference: '',
  frequency: 'Annual',
  lifecycle: 'Active',
  due_date: '',
  effective_date: '',
  expiry_date: '',
  lead_time_days: DEFAULT_LEAD_TIME_DAYS,
  consequence: '',
  notes: '',
};

const Select = ({ id, value, onChange, options, placeholder, ...rest }) => (
  <select
    id={id}
    value={value ?? ''}
    onChange={onChange}
    className="flex h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--warning))]"
    {...rest}
  >
    <option value="">{placeholder}</option>
    {options.map((o) => (
      <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
    ))}
  </select>
);

const FieldError = ({ children }) => (
  children ? (
    <p className="text-xs text-[hsl(var(--destructive))] mt-1 flex items-center gap-1">
      <AlertTriangle className="w-3 h-3" /> {children}
    </p>
  ) : null
);

/**
 * AS3 — the form the app never had.
 *
 * `NewCompliance.jsx` rendered "New compliance creation form will be
 * implemented here" inside a dashed box, and the Add Obligation button
 * in the app header navigated to it. The service beneath had a working
 * addRecord() that no UI ever called. So the register could be read and
 * could not be filled, by anyone, ever.
 *
 * The live preview at the bottom is not decoration. Status is derived
 * rather than typed now, so a user who cannot see what their dates add
 * up to would be choosing a lifecycle and hoping. It shows the status
 * the obligation will have the moment it is saved, and why.
 */
export const ObligationForm = ({
  initial,
  authorities = [],
  hasAs3Schema = true,
  onSubmit,
  onCancel,
  submitLabel = 'Save obligation',
}) => {
  const [form, setForm] = useState({ ...EMPTY, ...(initial || {}) });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState(null);

  const set = (field) => (e) => {
    const value = e?.target ? e.target.value : e;
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  };

  const preview = useMemo(() => explainStatus(form, new Date()), [form]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFailure(null);
    const found = validateObligation(form);
    if (Object.keys(found).length) {
      setErrors(found);
      return;
    }
    setSaving(true);
    const result = await onSubmit(form);
    setSaving(false);
    // A failed save says why, on the form, where the user can fix it.
    if (result && result.success === false) setFailure(result.error);
  };

  const authorityOptions = authorities.map((a) => ({
    value: a.id,
    label: a.acronym ? `${a.acronym} · ${a.name}` : a.name,
  }));

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-6 max-w-5xl mx-auto pb-24">
      {failure ? (
        <div className="p-4 rounded-lg border border-[hsl(var(--destructive))]/30 bg-[hsl(var(--destructive))]/5 text-sm">
          <p className="font-medium text-[hsl(var(--foreground))]">The obligation was not saved</p>
          <p className="text-[hsl(var(--muted-foreground))] mt-1">{failure}</p>
        </div>
      ) : null}

      <Card className="panel-elevation">
        <CardHeader><CardTitle>What the obligation is</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="md:col-span-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={form.title} onChange={set('title')}
              placeholder="Annual produced water discharge return" />
            <FieldError>{errors.title}</FieldError>
          </div>
          {/* AS3-only column. Before migration 20260917100000 the text was
              collected and then dropped by buildObligationWrite without a
              word, so the field is only offered where it can be saved
              (AS13). */}
          {hasAs3Schema ? (
            <div className="md:col-span-2">
              <Label htmlFor="description">What it requires</Label>
              <Textarea id="description" rows={3} value={form.description || ''} onChange={set('description')}
                placeholder="The obligation in the operator's own words, so the next person to hold it does not have to read the permit." />
            </div>
          ) : null}
          <div>
            <Label htmlFor="authority_id">Regulator</Label>
            <Select id="authority_id" value={form.authority_id} onChange={set('authority_id')}
              options={authorityOptions}
              placeholder={authorities.length ? 'Select a regulator' : 'No regulators in the directory yet'} />
            {authorities.length === 0 ? (
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                Add one on the Directory tab first if you want to attribute this obligation.
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="facility">Facility or asset</Label>
            <Input id="facility" value={form.facility || ''} onChange={set('facility')}
              placeholder="Bonga FPSO" />
          </div>
          {hasAs3Schema ? (
            <>
              <div>
                <Label htmlFor="regime">Regime</Label>
                <Select id="regime" value={form.regime} onChange={set('regime')}
                  options={REGIMES} placeholder="Select a regime" />
              </div>
              <div>
                <Label htmlFor="obligation_type">Type</Label>
                <Select id="obligation_type" value={form.obligation_type} onChange={set('obligation_type')}
                  options={OBLIGATION_TYPES} placeholder="Select a type" />
              </div>
              <div>
                <Label htmlFor="jurisdiction">Jurisdiction</Label>
                <Input id="jurisdiction" value={form.jurisdiction || ''} onChange={set('jurisdiction')}
                  placeholder="Federal, Nigeria" />
              </div>
              <div>
                <Label htmlFor="reference">Permit or licence number</Label>
                <Input id="reference" value={form.reference || ''} onChange={set('reference')}
                  placeholder="The reference you would quote to the regulator" />
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card className="panel-elevation">
        <CardHeader><CardTitle>When it falls due</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <Label htmlFor="due_date">Next due date</Label>
            <Input id="due_date" type="date" value={form.due_date || ''} onChange={set('due_date')} />
            <FieldError>{errors.due_date}</FieldError>
          </div>
          {hasAs3Schema ? (
            <>
              <div>
                <Label htmlFor="expiry_date">Permit or licence expires</Label>
                <Input id="expiry_date" type="date" value={form.expiry_date || ''} onChange={set('expiry_date')} />
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                  Not the same date as the next return. A permit can lapse
                  while every report against it is up to date.
                </p>
                <FieldError>{errors.expiry_date}</FieldError>
              </div>
              <div>
                <Label htmlFor="effective_date">In force from</Label>
                <Input id="effective_date" type="date" value={form.effective_date || ''} onChange={set('effective_date')} />
              </div>
              <div>
                <Label htmlFor="frequency">How often</Label>
                <Select id="frequency" value={form.frequency} onChange={set('frequency')}
                  options={FREQUENCIES} placeholder="Select a frequency" />
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                  Used to roll the due date forward when you record a filing.
                </p>
              </div>
              <div>
                <Label htmlFor="lead_time_days">Warn this many days ahead</Label>
                <Input id="lead_time_days" type="number" min={0} max={1095}
                  value={form.lead_time_days ?? ''} onChange={set('lead_time_days')} />
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                  A 90 day permit renewal and a 7 day incident notification
                  are not the same warning.
                </p>
              </div>
              <div>
                <Label htmlFor="lifecycle">Lifecycle</Label>
                <Select id="lifecycle" value={form.lifecycle} onChange={set('lifecycle')}
                  options={LIFECYCLES} placeholder="Select" />
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                  The status is worked out from the dates; this is the part
                  you choose.
                </p>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      {hasAs3Schema ? (
        <Card className="panel-elevation">
          <CardHeader><CardTitle>If it is missed</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-5">
            <div>
              <Label htmlFor="consequence">Consequence of breach</Label>
              <Textarea id="consequence" rows={2} value={form.consequence || ''} onChange={set('consequence')}
                placeholder="Penalty, shut-in, licence condition. What actually happens." />
            </div>
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={2} value={form.notes || ''} onChange={set('notes')} />
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="panel-elevation">
        <CardContent className="p-5 flex flex-wrap items-center gap-4">
          <Info className="w-5 h-5 text-[hsl(var(--muted-foreground))] shrink-0" />
          <div className="flex items-center gap-3">
            <span className="text-sm text-[hsl(var(--muted-foreground))]">Saved now, this reads</span>
            <StatusBadge obligation={form} />
          </div>
          <span className="text-sm text-[hsl(var(--muted-foreground))]">{preview.reason}</span>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}
          className="bg-[hsl(var(--background))] border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]">
          Cancel
        </Button>
        <Button type="submit" disabled={saving}
          className="bg-[hsl(var(--warning))] text-white hover:bg-[hsl(var(--warning))]/90 border-0">
          {saving ? 'Saving...' : submitLabel}
        </Button>
      </div>
    </form>
  );
};

export default ObligationForm;
