// AI Evaluation Studio (Data & AI D5): the evaluation dataset.
//
// One shape for everything the studio scores, whether it is the Ekene
// synthetic documents fixture (the default, the same files the engine gate
// and the NextGen course read) or an upload:
//
//   {
//     source: 'ekene' | 'upload', label, synthetic,
//     documents:   [{ id, text, title?, type?, well?, date? }]   passages
//     queries:     [{ id, text, reference? }]
//     judgments:   { queryId: { passageId: grade } }             graded 0 and up
//     second:      { queryId: { passageId: grade } } | null      a second annotator
//     systems:     [{ id, name, retriever?, answers: [{ query, retrieved, text, citations, short? }] }]
//     extraction:  { fields, labels, predictions: { systemId: [...] } } | null
//     calibration: { rows: [{ probability, outcome, query?, passage? }] } | null
//     notes:       [text]
//   }
//
// This file only reads and reshapes. It checks what the engine cannot know
// (the app's caps, which columns hold what, that a grade is a whole number)
// and leaves every scoring rule to the engine, which refuses bad values with
// its own message.
import corpusJson from '../../../packages/engines/test-data/dataai/ekene-docs/corpus.json';
import queriesJson from '../../../packages/engines/test-data/dataai/ekene-docs/queries.json';
import systemsJson from '../../../packages/engines/test-data/dataai/ekene-docs/systems.json';
import extractionJson from '../../../packages/engines/test-data/dataai/ekene-docs/extraction.json';
import calibrationJson from '../../../packages/engines/test-data/dataai/ekene-docs/calibration.json';
import { splitDelimited, fileExtension } from '@/lib/tabularFile';

/** App limits (the engine's own caps are higher; FINDINGS-evaluate.md proposes these for the app). */
export const APP_CAPS = Object.freeze({
  PASSAGES: 2000,
  QUERIES: 200,
  BOOT_DEFAULT: 2000,
  BOOT_MAX: 10000,
  CALIBRATION_ROWS: 100000,
});

export const EKENE_LABEL = 'Ekene documents (synthetic)';

/** UTF-16 code unit order, the engine's id order. */
export const cmpId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const refuseCaps = (documents, queries) => {
  if (documents.length > APP_CAPS.PASSAGES) {
    throw new Error(`The corpus has ${documents.length.toLocaleString('en-US')} passages; this studio takes up to ${APP_CAPS.PASSAGES.toLocaleString('en-US')}.`);
  }
  if (queries.length > APP_CAPS.QUERIES) {
    throw new Error(`There are ${queries.length.toLocaleString('en-US')} queries; this studio evaluates up to ${APP_CAPS.QUERIES} at a time.`);
  }
};

/** The Ekene synthetic documents fixture, as the studio's dataset. */
export function ekeneDataset() {
  const documents = corpusJson.passages.map((p) => ({
    id: p.id, text: p.text, title: p.title, type: p.type, well: p.well, date: p.date,
  }));
  const queries = queriesJson.queries.map((q) => ({ id: q.id, text: q.text, reference: q.reference }));
  const judgments = Object.fromEntries(queriesJson.queries.map((q) => [q.id, { ...q.judgments }]));
  const second = Object.fromEntries(queriesJson.queries.map((q) => [q.id, { ...q.secondAnnotator }]));
  const systems = systemsJson.systems.map((s) => ({
    id: s.id,
    name: s.name,
    retriever: { ...s.retriever },
    answers: s.answers.map((a) => ({
      query: a.query, retrieved: a.retrieved.slice(), text: a.text, citations: a.citations.slice(), short: a.short,
    })),
  }));
  return {
    source: 'ekene',
    label: EKENE_LABEL,
    synthetic: true,
    documents,
    queries,
    judgments,
    second,
    grades: { ...queriesJson.grades },
    systems,
    extraction: {
      fields: extractionJson.fields.map((f) => ({ ...f })),
      labels: extractionJson.labels,
      predictions: extractionJson.predictions,
    },
    calibration: {
      rows: calibrationJson.rows.map((r) => ({
        query: r.query, passage: r.passage, probability: r.probability, outcome: r.relevant,
      })),
      description: calibrationJson.description,
    },
    notes: [
      'Synthetic teaching data for the Ekene field (Petrolord, fictional block EK-11). No real company, person, well or incident.',
      queriesJson.pooling,
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Uploads. */

/** A delimited text to header + rows. The first row always names the columns. */
export function readDelimited(text, fileName = '') {
  const ext = fileExtension(fileName);
  const delimiter = ext === 'csv' ? ',' : ext === 'tsv' ? '\t' : 'auto';
  const { rows } = splitDelimited(String(text || ''), delimiter);
  if (!rows.length) throw new Error(`${fileName || 'The file'} has no rows.`);
  const header = rows[0].map((h) => String(h).trim().toLowerCase());
  return { header, rows: rows.slice(1) };
}

const colOf = (header, names, what, fileName, required = true) => {
  const i = header.findIndex((h) => names.includes(h));
  if (i < 0 && required) {
    throw new Error(`${fileName || 'The file'} needs a column named ${names.map((n) => `"${n}"`).join(' or ')} (${what}); its header row has ${header.map((h) => `"${h}"`).join(', ')}.`);
  }
  return i;
};

const nonBlank = (s) => typeof s === 'string' && s.trim().length > 0;

/** Passages from a CSV: columns id and text, title optional. */
export function passagesFromCsv(text, fileName = 'passages.csv') {
  const { header, rows } = readDelimited(text, fileName);
  const iId = colOf(header, ['id', 'passage', 'passage_id', 'document', 'doc_id'], 'the passage id', fileName);
  const iText = colOf(header, ['text', 'passage_text', 'body'], 'the passage text', fileName);
  const iTitle = colOf(header, ['title'], 'a title', fileName, false);
  const out = [];
  const seen = new Map();
  rows.forEach((r, j) => {
    const id = (r[iId] ?? '').trim();
    if (!id) throw new Error(`${fileName} row ${j + 2}: the passage id is blank.`);
    if (seen.has(id)) throw new Error(`${fileName} row ${j + 2}: passage id ${id} repeats row ${seen.get(id) + 2}.`);
    seen.set(id, j);
    const doc = { id, text: r[iText] ?? '' };
    if (iTitle >= 0 && nonBlank(r[iTitle])) doc.title = r[iTitle].trim();
    out.push(doc);
  });
  if (!out.length) throw new Error(`${fileName} has a header row and no passages.`);
  return out;
}

/** Queries from a CSV: columns id and text, reference (a short answer) optional. */
export function queriesFromCsv(text, fileName = 'queries.csv') {
  const { header, rows } = readDelimited(text, fileName);
  const iId = colOf(header, ['id', 'query', 'query_id', 'qid'], 'the query id', fileName);
  const iText = colOf(header, ['text', 'query_text', 'question'], 'the query text', fileName);
  const iRef = colOf(header, ['reference', 'answer', 'reference_answer'], 'a reference answer', fileName, false);
  const out = [];
  const seen = new Map();
  rows.forEach((r, j) => {
    const id = (r[iId] ?? '').trim();
    if (!id) throw new Error(`${fileName} row ${j + 2}: the query id is blank.`);
    if (seen.has(id)) throw new Error(`${fileName} row ${j + 2}: query id ${id} repeats row ${seen.get(id) + 2}.`);
    seen.set(id, j);
    const q = { id, text: r[iText] ?? '' };
    if (iRef >= 0 && nonBlank(r[iRef])) q.reference = r[iRef].trim();
    out.push(q);
  });
  if (!out.length) throw new Error(`${fileName} has a header row and no queries.`);
  return out;
}

const gradeOf = (s, fileName, row, what) => {
  const t = String(s ?? '').trim();
  if (!/^\d+$/.test(t)) throw new Error(`${fileName} row ${row}: the ${what} "${t}" is not a whole number of 0 or more.`);
  return Number(t);
};

/**
 * Judgments from a CSV: columns query, passage and grade, and optionally
 * grade2 (a second annotator on the same pair, for Cohen's kappa). One row
 * per judged (query, passage) pair.
 */
export function judgmentsFromCsv(text, fileName = 'judgments.csv') {
  const { header, rows } = readDelimited(text, fileName);
  const iQ = colOf(header, ['query', 'query_id', 'qid'], 'the query id', fileName);
  const iP = colOf(header, ['passage', 'passage_id', 'document', 'doc_id', 'id'], 'the passage id', fileName);
  const iG = colOf(header, ['grade', 'relevance', 'label'], 'the grade', fileName);
  const iG2 = colOf(header, ['grade2', 'second_grade', 'annotator2'], 'a second grade', fileName, false);
  const judgments = {};
  const second = iG2 >= 0 ? {} : null;
  rows.forEach((r, j) => {
    const row = j + 2;
    const q = (r[iQ] ?? '').trim();
    const p = (r[iP] ?? '').trim();
    if (!q || !p) throw new Error(`${fileName} row ${row}: the query id and the passage id must both be given.`);
    if (!judgments[q]) judgments[q] = {};
    if (Object.prototype.hasOwnProperty.call(judgments[q], p)) throw new Error(`${fileName} row ${row}: query ${q} and passage ${p} are judged twice.`);
    judgments[q][p] = gradeOf(r[iG], fileName, row, 'grade');
    if (second) {
      if (!second[q]) second[q] = {};
      second[q][p] = gradeOf(r[iG2], fileName, row, 'second grade');
    }
  });
  return { judgments, second };
}

/** Calibration rows from a CSV: columns probability and outcome (0 or 1). */
export function calibrationFromCsv(text, fileName = 'calibration.csv') {
  const { header, rows } = readDelimited(text, fileName);
  const iP = colOf(header, ['probability', 'p', 'prob', 'score'], 'the predicted probability', fileName);
  const iY = colOf(header, ['outcome', 'y', 'label', 'relevant', 'actual'], 'the 0 or 1 outcome', fileName);
  if (rows.length > APP_CAPS.CALIBRATION_ROWS) throw new Error(`${fileName} has ${rows.length.toLocaleString('en-US')} rows; the studio takes up to ${APP_CAPS.CALIBRATION_ROWS.toLocaleString('en-US')}.`);
  // Values that are not numbers reach the engine as NaN and it names the row.
  const num = (s) => { const t = String(s ?? '').trim(); return t === '' ? NaN : Number(t); };
  return { rows: rows.map((r) => ({ probability: num(r[iP]), outcome: num(r[iY]) })) };
}

/** A whole dataset from one JSON file in the fixture's shapes. */
export function datasetFromJson(text, fileName = 'dataset.json') {
  let d;
  try {
    d = JSON.parse(text);
  } catch (e) {
    throw new Error(`${fileName} is not valid JSON: ${e.message}`);
  }
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error(`${fileName} must hold one JSON object with passages and queries.`);
  const passages = d.passages || d.documents;
  if (!Array.isArray(passages) || !passages.length) throw new Error(`${fileName} needs a non-empty "passages" array of { id, text }.`);
  if (!Array.isArray(d.queries) || !d.queries.length) throw new Error(`${fileName} needs a non-empty "queries" array of { id, text }.`);
  const documents = passages.map((p) => ({ ...p }));
  const queries = d.queries.map((q) => ({ id: q.id, text: q.text, ...(q.reference ? { reference: q.reference } : {}) }));
  const judgments = {};
  let second = null;
  d.queries.forEach((q) => {
    if (q && q.judgments && typeof q.judgments === 'object') judgments[q.id] = { ...q.judgments };
    if (q && q.secondAnnotator && typeof q.secondAnnotator === 'object') {
      second = second || {};
      second[q.id] = { ...q.secondAnnotator };
    }
  });
  const sys = Array.isArray(d.systems) ? d.systems : [];
  const systems = sys.map((s, i) => ({
    id: String(s.id ?? `S${i + 1}`),
    name: s.name || `System ${s.id ?? i + 1}`,
    retriever: s.retriever || null,
    answers: Array.isArray(s.answers) ? s.answers : [],
  }));
  const ex = d.extraction;
  const extraction = ex && Array.isArray(ex.fields) && Array.isArray(ex.labels) ? {
    fields: ex.fields, labels: ex.labels, predictions: ex.predictions && typeof ex.predictions === 'object' ? ex.predictions : {},
  } : null;
  const cal = d.calibration;
  const calRows = Array.isArray(cal) ? cal : Array.isArray(cal?.rows) ? cal.rows : null;
  const calibration = calRows ? {
    rows: calRows.map((r) => ({
      query: r.query, passage: r.passage, probability: r.probability, outcome: r.outcome ?? r.relevant ?? r.y,
    })),
  } : null;
  return {
    documents, queries, judgments, second, systems, extraction, calibration,
  };
}

/**
 * Assemble an uploaded dataset. Passages and queries are required; the
 * judgments, second grades, systems, extraction labels and calibration rows
 * are optional and each tab says what it needs.
 */
export function uploadDataset({
  label, documents, queries, judgments = {}, second = null, systems = [], extraction = null, calibration = null,
}) {
  if (!Array.isArray(documents) || !documents.length) throw new Error('Load the passages first.');
  if (!Array.isArray(queries) || !queries.length) throw new Error('Load the queries first.');
  refuseCaps(documents, queries);
  const notes = [];
  const qids = new Set(queries.map((q) => q.id));
  const unknown = Object.keys(judgments).filter((q) => !qids.has(q)).sort(cmpId);
  if (unknown.length) {
    throw new Error(`The judgments name ${unknown.length === 1 ? 'a query' : 'queries'} not in the queries file: ${unknown.slice(0, 5).join(', ')}${unknown.length > 5 ? ' and more' : ''}.`);
  }
  const unjudged = queries.filter((q) => !judgments[q.id]).map((q) => q.id);
  if (unjudged.length) notes.push(`${unjudged.length} of ${queries.length} queries have no judgments and are left out of the retrieval metrics: ${unjudged.slice(0, 8).join(', ')}${unjudged.length > 8 ? ' and more' : ''}.`);
  return {
    source: 'upload',
    label: label || 'Uploaded corpus',
    synthetic: false,
    documents,
    queries,
    judgments,
    second,
    grades: null,
    systems,
    extraction,
    calibration,
    notes,
  };
}

/** The judged queries in the order they were loaded. */
export const judgedQueryIds = (dataset) => (dataset ? dataset.queries.filter((q) => dataset.judgments[q.id]).map((q) => q.id) : []);

/** Counts for the data summary line. */
export function datasetCounts(dataset) {
  if (!dataset) return null;
  const judged = judgedQueryIds(dataset);
  const pairs = judged.reduce((s, q) => s + Object.keys(dataset.judgments[q]).length, 0);
  return {
    passages: dataset.documents.length,
    queries: dataset.queries.length,
    judgedQueries: judged.length,
    judgedPairs: pairs,
    secondGrades: dataset.second ? judged.reduce((s, q) => s + Object.keys(dataset.second[q] || {}).length, 0) : 0,
    systems: dataset.systems.length,
    extractionRecords: dataset.extraction ? dataset.extraction.labels.length : 0,
    calibrationRows: dataset.calibration ? dataset.calibration.rows.length : 0,
  };
}

/** What an uploaded dataset keeps in a saved run (the Ekene fixture is referenced, never copied). */
export const MAX_SAVED_UPLOAD_CHARS = 1500000;

export function snapshotDataset(dataset) {
  if (!dataset || dataset.source !== 'upload') return null;
  const snap = {
    label: dataset.label,
    documents: dataset.documents,
    queries: dataset.queries,
    judgments: dataset.judgments,
    second: dataset.second,
    systems: dataset.systems,
    extraction: dataset.extraction,
    calibration: dataset.calibration,
  };
  return JSON.stringify(snap).length <= MAX_SAVED_UPLOAD_CHARS ? snap : null;
}

export function datasetFromSnapshot(snap) {
  if (!snap || !Array.isArray(snap.documents) || !Array.isArray(snap.queries)) return null;
  return uploadDataset(snap);
}

/** File name to the kind of upload it is read as. */
export const isJsonFile = (name) => fileExtension(name) === 'json';
