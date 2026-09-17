import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ClipboardCheck, Plus, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import {
  COVERAGE_RESULTS,
  auditIndependence,
  canAdvanceAudit,
  isCoverageExamined,
  nextAuditStatuses,
} from '@/lib/isoCompliance';
import { ISOShell, BASE } from './components/ISOShell';
import {
  DetailField, EmptyState, ErrorState, GateNotice, Loading, MetricTile, SchemaNotice, WriteFailure,
} from './components/SharedComponents';
import {
  AuditStatusBadge, ClauseStatusBadge, FindingStatusBadge, FindingTypeBadge,
} from './components/ISOBadges';
import { useIsoCompliance } from './hooks/useIsoCompliance';

/**
 * AS8 — one audit: its scope, what it examined, and what it raised.
 *
 * There was no such page. The old audit register's rows were
 * `cursor-pointer` and navigated nowhere, which was consistent, since
 * there was nothing behind them: an audit was an id, a title, a lead
 * auditor called "Auditor 3" and a score between 80 and 100 generated
 * at module load.
 *
 * This page is where an audit's scope is built — and where ISO 19011's
 * independence rule is enforced, by naming the clauses the lead
 * auditor owns rather than recording the audit and hoping.
 */

const blankConclusion = () => ({ conclusion: '', report_issued_date: '' });

export default function AuditDetail() {
  const { auditId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    audits, clauses, standards, findings, coverageWithClauses, activityFor,
    loading, error, refresh, hasAs8Schema,
    addToScope, recordCoverage, removeFromScope, advanceAudit, updateAudit,
  } = useIsoCompliance();

  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState([]);
  const [recording, setRecording] = useState(null);
  const [result, setResult] = useState({ result: 'Conformant', evidence_seen: '', examined_on: '' });
  const [reporting, setReporting] = useState(null);
  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);
  const today = new Date();

  const audit = useMemo(() => audits.find((a) => a.id === auditId) || null, [audits, auditId]);
  const scope = useMemo(
    () => (audit ? coverageWithClauses(audit.id) : []), [audit, coverageWithClauses]);
  const raised = useMemo(
    () => (audit ? findings.filter((f) => f.audit_id === audit.id) : []), [audit, findings]);
  const standard = useMemo(
    () => (audit?.standard_id ? standards.find((s) => s.id === audit.standard_id) || null : null),
    [standards, audit]);
  const log = useMemo(() => (audit ? activityFor(audit.id) : []), [audit, activityFor]);

  const inScope = useMemo(() => new Set(scope.map((s) => s.clause_id)), [scope]);
  const available = useMemo(() => clauses.filter((c) => !inScope.has(c.id)
    && (!audit?.standard_id || c.standard_id === audit.standard_id)), [clauses, inScope, audit]);

  const independence = useMemo(() => {
    if (!audit) return { ok: true };
    const chosen = clauses.filter((c) => picked.includes(c.id));
    return auditIndependence(audit, chosen);
  }, [audit, clauses, picked]);

  const reportGate = useMemo(
    () => (audit ? canAdvanceAudit(audit, 'Reported', { coverage: scope }) : { ok: false }),
    [audit, scope]);
  const closeGate = useMemo(
    () => (audit ? canAdvanceAudit(audit, 'Closed', { findings: raised }) : { ok: false }),
    [audit, raised]);

  if (loading) return <ISOShell><Loading label="Loading the audit..." /></ISOShell>;
  if (error) return <ISOShell><ErrorState error={error} onRetry={refresh} /></ISOShell>;
  if (!hasAs8Schema) return <ISOShell><SchemaNotice /></ISOShell>;

  if (!audit) {
    return (
      <ISOShell title="Audit not found">
        <EmptyState
          icon={<ClipboardCheck className="w-12 h-12" />}
          title="No such audit"
          description="This audit is not in your organization's programme. It may have been deleted, or the link may be wrong."
          action={<Button onClick={() => navigate(`${BASE}/audits`)}>Back to the programme</Button>}
        />
      </ISOShell>
    );
  }

  const terminal = ['Closed', 'Cancelled'].includes(audit.status);
  const examined = scope.filter(isCoverageExamined).length;

  const run = async (fn, message) => {
    setFailure(null);
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.success) { setFailure(r.error); return false; }
    if (message) toast({ description: message });
    return true;
  };

  const submitScope = async (e) => {
    e.preventDefault();
    const ok = await run(() => addToScope(audit, picked),
      `${picked.length} clause${picked.length === 1 ? '' : 's'} added to the scope.`);
    if (ok) { setPicked([]); setPicking(false); }
  };

  const submitResult = async (e) => {
    e.preventDefault();
    const ok = await run(() => recordCoverage(recording, result),
      `Clause ${recording.clause_ref} recorded ${result.result}.`);
    if (ok) setRecording(null);
  };

  const submitReport = async (e) => {
    e.preventDefault();
    const saved = await run(
      () => updateAudit(audit.id, { ...audit, ...reporting }), null);
    if (!saved) return;
    const moved = await run(
      () => advanceAudit({ ...audit, ...reporting }, 'Reported'),
      `${audit.audit_code} reported.`);
    if (moved) setReporting(null);
  };

  const move = (to) => run(() => advanceAudit(audit, to), `${audit.audit_code} is now ${to}.`);

  const selectClass = 'h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm';

  return (
    <ISOShell
      title={`${audit.audit_code}: ${audit.title}`}
      description={standard ? `Against ${standard.code}` : 'Not tied to one standard'}
    >
      <div className="space-y-6 animate-in fade-in duration-300 pb-10">
        <WriteFailure error={failure} />

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricTile label="Status" value={audit.status} token="--primary" />
          <MetricTile
            label="Clauses examined" value={`${examined} / ${scope.length}`}
            hint={scope.length ? 'Every one needs a result before the audit reports' : 'No scope yet'}
            token={scope.length && examined === scope.length ? '--success' : '--warning'}
          />
          <MetricTile
            label="Findings raised" value={raised.length}
            hint={`${raised.filter((f) => f.finding_type === 'Major nonconformity').length} major`}
          />
          <MetricTile
            label="Type" value={audit.audit_type}
            hint={audit.audit_type === 'Internal'
              ? 'Counts towards clause coverage'
              : 'Does not count towards internal audit coverage'}
            token={audit.audit_type === 'Internal' ? '--success' : '--muted-foreground'}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="panel-elevation lg:col-span-1">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4 flex flex-row items-center justify-between">
              <CardTitle className="text-lg">The audit</CardTitle>
              <AuditStatusBadge status={audit.status} />
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <DetailField label="Number">
                <span className="font-mono">{audit.audit_code}</span>
              </DetailField>
              <DetailField label="Scope">{audit.scope}</DetailField>
              <DetailField label="Criteria">{audit.criteria}</DetailField>
              <div className="grid grid-cols-2 gap-4">
                <DetailField label="Lead auditor">{audit.lead_auditor_name}</DetailField>
                <DetailField label="Department">{audit.department}</DetailField>
                <DetailField label="Planned">{audit.planned_start}</DetailField>
                <DetailField label="Planned end">{audit.planned_end}</DetailField>
                <DetailField label="Started">{audit.actual_start}</DetailField>
                <DetailField label="Finished">{audit.actual_end}</DetailField>
                <DetailField label="Report issued">{audit.report_issued_date}</DetailField>
                <DetailField label="Closed">{audit.closed_date}</DetailField>
              </div>
              <DetailField label="Conclusion">{audit.conclusion}</DetailField>

              <div className="pt-2 border-t border-[hsl(var(--border))] space-y-3">
                <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                  Move this audit
                </p>
                {nextAuditStatuses(audit.status).length === 0 ? (
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    A {String(audit.status).toLowerCase()} audit is final.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {nextAuditStatuses(audit.status).map((s) => (
                      <Button key={s} size="sm" variant="outline" disabled={busy}
                        onClick={() => (s === 'Reported'
                          ? setReporting({
                            ...blankConclusion(),
                            conclusion: audit.conclusion || '',
                            report_issued_date: new Date().toISOString().slice(0, 10),
                          })
                          : move(s))}>
                        {s}
                      </Button>
                    ))}
                  </div>
                )}
                {nextAuditStatuses(audit.status).includes('Reported') && !reportGate.ok ? (
                  <GateNotice reason={reportGate.reason} />
                ) : null}
                {nextAuditStatuses(audit.status).includes('Closed') && !closeGate.ok ? (
                  <GateNotice reason={closeGate.reason} />
                ) : null}

                {reporting ? (
                  <form onSubmit={submitReport} className="space-y-3 pt-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium" htmlFor="rep-conclusion">
                        Audit conclusion
                      </label>
                      <Textarea id="rep-conclusion" rows={4} value={reporting.conclusion}
                        onChange={(e) => setReporting(
                          (r) => ({ ...r, conclusion: e.target.value }))}
                        placeholder="Whether the management system conforms, and what was found." />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium" htmlFor="rep-date">
                        Report issued
                      </label>
                      <Input id="rep-date" type="date" value={reporting.report_issued_date}
                        onChange={(e) => setReporting(
                          (r) => ({ ...r, report_issued_date: e.target.value }))} />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setReporting(null)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={busy}>Issue the report</Button>
                    </div>
                  </form>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="panel-elevation lg:col-span-2">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4 flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="text-lg">Scope and results</CardTitle>
                <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                  Every clause in scope needs a result before the audit reports. An
                  auditor may not audit their own work (ISO 19011).
                </p>
              </div>
              {!terminal ? (
                <Button size="sm" variant="outline" onClick={() => setPicking((p) => !p)}>
                  <Plus className="w-4 h-4 mr-2" /> Add clauses
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="p-0">
              {picking ? (
                <form onSubmit={submitScope}
                  className="p-5 border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/30 space-y-3">
                  {available.length === 0 ? (
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">
                      Every clause of this standard is already in scope.
                    </p>
                  ) : (
                    <div className="max-h-64 overflow-y-auto space-y-1 pr-2">
                      {available.map((c) => (
                        <label key={c.id}
                          className="flex items-start gap-3 text-sm p-2 rounded hover:bg-[hsl(var(--secondary))]/50">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={picked.includes(c.id)}
                            onChange={(e) => setPicked((p) => (e.target.checked
                              ? [...p, c.id] : p.filter((id) => id !== c.id)))}
                          />
                          <span>
                            <span className="font-mono text-xs mr-2">{c.clause_ref}</span>
                            {c.title}
                            {c.owner_name ? (
                              <span className="text-xs text-[hsl(var(--muted-foreground))]">
                                {' '}· owner {c.owner_name}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                  {!independence.ok ? <GateNotice reason={independence.reason} /> : null}
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline"
                      onClick={() => { setPicking(false); setPicked([]); }}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={busy || !picked.length || !independence.ok}>
                      Add to scope
                    </Button>
                  </div>
                </form>
              ) : null}

              {scope.length === 0 ? (
                <p className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                  Nothing is in this audit&apos;s scope yet. An audit that examined
                  nothing has nothing to report.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="data-grid-table w-full">
                    <thead>
                      <tr>
                        <th className="data-grid-th">Clause</th>
                        <th className="data-grid-th">Title</th>
                        <th className="data-grid-th">Register status</th>
                        <th className="data-grid-th">Result</th>
                        <th className="data-grid-th">Examined</th>
                        <th className="data-grid-th text-right">Record</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scope.map((row) => (
                        <tr key={row.id} className="border-b border-[hsl(var(--border))] last:border-0">
                          <td className="data-grid-td font-mono text-xs">{row.clause_ref}</td>
                          <td className="data-grid-td">{row.clause?.title}</td>
                          <td className="data-grid-td">
                            <ClauseStatusBadge clause={row.clause} />
                          </td>
                          <td className="data-grid-td text-xs">
                            <span className={row.result === 'Nonconformant'
                              ? 'text-[hsl(var(--destructive))] font-medium' : ''}>
                              {row.result}
                            </span>
                          </td>
                          <td className="data-grid-td text-xs">{row.examined_on || ''}</td>
                          <td className="data-grid-td text-right">
                            {!terminal ? (
                              <div className="flex gap-1 justify-end">
                                <Button size="sm" variant="outline" disabled={busy}
                                  onClick={() => {
                                    setFailure(null);
                                    setRecording(row);
                                    setResult({
                                      result: row.result === 'Not examined' ? 'Conformant' : row.result,
                                      evidence_seen: row.evidence_seen || '',
                                      examined_on: row.examined_on
                                        || new Date().toISOString().slice(0, 10),
                                    });
                                  }}>
                                  Result
                                </Button>
                                <Button size="sm" variant="ghost" disabled={busy}
                                  onClick={() => run(() => removeFromScope(row.id),
                                    `Clause ${row.clause_ref} removed from scope.`)}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {recording ? (
                <form onSubmit={submitResult}
                  className="p-5 border-t border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/30 space-y-3">
                  <p className="text-sm font-medium">
                    Clause {recording.clause_ref}: {recording.clause?.title}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium" htmlFor="cov-result">Result</label>
                      <select id="cov-result" className={selectClass} value={result.result}
                        onChange={(e) => setResult((r) => ({ ...r, result: e.target.value }))}>
                        {COVERAGE_RESULTS.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium" htmlFor="cov-date">Examined on</label>
                      <Input id="cov-date" type="date" value={result.examined_on}
                        onChange={(e) => setResult((r) => ({ ...r, examined_on: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium" htmlFor="cov-evidence">
                        Evidence seen
                      </label>
                      <Input id="cov-evidence" value={result.evidence_seen}
                        onChange={(e) => setResult(
                          (r) => ({ ...r, evidence_seen: e.target.value }))}
                        placeholder="Records sampled, people interviewed" />
                    </div>
                  </div>
                  {result.result === 'Nonconformant' ? (
                    <GateNotice reason="Recording a nonconformity here does not raise the finding. Raise it from the findings register so it carries a number, an owner and a due date." />
                  ) : null}
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setRecording(null)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={busy}>Record result</Button>
                  </div>
                </form>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <Card className="panel-elevation">
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4 flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-lg">Findings raised by this audit</CardTitle>
            <Button size="sm" variant="outline"
              onClick={() => navigate(`${BASE}/findings?audit=${audit.id}`)}>
              Raise a finding
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {raised.length === 0 ? (
              <p className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                This audit has raised no findings.
              </p>
            ) : (
              <table className="data-grid-table w-full">
                <thead>
                  <tr>
                    <th className="data-grid-th">Finding</th>
                    <th className="data-grid-th">Title</th>
                    <th className="data-grid-th">Type</th>
                    <th className="data-grid-th">Due</th>
                    <th className="data-grid-th">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {raised.map((f) => (
                    <tr key={f.id}
                      className="border-b border-[hsl(var(--border))] last:border-0 cursor-pointer hover:bg-[hsl(var(--secondary))]/50"
                      onClick={() => navigate(`${BASE}/findings/${f.id}`)}>
                      <td className="data-grid-td font-mono text-xs">{f.finding_code}</td>
                      <td className="data-grid-td">{f.title}</td>
                      <td className="data-grid-td"><FindingTypeBadge type={f.finding_type} /></td>
                      <td className="data-grid-td text-xs">{f.due_date || 'Not set'}</td>
                      <td className="data-grid-td"><FindingStatusBadge status={f.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card className="panel-elevation">
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
            <CardTitle className="text-lg">History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {log.length === 0 ? (
              <p className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                Nothing recorded against this audit yet.
              </p>
            ) : log.slice(0, 40).map((a) => (
              <div key={a.id}
                className="p-3 px-4 border-b border-[hsl(var(--border))] last:border-0 flex items-center justify-between gap-4">
                <p className="text-sm min-w-0">{a.action}</p>
                <span className="text-xs text-[hsl(var(--muted-foreground))] shrink-0">
                  {a.created_at ? format(new Date(a.created_at), 'd MMM yyyy HH:mm') : ''}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          As at {format(today, 'd MMM yyyy')}.
        </p>
      </div>
    </ISOShell>
  );
}
