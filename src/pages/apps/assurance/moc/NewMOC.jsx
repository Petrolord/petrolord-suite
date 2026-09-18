import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MOCPageShell, BASE } from './components/MOCPageShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, Plus, Save, Send, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  CATEGORIES,
  CHANGE_TYPES,
  IMPACT_AREAS,
  IMPACT_SEVERITIES,
  PRIORITIES,
  RISK_LEVELS,
} from '@/lib/managementOfChange';
import { ErrorState, Loading, SchemaNotice } from './components/SharedComponents';
import { useManagementOfChange } from './hooks/useManagementOfChange';
import { validateMoc } from './utils/mocPayload';

const EMPTY = {
  title: '',
  type: '',
  category: '',
  asset_id: '',
  department: '',
  priority: 'Medium',
  risk_level: '',
  target_implementation_date: '',
  expiry_date: '',
  current_situation: '',
  description: '',
  justification: '',
};

const Select = ({ id, value, onChange, options, placeholder }) => (
  <select id={id} value={value ?? ''} onChange={onChange}
    className="flex h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm">
    <option value="">{placeholder}</option>
    {options.map((o) => <option key={o} value={o}>{o}</option>)}
  </select>
);

const FieldError = ({ children }) => (children ? (
  <p className="text-xs text-[hsl(var(--destructive))] mt-1">{children}</p>
) : null);

/**
 * AS6 — raise a change request, and actually keep it.
 *
 * The page this replaces had NO STATE. Not one input carried a `value`
 * or an `onChange`, and there was no `useState` for any field. The
 * submit handler ran `setTimeout(800)`, toasted "Record MOC-2026-090
 * has been created successfully" with the number written into the
 * string, and navigated to that URL. A user could fill in the current
 * situation, the proposed change, the justification and the target
 * date, and none of it was read out of the DOM, let alone saved.
 *
 * The impact assessment is on this page rather than buried later,
 * because deciding what a change affects is how its risk level gets
 * chosen. (AS13: the risk level does not set or require approval
 * gates. Nothing reads it for that; gates are added by hand.)
 */
export default function NewMOC() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { loading, error, hasAs6Schema, createMoc, refresh } = useManagementOfChange();

  const [form, setForm] = useState(EMPTY);
  const [impacts, setImpacts] = useState([{ impact_area: '', severity: 'Low', description: '', mitigation: '' }]);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState(null);

  const set = (field) => (e) => {
    const value = e?.target ? e.target.value : e;
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((p) => (p[field] ? { ...p, [field]: undefined } : p));
  };

  const setImpact = (i, field) => (e) => {
    const value = e.target.value;
    setImpacts((rows) => rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  };

  const temporary = ['Temporary', 'Emergency'].includes(form.type);

  const handleSubmit = async (submitForScreening) => {
    setFailure(null);
    const stage = submitForScreening ? 'Screening' : 'Draft';
    const found = validateMoc({ ...form, stage });
    if (Object.keys(found).length) { setErrors(found); return; }

    setSaving(true);
    const result = await createMoc({ ...form, stage }, {
      impacts: impacts.filter((i) => String(i.impact_area || '').trim()),
    });
    setSaving(false);

    if (!result.success) { setFailure(result.error); return; }
    toast({
      title: result.warning ? 'Raised, with a caveat' : 'Change raised',
      description: result.warning
        || `${result.data.moc_code} ${submitForScreening ? 'submitted for screening' : 'saved as a draft'}.`,
      variant: result.warning ? 'destructive' : undefined,
    });
    navigate(`${BASE}/${result.data.id}`);
  };

  if (loading) return <MOCPageShell><Loading /></MOCPageShell>;
  if (error) return <MOCPageShell><ErrorState error={error} onRetry={refresh} /></MOCPageShell>;

  return (
    <MOCPageShell title="Initiate Change Request" description="Raise a Management of Change record">
      <div className="max-w-4xl mx-auto w-full pb-20 md:pb-8 space-y-6 animate-in fade-in duration-300">
        {!hasAs6Schema ? <SchemaNotice /> : null}

        {failure ? (
          <div className="p-4 rounded-lg border border-[hsl(var(--destructive))]/30 bg-[hsl(var(--destructive))]/5 text-sm">
            <p className="font-medium">The change was not raised</p>
            <p className="text-[hsl(var(--muted-foreground))] mt-1">{failure}</p>
          </div>
        ) : null}

        <Card className="panel-elevation">
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4 bg-[hsl(var(--secondary))]/30">
            <CardTitle className="text-lg">1. Basic information</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title">Change title</Label>
              <Input id="title" value={form.title} onChange={set('title')}
                placeholder="Upgrade compressor C-101" />
              <FieldError>{errors.title}</FieldError>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="type">Change type</Label>
                <Select id="type" value={form.type} onChange={set('type')}
                  options={CHANGE_TYPES} placeholder="Select a type" />
                <FieldError>{errors.type}</FieldError>
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select id="category" value={form.category} onChange={set('category')}
                  options={CATEGORIES} placeholder="Select a category" />
                <FieldError>{errors.category}</FieldError>
              </div>
              <div className="space-y-2">
                <Label htmlFor="asset_id">Facility or asset</Label>
                <Input id="asset_id" value={form.asset_id} onChange={set('asset_id')}
                  placeholder="Platform Alpha, compressor C-101" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="department">Department</Label>
                <Input id="department" value={form.department} onChange={set('department')}
                  placeholder="Operations" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Select id="priority" value={form.priority} onChange={set('priority')}
                  options={PRIORITIES} placeholder="Select" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="risk_level">Risk level</Label>
                <Select id="risk_level" value={form.risk_level} onChange={set('risk_level')}
                  options={RISK_LEVELS} placeholder="Assess after the impacts below" />
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Recorded for reporting and for whoever sets the approval
                  gates. The app does not add or require gates from it: gates
                  are added by hand on the change&apos;s page. Set it after the
                  impacts below.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="panel-elevation">
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4 bg-[hsl(var(--secondary))]/30">
            <CardTitle className="text-lg">2. Description and justification</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            {hasAs6Schema ? (
              <div className="space-y-2">
                <Label htmlFor="current_situation">Current situation</Label>
                <Textarea id="current_situation" className="min-h-[90px]"
                  value={form.current_situation} onChange={set('current_situation')}
                  placeholder="The state of things before the proposed change." />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="description">Proposed change</Label>
              <Textarea id="description" className="min-h-[110px]"
                value={form.description} onChange={set('description')}
                placeholder="Exactly what will be changed, in enough detail that a reviewer can assess it." />
              <FieldError>{errors.description}</FieldError>
            </div>
            <div className="space-y-2">
              <Label htmlFor="justification">Justification</Label>
              <Textarea id="justification" className="min-h-[80px]"
                value={form.justification} onChange={set('justification')}
                placeholder="Why this change is necessary: safety, integrity, optimisation, regulatory." />
            </div>
          </CardContent>
        </Card>

        <Card className="panel-elevation">
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4 bg-[hsl(var(--secondary))]/30">
            <CardTitle className="text-lg">3. Dates</CardTitle>
          </CardHeader>
          <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="target_implementation_date">Target implementation</Label>
              <Input id="target_implementation_date" type="date"
                value={form.target_implementation_date}
                onChange={set('target_implementation_date')} />
            </div>
            {temporary ? (
              <div className="space-y-2">
                <Label htmlFor="expiry_date">Expiry date (required)</Label>
                <Input id="expiry_date" type="date" value={form.expiry_date} onChange={set('expiry_date')} />
                <div className="flex gap-2 items-start mt-1">
                  <AlertTriangle className="w-4 h-4 text-[hsl(var(--warning))] shrink-0 mt-0.5" />
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    A {form.type.toLowerCase()} change is a deviation the facility
                    runs on until a date. Without one it becomes a permanent
                    change nobody decided to make. It is required, for a draft
                    too.
                  </p>
                </div>
                <FieldError>{errors.expiry_date}</FieldError>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="panel-elevation">
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4 bg-[hsl(var(--secondary))]/30 flex flex-row items-center justify-between">
            <CardTitle className="text-lg">4. Impact assessment</CardTitle>
            <Button type="button" variant="outline" size="sm"
              onClick={() => setImpacts((r) => [...r, { impact_area: '', severity: 'Low', description: '', mitigation: '' }])}>
              <Plus className="w-4 h-4 mr-2" /> Add an area
            </Button>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            {impacts.map((row, i) => (
              <div key={`impact-${i}`} className="grid grid-cols-1 md:grid-cols-[1fr_140px_1fr_40px] gap-3 items-end">
                <div>
                  {i === 0 ? <Label htmlFor={`area-${i}`}>Area affected</Label> : null}
                  <Input id={`area-${i}`} list="moc-impact-areas" value={row.impact_area}
                    onChange={setImpact(i, 'impact_area')} placeholder="Process safety" />
                </div>
                <div>
                  {i === 0 ? <Label htmlFor={`sev-${i}`}>Severity</Label> : null}
                  <Select id={`sev-${i}`} value={row.severity} onChange={setImpact(i, 'severity')}
                    options={IMPACT_SEVERITIES} placeholder="Severity" />
                </div>
                <div>
                  {i === 0 ? <Label htmlFor={`mit-${i}`}>Mitigation</Label> : null}
                  <Input id={`mit-${i}`} value={row.mitigation}
                    onChange={setImpact(i, 'mitigation')} placeholder="How it is controlled" />
                </div>
                <Button type="button" variant="ghost" size="icon" aria-label="Remove"
                  onClick={() => setImpacts((r) => r.filter((_, idx) => idx !== i))}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <datalist id="moc-impact-areas">
              {IMPACT_AREAS.map((a) => <option key={a} value={a} />)}
            </datalist>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Rows without an area are ignored. Actions and approvers are added
              on the change&apos;s own page once it exists.
            </p>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-3 sticky bottom-0 md:bottom-auto bg-[hsl(var(--background))] p-4 md:p-0 border-t md:border-0 border-[hsl(var(--border))] z-20">
          <Button type="button" variant="ghost" onClick={() => navigate(`${BASE}/register`)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" variant="outline" onClick={() => handleSubmit(false)} disabled={saving}>
            <Save className="w-4 h-4 mr-2" /> Save draft
          </Button>
          <Button type="button" onClick={() => handleSubmit(true)} disabled={saving}>
            <Send className="w-4 h-4 mr-2" />
            {saving ? 'Raising...' : 'Submit for screening'}
          </Button>
        </div>
      </div>
    </MOCPageShell>
  );
}
