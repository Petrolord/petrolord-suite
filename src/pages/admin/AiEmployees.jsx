import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Bot, Check, Loader2, RefreshCw, X } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { AccountScope, AccountPage, AccountHeader, accountCallout, accountEmpty } from '@/components/account/accountChrome';
import {
  autonomyLabel, toggledEmployeeStatus, reviewPatch, taskPreview, weeklyScorecard, pct, LIMITS,
} from '@/lib/aiEmployees';
import { isEmailKind, emailPreview, EMAIL_LIMITS } from '@/lib/aiEmailDraft';

// AI employees register, approval queue and action log. Super-admin only:
// the route is wrapped in SuperAdminRoute and every ai_* table's policies
// are public.is_super_admin(), so nobody else can read or review.
// Shadow mode: the worker proposes, a human approves here, and only then
// does tools/ai-employees/youtube/execute.mjs act on the task. Email drafts
// (tools/ai-employees/email) show a sandboxed preview (no scripts) and the
// facts the reviewer must fill in before tools/ai-employees/email/execute.mjs
// will create the Brevo campaign.

const day = (iso) => (iso ? String(iso).slice(0, 10) : 'Not set');
const when = (iso) => (iso ? String(iso).slice(0, 16).replace('T', ' ') : '');

function ListingPreview({ listing, editable, edits, setEdits }) {
  return (
    <div className="space-y-3 text-sm">
      {editable ? (
        <>
          <label className="block">
            <span className="text-xs font-medium text-pl-muted">Title ({(edits.title ?? listing.title).length}/{LIMITS.title})</span>
            <Input value={edits.title ?? listing.title} maxLength={LIMITS.title} onChange={(e) => setEdits((s) => ({ ...s, title: e.target.value }))} data-testid="ai-task-edit-title" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-pl-muted">Description</span>
            <Textarea rows={10} value={edits.description ?? listing.description} maxLength={LIMITS.description} onChange={(e) => setEdits((s) => ({ ...s, description: e.target.value }))} data-testid="ai-task-edit-description" />
          </label>
        </>
      ) : (
        <>
          <p className="font-medium text-pl-text">{listing.title}</p>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-pl-sunken p-3 font-sans text-pl-text">{listing.description}</pre>
        </>
      )}
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        <div><dt className="inline text-pl-muted">Video: </dt><dd className="inline">{listing.videoKey || 'Not set'}</dd></div>
        <div><dt className="inline text-pl-muted">Privacy: </dt><dd className="inline">{listing.privacy}</dd></div>
        <div><dt className="inline text-pl-muted">Playlist: </dt><dd className="inline">{listing.playlist || 'None'}</dd></div>
        <div><dt className="inline text-pl-muted">Scheduled: </dt><dd className="inline">{listing.scheduledLabel}</dd></div>
        <div><dt className="inline text-pl-muted">Captions: </dt><dd className="inline">{listing.captions ? 'Yes' : 'No'}</dd></div>
      </dl>
      {listing.chapters.length > 0 && (
        <div>
          <p className="text-xs font-medium text-pl-muted">Chapters</p>
          <ul className="mt-1 space-y-0.5">
            {listing.chapters.map((c) => <li key={`${c.t}-${c.label}`}><span className="tabular-nums text-pl-muted">{c.t}</span> {c.label}</li>)}
          </ul>
        </div>
      )}
      {listing.tags.length > 0 && (
        <p><span className="text-pl-muted">Tags: </span>{listing.tags.join(', ')}</p>
      )}
    </div>
  );
}

function EmailPreview({ email, editable, edits, setEdits }) {
  const facts = { ...email.facts, ...(edits.facts || {}) };
  const setFact = (ph, v) => setEdits((s) => ({ ...s, facts: { ...(s.facts || {}), [ph]: v } }));
  const localValue = (iso) => (iso ? new Date(new Date(iso).getTime() + 3600e3).toISOString().slice(0, 16) : '');
  return (
    <div className="space-y-3 text-sm" data-testid="ai-email-preview">
      {editable ? (
        <>
          <label className="block">
            <span className="text-xs font-medium text-pl-muted">Subject ({(edits.subject ?? email.subject).length}/{EMAIL_LIMITS.subject})</span>
            <Input value={edits.subject ?? email.subject} maxLength={EMAIL_LIMITS.subject} onChange={(e) => setEdits((s) => ({ ...s, subject: e.target.value }))} data-testid="ai-email-edit-subject" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-pl-muted">Preheader (the line after the subject in the inbox)</span>
            <Input value={edits.preheader ?? email.preheader} maxLength={EMAIL_LIMITS.preheader} onChange={(e) => setEdits((s) => ({ ...s, preheader: e.target.value }))} data-testid="ai-email-edit-preheader" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-pl-muted">Send at (Lagos time)</span>
            <Input
              type="datetime-local"
              value={edits.scheduled_local ?? localValue(email.scheduledAt)}
              onChange={(e) => setEdits((s) => ({ ...s, scheduled_local: e.target.value, scheduled_at: e.target.value ? new Date(`${e.target.value}:00+01:00`).toISOString() : undefined }))}
              data-testid="ai-email-edit-time"
            />
          </label>
        </>
      ) : (
        <>
          <p className="font-medium text-pl-text">{email.subject}</p>
          <p className="text-pl-muted">{email.preheader}</p>
        </>
      )}
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1">
        <div><dt className="inline text-pl-muted">Scheduled: </dt><dd className="inline">{email.scheduledLabel}</dd></div>
        <div><dt className="inline text-pl-muted">From: </dt><dd className="inline">{email.sender || 'Not set'}{email.replyTo ? `, reply-to ${email.replyTo}` : ''}</dd></div>
        <div>
          <dt className="text-pl-muted">Audience</dt>
          <dd><ul className="list-disc pl-5">{email.audience.map((a) => <li key={a.key}>{a.label} <span className="text-pl-muted">({a.key})</span></li>)}</ul></dd>
        </div>
      </dl>
      {email.placeholders.length > 0 && (
        <div className={accountCallout(email.unfilled.length ? 'warning' : 'info')} data-testid="ai-email-placeholders">
          <p className="font-medium">Facts to fill in before approving ({email.unfilled.length ? `${email.unfilled.length} still missing; the email will not be sent until they are filled` : 'all filled'})</p>
          <div className="mt-2 space-y-2">
            {email.placeholders.map((ph) => (
              <label key={ph} className="block">
                <span className="text-xs font-medium">{ph}</span>
                {editable ? (
                  <Input value={facts[ph] || ''} onChange={(e) => setFact(ph, e.target.value)} data-testid="ai-email-fact" />
                ) : <span className="ml-2">{facts[ph] || 'Not filled'}</span>}
              </label>
            ))}
          </div>
        </div>
      )}
      {email.notes.length > 0 && (
        <div>
          <p className="text-xs font-medium text-pl-muted">Notes for the reviewer</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">{email.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </div>
      )}
      <div>
        <p className="text-xs font-medium text-pl-muted">Preview</p>
        <iframe
          title={`Email preview: ${email.subject}`}
          srcDoc={email.html}
          sandbox=""
          className="mt-1 h-[36rem] w-full rounded-md border border-pl-border bg-white"
          data-testid="ai-email-iframe"
        />
      </div>
      <details>
        <summary className="cursor-pointer text-xs font-medium text-pl-muted">Text version</summary>
        <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-pl-sunken p-3 font-sans text-pl-text" data-testid="ai-email-text">{email.text}</pre>
      </details>
      {editable && (
        <details>
          <summary className="cursor-pointer text-xs font-medium text-pl-muted">Edit the HTML or text directly (rarely needed)</summary>
          <label className="mt-2 block">
            <span className="text-xs font-medium text-pl-muted">HTML (keep the {'{{ unsubscribe }}'} link)</span>
            <Textarea rows={8} className="font-mono text-xs" value={edits.html ?? email.html} onChange={(e) => setEdits((s) => ({ ...s, html: e.target.value }))} />
          </label>
          <label className="mt-2 block">
            <span className="text-xs font-medium text-pl-muted">Text version</span>
            <Textarea rows={8} value={edits.text ?? email.text} onChange={(e) => setEdits((s) => ({ ...s, text: e.target.value }))} />
          </label>
        </details>
      )}
    </div>
  );
}

function TaskCard({ task, reviewerEmail, onReviewed }) {
  const { toast } = useToast();
  const [edits, setEdits] = useState({});
  // email drafts preview with the reviewer's facts and edits applied, so the iframe shows what will be sent
  const preview = useMemo(() => {
    if (!isEmailKind(task.kind) || !Object.keys(edits).length) return taskPreview(task);
    const merged = { ...task.payload };
    for (const k of ['subject', 'preheader', 'html', 'text', 'scheduled_at']) if (typeof edits[k] === 'string' && edits[k]) merged[k] = edits[k];
    merged.facts = { ...(task.payload?.facts || {}), ...(edits.facts || {}) };
    return { kind: 'email', email: emailPreview(merged) };
  }, [task, edits]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const proposed = task.status === 'proposed';

  const review = async (decision) => {
    setBusy(true);
    try {
      const { scheduled_local: _local, ...cleanEdits } = edits;
      const patch = reviewPatch(task, { decision, note, reviewerEmail, edits: decision === 'approve' ? cleanEdits : null });
      const { error } = await supabase.from('ai_employee_tasks').update(patch).eq('id', task.id).eq('status', 'proposed');
      if (error) throw error;
      await supabase.from('ai_employee_actions').insert({
        employee_id: task.employee_id,
        task_id: task.id,
        action: decision === 'approve' ? 'task_approved' : 'task_rejected',
        detail: { reviewer_email: patch.reviewer_email, note: patch.review_note, edited: Boolean(patch.payload) },
      });
      toast({ title: decision === 'approve' ? 'Approved' : 'Rejected', description: patch.title || task.title });
      onReviewed();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Could not save the review', description: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3 p-4" data-testid="ai-task">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-pl-muted">{task.kind.replace(/_/g, ' ')} · {when(task.created_at)}</p>
          <p className="font-medium text-pl-text">{task.title}</p>
        </div>
        <span className="rounded-full border border-pl-border px-2 py-0.5 text-xs text-pl-muted">{task.status}</span>
      </div>
      {preview.kind === 'youtube_listing' ? (
        <ListingPreview listing={preview.listing} editable={proposed} edits={edits} setEdits={setEdits} />
      ) : preview.kind === 'email' ? (
        <EmailPreview email={preview.email} editable={proposed} edits={edits} setEdits={setEdits} />
      ) : (
        <dl className="space-y-1 text-sm">
          {preview.fields.map(([k, v]) => (
            <div key={k}><dt className="text-pl-muted">{k}</dt><dd className="whitespace-pre-wrap">{v}</dd></div>
          ))}
        </dl>
      )}
      {proposed ? (
        <div className="space-y-2">
          <Textarea rows={2} placeholder="Note for the log (optional)" value={note} maxLength={LIMITS.note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => review('approve')} disabled={busy} data-testid="ai-task-approve"><Check className="mr-2 h-4 w-4" />Approve</Button>
            <Button variant="outline" onClick={() => review('reject')} disabled={busy} data-testid="ai-task-reject"><X className="mr-2 h-4 w-4" />Reject</Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-pl-muted">
          {task.reviewer_email ? `Reviewed by ${task.reviewer_email} on ${when(task.reviewed_at)}.` : ''}
          {task.review_note ? ` Note: ${task.review_note}` : ''}
        </p>
      )}
    </Card>
  );
}

export default function AiEmployees() {
  const { toast } = useToast();
  const { user, actualUser } = useAuth();
  const reviewerEmail = actualUser?.email || user?.email || '';
  const [employees, setEmployees] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const loadEmployees = useCallback(async () => {
    const { data, error } = await supabase.from('ai_employees').select('*').order('created_at');
    if (error) throw error;
    setEmployees(data || []);
    setSelectedId((cur) => cur || data?.[0]?.id || null);
  }, []);

  const loadQueue = useCallback(async (id) => {
    if (!id) { setTasks([]); setActions([]); return; }
    const [t, a] = await Promise.all([
      supabase.from('ai_employee_tasks').select('*').eq('employee_id', id).order('created_at', { ascending: false }).limit(500),
      supabase.from('ai_employee_actions').select('*').eq('employee_id', id).order('created_at', { ascending: false }).limit(200),
    ]);
    if (t.error) throw t.error;
    if (a.error) throw a.error;
    setTasks(t.data || []);
    setActions(a.data || []);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      await loadEmployees();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Could not load the register', description: e.message });
    } finally {
      setLoading(false);
    }
  }, [loadEmployees, toast]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => {
    loadQueue(selectedId).catch((e) => toast({ variant: 'destructive', title: 'Could not load the queue', description: e.message }));
  }, [selectedId, loadQueue, toast]);

  const refresh = () => { loadAll(); loadQueue(selectedId).catch(() => {}); };

  const togglePause = async (emp) => {
    const next = toggledEmployeeStatus(emp.status);
    if (next === emp.status) return;
    const { error } = await supabase.from('ai_employees').update({ status: next }).eq('id', emp.id);
    if (error) { toast({ variant: 'destructive', title: 'Could not change the status', description: error.message }); return; }
    await supabase.from('ai_employee_actions').insert({
      employee_id: emp.id, action: next === 'paused' ? 'employee_paused' : 'employee_resumed', detail: { by: reviewerEmail },
    });
    toast({ title: next === 'paused' ? 'Paused' : 'Resumed', description: emp.role_title });
    refresh();
  };

  const selected = employees.find((e) => e.id === selectedId) || null;
  const score = useMemo(() => weeklyScorecard(tasks), [tasks]);
  const visibleTasks = showAll ? tasks : tasks.filter((t) => t.status === 'proposed');

  return (
    <AccountScope>
      <Helmet><title>AI employees</title></Helmet>
      <AccountPage width="max-w-7xl">
        <AccountHeader
          eyebrow="Admin"
          icon={Bot}
          title="AI employees"
          description="The register, the approval queue and the action log. Nothing an AI employee proposes goes out until a person approves it here."
          backTo="/super-admin"
          backLabel="Back to the console"
          actions={<Button variant="outline" onClick={refresh}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>}
        />

        {loading ? (
          <p className="flex items-center gap-2 text-sm text-pl-muted"><Loader2 className="h-4 w-4 animate-spin" />Loading</p>
        ) : !employees.length ? (
          <div className={accountEmpty}>No AI employees yet. The register fills once the ai_employees migration is applied.</div>
        ) : (
          <>
            <Card className="overflow-x-auto p-4">
              <h2 className="mb-3 text-lg font-semibold text-pl-text">Register</h2>
              <table className="w-full text-sm" data-testid="ai-register">
                <thead>
                  <tr className="text-left text-pl-muted">
                    <th className="pb-2 pr-3 font-medium">Role</th><th className="pb-2 pr-3 font-medium">Manager</th><th className="pb-2 pr-3 font-medium">Next manager</th>
                    <th className="pb-2 pr-3 font-medium">Autonomy</th><th className="pb-2 pr-3 font-medium">Status</th><th className="pb-2 pr-3 font-medium">Next review</th><th className="pb-2 font-medium">On</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((e) => (
                    <tr key={e.id} className={`cursor-pointer border-t border-pl-border align-top ${e.id === selectedId ? 'bg-pl-sunken' : ''}`} onClick={() => setSelectedId(e.id)}>
                      <td className="py-2 pr-3"><span className="font-medium">{e.role_title}</span><div className="text-pl-muted">{e.slug}</div></td>
                      <td className="py-2 pr-3">{e.manager_email}</td>
                      <td className="py-2 pr-3">{e.next_manager_email || 'None'}</td>
                      <td className="py-2 pr-3">{autonomyLabel(e.autonomy_step)}</td>
                      <td className="py-2 pr-3">{e.status}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{day(e.next_review_at)}</td>
                      <td className="py-2" onClick={(ev) => ev.stopPropagation()}>
                        <Switch
                          checked={e.status === 'active'}
                          disabled={e.status === 'retired'}
                          onCheckedChange={() => togglePause(e)}
                          aria-label={e.status === 'active' ? `Pause ${e.role_title}` : `Resume ${e.role_title}`}
                          data-testid="ai-employee-switch"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            {selected && (
              <>
                {selected.status !== 'active' && (
                  <p className={accountCallout('warning')}>{selected.role_title} is {selected.status}. The worker will not act on any task until it is resumed.</p>
                )}

                <Card className="p-4" data-testid="ai-scorecard">
                  <h2 className="text-lg font-semibold text-pl-text">This week</h2>
                  <p className="text-xs text-pl-muted">Week starting {score.weekStart} (UTC). A first scorecard; watch time and subscribers join it once the channel reports are wired in.</p>
                  <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                    {[['Proposed', score.proposed], ['Approved', score.approved], ['Rejected', score.rejected], ['Done', score.done], ['Rejection rate', pct(score.rejectionRate)]].map(([k, v]) => (
                      <div key={k} className="rounded-md bg-pl-sunken p-3"><dt className="text-xs text-pl-muted">{k}</dt><dd className="text-xl font-semibold tabular-nums text-pl-text">{v}</dd></div>
                    ))}
                  </dl>
                </Card>

                <div className="grid gap-6 lg:grid-cols-3">
                  <section className="space-y-3 lg:col-span-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-lg font-semibold text-pl-text">Approval queue</h2>
                      <Button variant="outline" size="sm" onClick={() => setShowAll((s) => !s)}>{showAll ? 'Show proposed only' : 'Show all tasks'}</Button>
                    </div>
                    {visibleTasks.length ? visibleTasks.map((t) => (
                      <TaskCard key={t.id} task={t} reviewerEmail={reviewerEmail} onReviewed={() => loadQueue(selectedId).catch(() => {})} />
                    )) : <div className={accountEmpty}>{showAll ? 'No tasks yet.' : 'Nothing waiting for review.'}</div>}
                  </section>

                  <section className="space-y-3">
                    <h2 className="text-lg font-semibold text-pl-text">Action log</h2>
                    <Card className="max-h-[48rem] overflow-auto p-4">
                      {actions.length ? (
                        <ol className="space-y-2 text-sm" data-testid="ai-action-log">
                          {actions.map((a) => (
                            <li key={a.id} className="border-b border-pl-border pb-2 last:border-0">
                              <p className="text-xs text-pl-muted">{when(a.created_at)}</p>
                              <p className="font-medium text-pl-text">{a.action.replace(/_/g, ' ')}</p>
                              {a.detail && Object.keys(a.detail).length > 0 && (
                                <p className="break-words text-xs text-pl-muted">{Object.entries(a.detail).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ')}</p>
                              )}
                            </li>
                          ))}
                        </ol>
                      ) : <p className="text-sm text-pl-muted">No actions logged yet.</p>}
                    </Card>
                  </section>
                </div>
              </>
            )}
          </>
        )}
      </AccountPage>
    </AccountScope>
  );
}
