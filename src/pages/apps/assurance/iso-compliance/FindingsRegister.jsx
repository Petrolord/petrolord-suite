import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FileWarning, Plus, Search, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { exportToCSV } from '@/utils/exportUtils';
import {
  ACTION_TYPES,
  FINDING_STATUSES,
  FINDING_TYPES,
  findingAgeDays,
  findingByUrgency,
  isActionOpen,
  isFindingOpen,
  isFindingOverdue,
} from '@/lib/isoCompliance';
import { ISOShell, BASE } from './components/ISOShell';
import {
  EmptyState, ErrorState, Loading, MetricTile, SchemaNotice, WriteFailure,
} from './components/SharedComponents';
import { FindingStatusBadge, FindingTypeBadge } from './components/ISOBadges';
import { validateAction, validateFinding } from './utils/isoPayload';
import { useIsoCompliance } from './hooks/useIsoCompliance';

/**
 * AS8 — the findings register, and the only place a finding is raised.
 *
 * What it replaces listed twenty generated findings with descriptions
 * reading "Finding description 1. Process not fully aligned with
 * documented procedure.", owners called "User 1" to "User 8", and due
 * dates computed as `Date.now() + Math.random() * 5000000000`, so the
 * register's overdue column changed on every reload. It carried a
 * Severity column that duplicated the finding type in different words
 * (High for Major NC, Low for Observation), and there was no way to
 * raise a finding, disposition one, or close one.
 *
 * `isoActionsData` existed in the data file and no page rendered it,
 * exactly as AS7 found with capaSampleData.js.
 */

const blankAction = () => ({
  action_type: 'Corrective', description: '', assignee_name: '', due_date: '',
});

const blankFinding = (auditId, standardId) => ({
  audit_id: auditId || '',
  clause_id: '',
  standard_id: standardId || '',
  finding_type: 'Minor nonconformity',
  title: '',
  description: '',
  objective_evidence: '',
  requirement_ref: '',
  department: '',
  owner_name: '',
  due_date: '',
});

export default function FindingsRegister() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const {
    standards, clauses, audits, findings,
    loading, error, refresh, hasAs8Schema, createFinding, deleteFinding,
  } = useIsoCompliance();

  const [raising, setRaising] = useState(Boolean(params.get('audit')));
  const [form, setForm] = useState(
    blankFinding(params.get('audit') || '', params.get('standard') || ''));
  const [actionRows, setActionRows] = useState([]);
  const [errors, setErrors] = useState({});
  const [actionErrors, setActionErrors] = useState({});
  const [failure, setFailure] = useState(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const today = new Date();

  useEffect(() => {
    if (params.get('audit')) {
      setRaising(true);
      setForm((f) => ({ ...f, audit_id: params.get('audit') }));
    }
  }, [params]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const auditById = useMemo(() => new Map(audits.map((a) => [a.id, a])), [audits]);
  const clauseById = useMemo(() => new Map(clauses.map((c) => [c.id, c])), [clauses]);

  const scopedClauses = useMemo(() => {
    if (!form.standard_id) return clauses;
    return clauses.filter((c) => c.standard_id === form.standard_id);
  }, [clauses, form.standard_id]);

  const filtered = useMemo(() => findings
    .filter((f) => {
      if (typeFilter && f.finding_type !== typeFilter) return false;
      if (statusFilter && f.status !== statusFilter) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return [f.finding_code, f.title, f.description, f.department, f.owner_name]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    })
    .sort(findingByUrgency(today)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [findings, typeFilter, statusFilter, query]);

  const submit = async (e) => {
    e.preventDefault();
    setFailure(null);
    const errs = validateFinding(form);
    const actionErrs = {};
    actionRows.forEach((row, i) => {
      const r = validateAction(row);
      if (Object.keys(r).length) actionErrs[i] = r;
    });
    setErrors(errs);
    setActionErrors(actionErrs);
    if (Object.keys(errs).length || Object.keys(actionErrs).length) {
      setFailure('Some fields need attention before this can be raised.');
      return;
    }

    setBusy(true);
    const result = await createFinding(form, { actions: actionRows });
    setBusy(false);
    if (!result.success) { setFailure(result.error); return; }
    toast({
      title: `${result.data.finding_code} raised`,
      description: result.warning || 'It is on the register, with its actions.',
    });
    setRaising(false);
    setForm(blankFinding());
    setActionRows([]);
    setErrors({});
    params.delete('audit');
    setParams(params, { replace: true });
    navigate(`${BASE}/findings/${result.data.id}`);
  };

  const remove = async (finding) => {
    setFailure(null);
    setBusy(true);
    const result = await deleteFinding(finding.id);
    setBusy(false);
    if (!result.success) { setFailure(result.error); return; }
    toast({ description: `${finding.finding_code} deleted.` });
  };

  const exportRegister = () => {
    if (!filtered.length) {
      toast({ description: 'There is nothing to export.' });
      return;
    }
    exportToCSV(filtered.map((f) => ({
      Finding: f.finding_code || '',
      Title: f.title || '',
      Type: f.finding_type || '',
      Status: f.status || '',
      Audit: auditById.get(f.audit_id)?.audit_code || '',
      Clause: clauseById.get(f.clause_id)?.clause_ref || '',
      Department: f.department || '',
      Owner: f.owner_name || '',
      Raised: f.raised_date || '',
      Due: f.due_date || '',
      Overdue: isFindingOverdue(f, today) ? 'Yes' : 'No',
      'Age (days)': findingAgeDays(f, today) ?? '',
      Correction: f.correction || '',
      'Root cause': f.root_cause || '',
      Actions: (f.actions || []).length,
      'Actions open': (f.actions || []).filter(isActionOpen).length,
      Closed: f.closed_date || '',
    })), `iso-findings-${format(today, 'yyyy-MM-dd')}.csv`);
  };

  if (loading) return <ISOShell title="Findings"><Loading /></ISOShell>;
  if (error) return <ISOShell title="Findings"><ErrorState error={error} onRetry={refresh} /></ISOShell>;
  if (!hasAs8Schema) return <ISOShell title="Findings"><SchemaNotice /></ISOShell>;

  const selectClass = 'h-10 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm';
  const openMajor = findings.filter(
    (f) => isFindingOpen(f) && f.finding_type === 'Major nonconformity').length;

  return (
    <ISOShell
      title="Findings"
      description="Audit findings, their corrections and corrective actions, to closure"
      actions={(
        <>
          <Button variant="outline" onClick={exportRegister}>Export (CSV)</Button>
          <Button onClick={() => { setFailure(null); setRaising((r) => !r); }}>
            <Plus className="w-4 h-4 mr-2" /> Raise a finding
          </Button>
        </>
      )}
    >
      <div className="space-y-6 animate-in fade-in duration-300 pb-10">
        <WriteFailure error={failure} />

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricTile label="Findings" value={findings.length} />
          <MetricTile
            label="Open" value={findings.filter(isFindingOpen).length} token="--warning" />
          <MetricTile
            label="Major nonconformities open" value={openMajor}
            token={openMajor ? '--destructive' : '--success'}
            hint="Each one blocks certification"
          />
          <MetricTile
            label="Overdue"
            value={findings.filter((f) => isFindingOverdue(f, today)).length}
            token="--destructive"
          />
        </div>

        {raising ? (
          <Card className="panel-elevation">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
              <CardTitle className="text-lg">Raise a finding</CardTitle>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                A major nonconformity will not close without its root cause and a
                corrective action verified effective. A minor one needs the
                correction. An observation needs neither.
              </p>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={submit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="fd-title">The finding</label>
                    <Input id="fd-title" value={form.title} onChange={set('title')}
                      placeholder="Calibration records not retained for the required period" />
                    {errors.title ? (
                      <p className="text-xs text-[hsl(var(--destructive))]">{errors.title}</p>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="fd-type">Type</label>
                    <select id="fd-type" className={`${selectClass} w-full`}
                      value={form.finding_type} onChange={set('finding_type')}>
                      {FINDING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="fd-due">Due date</label>
                    <Input id="fd-due" type="date" value={form.due_date} onChange={set('due_date')} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="fd-standard">Standard</label>
                    <select id="fd-standard" className={`${selectClass} w-full`}
                      value={form.standard_id} onChange={set('standard_id')}>
                      <option value="">Not against one standard</option>
                      {standards.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="fd-audit">Audit</label>
                    <select id="fd-audit" className={`${selectClass} w-full`}
                      value={form.audit_id} onChange={set('audit_id')}>
                      <option value="">Raised outside an audit</option>
                      {audits.map((a) => (
                        <option key={a.id} value={a.id}>{a.audit_code}: {a.title}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="fd-clause">Clause</label>
                    <select id="fd-clause" className={`${selectClass} w-full`}
                      value={form.clause_id} onChange={set('clause_id')}>
                      <option value="">Not against one clause</option>
                      {scopedClauses.map((c) => (
                        <option key={c.id} value={c.id}>{c.clause_ref} · {c.title}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="fd-desc">
                    What was found, and against which requirement
                  </label>
                  <Textarea id="fd-desc" rows={3} value={form.description}
                    onChange={set('description')} />
                  {errors.description ? (
                    <p className="text-xs text-[hsl(var(--destructive))]">{errors.description}</p>
                  ) : null}
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="fd-evidence">
                    Objective evidence
                  </label>
                  <Textarea id="fd-evidence" rows={2} value={form.objective_evidence}
                    onChange={set('objective_evidence')}
                    placeholder="What was seen: the records sampled, the dates, the people interviewed. It is the first thing an auditee will ask for." />
                  {errors.objective_evidence ? (
                    <p className="text-xs text-[hsl(var(--destructive))]">{errors.objective_evidence}</p>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="fd-req">Requirement</label>
                    <Input id="fd-req" value={form.requirement_ref} onChange={set('requirement_ref')}
                      placeholder="ISO 9001:2015 7.1.5.2" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="fd-dept">Department</label>
                    <Input id="fd-dept" value={form.department} onChange={set('department')} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="fd-owner">Owner</label>
                    <Input id="fd-owner" value={form.owner_name} onChange={set('owner_name')} />
                  </div>
                </div>

                <div className="pt-2 border-t border-[hsl(var(--border))] space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      Corrective and preventive actions (optional now, required to close a
                      major nonconformity)
                    </p>
                    <Button type="button" variant="outline" size="sm"
                      onClick={() => setActionRows((r) => [...r, blankAction()])}>
                      <Plus className="w-4 h-4 mr-2" /> Add an action
                    </Button>
                  </div>
                  {actionRows.map((row, index) => (
                    <div key={index}
                      className="p-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] grid grid-cols-1 md:grid-cols-12 gap-3">
                      <div className="md:col-span-3 space-y-1.5">
                        <label className="text-xs font-medium" htmlFor={`ac-type-${index}`}>Type</label>
                        <select id={`ac-type-${index}`} className={`${selectClass} w-full`}
                          value={row.action_type}
                          onChange={(e) => setActionRows((rs) => rs.map(
                            (r, i) => (i === index ? { ...r, action_type: e.target.value } : r)))}>
                          {ACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div className="md:col-span-5 space-y-1.5">
                        <label className="text-xs font-medium" htmlFor={`ac-desc-${index}`}>
                          What will be done
                        </label>
                        <Input id={`ac-desc-${index}`} value={row.description}
                          onChange={(e) => setActionRows((rs) => rs.map(
                            (r, i) => (i === index ? { ...r, description: e.target.value } : r)))} />
                        {actionErrors[index]?.description ? (
                          <p className="text-xs text-[hsl(var(--destructive))]">
                            {actionErrors[index].description}
                          </p>
                        ) : null}
                      </div>
                      <div className="md:col-span-2 space-y-1.5">
                        <label className="text-xs font-medium" htmlFor={`ac-who-${index}`}>Owner</label>
                        <Input id={`ac-who-${index}`} value={row.assignee_name}
                          onChange={(e) => setActionRows((rs) => rs.map(
                            (r, i) => (i === index ? { ...r, assignee_name: e.target.value } : r)))} />
                      </div>
                      <div className="md:col-span-2 space-y-1.5">
                        <label className="text-xs font-medium" htmlFor={`ac-due-${index}`}>Due</label>
                        <div className="flex gap-1">
                          <Input id={`ac-due-${index}`} type="date" value={row.due_date}
                            onChange={(e) => setActionRows((rs) => rs.map(
                              (r, i) => (i === index ? { ...r, due_date: e.target.value } : r)))} />
                          <Button type="button" variant="ghost" size="icon"
                            onClick={() => setActionRows((rs) => rs.filter((_, i) => i !== index))}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                        {actionErrors[index]?.due_date ? (
                          <p className="text-xs text-[hsl(var(--destructive))]">
                            {actionErrors[index].due_date}
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
                  <Button type="submit" disabled={busy}>
                    {busy ? 'Raising...' : 'Raise finding'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}

        <Card className="panel-elevation">
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4 space-y-3">
            <CardTitle className="text-lg">
              {filtered.length} of {findings.length} finding{findings.length === 1 ? '' : 's'}
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search finding, title, owner" className="pl-9 w-64" />
              </div>
              <select className={selectClass} value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="">Every type</option>
                {FINDING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <select className={selectClass} value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">Every status</option>
                {FINDING_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <EmptyState
                icon={<FileWarning className="w-12 h-12" />}
                title={findings.length ? 'Nothing matches those filters' : 'No findings raised'}
                description={findings.length
                  ? 'Clear the filters to see the rest of the register.'
                  : 'Findings raised by an internal audit, or outside one, are recorded here. This app used to show twenty invented ones, with due dates that changed on every reload.'}
                action={findings.length ? null : (
                  <Button onClick={() => setRaising(true)}>Raise the first one</Button>
                )}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="data-grid-table w-full">
                  <thead>
                    <tr>
                      <th className="data-grid-th">Finding</th>
                      <th className="data-grid-th">Title</th>
                      <th className="data-grid-th">Type</th>
                      <th className="data-grid-th">Audit</th>
                      <th className="data-grid-th">Clause</th>
                      <th className="data-grid-th">Owner</th>
                      <th className="data-grid-th">Due</th>
                      <th className="data-grid-th">Actions</th>
                      <th className="data-grid-th">Status</th>
                      <th className="data-grid-th" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((f) => (
                      <tr key={f.id}
                        className="border-b border-[hsl(var(--border))] last:border-0 cursor-pointer hover:bg-[hsl(var(--secondary))]/50"
                        onClick={() => navigate(`${BASE}/findings/${f.id}`)}>
                        <td className="data-grid-td font-mono text-xs">{f.finding_code}</td>
                        <td className="data-grid-td">{f.title}</td>
                        <td className="data-grid-td"><FindingTypeBadge type={f.finding_type} /></td>
                        <td className="data-grid-td font-mono text-xs">
                          {auditById.get(f.audit_id)?.audit_code || ''}
                        </td>
                        <td className="data-grid-td font-mono text-xs">
                          {clauseById.get(f.clause_id)?.clause_ref || ''}
                        </td>
                        <td className="data-grid-td text-xs">{f.owner_name || 'Unassigned'}</td>
                        <td className="data-grid-td text-xs">
                          <span className={isFindingOverdue(f, today)
                            ? 'text-[hsl(var(--destructive))] font-medium' : ''}>
                            {f.due_date || 'Not set'}
                          </span>
                        </td>
                        <td className="data-grid-td text-xs">
                          {(f.actions || []).filter(isActionOpen).length} open
                          {' '}of {(f.actions || []).length}
                        </td>
                        <td className="data-grid-td"><FindingStatusBadge status={f.status} /></td>
                        <td className="data-grid-td text-right">
                          <Button size="sm" variant="ghost" disabled={busy}
                            onClick={(e) => { e.stopPropagation(); remove(f); }}
                            title="Delete this finding">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ISOShell>
  );
}
