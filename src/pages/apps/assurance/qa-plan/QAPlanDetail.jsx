import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  ClipboardList, FileWarning, Plus, Trash2,
} from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import {
  CHECKPOINT_STATUSES,
  POINT_TYPES,
  RESPONSIBLE_PARTIES,
  canAdvancePlan,
  canClosePlan,
  isBlockingPoint,
  isCheckpointOverdue,
  isResolved,
  nextPlanStatuses,
  planProgress,
  toDateOnlyString,
} from '@/lib/qualityAssurance';
import { needsDecisionReason, planLockReason, validateCheckpoint } from './utils/qaPayload';
import { QAPlanShell, BASE } from './components/QAPlanShell';
import {
  ConfirmDelete, DetailField, EmptyState, ErrorState, GateNotice, Loading, MetricTile,
  SchemaNotice, WriteFailure,
} from './components/SharedComponents';
import {
  CheckpointStatusBadge, HoldPointBadge, NcrStatusBadge, PlanStatusBadge,
  PointTypeBadge, ProgressBar, SeverityBadge,
} from './components/QABadges';
import { useQualityAssurance } from './hooks/useQualityAssurance';

/**
 * AS7 — one quality plan, and the inspection and test plan under it.
 *
 * The page this replaces read `useParams().id` while the route declared
 * `:qaPlanId`, so `id` was always undefined and
 *
 *   const plan = qaPlans.find(p => p.id === (id || 'QAP-2026-001')) || qaPlans[0];
 *
 * fell through to the first invented plan. Every row in the register
 * opened the same plan, and the ITP under it showed the two checkpoints
 * from the data file whichever plan you thought you were looking at.
 * Both buttons on the page — Add Checkpoint and View — toasted a
 * dialog that does not exist.
 */

/** The Remarks label suffix: which results must say why. */
const decisionReasonLabel = (checkpoint, status) => {
  if (!needsDecisionReason(checkpoint, status)) return '';
  return status === 'Waived'
    ? ': why it is being waived (required)'
    : ': why this hold point does not apply (required)';
};

const blankRow = () => ({
  item_no: '',
  title: '',
  point_type: 'Review point',
  acceptance_criteria: '',
  responsible_party: 'Company',
  reference_document: '',
  planned_date: '',
});

const blankDecision = () => ({
  status: 'Passed', result_date: '', verifier_name: '', remarks: '',
});

export default function QAPlanDetail() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    plans, loading, error, refresh, hasAs7Schema,
    checkpointsFor, ncrsForPlan, activityFor,
    addCheckpoints, decideCheckpoint, deleteCheckpoint, advancePlan,
  } = useQualityAssurance();

  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState(blankRow());
  const [rowErrors, setRowErrors] = useState({});
  const [deciding, setDeciding] = useState(null);
  const [decision, setDecision] = useState(blankDecision());
  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null);

  const plan = useMemo(() => plans.find((p) => p.id === planId) || null, [plans, planId]);
  const checkpoints = useMemo(
    () => (plan ? checkpointsFor(plan.id) : []), [plan, checkpointsFor]);
  const ncrs = useMemo(() => (plan ? ncrsForPlan(plan.id) : []), [plan, ncrsForPlan]);
  const log = useMemo(() => (plan ? activityFor(plan.id) : []), [plan, activityFor]);
  const progress = useMemo(() => planProgress(checkpoints), [checkpoints]);
  const closure = useMemo(
    () => (plan ? canClosePlan(plan, { checkpoints, ncrs }) : { ok: false }),
    [plan, checkpoints, ncrs]);

  if (loading) return <QAPlanShell><Loading label="Loading the plan..." /></QAPlanShell>;
  if (error) return <QAPlanShell><ErrorState error={error} onRetry={refresh} /></QAPlanShell>;
  if (!hasAs7Schema) return <QAPlanShell><SchemaNotice /></QAPlanShell>;

  if (!plan) {
    return (
      <QAPlanShell title="Plan not found">
        <EmptyState
          icon={<ClipboardList className="w-12 h-12" />}
          title="No such quality plan"
          description="This plan is not in your organization's register. It may have been deleted, or the link may be wrong. This page used to show a different plan instead of saying so."
          action={<Button onClick={() => navigate(`${BASE}/register`)}>Back to the register</Button>}
        />
      </QAPlanShell>
    );
  }

  // AS13: a closed, superseded or cancelled plan is a record. Its items
  // and results are locked here and refused by the hook as well.
  const locked = planLockReason(plan);

  const submitCheckpoint = async (e) => {
    e.preventDefault();
    setFailure(null);
    const errs = validateCheckpoint(newRow);
    if (checkpoints.some((c) => String(c.item_no) === String(newRow.item_no).trim())) {
      errs.item_no = `Item ${newRow.item_no} already exists in this plan.`;
    }
    setRowErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    const result = await addCheckpoints(plan.id,
      [{ ...newRow, sequence: checkpoints.length + 1 }]);
    setBusy(false);
    if (!result.success) { setFailure(result.error); return; }
    toast({ description: `Item ${newRow.item_no} added to ${plan.plan_code}.` });
    setNewRow(blankRow());
    setAdding(false);
  };

  const openDecision = (checkpoint) => {
    setFailure(null);
    setDeciding(checkpoint);
    setDecision({
      status: 'Passed',
      result_date: toDateOnlyString(new Date()),
      verifier_name: '',
      remarks: '',
    });
  };

  const submitDecision = async (e) => {
    e.preventDefault();
    setFailure(null);
    if (needsDecisionReason(deciding, decision.status) && !String(decision.remarks || '').trim()) {
      setFailure(decision.status === 'Waived'
        ? 'Say why this point is being waived in Remarks.'
        : 'Say why this hold point does not apply in Remarks. It stops work until released, so setting it aside needs a reason on the record.');
      return;
    }
    setBusy(true);
    const result = await decideCheckpoint(deciding, decision.status, {
      result_date: decision.result_date || null,
      verifier_name: decision.verifier_name || null,
      remarks: decision.remarks || null,
    });
    setBusy(false);
    if (!result.success) { setFailure(result.error); return; }
    toast({
      description: `${deciding.point_type} ${deciding.item_no} marked ${decision.status}.`,
    });
    setDeciding(null);
  };

  const removeCheckpoint = async (checkpoint) => {
    setFailure(null);
    setBusy(true);
    const result = await deleteCheckpoint(checkpoint.id);
    setBusy(false);
    if (!result.success) { setFailure(result.error); return; }
    setRemoving(null);
    toast({ description: `Item ${checkpoint.item_no} removed.` });
  };

  const moveTo = async (to) => {
    setFailure(null);
    const verdict = canAdvancePlan(plan, to, { checkpoints, ncrs });
    if (!verdict.ok) { setFailure(verdict.reason); return; }
    setBusy(true);
    const result = await advancePlan(plan, to);
    setBusy(false);
    if (!result.success) { setFailure(result.error); return; }
    toast({ description: `${plan.plan_code} is now ${to}.` });
  };

  const ordered = [...checkpoints].sort((a, b) => {
    const s = (a.sequence ?? 0) - (b.sequence ?? 0);
    if (s !== 0) return s;
    return String(a.item_no).localeCompare(String(b.item_no), undefined, { numeric: true });
  });

  return (
    <QAPlanShell
      title={`${plan.plan_code}: ${plan.title}`}
      description={plan.scope || 'Quality plan and inspection and test plan'}
    >
      <div className="space-y-6 animate-in fade-in duration-300 pb-10">
        <WriteFailure error={failure} />

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricTile label="Inspection points" value={progress.total}
            hint={progress.percent === null ? 'No ITP yet' : `${progress.percent}% resolved`} />
          <MetricTile label="Hold points outstanding" value={progress.holdPointsOutstanding}
            hint="A hold point stops work until it is verified"
            token={progress.holdPointsOutstanding ? '--destructive' : '--success'} />
          <MetricTile label="Failed" value={progress.failed}
            token={progress.failed ? '--destructive' : '--muted-foreground'}
            hint="A failed inspection is what raises an NCR" />
          <MetricTile label="Open non-conformances"
            value={ncrs.filter((n) => !['Closed', 'Voided'].includes(n.status)).length}
            token="--warning" hint={`${ncrs.length} raised against this plan in total`} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="panel-elevation lg:col-span-1">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4 flex flex-row items-center justify-between">
              <CardTitle className="text-lg">The plan</CardTitle>
              <PlanStatusBadge status={plan.status} />
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <DetailField label="Number">
                <span className="font-mono">{plan.plan_code}</span>
                {plan.revision ? ` rev ${plan.revision}` : ''}
              </DetailField>
              <DetailField label="Scope">{plan.scope}</DetailField>
              <DetailField label="Quality objective">{plan.quality_objective}</DetailField>
              <DetailField label="Description">{plan.description}</DetailField>
              <div className="grid grid-cols-2 gap-4">
                <DetailField label="Department">{plan.department}</DetailField>
                <DetailField label="Discipline">{plan.discipline}</DetailField>
                <DetailField label="Project">{plan.project_ref}</DetailField>
                <DetailField label="Asset">{plan.asset_id}</DetailField>
                <DetailField label="Contractor">{plan.contractor}</DetailField>
                <DetailField label="Progress">
                  <ProgressBar progress={progress} />
                </DetailField>
                <DetailField label="Start">{plan.start_date}</DetailField>
                <DetailField label="End">{plan.end_date}</DetailField>
              </div>

              <div className="pt-2 border-t border-[hsl(var(--border))] space-y-3">
                <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                  Move this plan
                </p>
                {nextPlanStatuses(plan.status).length === 0 ? (
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    A {String(plan.status).toLowerCase()} plan is final.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {nextPlanStatuses(plan.status).map((s) => (
                      <Button key={s} size="sm" variant="outline" disabled={busy}
                        onClick={() => moveTo(s)}>
                        {s}
                      </Button>
                    ))}
                  </div>
                )}
                {nextPlanStatuses(plan.status).includes('Closed') && !closure.ok ? (
                  <GateNotice reason={closure.reason} />
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="panel-elevation lg:col-span-2">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4 flex flex-row items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">Inspection and test plan</CardTitle>
                <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                  Open hold points, failed points of any type and open non-conformances keep this plan open.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <HoldPointBadge progress={progress} />
                {!locked ? (
                  <Button size="sm" variant="outline" onClick={() => setAdding((a) => !a)}>
                    <Plus className="w-4 h-4 mr-2" /> Add item
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {locked ? (
                <div className="p-4 border-b border-[hsl(var(--border))]">
                  <GateNotice reason={locked} />
                </div>
              ) : null}
              {adding && !locked ? (
                <form onSubmit={submitCheckpoint}
                  className="p-5 border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/30 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium" htmlFor="new-item">Item</label>
                      <Input id="new-item" value={newRow.item_no}
                        onChange={(e) => setNewRow((r) => ({ ...r, item_no: e.target.value }))}
                        placeholder="2.1" />
                      {rowErrors.item_no ? (
                        <p className="text-xs text-[hsl(var(--destructive))]">{rowErrors.item_no}</p>
                      ) : null}
                    </div>
                    <div className="md:col-span-2 space-y-1.5">
                      <label className="text-xs font-medium" htmlFor="new-title">
                        Activity or inspection
                      </label>
                      <Input id="new-title" value={newRow.title}
                        onChange={(e) => setNewRow((r) => ({ ...r, title: e.target.value }))} />
                      {rowErrors.title ? (
                        <p className="text-xs text-[hsl(var(--destructive))]">{rowErrors.title}</p>
                      ) : null}
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium" htmlFor="new-type">Intervention</label>
                      <select id="new-type" value={newRow.point_type}
                        onChange={(e) => setNewRow((r) => ({ ...r, point_type: e.target.value }))}
                        className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm">
                        {POINT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2 space-y-1.5">
                      <label className="text-xs font-medium" htmlFor="new-criteria">
                        Acceptance criteria
                        {newRow.point_type === 'Hold point' ? ' (required)' : ''}
                      </label>
                      <Textarea id="new-criteria" value={newRow.acceptance_criteria}
                        onChange={(e) => setNewRow(
                          (r) => ({ ...r, acceptance_criteria: e.target.value }))}
                        className="min-h-[60px]" />
                      {rowErrors.acceptance_criteria ? (
                        <p className="text-xs text-[hsl(var(--destructive))]">
                          {rowErrors.acceptance_criteria}
                        </p>
                      ) : null}
                    </div>
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium" htmlFor="new-party">
                          Verified by
                        </label>
                        <select id="new-party" value={newRow.responsible_party}
                          onChange={(e) => setNewRow(
                            (r) => ({ ...r, responsible_party: e.target.value }))}
                          className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm">
                          {RESPONSIBLE_PARTIES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium" htmlFor="new-planned">
                          Planned date
                        </label>
                        <Input id="new-planned" type="date" value={newRow.planned_date}
                          onChange={(e) => setNewRow(
                            (r) => ({ ...r, planned_date: e.target.value }))} />
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" size="sm"
                      onClick={() => { setAdding(false); setRowErrors({}); }}>
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" disabled={busy}>Add item</Button>
                  </div>
                </form>
              ) : null}

              {ordered.length === 0 ? (
                <p className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                  This plan has no inspection points yet, so nothing is being verified
                  against it. Add the first one above.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="data-grid-table w-full">
                    <thead>
                      <tr>
                        <th className="data-grid-th">Item</th>
                        <th className="data-grid-th">Activity</th>
                        <th className="data-grid-th">Intervention</th>
                        <th className="data-grid-th">Planned</th>
                        <th className="data-grid-th">Status</th>
                        <th className="data-grid-th">Verified</th>
                        <th className="data-grid-th" />
                      </tr>
                    </thead>
                    <tbody>
                      {ordered.map((c) => (
                        <tr key={c.id}
                          className="border-b border-[hsl(var(--border))] last:border-0">
                          <td className="data-grid-td font-mono text-xs">{c.item_no}</td>
                          <td className="data-grid-td">
                            <p className="font-medium">{c.title}</p>
                            {c.acceptance_criteria ? (
                              <p className="text-xs text-[hsl(var(--muted-foreground))] max-w-md">
                                {c.acceptance_criteria}
                              </p>
                            ) : isBlockingPoint(c) ? (
                              <p className="text-xs text-[hsl(var(--destructive))]">
                                No acceptance criteria recorded.
                              </p>
                            ) : null}
                            {c.reference_document ? (
                              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                                Ref: {c.reference_document}
                              </p>
                            ) : null}
                          </td>
                          <td className="data-grid-td">
                            <PointTypeBadge checkpoint={c} />
                            {c.responsible_party ? (
                              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                                {c.responsible_party}
                              </p>
                            ) : null}
                          </td>
                          <td className="data-grid-td text-xs">
                            {c.planned_date || '—'}
                            {isCheckpointOverdue(c) ? (
                              <span className="block text-[hsl(var(--destructive))]">Overdue</span>
                            ) : null}
                          </td>
                          <td className="data-grid-td">
                            <CheckpointStatusBadge status={c.status} />
                          </td>
                          <td className="data-grid-td text-xs text-[hsl(var(--muted-foreground))]">
                            {c.result_date
                              ? <>
                                  {c.result_date}
                                  <span className="block">
                                    {c.verifier_name || (c.verified_by ? 'Recorded by a Suite user' : '')}
                                  </span>
                                  {c.remarks ? <span className="block italic">{c.remarks}</span> : null}
                                </>
                              : '—'}
                          </td>
                          <td className="data-grid-td whitespace-nowrap">
                            {locked ? null : !isResolved(c) || c.status === 'Failed' ? (
                              <Button size="sm" variant="outline" onClick={() => openDecision(c)}>
                                Record result
                              </Button>
                            ) : (
                              <Button size="sm" variant="ghost" onClick={() => openDecision(c)}>
                                Amend
                              </Button>
                            )}
                            {!locked ? (
                              <Button size="sm" variant="ghost" disabled={busy}
                                onClick={() => { setFailure(null); setRemoving(c); }}
                                title="Remove this item">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {deciding && !locked ? (
                <form onSubmit={submitDecision}
                  className="p-5 border-t border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/30 space-y-3">
                  <p className="text-sm font-medium">
                    {deciding.point_type} {deciding.item_no}: {deciding.title}
                  </p>
                  {isBlockingPoint(deciding) ? (
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      This is a hold point. Work stopped here until it was verified, so the
                      date and the verifier are both required, also when it is set to Not
                      applicable. A blank verifier records you.
                    </p>
                  ) : null}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium" htmlFor="dec-status">Result</label>
                      <select id="dec-status" value={decision.status}
                        onChange={(e) => setDecision((d) => ({ ...d, status: e.target.value }))}
                        className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm">
                        {CHECKPOINT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium" htmlFor="dec-date">
                        Date decided
                      </label>
                      <Input id="dec-date" type="date" value={decision.result_date}
                        onChange={(e) => setDecision(
                          (d) => ({ ...d, result_date: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium" htmlFor="dec-verifier">
                        Verifier, if not you
                      </label>
                      <Input id="dec-verifier" value={decision.verifier_name}
                        onChange={(e) => setDecision(
                          (d) => ({ ...d, verifier_name: e.target.value }))}
                        placeholder="A surveyor or inspector with no Suite login" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium" htmlFor="dec-remarks">
                      Remarks{decisionReasonLabel(deciding, decision.status)}
                    </label>
                    <Textarea id="dec-remarks" value={decision.remarks}
                      required={needsDecisionReason(deciding, decision.status)}
                      onChange={(e) => setDecision((d) => ({ ...d, remarks: e.target.value }))}
                      className="min-h-[60px]" />
                  </div>
                  {decision.status === 'Failed' ? (
                    <GateNotice reason="A failed inspection point keeps this plan open until it is resolved. Raise a non-conformance against it from the NCR register." />
                  ) : null}
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" size="sm"
                      onClick={() => setDeciding(null)}>Cancel</Button>
                    <Button type="submit" size="sm" disabled={busy}>Record result</Button>
                  </div>
                </form>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <Card className="panel-elevation">
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4 flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Non-conformances raised against this plan</CardTitle>
            <Button size="sm" variant="outline"
              onClick={() => navigate(`${BASE}/ncr-register?raise=1&plan=${plan.id}`)}>
              <FileWarning className="w-4 h-4 mr-2" /> Raise one
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {ncrs.length === 0 ? (
              <p className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                None. Nothing found against this plan has been written up.
              </p>
            ) : (
              <table className="data-grid-table w-full">
                <thead>
                  <tr>
                    <th className="data-grid-th">Number</th>
                    <th className="data-grid-th">Title</th>
                    <th className="data-grid-th">Severity</th>
                    <th className="data-grid-th">Raised</th>
                    <th className="data-grid-th">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ncrs.map((n) => (
                    <tr key={n.id} onClick={() => navigate(`${BASE}/ncr/${n.id}`)}
                      className="border-b border-[hsl(var(--border))] last:border-0 hover:bg-[hsl(var(--secondary))]/50 cursor-pointer">
                      <td className="data-grid-td font-mono text-xs text-[hsl(var(--primary))]">
                        {n.ncr_code}
                      </td>
                      <td className="data-grid-td">{n.title}</td>
                      <td className="data-grid-td"><SeverityBadge severity={n.severity} /></td>
                      <td className="data-grid-td text-xs">{n.raised_date}</td>
                      <td className="data-grid-td"><NcrStatusBadge status={n.status} /></td>
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
                Nothing recorded against this plan yet.
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

        <ConfirmDelete
          open={Boolean(removing)}
          title="Remove this inspection point?"
          description={removing
            ? `Item ${removing.item_no} (${removing.point_type}) and any result recorded against it will be deleted from ${plan.plan_code}. This cannot be undone. If the point no longer applies, recording it as Not applicable keeps the record.`
            : ''}
          confirmLabel="Remove item"
          busy={busy}
          onConfirm={() => removeCheckpoint(removing)}
          onCancel={() => setRemoving(null)}
        />
      </div>
    </QAPlanShell>
  );
}
