import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MOCPageShell, BASE } from './components/MOCPageShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, ArrowLeft, CheckCircle, Lock, Plus, Trash2, XCircle } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import {
  ACTION_TYPES,
  EXPIRING_TYPES,
  EXPIRY,
  approvalState,
  canAdvance,
  daysUntil,
  expiryState,
  nextStages,
  parseDateOnly,
  toDateOnlyString,
} from '@/lib/managementOfChange';
import { ExpiryBadge, RiskBadge, StageBadge, TypeBadge } from './components/MOCBadges';
import { ConfirmDelete, DetailField, ErrorState, Loading } from './components/SharedComponents';
import { useManagementOfChange } from './hooks/useManagementOfChange';
import { mocLockReason, validateAction, validateExpiryEdit } from './utils/mocPayload';

const showDate = (v) => {
  const d = parseDateOnly(v);
  return d ? format(d, 'd MMM yyyy') : null;
};

const EMPTY_ACTION = { action_type: 'Pre-implementation', description: '', due_date: '' };

/**
 * AS6 — the change, its approvals, its actions and its audit trail.
 *
 * This page read `const { id = 'MOC-2026-089' } = useParams()` — a
 * default id — and rendered one hardcoded record whatever the URL said,
 * with an Export that wrote that invented record to CSV, Excel or PDF.
 * Its stage button toasted "Moving to next stage..." and moved nothing.
 *
 * The gates are here now, and they are the app: approvals signed before
 * implementation, pre-implementation actions closed before the change
 * goes in, and a temporary change never implemented without a date to
 * come back out.
 */
export default function MOCDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    records, activityFor, loading, error, userId,
    advance, setExpiry, addApprover, decideApproval, addActions, updateAction, deleteMoc, refresh,
  } = useManagementOfChange();

  const [saving, setSaving] = useState(false);
  const [addingAction, setAddingAction] = useState(false);
  const [actionDraft, setActionDraft] = useState(EMPTY_ACTION);
  const [actionErrors, setActionErrors] = useState({});
  const [addingApprover, setAddingApprover] = useState(false);
  const [approverDraft, setApproverDraft] = useState({ role: 'Technical Authority', level: 1 });
  const [deciding, setDeciding] = useState(null);
  const [decisionText, setDecisionText] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [expiryDraft, setExpiryDraft] = useState(null);
  const [expiryError, setExpiryError] = useState(null);

  const moc = records.find((m) => m.id === id);
  const approvals = useMemo(() => moc?.approvals || [], [moc]);
  const actions = useMemo(() => moc?.actions || [], [moc]);
  const gate = useMemo(() => approvalState(approvals), [approvals]);

  if (loading) return <MOCPageShell><Loading label="Loading the change..." /></MOCPageShell>;
  if (error) return <MOCPageShell><ErrorState error={error} onRetry={refresh} /></MOCPageShell>;
  if (!moc) {
    return (
      <MOCPageShell>
        <div className="py-16 text-center text-[hsl(var(--muted-foreground))]">
          That change is not in this organization&apos;s register.
        </div>
      </MOCPageShell>
    );
  }

  const trail = activityFor(moc.id);
  const expiry = expiryState(moc);
  const expiryDays = moc.expiry_date ? daysUntil(moc.expiry_date) : null;
  // AS13: a Closed, Rejected or Cancelled change is a record. The hook
  // refuses these writes too; this hides the buttons that would try.
  const locked = mocLockReason(moc);
  // AS13: a temporary or emergency draft's expiry date can be added or
  // corrected here. One saved without it could not leave Draft at all.
  const expiryEditable = moc.stage === 'Draft' && EXPIRING_TYPES.includes(moc.type);
  const draftMissingExpiry = expiryEditable && !parseDateOnly(moc.expiry_date);

  const handleAdvance = async (stage) => {
    if (stage === 'Rejected') { setRejecting(true); return; }
    setSaving(true);
    const result = await advance(moc, stage);
    setSaving(false);
    toast(result.success
      ? { description: `Moved to ${stage}.` }
      : { title: 'Stage not changed', description: result.error, variant: 'destructive' });
  };

  const handleReject = async (e) => {
    e.preventDefault();
    setSaving(true);
    const result = await advance(moc, 'Rejected', { rejectionReason });
    setSaving(false);
    if (!result.success) {
      toast({ title: 'Not rejected', description: result.error, variant: 'destructive' });
      return;
    }
    setRejecting(false); setRejectionReason('');
    toast({ description: 'Change rejected.' });
  };

  const handleAddAction = async (e) => {
    e.preventDefault();
    const found = validateAction(actionDraft);
    if (Object.keys(found).length) { setActionErrors(found); return; }
    setSaving(true);
    const result = await addActions(moc.id, [actionDraft]);
    setSaving(false);
    if (!result.success) {
      toast({ title: 'The action was not saved', description: result.error, variant: 'destructive' });
      return;
    }
    setAddingAction(false); setActionDraft(EMPTY_ACTION); setActionErrors({});
    toast({ description: 'Action added.' });
  };

  const handleActionStatus = async (actionRow, status) => {
    const result = await updateAction(actionRow.id, { status });
    toast(result.success
      ? { description: `Action marked ${status.toLowerCase()}.` }
      : { title: 'Not updated', description: result.error, variant: 'destructive' });
  };

  const handleAddApprover = async (e) => {
    e.preventDefault();
    setSaving(true);
    const result = await addApprover(moc.id, {
      approver_id: userId,
      role: approverDraft.role,
      level: Number(approverDraft.level) || 1,
    });
    setSaving(false);
    if (!result.success) {
      toast({ title: 'Not added', description: result.error, variant: 'destructive' });
      return;
    }
    setAddingApprover(false);
    toast({ description: `Approval gate ${approverDraft.level} added.` });
  };

  const handleDecision = async (approval, status) => {
    setSaving(true);
    const result = await decideApproval(approval, status, decisionText);
    setSaving(false);
    if (!result.success) {
      toast({ title: 'Not recorded', description: result.error, variant: 'destructive' });
      return;
    }
    setDeciding(null); setDecisionText('');
    toast({ description: `Approval ${status.toLowerCase()}.` });
  };

  const handleSaveExpiry = async (e) => {
    e.preventDefault();
    const problem = validateExpiryEdit(moc, expiryDraft);
    if (problem) { setExpiryError(problem); return; }
    setSaving(true);
    const result = await setExpiry(moc, expiryDraft);
    setSaving(false);
    if (!result.success) { setExpiryError(result.error); return; }
    setExpiryDraft(null); setExpiryError(null);
    toast({ description: `Expiry date set to ${showDate(expiryDraft)}.` });
  };

  const handleDelete = async () => {
    setSaving(true);
    const result = await deleteMoc(moc.id);
    setSaving(false);
    setConfirmingDelete(false);
    if (result.success) {
      toast({ description: `${moc.moc_code} deleted.` });
      navigate(`${BASE}/register`);
    } else {
      toast({ title: 'Not deleted', description: result.error, variant: 'destructive' });
    }
  };

  return (
    <MOCPageShell title={moc.moc_code} description={moc.title}>
      <div className="space-y-6 animate-in fade-in duration-300 max-w-6xl mx-auto pb-20 md:pb-8">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-[hsl(var(--border))] pb-6">
          <div className="flex gap-4">
            <Button variant="ghost" size="icon" className="mt-1" aria-label="Back"
              onClick={() => navigate(`${BASE}/register`)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="px-2 py-0.5 bg-[hsl(var(--secondary))] rounded text-xs font-mono border border-[hsl(var(--border))]">
                  {moc.moc_code}
                </span>
                <StageBadge stage={moc.stage} />
                <TypeBadge type={moc.type} />
                <RiskBadge risk={moc.risk_level} />
                <ExpiryBadge moc={moc} />
              </div>
              <h2 className="text-2xl font-bold tracking-tight">{moc.title}</h2>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-2">
                {[moc.category, moc.asset_id, moc.department].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {nextStages(moc.stage).map((stage) => {
              const verdict = canAdvance(moc, stage, { approvals, actions });
              return (
                <Button key={stage}
                  variant={['Rejected', 'Cancelled'].includes(stage) ? 'outline' : 'default'}
                  disabled={saving || !verdict.ok}
                  title={verdict.ok ? undefined : verdict.reason}
                  onClick={() => handleAdvance(stage)}>
                  {!verdict.ok ? <Lock className="w-3.5 h-3.5 mr-2" /> : null}
                  {stage === 'Cancelled' ? 'Cancel' : stage === 'Rejected' ? 'Reject' : `Move to ${stage}`}
                </Button>
              );
            })}
            {moc.stage === 'Draft' ? (
              <Button variant="outline" className="text-[hsl(var(--destructive))]"
                onClick={() => setConfirmingDelete(true)}>
                <Trash2 className="w-4 h-4 mr-2" /> Delete
              </Button>
            ) : null}
          </div>
        </div>

        {locked ? (
          <div className="p-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/40 text-sm flex gap-3">
            <Lock className="w-4 h-4 shrink-0 mt-0.5 text-[hsl(var(--muted-foreground))]" />
            <p>{locked}</p>
          </div>
        ) : null}

        {draftMissingExpiry ? (
          <div className="p-4 rounded-lg border border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/5 text-sm flex gap-3">
            <AlertTriangle className="w-5 h-5 text-[hsl(var(--warning))] shrink-0 mt-0.5" />
            <p>
              This {String(moc.type).toLowerCase()} draft has no expiry date, so it cannot
              leave Draft, not even to be cancelled. Set one under Expires in the overview.
            </p>
          </div>
        ) : null}

        {/* An expired temporary change is the loudest thing on the page. */}
        {expiry === EXPIRY.EXPIRED ? (
          <div className="p-4 rounded-lg border border-[hsl(var(--destructive))]/40 bg-[hsl(var(--destructive))]/5 text-sm flex gap-3">
            <AlertTriangle className="w-5 h-5 text-[hsl(var(--destructive))] shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">This {String(moc.type).toLowerCase()} change is past its expiry date</p>
              <p className="text-[hsl(var(--muted-foreground))] mt-1">
                It expired {Math.abs(expiryDays)} day{Math.abs(expiryDays) === 1 ? '' : 's'} ago
                and is still in effect. Revert it, or raise a permanent change to replace it.
              </p>
            </div>
          </div>
        ) : expiry === EXPIRY.EXPIRING ? (
          <div className="p-4 rounded-lg border border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/5 text-sm flex gap-3">
            <AlertTriangle className="w-5 h-5 text-[hsl(var(--warning))] shrink-0 mt-0.5" />
            <p>
              This {String(moc.type).toLowerCase()} change expires in {expiryDays} day
              {expiryDays === 1 ? '' : 's'}, on {showDate(moc.expiry_date)}.
            </p>
          </div>
        ) : null}

        {rejecting ? (
          <Card className="panel-elevation">
            <CardHeader><CardTitle className="text-lg">Reject this change</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleReject} className="space-y-3">
                <Textarea rows={2} value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Why, so the originator knows what would make it acceptable." />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setRejecting(false)}>Cancel</Button>
                  <Button type="submit" disabled={saving || !rejectionReason.trim()}>Reject</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="bg-transparent border-b border-[hsl(var(--border))] w-full justify-start rounded-none h-auto p-0 space-x-6 overflow-x-auto">
            {[['overview', 'Overview'],
              ['approvals', `Approvals (${approvals.length})`],
              ['actions', `Actions (${actions.length})`],
              ['impacts', `Impacts (${moc.impacts?.length || 0})`],
              ['audit', `Audit trail (${trail.length})`]].map(([value, label]) => (
                <TabsTrigger key={value} value={value}
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-[hsl(var(--primary))] data-[state=active]:bg-transparent px-1 pb-3 whitespace-nowrap">
                  {label}
                </TabsTrigger>
              ))}
          </TabsList>

          <TabsContent value="overview" className="pt-6 space-y-6">
            <Card className="panel-elevation">
              <CardContent className="p-6 grid grid-cols-1 md:grid-cols-3 gap-5">
                <DetailField label="Type">{moc.type}</DetailField>
                <DetailField label="Category">{moc.category}</DetailField>
                <DetailField label="Risk level">{moc.risk_level}</DetailField>
                <DetailField label="Priority">{moc.priority}</DetailField>
                <DetailField label="Target implementation">{showDate(moc.target_implementation_date)}</DetailField>
                <DetailField label="Expires">
                  {expiryEditable && expiryDraft !== null ? (
                    <form onSubmit={handleSaveExpiry} className="space-y-2">
                      <Input id="expiry_edit" type="date" aria-label="Expiry date"
                        value={expiryDraft}
                        onChange={(e) => { setExpiryDraft(e.target.value); setExpiryError(null); }} />
                      {expiryError ? (
                        <p className="text-xs text-[hsl(var(--destructive))]">{expiryError}</p>
                      ) : null}
                      <div className="flex gap-2">
                        <Button type="submit" size="sm" disabled={saving}>Save</Button>
                        <Button type="button" size="sm" variant="ghost"
                          onClick={() => { setExpiryDraft(null); setExpiryError(null); }}>
                          Cancel
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <span className="flex items-center gap-2 flex-wrap">
                      {showDate(moc.expiry_date) || 'Not set'}
                      {expiryEditable ? (
                        <Button type="button" size="sm" variant="outline"
                          onClick={() => setExpiryDraft(toDateOnlyString(moc.expiry_date) || '')}>
                          {moc.expiry_date ? 'Change' : 'Set expiry date'}
                        </Button>
                      ) : null}
                    </span>
                  )}
                </DetailField>
                <div className="md:col-span-3">
                  <DetailField label="Current situation">{moc.current_situation}</DetailField>
                </div>
                <div className="md:col-span-3">
                  <DetailField label="Proposed change">{moc.description}</DetailField>
                </div>
                <div className="md:col-span-3">
                  <DetailField label="Justification">{moc.justification}</DetailField>
                </div>
                {moc.rejection_reason ? (
                  <div className="md:col-span-3">
                    <DetailField label="Rejection reason">{moc.rejection_reason}</DetailField>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="approvals" className="pt-6 space-y-4">
            <Card className="panel-elevation">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">
                  Approval gates
                  {gate.levels.length ? (
                    <span className="ml-2 text-sm font-normal text-[hsl(var(--muted-foreground))]">
                      {gate.complete
                        ? 'all signed'
                        : `level ${gate.outstanding.join(' and ')} outstanding`}
                    </span>
                  ) : null}
                </CardTitle>
                {!addingApprover && !locked ? (
                  <Button variant="outline" size="sm" onClick={() => setAddingApprover(true)}>
                    <Plus className="w-4 h-4 mr-2" /> Add a gate
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent>
                {addingApprover && !locked ? (
                  <form onSubmit={handleAddApprover} className="flex flex-wrap gap-3 items-end mb-5 p-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/30">
                    <div className="min-w-[200px]">
                      <Label htmlFor="approver_role">Role</Label>
                      <Input id="approver_role" value={approverDraft.role}
                        onChange={(e) => setApproverDraft({ ...approverDraft, role: e.target.value })}
                        placeholder="Technical Authority" />
                    </div>
                    <div className="w-32">
                      <Label htmlFor="approver_level">Level</Label>
                      <Input id="approver_level" type="number" min={1} max={10}
                        value={approverDraft.level}
                        onChange={(e) => setApproverDraft({ ...approverDraft, level: e.target.value })} />
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="ghost" onClick={() => setAddingApprover(false)}>Cancel</Button>
                      <Button type="submit" disabled={saving}>Add</Button>
                    </div>
                    <p className="w-full text-xs text-[hsl(var(--muted-foreground))]">
                      You are added as the approver for this gate. Assigning other
                      people needs the member directory, which arrives with the
                      hub at AS11.
                    </p>
                  </form>
                ) : null}

                {approvals.length === 0 ? (
                  <p className="text-sm text-[hsl(var(--muted-foreground))] py-4">
                    No approval gates have been set. A change cannot be
                    implemented until at least one level has signed, so this is
                    the next thing to do. Gates are added by hand: the risk level
                    does not add them.
                  </p>
                ) : (
                  <ul className="divide-y divide-[hsl(var(--border))]">
                    {approvals.map((a) => (
                      <li key={a.id} className="py-4">
                        <div className="flex flex-wrap justify-between items-start gap-3">
                          <div>
                            <p className="font-medium">
                              Level {a.level ?? 1} · {a.role || 'Approver'}
                            </p>
                            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                              {a.status}
                              {a.decision_date ? ` · ${showDate(a.decision_date.slice(0, 10))}` : ''}
                            </p>
                            {a.comments ? (
                              <p className="text-sm mt-1">{a.comments}</p>
                            ) : null}
                          </div>
                          {a.status === 'Pending' && deciding !== a.id && !locked ? (
                            <Button variant="outline" size="sm" onClick={() => { setDeciding(a.id); setDecisionText(''); }}>
                              Record a decision
                            </Button>
                          ) : null}
                        </div>
                        {deciding === a.id && !locked ? (
                          <div className="mt-3 space-y-2">
                            <Textarea rows={2} value={decisionText}
                              onChange={(e) => setDecisionText(e.target.value)}
                              placeholder="Comments. Required for a rejection." />
                            <div className="flex justify-end gap-2">
                              <Button variant="ghost" size="sm" onClick={() => setDeciding(null)}>Cancel</Button>
                              <Button variant="outline" size="sm" disabled={saving || !decisionText.trim()}
                                onClick={() => handleDecision(a, 'Rejected')}>
                                <XCircle className="w-4 h-4 mr-2" /> Reject
                              </Button>
                              <Button size="sm" disabled={saving}
                                onClick={() => handleDecision(a, 'Approved')}>
                                <CheckCircle className="w-4 h-4 mr-2" /> Approve
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="actions" className="pt-6">
            <Card className="panel-elevation">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Actions</CardTitle>
                {!addingAction && !locked ? (
                  <Button variant="outline" size="sm" onClick={() => setAddingAction(true)}>
                    <Plus className="w-4 h-4 mr-2" /> Add an action
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent>
                {addingAction && !locked ? (
                  <form onSubmit={handleAddAction} className="space-y-3 mb-5 p-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/30">
                    <div className="grid grid-cols-1 md:grid-cols-[200px_1fr_180px] gap-3">
                      <div>
                        <Label htmlFor="action_type">When</Label>
                        <select id="action_type" value={actionDraft.action_type}
                          onChange={(e) => setActionDraft({ ...actionDraft, action_type: e.target.value })}
                          className="flex h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm">
                          {ACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <Label htmlFor="action_description">What</Label>
                        <Input id="action_description" value={actionDraft.description}
                          onChange={(e) => setActionDraft({ ...actionDraft, description: e.target.value })}
                          placeholder="Update the P&ID and reissue it" />
                      </div>
                      <div>
                        <Label htmlFor="action_due">Due</Label>
                        <Input id="action_due" type="date" value={actionDraft.due_date}
                          onChange={(e) => setActionDraft({ ...actionDraft, due_date: e.target.value })} />
                      </div>
                    </div>
                    {actionErrors.description ? (
                      <p className="text-xs text-[hsl(var(--destructive))]">{actionErrors.description}</p>
                    ) : null}
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      Pre-implementation actions must be closed before the change
                      goes in. Implementation and post-implementation actions must
                      be closed before it closes.
                    </p>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="ghost" onClick={() => setAddingAction(false)}>Cancel</Button>
                      <Button type="submit" disabled={saving}>Add action</Button>
                    </div>
                  </form>
                ) : null}

                {actions.length === 0 ? (
                  <p className="text-sm text-[hsl(var(--muted-foreground))] py-4">
                    No actions recorded against this change.
                  </p>
                ) : (
                  <ul className="divide-y divide-[hsl(var(--border))]">
                    {actions.map((a) => {
                      const open = !['Complete', 'Cancelled'].includes(a.status);
                      const late = open && a.due_date && daysUntil(a.due_date) < 0;
                      return (
                        <li key={a.id} className="py-4 flex flex-wrap justify-between items-start gap-3">
                          <div className="min-w-0">
                            <p className="text-sm">{a.description}</p>
                            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                              {a.action_type} · {a.status}
                              {a.due_date ? ` · due ${showDate(a.due_date)}` : ''}
                              {late ? ' · overdue' : ''}
                            </p>
                          </div>
                          {open && !locked ? (
                            <div className="flex gap-2">
                              <Button variant="outline" size="sm"
                                onClick={() => handleActionStatus(a, 'Complete')}>
                                Mark complete
                              </Button>
                              <Button variant="ghost" size="sm"
                                onClick={() => handleActionStatus(a, 'Cancelled')}>
                                Cancel
                              </Button>
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="impacts" className="pt-6">
            <Card className="panel-elevation">
              <CardContent className="p-0">
                {moc.impacts?.length ? (
                  <ul className="divide-y divide-[hsl(var(--border))]">
                    {moc.impacts.map((i) => (
                      <li key={i.id} className="px-6 py-4">
                        <div className="flex justify-between items-start gap-4">
                          <p className="font-medium">{i.impact_area}</p>
                          <span className="text-xs text-[hsl(var(--muted-foreground))]">{i.severity}</span>
                        </div>
                        {i.mitigation ? (
                          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                            Mitigation: {i.mitigation}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                    No impact assessment recorded. What a change affects is the
                    basis for the risk level you choose for it.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit" className="pt-6">
            <Card className="panel-elevation">
              <CardContent className="p-6">
                {trail.length ? (
                  <ul className="space-y-3">
                    {trail.map((a) => (
                      <li key={a.id} className="flex justify-between gap-4">
                        <span className="text-sm">{a.action}</span>
                        <span className="text-xs text-[hsl(var(--muted-foreground))] whitespace-nowrap">
                          {a.created_at ? `${formatDistanceToNow(new Date(a.created_at))} ago` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-center text-[hsl(var(--muted-foreground))] py-6">
                    Nothing has been recorded against this change yet.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <ConfirmDelete
          open={confirmingDelete}
          title={`Delete ${moc.moc_code}?`}
          description={`${moc.moc_code} will be deleted permanently. This cannot be undone. A draft that should not go ahead can be cancelled instead, which keeps the record.`}
          confirmLabel="Delete change"
          busy={saving}
          onConfirm={handleDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      </div>
    </MOCPageShell>
  );
}
