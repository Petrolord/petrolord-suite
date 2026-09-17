import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ListChecks, Plus, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { exportToCSV } from '@/utils/exportUtils';
import { AUDIT_TYPES, CRITICALITIES, TEMPLATE_STATUSES } from '@/lib/auditManagement';
import { AuditShell } from './components/AuditShell';
import {
  EmptyState, ErrorState, Loading, MetricTile, SchemaNotice, WriteFailure,
} from './components/SharedComponents';
import { CriticalityBadge } from './components/AuditBadges';
import { validateTemplate, validateTemplateItem } from './utils/auditPayload';
import { useAuditManagement } from './hooks/useAuditManagement';

/**
 * AS10 — the checklists audits are run against.
 *
 * This is the difference between this app and AS8's ISO audit: an
 * audit here is executed against a protocol of questions, and the
 * protocol is reusable, so two contractor audits a year apart can be
 * compared question by question.
 *
 * Criticality is not decoration. A question marked Critical that is
 * answered Nonconformant must raise a finding before the audit can be
 * reported, so this page says so where the field is set.
 */

const blankTemplate = () => ({
  code: '',
  title: '',
  description: '',
  audit_type: 'Safety',
  version: '',
  status: 'Draft',
});

const blankItem = () => ({
  section: '',
  item_no: '',
  question: '',
  guidance: '',
  reference: '',
  criticality: 'Minor',
});

export default function Checklists() {
  const { toast } = useToast();
  const {
    templates, itemsFor, audits, loading, error, refresh, hasAs10Schema,
    createTemplate, updateTemplate, deleteTemplate,
    addTemplateItems, updateTemplateItem, deleteTemplateItem,
  } = useAuditManagement();

  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [addingTo, setAddingTo] = useState(null);
  const [item, setItem] = useState(blankItem());
  const [itemErrors, setItemErrors] = useState({});
  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);
  const today = new Date();

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const usage = useMemo(() => {
    const counts = new Map();
    audits.forEach((a) => {
      if (!a.template_id) return;
      counts.set(a.template_id, (counts.get(a.template_id) || 0) + 1);
    });
    return counts;
  }, [audits]);

  const submitTemplate = async (e) => {
    e.preventDefault();
    setFailure(null);
    const errs = validateTemplate(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const result = form.id
      ? await updateTemplate(form.id, form)
      : await createTemplate(form);
    setBusy(false);
    if (!result.success) { setFailure(result.error); return; }
    toast({ description: `Checklist ${result.data.code} saved.` });
    setForm(null);
    setErrors({});
  };

  const submitItem = async (e) => {
    e.preventDefault();
    setFailure(null);
    const errs = validateTemplateItem(item);
    setItemErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const result = await addTemplateItems(addingTo.id, [item]);
    setBusy(false);
    if (!result.success) { setFailure(result.error); return; }
    toast({ description: `Item ${item.item_no} added to ${addingTo.code}.` });
    setItem({ ...blankItem(), section: item.section, criticality: item.criticality });
    setItemErrors({});
  };

  const setCriticality = async (row, criticality) => {
    setFailure(null);
    setBusy(true);
    const result = await updateTemplateItem(row.id, { ...row, criticality });
    setBusy(false);
    if (!result.success) { setFailure(result.error); return; }
    toast({ description: `Item ${row.item_no} is now ${criticality.toLowerCase()}.` });
  };

  const removeItem = async (row) => {
    setFailure(null);
    setBusy(true);
    const result = await deleteTemplateItem(row.id);
    setBusy(false);
    if (!result.success) { setFailure(result.error); return; }
    toast({ description: `Item ${row.item_no} removed.` });
  };

  const removeTemplate = async (template, used) => {
    setFailure(null);
    if (used) {
      setFailure(`${template.code} has been used by ${used} audit${used === 1 ? '' : 's'}. `
        + 'Retire it instead, so the audits that used it keep their questions.');
      return;
    }
    setBusy(true);
    const result = await deleteTemplate(template.id);
    setBusy(false);
    if (!result.success) { setFailure(result.error); return; }
    toast({ description: `${template.code} removed.` });
  };

  const exportTemplate = (template) => {
    const items = itemsFor(template.id);
    if (!items.length) {
      toast({ description: 'That checklist has no items yet.' });
      return;
    }
    exportToCSV(items.map((i) => ({
      Checklist: template.code,
      Title: template.title,
      Section: i.section || '',
      Item: i.item_no || '',
      Question: i.question || '',
      Guidance: i.guidance || '',
      Reference: i.reference || '',
      Criticality: i.criticality || '',
    })), `checklist-${template.code}-${format(today, 'yyyy-MM-dd')}.csv`);
  };

  if (loading) return <AuditShell title="Checklists"><Loading /></AuditShell>;
  if (error) {
    return <AuditShell title="Checklists"><ErrorState error={error} onRetry={refresh} /></AuditShell>;
  }
  if (!hasAs10Schema) return <AuditShell title="Checklists"><SchemaNotice /></AuditShell>;

  const selectClass = 'h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm';
  const criticalCount = templates.reduce(
    (acc, t) => acc + itemsFor(t.id).filter((i) => i.criticality === 'Critical').length, 0);

  return (
    <AuditShell
      title="Checklists"
      description="The protocols audits are run against, question by question"
      actions={(
        <Button onClick={() => { setFailure(null); setForm(form ? null : blankTemplate()); }}>
          <Plus className="w-4 h-4 mr-2" /> New checklist
        </Button>
      )}
    >
      <div className="space-y-6 animate-in fade-in duration-300 pb-10">
        <WriteFailure error={failure} />

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricTile label="Checklists" value={templates.length} />
          <MetricTile
            label="Active" value={templates.filter((t) => t.status === 'Active').length}
            token="--success"
          />
          <MetricTile
            label="Questions"
            value={templates.reduce((acc, t) => acc + itemsFor(t.id).length, 0)}
          />
          <MetricTile
            label="Critical questions" value={criticalCount}
            hint="Each one must raise a finding if it fails"
            token={criticalCount ? '--destructive' : '--muted-foreground'}
          />
        </div>

        {form ? (
          <Card className="panel-elevation">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
              <CardTitle className="text-lg">
                {form.id ? `Edit ${form.code}` : 'New checklist'}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={submitTemplate} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="tp-code">Reference</label>
                    <Input id="tp-code" value={form.code} onChange={set('code')}
                      placeholder="CHK-HSE-01" />
                    {errors.code ? (
                      <p className="text-xs text-[hsl(var(--destructive))]">{errors.code}</p>
                    ) : null}
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="tp-title">Title</label>
                    <Input id="tp-title" value={form.title} onChange={set('title')}
                      placeholder="Contractor HSE audit protocol" />
                    {errors.title ? (
                      <p className="text-xs text-[hsl(var(--destructive))]">{errors.title}</p>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="tp-version">Version</label>
                    <Input id="tp-version" value={form.version} onChange={set('version')}
                      placeholder="rev 3" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="tp-type">Audit type</label>
                    <select id="tp-type" className={selectClass} value={form.audit_type}
                      onChange={set('audit_type')}>
                      {AUDIT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="tp-status">Status</label>
                    <select id="tp-status" className={selectClass} value={form.status}
                      onChange={set('status')}>
                      {TEMPLATE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      Retired checklists stay readable on the audits that used them.
                    </p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="tp-desc">Description</label>
                  <Textarea id="tp-desc" rows={2} value={form.description}
                    onChange={set('description')} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setForm(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={busy}>
                    {form.id ? 'Save changes' : 'Create checklist'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}

        {templates.length === 0 && !form ? (
          <EmptyState
            icon={<ListChecks className="w-12 h-12" />}
            title="No checklists yet"
            description="A checklist is the protocol an audit is run against. Build one and every audit using it answers the same questions."
            action={<Button onClick={() => setForm(blankTemplate())}>Build one</Button>}
          />
        ) : null}

        {templates.map((template) => {
          const items = itemsFor(template.id);
          const used = usage.get(template.id) || 0;
          return (
            <Card key={template.id} className="panel-elevation">
              <CardHeader className="border-b border-[hsl(var(--border))] pb-4 flex flex-row items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-lg">
                    <span className="font-mono text-sm mr-2">{template.code}</span>
                    {template.title}
                  </CardTitle>
                  <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                    {template.audit_type}
                    {template.version ? ` · ${template.version}` : ''}
                    {' · '}{items.length} question{items.length === 1 ? '' : 's'}
                    {used ? ` · used by ${used} audit${used === 1 ? '' : 's'}` : ' · not used yet'}
                    {' · '}{template.status}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <Button size="sm" variant="outline" disabled={busy}
                    onClick={() => {
                      setFailure(null);
                      setAddingTo(addingTo?.id === template.id ? null : template);
                      setItem(blankItem());
                    }}>
                    <Plus className="w-4 h-4 mr-2" /> Add a question
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => exportTemplate(template)}>
                    Export
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy}
                    onClick={() => { setFailure(null); setForm({ ...blankTemplate(), ...template }); }}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy}
                    onClick={() => removeTemplate(template, used)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {addingTo?.id === template.id ? (
                  <form onSubmit={submitItem}
                    className="p-5 border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/30 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                      <div className="md:col-span-2 space-y-1.5">
                        <label className="text-xs font-medium" htmlFor="it-section">Section</label>
                        <Input id="it-section" value={item.section}
                          onChange={(e) => setItem((i) => ({ ...i, section: e.target.value }))}
                          placeholder="Permit to work" />
                      </div>
                      <div className="md:col-span-1 space-y-1.5">
                        <label className="text-xs font-medium" htmlFor="it-no">Item</label>
                        <Input id="it-no" value={item.item_no}
                          onChange={(e) => setItem((i) => ({ ...i, item_no: e.target.value }))}
                          placeholder="1.1" />
                        {itemErrors.item_no ? (
                          <p className="text-xs text-[hsl(var(--destructive))]">{itemErrors.item_no}</p>
                        ) : null}
                      </div>
                      <div className="md:col-span-7 space-y-1.5">
                        <label className="text-xs font-medium" htmlFor="it-q">Question</label>
                        <Input id="it-q" value={item.question}
                          onChange={(e) => setItem((i) => ({ ...i, question: e.target.value }))}
                          placeholder="Is a valid permit to work displayed at the worksite?" />
                        {itemErrors.question ? (
                          <p className="text-xs text-[hsl(var(--destructive))]">{itemErrors.question}</p>
                        ) : null}
                      </div>
                      <div className="md:col-span-2 space-y-1.5">
                        <label className="text-xs font-medium" htmlFor="it-crit">Criticality</label>
                        <select id="it-crit" className={selectClass} value={item.criticality}
                          onChange={(e) => setItem((i) => ({ ...i, criticality: e.target.value }))}>
                          {CRITICALITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium" htmlFor="it-guidance">
                          Guidance for the auditor
                        </label>
                        <Input id="it-guidance" value={item.guidance}
                          onChange={(e) => setItem((i) => ({ ...i, guidance: e.target.value }))} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium" htmlFor="it-ref">Reference</label>
                        <Input id="it-ref" value={item.reference}
                          onChange={(e) => setItem((i) => ({ ...i, reference: e.target.value }))}
                          placeholder="HSE-PR-07 §4.2" />
                      </div>
                    </div>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      A <strong>Critical</strong> question answered Nonconformant must raise a
                      finding before the audit can be reported.
                    </p>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setAddingTo(null)}>
                        Done
                      </Button>
                      <Button type="submit" disabled={busy}>Add question</Button>
                    </div>
                  </form>
                ) : null}

                {items.length === 0 ? (
                  <p className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                    This checklist has no questions yet. An audit cannot be run against an
                    empty protocol.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="data-grid-table w-full">
                      <thead>
                        <tr>
                          <th className="data-grid-th">Section</th>
                          <th className="data-grid-th">Item</th>
                          <th className="data-grid-th">Question</th>
                          <th className="data-grid-th">Reference</th>
                          <th className="data-grid-th">Criticality</th>
                          <th className="data-grid-th text-right">Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((row) => (
                          <tr key={row.id} className="border-b border-[hsl(var(--border))] last:border-0">
                            <td className="data-grid-td text-xs">{row.section || ''}</td>
                            <td className="data-grid-td font-mono text-xs">{row.item_no}</td>
                            <td className="data-grid-td">
                              {row.question}
                              {row.guidance ? (
                                <span className="block text-xs text-[hsl(var(--muted-foreground))]">
                                  {row.guidance}
                                </span>
                              ) : null}
                            </td>
                            <td className="data-grid-td text-xs">{row.reference || ''}</td>
                            <td className="data-grid-td">
                              <CriticalityBadge criticality={row.criticality} />
                            </td>
                            <td className="data-grid-td text-right">
                              <div className="flex gap-1 justify-end">
                                {CRITICALITIES.filter((c) => c !== row.criticality).map((c) => (
                                  <Button key={c} size="sm" variant="ghost" disabled={busy}
                                    onClick={() => setCriticality(row, c)}>
                                    {c}
                                  </Button>
                                ))}
                                <Button size="sm" variant="ghost" disabled={busy}
                                  onClick={() => removeItem(row)}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </AuditShell>
  );
}
