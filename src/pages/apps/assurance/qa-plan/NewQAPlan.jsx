import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  POINT_TYPES, PLAN_STATUSES, RESPONSIBLE_PARTIES,
} from '@/lib/qualityAssurance';
import { validateCheckpoint, validatePlan } from './utils/qaPayload';
import { QAPlanShell, BASE } from './components/QAPlanShell';
import {
  ErrorState, Loading, SchemaNotice, WriteFailure,
} from './components/SharedComponents';
import { PointTypeBadge } from './components/QABadges';
import { useQualityAssurance } from './hooks/useQualityAssurance';

/**
 * AS7 — a quality plan that gets saved.
 *
 * The page this replaces had NO STATE. Not one of its three inputs
 * carried a `value` or an `onChange`, and there was no `useState` for
 * any field. Its whole save path was:
 *
 *   const handleSave = () => {
 *     toast({ title: "QA Plan Draft Created",
 *             description: "You can now add checkpoints." });
 *     navigate('/dashboard/apps/assurance/qa-plan/register');
 *   };
 *
 * So the plan title, the department and the scope statement a user
 * typed were never even read out of the DOM, the toast promised
 * checkpoints that could not be added (the Add Checkpoint button
 * toasted "Add checkpoint dialog..."), and the register it landed on
 * held six plans from a data file.
 *
 * The inspection and test plan is built here, with the plan, because
 * an ITP written a week after the plan is a different document. Each
 * row asks for its acceptance criteria, and a HOLD point is refused
 * without them: a hold point stops work until somebody decides it has
 * passed, and against what is not optional.
 */

const blankCheckpoint = (n) => ({
  item_no: String(n),
  title: '',
  point_type: 'Review point',
  acceptance_criteria: '',
  responsible_party: 'Company',
  reference_document: '',
  planned_date: '',
});

export default function NewQAPlan() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { createPlan, loading, error, refresh, hasAs7Schema } = useQualityAssurance();

  const [form, setForm] = useState({
    title: '',
    description: '',
    scope: '',
    quality_objective: '',
    project_ref: '',
    asset_id: '',
    discipline: '',
    department: '',
    contractor: '',
    revision: '',
    status: 'Draft',
    start_date: '',
    end_date: '',
  });
  const [rows, setRows] = useState([blankCheckpoint(1)]);
  const [errors, setErrors] = useState({});
  const [rowErrors, setRowErrors] = useState({});
  const [failure, setFailure] = useState(null);
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) => {
    const value = e?.target ? e.target.value : e;
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  };

  const setRow = (index, field) => (e) => {
    const value = e?.target ? e.target.value : e;
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
    setRowErrors((prev) => {
      if (!prev[index]?.[field]) return prev;
      const next = { ...prev, [index]: { ...prev[index], [field]: undefined } };
      return next;
    });
  };

  const addRow = () => setRows((rs) => [...rs, blankCheckpoint(rs.length + 1)]);
  const removeRow = (index) => setRows((rs) => rs.filter((_, i) => i !== index));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFailure(null);

    const planErrors = validatePlan(form);
    const filledRows = rows.filter(
      (r) => String(r.title || '').trim() || String(r.acceptance_criteria || '').trim());
    const perRow = {};
    filledRows.forEach((r) => {
      const index = rows.indexOf(r);
      const rowErr = validateCheckpoint(r);
      if (Object.keys(rowErr).length) perRow[index] = rowErr;
    });

    // Two ITP items may not share a number: the database refuses it,
    // and a report that says "1.1 failed" has to mean one item.
    const numbers = filledRows.map((r) => String(r.item_no || '').trim()).filter(Boolean);
    const duplicate = numbers.find((n, i) => numbers.indexOf(n) !== i);
    if (duplicate) {
      const index = rows.findIndex((r) => String(r.item_no || '').trim() === duplicate
        && rows.filter((x) => String(x.item_no || '').trim() === duplicate).indexOf(r) === 1);
      perRow[index >= 0 ? index : 0] = {
        ...(perRow[index >= 0 ? index : 0] || {}),
        item_no: `Item ${duplicate} is used twice.`,
      };
    }

    setErrors(planErrors);
    setRowErrors(perRow);
    if (Object.keys(planErrors).length || Object.keys(perRow).length) {
      setFailure('Some fields need attention before this plan can be saved.');
      return;
    }

    setSaving(true);
    const result = await createPlan(form, { checkpoints: filledRows });
    setSaving(false);

    if (!result.success) {
      setFailure(result.error);
      return;
    }
    toast({
      title: `${result.data.plan_code} created`,
      description: result.warning
        || `${filledRows.length} inspection point${filledRows.length === 1 ? '' : 's'} recorded.`,
      variant: result.warning ? 'destructive' : undefined,
    });
    navigate(`${BASE}/plan/${result.data.id}`);
  };

  if (loading) return <QAPlanShell><Loading /></QAPlanShell>;
  if (error) return <QAPlanShell><ErrorState error={error} onRetry={refresh} /></QAPlanShell>;
  if (!hasAs7Schema) return <QAPlanShell><SchemaNotice /></QAPlanShell>;

  const field = (label, name, props = {}) => (
    <div className="space-y-1.5">
      <label className="text-sm font-medium" htmlFor={`plan-${name}`}>{label}</label>
      <Input id={`plan-${name}`} value={form[name]} onChange={set(name)} {...props} />
      {errors[name] ? (
        <p className="text-xs text-[hsl(var(--destructive))]">{errors[name]}</p>
      ) : null}
    </div>
  );

  return (
    <QAPlanShell title="Create a quality plan"
      description="The plan and its inspection and test points, saved together">
      <form onSubmit={handleSubmit} className="space-y-6 max-w-5xl animate-in fade-in duration-300">
        <WriteFailure error={failure} />

        <Card className="panel-elevation">
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
            <CardTitle className="text-lg">The plan</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {field('Title', 'title', { placeholder: 'Subsea tie-back quality plan', required: true })}
              {field('Revision', 'revision', { placeholder: 'A' })}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="plan-scope">
                Scope: what this plan covers
              </label>
              <Textarea id="plan-scope" value={form.scope} onChange={set('scope')}
                className="min-h-[90px]"
                placeholder="The activities, items and contracts this plan applies to, and the boundaries of it." />
              {errors.scope ? (
                <p className="text-xs text-[hsl(var(--destructive))]">{errors.scope}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="plan-objective">
                Quality objective
              </label>
              <Textarea id="plan-objective" value={form.quality_objective}
                onChange={set('quality_objective')} className="min-h-[70px]"
                placeholder="What this plan is trying to achieve, in terms that can be measured." />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="plan-description">
                Description
              </label>
              <Textarea id="plan-description" value={form.description}
                onChange={set('description')} className="min-h-[70px]" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {field('Department', 'department', { placeholder: 'Projects' })}
              {field('Discipline', 'discipline', { placeholder: 'Mechanical' })}
              {field('Contractor or vendor', 'contractor', { placeholder: 'The party doing the work' })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {field('Project reference', 'project_ref')}
              {field('Asset', 'asset_id')}
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="plan-status">Status</label>
                <select id="plan-status" value={form.status} onChange={set('status')}
                  className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm">
                  {PLAN_STATUSES.filter((s) => ['Draft', 'Under review', 'Active'].includes(s))
                    .map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {field('Start date', 'start_date', { type: 'date' })}
              {field('End date', 'end_date', { type: 'date' })}
            </div>
          </CardContent>
        </Card>

        <Card className="panel-elevation">
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
            <CardTitle className="text-lg">Inspection and test plan</CardTitle>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
              A hold point stops work until the verifying party attends and signs. A
              witness point notifies a party who may attend, and work proceeds if it
              does not. Only the hold points hold the plan open.
            </p>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            {rows.map((row, index) => (
              <div key={index}
                className="p-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-24 shrink-0 space-y-1.5">
                    <label className="text-xs font-medium" htmlFor={`item-${index}`}>Item</label>
                    <Input id={`item-${index}`} value={row.item_no}
                      onChange={setRow(index, 'item_no')} placeholder="1.1" />
                    {rowErrors[index]?.item_no ? (
                      <p className="text-xs text-[hsl(var(--destructive))]">{rowErrors[index].item_no}</p>
                    ) : null}
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <label className="text-xs font-medium" htmlFor={`title-${index}`}>
                      Activity or inspection
                    </label>
                    <Input id={`title-${index}`} value={row.title}
                      onChange={setRow(index, 'title')}
                      placeholder="Material certificate verification" />
                    {rowErrors[index]?.title ? (
                      <p className="text-xs text-[hsl(var(--destructive))]">{rowErrors[index].title}</p>
                    ) : null}
                  </div>
                  {rows.length > 1 ? (
                    <Button type="button" variant="ghost" size="icon" className="mt-6 shrink-0"
                      onClick={() => removeRow(index)} title="Remove this item">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium" htmlFor={`type-${index}`}>
                      Intervention
                    </label>
                    <select id={`type-${index}`} value={row.point_type}
                      onChange={setRow(index, 'point_type')}
                      className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm">
                      {POINT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <div><PointTypeBadge type={row.point_type} /></div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium" htmlFor={`party-${index}`}>
                      Verified by
                    </label>
                    <select id={`party-${index}`} value={row.responsible_party}
                      onChange={setRow(index, 'responsible_party')}
                      className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm">
                      {RESPONSIBLE_PARTIES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium" htmlFor={`planned-${index}`}>
                      Planned date
                    </label>
                    <Input id={`planned-${index}`} type="date" value={row.planned_date}
                      onChange={setRow(index, 'planned_date')} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium" htmlFor={`criteria-${index}`}>
                      Acceptance criteria
                      {row.point_type === 'Hold point' ? ' (required for a hold point)' : ''}
                    </label>
                    <Textarea id={`criteria-${index}`} value={row.acceptance_criteria}
                      onChange={setRow(index, 'acceptance_criteria')} className="min-h-[60px]"
                      placeholder="What must be true for this point to pass." />
                    {rowErrors[index]?.acceptance_criteria ? (
                      <p className="text-xs text-[hsl(var(--destructive))]">
                        {rowErrors[index].acceptance_criteria}
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium" htmlFor={`ref-${index}`}>
                      Reference document
                    </label>
                    <Input id={`ref-${index}`} value={row.reference_document}
                      onChange={setRow(index, 'reference_document')}
                      placeholder="Specification, drawing or procedure number" />
                  </div>
                </div>
              </div>
            ))}

            <Button type="button" variant="outline" onClick={addRow}>
              <Plus className="w-4 h-4 mr-2" /> Add an inspection point
            </Button>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Rows left blank are not saved. Points can be added to the plan later too.
            </p>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2 pb-6">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Create plan'}
          </Button>
        </div>
      </form>
    </QAPlanShell>
  );
}
