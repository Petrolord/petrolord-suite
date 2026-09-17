import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BookOpen, Download, Search, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { exportToCSV } from '@/utils/exportUtils';
import {
  APPLICABILITY_SCOPES,
  LESSON_STATUSES,
  SOURCE_TYPES,
  countBy,
  reuseRecord,
  searchLessons,
} from '@/lib/lessonsLearned';
import { LessonsShell, BASE } from './components/LessonsShell';
import {
  EmptyState, ErrorState, Loading, MetricTile, SchemaNotice, WriteFailure,
} from './components/SharedComponents';
import {
  LessonStatusBadge, ReuseBadge, ScopeBadge, UnappliedBadge,
} from './components/LessonBadges';
import { useLessonsLearned } from './hooks/useLessonsLearned';

/**
 * AS9 — the lessons register.
 *
 * What it replaces filtered five invented lessons, and every control
 * on the page — Filters, Export, Capture Lesson, and the menu on each
 * row — called one handler:
 *
 *   toast({ title: "Action triggered", description: "🚧 This feature
 *     isn't implemented yet—but don't worry! You can request it in
 *     your next prompt! 🚀" });
 *
 * naming the prompt builder to paying customers, which is the AS3
 * finding in a second app. The rows were `cursor-pointer` and
 * navigated nowhere.
 */
export default function Register() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    lessons, loading, error, refresh, hasAs9Schema, deleteLesson,
  } = useLessonsLearned();

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [scopeFilter, setScopeFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);
  const today = new Date();

  const categories = useMemo(
    () => countBy(lessons, 'category').map((c) => c.name).filter((c) => c !== 'Unspecified'),
    [lessons]);

  const filtered = useMemo(() => searchLessons(lessons, query, {
    status: statusFilter || undefined,
    category: categoryFilter || undefined,
    scope: scopeFilter || undefined,
    source_type: sourceFilter || undefined,
  }), [lessons, query, statusFilter, categoryFilter, scopeFilter, sourceFilter]);

  const unapplied = useMemo(
    () => lessons.filter((l) => ['Published', 'Embedded'].includes(l.status)
      && reuseRecord(l.applications).applied === 0).length, [lessons]);

  const remove = async (lesson) => {
    setFailure(null);
    setBusy(true);
    const result = await deleteLesson(lesson.id);
    setBusy(false);
    if (!result.success) { setFailure(result.error); return; }
    toast({ description: `${lesson.lesson_code} deleted.` });
  };

  const exportRegister = () => {
    if (!filtered.length) {
      toast({ description: 'There is nothing to export.' });
      return;
    }
    exportToCSV(filtered.map((l) => {
      const record = reuseRecord(l.applications);
      return {
        Lesson: l.lesson_code || '',
        Title: l.title || '',
        Status: l.status || '',
        Category: l.category || '',
        Discipline: l.discipline || '',
        Source: l.source_type || '',
        'Source reference': l.source_reference || '',
        Project: l.project_ref || '',
        Asset: l.asset_id || '',
        'Event date': l.event_date || '',
        'What happened': l.description || '',
        'Why it happened': l.root_cause || '',
        'What to do about it': l.recommendation || '',
        Scope: l.applicability_scope || '',
        Author: l.author_name || '',
        Validated: l.validated_at || '',
        Published: l.published_at || '',
        'Times applied': record.applied,
        'Applied to': record.targets.join('; '),
        'Last applied': record.lastAppliedOn || '',
      };
    }), `lessons-register-${format(today, 'yyyy-MM-dd')}.csv`);
  };

  if (loading) return <LessonsShell title="Register"><Loading /></LessonsShell>;
  if (error) {
    return <LessonsShell title="Register"><ErrorState error={error} onRetry={refresh} /></LessonsShell>;
  }
  if (!hasAs9Schema) return <LessonsShell title="Register"><SchemaNotice /></LessonsShell>;

  const selectClass = 'h-10 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm';

  return (
    <LessonsShell
      title="Register"
      description="Every lesson this organization has captured, and where each one went"
      actions={<Button variant="outline" onClick={exportRegister}>
        <Download className="w-4 h-4 mr-2" /> Export (CSV)
      </Button>}
    >
      <div className="space-y-6 animate-in fade-in duration-300 pb-10">
        <WriteFailure error={failure} />

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricTile label="Lessons" value={lessons.length} />
          <MetricTile
            label="Published or embedded"
            value={lessons.filter((l) => ['Published', 'Embedded'].includes(l.status)).length}
            token="--success"
          />
          <MetricTile
            label="Applied nowhere" value={unapplied}
            token={unapplied ? '--destructive' : '--success'}
          />
          <MetricTile
            label="Drafts" value={lessons.filter((l) => l.status === 'Draft').length}
            token="--muted-foreground"
          />
        </div>

        <Card className="panel-elevation">
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4 space-y-3">
            <CardTitle className="text-lg">
              {filtered.length} of {lessons.length} lesson{lessons.length === 1 ? '' : 's'}
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search every field" className="pl-9 w-64" />
              </div>
              <select className={selectClass} value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">Every status</option>
                {LESSON_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select className={selectClass} value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="">Every category</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select className={selectClass} value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}>
                <option value="">Every source</option>
                {SOURCE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select className={selectClass} value={scopeFilter}
                onChange={(e) => setScopeFilter(e.target.value)}>
                <option value="">Every scope</option>
                {APPLICABILITY_SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <EmptyState
                icon={<BookOpen className="w-12 h-12" />}
                title={lessons.length ? 'Nothing matches those filters' : 'The register is empty'}
                description={lessons.length
                  ? 'Clear the filters to see the rest of the register.'
                  : 'Capture what happened, why it happened and what to do about it. This app used to show five invented lessons instead.'}
                action={lessons.length ? null : (
                  <Button onClick={() => navigate(`${BASE}/new`)}>Capture the first one</Button>
                )}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="data-grid-table w-full">
                  <thead>
                    <tr>
                      <th className="data-grid-th">Lesson</th>
                      <th className="data-grid-th">Title</th>
                      <th className="data-grid-th">Category</th>
                      <th className="data-grid-th">Source</th>
                      <th className="data-grid-th">Scope</th>
                      <th className="data-grid-th">Applied</th>
                      <th className="data-grid-th">Status</th>
                      <th className="data-grid-th" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((l) => (
                      <tr key={l.id}
                        className="border-b border-[hsl(var(--border))] last:border-0 cursor-pointer hover:bg-[hsl(var(--secondary))]/50"
                        onClick={() => navigate(`${BASE}/${l.id}`)}>
                        <td className="data-grid-td font-mono text-xs">{l.lesson_code}</td>
                        <td className="data-grid-td">
                          {l.title}
                          {l.description ? (
                            <span className="block text-xs text-[hsl(var(--muted-foreground))] truncate max-w-md">
                              {l.description}
                            </span>
                          ) : null}
                        </td>
                        <td className="data-grid-td text-xs">{l.category || ''}</td>
                        <td className="data-grid-td text-xs">{l.source_type}</td>
                        <td className="data-grid-td"><ScopeBadge scope={l.applicability_scope} /></td>
                        <td className="data-grid-td">
                          <ReuseBadge applications={l.applications} />
                          <UnappliedBadge lesson={l} applications={l.applications} />
                        </td>
                        <td className="data-grid-td"><LessonStatusBadge status={l.status} /></td>
                        <td className="data-grid-td text-right">
                          <Button size="sm" variant="ghost" disabled={busy}
                            onClick={(e) => { e.stopPropagation(); remove(l); }}
                            title="Delete this lesson">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </LessonsShell>
  );
}
