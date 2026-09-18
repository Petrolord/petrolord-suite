import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ClipboardCheck, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { exportToCSV } from '@/utils/exportUtils';
import {
  AUDIT_STATUSES,
  AUDIT_TYPES,
  daysUntil,
  isCoverageExamined,
} from '@/lib/isoCompliance';
import { ISOShell, BASE } from './components/ISOShell';
import {
  EmptyState, ErrorState, Loading, MetricTile, SchemaNotice, WriteFailure,
} from './components/SharedComponents';
import { AuditStatusBadge } from './components/ISOBadges';
import { validateAudit } from './utils/isoPayload';
import { useIsoCompliance } from './hooks/useIsoCompliance';
import { PersonField } from '../shared/PersonField';
import { useOrgMembers } from '../shared/useOrgMembers';

/**
 * AS8 — the internal audit programme.
 *
 * What it replaces listed fifteen generated audits led by "Auditor 1"
 * to "Auditor 5", each carrying a **score** — `Math.random() * 20 + 80`,
 * so every audit in the register scored between 80 and 100, and scored
 * differently on every reload. There was no report, no scope, no
 * clause coverage and no way to create an audit at all.
 *
 * There is no score column here. An audit's output is a conclusion and
 * the clauses it examined.
 */

const blank = (standardId) => ({
  standard_id: standardId || '',
  title: '',
  audit_type: 'Internal',
  scope: '',
  criteria: '',
  department: '',
  lead_auditor_id: null,
  lead_auditor_name: '',
  planned_start: '',
  planned_end: '',
});

export default function InternalAudits() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    standards, audits, auditClauses, findings,
    loading, error, refresh, hasAs8Schema, createAudit,
  } = useIsoCompliance();
  const { members, userId } = useOrgMembers();

  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const today = new Date();

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const standardByT = useMemo(() => new Map(standards.map((s) => [s.id, s])), [standards]);

  const rows = useMemo(() => audits
    .filter((a) => !statusFilter || a.status === statusFilter)
    .map((a) => {
      const scope = auditClauses.filter((c) => c.audit_id === a.id);
      return {
        ...a,
        scopeCount: scope.length,
        examined: scope.filter(isCoverageExamined).length,
        findingCount: findings.filter((f) => f.audit_id === a.id).length,
        openMajor: findings.filter(
          (f) => f.audit_id === a.id && f.finding_type === 'Major nonconformity'
            && !['Closed', 'Voided'].includes(f.status)).length,
        overdue: ['Planned', 'In progress', 'Fieldwork complete', 'Reported'].includes(a.status)
          && (daysUntil(a.planned_end, today) ?? 1) < 0,
      };
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [audits, auditClauses, findings, statusFilter]);

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
    toast({ description: `${result.data.audit_code} planned.` });
    setForm(null);
    setErrors({});
    navigate(`${BASE}/audits/${result.data.id}`);
  };

  const exportProgramme = () => {
    if (!rows.length) {
      toast({ description: 'There is nothing to export.' });
      return;
    }
    exportToCSV(rows.map((a) => ({
      Audit: a.audit_code || '',
      Title: a.title || '',
      Standard: standardByT.get(a.standard_id)?.code || '',
      Type: a.audit_type || '',
      'Lead auditor': a.lead_auditor_name || '',
      Department: a.department || '',
      Planned: a.planned_start || '',
      'Planned end': a.planned_end || '',
      Status: a.status || '',
      'Clauses in scope': a.scopeCount,
      'Clauses examined': a.examined,
      Findings: a.findingCount,
      'Open major nonconformities': a.openMajor,
      'Report issued': a.report_issued_date || '',
    })), `iso-audit-programme-${format(today, 'yyyy-MM-dd')}.csv`);
  };

  if (loading) return <ISOShell title="Internal audits"><Loading /></ISOShell>;
  if (error) {
    return <ISOShell title="Internal audits"><ErrorState error={error} onRetry={refresh} /></ISOShell>;
  }
  if (!hasAs8Schema) return <ISOShell title="Internal audits"><SchemaNotice /></ISOShell>;

  const selectClass = 'h-10 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm';

  return (
    <ISOShell
      title="Internal audits"
      description="The audit programme, its scope and what each audit actually examined"
      actions={(
        <>
          <Button variant="outline" onClick={exportProgramme}>Export (CSV)</Button>
          <Button onClick={() => {
            setFailure(null);
            setForm(form ? null : blank(standards[0]?.id));
          }}>
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
            label="In the programme"
            value={audits.filter((a) => ['Planned', 'In progress', 'Fieldwork complete'].includes(a.status)).length}
            token="--warning"
          />
          <MetricTile
            label="Past their planned end"
            value={rows.filter((a) => a.overdue).length}
            token={rows.some((a) => a.overdue) ? '--destructive' : '--success'}
          />
          <MetricTile
            label="Reported"
            value={audits.filter((a) => ['Reported', 'Closed'].includes(a.status)).length}
            token="--success"
          />
        </div>

        {form ? (
          <Card className="panel-elevation">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
              <CardTitle className="text-lg">Plan an audit</CardTitle>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                The scope is built on the audit itself, clause by clause. An
                auditor may not audit their own work: a clause whose owner is the
                lead auditor is refused when it is added to the scope, whether both
                were picked as Suite members or typed under the same name.
              </p>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={submit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="au-title">Title</label>
                    <Input id="au-title" value={form.title} onChange={set('title')}
                      placeholder="Q3 internal audit: production and calibration" />
                    {errors.title ? (
                      <p className="text-xs text-[hsl(var(--destructive))]">{errors.title}</p>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="au-standard">Standard</label>
                    <select id="au-standard" className={`${selectClass} w-full`}
                      value={form.standard_id} onChange={set('standard_id')}>
                      <option value="">Not against one standard</option>
                      {standards.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="au-type">Type</label>
                    <select id="au-type" className={`${selectClass} w-full`}
                      value={form.audit_type} onChange={set('audit_type')}>
                      {AUDIT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      Only an internal audit counts towards clause coverage.
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="au-scope">Scope</label>
                  <Textarea id="au-scope" rows={2} value={form.scope} onChange={set('scope')}
                    placeholder="Which processes, sites and periods this audit covers." />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <PersonField
                    id="au-lead" label="Lead auditor" members={members} userId={userId}
                    personId={form.lead_auditor_id} name={form.lead_auditor_name}
                    onChange={({ id, name }) => setForm(
                      (f) => ({ ...f, lead_auditor_id: id, lead_auditor_name: name }))}
                    error={errors.lead_auditor_name}
                    selectClassName={`${selectClass} w-full`}
                  />
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="au-dept">Department</label>
                    <Input id="au-dept" value={form.department} onChange={set('department')} />
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

                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="au-criteria">Audit criteria</label>
                  <Input id="au-criteria" value={form.criteria} onChange={set('criteria')}
                    placeholder="The standard, the QMS procedures and the contract requirements audited against." />
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
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4 flex flex-row flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-lg">
              {rows.length} audit{rows.length === 1 ? '' : 's'}
            </CardTitle>
            <select className={selectClass} value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Every status</option>
              {AUDIT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </CardHeader>
          <CardContent className="p-0">
            {rows.length === 0 ? (
              <EmptyState
                icon={<ClipboardCheck className="w-12 h-12" />}
                title={audits.length ? 'Nothing matches that filter' : 'No audits planned'}
                description={audits.length
                  ? 'Clear the filter to see the rest of the programme.'
                  : 'Plan the internal audits this organization will run. ISO 9001 §9.2 asks the organization to audit its own system at planned intervals.'}
                action={audits.length ? null : (
                  <Button onClick={() => setForm(blank(standards[0]?.id))}>Plan the first one</Button>
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
                      <th className="data-grid-th">Scope examined</th>
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
                        <td className="data-grid-td">{a.title}</td>
                        <td className="data-grid-td text-xs">{a.audit_type}</td>
                        <td className="data-grid-td text-xs">
                          {a.lead_auditor_name || 'Not named'}
                        </td>
                        <td className="data-grid-td text-xs">
                          <span className={a.overdue ? 'text-[hsl(var(--destructive))] font-medium' : ''}>
                            {a.planned_start || 'Not set'}
                            {a.planned_end ? ` to ${a.planned_end}` : ''}
                          </span>
                        </td>
                        <td className="data-grid-td text-xs">
                          {a.scopeCount === 0
                            ? <span className="text-[hsl(var(--muted-foreground))]">No scope yet</span>
                            : `${a.examined} of ${a.scopeCount}`}
                        </td>
                        <td className="data-grid-td text-xs">
                          {a.findingCount}
                          {a.openMajor ? (
                            <span className="text-[hsl(var(--destructive))] font-medium">
                              {' '}({a.openMajor} major open)
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
    </ISOShell>
  );
}
