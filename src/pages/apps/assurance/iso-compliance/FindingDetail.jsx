import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FileWarning, Plus, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import {
  ACTION_STATUSES,
  ACTION_TYPES,
  EFFECTIVENESS_REQUIRED_TYPES,
  NONCONFORMITY_TYPES,
  ROOT_CAUSE_CATEGORIES,
  canCloseFinding,
  findingAgeDays,
  isActionOverdue,
  isFindingOverdue,
} from '@/lib/isoCompliance';
import { ISOShell, BASE } from './components/ISOShell';
import {
  DetailField, EmptyState, ErrorState, GateNotice, Loading, MetricTile, SchemaNotice, WriteFailure,
} from './components/SharedComponents';
import {
  ActionStatusBadge, EffectivenessBadge, FindingStatusBadge, FindingTypeBadge,
} from './components/ISOBadges';
import { progressedFindingStatus, validateAction } from './utils/isoPayload';
import { useIsoCompliance } from './hooks/useIsoCompliance';

/**
 * AS8 — one finding, from raised to closed.
 *
 * There was no such page: the findings register's rows navigated
 * nowhere, and the app's only detail route rendered the URL's id over
 * a status panel hardcoded to Compliant / Current / Oct 12, 2023.
 *
 * ISO 9001 §10.2 is the shape of this page. The CORRECTION deals with
 * what was found; the CORRECTIVE ACTION deals with the cause; and for
 * a major nonconformity the corrective action must be shown to have
 * worked before the finding closes.
 */

const blankAction = () => ({
  action_type: 'Corrective', description: '', assignee_name: '', due_date: '',
});

export default function FindingDetail() {
  const { findingId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    findings, audits, clauses, standards, activityFor,
    loading, error, refresh, hasAs8Schema,
    updateFinding, closeFinding, voidFinding, addActions, updateAction,
    recordEffectiveness, deleteAction,
  } = useIsoCompliance();

  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);
  const [correcting, setCorrecting] = useState(null);
  const [newAction, setNewAction] = useState(null);
  const [actionErrors, setActionErrors] = useState({});
  const [checking, setChecking] = useState(null);
  const [effectiveness, setEffectiveness] = useState({ verified: 'true', notes: '' });
  const [closing, setClosing] = useState(false);
  const [closureNotes, setClosureNotes] = useState('');
  const [voiding, setVoiding] = useState(false);
  const [voidReason, setVoidReason] = useState('');

  const today = new Date();
  const finding = useMemo(
    () => findings.find((f) => f.id === findingId) || null, [findings, findingId]);
  const actions = useMemo(() => (finding ? (finding.actions || []) : []), [finding]);
  const audit = useMemo(
    () => (finding?.audit_id ? audits.find((a) => a.id === finding.audit_id) || null : null),
    [audits, finding]);
  const clause = useMemo(
    () => (finding?.clause_id ? clauses.find((c) => c.id === finding.clause_id) || null : null),
    [clauses, finding]);
  const standard = useMemo(
    () => (finding?.standard_id ? standards.find((s) => s.id === finding.standard_id) || null : null),
    [standards, finding]);
  const log = useMemo(() => (finding ? activityFor(finding.id) : []), [finding, activityFor]);
  const gate = useMemo(
    () => (finding ? canCloseFinding(finding, actions) : { ok: false }), [finding, actions]);

  if (loading) return <ISOShell><Loading label="Loading the finding..." /></ISOShell>;
  if (error) return <ISOShell><ErrorState error={error} onRetry={refresh} /></ISOShell>;
  if (!hasAs8Schema) return <ISOShell><SchemaNotice /></ISOShell>;

  if (!finding) {
    return (
      <ISOShell title="Finding not found">
        <EmptyState
          icon={<FileWarning className="w-12 h-12" />}
          title="No such finding"
          description="This finding is not in your organization's register. It may have been deleted, or the link may be wrong."
          action={<Button onClick={() => navigate(`${BASE}/findings`)}>Back to the register</Button>}
        />
      </ISOShell>
    );
  }

  const terminal = ['Closed', 'Voided'].includes(finding.status);
  const major = EFFECTIVENESS_REQUIRED_TYPES.includes(finding.finding_type);
  const nonconformity = NONCONFORMITY_TYPES.includes(finding.finding_type);

  const run = async (fn, message) => {
    setFailure(null);
    setBusy(true);
    const result = await fn();
    setBusy(false);
    if (!result.success) { setFailure(result.error); return false; }
    if (message) toast({ description: message });
    return true;
  };

  const submitCorrection = async (e) => {
    e.preventDefault();
    const next = {
      ...finding,
      correction: correcting.correction || null,
      root_cause: correcting.root_cause || null,
      root_cause_category: correcting.root_cause_category || null,
    };
    // The status follows the record: correction proposed, action in
    // progress, verification (AS13; AS8 never set the last two).
    const ok = await run(() => updateFinding(finding.id, {
      ...next, status: progressedFindingStatus(next, actions),
    }), 'Saved.');
    if (ok) setCorrecting(null);
  };

  const submitAction = async (e) => {
    e.preventDefault();
    setFailure(null);
    const errs = validateAction(newAction);
    setActionErrors(errs);
    if (Object.keys(errs).length) return;
    const ok = await run(() => addActions(finding.id, [newAction]), 'Action added.');
    if (ok) { setNewAction(null); setActionErrors({}); }
  };

  const moveAction = (a, status) => run(
    () => updateAction(a.id, { ...a, status }), `Action marked ${status.toLowerCase()}.`);

  const submitEffectiveness = async (e) => {
    e.preventDefault();
    const ok = await run(
      () => recordEffectiveness(checking, effectiveness.verified === 'true', effectiveness.notes),
      effectiveness.verified === 'true'
        ? 'Action verified effective.'
        : 'Recorded: the action did not work. Raise another one.');
    if (ok) { setChecking(null); setEffectiveness({ verified: 'true', notes: '' }); }
  };

  const submitClosure = async (e) => {
    e.preventDefault();
    const ok = await run(() => closeFinding(finding, { closure_notes: closureNotes }),
      `${finding.finding_code} closed.`);
    if (ok) { setClosing(false); setClosureNotes(''); }
  };

  const submitVoid = async (e) => {
    e.preventDefault();
    const ok = await run(() => voidFinding(finding, voidReason),
      `${finding.finding_code} voided.`);
    if (ok) { setVoiding(false); setVoidReason(''); }
  };

  const age = findingAgeDays(finding, today);
  const selectClass = 'h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm';

  return (
    <ISOShell
      title={`${finding.finding_code}: ${finding.title}`}
      description={audit ? `Raised by ${audit.audit_code}` : 'Raised outside an audit'}
    >
      <div className="space-y-6 animate-in fade-in duration-300 pb-10">
        <WriteFailure error={failure} />

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricTile
            label="Type" value={finding.finding_type}
            hint={major
              ? 'Needs a root cause and an action verified effective'
              : nonconformity ? 'Needs the correction recorded' : 'No correction required'}
            token={major ? '--destructive' : '--muted-foreground'}
          />
          <MetricTile label="Status" value={finding.status} token="--primary" />
          <MetricTile
            label="Age" value={age === null ? '-' : `${age} d`}
            hint={finding.due_date ? `Due ${finding.due_date}` : 'No due date set'}
            token={isFindingOverdue(finding, today) ? '--destructive' : '--muted-foreground'}
          />
          <MetricTile
            label="Open actions"
            value={actions.filter((a) => !['Complete', 'Cancelled'].includes(a.status)).length}
            hint={`${actions.length} raised in total`}
            token="--warning"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="panel-elevation lg:col-span-1">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-lg">The finding</CardTitle>
              <div className="flex gap-2 shrink-0">
                <FindingTypeBadge type={finding.finding_type} />
                <FindingStatusBadge status={finding.status} />
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <DetailField label="Number">
                <span className="font-mono">{finding.finding_code}</span>
              </DetailField>
              <DetailField label="What was found">{finding.description}</DetailField>
              <DetailField label="Objective evidence">{finding.objective_evidence}</DetailField>
              <DetailField label="Requirement">{finding.requirement_ref}</DetailField>
              <div className="grid grid-cols-2 gap-4">
                <DetailField label="Standard">{standard?.code}</DetailField>
                <DetailField label="Clause">
                  {clause ? `${clause.clause_ref} · ${clause.title}` : null}
                </DetailField>
                <DetailField label="Department">{finding.department}</DetailField>
                <DetailField label="Owner">{finding.owner_name}</DetailField>
                <DetailField label="Raised">{finding.raised_date}</DetailField>
                <DetailField label="Due">{finding.due_date}</DetailField>
              </div>
              {audit ? (
                <DetailField label="Audit">
                  <button type="button" className="text-[hsl(var(--primary))] hover:underline"
                    onClick={() => navigate(`${BASE}/audits/${audit.id}`)}>
                    {audit.audit_code}: {audit.title}
                  </button>
                </DetailField>
              ) : null}
              {finding.closure_notes ? (
                <DetailField label={finding.status === 'Voided' ? 'Voided because' : 'Closure notes'}>
                  {finding.closure_notes}
                </DetailField>
              ) : null}
            </CardContent>
          </Card>

          <Card className="panel-elevation lg:col-span-2">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4 flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="text-lg">Correction and cause</CardTitle>
                <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                  ISO 9001 §10.2. The correction deals with what was found. The root
                  cause is what stops it being found again at the next surveillance
                  audit.
                </p>
              </div>
              {!terminal ? (
                <Button size="sm" variant="outline" disabled={busy}
                  onClick={() => setCorrecting(correcting ? null : {
                    correction: finding.correction || '',
                    root_cause: finding.root_cause || '',
                    root_cause_category: finding.root_cause_category || '',
                  })}>
                  {finding.correction || finding.root_cause ? 'Edit' : 'Record'}
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <DetailField label="Correction">{finding.correction}</DetailField>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <DetailField label="Root cause category">{finding.root_cause_category}</DetailField>
                <DetailField label="Root cause" className="sm:col-span-2">
                  {finding.root_cause}
                </DetailField>
              </div>
              {!finding.correction && nonconformity && !terminal ? (
                <GateNotice reason="A nonconformity needs its correction recorded before it closes." />
              ) : null}
              {!finding.root_cause && major && !terminal ? (
                <GateNotice reason="A major nonconformity needs its root cause recorded before it closes." />
              ) : null}

              {correcting ? (
                <form onSubmit={submitCorrection}
                  className="p-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/30 space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="fx-correction">
                      Correction: what was done about what was found
                    </label>
                    <Textarea id="fx-correction" rows={2} value={correcting.correction}
                      onChange={(e) => setCorrecting(
                        (c) => ({ ...c, correction: e.target.value }))}
                      placeholder="The records were reconstructed from the calibration house." />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="fx-cat">
                      Root cause category
                    </label>
                    <select id="fx-cat" className={selectClass} value={correcting.root_cause_category}
                      onChange={(e) => setCorrecting(
                        (c) => ({ ...c, root_cause_category: e.target.value }))}>
                      <option value="">Not categorised</option>
                      {ROOT_CAUSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="fx-cause">Root cause</label>
                    <Textarea id="fx-cause" rows={3} value={correcting.root_cause}
                      onChange={(e) => setCorrecting((c) => ({ ...c, root_cause: e.target.value }))}
                      placeholder="What allowed this to happen, not what happened." />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setCorrecting(null)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={busy}>Save</Button>
                  </div>
                </form>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <Card className="panel-elevation">
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4 flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Corrective and preventive actions</CardTitle>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                A completed action is not a working action. For a major
                nonconformity one must be verified effective before this closes.
              </p>
            </div>
            {!terminal ? (
              <Button size="sm" variant="outline" disabled={busy}
                onClick={() => setNewAction(newAction ? null : blankAction())}>
                <Plus className="w-4 h-4 mr-2" /> Add an action
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="p-0">
            {newAction ? (
              <form onSubmit={submitAction}
                className="p-5 border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/30 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-3 space-y-1.5">
                    <label className="text-xs font-medium" htmlFor="na-type">Type</label>
                    <select id="na-type" className={selectClass} value={newAction.action_type}
                      onChange={(e) => setNewAction((a) => ({ ...a, action_type: e.target.value }))}>
                      {ACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="md:col-span-5 space-y-1.5">
                    <label className="text-xs font-medium" htmlFor="na-desc">
                      What will be done
                    </label>
                    <Input id="na-desc" value={newAction.description}
                      onChange={(e) => setNewAction((a) => ({ ...a, description: e.target.value }))} />
                    {actionErrors.description ? (
                      <p className="text-xs text-[hsl(var(--destructive))]">{actionErrors.description}</p>
                    ) : null}
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-xs font-medium" htmlFor="na-who">Owner</label>
                    <Input id="na-who" value={newAction.assignee_name}
                      onChange={(e) => setNewAction((a) => ({ ...a, assignee_name: e.target.value }))} />
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-xs font-medium" htmlFor="na-due">Due</label>
                    <Input id="na-due" type="date" value={newAction.due_date}
                      onChange={(e) => setNewAction((a) => ({ ...a, due_date: e.target.value }))} />
                    {actionErrors.due_date ? (
                      <p className="text-xs text-[hsl(var(--destructive))]">{actionErrors.due_date}</p>
                    ) : null}
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setNewAction(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={busy}>Add action</Button>
                </div>
              </form>
            ) : null}

            {actions.length === 0 ? (
              <p className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                No corrective or preventive action has been raised against this
                finding.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-grid-table w-full">
                  <thead>
                    <tr>
                      <th className="data-grid-th">Type</th>
                      <th className="data-grid-th">Action</th>
                      <th className="data-grid-th">Owner</th>
                      <th className="data-grid-th">Due</th>
                      <th className="data-grid-th">Status</th>
                      <th className="data-grid-th">Effectiveness</th>
                      <th className="data-grid-th text-right">Move</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actions.map((a) => (
                      <tr key={a.id} className="border-b border-[hsl(var(--border))] last:border-0">
                        <td className="data-grid-td text-xs">{a.action_type}</td>
                        <td className="data-grid-td">{a.description}</td>
                        <td className="data-grid-td text-xs">{a.assignee_name || 'Unassigned'}</td>
                        <td className="data-grid-td text-xs">
                          <span className={isActionOverdue(a, today)
                            ? 'text-[hsl(var(--destructive))] font-medium' : ''}>
                            {a.due_date || 'Not set'}
                          </span>
                        </td>
                        <td className="data-grid-td"><ActionStatusBadge status={a.status} /></td>
                        <td className="data-grid-td"><EffectivenessBadge action={a} /></td>
                        <td className="data-grid-td">
                          <div className="flex flex-wrap gap-1 justify-end">
                            {!terminal && ACTION_STATUSES.filter((s) => s !== a.status).map((s) => (
                              <Button key={s} size="sm" variant="ghost" disabled={busy}
                                onClick={() => moveAction(a, s)}>
                                {s}
                              </Button>
                            ))}
                            {!terminal && a.status === 'Complete' ? (
                              <Button size="sm" variant="outline" disabled={busy}
                                onClick={() => {
                                  setFailure(null);
                                  setChecking(a);
                                  setEffectiveness({ verified: 'true', notes: '' });
                                }}>
                                Effectiveness
                              </Button>
                            ) : null}
                            {!terminal ? (
                              <Button size="sm" variant="ghost" disabled={busy}
                                onClick={() => run(() => deleteAction(a.id), 'Action removed.')}
                                title="Remove this action">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {checking ? (
              <form onSubmit={submitEffectiveness}
                className="p-5 border-t border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/30 space-y-3">
                <p className="text-sm font-medium">
                  Effectiveness check: {checking.description}
                </p>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="ef-verdict">Did it work?</label>
                  <select id="ef-verdict" className={selectClass} value={effectiveness.verified}
                    onChange={(e) => setEffectiveness((s) => ({ ...s, verified: e.target.value }))}>
                    <option value="true">Yes, verified effective</option>
                    <option value="false">No, it did not work</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="ef-notes">What was seen</label>
                  <Textarea id="ef-notes" rows={3} value={effectiveness.notes}
                    onChange={(e) => setEffectiveness((s) => ({ ...s, notes: e.target.value }))}
                    placeholder="How this was checked, and what the check found." />
                  {effectiveness.verified === 'false' ? (
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      A not-effective verdict is the trigger to raise another action, so
                      say what is still happening.
                    </p>
                  ) : null}
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setChecking(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={busy}>Record the check</Button>
                </div>
              </form>
            ) : null}
          </CardContent>
        </Card>

        <Card className="panel-elevation">
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
            <CardTitle className="text-lg">Closure</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            {terminal ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                This finding is {String(finding.status).toLowerCase()}
                {finding.closed_date ? ` as at ${finding.closed_date}` : ''}.
              </p>
            ) : (
              <>
                {gate.ok ? (
                  <p className="text-sm">
                    Every condition for closing {finding.finding_code} is met.
                  </p>
                ) : (
                  <GateNotice reason={gate.reason} />
                )}
                <div className="flex flex-wrap gap-2">
                  <Button disabled={busy || !gate.ok}
                    onClick={() => { setFailure(null); setClosing((v) => !v); }}>
                    Close this finding
                  </Button>
                  <Button variant="outline" disabled={busy}
                    onClick={() => { setFailure(null); setVoiding((v) => !v); }}>
                    Void it instead
                  </Button>
                </div>

                {closing ? (
                  <form onSubmit={submitClosure} className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium" htmlFor="cl-notes">Closure notes</label>
                      <Textarea id="cl-notes" rows={3} value={closureNotes}
                        onChange={(e) => setClosureNotes(e.target.value)}
                        placeholder="What was done, and on what evidence this is closed." />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setClosing(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={busy}>Close {finding.finding_code}</Button>
                    </div>
                  </form>
                ) : null}

                {voiding ? (
                  <form onSubmit={submitVoid} className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium" htmlFor="vo-reason">
                        Why was this raised in error?
                      </label>
                      <Textarea id="vo-reason" rows={3} value={voidReason}
                        onChange={(e) => setVoidReason(e.target.value)}
                        placeholder="Voiding is the honest alternative to closing something that should never have been raised." />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setVoiding(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" variant="outline" disabled={busy}>
                        Void {finding.finding_code}
                      </Button>
                    </div>
                  </form>
                ) : null}
              </>
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
                Nothing recorded against this finding yet.
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
      </div>
    </ISOShell>
  );
}
