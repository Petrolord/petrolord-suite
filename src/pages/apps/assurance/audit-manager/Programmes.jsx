import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CalendarRange, Plus, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { exportToCSV } from '@/utils/exportUtils';
import {
  canAdvanceProgramme,
  isAuditOverdue,
  nextProgrammeStatuses,
  programmeProgress,
} from '@/lib/auditManagement';
import { AuditShell, BASE } from './components/AuditShell';
import {
  DetailField, EmptyState, ErrorState, GateNotice, Loading, MetricTile, SchemaNotice, WriteFailure,
} from './components/SharedComponents';
import { AuditStatusBadge, ProgrammeStatusBadge } from './components/AuditBadges';
import { validateProgramme } from './utils/auditPayload';
import { useAuditManagement } from './hooks/useAuditManagement';

/**
 * AS10 — the audit programme: what this organization said it would
 * audit this year, and what became of it.
 *
 * The page exists for one number. A programme is complete when its
 * audits are reported or cancelled with a reason, not when December
 * arrives, and `programmeProgress` counts delivery from audits
 * REPORTED. An annual programme marked complete over four audits that
 * never happened is the document a certification body asks for.
 */

const blank = () => ({
  title: '',
  programme_year: new Date().getFullYear(),
  objective: '',
  scope_statement: '',
  owner_name: '',
  notes: '',
});

export default function Programmes() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    programmes, auditsForProgramme, loading, error, refresh, hasAs10Schema,
    createProgramme, updateProgramme, advanceProgramme, deleteProgramme,
  } = useAuditManagement();

  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [approving, setApproving] = useState(null);
  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);
  const today = new Date();

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const rows = useMemo(() => programmes.map((p) => {
    const audits = auditsForProgramme(p.id);
    return {
      programme: p,
      audits,
      progress: programmeProgress(audits, today),
      completion: canAdvanceProgramme(p, 'Complete', { audits }),
    };
  }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [programmes, auditsForProgramme]);

  const submit = async (e) => {
    e.preventDefault();
    setFailure(null);
    const errs = validateProgramme(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    const result = form.id
      ? await updateProgramme(form.id, form)
      : await createProgramme(form);
    setBusy(false);
    if (!result.success) { setFailure(result.error); return; }
    toast({ description: form.id ? `${result.data.title} updated.` : `${result.data.title} created.` });
    setForm(null);
    setErrors({});
  };

  const move = async (programme, to, patch = {}) => {
    setFailure(null);
    setBusy(true);
    const result = await advanceProgramme(programme, to, patch);
    setBusy(false);
    if (!result.success) { setFailure(result.error); return false; }
    toast({ description: `${programme.title} is now ${to}.` });
    return true;
  };

  const submitApproval = async (e) => {
    e.preventDefault();
    const ok = await move(approving.programme, 'Approved', {
      approved_at: approving.approved_at,
      approver_name: approving.approver_name || null,
    });
    if (ok) setApproving(null);
  };

  const remove = async (programme, count) => {
    setFailure(null);
    setBusy(true);
    const result = await deleteProgramme(programme.id);
    setBusy(false);
    if (!result.success) { setFailure(result.error); return; }
    toast({
      description: count
        ? `${programme.title} removed. Its ${count} audit${count === 1 ? '' : 's'} are kept, without a programme.`
        : `${programme.title} removed.`,
    });
  };

  const exportProgramme = (row) => {
    if (!row.audits.length) {
      toast({ description: 'That programme has no audits in it yet.' });
      return;
    }
    exportToCSV(row.audits.map((a) => ({
      Programme: row.programme.title,
      Year: row.programme.programme_year,
      Audit: a.audit_code || '',
      Title: a.title || '',
      Type: a.audit_type || '',
      Site: a.site || '',
      Department: a.department || '',
      'Lead auditor': a.lead_auditor_name || '',
      Planned: a.planned_start || '',
      'Planned end': a.planned_end || '',
      Status: a.status || '',
      Overdue: isAuditOverdue(a, today) ? 'Yes' : 'No',
      'Report issued': a.report_issued_date || '',
      'Cancelled because': a.cancellation_reason || '',
    })), `audit-programme-${row.programme.programme_year}-${format(today, 'yyyy-MM-dd')}.csv`);
  };

  if (loading) return <AuditShell title="Programmes"><Loading /></AuditShell>;
  if (error) {
    return <AuditShell title="Programmes"><ErrorState error={error} onRetry={refresh} /></AuditShell>;
  }
  if (!hasAs10Schema) return <AuditShell title="Programmes"><SchemaNotice /></AuditShell>;

  return (
    <AuditShell
      title="Programmes"
      description="What this organization planned to audit, and what became of it"
      actions={(
        <Button onClick={() => { setFailure(null); setForm(form ? null : blank()); }}>
          <Plus className="w-4 h-4 mr-2" /> New programme
        </Button>
      )}
    >
      <div className="space-y-6 animate-in fade-in duration-300 pb-10">
        <WriteFailure error={failure} />

        {form ? (
          <Card className="panel-elevation">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
              <CardTitle className="text-lg">
                {form.id ? `Edit ${form.title}` : 'New audit programme'}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={submit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="pr-title">Title</label>
                    <Input id="pr-title" value={form.title} onChange={set('title')}
                      placeholder="2026 HSE and contractor audit programme" />
                    {errors.title ? (
                      <p className="text-xs text-[hsl(var(--destructive))]">{errors.title}</p>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="pr-year">Year</label>
                    <Input id="pr-year" type="number" value={form.programme_year}
                      onChange={set('programme_year')} />
                    {errors.programme_year ? (
                      <p className="text-xs text-[hsl(var(--destructive))]">{errors.programme_year}</p>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="pr-owner">Owner</label>
                    <Input id="pr-owner" value={form.owner_name} onChange={set('owner_name')} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="pr-objective">Objective</label>
                  <Textarea id="pr-objective" rows={2} value={form.objective}
                    onChange={set('objective')}
                    placeholder="What this year's programme is for: the risks it covers and the assurance it is meant to give." />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="pr-scope">Scope</label>
                  <Textarea id="pr-scope" rows={2} value={form.scope_statement}
                    onChange={set('scope_statement')}
                    placeholder="Which sites, contractors and processes are in it." />
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setForm(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={busy}>
                    {form.id ? 'Save changes' : 'Create programme'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}

        {rows.length === 0 && !form ? (
          <EmptyState
            icon={<CalendarRange className="w-12 h-12" />}
            title="No audit programme yet"
            description="A programme is the year's plan: the audits this organization intends to run. Its completion is judged against them."
            action={<Button onClick={() => setForm(blank())}>Start one</Button>}
          />
        ) : null}

        {rows.map(({ programme, audits, progress, completion }) => (
          <Card key={programme.id} className="panel-elevation">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4 flex flex-row items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-lg">{programme.title}</CardTitle>
                <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                  {programme.programme_year}
                  {programme.owner_name ? ` · ${programme.owner_name}` : ''}
                </p>
              </div>
              <ProgrammeStatusBadge status={programme.status} />
            </CardHeader>
            <CardContent className="p-6 space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <MetricTile label="Audits" value={progress.total} />
                <MetricTile
                  label="Reported" value={progress.reported}
                  hint={progress.percent === null ? 'Nothing planned' : `${progress.percent}% delivered`}
                  token="--success"
                />
                <MetricTile
                  label="Outstanding" value={progress.outstanding}
                  token={progress.outstanding ? '--warning' : '--success'}
                />
                <MetricTile
                  label="Overdue" value={progress.overdue}
                  token={progress.overdue ? '--destructive' : '--success'}
                />
                <MetricTile
                  label="Cancelled" value={progress.cancelled}
                  hint="Each with a written reason"
                  token="--muted-foreground"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DetailField label="Objective">{programme.objective}</DetailField>
                <DetailField label="Scope">{programme.scope_statement}</DetailField>
                <DetailField label="Approved">
                  {programme.approved_at
                    ? `${programme.approved_at}${programme.approver_name ? ` by ${programme.approver_name}` : ''}`
                    : null}
                </DetailField>
                <DetailField label="Completed">{programme.completed_at}</DetailField>
              </div>

              {audits.length ? (
                <div className="overflow-x-auto border border-[hsl(var(--border))] rounded-lg">
                  <table className="data-grid-table w-full">
                    <thead>
                      <tr>
                        <th className="data-grid-th">Audit</th>
                        <th className="data-grid-th">Title</th>
                        <th className="data-grid-th">Planned</th>
                        <th className="data-grid-th">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {audits.map((a) => (
                        <tr key={a.id}
                          className="border-b border-[hsl(var(--border))] last:border-0 cursor-pointer hover:bg-[hsl(var(--secondary))]/50"
                          onClick={() => navigate(`${BASE}/audits/${a.id}`)}>
                          <td className="data-grid-td font-mono text-xs">{a.audit_code}</td>
                          <td className="data-grid-td">
                            {a.title}
                            {a.cancellation_reason ? (
                              <span className="block text-xs text-[hsl(var(--muted-foreground))]">
                                Cancelled: {a.cancellation_reason}
                              </span>
                            ) : null}
                          </td>
                          <td className="data-grid-td text-xs">
                            <span className={isAuditOverdue(a, today) ? 'text-[hsl(var(--destructive))] font-medium' : ''}>
                              {a.planned_start || 'Not set'}
                              {a.planned_end ? ` to ${a.planned_end}` : ''}
                            </span>
                          </td>
                          <td className="data-grid-td"><AuditStatusBadge status={a.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  No audits have been planned into this programme yet.
                </p>
              )}

              <div className="pt-2 border-t border-[hsl(var(--border))] space-y-3">
                <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                  Move this programme
                </p>
                {nextProgrammeStatuses(programme.status).length === 0 ? (
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    A {String(programme.status).toLowerCase()} programme is final.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {nextProgrammeStatuses(programme.status).map((s) => (
                      <Button key={s} size="sm" variant="outline" disabled={busy}
                        onClick={() => (s === 'Approved'
                          ? setApproving({
                            programme,
                            approved_at: new Date().toISOString().slice(0, 10),
                            approver_name: '',
                          })
                          : move(programme, s))}>
                        {s}
                      </Button>
                    ))}
                  </div>
                )}
                {nextProgrammeStatuses(programme.status).includes('Complete') && !completion.ok ? (
                  <GateNotice reason={completion.reason} />
                ) : null}

                {approving && approving.programme.id === programme.id ? (
                  <form onSubmit={submitApproval} className="space-y-3 pt-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium" htmlFor="ap-date">Approved on</label>
                        <Input id="ap-date" type="date" value={approving.approved_at}
                          onChange={(e) => setApproving(
                            (a) => ({ ...a, approved_at: e.target.value }))} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium" htmlFor="ap-who">
                          Approved by (leave blank to record yourself)
                        </label>
                        <Input id="ap-who" value={approving.approver_name}
                          onChange={(e) => setApproving(
                            (a) => ({ ...a, approver_name: e.target.value }))} />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setApproving(null)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={busy}>Approve programme</Button>
                    </div>
                  </form>
                ) : null}

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button size="sm" variant="outline"
                    onClick={() => navigate(`${BASE}/audits?programme=${programme.id}`)}>
                    Plan an audit into it
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => exportProgramme({ programme, audits })}>
                    Export (CSV)
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy}
                    onClick={() => { setFailure(null); setForm({ ...blank(), ...programme }); }}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy}
                    onClick={() => remove(programme, audits.length)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </AuditShell>
  );
}
