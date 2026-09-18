import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, ArrowLeft, Lock, MessageSquarePlus, Trash2 } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import {
  DECISIONS,
  SEVERITIES,
  TRANSITION_ACTOR,
  bySeverityThenAge,
  canClose,
  daysUntil,
  isOverdue,
  isResolved,
  nextStages,
  nextStatuses,
  parseDateOnly,
} from '@/lib/peerReview';
import { PeerReviewShell, BASE } from './components/PeerReviewShell';
import {
  CommentStatusBadge, DecisionBadge, PriorityBadge, SeverityBadge, StageBadge,
} from './components/StatusBadges';
import { ConfirmDelete, DetailField, ErrorState, Loading } from './components/SharedComponents';
import { usePeerReview } from './hooks/usePeerReview';
import { reviewLockReason, validateComment } from './utils/reviewPayload';

const showDate = (v) => {
  const d = parseDateOnly(v);
  return d ? format(d, 'd MMM yyyy') : null;
};

const EMPTY_COMMENT = { comment_text: '', severity: 'Major', discipline: '' };

/**
 * AS5 — the review, its comments and its audit trail.
 *
 * Everything on this page was written to a module-level array. Adding a
 * comment toasted "Your comment has been successfully registered" and
 * registered it nowhere. Changing the stage toasted "Action recorded.
 * Backend process triggered." There was no backend process. Reloading
 * the page removed every technical comment anyone had written.
 *
 * The two things that make this an assurance tool rather than a list
 * are here now: a comment moves along a disposition its status
 * actually permits, and a review cannot be closed over an unresolved
 * Critical or Major finding.
 */
export default function ReviewDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    reviews, auditFor, loading, error,
    addComment, disposeComment, changeStage, deleteReview, refresh,
  } = usePeerReview();

  const [raising, setRaising] = useState(false);
  const [draft, setDraft] = useState(EMPTY_COMMENT);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState(null); // { commentId, to }
  const [actionText, setActionText] = useState('');
  const [closing, setClosing] = useState(false);
  const [decision, setDecision] = useState('Approved');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const review = reviews.find((r) => r.id === id);
  const comments = useMemo(
    () => [...(review?.comments || [])].sort(bySeverityThenAge),
    [review],
  );
  const closeVerdict = useMemo(() => canClose(comments), [comments]);

  if (loading) return <PeerReviewShell><Loading label="Loading the review..." /></PeerReviewShell>;
  if (error) return <PeerReviewShell><ErrorState error={error} onRetry={refresh} /></PeerReviewShell>;
  if (!review) {
    return (
      <PeerReviewShell>
        <div className="py-16 text-center text-[hsl(var(--muted-foreground))]">
          That review is not in this organization&apos;s register.
        </div>
      </PeerReviewShell>
    );
  }

  const trail = auditFor(review.id);
  // AS13: a Closed or Cancelled review is a record. The hook refuses
  // these writes too; this hides the buttons that would try.
  const locked = reviewLockReason(review);
  // Disciplines already in play on this review, offered as suggestions.
  const knownDisciplines = [...new Set([
    review.discipline,
    ...(review.participants || []).map((p) => p.discipline),
    ...(review.comments || []).map((c) => c.discipline),
  ].filter(Boolean))];
  const late = isOverdue(review);
  const days = daysUntil(review.due_date);

  const handleRaise = async (e) => {
    e.preventDefault();
    const found = validateComment(draft);
    if (Object.keys(found).length) { setErrors(found); return; }
    setSaving(true);
    const result = await addComment(review.id, draft);
    setSaving(false);
    if (!result.success) {
      toast({ title: 'The comment was not saved', description: result.error, variant: 'destructive' });
      return;
    }
    setRaising(false); setDraft(EMPTY_COMMENT); setErrors({});
    toast({ description: `${result.data.severity} comment raised.` });
  };

  const handleDispose = async (comment, to) => {
    setSaving(true);
    const result = await disposeComment(comment, to, { text: actionText });
    setSaving(false);
    if (!result.success) {
      toast({ title: 'Not recorded', description: result.error, variant: 'destructive' });
      return;
    }
    setActing(null); setActionText('');
    toast({ description: `Comment ${to.toLowerCase()}.` });
  };

  const handleStage = async (stage) => {
    if (stage === 'Closed') { setClosing(true); return; }
    const result = await changeStage(review, stage);
    toast(result.success
      ? { description: `Moved to ${stage}.` }
      : { title: 'Stage not changed', description: result.error, variant: 'destructive' });
  };

  const handleClose = async (e) => {
    e.preventDefault();
    setSaving(true);
    const result = await changeStage(review, 'Closed', decision);
    setSaving(false);
    if (!result.success) {
      toast({ title: 'The review was not closed', description: result.error, variant: 'destructive' });
      return;
    }
    setClosing(false);
    toast({ description: `Closed as ${decision.toLowerCase()}.` });
  };

  const handleDelete = async () => {
    setSaving(true);
    const result = await deleteReview(review.id);
    setSaving(false);
    setConfirmingDelete(false);
    if (result.success) {
      toast({ description: `${review.review_code} deleted.` });
      navigate(`${BASE}/register`);
    } else {
      toast({ title: 'Not deleted', description: result.error, variant: 'destructive' });
    }
  };

  return (
    <PeerReviewShell>
      <div className="space-y-6 animate-in fade-in duration-500 max-w-6xl mx-auto pb-12">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-[hsl(var(--border))] pb-6">
          <div className="flex gap-4">
            <Button variant="ghost" size="icon" className="mt-1" aria-label="Back"
              onClick={() => navigate(`${BASE}/register`)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <span className="px-2 py-0.5 bg-[hsl(var(--secondary))] rounded text-xs font-mono border border-[hsl(var(--border))]">
                  {review.review_code}
                </span>
                <StageBadge stage={review.stage} />
                <PriorityBadge priority={review.priority} />
                <DecisionBadge decision={review.decision} />
              </div>
              <h2 className="text-2xl font-bold tracking-tight">{review.title}</h2>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-2">
                {[review.review_type, review.project_asset, review.discipline]
                  .filter(Boolean).join(' · ')}
              </p>
              {review.due_date ? (
                <p className={`text-sm mt-1 ${late ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--muted-foreground))]'}`}>
                  Due {showDate(review.due_date)}
                  {late ? ` · ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue` : ''}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!raising && !locked ? (
              <Button variant="outline" onClick={() => setRaising(true)}>
                <MessageSquarePlus className="w-4 h-4 mr-2" /> Raise a comment
              </Button>
            ) : null}
            {nextStages(review.stage).map((stage) => (
              <Button key={stage}
                variant={stage === 'Closed' ? 'default' : 'outline'}
                onClick={() => handleStage(stage)}>
                {stage === 'Cancelled' ? 'Cancel review' : `Move to ${stage}`}
              </Button>
            ))}
            {review.stage === 'Draft' ? (
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

        {/* The gate. Stated before anyone reaches for the close button. */}
        {!closeVerdict.ok && review.stage === 'Verification' ? (
          <div className="p-4 rounded-lg border border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5 text-sm flex gap-3">
            <AlertTriangle className="w-5 h-5 text-[hsl(var(--warning))] shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">This review cannot be closed yet</p>
              <p className="text-[hsl(var(--muted-foreground))] mt-1">{closeVerdict.reason}</p>
            </div>
          </div>
        ) : null}

        {closing ? (
          <Card className="panel-elevation">
            <CardHeader><CardTitle className="text-lg">Close this review</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleClose} className="flex flex-wrap items-end gap-4">
                <div className="min-w-[240px]">
                  <Label htmlFor="decision">Decision</Label>
                  <select id="decision" value={decision} onChange={(e) => setDecision(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm">
                    {DECISIONS.filter((d) => d !== 'Pending').map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" onClick={() => setClosing(false)}>Cancel</Button>
                  <Button type="submit" disabled={saving || !closeVerdict.ok}>
                    {saving ? 'Closing...' : 'Close the review'}
                  </Button>
                </div>
                {!closeVerdict.ok ? (
                  <p className="w-full text-xs text-[hsl(var(--destructive))]">{closeVerdict.reason}</p>
                ) : null}
              </form>
            </CardContent>
          </Card>
        ) : null}

        {raising && !locked ? (
          <Card className="panel-elevation">
            <CardHeader><CardTitle className="text-lg">Raise a comment</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleRaise} className="space-y-4">
                <div>
                  <Label htmlFor="comment_text">The comment</Label>
                  <Textarea id="comment_text" rows={3} value={draft.comment_text}
                    onChange={(e) => setDraft({ ...draft, comment_text: e.target.value })}
                    placeholder="What is wrong or unclear, and what would resolve it." />
                  {errors.comment_text ? (
                    <p className="text-xs text-[hsl(var(--destructive))] mt-1">{errors.comment_text}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-4 items-end">
                  <div className="min-w-[200px]">
                    <Label htmlFor="comment_discipline">Discipline</Label>
                    <Input id="comment_discipline" list="review-disciplines"
                      value={draft.discipline}
                      onChange={(e) => setDraft({ ...draft, discipline: e.target.value })}
                      placeholder="Process, Structural, Subsurface" />
                    <datalist id="review-disciplines">
                      {knownDisciplines.map((d) => <option key={d} value={d} />)}
                    </datalist>
                  </div>
                  <div className="min-w-[180px]">
                    <Label htmlFor="severity">Severity</Label>
                    <select id="severity" value={draft.severity}
                      onChange={(e) => setDraft({ ...draft, severity: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm">
                      {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] flex-1 min-w-[240px]">
                    Critical and Major comments must be resolved before the
                    review can be closed. Minor and Editorial ones do not block.
                  </p>
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost"
                      onClick={() => { setRaising(false); setErrors({}); }}>Cancel</Button>
                    <Button type="submit" disabled={saving}>
                      {saving ? 'Saving...' : 'Raise comment'}
                    </Button>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}

        <Tabs defaultValue="comments" className="w-full">
          <TabsList className="bg-transparent border-b border-[hsl(var(--border))] w-full justify-start rounded-none h-auto p-0 space-x-6">
            {[['comments', `Comments (${comments.length})`],
              ['overview', 'Overview'],
              ['team', `Team (${review.participants?.length || 0})`],
              ['audit', `Audit trail (${trail.length})`]].map(([value, label]) => (
                <TabsTrigger key={value} value={value}
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-[hsl(var(--primary))] data-[state=active]:bg-transparent px-1 pb-3">
                  {label}
                </TabsTrigger>
              ))}
          </TabsList>

          <TabsContent value="comments" className="pt-6">
            {comments.length === 0 ? (
              <Card className="panel-elevation">
                <CardContent className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                  No comments have been raised against this review yet.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {comments.map((c) => {
                  const options = nextStatuses(c.status || 'Open');
                  return (
                    <Card key={c.id} className="panel-elevation">
                      <CardContent className="p-5 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <SeverityBadge severity={c.severity} />
                          <CommentStatusBadge status={c.status} />
                          {c.discipline ? (
                            <span className="text-xs text-[hsl(var(--muted-foreground))]">{c.discipline}</span>
                          ) : null}
                          <span className="text-xs text-[hsl(var(--muted-foreground))] ml-auto">
                            {c.created_at ? `${formatDistanceToNow(new Date(c.created_at))} ago` : ''}
                          </span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{c.comment_text}</p>

                        {c.response_text ? (
                          <div className="pl-4 border-l-2 border-[hsl(var(--border))]">
                            <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Response</p>
                            <p className="text-sm whitespace-pre-wrap mt-1">{c.response_text}</p>
                          </div>
                        ) : null}

                        {locked ? null : acting?.commentId === c.id ? (
                          <div className="space-y-2 pt-2 border-t border-[hsl(var(--border))]">
                            <Textarea rows={2} value={actionText}
                              onChange={(e) => setActionText(e.target.value)}
                              placeholder={acting.to === 'Responded'
                                ? 'How the comment was addressed, and where.'
                                : 'Why, so the author knows what to change.'} />
                            <div className="flex justify-end gap-2">
                              <Button variant="ghost" size="sm"
                                onClick={() => { setActing(null); setActionText(''); }}>Cancel</Button>
                              <Button size="sm" disabled={saving || !actionText.trim()}
                                onClick={() => handleDispose(c, acting.to)}>
                                Record
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {options.map((to) => (
                              <Button key={to} variant="outline" size="sm"
                                onClick={() => {
                                  // Verified and Closed need no text; the
                                  // other two are an exchange.
                                  if (to === 'Verified' || to === 'Closed' || to === 'Withdrawn') {
                                    handleDispose(c, to);
                                  } else {
                                    setActing({ commentId: c.id, to });
                                    setActionText('');
                                  }
                                }}>
                                {to}
                                <span className="ml-1 text-[hsl(var(--muted-foreground))]">
                                  ({TRANSITION_ACTOR[to]})
                                </span>
                              </Button>
                            ))}
                            {!options.length ? (
                              <span className="text-xs text-[hsl(var(--muted-foreground))]">
                                This comment is closed out.
                              </span>
                            ) : null}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="overview" className="pt-6">
            <Card className="panel-elevation">
              <CardContent className="p-6 grid grid-cols-1 md:grid-cols-3 gap-5">
                <DetailField label="Review type">{review.review_type}</DetailField>
                <DetailField label="Project or asset">{review.project_asset}</DetailField>
                <DetailField label="Department">{review.department}</DetailField>
                <DetailField label="Discipline">{review.discipline}</DetailField>
                <DetailField label="Target completion">{showDate(review.due_date)}</DetailField>
                <DetailField label="Open comments">
                  {comments.filter((c) => !isResolved(c)).length}
                </DetailField>
                <div className="md:col-span-3">
                  <DetailField label="Scope">{review.scope_description}</DetailField>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="team" className="pt-6">
            <Card className="panel-elevation">
              <CardContent className="p-0">
                {review.participants?.length ? (
                  <ul className="divide-y divide-[hsl(var(--border))]">
                    {review.participants.map((p) => (
                      <li key={p.id} className="px-6 py-4 flex justify-between items-center gap-4">
                        <div>
                          <p className="font-medium">{p.display_name || 'Unnamed'}</p>
                          {p.discipline ? (
                            <p className="text-xs text-[hsl(var(--muted-foreground))]">{p.discipline}</p>
                          ) : null}
                        </div>
                        <span className="text-sm text-[hsl(var(--muted-foreground))]">{p.role}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                    No team recorded for this review.
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
                    Nothing has been recorded against this review yet. Every
                    comment, disposition and stage change is written here as it
                    happens.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <ConfirmDelete
          open={confirmingDelete}
          title={`Delete ${review.review_code}?`}
          description={`${review.review_code} will be deleted permanently. This cannot be undone. A review that should not go ahead can be cancelled instead, which keeps its record.`}
          confirmLabel="Delete review"
          busy={saving}
          onConfirm={handleDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      </div>
    </PeerReviewShell>
  );
}
