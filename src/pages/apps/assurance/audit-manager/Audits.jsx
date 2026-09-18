import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ClipboardCheck, Download, Plus, Search } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { exportToCSV } from '@/utils/exportUtils';
import {
  AUDIT_STATUSES,
  AUDIT_TYPES,
  checklistProgress,
  isAuditOverdue,
} from '@/lib/auditManagement';
import { AuditShell, BASE } from './components/AuditShell';
import {
  EmptyState, ErrorState, GateNotice, Loading, MetricTile, SchemaNotice, WriteFailure,
} from './components/SharedComponents';
import { AuditStatusBadge, ChecklistProgressBar } from './components/AuditBadges';
import { validateAudit } from './utils/auditPayload';
import { useAuditManagement } from './hooks/useAuditManagement';

/**
 * AS10 — the audits themselves.
 *
 * Planning an audit writes its checklist out at the same time, so an
 * auditor opens a protocol rather than an empty page. The independence
 * rule is checked on this form: the lead auditor may not be the
 * auditee.
 */

const blank = (programmeId) => ({
  programme_id: programmeId || '',
  template_id: '',
  title: '',
  audit_type: 'Safety',
  scope: '',
  criteria: '',
  site: '',
  department: '',
  contractor: '',
  auditee_name: '',
  lead_auditor_name: '',
  audit_team: '',
  planned_start: '',
  planned_end: '',
});

export default function Audits() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const {
    audits, programmes, templates, itemsFor, responsesFor, findingsForAudit,
    loading, error, refresh, hasAs10Schema, createAudit,
  } = useAuditManagement();

  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const today = new Date();

  useEffect(() => {
    const programmeId = params.get('programme');
    if (programmeId) setForm((f) => f || blank(programmeId));
  }, [params]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const programmeById = useMemo(
    () => new Map(programmes.map((p) => [p.id, p])), [programmes]);
  const templateById = useMemo(
    () => new Map(templates.map((t) => [t.id, t])), [templates]);

  const rows = useMemo(() => audits
    .filter((a) => {
      if (statusFilter && a.status !== statusFilter) return false;
      if (typeFilter && a.audit_type !== typeFilter) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return [a.audit_code, a.title, a.site, a.department, a.contractor, a.lead_auditor_name]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    })
    .map((a) => ({
      ...a,
      progress: checklistProgress(a.template_id ? itemsFor(a.template_id) : [], responsesFor(a.id)),
      findings: findingsForAudit(a.id).length,
      openFindings: findingsForAudit(a.id).filter(
        (f) => !['Closed', 'Voided'].includes(f.status)).length,
      overdue: isAuditOverdue(a, today),
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [audits, statusFilter, typeFilter, query, itemsFor, responsesFor, findingsForAudit]);

  const activeTemplates = useMemo(
    () => templates.filter((t) => t.status !== 'Retired'), [templates]);

  const submit = async (e) => {
    e.preventDefault();
    setFailure(null);
    const errs = validateAudit(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const result = await createAudit(form);
    setBusy(false);
    if (!result.success) { setFailure(result.error); return; }
    toast({
      title: `${result.data.audit_code} planned`,
      description: result.warning
        || (result.data.template_id
          ? 'Its checklist is ready to work through.'
          : 'No checklist: this one is an ad-hoc audit.'),
    });
    setForm(null);
    setErrors({});
    params.delete('programme');
    setParams(params, { replace: true });
    navigate(`${BASE}/audits/${result.data.id}`);
  };

  const exportRegister = () => {
    if (!rows.length) {
      toast({ description: 'There is nothing to export.' });
      return;
    }
    exportToCSV(rows.map((a) => ({
      Audit: a.audit_code || '',
      Title: a.title || '',
      Programme: programmeById.get(a.programme_id)?.title || '',
      Checklist: templateById.get(a.template_id)?.code || '',
      Type: a.audit_type || '',
      Site: a.site || '',
      Department: a.department || '',
      Contractor: a.contractor || '',
      'Lead auditor': a.lead_auditor_name || '',
      Auditee: a.auditee_name || '',
      Planned: a.planned_start || '',
      'Planned end': a.planned_end || '',
      Overdue: a.overdue ? 'Yes' : 'No',
      Status: a.status || '',
      'Checklist answered': a.progress.total ? `${a.progress.answered} of ${a.progress.total}` : 'No checklist',
      Nonconformances: a.progress.nonconformant,
      Findings: a.findings,
      'Findings open': a.openFindings,
      'Report issued': a.report_issued_date || '',
      'Cancelled because': a.cancellation_reason || '',
    })), `audit-register-${format(today, 'yyyy-MM-dd')}.csv`);
  };

  if (loading) return <AuditShell title="Audits"><Loading /></AuditShell>;
  if (error) {
    return <AuditShell title="Audits"><ErrorState error={error} onRetry={refresh} /></AuditShell>;
  }
  if (!hasAs10Schema) return <AuditShell title="Audits"><SchemaNotice /></AuditShell>;

  const selectClass = 'h-10 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm';
  const sameParty = Boolean(form?.auditee_name)
    && form.auditee_name.trim().toLowerCase() === String(form.lead_auditor_name || '').trim().toLowerCase();

  return (
    <AuditShell
      title="Audits"
      description="Planned, executed against a checklist, reported and closed"
      actions={(
        <>
          <Button variant="outline" onClick={exportRegister}>
            <Download className="w-4 h-4 mr-2" /> Export (CSV)
          </Button>
          <Button onClick={() => { setFailure(null); setForm(form ? null : blank()); }}>
            <Plus className="w-4 h-4 mr-2" /> Plan an audit
          </Button>
        </>
      )}
    >
      <div className="space-y-6 animate-in fade-in duration-300 pb-10">
        <WriteFailure error={failure} />

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricTile label="Audits" value={audits.length} />
          <MetricTile
            label="Open"
            value={audits.filter((a) => !['Reported', 'Closed', 'Cancelled'].includes(a.status)).length}
            token="--warning"
          />
          <MetricTile
            label="Past their planned end"
            value={audits.filter((a) => isAuditOverdue(a, today)).length}
            token={audits.some((a) => isAuditOverdue(a, today)) ? '--destructive' : '--success'}
          />
          <MetricTile
            label="Cancelled"
            value={audits.filter((a) => a.status === 'Cancelled').length}
            hint="Each with a written reason"
            token="--muted-foreground"
          />
        </div>

        {form ? (
          <Card className="panel-elevation">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
              <CardTitle className="text-lg">Plan an audit</CardTitle>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                Pick a checklist and it is written out with the audit, so the auditor
                opens a protocol rather than an empty page.
              </p>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={submit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="au-title">Title</label>
                    <Input id="au-title" value={form.title} onChange={set('title')}
                      placeholder="Contractor HSE audit: Rig 7" />
                    {errors.title ? (
                      <p className="text-xs text-[hsl(var(--destructive))]">{errors.title}</p>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="au-type">Type</label>
                    <select id="au-type" className={`${selectClass} w-full`} value={form.audit_type}
                      onChange={set('audit_type')}>
                      {AUDIT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="au-template">Checklist</label>
                    <select id="au-template" className={`${selectClass} w-full`}
                      value={form.template_id} onChange={set('template_id')}>
                      <option value="">No checklist (ad-hoc)</option>
                      {activeTemplates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.code}: {t.title} ({itemsFor(t.id).length})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="au-programme">Programme</label>
                    <select id="au-programme" className={`${selectClass} w-full`}
                      value={form.programme_id} onChange={set('programme_id')}>
                      <option value="">Outside a programme</option>
                      {programmes.map((p) => (
                        <option key={p.id} value={p.id}>{p.programme_year}: {p.title}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="au-site">Site</label>
                    <Input id="au-site" value={form.site} onChange={set('site')} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="au-dept">Department</label>
                    <Input id="au-dept" value={form.department} onChange={set('department')} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="au-contractor">Contractor</label>
                    <Input id="au-contractor" value={form.contractor} onChange={set('contractor')} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="au-lead">Lead auditor</label>
                    <Input id="au-lead" value={form.lead_auditor_name}
                      onChange={set('lead_auditor_name')} />
                    {errors.lead_auditor_name ? (
                      <p className="text-xs text-[hsl(var(--destructive))]">{errors.lead_auditor_name}</p>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="au-auditee">Auditee</label>
                    <Input id="au-auditee" value={form.auditee_name} onChange={set('auditee_name')}
                      placeholder="Who answers for the area" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="au-start">Planned start</label>
                    <Input id="au-start" type="date" value={form.planned_start}
                      onChange={set('planned_start')} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="au-end">Planned end</label>
                    <Input id="au-end" type="date" value={form.planned_end}
                      onChange={set('planned_end')} />
                    {errors.planned_end ? (
                      <p className="text-xs text-[hsl(var(--destructive))]">{errors.planned_end}</p>
                    ) : null}
                  </div>
                </div>

                {sameParty ? (
                  <GateNotice reason="The lead auditor and the auditee are the same person. An auditor may not audit their own area." />
                ) : null}

                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="au-scope">Scope</label>
                  <Textarea id="au-scope" rows={2} value={form.scope} onChange={set('scope')}
                    placeholder="What this audit covers: the activities, the locations and the period." />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="au-criteria">Criteria</label>
                    <Input id="au-criteria" value={form.criteria} onChange={set('criteria')}
                      placeholder="The procedures, permits and contract terms audited against." />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="au-team">Audit team</label>
                    <Input id="au-team" value={form.audit_team} onChange={set('audit_team')} />
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setForm(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={busy}>Plan audit</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}

        <Card className="panel-elevation">
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4 space-y-3">
            <CardTitle className="text-lg">
              {rows.length} of {audits.length} audit{audits.length === 1 ? '' : 's'}
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search audit, site, auditor" className="pl-9 w-64" />
              </div>
              <select className={selectClass} value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">Every status</option>
                {AUDIT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select className={selectClass} value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="">Every type</option>
                {AUDIT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {rows.length === 0 ? (
              <EmptyState
                icon={<ClipboardCheck className="w-12 h-12" />}
                title={audits.length ? 'Nothing matches those filters' : 'No audits planned'}
                description={audits.length
                  ? 'Clear the filters to see the rest of the register.'
                  : 'Plan the audits this organization will run. Each one is executed against a checklist and closes when its findings do.'}
                action={audits.length ? null : (
                  <Button onClick={() => setForm(blank())}>Plan the first one</Button>
                )}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="data-grid-table w-full">
                  <thead>
                    <tr>
                      <th className="data-grid-th">Audit</th>
                      <th className="data-grid-th">Title</th>
                      <th className="data-grid-th">Type</th>
                      <th className="data-grid-th">Lead auditor</th>
                      <th className="data-grid-th">Planned</th>
                      <th className="data-grid-th">Checklist</th>
                      <th className="data-grid-th">Findings</th>
                      <th className="data-grid-th">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((a) => (
                      <tr key={a.id}
                        className="border-b border-[hsl(var(--border))] last:border-0 cursor-pointer hover:bg-[hsl(var(--secondary))]/50"
                        onClick={() => navigate(`${BASE}/audits/${a.id}`)}>
                        <td className="data-grid-td font-mono text-xs">{a.audit_code}</td>
                        <td className="data-grid-td">
                          {a.title}
                          {a.contractor ? (
                            <span className="block text-xs text-[hsl(var(--muted-foreground))]">
                              {a.contractor}
                            </span>
                          ) : null}
                        </td>
                        <td className="data-grid-td text-xs">{a.audit_type}</td>
                        <td className="data-grid-td text-xs">{a.lead_auditor_name || 'Not named'}</td>
                        <td className="data-grid-td text-xs">
                          <span className={a.overdue ? 'text-[hsl(var(--destructive))] font-medium' : ''}>
                            {a.planned_start || 'Not set'}
                            {a.planned_end ? ` to ${a.planned_end}` : ''}
                          </span>
                        </td>
                        <td className="data-grid-td">
                          <ChecklistProgressBar progress={a.progress} />
                        </td>
                        <td className="data-grid-td text-xs">
                          {a.findings}
                          {a.openFindings ? (
                            <span className="text-[hsl(var(--destructive))] font-medium">
                              {' '}({a.openFindings} open)
                            </span>
                          ) : null}
                        </td>
                        <td className="data-grid-td"><AuditStatusBadge status={a.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AuditShell>
  );
}
