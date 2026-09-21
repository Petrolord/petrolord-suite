import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BookOpen, Search as SearchIcon } from 'lucide-react';
import {
  APPLICABILITY_SCOPES,
  SOURCE_TYPES,
  countBy,
  reuseRecord,
  searchLessons,
} from '@/lib/lessonsLearned';
import { LessonsShell, BASE } from './components/LessonsShell';
import {
  EmptyState, ErrorState, Loading, SchemaNotice,
} from './components/SharedComponents';
import {
  LessonStatusBadge, ReuseBadge, ScopeBadge, UnappliedBadge,
} from './components/LessonBadges';
import { useLessonsLearned } from './hooks/useLessonsLearned';

/**
 * AS9 — search, which is the point of a lessons database.
 *
 * The page it replaces searched five invented lessons with a single
 * `includes` over title, description and root cause, and its "Advanced
 * Filters" button toasted that the feature was not implemented. This
 * one searches every field of this organization's own register, needs
 * every term to match, and defaults to the lessons that have actually
 * been published, because a draft somebody else is still writing is
 * not an answer to a question.
 */
export default function Search() {
  const navigate = useNavigate();
  const {
    lessons, loading, error, refresh, hasAs9Schema,
  } = useLessonsLearned();

  const [query, setQuery] = useState('');
  const [visibleOnly, setVisibleOnly] = useState(true);
  const [category, setCategory] = useState('');
  const [discipline, setDiscipline] = useState('');
  const [scope, setScope] = useState('');
  const [source, setSource] = useState('');

  const categories = useMemo(
    () => countBy(lessons, 'category').map((c) => c.name).filter((c) => c !== 'Unspecified'),
    [lessons]);
  const disciplines = useMemo(
    () => countBy(lessons, 'discipline').map((c) => c.name).filter((c) => c !== 'Unspecified'),
    [lessons]);

  const results = useMemo(() => searchLessons(lessons, query, {
    visibleOnly,
    category: category || undefined,
    discipline: discipline || undefined,
    scope: scope || undefined,
    source_type: source || undefined,
  }), [lessons, query, visibleOnly, category, discipline, scope, source]);

  if (loading) return <LessonsShell title="Search"><Loading /></LessonsShell>;
  if (error) {
    return <LessonsShell title="Search"><ErrorState error={error} onRetry={refresh} /></LessonsShell>;
  }
  if (!hasAs9Schema) return <LessonsShell title="Search"><SchemaNotice /></LessonsShell>;

  const selectClass = 'h-10 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm';

  return (
    <LessonsShell
      title="Search"
      description="Every word of this organization's own register"
    >
      <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-300 pb-10">
        <div className="relative">
          <SearchIcon className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What are you about to do? Search for it before you do it."
            className="pl-12 py-6 text-lg"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select className={selectClass} value={category}
            onChange={(e) => setCategory(e.target.value)}>
            <option value="">Every category</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className={selectClass} value={discipline}
            onChange={(e) => setDiscipline(e.target.value)}>
            <option value="">Every discipline</option>
            {disciplines.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select className={selectClass} value={source}
            onChange={(e) => setSource(e.target.value)}>
            <option value="">Every source</option>
            {SOURCE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className={selectClass} value={scope}
            onChange={(e) => setScope(e.target.value)}>
            <option value="">Every scope</option>
            {APPLICABILITY_SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm px-2">
            <input type="checkbox" checked={visibleOnly}
              onChange={(e) => setVisibleOnly(e.target.checked)} />
            Published lessons only
          </label>
        </div>

        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          {results.length} of {lessons.length} lesson{lessons.length === 1 ? '' : 's'}
          {query ? ` matching every word of "${query}"` : ''}.
        </p>

        {results.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="w-12 h-12" />}
            title={lessons.length ? 'Nothing matches' : 'The register is empty'}
            description={lessons.length
              ? 'Every word has to appear somewhere in the lesson. Try fewer words, or clear the filters.'
              : 'Capture the first lesson and it will be searchable here.'}
            action={lessons.length ? null : (
              <Button onClick={() => navigate(`${BASE}/new`)}>Capture a lesson</Button>
            )}
          />
        ) : results.map((l) => {
          const record = reuseRecord(l.applications);
          return (
            <Card key={l.id}
              className="panel-elevation cursor-pointer hover:border-[hsl(var(--primary))]/40"
              onClick={() => navigate(`${BASE}/${l.id}`)}>
              <CardContent className="p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-[hsl(var(--muted-foreground))]">
                      {l.lesson_code}
                      {l.event_date ? ` · ${l.event_date}` : ''}
                      {l.project_ref ? ` · ${l.project_ref}` : ''}
                    </p>
                    <h3 className="font-medium mt-1">{l.title}</h3>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <ScopeBadge scope={l.applicability_scope} />
                    <LessonStatusBadge status={l.status} />
                    <ReuseBadge applications={l.applications} />
                    <UnappliedBadge lesson={l} applications={l.applications} />
                  </div>
                </div>
                {l.recommendation ? (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                      What to do about it
                    </p>
                    <p className="text-sm mt-1">{l.recommendation}</p>
                  </div>
                ) : (
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    {l.description}
                  </p>
                )}
                {record.targets.length ? (
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    Already applied to: {record.targets.join(', ')}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </LessonsShell>
  );
}
