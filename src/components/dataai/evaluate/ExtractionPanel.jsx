// AI Evaluation Studio: extraction scoring (Data & AI D5).
//
// A system's extracted field values scored against the labels, cell by cell:
// correct (a match, or both empty), wrong, missed (label filled, prediction
// empty) and unsupported (label empty, prediction filled). Per field and
// overall, with micro and macro accuracy and F1 on the filled cells.
import React from 'react';
import { useEvaluation } from '@/contexts/EvaluationContext';
import {
  EngineError, Note, Section,
} from '@/components/dataai/quality/shared';
import {
  Basis, Grid, NeedData, RunButton, StaleNote, SystemPicker, metricCell,
} from '@/components/dataai/evaluate/common';

const ExtractionPanel = () => {
  const {
    dataset, spec, updateSpec, results,
  } = useEvaluation();
  const out = results.extraction?.result;
  if (!dataset) return <NeedData />;
  if (!dataset.extraction) {
    return <Note tone="warn" testId="no-extraction">This dataset has no extraction labels. The Ekene synthetic documents have them; an upload carries them in its JSON file.</Note>;
  }
  const ids = Object.keys(dataset.extraction.predictions || {});
  const r = out?.result;
  const tolOf = (f) => (f.type === 'number' ? `number, |p - l| <= max(${f.absTol}, ${f.relTol} x |l|)` : 'text, SQuAD-normalised exact match');
  return (
    <div className="space-y-4">
      <Section title="Extraction settings" testId="extraction-spec">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-48"><SystemPicker label="System" value={spec.extraction.system} onChange={(v) => updateSpec(['extraction', 'system'], v)} testId="ext-system" ids={ids} /></div>
          <RunButton job="extraction">Score extraction</RunButton>
        </div>
        <Note>
          {dataset.extraction.labels.length} labelled records x {dataset.extraction.fields.length} fields
          ({dataset.extraction.fields.map((f) => f.name).join(', ')}). A labelled record the system did not return is scored as all empty.
          A number field reads a number or digits with comma thousands groups (&quot;3,038&quot; is 3038; &quot;150 bopd&quot; is wrong).
        </Note>
      </Section>
      {r ? (
        <Section title="Results" testId="extraction-results">
          <StaleNote job="extraction" />
          {r.error ? <EngineError result={r} /> : (
            <>
              <p className="text-xs text-slate-300" data-testid="extraction-line">
                {r.nPredicted} of {r.nRecords} labelled records returned; {r.overall.n} cells scored.
              </p>
              <Grid
                testId="extraction-overall"
                headers={['Overall', 'Value']}
                rows={[
                  ['Cells', r.overall.n],
                  ['Correct (of which both empty)', `${r.overall.correct} (${r.overall.correctEmpty})`],
                  ['Wrong', r.overall.wrong],
                  ['Missed', r.overall.missed],
                  ['Unsupported', r.overall.unsupported],
                  ['Micro accuracy', r.overall.microAccuracy],
                  ['Macro accuracy (equal to micro: every record is scored on every field)', r.overall.macroAccuracy],
                  ['Precision on filled cells', metricCell(r.overall.precision)],
                  ['Recall on filled cells', metricCell(r.overall.recall)],
                  ['Micro F1', metricCell(r.overall.microF1)],
                  ['Macro F1 (fields with a filled cell)', metricCell(r.overall.macroF1)],
                ]}
              />
              <Grid
                testId="extraction-fields"
                headers={['Field', 'Match rule', 'Correct', 'Wrong', 'Missed', 'Unsupported', 'Accuracy', 'Precision', 'Recall', 'F1', 'Mean token F1']}
                rows={r.perField.map((f) => {
                  const def = dataset.extraction.fields.find((x) => x.name === f.field);
                  return [f.field, tolOf({ ...def, absTol: f.absTol ?? 0, relTol: f.relTol ?? 0 }), f.correct, f.wrong, f.missed, f.unsupported, f.accuracy,
                    metricCell(f.precision), metricCell(f.recall), metricCell(f.f1), f.meanF1 === undefined ? '' : f.meanF1];
                })}
              />
              <Grid
                testId="extraction-cells"
                maxHeight="max-h-96"
                caption="Every cell that is not correct"
                headers={['Record', 'Field', 'Outcome', 'Label', 'Prediction', 'Reason']}
                rows={r.perRecord.flatMap((rec) => Object.entries(rec.fields)
                  .filter(([, c]) => c.outcome !== 'correct')
                  .map(([name, c]) => [rec.id, name, c.outcome, c.label === null ? '(empty)' : String(c.label), c.prediction === null ? '(empty)' : String(c.prediction), c.reason || '']))}
              />
              <Basis basis={r.basis} testId="extraction-basis" />
            </>
          )}
        </Section>
      ) : null}
    </div>
  );
};

export default ExtractionPanel;
