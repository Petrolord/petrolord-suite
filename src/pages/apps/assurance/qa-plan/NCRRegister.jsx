import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Download, FileWarning, Plus, Search, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { exportToCSV } from '@/utils/exportUtils';
import {
  CAPA_TYPES,
  NCR_SEVERITIES,
  NCR_STATUSES,
  ncrAgeDays,
  ncrByUrgency,
  isNcrOpen,
  isNcrOverdue,
} from '@/lib/qualityAssurance';
import { validateCapa, validateNcr } from './utils/qaPayload';
import { QAPlanShell, BASE } from './components/QAPlanShell';
import {
  EmptyState, ErrorState, Loading, SchemaNotice, WriteFailure,
} from './components/SharedComponents';
import { NcrStatusBadge, SeverityBadge } from './components/QABadges';
import { useQualityAssurance } from './hooks/useQualityAssurance';

/**
 * AS7 — the non-conformance register, and the only place one could not
 * be raised from.
 *
 * The page this replaces listed the two invented NCRs and offered a
 * "Raise NCR" button whose handler was
 * `toast({description: "Raise NCR form..."})`. There was no form
 * anywhere in the app, so a non-conformance could not be raised at all.
 * Its "View" button toasted "Opening NCR...". Its severity badge
 * coloured anything that was not High in amber, so a Critical
 * non-conformance would have rendered the same as a Medium one.
 *
 * The raise form is on this page rather than a route of its own,
 * because raising an NCR happens while looking at the register.
 */

const blankNcr = (planId) => ({
  title: '',
  description: '',
  severity: 'Minor',
  requirement_ref: '',
  discipline: '',
  department: '',
  asset_id: '',
  supplier: '',
  quantity_affected: '',
  plan_id: planId || '',
  checkpoint_id: '',
  due_date: '',
});

const blankCapa = () => ({
  action_type: 'Corrective', description: '', assignee_name: '', due_date: '',
});

export default function NCRRegister() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const {
    ncrs, plans, checkpointsFor, loading, error, refresh, hasAs7Schema, createNcr,
  } = useQualityAssurance();

  const [raising, setRaising] = useState(params.get('raise') === '1');
  const [form, setForm] = useState(blankNcr(params.get('plan')));
  const [capaRows, setCapaRows] = useState([]);
  const [errors, setErrors] = useState({});
  const [capaErrors, setCapaErrors] = useState({});
  const [failure, setFailure] = useState(null);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState('All');
  const [status, setStatus] = useState('Open only');

  useEffect(() => {
    if (params.get('raise') === '1') setRaising(true);
  }, [params]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...ncrs]
      .filter((n) => {
        if (severity !== 'All' && n.severity !== severity) return false;
        if (status === 'Open only' && !isNcrOpen(n)) return false;
        if (status !== 'All' && status !== 'Open only' && n.status !== status) return false;
        if (!q) return true;
        return [n.ncr_code, n.title, n.description, n.supplier, n.asset_id,
          n.requirement_ref, n.discipline, n.department]
          .some((v) => String(v || '').toLowerCase().includes(q));
      })
      .sort(ncrByUrgency(new Date()));
  }, [ncrs, search, severity, status]);

  const planCheckpoints = useMemo(
    () => (form.plan_id ? checkpointsFor(form.plan_id) : []),
    [form.plan_id, checkpointsFor]);

  const set = (field) => (e) => {
    const value = e?.target ? e.target.value : e;
    setForm((f) => ({
      ...f,
      [field]: value,
      // Changing the plan invalidates a checkpoint chosen under the old
      // one. The database refuses a mismatched pair; clearing it here
      // stops the user meeting that refusal.
      ...(field === 'plan_id' ? { checkpoint_id: '' } : {}),
    }));
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  };

  const exportRegister = () => {
    if (!filtered.length) {
      toast({ description: 'There is nothing to export.' });
      return;
    }
    const today = new Date();
    exportToCSV(filtered.map((n) => ({
      Number: n.ncr_code || '',
      Title: n.title || '',
      Severity: n.severity || '',
      Status: n.status || '',
      'Requirement departed from': n.requirement_ref || '',
      Plan: plans.find((p) => p.id === n.plan_id)?.plan_code || '',
      Discipline: n.discipline || '',
      Department: n.department || '',
      Asset: n.asset_id || '',
      Supplier: n.supplier || '',
      Raised: n.raised_date || '',
      Due: n.due_date || '',
      'Age (days)': ncrAgeDays(n, today) ?? '',
      Overdue: isNcrOverdue(n, today) ? 'Yes' : 'No',
      Disposition: n.disposition || '',
      'Root cause': n.root_cause || '',
      'Open actions': (n.capas || []).filter(
        (c) => !['Complete', 'Cancelled'].includes(c.status)).length,
      Closed: n.closed_date || '',
    })), `non-conformance-register-${format(today, 'yyyy-MM-dd')}`);
  };

  const submit = async (e) => {
    e.preventDefault();
    setFailure(null);

    const ncrErrors = validateNcr(form);
    const filledCapas = capaRows.filter((c) => String(c.description || '').trim());
    const perRow = {};
    filledCapas.forEach((c) => {
      const index = capaRows.indexOf(c);
      const rowErr = validateCapa(c);
      if (Object.keys(rowErr).length) perRow[index] = rowErr;
    });

    setErrors(ncrErrors);
    setCapaErrors(perRow);
    if (Object.keys(ncrErrors).length || Object.keys(perRow).length) {
      setFailure('Some fields need attention before this can be raised.');
      return;
    }

    setSaving(true);
    const result = await createNcr({
      ...form,
      plan_id: form.plan_id || null,
      checkpoint_id: form.checkpoint_id || null,
    }, { capas: filledCapas });
    setSaving(false);

    if (!result.success) { setFailure(result.error); return; }
    toast({
      title: `${result.data.ncr_code} raised`,
      description: result.warning || 'The non-conformance is on the register.',
      variant: result.warning ? 'destructive' : undefined,
    });
    setForm(blankNcr(null));
    setCapaRows([]);
    setRaising(false);
    params.delete('raise');
    params.delete('plan');
    setParams(params, { replace: true });
    navigate(`${BASE}/ncr/${result.data.id}`);
  };

  if (loading) return <QAPlanShell><Loading label="Loading the non-conformance register..." /></QAPlanShell>;
  if (error) return <QAPlanShell><ErrorState error={error} onRetry={refresh} /></QAPlanShell>;
  if (!hasAs7Schema) return <QAPlanShell><SchemaNotice /></QAPlanShell>;

  const today = new Date();

  return (
    <QAPlanShell title="Non-conformance register"
      description="Departures from specification, and what was done about them">
      <div className="space-y-4 animate-in fade-in duration-300 pb-10">
        <WriteFailure error={failure} />

        {raising ? (
          <Card className="panel-elevation">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
              <CardTitle className="text-lg">Raise a non-conformance</CardTitle>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                A non-conformance is a departure from something. Name the requirement it
                departs from, or there is nothing to conform to.
              </p>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={submit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="ncr-title">Title</label>
                    <Input id="ncr-title" value={form.title} onChange={set('title')}
                      placeholder="Flange thickness below specified minimum" />
                    {errors.title ? (
                      <p className="text-xs text-[hsl(var(--destructive))]">{errors.title}</p>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="ncr-severity">Severity</label>
                    <select id="ncr-severity" value={form.severity} onChange={set('severity')}
                      className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm">
                      {NCR_SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {['Critical', 'Major'].includes(form.severity) ? (
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">
                        A {form.severity.toLowerCase()} non-conformance will need a root cause
                        and a corrective action verified effective before it can be closed.
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="ncr-description">
                    What was found, and where
                  </label>
                  <Textarea id="ncr-description" value={form.description}
                    onChange={set('description')} className="min-h-[90px]" />
                  {errors.description ? (
                    <p className="text-xs text-[hsl(var(--destructive))]">{errors.description}</p>
                  ) : null}
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="ncr-requirement">
                    Requirement it departs from
                  </label>
                  <Input id="ncr-requirement" value={form.requirement_ref}
                    onChange={set('requirement_ref')}
                    placeholder="Specification, drawing, procedure or clause number" />
                  {errors.requirement_ref ? (
                    <p className="text-xs text-[hsl(var(--destructive))]">
                      {errors.requirement_ref}
                    </p>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="ncr-plan">
                      Quality plan, if it belongs to one
                    </label>
                    <select id="ncr-plan" value={form.plan_id} onChange={set('plan_id')}
                      className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm">
                      <option value="">No plan: found outside one</option>
                      {plans.map((p) => (
                        <option key={p.id} value={p.id}>{p.plan_code} · {p.title}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="ncr-checkpoint">
                      Inspection point, if one found it
                    </label>
                    <select id="ncr-checkpoint" value={form.checkpoint_id}
                      onChange={set('checkpoint_id')} disabled={!form.plan_id}
                      className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm disabled:opacity-50">
                      <option value="">Not from an inspection point</option>
                      {planCheckpoints.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.item_no} · {c.title} ({c.point_type})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="ncr-discipline">Discipline</label>
                    <Input id="ncr-discipline" value={form.discipline} onChange={set('discipline')} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="ncr-department">Department</label>
                    <Input id="ncr-department" value={form.department} onChange={set('department')} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="ncr-asset">Asset</label>
                    <Input id="ncr-asset" value={form.asset_id} onChange={set('asset_id')} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="ncr-supplier">
                      Supplier or vendor
                    </label>
                    <Input id="ncr-supplier" value={form.supplier} onChange={set('supplier')} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="ncr-due">Due date</label>
                    <Input id="ncr-due" type="date" value={form.due_date} onChange={set('due_date')} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="ncr-quantity">
                    Quantity or extent affected
                  </label>
                  <Input id="ncr-quantity" value={form.quantity_affected}
                    onChange={set('quantity_affected')}
                    placeholder="Six joints, one spool, the whole batch" />
                </div>

                <div className="pt-2 border-t border-[hsl(var(--border))] space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      Corrective and preventive actions (optional now, required to close)
                    </p>
                    <Button type="button" variant="outline" size="sm"
                      onClick={() => setCapaRows((r) => [...r, blankCapa()])}>
                      <Plus className="w-4 h-4 mr-2" /> Add an action
                    </Button>
                  </div>
                  {capaRows.map((row, index) => (
                    <div key={index}
                      className="p-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] grid grid-cols-1 md:grid-cols-12 gap-3">
                      <div className="md:col-span-3 space-y-1.5">
                        <label className="text-xs font-medium" htmlFor={`capa-type-${index}`}>
                          Type
                        </label>
                        <select id={`capa-type-${index}`} value={row.action_type}
                          onChange={(e) => setCapaRows((rs) => rs.map(
                            (r, i) => (i === index ? { ...r, action_type: e.target.value } : r)))}
                          className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm">
                          {CAPA_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div className="md:col-span-5 space-y-1.5">
                        <label className="text-xs font-medium" htmlFor={`capa-desc-${index}`}>
                          What will be done
                        </label>
                        <Input id={`capa-desc-${index}`} value={row.description}
                          onChange={(e) => setCapaRows((rs) => rs.map(
                            (r, i) => (i === index ? { ...r, description: e.target.value } : r)))} />
                        {capaErrors[index]?.description ? (
                          <p className="text-xs text-[hsl(var(--destructive))]">
                            {capaErrors[index].description}
                          </p>
                        ) : null}
                      </div>
                      <div className="md:col-span-2 space-y-1.5">
                        <label className="text-xs font-medium" htmlFor={`capa-who-${index}`}>
                          Owner
                        </label>
                        <Input id={`capa-who-${index}`} value={row.assignee_name}
                          onChange={(e) => setCapaRows((rs) => rs.map(
                            (r, i) => (i === index ? { ...r, assignee_name: e.target.value } : r)))} />
                      </div>
                      <div className="md:col-span-2 space-y-1.5">
                        <label className="text-xs font-medium" htmlFor={`capa-due-${index}`}>
                          Due
                        </label>
                        <div className="flex gap-1">
                          <Input id={`capa-due-${index}`} type="date" value={row.due_date}
                            onChange={(e) => setCapaRows((rs) => rs.map(
                              (r, i) => (i === index ? { ...r, due_date: e.target.value } : r)))} />
                          <Button type="button" variant="ghost" size="icon"
                            onClick={() => setCapaRows((rs) => rs.filter((_, i) => i !== index))}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                        {capaErrors[index]?.due_date ? (
                          <p className="text-xs text-[hsl(var(--destructive))]">
                            {capaErrors[index].due_date}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline"
                    onClick={() => { setRaising(false); setErrors({}); setFailure(null); }}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? 'Raising...' : 'Raise non-conformance'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}

        <Card className="bg-[hsl(var(--card))] border-[hsl(var(--border))]">
          <CardContent className="p-4 flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by number, title, supplier, asset or requirement"
                className="pl-9" />
            </div>
            <select value={severity} onChange={(e) => setSeverity(e.target.value)}
              className="h-10 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm">
              <option value="All">All severities</option>
              {NCR_SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)}
              className="h-10 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm">
              <option value="Open only">Open only</option>
              <option value="All">All statuses</option>
              {NCR_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <Button variant="outline" onClick={exportRegister}>
              <Download className="w-4 h-4 mr-2" /> Export (CSV)
            </Button>
            {!raising ? (
              <Button onClick={() => setRaising(true)}>
                <Plus className="w-4 h-4 mr-2" /> Raise NCR
              </Button>
            ) : null}
          </CardContent>
        </Card>

        {ncrs.length === 0 ? (
          <EmptyState
            icon={<FileWarning className="w-12 h-12" />}
            title="No non-conformances raised"
            description="This register is empty. That is a statement about this organization's records, not a placeholder: the app used to show two invented non-conformance reports here."
            action={<Button onClick={() => setRaising(true)}>Raise the first one</Button>}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Search className="w-12 h-12" />}
            title="Nothing matches those filters"
            description={`${ncrs.length} non-conformance${ncrs.length === 1 ? '' : 's'} on the register.`}
          />
        ) : (
          <>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Showing {filtered.length} of {ncrs.length}, most urgent first.
            </p>
            <div className="border border-[hsl(var(--border))] rounded-lg overflow-x-auto bg-[hsl(var(--card))]">
              <table className="data-grid-table w-full">
                <thead>
                  <tr>
                    <th className="data-grid-th">Number</th>
                    <th className="data-grid-th">Title</th>
                    <th className="data-grid-th">Plan</th>
                    <th className="data-grid-th">Severity</th>
                    <th className="data-grid-th">Age</th>
                    <th className="data-grid-th">Open actions</th>
                    <th className="data-grid-th">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((n) => {
                    const age = ncrAgeDays(n, today);
                    const openActions = (n.capas || []).filter(
                      (c) => !['Complete', 'Cancelled'].includes(c.status)).length;
                    return (
                      <tr key={n.id} onClick={() => navigate(`${BASE}/ncr/${n.id}`)}
                        className="border-b border-[hsl(var(--border))] last:border-0 hover:bg-[hsl(var(--secondary))]/50 cursor-pointer">
                        <td className="data-grid-td font-mono text-xs text-[hsl(var(--primary))]">
                          {n.ncr_code}
                        </td>
                        <td className="data-grid-td">
                          <p className="font-medium">{n.title}</p>
                          {n.requirement_ref ? (
                            <p className="text-xs text-[hsl(var(--muted-foreground))]">
                              vs {n.requirement_ref}
                            </p>
                          ) : null}
                        </td>
                        <td className="data-grid-td text-xs text-[hsl(var(--muted-foreground))] font-mono">
                          {plans.find((p) => p.id === n.plan_id)?.plan_code || '—'}
                        </td>
                        <td className="data-grid-td"><SeverityBadge severity={n.severity} /></td>
                        <td className="data-grid-td text-xs">
                          {age === null ? '—' : `${age} d`}
                          {isNcrOverdue(n, today) ? (
                            <span className="block text-[hsl(var(--destructive))]">Overdue</span>
                          ) : null}
                        </td>
                        <td className="data-grid-td text-xs">{openActions}</td>
                        <td className="data-grid-td"><NcrStatusBadge status={n.status} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </QAPlanShell>
  );
}
