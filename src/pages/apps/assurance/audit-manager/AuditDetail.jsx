import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ClipboardCheck, FileWarning } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import {
  DEFAULT_FINDING_TYPE_BY_CRITICALITY,
  FINDING_TYPES,
  RESPONSE_RESULTS,
  canAdvanceAudit,
  checklistProgress,
  criticalAnswersWithoutFindings,
  isAnswered,
  nextAuditStatuses,
  unansweredItems,
  toDateOnlyString,
} from '@/lib/auditManagement';
import { AuditShell, BASE } from './components/AuditShell';
import {
  DetailField, EmptyState, ErrorState, GateNotice, Loading, MetricTile, SchemaNotice, WriteFailure,
} from './components/SharedComponents';
import {
  AuditStatusBadge, ChecklistProgressBar, CriticalityBadge, FindingStatusBadge,
  FindingTypeBadge, ResultBadge, StopWorkBadge,
} from './components/AuditBadges';
import {
  auditAcceptsWork, auditAsItWouldBeSaved, validateFinding, validateResponse,
} from './utils/auditPayload';
import { useAuditManagement } from './hooks/useAuditManagement';

/**
 * AS10 — one audit, worked.
 *
 * This is where the checklist is answered and where a failed answer
 * becomes a finding. The two rules that make the app worth having live
 * on this page: the audit will not report while an item is unanswered,
 * and it will not report while a CRITICAL item answered Nonconformant
 * has no finding against it. Both refusals name the items.
 */

const blankAnswer = (response) => ({
  result: response?.result === 'Not examined' ? 'Conformant' : response?.result || 'Conformant',
  evidence: response?.evidence || '',
  note: response?.note || '',
  examined_on: response?.examined_on || toDateOnlyString(new Date()),
});

const blankFinding = (audit, response, item) => ({
  audit_id: audit?.id || '',
  response_id: response?.id || null,
  finding_type: item
    ? (DEFAULT_FINDING_TYPE_BY_CRITICALITY[item.criticality] || 'Minor nonconformity')
    : 'Minor nonconformity',
  stop_work: false,
  title: item ? item.question : '',
  description: '',
  objective_evidence: response?.evidence || '',
  requirement_ref: item?.reference || '',
  department: audit?.department || '',
  site: audit?.site || '',
  owner_name: '',
  due_date: '',
  correction: '',
});

export default function AuditDetail() {
  const { auditId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    audits, programmes, templates, itemsFor, responsesFor, findingsForAudit,
    findingsForResponse, activityFor, loading, error, refresh, hasAs10Schema,
    openChecklist, recordAnswer, advanceAudit, updateAudit, createFinding,
  } = useAuditManagement();

  const [answering, setAnswering] = useState(null);
  const [answer, setAnswer] = useState({});
  const [answerErrors, setAnswerErrors] = useState({});
  const [raising, setRaising] = useState(null);
  const [findingErrors, setFindingErrors] = useState({});
  const [reporting, setReporting] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);
  const today = new Date();

  const audit = useMemo(() => audits.find((a) => a.id === auditId) || null, [audits, auditId]);
  const template = useMemo(
    () => (audit?.template_id ? templates.find((t) => t.id === audit.template_id) || null : null),
    [templates, audit]);
  const items = useMemo(
    () => (audit?.template_id ? itemsFor(audit.template_id) : []), [audit, itemsFor]);
  const responses = useMemo(
    () => (audit ? responsesFor(audit.id) : []), [audit, responsesFor]);
  const findings = useMemo(
    () => (audit ? findingsForAudit(audit.id) : []), [audit, findingsForAudit]);
  const programme = useMemo(
    () => (audit?.programme_id ? programmes.find((p) => p.id === audit.programme_id) || null : null),
    [programmes, audit]);
  const log = useMemo(() => (audit ? activityFor(audit.id) : []), [audit, activityFor]);

  const progress = useMemo(() => checklistProgress(items, responses), [items, responses]);
  const byItem = useMemo(() => new Map(responses.map((r) => [r.item_id, r])), [responses]);
  const outstanding = useMemo(() => unansweredItems(items, responses), [items, responses]);
  const uncovered = useMemo(
    () => criticalAnswersWithoutFindings(items, responses, findings),
    [items, responses, findings]);

  // The gate is evaluated against the audit as the report form WOULD
  // save it. AS10 evaluated it against the saved audit, whose conclusion
  // is only ever written by the button that gate disabled, so no audit
  // could ever be reported (AS13).
  const reportGate = useMemo(
    () => (audit
      ? canAdvanceAudit(auditAsItWouldBeSaved(audit, reporting), 'Reported',
        { items, responses, findings })
      : { ok: false }),
    [audit, reporting, items, responses, findings]);
  const closeGate = useMemo(
    () => (audit ? canAdvanceAudit(audit, 'Closed', { findings }) : { ok: false }),
    [audit, findings]);

  if (loading) return <AuditShell><Loading label="Loading the audit..." /></AuditShell>;
  if (error) return <AuditShell><ErrorState error={error} onRetry={refresh} /></AuditShell>;
  if (!hasAs10Schema) return <AuditShell><SchemaNotice /></AuditShell>;

  if (!audit) {
    return (
      <AuditShell title="Audit not found">
        <EmptyState
          icon={<ClipboardCheck className="w-12 h-12" />}
          title="No such audit"
          description="This audit is not in your organization's register. It may have been deleted, or the link may be wrong."
          action={<Button onClick={() => navigate(`${BASE}/audits`)}>Back to the register</Button>}
        />
      </AuditShell>
    );
  }

  // Reported locks the checklist and the findings list as well as Closed
  // and Cancelled: after the report is issued they ARE the report (AS13).
  const locked = !auditAcceptsWork(audit);

  const run = async (fn, message) => {
    setFailure(null);
    setBusy(true);
    const result = await fn();
    setBusy(false);
    if (!result.success) { setFailure(result.error); return false; }
    if (message) toast({ description: message });
    return true;
  };

  const submitAnswer = async (e) => {
    e.preventDefault();
    setFailure(null);
    const errs = validateResponse(answer);
    setAnswerErrors(errs);
    if (Object.keys(errs).length) return;
    const ok = await run(() => recordAnswer(answering.response, answer),
      `Item ${answering.item.item_no} recorded ${answer.result}.`);
    if (ok) { setAnswering(null); setAnswerErrors({}); }
  };

  const submitFinding = async (e) => {
    e.preventDefault();
    setFailure(null);
    const errs = validateFinding(raising);
    setFindingErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const result = await createFinding(raising);
    setBusy(false);
    if (!result.success) { setFailure(result.error); return; }
    toast({
      title: `${result.data.finding_code} raised`,
      description: result.data.stop_work
        ? 'Work stopped. The immediate correction is on the finding.'
        : 'It is on the findings register with a number and an owner.',
    });
    setRaising(null);
    setFindingErrors({});
  };

  const submitReport = async (e) => {
    e.preventDefault();
    const draft = auditAsItWouldBeSaved(audit, reporting);
    const saved = await run(() => updateAudit(audit.id, draft), null);
    if (!saved) return;
    const moved = await run(() => advanceAudit(draft, 'Reported'),
      `${audit.audit_code} reported.`);
    if (moved) setReporting(null);
  };

  const submitCancellation = async (e) => {
    e.preventDefault();
    const ok = await run(() => advanceAudit(audit, 'Cancelled', cancelling),
      `${audit.audit_code} cancelled.`);
    if (ok) setCancelling(null);
  };

  const move = (to) => {
    if (to === 'Reported') {
      setReporting({
        conclusion: audit.conclusion || '',
        report_issued_date: toDateOnlyString(new Date()),
      });
      return;
    }
    if (to === 'Cancelled') { setCancelling({ cancellation_reason: '' }); return; }
    run(() => advanceAudit(audit, to), `${audit.audit_code} is now ${to}.`);
  };

  const selectClass = 'h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm';

  return (
    <AuditShell
      title={`${audit.audit_code}: ${audit.title}`}
      description={template ? `Against ${template.code}: ${template.title}` : 'Ad-hoc audit, no checklist'}
    >
      <div className="space-y-6 animate-in fade-in duration-300 pb-10">
        <WriteFailure error={failure} />

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricTile label="Status" value={audit.status} token="--primary" />
          <MetricTile
            label="Checklist answered"
            value={progress.total ? `${progress.answered} / ${progress.total}` : 'No checklist'}
            hint={progress.total ? `${progress.nonconformant} nonconformant` : 'Ad-hoc audit'}
            token={progress.total && progress.answered === progress.total ? '--success' : '--warning'}
          />
          <MetricTile
            label="Findings raised" value={findings.length}
            hint={`${findings.filter((f) => f.stop_work).length} stopped work`}
            token={findings.some((f) => f.stop_work) ? '--destructive' : '--primary'}
          />
          <MetricTile
            label="Not applicable" value={progress.notApplicable}
            hint="Each carries its reason"
            token="--muted-foreground"
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
              <DetailField label="Programme">
                {programme ? `${programme.programme_year}: ${programme.title}` : null}
              </DetailField>
              <DetailField label="Scope">{audit.scope}</DetailField>
              <DetailField label="Criteria">{audit.criteria}</DetailField>
              <div className="grid grid-cols-2 gap-4">
                <DetailField label="Type">{audit.audit_type}</DetailField>
                <DetailField label="Site">{audit.site}</DetailField>
                <DetailField label="Department">{audit.department}</DetailField>
                <DetailField label="Contractor">{audit.contractor}</DetailField>
                <DetailField label="Lead auditor">{audit.lead_auditor_name}</DetailField>
                <DetailField label="Auditee">{audit.auditee_name}</DetailField>
                <DetailField label="Team">{audit.audit_team}</DetailField>
                <DetailField label="Planned">{audit.planned_start}</DetailField>
                <DetailField label="Planned end">{audit.planned_end}</DetailField>
                <DetailField label="Started">{audit.actual_start}</DetailField>
                <DetailField label="Finished">{audit.actual_end}</DetailField>
                <DetailField label="Report issued">{audit.report_issued_date}</DetailField>
              </div>
              <DetailField label="Conclusion">{audit.conclusion}</DetailField>
              {audit.cancellation_reason ? (
                <DetailField label="Cancelled because">{audit.cancellation_reason}</DetailField>
              ) : null}

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
                        onClick={() => move(s)}>
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
                      <label className="text-xs font-medium" htmlFor="rp-conclusion">
                        Audit conclusion
                      </label>
                      <Textarea id="rp-conclusion" rows={4} value={reporting.conclusion}
                        onChange={(e) => setReporting((r) => ({ ...r, conclusion: e.target.value }))}
                        placeholder="What the audit found, and what it means for the area audited." />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium" htmlFor="rp-date">Report issued</label>
                      <Input id="rp-date" type="date" value={reporting.report_issued_date}
                        onChange={(e) => setReporting(
                          (r) => ({ ...r, report_issued_date: e.target.value }))} />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setReporting(null)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={busy || !reportGate.ok}>
                        Issue the report
                      </Button>
                    </div>
                  </form>
                ) : null}

                {cancelling ? (
                  <form onSubmit={submitCancellation} className="space-y-3 pt-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium" htmlFor="cx-reason">
                        Why is this audit not being done?
                      </label>
                      <Textarea id="cx-reason" rows={3} value={cancelling.cancellation_reason}
                        onChange={(e) => setCancelling({ cancellation_reason: e.target.value })}
                        placeholder="An audit that quietly disappears from the programme is why a programme cannot be trusted." />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setCancelling(null)}>
                        Keep it
                      </Button>
                      <Button type="submit" variant="outline" disabled={busy}>
                        Cancel the audit
                      </Button>
                    </div>
                  </form>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="panel-elevation lg:col-span-2">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4 flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="text-lg">The checklist</CardTitle>
                <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                  {locked
                    ? 'This audit is no longer open, so its answers are the record and are not changed. Its findings are still worked to closure on their own pages.'
                    : 'Every item needs an answer before this audit can report, and "not applicable" is an answer that carries a reason.'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <ChecklistProgressBar progress={progress} />
                {!locked && audit.template_id ? (
                  <Button size="sm" variant="outline" disabled={busy}
                    onClick={() => run(() => openChecklist(audit),
                      'The checklist is up to date with its protocol.')}>
                    Sync protocol
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {!audit.template_id ? (
                <p className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                  This is an ad-hoc audit with no checklist. Findings can still be raised
                  against it below.
                </p>
              ) : items.length === 0 ? (
                <p className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                  That checklist has no questions in it.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="data-grid-table w-full">
                    <thead>
                      <tr>
                        <th className="data-grid-th">Item</th>
                        <th className="data-grid-th">Question</th>
                        <th className="data-grid-th">Criticality</th>
                        <th className="data-grid-th">Result</th>
                        <th className="data-grid-th">Finding</th>
                        <th className="data-grid-th text-right">Answer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((row) => {
                        const response = byItem.get(row.id);
                        const raised = response ? findingsForResponse(response.id) : [];
                        const needsFinding = response?.result === 'Nonconformant'
                          && row.criticality === 'Critical'
                          && !raised.some((f) => f.status !== 'Voided');
                        return (
                          <tr key={row.id} className="border-b border-[hsl(var(--border))] last:border-0">
                            <td className="data-grid-td font-mono text-xs">{row.item_no}</td>
                            <td className="data-grid-td">
                              {row.question}
                              {response?.note ? (
                                <span className="block text-xs text-[hsl(var(--muted-foreground))]">
                                  {response.note}
                                </span>
                              ) : null}
                              {response?.evidence ? (
                                <span className="block text-xs text-[hsl(var(--muted-foreground))]">
                                  Evidence: {response.evidence}
                                </span>
                              ) : null}
                            </td>
                            <td className="data-grid-td">
                              <CriticalityBadge criticality={row.criticality} />
                            </td>
                            <td className="data-grid-td">
                              <ResultBadge result={response?.result} />
                            </td>
                            <td className="data-grid-td text-xs">
                              {raised.filter((f) => f.status !== 'Voided').map((f) => (
                                <button key={f.id} type="button"
                                  className="text-[hsl(var(--primary))] hover:underline font-mono mr-2"
                                  onClick={() => navigate(`${BASE}/findings/${f.id}`)}>
                                  {f.finding_code}
                                </button>
                              ))}
                              {needsFinding ? (
                                <span className="text-[hsl(var(--destructive))] font-medium">
                                  Needs one
                                </span>
                              ) : null}
                            </td>
                            <td className="data-grid-td text-right">
                              {!locked ? (
                                <div className="flex gap-1 justify-end">
                                  <Button size="sm" variant="outline" disabled={busy || !response}
                                    onClick={() => {
                                      setFailure(null);
                                      setAnswering({ item: row, response });
                                      setAnswer(blankAnswer(response));
                                    }}>
                                    {response && isAnswered(response) ? 'Change' : 'Answer'}
                                  </Button>
                                  {response?.result === 'Nonconformant' ? (
                                    <Button size="sm" disabled={busy}
                                      onClick={() => {
                                        setFailure(null);
                                        setAnswering(null);
                                        setRaising(blankFinding(audit, response, row));
                                      }}>
                                      Raise a finding
                                    </Button>
                                  ) : null}
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {answering ? (
                <form onSubmit={submitAnswer}
                  className="p-5 border-t border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/30 space-y-3">
                  <p className="text-sm font-medium">
                    Item {answering.item.item_no}: {answering.item.question}
                  </p>
                  {answering.item.guidance ? (
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      {answering.item.guidance}
                    </p>
                  ) : null}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium" htmlFor="an-result">Result</label>
                      <select id="an-result" className={selectClass} value={answer.result}
                        onChange={(e) => setAnswer((a) => ({ ...a, result: e.target.value }))}>
                        {RESPONSE_RESULTS.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium" htmlFor="an-date">Examined on</label>
                      <Input id="an-date" type="date" value={answer.examined_on}
                        onChange={(e) => setAnswer((a) => ({ ...a, examined_on: e.target.value }))} />
                      {answerErrors.examined_on ? (
                        <p className="text-xs text-[hsl(var(--destructive))]">{answerErrors.examined_on}</p>
                      ) : null}
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium" htmlFor="an-evidence">
                        Evidence seen
                      </label>
                      <Input id="an-evidence" value={answer.evidence}
                        onChange={(e) => setAnswer((a) => ({ ...a, evidence: e.target.value }))}
                        placeholder="Records sampled, people spoken to, what was observed" />
                      {answerErrors.evidence ? (
                        <p className="text-xs text-[hsl(var(--destructive))]">{answerErrors.evidence}</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium" htmlFor="an-note">
                      {answer.result === 'Not applicable'
                        ? 'Why does this item not apply?'
                        : 'Note'}
                    </label>
                    <Textarea id="an-note" rows={2} value={answer.note}
                      onChange={(e) => setAnswer((a) => ({ ...a, note: e.target.value }))}
                      placeholder={answer.result === 'Not applicable'
                        ? '"Not applicable" is an answer, and an answer has a reason.'
                        : 'Anything the next reader needs.'} />
                    {answerErrors.note ? (
                      <p className="text-xs text-[hsl(var(--destructive))]">{answerErrors.note}</p>
                    ) : null}
                  </div>
                  {answer.result === 'Nonconformant' && answering.item.criticality === 'Critical' ? (
                    <GateNotice reason="This is a critical question. Answering it Nonconformant means a finding has to be raised against it before the audit can be reported." />
                  ) : null}
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setAnswering(null)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={busy}>Record answer</Button>
                  </div>
                </form>
              ) : null}
            </CardContent>
          </Card>
        </div>

        {(outstanding.length || uncovered.length) && !locked ? (
          <Card className="panel-elevation">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
              <CardTitle className="text-lg">What is left before this audit can report</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-3">
              {outstanding.length ? (
                <p className="text-sm">
                  <span className="font-medium">{outstanding.length} unanswered: </span>
                  {outstanding.map((i) => i.item_no).join(', ')}
                </p>
              ) : null}
              {uncovered.length ? (
                <p className="text-sm">
                  <span className="font-medium text-[hsl(var(--destructive))]">
                    {uncovered.length} critical nonconformance
                    {uncovered.length === 1 ? '' : 's'} with no finding:{' '}
                  </span>
                  {uncovered.map((i) => i.item_no).join(', ')}
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        <Card className="panel-elevation">
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4 flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-lg">Findings from this audit</CardTitle>
            {!locked ? (
              <Button size="sm" variant="outline" disabled={busy}
                onClick={() => {
                  setFailure(null);
                  setRaising(raising ? null : blankFinding(audit, null, null));
                }}>
                <FileWarning className="w-4 h-4 mr-2" /> Raise a finding
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="p-0">
            {raising ? (
              <form onSubmit={submitFinding}
                className="p-5 border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/30 space-y-3">
                {raising.response_id ? (
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    Raised against a checklist answer, so the audit knows it is covered.
                  </p>
                ) : null}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-6 space-y-1.5">
                    <label className="text-xs font-medium" htmlFor="fd-title">The finding</label>
                    <Input id="fd-title" value={raising.title}
                      onChange={(e) => setRaising((f) => ({ ...f, title: e.target.value }))} />
                    {findingErrors.title ? (
                      <p className="text-xs text-[hsl(var(--destructive))]">{findingErrors.title}</p>
                    ) : null}
                  </div>
                  <div className="md:col-span-3 space-y-1.5">
                    <label className="text-xs font-medium" htmlFor="fd-type">Type</label>
                    <select id="fd-type" className={selectClass} value={raising.finding_type}
                      onChange={(e) => setRaising((f) => ({ ...f, finding_type: e.target.value }))}>
                      {FINDING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="md:col-span-3 space-y-1.5">
                    <label className="text-xs font-medium" htmlFor="fd-due">Due date</label>
                    <Input id="fd-due" type="date" value={raising.due_date}
                      onChange={(e) => setRaising((f) => ({ ...f, due_date: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium" htmlFor="fd-evidence">
                    Objective evidence
                  </label>
                  <Textarea id="fd-evidence" rows={2} value={raising.objective_evidence}
                    onChange={(e) => setRaising(
                      (f) => ({ ...f, objective_evidence: e.target.value }))}
                    placeholder="What was seen, where, and when." />
                  {findingErrors.objective_evidence ? (
                    <p className="text-xs text-[hsl(var(--destructive))]">
                      {findingErrors.objective_evidence}
                    </p>
                  ) : null}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium" htmlFor="fd-owner">Owner</label>
                    <Input id="fd-owner" value={raising.owner_name}
                      onChange={(e) => setRaising((f) => ({ ...f, owner_name: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium" htmlFor="fd-req">Requirement</label>
                    <Input id="fd-req" value={raising.requirement_ref}
                      onChange={(e) => setRaising(
                        (f) => ({ ...f, requirement_ref: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium" htmlFor="fd-stop">Did work stop?</label>
                    <select id="fd-stop" className={selectClass}
                      value={raising.stop_work ? 'yes' : 'no'}
                      onChange={(e) => setRaising(
                        (f) => ({ ...f, stop_work: e.target.value === 'yes' }))}>
                      <option value="no">No</option>
                      <option value="yes">Yes, work was stopped</option>
                    </select>
                  </div>
                </div>
                {raising.stop_work ? (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium" htmlFor="fd-correction">
                      What was done about it, at the time
                    </label>
                    <Textarea id="fd-correction" rows={2} value={raising.correction}
                      onChange={(e) => setRaising((f) => ({ ...f, correction: e.target.value }))}
                      placeholder="Work stopped at 09:45 and the guard refitted before restart." />
                    {findingErrors.correction ? (
                      <p className="text-xs text-[hsl(var(--destructive))]">{findingErrors.correction}</p>
                    ) : null}
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      Imminent danger does not wait for the corrective action cycle, so this
                      is recorded now rather than at closure.
                    </p>
                  </div>
                ) : null}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium" htmlFor="fd-desc">Description</label>
                  <Textarea id="fd-desc" rows={2} value={raising.description}
                    onChange={(e) => setRaising((f) => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setRaising(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={busy}>Raise finding</Button>
                </div>
              </form>
            ) : null}

            {findings.length === 0 ? (
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
                  {findings.map((f) => (
                    <tr key={f.id}
                      className="border-b border-[hsl(var(--border))] last:border-0 cursor-pointer hover:bg-[hsl(var(--secondary))]/50"
                      onClick={() => navigate(`${BASE}/findings/${f.id}`)}>
                      <td className="data-grid-td font-mono text-xs">{f.finding_code}</td>
                      <td className="data-grid-td">
                        {f.title}
                        <span className="ml-2"><StopWorkBadge finding={f} /></span>
                      </td>
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
    </AuditShell>
  );
}
