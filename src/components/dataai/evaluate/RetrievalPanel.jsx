// AI Evaluation Studio: retrieval (Data & AI D5).
//
// BM25 or TF-IDF over every query at the settings typed, and one query
// explained term by term: each ranked passage's score, its judged grade, and
// what each query term contributed. Ties are shown as the engine reports
// them (scores equal to 12 significant digits, the passage id ascending
// decides), with the tie at the cutoff called out.
import React from 'react';
import { useEvaluation } from '@/contexts/EvaluationContext';
import {
  EngineError, Note, Section, SelectField, TextInput, Toggle,
} from '@/components/dataai/quality/shared';
import {
  Basis, Grid, NeedData, RunButton, StaleNote, dn,
} from '@/components/dataai/evaluate/common';
import { METHODS, ENGINE_DEFAULTS } from '@/utils/dataAi/evalWorkflows';

const gradeCell = (judgments, id) => {
  if (!judgments) return 'query not judged';
  return Object.prototype.hasOwnProperty.call(judgments, id) ? String(judgments[id]) : 'unjudged (0)';
};

const Explain = ({ explain }) => {
  const r = explain.rank;
  if (r.error) return <EngineError result={r} />;
  const bm25 = r.method === 'bm25';
  return (
    <div className="space-y-2" data-testid="explain">
      <p className="text-xs text-slate-200" data-testid="explain-query">{explain.query}: {explain.text}</p>
      {r.note ? <Note tone="warn" testId="explain-note">{r.note}</Note> : null}
      {bm25 ? (
        <Grid
          testId="query-terms"
          caption={`Query terms (a repeated word counts once); N = ${r.N}, average length ${dn(r.avgdl)} tokens`}
          headers={['Term', 'df (passages containing it)', 'idf']}
          rows={r.queryTerms.map((t) => [t.term, t.df, t.idf])}
        />
      ) : (
        <Note testId="dropped-terms">
          {r.droppedTerms.length ? `Query terms outside the corpus vocabulary, dropped: ${r.droppedTerms.join(', ')}.` : 'Every query term is in the corpus vocabulary.'}
        </Note>
      )}
      <Grid
        testId="explain-table"
        headers={['Rank', 'Passage', 'Score', 'Judged grade', bm25 ? 'Term contributions (tf, idf, contribution)' : 'Term weights (query x passage)']}
        rows={r.ranking.map((x) => [
          x.rank,
          x.id,
          x.score,
          gradeCell(explain.judgments, x.id),
          bm25
            ? x.terms.map((t) => `${t.term}: tf ${t.tf}, idf ${dn(t.idf)}, ${dn(t.contribution)}`).join('; ')
            : x.terms.map((t) => `${t.term}: ${dn(t.query)} x ${dn(t.document)}`).join('; '),
        ])}
      />
      <p className="text-xs text-slate-300" data-testid="explain-ties">
        {r.ranking.length} of {r.matched} matching passages shown.
        {' '}{r.ties.length ? `Tied within the top ${r.k}: ${r.ties.map((t) => t.join(' = ')).join('; ')} (ordered by id).` : `No tie within the top ${r.k}.`}
        {r.tieAtCutoff ? ` The passage at rank ${r.k} ties with the next one below the cut; the id decided which one is in.` : ''}
      </p>
    </div>
  );
};

const RetrievalPanel = () => {
  const {
    dataset, spec, updateSpec, results,
  } = useEvaluation();
  const r = spec.retrieval;
  const out = results.retrieval?.result;
  if (!dataset) return <NeedData />;
  const bm25 = r.method === 'bm25';
  return (
    <div className="space-y-4">
      <Section title="Retrieval settings" testId="retrieval-spec">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-64"><SelectField label="Method" value={r.method} onChange={(v) => updateSpec(['retrieval', 'method'], v)} testId="ret-method" options={METHODS} /></div>
          <TextInput label="k (passages kept)" value={r.k} onChange={(v) => updateSpec(['retrieval', 'k'], v)} placeholder={String(ENGINE_DEFAULTS.K)} testId="ret-k" />
          {bm25 ? (
            <>
              <TextInput label="k1" value={r.k1} onChange={(v) => updateSpec(['retrieval', 'k1'], v)} placeholder={String(ENGINE_DEFAULTS.K1)} testId="ret-k1" source="Blank: 1.2" />
              <TextInput label="b" value={r.b} onChange={(v) => updateSpec(['retrieval', 'b'], v)} placeholder={String(ENGINE_DEFAULTS.B)} testId="ret-b" source="Blank: 0.75" />
            </>
          ) : (
            <Toggle label="Sublinear tf (1 + ln tf)" checked={r.sublinearTf} onChange={(v) => updateSpec(['retrieval', 'sublinearTf'], v)} testId="ret-sublinear" />
          )}
          <Toggle label="Stop list (scikit-learn English, 318 words)" checked={r.stopWords} onChange={(v) => updateSpec(['retrieval', 'stopWords'], v)} testId="ret-stop" />
        </div>
        <Note>
          Tokens: A to Z lowercased, split on every character outside a to z and 0 to 9 (so &quot;1.25&quot; is two tokens and
          &quot;Ekene-3&quot; is &quot;ekene&quot; and &quot;3&quot;), no stemming. The stop list is off by default because it removes
          &quot;well&quot;, &quot;top&quot;, &quot;bottom&quot; and &quot;fire&quot;. Only passages that match a query term are ranked.
        </Note>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-80">
            <SelectField label="Query to explain" value={r.query} onChange={(v) => updateSpec(['retrieval', 'query'], v)} testId="ret-query" options={dataset.queries.map((q) => ({ value: q.id, label: `${q.id}: ${q.text.slice(0, 60)}` }))} />
          </div>
          <RunButton job="retrieval">Run retrieval</RunButton>
        </div>
      </Section>
      {out ? (
        <Section title="Results" testId="retrieval-results">
          <StaleNote job="retrieval" />
          {out.result.error ? <EngineError result={out.result} /> : (
            <>
              {out.explain ? <Explain explain={out.explain} /> : null}
              <Grid
                testId="retrieval-table"
                caption={`Every query: the top ${out.result.k} by ${out.result.method === 'bm25' ? 'BM25' : 'TF-IDF'}`}
                maxHeight="max-h-80"
                headers={['Query', 'Ranked passages (best first)', 'Matched', 'Ties']}
                rows={out.result.perQuery.map((p) => [
                  p.id,
                  p.ranking.map((x) => x.id).join(', ') || 'none',
                  p.matched,
                  [p.ties.map((t) => t.join(' = ')).join('; '), p.tieAtCutoff ? 'tie at the cutoff' : ''].filter(Boolean).join('; ') || 'none',
                ])}
              />
              <Basis basis={out.result.basis} testId="retrieval-basis" />
            </>
          )}
        </Section>
      ) : null}
    </div>
  );
};

export default RetrievalPanel;
