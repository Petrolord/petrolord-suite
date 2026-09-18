import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { BookOpen, GitBranch, Plus, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import {
  APPLICATION_OUTCOMES,
  ROOT_CAUSE_CATEGORIES,
  SUITE_TARGET_TYPES,
  TARGET_TYPES,
  canValidate,
  canAdvanceLesson,
  hasSubstance,
  missingSubstance,
  nextLessonStatuses,
  reuseRecord,
  toDateOnlyString,
} from '@/lib/lessonsLearned';
import { CATEGORIES as MOC_CATEGORIES, CHANGE_TYPES, PRIORITIES } from '@/lib/managementOfChange';
import { LessonsShell, BASE } from './components/LessonsShell';
import {
  DetailField, EmptyState, ErrorState, GateNotice, Loading, MetricTile, SchemaNotice, WriteFailure,
} from './components/SharedComponents';
import {
  LessonStatusBadge, OutcomeBadge, ScopeBadge, UnappliedBadge,
} from './components/LessonBadges';
import {
  canEditLesson, canRemoveApplication, successorCandidates, validateApplication, validateMocPush,
  validateRiskPush,
} from './utils/lessonPayload';
import { useLessonsLearned } from './hooks/useLessonsLearned';

/**
 * AS9 — one lesson, and the record of where it went.
 *
 * The page this replaces read
 *
 *   const lesson = MOCK_LESSONS.find(l => l.id === id) || MOCK_LESSONS[0];
 *
 * commented `// fallback for demo`, so asking for a lesson that was
 * not in the five invented ones showed a different lesson entirely —
 * the AS4 Document Control defect in a second app. Its Share, Print
 * and Edit buttons all toasted "🚧 This feature isn't implemented
 * yet!".
 *
 * The lower half of this page is the reason the roadmap kept this app:
 * a lesson is pushed into the risk register or into Management of
 * Change from here, and the row it creates is linked back.
 */

const blankApplication = () => ({
  target_type: 'Procedure',
  target_risk_id: '',
  target_moc_id: '',
  reference: '',
  outcome: 'Adopted',
  notes: '',
  applied_on: toDateOnlyString(new Date()),
});

const blankRiskPush = (lesson) => ({
  title: lesson?.title || '',
  category: lesson?.category || '',
  likelihood: 3,
  impact: 3,
  status: 'Open',
  description: '',
  notes: '',
});

const blankMocPush = (lesson) => ({
  title: lesson?.recommendation ? lesson.recommendation.slice(0, 120) : (lesson?.title || ''),
  category: MOC_CATEGORIES[0],
  type: 'Permanent',
  priority: 'Medium',
  justification: '',
  notes: '',
});

export default function LessonDetail() {
  const { lessonId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    lessons, risks, mocs, userId, activityFor,
    loading, error, refresh, hasAs9Schema,
    editLesson, validateLesson, advanceLesson,
    recordApplication, deleteApplication, raiseRiskFromLesson, raiseMocFromLesson,
  } = useLessonsLearned();

  const [editing, setEditing] = useState(null);
  const [validating, setValidating] = useState(null);
  const [applying, setApplying] = useState(null);
  const [applyErrors, setApplyErrors] = useState({});
  const [pushingRisk, setPushingRisk] = useState(null);
  const [pushingMoc, setPushingMoc] = useState(null);
  const [pushErrors, setPushErrors] = useState({});
  const [archiving, setArchiving] = useState(null);
  const [superseding, setSuperseding] = useState(null);
  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);
  const today = new Date();

  const lesson = useMemo(
    () => lessons.find((l) => l.id === lessonId) || null, [lessons, lessonId]);
  const applications = useMemo(() => (lesson ? (lesson.applications || []) : []), [lesson]);
  const record = useMemo(() => reuseRecord(applications), [applications]);
  const log = useMemo(() => (lesson ? activityFor(lesson.id) : []), [lesson, activityFor]);
  const riskById = useMemo(() => new Map(risks.map((r) => [r.id, r])), [risks]);
  const mocById = useMemo(() => new Map(mocs.map((m) => [m.id, m])), [mocs]);
  const successors = useMemo(
    () => (lesson ? successorCandidates(lesson, lessons) : []), [lesson, lessons]);
  const successor = useMemo(
    () => (lesson?.superseded_by ? lessons.find((l) => l.id === lesson.superseded_by) || null : null),
    [lesson, lessons]);

  const validationGate = useMemo(
    () => (lesson ? canValidate(lesson, userId) : { ok: false }), [lesson, userId]);
  const embedGate = useMemo(
    () => (lesson ? canAdvanceLesson(lesson, 'Embedded', { applications }) : { ok: false }),
    [lesson, applications]);

  if (loading) return <LessonsShell><Loading label="Loading the lesson..." /></LessonsShell>;
  if (error) return <LessonsShell><ErrorState error={error} onRetry={refresh} /></LessonsShell>;
  if (!hasAs9Schema) return <LessonsShell><SchemaNotice /></LessonsShell>;

  if (!lesson) {
    return (
      <LessonsShell title="Lesson not found">
        <EmptyState
          icon={<BookOpen className="w-12 h-12" />}
          title="No such lesson"
          description="This lesson is not in your organization's register. It may have been deleted, or the link may be wrong. This page used to show a different lesson instead of saying so."
          action={<Button onClick={() => navigate(`${BASE}/register`)}>Back to the register</Button>}
        />
      </LessonsShell>
    );
  }

  const terminal = ['Archived', 'Superseded'].includes(lesson.status);
  const missing = missingSubstance(lesson);
  const editGate = canEditLesson(lesson);

  const run = async (fn, message) => {
    setFailure(null);
    setBusy(true);
    const result = await fn();
    setBusy(false);
    if (!result.success) { setFailure(result.error); return false; }
    if (message) toast({ description: message });
    return true;
  };

  const submitEdit = async (e) => {
    e.preventDefault();
    const ok = await run(() => editLesson(lesson, editing),
      lesson.status === 'Validated'
        ? 'Saved. It is back to Submitted and needs validating again.'
        : 'Saved.');
    if (ok) setEditing(null);
  };

  const submitValidation = async (e) => {
    e.preventDefault();
    const ok = await run(
      () => validateLesson(lesson, { validator_name: validating.validator_name }),
      `${lesson.lesson_code} validated.`);
    if (ok) setValidating(null);
  };

  const submitApplication = async (e) => {
    e.preventDefault();
    setFailure(null);
    const errs = validateApplication(applying);
    setApplyErrors(errs);
    if (Object.keys(errs).length) return;
    const ok = await run(() => recordApplication(lesson, applying), 'Application recorded.');
    if (ok) { setApplying(null); setApplyErrors({}); }
  };

  const submitRiskPush = async (e) => {
    e.preventDefault();
    setFailure(null);
    const errs = validateRiskPush(pushingRisk);
    setPushErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const result = await raiseRiskFromLesson(lesson, pushingRisk);
    setBusy(false);
    if (!result.success) { setFailure(result.error); return; }
    toast({
      title: `${result.code} raised on the risk register`,
      description: 'It is linked back to this lesson.',
    });
    setPushingRisk(null);
    setPushErrors({});
  };

  const submitMocPush = async (e) => {
    e.preventDefault();
    setFailure(null);
    const errs = validateMocPush(pushingMoc);
    setPushErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const result = await raiseMocFromLesson(lesson, pushingMoc);
    setBusy(false);
    if (!result.success) { setFailure(result.error); return; }
    toast({
      title: `${result.code} raised in Management of Change`,
      description: 'It is linked back to this lesson.',
    });
    setPushingMoc(null);
    setPushErrors({});
  };

  const move = (to) => {
    if (to === 'Archived') { setSuperseding(null); setArchiving({ archive_reason: '' }); return; }
    // Superseded names the lesson that replaces this one. AS9 offered the
    // button with nowhere to name it, so it always failed (AS13).
    if (to === 'Superseded') { setArchiving(null); setSuperseding({ superseded_by: '' }); return; }
    run(() => advanceLesson(lesson, to), `${lesson.lesson_code} is now ${to}.`);
  };

  const submitSupersede = async (e) => {
    e.preventDefault();
    const replacement = lessons.find((l) => l.id === superseding.superseded_by);
    const ok = await run(() => advanceLesson(lesson, 'Superseded', superseding),
      `${lesson.lesson_code} superseded${replacement ? ` by ${replacement.lesson_code}` : ''}.`);
    if (ok) setSuperseding(null);
  };

  const submitArchive = async (e) => {
    e.preventDefault();
    const ok = await run(() => advanceLesson(lesson, 'Archived', archiving),
      `${lesson.lesson_code} archived.`);
    if (ok) setArchiving(null);
  };

  const selectClass = 'h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm';

  return (
    <LessonsShell
      title={`${lesson.lesson_code}: ${lesson.title}`}
      description={lesson.project_ref || lesson.asset_id || 'Captured lesson'}
    >
      <div className="space-y-6 animate-in fade-in duration-300 pb-10">
        <WriteFailure error={failure} />

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricTile label="Status" value={lesson.status} token="--primary" />
          <MetricTile
            label="Times applied" value={record.applied}
            hint={record.targets.length ? record.targets.join(', ') : 'Nothing has changed yet'}
            token={record.applied ? '--success' : '--destructive'}
          />
          <MetricTile
            label="Considered and rejected" value={record.rejected}
            hint="Each one carries its reasoning"
            token="--muted-foreground"
          />
          <MetricTile
            label="Scope" value={lesson.applicability_scope}
            hint="A judgement about who else this applies to"
            token="--primary"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="panel-elevation lg:col-span-2">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4 flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="text-lg">The lesson</CardTitle>
                <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                  What happened, why it happened, and what to do about it.
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <ScopeBadge scope={lesson.applicability_scope} />
                <LessonStatusBadge status={lesson.status} />
                <UnappliedBadge lesson={lesson} applications={applications} />
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <DetailField label="What happened">{lesson.description}</DetailField>
              <DetailField label="What it cost">{lesson.consequence}</DetailField>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <DetailField label="Root cause category">{lesson.root_cause_category}</DetailField>
                <DetailField label="Why it happened" className="sm:col-span-2">
                  {lesson.root_cause}
                </DetailField>
              </div>
              <DetailField label="What to do about it">{lesson.recommendation}</DetailField>

              {!hasSubstance(lesson) && !terminal ? (
                <GateNotice reason={`This lesson is missing ${missing.join(' and ')}. It cannot be validated until it has all three.`} />
              ) : null}

              {!terminal && !editGate.ok ? <GateNotice reason={editGate.reason} /> : null}

              {editGate.ok ? (
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button size="sm" variant="outline" disabled={busy}
                    onClick={() => setEditing(editing ? null : {
                      description: lesson.description || '',
                      root_cause: lesson.root_cause || '',
                      root_cause_category: lesson.root_cause_category || '',
                      recommendation: lesson.recommendation || '',
                      consequence: lesson.consequence || '',
                    })}>
                    Edit the lesson
                  </Button>
                </div>
              ) : null}

              {editing ? (
                <form onSubmit={submitEdit}
                  className="p-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/30 space-y-3">
                  {lesson.status === 'Validated' ? (
                    <GateNotice reason="This lesson has been validated. Saving a change sends it back to Submitted and clears the validation, because the validator accepted the words that were there." />
                  ) : null}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="ed-desc">What happened</label>
                    <Textarea id="ed-desc" rows={3} value={editing.description}
                      onChange={(e) => setEditing((f) => ({ ...f, description: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="ed-cost">What it cost</label>
                    <Textarea id="ed-cost" rows={2} value={editing.consequence}
                      onChange={(e) => setEditing((f) => ({ ...f, consequence: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="ed-cat">
                      Root cause category
                    </label>
                    <select id="ed-cat" className={selectClass} value={editing.root_cause_category}
                      onChange={(e) => setEditing(
                        (f) => ({ ...f, root_cause_category: e.target.value }))}>
                      <option value="">Not categorised</option>
                      {ROOT_CAUSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="ed-rc">Why it happened</label>
                    <Textarea id="ed-rc" rows={3} value={editing.root_cause}
                      onChange={(e) => setEditing((f) => ({ ...f, root_cause: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="ed-rec">
                      What to do about it
                    </label>
                    <Textarea id="ed-rec" rows={3} value={editing.recommendation}
                      onChange={(e) => setEditing(
                        (f) => ({ ...f, recommendation: e.target.value }))} />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={busy}>Save</Button>
                  </div>
                </form>
              ) : null}
            </CardContent>
          </Card>

          <Card className="panel-elevation lg:col-span-1">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
              <CardTitle className="text-lg">Record</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <DetailField label="Number">
                <span className="font-mono">{lesson.lesson_code}</span>
              </DetailField>
              <div className="grid grid-cols-2 gap-4">
                <DetailField label="Category">{lesson.category}</DetailField>
                <DetailField label="Discipline">{lesson.discipline}</DetailField>
                <DetailField label="Department">{lesson.department}</DetailField>
                <DetailField label="Project">{lesson.project_ref}</DetailField>
                <DetailField label="Asset">{lesson.asset_id}</DetailField>
                <DetailField label="Event date">{lesson.event_date}</DetailField>
                <DetailField label="Source">{lesson.source_type}</DetailField>
                <DetailField label="Reference">{lesson.source_reference}</DetailField>
                <DetailField label="Author">{lesson.author_name}</DetailField>
                <DetailField label="Validated">
                  {lesson.validated_at
                    ? `${lesson.validated_at}${lesson.validator_name ? ` by ${lesson.validator_name}` : ''}`
                    : null}
                </DetailField>
                <DetailField label="Published">{lesson.published_at}</DetailField>
                <DetailField label="Review due">{lesson.review_due}</DetailField>
              </div>
              <DetailField label="Keywords">{lesson.keywords}</DetailField>
              {lesson.archive_reason ? (
                <DetailField label="Archived because">{lesson.archive_reason}</DetailField>
              ) : null}
              {lesson.superseded_by ? (
                <DetailField label="Superseded by">
                  {successor ? (
                    <button type="button" className="text-[hsl(var(--primary))] hover:underline"
                      onClick={() => navigate(`${BASE}/${successor.id}`)}>
                      {successor.lesson_code}: {successor.title}
                    </button>
                  ) : 'A lesson no longer in this register'}
                </DetailField>
              ) : null}

              <div className="pt-2 border-t border-[hsl(var(--border))] space-y-3">
                <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                  Move this lesson
                </p>
                {nextLessonStatuses(lesson.status).length === 0 ? (
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    A {String(lesson.status).toLowerCase()} lesson is final.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {nextLessonStatuses(lesson.status).map((s) => (
                      <Button key={s} size="sm" variant="outline" disabled={busy}
                        onClick={() => (s === 'Validated'
                          ? setValidating({ validator_name: '' })
                          : move(s))}>
                        {s}
                      </Button>
                    ))}
                  </div>
                )}
                {nextLessonStatuses(lesson.status).includes('Validated') && !validationGate.ok ? (
                  <GateNotice reason={validationGate.reason} />
                ) : null}
                {nextLessonStatuses(lesson.status).includes('Embedded') && !embedGate.ok ? (
                  <GateNotice reason={embedGate.reason} />
                ) : null}

                {validating ? (
                  <form onSubmit={submitValidation} className="space-y-3 pt-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium" htmlFor="va-name">
                        Validator (leave blank to record yourself)
                      </label>
                      <Input id="va-name" value={validating.validator_name}
                        onChange={(e) => setValidating({ validator_name: e.target.value })}
                        placeholder="An external reviewer, if it was not a Suite user" />
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">
                        The author of a lesson cannot validate it.
                      </p>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setValidating(null)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={busy}>Validate</Button>
                    </div>
                  </form>
                ) : null}

                {superseding ? (
                  <form onSubmit={submitSupersede} className="space-y-3 pt-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium" htmlFor="su-by">
                        Which lesson replaces this one?
                      </label>
                      <select id="su-by" className={selectClass} value={superseding.superseded_by}
                        onChange={(e) => setSuperseding({ superseded_by: e.target.value })}>
                        <option value="">Pick the lesson that replaces it</option>
                        {successors.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.lesson_code}: {l.title} ({l.status})
                          </option>
                        ))}
                      </select>
                      {successors.length === 0 ? (
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">
                          There is no other lesson to name. Capture the lesson that replaces
                          this one first.
                        </p>
                      ) : null}
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setSuperseding(null)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={busy || !superseding.superseded_by}>
                        Mark superseded
                      </Button>
                    </div>
                  </form>
                ) : null}

                {archiving ? (
                  <form onSubmit={submitArchive} className="space-y-3 pt-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium" htmlFor="ar-reason">
                        Why is this being archived?
                      </label>
                      <Textarea id="ar-reason" rows={3} value={archiving.archive_reason}
                        onChange={(e) => setArchiving({ archive_reason: e.target.value })}
                        placeholder="The asset was decommissioned, the standard changed, the lesson was superseded by practice." />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setArchiving(null)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={busy}>Archive</Button>
                    </div>
                  </form>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="panel-elevation">
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4 flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Where this lesson went</CardTitle>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                A lesson that was never applied has not been learned. Push it into the
                risk register or Management of Change from here, or record where else
                it was used.
              </p>
            </div>
            {!terminal ? (
              <div className="flex flex-wrap gap-2 shrink-0">
                <Button size="sm" variant="outline" disabled={busy}
                  onClick={() => {
                    setFailure(null); setPushErrors({}); setPushingMoc(null);
                    setPushingRisk(pushingRisk ? null : blankRiskPush(lesson));
                  }}>
                  <GitBranch className="w-4 h-4 mr-2" /> Raise a risk
                </Button>
                <Button size="sm" variant="outline" disabled={busy}
                  onClick={() => {
                    setFailure(null); setPushErrors({}); setPushingRisk(null);
                    setPushingMoc(pushingMoc ? null : blankMocPush(lesson));
                  }}>
                  <GitBranch className="w-4 h-4 mr-2" /> Raise a change
                </Button>
                <Button size="sm" disabled={busy}
                  onClick={() => {
                    setFailure(null);
                    setApplying(applying ? null : blankApplication());
                  }}>
                  <Plus className="w-4 h-4 mr-2" /> Record an application
                </Button>
              </div>
            ) : null}
          </CardHeader>
          <CardContent className="p-0">
            {pushingRisk ? (
              <form onSubmit={submitRiskPush}
                className="p-5 border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/30 space-y-3">
                <p className="text-sm font-medium">
                  Raise a risk on the register from this lesson
                </p>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-6 space-y-1.5">
                    <label className="text-xs font-medium" htmlFor="rp-title">Risk</label>
                    <Input id="rp-title" value={pushingRisk.title}
                      onChange={(e) => setPushingRisk((f) => ({ ...f, title: e.target.value }))} />
                    {pushErrors.title ? (
                      <p className="text-xs text-[hsl(var(--destructive))]">{pushErrors.title}</p>
                    ) : null}
                  </div>
                  <div className="md:col-span-3 space-y-1.5">
                    <label className="text-xs font-medium" htmlFor="rp-cat">Category</label>
                    <Input id="rp-cat" value={pushingRisk.category}
                      onChange={(e) => setPushingRisk((f) => ({ ...f, category: e.target.value }))}
                      placeholder="Operational" />
                    {pushErrors.category ? (
                      <p className="text-xs text-[hsl(var(--destructive))]">{pushErrors.category}</p>
                    ) : null}
                  </div>
                  <div className="md:col-span-1 space-y-1.5">
                    <label className="text-xs font-medium" htmlFor="rp-l">L</label>
                    <Input id="rp-l" type="number" min="1" max="5" value={pushingRisk.likelihood}
                      onChange={(e) => setPushingRisk(
                        (f) => ({ ...f, likelihood: e.target.value }))} />
                  </div>
                  <div className="md:col-span-1 space-y-1.5">
                    <label className="text-xs font-medium" htmlFor="rp-i">I</label>
                    <Input id="rp-i" type="number" min="1" max="5" value={pushingRisk.impact}
                      onChange={(e) => setPushingRisk((f) => ({ ...f, impact: e.target.value }))} />
                  </div>
                </div>
                {pushErrors.likelihood || pushErrors.impact ? (
                  <p className="text-xs text-[hsl(var(--destructive))]">
                    {pushErrors.likelihood || pushErrors.impact}
                  </p>
                ) : null}
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  The lesson&apos;s root cause and recommendation are carried onto the
                  risk as its root cause and mitigation.
                </p>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setPushingRisk(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={busy}>Raise the risk</Button>
                </div>
              </form>
            ) : null}

            {pushingMoc ? (
              <form onSubmit={submitMocPush}
                className="p-5 border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/30 space-y-3">
                <p className="text-sm font-medium">
                  Raise a change request from this lesson
                </p>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-6 space-y-1.5">
                    <label className="text-xs font-medium" htmlFor="mp-title">The change</label>
                    <Input id="mp-title" value={pushingMoc.title}
                      onChange={(e) => setPushingMoc((f) => ({ ...f, title: e.target.value }))} />
                    {pushErrors.title ? (
                      <p className="text-xs text-[hsl(var(--destructive))]">{pushErrors.title}</p>
                    ) : null}
                  </div>
                  <div className="md:col-span-3 space-y-1.5">
                    <label className="text-xs font-medium" htmlFor="mp-cat">Category</label>
                    <select id="mp-cat" className={selectClass} value={pushingMoc.category}
                      onChange={(e) => setPushingMoc((f) => ({ ...f, category: e.target.value }))}>
                      {MOC_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-xs font-medium" htmlFor="mp-type">Type</label>
                    <select id="mp-type" className={selectClass} value={pushingMoc.type}
                      onChange={(e) => setPushingMoc((f) => ({ ...f, type: e.target.value }))}>
                      {CHANGE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="md:col-span-1 space-y-1.5">
                    <label className="text-xs font-medium" htmlFor="mp-pri">Priority</label>
                    <select id="mp-pri" className={selectClass} value={pushingMoc.priority}
                      onChange={(e) => setPushingMoc((f) => ({ ...f, priority: e.target.value }))}>
                      {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium" htmlFor="mp-just">Justification</label>
                  <Textarea id="mp-just" rows={2} value={pushingMoc.justification}
                    onChange={(e) => setPushingMoc(
                      (f) => ({ ...f, justification: e.target.value }))}
                    placeholder={lesson.recommendation || 'Why this change is needed.'} />
                  {pushErrors.justification ? (
                    <p className="text-xs text-[hsl(var(--destructive))]">{pushErrors.justification}</p>
                  ) : null}
                </div>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  It is raised as a Draft change, with this lesson as its current
                  situation, and linked back here.
                </p>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setPushingMoc(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={busy}>Raise the change</Button>
                </div>
              </form>
            ) : null}

            {applying ? (
              <form onSubmit={submitApplication}
                className="p-5 border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/30 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-3 space-y-1.5">
                    <label className="text-xs font-medium" htmlFor="ap-type">Applied to</label>
                    <select id="ap-type" className={selectClass} value={applying.target_type}
                      onChange={(e) => setApplying((f) => ({ ...f, target_type: e.target.value }))}>
                      {TARGET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>

                  {applying.target_type === 'Risk register' ? (
                    <div className="md:col-span-5 space-y-1.5">
                      <label className="text-xs font-medium" htmlFor="ap-risk">Risk</label>
                      <select id="ap-risk" className={selectClass} value={applying.target_risk_id}
                        onChange={(e) => setApplying(
                          (f) => ({ ...f, target_risk_id: e.target.value }))}>
                        <option value="">Pick a risk</option>
                        {risks.map((r) => (
                          <option key={r.id} value={r.id}>{r.risk_id}: {r.title}</option>
                        ))}
                      </select>
                      {applyErrors.target_risk_id ? (
                        <p className="text-xs text-[hsl(var(--destructive))]">
                          {applyErrors.target_risk_id}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {applying.target_type === 'Management of change' ? (
                    <div className="md:col-span-5 space-y-1.5">
                      <label className="text-xs font-medium" htmlFor="ap-moc">Change record</label>
                      <select id="ap-moc" className={selectClass} value={applying.target_moc_id}
                        onChange={(e) => setApplying(
                          (f) => ({ ...f, target_moc_id: e.target.value }))}>
                        <option value="">Pick a change record</option>
                        {mocs.map((m) => (
                          <option key={m.id} value={m.id}>{m.moc_code}: {m.title}</option>
                        ))}
                      </select>
                      {applyErrors.target_moc_id ? (
                        <p className="text-xs text-[hsl(var(--destructive))]">
                          {applyErrors.target_moc_id}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {!SUITE_TARGET_TYPES.includes(applying.target_type) ? (
                    <div className="md:col-span-5 space-y-1.5">
                      <label className="text-xs font-medium" htmlFor="ap-ref">
                        What changed
                      </label>
                      <Input id="ap-ref" value={applying.reference}
                        onChange={(e) => setApplying((f) => ({ ...f, reference: e.target.value }))}
                        placeholder="OPS-PR-14 rev 6, induction course IND-104" />
                      {applyErrors.reference ? (
                        <p className="text-xs text-[hsl(var(--destructive))]">
                          {applyErrors.reference}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-xs font-medium" htmlFor="ap-outcome">Outcome</label>
                    <select id="ap-outcome" className={selectClass} value={applying.outcome}
                      onChange={(e) => setApplying((f) => ({ ...f, outcome: e.target.value }))}>
                      {APPLICATION_OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-xs font-medium" htmlFor="ap-date">On</label>
                    <Input id="ap-date" type="date" value={applying.applied_on}
                      onChange={(e) => setApplying((f) => ({ ...f, applied_on: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium" htmlFor="ap-notes">Notes</label>
                  <Textarea id="ap-notes" rows={2} value={applying.notes}
                    onChange={(e) => setApplying((f) => ({ ...f, notes: e.target.value }))}
                    placeholder={applying.outcome === 'Rejected'
                      ? 'Why the lesson was not adopted. A rejection is a decision, and it needs its reasoning.'
                      : 'How it was applied.'} />
                  {applyErrors.notes ? (
                    <p className="text-xs text-[hsl(var(--destructive))]">{applyErrors.notes}</p>
                  ) : null}
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setApplying(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={busy}>Record it</Button>
                </div>
              </form>
            ) : null}

            {applications.length === 0 ? (
              <p className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                This lesson has not been applied to anything yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-grid-table w-full">
                  <thead>
                    <tr>
                      <th className="data-grid-th">Applied to</th>
                      <th className="data-grid-th">What changed</th>
                      <th className="data-grid-th">Outcome</th>
                      <th className="data-grid-th">On</th>
                      <th className="data-grid-th">Notes</th>
                      <th className="data-grid-th" />
                    </tr>
                  </thead>
                  <tbody>
                    {applications.map((a) => {
                      const risk = a.target_risk_id ? riskById.get(a.target_risk_id) : null;
                      const moc = a.target_moc_id ? mocById.get(a.target_moc_id) : null;
                      return (
                        <tr key={a.id} className="border-b border-[hsl(var(--border))] last:border-0">
                          <td className="data-grid-td text-xs">{a.target_type}</td>
                          <td className="data-grid-td">
                            {risk ? (
                              <span>
                                <span className="font-mono text-xs mr-2">{risk.risk_id}</span>
                                {risk.title}
                              </span>
                            ) : moc ? (
                              <span>
                                <span className="font-mono text-xs mr-2">{moc.moc_code}</span>
                                {moc.title}
                              </span>
                            ) : (a.reference || '')}
                          </td>
                          <td className="data-grid-td"><OutcomeBadge outcome={a.outcome} /></td>
                          <td className="data-grid-td text-xs">{a.applied_on}</td>
                          <td className="data-grid-td text-xs max-w-sm">{a.notes || ''}</td>
                          <td className="data-grid-td text-right">
                            {!terminal ? (() => {
                              const removal = canRemoveApplication(lesson, a, applications);
                              return (
                                <Button size="sm" variant="ghost" disabled={busy}
                                  onClick={() => (removal.ok
                                    ? run(() => deleteApplication(a.id), 'Application removed.')
                                    : setFailure(removal.reason))}
                                  title={removal.ok ? 'Remove this record' : removal.reason}
                                  aria-label={removal.ok ? 'Remove this record' : removal.reason}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              );
                            })() : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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
                Nothing recorded against this lesson yet.
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
    </LessonsShell>
  );
}
