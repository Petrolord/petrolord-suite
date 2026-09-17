import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  APPLICABILITY_SCOPES,
  ROOT_CAUSE_CATEGORIES,
  SOURCE_TYPES,
  hasSubstance,
  missingSubstance,
} from '@/lib/lessonsLearned';
import { LessonsShell, BASE } from './components/LessonsShell';
import {
  ErrorState, GateNotice, Loading, SchemaNotice, WriteFailure,
} from './components/SharedComponents';
import { validateLesson } from './utils/lessonPayload';
import { useLessonsLearned } from './hooks/useLessonsLearned';

/**
 * AS9 — capture, which is where this app's defect was worst.
 *
 * The form this replaces had no state at all: not one of its six
 * fields carried a `value` or an `onChange`, and there was no
 * `useState` in the file. Pressing Save Draft ran
 *
 *   toast({ title: "Draft Saved",
 *           description: "Lesson draft has been saved successfully." });
 *   navigate('/dashboard/apps/assurance/lessons-learned');
 *
 * so somebody could write out an incident, its root cause and its
 * recommendation, be told it had been saved successfully, and lose
 * every word of it. It is the third app in this module with that exact
 * defect, after NewMOC.jsx and NewQAPlan.jsx.
 *
 * A draft may be captured with just a title and what happened: capture
 * comes before analysis, and a form that demands the root cause on the
 * day of the event is a form nobody fills in. The root cause and the
 * recommendation are required to validate it, and this page says so
 * while it is being written rather than at the gate.
 */

const blank = () => ({
  title: '',
  description: '',
  root_cause: '',
  root_cause_category: '',
  recommendation: '',
  consequence: '',
  category: '',
  discipline: '',
  department: '',
  project_ref: '',
  asset_id: '',
  event_date: '',
  source_type: 'Operational experience',
  source_reference: '',
  applicability_scope: 'This asset',
  author_name: '',
  keywords: '',
  review_due: '',
});

export default function NewLesson() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    loading, error, refresh, hasAs9Schema, createLesson,
  } = useLessonsLearned();

  const [form, setForm] = useState(blank());
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState(null);
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setFailure(null);
    const errs = validateLesson(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    const result = await createLesson(form);
    setSaving(false);
    if (!result.success) { setFailure(result.error); return; }
    toast({
      title: `${result.data.lesson_code} captured`,
      description: 'It is a draft until somebody other than you validates it.',
    });
    navigate(`${BASE}/${result.data.id}`);
  };

  if (loading) return <LessonsShell title="Capture a lesson"><Loading /></LessonsShell>;
  if (error) {
    return (
      <LessonsShell title="Capture a lesson">
        <ErrorState error={error} onRetry={refresh} />
      </LessonsShell>
    );
  }
  if (!hasAs9Schema) return <LessonsShell title="Capture a lesson"><SchemaNotice /></LessonsShell>;

  const selectClass = 'h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm';
  const missing = missingSubstance(form);

  return (
    <LessonsShell
      title="Capture a lesson"
      description="What happened, why it happened, and what to do about it"
    >
      <div className="max-w-4xl space-y-6 animate-in fade-in duration-300 pb-10">
        <WriteFailure error={failure} />

        <form onSubmit={submit} className="space-y-6">
          <Card className="panel-elevation">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
              <CardTitle className="text-lg">What happened</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="ll-title">Title</label>
                <Input id="ll-title" value={form.title} onChange={set('title')}
                  placeholder="Export pump failed during the startup sequence" />
                {errors.title ? (
                  <p className="text-xs text-[hsl(var(--destructive))]">{errors.title}</p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="ll-desc">
                  What happened
                </label>
                <Textarea id="ll-desc" rows={4} value={form.description}
                  onChange={set('description')}
                  placeholder="The sequence of events, and what was seen." />
                {errors.description ? (
                  <p className="text-xs text-[hsl(var(--destructive))]">{errors.description}</p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="ll-consequence">
                  What it cost
                </label>
                <Textarea id="ll-consequence" rows={2} value={form.consequence}
                  onChange={set('consequence')}
                  placeholder="Downtime, rework, damage, delay — what this actually cost." />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="ll-event">Event date</label>
                  <Input id="ll-event" type="date" value={form.event_date}
                    onChange={set('event_date')} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="ll-source">Where it came from</label>
                  <select id="ll-source" className={selectClass} value={form.source_type}
                    onChange={set('source_type')}>
                    {SOURCE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="ll-sourceref">
                    Its reference
                  </label>
                  <Input id="ll-sourceref" value={form.source_reference}
                    onChange={set('source_reference')}
                    placeholder="IAF-2026-004, NCR-2026-012, the close-out report" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="panel-elevation">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
              <CardTitle className="text-lg">Why it happened, and what to do about it</CardTitle>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                Both are needed before anybody can validate this lesson. Neither is
                needed to capture it: it can be saved as a draft now and analysed
                later.
              </p>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="ll-rc-cat">
                    Root cause category
                  </label>
                  <select id="ll-rc-cat" className={selectClass} value={form.root_cause_category}
                    onChange={set('root_cause_category')}>
                    <option value="">Not categorised</option>
                    {ROOT_CAUSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="ll-rc">Why it happened</label>
                  <Textarea id="ll-rc" rows={3} value={form.root_cause}
                    onChange={set('root_cause')}
                    placeholder="What allowed this to happen, not what happened." />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="ll-rec">
                  What to do about it
                </label>
                <Textarea id="ll-rec" rows={3} value={form.recommendation}
                  onChange={set('recommendation')}
                  placeholder="The change somebody should make: a procedure, a hold point, a specification, a course." />
                {errors.recommendation ? (
                  <p className="text-xs text-[hsl(var(--destructive))]">{errors.recommendation}</p>
                ) : null}
              </div>

              {!hasSubstance(form) ? (
                <GateNotice reason={`This will be captured as a draft. It needs ${missing.join(' and ')} before anybody can validate it.`} />
              ) : null}
            </CardContent>
          </Card>

          <Card className="panel-elevation">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
              <CardTitle className="text-lg">Who it applies to</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="ll-scope">Scope</label>
                  <select id="ll-scope" className={selectClass} value={form.applicability_scope}
                    onChange={set('applicability_scope')}>
                    {APPLICABILITY_SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    How widely this could apply. How often it has been applied is counted.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="ll-category">Category</label>
                  <Input id="ll-category" value={form.category} onChange={set('category')}
                    placeholder="Equipment, planning, HSE" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="ll-discipline">Discipline</label>
                  <Input id="ll-discipline" value={form.discipline} onChange={set('discipline')} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="ll-dept">Department</label>
                  <Input id="ll-dept" value={form.department} onChange={set('department')} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="ll-project">Project</label>
                  <Input id="ll-project" value={form.project_ref} onChange={set('project_ref')} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="ll-asset">Asset</label>
                  <Input id="ll-asset" value={form.asset_id} onChange={set('asset_id')} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="ll-author">
                    Author (leave blank to record yourself)
                  </label>
                  <Input id="ll-author" value={form.author_name} onChange={set('author_name')} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="ll-review">Review due</label>
                  <Input id="ll-review" type="date" value={form.review_due}
                    onChange={set('review_due')} />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="ll-keywords">
                  Keywords
                </label>
                <Input id="ll-keywords" value={form.keywords} onChange={set('keywords')}
                  placeholder="The words somebody would search for two years from now" />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => navigate(BASE)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Capture lesson'}
            </Button>
          </div>
        </form>
      </div>
    </LessonsShell>
  );
}
