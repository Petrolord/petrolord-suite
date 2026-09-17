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
  CAPA_STATUSES,
  CAPA_TYPES,
  CONCESSION_DISPOSITIONS,
  DISPOSITIONS,
  NCR_EFFECTIVENESS_REQUIRED,
  ROOT_CAUSE_CATEGORIES,
  canCloseNcr,
  isCapaOverdue,
  isNcrOverdue,
  ncrAgeDays,
} from '@/lib/qualityAssurance';
import { QAPlanShell, BASE } from './components/QAPlanShell';
import {
  DetailField, EmptyState, ErrorState, GateNotice, Loading, MetricTile, SchemaNotice, WriteFailure,
} from './components/SharedComponents';
import {
  CapaStatusBadge, EffectivenessBadge, NcrStatusBadge, SeverityBadge,
} from './components/QABadges';
import { validateCapa } from './utils/qaPayload';
import { useQualityAssurance } from './hooks/useQualityAssurance';

/**
 * AS7 — one non-conformance, from raising to closure.
 *
 * There was no such page. The register's rows navigated to
 * `${BASE}/ncr/:id`, a route the app never declared, so every click
 * fell through the shell's catch-all onto the dashboard. That was the
 * whole of the NCR lifecycle: an organization could raise a
 * non-conformance and then had nowhere to agree a disposition, record
 * a root cause, add a corrective action, check whether it worked, or
 * close the thing. This page is where those happen, and it is the only
 * caller of the gate in src/lib/qualityAssurance.js that refuses to
 * close a critical or major non-conformance over an unverified action.
 */

const blankCapa = () => ({
  action_type: 'Corrective', description: '', assignee_name: '', due_date: '',
});

export default function NCRDetail() {
  const { ncrId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    ncrs, plans, checkpoints, activityFor, loading, error, refresh, hasAs7Schema,
    updateNcr, setDisposition, closeNcr, voidNcr, addCapas, updateCapa,
    recordEffectiveness, deleteCapa,
  } = useQualityAssurance();

  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cause, setCause] = useState(null);
  const [dispo, setDispo] = useState(null);
  const [newCapa, setNewCapa] = useState(null);
  const [capaErrors, setCapaErrors] = useState({});
  const [checking, setChecking] = useState(null);
  const [effectiveness, setEffectiveness] = useState({ verified: 'true', notes: '' });
  const [closing, setClosing] = useState(false);
  const [closureNotes, setClosureNotes] = useState('');
  const [voiding, setVoiding] = useState(false);
  const [voidReason, setVoidReason] = useState('');

  const today = new Date();
  const ncr = useMemo(() => ncrs.find((n) => n.id === ncrId) || null, [ncrs, ncrId]);
  const capas = useMemo(() => (ncr ? (ncr.capas || []) : []), [ncr]);
  const plan = useMemo(
    () => (ncr?.plan_id ? plans.find((p) => p.id === ncr.plan_id) || null : null),
    [plans, ncr]);
  const checkpoint = useMemo(
    () => (ncr?.checkpoint_id ? checkpoints.find((c) => c.id === ncr.checkpoint_id) || null : null),
    [checkpoints, ncr]);
  const log = useMemo(() => (ncr ? activityFor(ncr.id) : []), [ncr, activityFor]);
  const closure = useMemo(() => (ncr ? canCloseNcr(ncr, capas) : { ok: false }), [ncr, capas]);

  if (loading) return <QAPlanShell><Loading label="Loading the non-conformance..." /></QAPlanShell>;
  if (error) return <QAPlanShell><ErrorState error={error} onRetry={refresh} /></QAPlanShell>;
  if (!hasAs7Schema) return <QAPlanShell><SchemaNotice /></QAPlanShell>;

  if (!ncr) {
    return (
      <QAPlanShell title="Non-conformance not found">
        <EmptyState
          icon={<FileWarning className="w-12 h-12" />}
          title="No such non-conformance"
          description="This NCR is not in your organization's register. It may have been deleted, or the link may be wrong."
          action={<Button onClick={() => navigate(`${BASE}/ncr-register`)}>Back to the register</Button>}
        />
      </QAPlanShell>
    );
  }

  const terminal = ['Closed', 'Voided'].includes(ncr.status);
  const serious = NCR_EFFECTIVENESS_REQUIRED.includes(ncr.severity);

  const run = async (fn, message) => {
    setFailure(null);
    setBusy(true);
    const result = await fn();
    setBusy(false);
    if (!result.success) { setFailure(result.error); return false; }
    if (message) toast({ description: message });
    return true;
  };

  const saveCause = async (e) => {
    e.preventDefault();
    const ok = await run(
      () => updateNcr(ncr.id, {
        ...ncr,
        root_cause: cause.root_cause || null,
        root_cause_category: cause.root_cause_category || null,
        status: ncr.status === 'Open' ? 'Under investigation' : ncr.status,
      }),
      'Investigation saved.',
    );
    if (ok) setCause(null);
  };

  const saveDisposition = async (e) => {
    e.preventDefault();
    const ok = await run(
      () => setDisposition(ncr, {
        disposition: dispo.disposition,
        disposition_rationale: dispo.disposition_rationale,
      }),
      `Disposition agreed: ${dispo.disposition}.`,
    );
    if (ok) setDispo(null);
  };

  const submitCapa = async (e) => {
    e.preventDefault();
    setFailure(null);
    const errs = validateCapa(newCapa);
    setCapaErrors(errs);
    if (Object.keys(errs).length) return;
    const ok = await run(() => addCapas(ncr.id, [newCapa]), 'Action added.');
    if (ok) { setNewCapa(null); setCapaErrors({}); }
  };

  const moveCapa = (capa, status) => run(
    () => updateCapa(capa.id, { ...capa, status }),
    `Action marked ${status.toLowerCase()}.`,
  );

  const submitEffectiveness = async (e) => {
    e.preventDefault();
    const ok = await run(
      () => recordEffectiveness(checking, effectiveness.verified === 'true', effectiveness.notes),
      effectiveness.verified === 'true'
        ? 'Action verified effective.'
        : 'Recorded: the action did not work. Raise another one.',
    );
    if (ok) { setChecking(null); setEffectiveness({ verified: 'true', notes: '' }); }
  };

  const submitClosure = async (e) => {
    e.preventDefault();
    const ok = await run(
      () => closeNcr(ncr, { closure_notes: closureNotes }),
      `${ncr.ncr_code} closed.`,
    );
    if (ok) { setClosing(false); setClosureNotes(''); }
  };

  const submitVoid = async (e) => {
    e.preventDefault();
    const ok = await run(() => voidNcr(ncr, voidReason), `${ncr.ncr_code} voided.`);
    if (ok) { setVoiding(false); setVoidReason(''); }
  };

  const removeCapa = (capa) => run(() => deleteCapa(capa.id), 'Action removed.');

  const age = ncrAgeDays(ncr, today);
  const selectClass = 'h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm';

  return (
    <QAPlanShell
      title={`${ncr.ncr_code}: ${ncr.title}`}
      description={plan ? `Raised against ${plan.plan_code}` : 'Raised outside a quality plan'}
    >
      <div className="space-y-6 animate-in fade-in duration-300 pb-10">
        <WriteFailure error={failure} />

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricTile
            label="Severity" value={ncr.severity}
            hint={serious ? 'Needs a root cause and a verified action' : 'No effectiveness check required'}
            token={serious ? '--destructive' : '--muted-foreground'}
          />
          <MetricTile label="Status" value={ncr.status} token="--primary" />
          <MetricTile
            label="Age" value={age === null ? '-' : `${age} d`}
            hint={ncr.due_date ? `Due ${ncr.due_date}` : 'No due date set'}
            token={isNcrOverdue(ncr, today) ? '--destructive' : '--muted-foreground'}
          />
          <MetricTile
            label="Open actions"
            value={capas.filter((c) => !['Complete', 'Cancelled'].includes(c.status)).length}
            hint={`${capas.length} raised in total`}
            token="--warning"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="panel-elevation lg:col-span-1">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-lg">The non-conformance</CardTitle>
              <div className="flex gap-2 shrink-0">
                <SeverityBadge severity={ncr.severity} />
                <NcrStatusBadge status={ncr.status} />
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <DetailField label="Number">
                <span className="font-mono">{ncr.ncr_code}</span>
              </DetailField>
              <DetailField label="What was found">{ncr.description}</DetailField>
              <DetailField label="Requirement departed from">{ncr.requirement_ref}</DetailField>
              <DetailField label="Quantity or extent affected">{ncr.quantity_affected}</DetailField>
              <div className="grid grid-cols-2 gap-4">
                <DetailField label="Department">{ncr.department}</DetailField>
                <DetailField label="Discipline">{ncr.discipline}</DetailField>
                <DetailField label="Asset">{ncr.asset_id}</DetailField>
                <DetailField label="Supplier">{ncr.supplier}</DetailField>
                <DetailField label="Raised">{ncr.raised_date}</DetailField>
                <DetailField label="Due">{ncr.due_date}</DetailField>
              </div>
              <DetailField label="Quality plan">
                {plan ? (
                  <button type="button" className="text-[hsl(var(--primary))] hover:underline"
                    onClick={() => navigate(`${BASE}/${plan.id}`)}>
                    {plan.plan_code}: {plan.title}
                  </button>
                ) : null}
              </DetailField>
              <DetailField label="Inspection point">
                {checkpoint ? `${checkpoint.item_no} · ${checkpoint.title} (${checkpoint.point_type})` : null}
              </DetailField>
              {ncr.closed_date ? (
                <DetailField label="Closed">{ncr.closed_date}</DetailField>
              ) : null}
              {ncr.closure_notes ? (
                <DetailField label={ncr.status === 'Voided' ? 'Voided because' : 'Closure notes'}>
                  {ncr.closure_notes}
                </DetailField>
              ) : null}
            </CardContent>
          </Card>

          <div className="lg:col-span-2 space-y-6">
            <Card className="panel-elevation">
              <CardHeader className="border-b border-[hsl(var(--border))] pb-4 flex flex-row items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">Disposition</CardTitle>
                  <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                    What happens to the non-conforming item. Use as is and regrade
                    are concessions: a documented decision to live with a departure
                    from specification.
                  </p>
                </div>
                {!terminal ? (
                  <Button size="sm" variant="outline" disabled={busy}
                    onClick={() => setDispo(dispo ? null : {
                      disposition: ncr.disposition || DISPOSITIONS[0],
                      disposition_rationale: ncr.disposition_rationale || '',
                    })}>
                    {ncr.disposition ? 'Change' : 'Agree a disposition'}
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                {ncr.disposition ? (
                  <div className="grid grid-cols-2 gap-4">
                    <DetailField label="Agreed">
                      {ncr.disposition}
                      {CONCESSION_DISPOSITIONS.includes(ncr.disposition) ? (
                        <span className="ml-2 text-xs text-[hsl(var(--warning))]">Concession</span>
                      ) : null}
                    </DetailField>
                    <DetailField label="On">{ncr.disposition_date}</DetailField>
                    <DetailField label="Rationale" className="col-span-2">
                      {ncr.disposition_rationale}
                    </DetailField>
                  </div>
                ) : (
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    No disposition agreed yet. This non-conformance cannot be closed
                    without one.
                  </p>
                )}

                {dispo ? (
                  <form onSubmit={saveDisposition}
                    className="p-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/30 space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium" htmlFor="dispo">Disposition</label>
                      <select id="dispo" className={selectClass} value={dispo.disposition}
                        onChange={(e) => setDispo((d) => ({ ...d, disposition: e.target.value }))}>
                        {DISPOSITIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium" htmlFor="dispo-why">
                        Rationale
                      </label>
                      <Textarea id="dispo-why" rows={3} value={dispo.disposition_rationale}
                        onChange={(e) => setDispo(
                          (d) => ({ ...d, disposition_rationale: e.target.value }))}
                        placeholder="Why this is the right answer for the item. An auditor will ask about a concession." />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setDispo(null)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={busy}>Agree disposition</Button>
                    </div>
                  </form>
                ) : null}
              </CardContent>
            </Card>

            <Card className="panel-elevation">
              <CardHeader className="border-b border-[hsl(var(--border))] pb-4 flex flex-row items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">Investigation</CardTitle>
                  <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                    A disposition deals with the item. The root cause is what stops
                    the same non-conformance arriving again next quarter.
                  </p>
                </div>
                {!terminal ? (
                  <Button size="sm" variant="outline" disabled={busy}
                    onClick={() => setCause(cause ? null : {
                      root_cause: ncr.root_cause || '',
                      root_cause_category: ncr.root_cause_category || '',
                    })}>
                    {ncr.root_cause ? 'Edit' : 'Record the root cause'}
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <DetailField label="Category">{ncr.root_cause_category}</DetailField>
                  <DetailField label="Root cause" className="sm:col-span-2">
                    {ncr.root_cause}
                  </DetailField>
                </div>
                {!ncr.root_cause && serious ? (
                  <GateNotice reason={`A ${String(ncr.severity).toLowerCase()} non-conformance needs a root cause before it closes.`} />
                ) : null}

                {cause ? (
                  <form onSubmit={saveCause}
                    className="p-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/30 space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium" htmlFor="rc-cat">Category</label>
                      <select id="rc-cat" className={selectClass} value={cause.root_cause_category}
                        onChange={(e) => setCause(
                          (c) => ({ ...c, root_cause_category: e.target.value }))}>
                        <option value="">Not categorised</option>
                        {ROOT_CAUSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium" htmlFor="rc">Root cause</label>
                      <Textarea id="rc" rows={3} value={cause.root_cause}
                        onChange={(e) => setCause((c) => ({ ...c, root_cause: e.target.value }))}
                        placeholder="What allowed this to happen, not what happened." />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setCause(null)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={busy}>Save investigation</Button>
                    </div>
                  </form>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>

        <Card className="panel-elevation">
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4 flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Corrective and preventive actions</CardTitle>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                A completed action is not a working action. For a critical or major
                non-conformance, one corrective action must be verified effective
                before this closes.
              </p>
            </div>
            {!terminal ? (
              <Button size="sm" variant="outline" disabled={busy}
                onClick={() => setNewCapa(newCapa ? null : blankCapa())}>
                <Plus className="w-4 h-4 mr-2" /> Add an action
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="p-0">
            {newCapa ? (
              <form onSubmit={submitCapa}
                className="p-5 border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/30 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-3 space-y-1.5">
                    <label className="text-xs font-medium" htmlFor="capa-type">Type</label>
                    <select id="capa-type" className={selectClass} value={newCapa.action_type}
                      onChange={(e) => setNewCapa((c) => ({ ...c, action_type: e.target.value }))}>
                      {CAPA_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="md:col-span-5 space-y-1.5">
                    <label className="text-xs font-medium" htmlFor="capa-desc">
                      What will be done
                    </label>
                    <Input id="capa-desc" value={newCapa.description}
                      onChange={(e) => setNewCapa((c) => ({ ...c, description: e.target.value }))} />
                    {capaErrors.description ? (
                      <p className="text-xs text-[hsl(var(--destructive))]">{capaErrors.description}</p>
                    ) : null}
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-xs font-medium" htmlFor="capa-who">Owner</label>
                    <Input id="capa-who" value={newCapa.assignee_name}
                      onChange={(e) => setNewCapa((c) => ({ ...c, assignee_name: e.target.value }))} />
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-xs font-medium" htmlFor="capa-due">Due</label>
                    <Input id="capa-due" type="date" value={newCapa.due_date}
                      onChange={(e) => setNewCapa((c) => ({ ...c, due_date: e.target.value }))} />
                    {capaErrors.due_date ? (
                      <p className="text-xs text-[hsl(var(--destructive))]">{capaErrors.due_date}</p>
                    ) : null}
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setNewCapa(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={busy}>Add action</Button>
                </div>
              </form>
            ) : null}

            {capas.length === 0 ? (
              <p className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                No corrective or preventive action has been raised against this
                non-conformance.
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
                    {capas.map((c) => (
                      <tr key={c.id} className="border-b border-[hsl(var(--border))] last:border-0">
                        <td className="data-grid-td text-xs">{c.action_type}</td>
                        <td className="data-grid-td">{c.description}</td>
                        <td className="data-grid-td text-xs">{c.assignee_name || 'Unassigned'}</td>
                        <td className="data-grid-td text-xs">
                          <span className={isCapaOverdue(c, today) ? 'text-[hsl(var(--destructive))] font-medium' : ''}>
                            {c.due_date || 'Not set'}
                          </span>
                        </td>
                        <td className="data-grid-td"><CapaStatusBadge status={c.status} /></td>
                        <td className="data-grid-td"><EffectivenessBadge capa={c} /></td>
                        <td className="data-grid-td">
                          <div className="flex flex-wrap gap-1 justify-end">
                            {!terminal && CAPA_STATUSES
                              .filter((s) => s !== c.status)
                              .map((s) => (
                                <Button key={s} size="sm" variant="ghost" disabled={busy}
                                  onClick={() => moveCapa(c, s)}>
                                  {s}
                                </Button>
                              ))}
                            {!terminal && c.status === 'Complete' ? (
                              <Button size="sm" variant="outline" disabled={busy}
                                onClick={() => {
                                  setFailure(null);
                                  setChecking(c);
                                  setEffectiveness({ verified: 'true', notes: '' });
                                }}>
                                Effectiveness
                              </Button>
                            ) : null}
                            {!terminal ? (
                              <Button size="sm" variant="ghost" disabled={busy}
                                onClick={() => removeCapa(c)} title="Remove this action">
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
                  <label className="text-sm font-medium" htmlFor="eff">Did it work?</label>
                  <select id="eff" className={selectClass} value={effectiveness.verified}
                    onChange={(e) => setEffectiveness((s) => ({ ...s, verified: e.target.value }))}>
                    <option value="true">Yes, verified effective</option>
                    <option value="false">No, it did not work</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="eff-notes">
                    What was seen
                  </label>
                  <Textarea id="eff-notes" rows={3} value={effectiveness.notes}
                    onChange={(e) => setEffectiveness((s) => ({ ...s, notes: e.target.value }))}
                    placeholder="How this was checked, and what the check found." />
                  {effectiveness.verified === 'false' ? (
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      A not-effective verdict is the trigger to raise another action,
                      so say what is still happening.
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
                This non-conformance is {String(ncr.status).toLowerCase()}
                {ncr.closed_date ? ` as at ${ncr.closed_date}` : ''}.
              </p>
            ) : (
              <>
                {closure.ok ? (
                  <p className="text-sm">
                    Every condition for closing {ncr.ncr_code} is met.
                  </p>
                ) : (
                  <GateNotice reason={closure.reason} />
                )}
                <div className="flex flex-wrap gap-2">
                  <Button disabled={busy || !closure.ok}
                    onClick={() => { setFailure(null); setClosing((v) => !v); }}>
                    Close this non-conformance
                  </Button>
                  <Button variant="outline" disabled={busy}
                    onClick={() => { setFailure(null); setVoiding((v) => !v); }}>
                    Void it instead
                  </Button>
                </div>

                {closing ? (
                  <form onSubmit={submitClosure} className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium" htmlFor="closure">
                        Closure notes
                      </label>
                      <Textarea id="closure" rows={3} value={closureNotes}
                        onChange={(e) => setClosureNotes(e.target.value)}
                        placeholder="What was done, and on what evidence this is closed." />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setClosing(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={busy}>Close {ncr.ncr_code}</Button>
                    </div>
                  </form>
                ) : null}

                {voiding ? (
                  <form onSubmit={submitVoid} className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium" htmlFor="void">
                        Why was this raised in error?
                      </label>
                      <Textarea id="void" rows={3} value={voidReason}
                        onChange={(e) => setVoidReason(e.target.value)}
                        placeholder="Voiding is the honest alternative to closing something that should never have been raised." />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setVoiding(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" variant="outline" disabled={busy}>
                        Void {ncr.ncr_code}
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
                Nothing recorded against this non-conformance yet.
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
    </QAPlanShell>
  );
}
