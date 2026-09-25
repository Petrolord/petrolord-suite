// AI Evaluation Studio: answers and groundedness (Data & AI D5).
//
// A system's answers checked claim by claim against the passages they cite:
// quoted spans, ISO dates and numbers, each supported only by a cited passage
// that was also retrieved, each unsupported claim named with the engine's
// reason; every citation's status; and the short answers scored against the
// references by SQuAD exact match and token F1.
//
// The optional language-model helper sits at the end, apart from the graded
// results. Its answer is model output: it is checked by the same
// deterministic engine check and labelled as not graded, and it is never
// saved or exported.
import React, { useState } from 'react';
import { Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import { useEvaluation } from '@/contexts/EvaluationContext';
import {
  EngineError, Note, Section, SelectField, TextInput,
} from '@/components/dataai/quality/shared';
import {
  Basis, Grid, NeedData, RunButton, StaleNote, SystemPicker, dn, metricCell,
} from '@/components/dataai/evaluate/common';
import { askAssist, ASSIST_MESSAGES } from '@/utils/dataAi/evalAssist';
import { ASSIST_MAX_PASSAGES } from '@/utils/dataAi/evalWorkflows';

const STATUS = { ok: 'cited and retrieved', notRetrieved: 'cited, not retrieved', unknown: 'not a passage of the corpus' };

const ClaimsTable = ({ claims, testId }) => (
  <Grid
    testId={testId}
    headers={['Claim', 'Kind', 'Supported', 'Found in', 'Reason']}
    rows={claims.map((c) => [c.text, c.kind, c.supported ? 'supported' : 'unsupported', c.foundIn.join(', '), c.reason || ''])}
  />
);

export const HELPER_DAILY_CAP_TEXT = 'Each organization has a daily cap on helper calls, stated in the help guide.';

const Helper = () => {
  const {
    dataset, spec, orgId, runHelperJob,
  } = useEvaluation();
  const [picked, setQueryId] = useState(dataset.queries[0]?.id || '');
  const [state, setState] = useState({ phase: 'idle' });
  const queryId = dataset.queries.some((q) => q.id === picked) ? picked : (dataset.queries[0]?.id || '');

  const ask = async () => {
    setState({ phase: 'working' });
    try {
      const ctx = await runHelperJob('assistContext', { queryId });
      if (ctx.error || ctx.rank?.error) { setState({ phase: 'refused', error: (ctx.error ? ctx : ctx.rank).error }); return; }
      const reply = await askAssist(supabase, { organizationId: orgId, query: ctx.text, passages: ctx.passages });
      const check = await runHelperJob('assistCheck', { answer: reply.answer, citations: reply.citations, retrieved: ctx.retrieved });
      setState({
        phase: 'done', ctx, reply, check,
      });
    } catch (e) {
      setState({ phase: 'failed', kind: e.kind || 'failed', message: e.message || ASSIST_MESSAGES.failed });
    }
  };

  return (
    <Section title="Optional language-model helper (not graded)" testId="assist-section">
      <Note>
        This sends one query and the passages the current retrieval settings return for it (at most {ASSIST_MAX_PASSAGES}) to a
        hosted language model, which is told to answer only from those passages and cite passage ids. The answer is then scored by
        the same deterministic groundedness check as the answers above. It is model output: it is not graded, not saved with the run
        and not written to the report. Calls are metered per organization. {HELPER_DAILY_CAP_TEXT}
      </Note>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-80">
          <SelectField label="Query" value={queryId} onChange={setQueryId} testId="assist-query" options={dataset.queries.map((q) => ({ value: q.id, label: `${q.id}: ${q.text.slice(0, 60)}` }))} />
        </div>
        <Button size="sm" variant="outline" onClick={ask} disabled={state.phase === 'working' || !queryId} data-testid="assist-ask">
          <Bot className="mr-1 h-4 w-4" /> Ask the helper
        </Button>
        <span className="text-[11px] text-slate-500">Retrieval: {spec.retrieval.method === 'bm25' ? 'BM25' : 'TF-IDF'}, top {spec.retrieval.k || 'engine default'}.</span>
      </div>
      {state.phase === 'working' ? <p className="text-xs text-slate-400" role="status">Asking the helper.</p> : null}
      {state.phase === 'refused' ? <EngineError result={{ error: state.error }} /> : null}
      {state.phase === 'failed' ? (
        <Note tone="warn" testId={state.kind === 'not-configured' ? 'assist-not-configured' : 'assist-failed'}>
          {state.kind === 'not-configured' ? ASSIST_MESSAGES['not-configured'] : state.message}
        </Note>
      ) : null}
      {state.phase === 'done' ? (
        <div className="space-y-2 rounded border border-amber-700/50 bg-amber-950/10 p-2" data-testid="assist-result">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-300">Model output, not graded</p>
          <p className="text-xs text-slate-100" data-testid="assist-answer">{state.reply.answer}</p>
          <p className="text-[11px] text-slate-400">
            Cited: {state.reply.citations.join(', ') || 'nothing'}. Passages given: {state.ctx.retrieved.join(', ')}
            {state.ctx.trimmed ? ` (the top ${ASSIST_MAX_PASSAGES} of the retrieval)` : ''}. Model {state.reply.model || 'not stated'}
            {state.reply.dailyCap ? `; ${state.reply.callsToday} of ${state.reply.dailyCap} calls today for your organization` : ''}.
          </p>
          {state.check.error ? <EngineError result={state.check} /> : (
            <>
              <p className="text-xs text-slate-200" data-testid="assist-grounded">
                Deterministic check: {state.check.nSupported} of {state.check.nClaims} claims supported
                {state.check.supportedFraction === null ? ' (no checkable claim)' : ` (${dn(state.check.supportedFraction)})`}.
                {state.check.flags.length ? ` ${state.check.flags.join('; ')}.` : ''}
              </p>
              {state.check.claims.length ? <ClaimsTable claims={state.check.claims} testId="assist-claims" /> : null}
            </>
          )}
        </div>
      ) : null}
    </Section>
  );
};

const AnswersPanel = () => {
  const {
    dataset, spec, updateSpec, results,
  } = useEvaluation();
  const out = results.answers?.result;
  const [open, setOpen] = useState('');
  if (!dataset) return <NeedData />;
  const noSystems = !dataset.systems.length;
  const c = out?.check;
  return (
    <div className="space-y-4">
      <Section title="Groundedness settings" testId="answers-spec">
        {noSystems ? <Note tone="warn" testId="no-systems">This dataset has no system answers. Upload a JSON file with systems to check answers.</Note> : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-48"><SystemPicker label="System" value={spec.answers.system} onChange={(v) => updateSpec(['answers', 'system'], v)} testId="ans-system" /></div>
            <TextInput label="Numeric tolerance (relative)" value={spec.answers.numericRelTol} onChange={(v) => updateSpec(['answers', 'numericRelTol'], v)} placeholder="0" testId="ans-reltol" source="0: equal values. 0.002: 2,100 stands for 2,096." width="w-28" />
            <RunButton job="answers">Check answers</RunButton>
          </div>
        )}
        <Note>
          A claim is a quoted span, an ISO date (YYYY-MM-DD) or a number. A number glued to a letter or joined by a hyphen is part of an
          identifier (Ekene-3, EK1-P) and is not a claim. A claim is supported only by a passage the answer cites AND that was retrieved.
          Grounded is not the same as correct: a date can be in the cited passage and still answer about the wrong well.
        </Note>
      </Section>
      {c ? (
        <Section title={`Results: ${out.name || out.system}`} testId="answers-results">
          <StaleNote job="answers" />
          {c.error ? <EngineError result={c} /> : (
            <>
              <Grid
                testId="answers-summary"
                headers={['Measure', 'Value']}
                rows={[
                  ['Claims supported / claims', `${c.nSupported} / ${c.nClaims}`],
                  ['Supported fraction (pooled over claims)', metricCell(c.supportedFraction)],
                  ['Mean per answer (answers with a claim)', metricCell(c.meanAnswerSupportedFraction)],
                  ['Answers fully supported', `${c.fullySupportedAnswers} of ${c.answersWithClaims}`],
                  ['Numbers supported', `${c.byKind.number.supported} / ${c.byKind.number.claims}`],
                  ['Dates supported', `${c.byKind.date.supported} / ${c.byKind.date.claims}`],
                  ['Quotes supported', `${c.byKind.quote.supported} / ${c.byKind.quote.claims}`],
                  ['Citations not retrieved', c.notRetrievedCitations],
                  ['Citations not in the corpus', c.unknownCitations],
                  ['Short answers, SQuAD exact match', `${out.short.exact} of ${out.short.n}`],
                  ['Short answers, mean token F1', metricCell(out.short.meanF1)],
                ]}
              />
              {!out.withRuns ? <Note tone="warn">These answers carry no retrieved lists, so every cited passage of the corpus can support a claim.</Note> : null}
              <Grid
                testId="answers-table"
                maxHeight="max-h-96"
                headers={['Query', 'Supported', 'Citations', 'Unsupported claims']}
                rows={c.perAnswer.map((a) => [
                  <button type="button" key={a.query} className="text-sky-300 underline" onClick={() => setOpen(open === a.query ? '' : a.query)} data-testid={`answer-${a.query}`}>{a.query}</button>,
                  `${a.nSupported} / ${a.nClaims}`,
                  a.citations.map((x) => `${x.id} (${STATUS[x.status]})`).join(', ') || 'none',
                  a.claims.filter((x) => !x.supported).map((x) => x.reason).join('; '),
                ])}
              />
              {open ? (() => {
                const a = c.perAnswer.find((x) => x.query === open);
                const text = dataset.systems.find((s) => s.id === out.system)?.answers.find((x) => x.query === open)?.text;
                return (
                  <div className="space-y-1 rounded border border-slate-800 p-2" data-testid="answer-detail">
                    <p className="text-xs text-slate-200">{open}: {text}</p>
                    {a.note ? <Note>{a.note}</Note> : null}
                    {a.flags.length ? <Note tone="warn">{a.flags.join('; ')}.</Note> : null}
                    <ClaimsTable claims={a.claims} testId="claims-table" />
                  </div>
                );
              })() : null}
              {out.short.rows.length ? (
                <Grid
                  testId="short-table"
                  maxHeight="max-h-80"
                  caption="Short answers against the references (SQuAD normalisation: lowercase, punctuation and the words a, an, the removed)"
                  headers={['Query', 'Short answer', 'Reference', 'Exact match', 'Token F1']}
                  rows={out.short.rows.map((r) => [r.query, r.prediction || '(none)', r.truth || '(none)', r.match.error ? r.match.error : (r.match.exactMatch ? 'yes' : 'no'), r.match.error ? '' : r.match.f1])}
                />
              ) : null}
              <Basis basis={c.basis} testId="answers-basis" />
            </>
          )}
        </Section>
      ) : null}
      <Helper />
    </div>
  );
};

export default AnswersPanel;
