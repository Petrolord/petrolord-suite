// AI Evaluation Studio: the corpus, the queries and their judgments (Data & AI D5).
//
// The Ekene synthetic documents are loaded by default: 60 short field
// passages, 24 queries with graded judgments and a second annotator, two
// fixed question-answering systems, extraction labels and a calibration set,
// the same files the engine gate and the NextGen course read. An upload is
// either one JSON file in those shapes or CSV files (passages, queries,
// judgments, calibration). Files stay in the browser.
import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useEvaluation } from '@/contexts/EvaluationContext';
import {
  APP_CAPS, ekeneDataset, uploadDataset, passagesFromCsv, queriesFromCsv, judgmentsFromCsv, calibrationFromCsv, datasetFromJson, datasetCounts,
} from '@/utils/dataAi/evalData';
import { Note, Section } from '@/components/dataai/quality/shared';
import { Grid } from '@/components/dataai/evaluate/common';

const readText = (file) => (file.text ? file.text() : new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result));
  r.onerror = () => rej(r.error);
  r.readAsText(file);
}));

const FileField = ({
  label, testId, accept = '.csv,.tsv,.txt', onFile, name,
}) => (
  <label className="block text-[11px] text-slate-400">
    <span>{label}</span>
    <input type="file" accept={accept} data-testid={testId} onChange={(e) => onFile(e.target.files?.[0] || null)} className="mt-1 block w-full text-xs text-slate-300" />
    {name ? <span className="text-[10px] text-slate-500">{name}</span> : null}
  </label>
);

const Uploader = () => {
  const { setDataset } = useEvaluation();
  const [files, setFiles] = useState({});
  const [error, setError] = useState(null);
  const set = (k) => (f) => { setError(null); setFiles((s) => ({ ...s, [k]: f })); };

  const useJson = async (file) => {
    setError(null);
    if (!file) return;
    try {
      const d = datasetFromJson(await readText(file), file.name);
      setDataset(uploadDataset({ label: file.name, ...d }));
    } catch (e) { setError(e.message); }
  };

  const useCsv = async () => {
    setError(null);
    try {
      if (!files.passages || !files.queries) throw new Error('Choose the passages file and the queries file.');
      const documents = passagesFromCsv(await readText(files.passages), files.passages.name);
      const queries = queriesFromCsv(await readText(files.queries), files.queries.name);
      const j = files.judgments ? judgmentsFromCsv(await readText(files.judgments), files.judgments.name) : { judgments: {}, second: null };
      const calibration = files.calibration ? calibrationFromCsv(await readText(files.calibration), files.calibration.name) : null;
      setDataset(uploadDataset({
        label: `${files.passages.name} and ${files.queries.name}`, documents, queries, ...j, calibration,
      }));
    } catch (e) { setError(e.message); }
  };

  return (
    <div className="space-y-3" data-testid="uploader">
      <Note>
        Files stay in your browser. Up to {APP_CAPS.PASSAGES.toLocaleString('en-US')} passages and {APP_CAPS.QUERIES} queries.
        CSV follows RFC 4180 (a text with commas or line breaks is quoted), and the first row names the columns.
      </Note>
      <FileField label="One JSON file in the Ekene fixture shapes (passages, queries with judgments, systems, extraction, calibration)" accept=".json" testId="upload-json" onFile={useJson} />
      <div className="grid gap-2 md:grid-cols-2">
        <FileField label="Passages CSV: id, text (title optional)" testId="upload-passages" onFile={set('passages')} name={files.passages?.name} />
        <FileField label="Queries CSV: id, text (reference optional)" testId="upload-queries" onFile={set('queries')} name={files.queries?.name} />
        <FileField label="Judgments CSV: query, passage, grade (grade2 optional, a second annotator)" testId="upload-judgments" onFile={set('judgments')} name={files.judgments?.name} />
        <FileField label="Calibration CSV: probability, outcome (0 or 1)" testId="upload-calibration" onFile={set('calibration')} name={files.calibration?.name} />
      </div>
      <Button size="sm" onClick={useCsv} data-testid="use-csv">Use these files</Button>
      {error ? <p role="alert" className="text-xs text-red-300" data-testid="upload-error">{error}</p> : null}
    </div>
  );
};

const CorpusPanel = () => {
  const { dataset, setDataset } = useEvaluation();
  const [show, setShow] = useState('queries');
  const c = useMemo(() => datasetCounts(dataset), [dataset]);

  return (
    <div className="space-y-4">
      <Section
        title="Dataset"
        testId="dataset-section"
        right={<Button size="sm" variant="outline" onClick={() => setDataset(ekeneDataset())} data-testid="load-ekene">Load the Ekene synthetic documents</Button>}
      >
        {dataset ? (
          <div className="space-y-1">
            <p className="text-sm text-slate-100" data-testid="dataset-label">{dataset.label}</p>
            <p className="text-xs text-slate-300" data-testid="dataset-counts">
              {c.passages.toLocaleString('en-US')} passages, {c.queries} queries ({c.judgedQueries} judged, {c.judgedPairs.toLocaleString('en-US')} judged pairs
              {c.secondGrades ? `, ${c.secondGrades.toLocaleString('en-US')} with a second grade` : ''}), {c.systems} system{c.systems === 1 ? '' : 's'},
              {' '}{c.extractionRecords} extraction records, {c.calibrationRows.toLocaleString('en-US')} calibration rows.
            </p>
            {dataset.notes.map((n) => <Note key={n}>{n}</Note>)}
            {dataset.grades ? (
              <Note testId="grade-scale">Grades: {Object.entries(dataset.grades).sort((a, b) => b[0] - a[0]).map(([g, t]) => `${g} ${t}`).join('; ')}.</Note>
            ) : null}
          </div>
        ) : <Note tone="warn" testId="no-dataset">No dataset is loaded.</Note>}
        <details className="rounded border border-slate-800 p-2">
          <summary className="cursor-pointer text-xs text-slate-300">Upload your own corpus and judgments</summary>
          <div className="mt-2"><Uploader /></div>
        </details>
      </Section>

      {dataset ? (
        <Section
          title={show === 'queries' ? 'Queries and judgments' : 'Passages'}
          right={(
            <div className="flex gap-1">
              <Button size="sm" variant={show === 'queries' ? 'secondary' : 'ghost'} onClick={() => setShow('queries')}>Queries</Button>
              <Button size="sm" variant={show === 'passages' ? 'secondary' : 'ghost'} onClick={() => setShow('passages')} data-testid="show-passages">Passages</Button>
            </div>
          )}
        >
          {show === 'queries' ? (
            <Grid
              testId="queries-table"
              maxHeight="max-h-[28rem]"
              headers={['Query', 'Text', 'Reference answer', 'Judged', 'Grades (passage: grade)']}
              rows={dataset.queries.map((q) => {
                const j = dataset.judgments[q.id];
                return [
                  q.id, q.text, q.reference ?? '', j ? Object.keys(j).length : 'not judged',
                  j ? Object.entries(j).filter(([, g]) => g > 0).sort((a, b) => b[1] - a[1]).map(([d, g]) => `${d}: ${g}`).join(', ') || 'every grade 0' : '',
                ];
              })}
            />
          ) : (
            <Grid
              testId="passages-table"
              maxHeight="max-h-[28rem]"
              headers={['Passage', 'Title', 'Text']}
              rows={dataset.documents.map((d) => [d.id, d.title || '', d.text])}
            />
          )}
        </Section>
      ) : null}
    </div>
  );
};

export default CorpusPanel;
