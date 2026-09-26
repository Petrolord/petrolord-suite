/**
 * AI Evaluation Studio page (Data & AI D5).
 *
 * The engine is gated in packages/engines/__tests__/dataai.evaluate.test.js
 * and the workflow layer against the oracle goldens in
 * src/utils/dataAi/__tests__/evalWorkflows.test.js. This mounts the app,
 * because a validated engine behind a mis-wired panel is still a broken app.
 * The Ekene synthetic documents load by default; the page is driven the way a
 * user drives it, and every figure on screen is checked against the oracle
 * golden for that case (or, for the explained query, a golden ranking). The
 * language-model helper is exercised with a mocked edge function: configured
 * (answer checked by the engine), not configured (503) and capped (429).
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import '@testing-library/jest-dom';
import {
  render, screen, fireEvent, within, waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockFrom = jest.fn();
const mockInvoke = jest.fn();
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: (...args) => mockFrom(...args),
    functions: { invoke: (...args) => mockInvoke(...args) },
  },
}));

jest.mock('@/contexts/SupabaseAuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, organization: { id: 'org-1' } }),
}));

import AiEvaluationStudio from '@/pages/apps/AiEvaluationStudio';
import AiEvaluationStudioHelpGuide, { EVAL_GUIDE_SECTIONS } from '@/pages/apps/AiEvaluationStudioHelpGuide';
import { displayNumber } from '@/utils/dataAi/qcDisplay';
import { ASSIST_DAILY_CAP, ASSIST_USER_DAILY_CAP } from '@/utils/dataAi/evalAssist';

const G = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../packages/engines/test-data/dataai/goldens/evaluate_cases.json'), 'utf8'));
const golden = (id) => {
  const c = G.cases.find((x) => x.id === id);
  if (!c) throw new Error(`golden case ${id} is missing`);
  return c.expected;
};
const dn = displayNumber;

const chain = () => {
  const q = {
    select: jest.fn(() => q),
    eq: jest.fn(() => q),
    order: jest.fn(() => q),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    upsert: jest.fn().mockResolvedValue({ error: null }),
    delete: jest.fn(() => q),
    then: (res) => res({ data: [], error: null }),
  };
  return q;
};

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({
    matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
  window.HTMLElement.prototype.releasePointerCapture = window.HTMLElement.prototype.releasePointerCapture || (() => {});
});

beforeEach(() => {
  mockFrom.mockReset();
  mockFrom.mockImplementation(() => chain());
  mockInvoke.mockReset();
});

const mount = () => render(<MemoryRouter><AiEvaluationStudio /></MemoryRouter>);
const openTab = (name) => fireEvent.mouseDown(screen.getByRole('tab', { name }));

describe('the page', () => {
  it('mounts on the Ekene synthetic documents with the saved-run selector, a disabled export and a help link', () => {
    mount();
    expect(screen.getByRole('heading', { name: 'AI Evaluation Studio' })).toBeInTheDocument();
    expect(screen.getByText('Saved evaluation run')).toBeInTheDocument();
    expect(screen.getByTestId('export-csv')).toBeDisabled();
    expect(screen.getByRole('link', { name: /Help guide/ })).toHaveAttribute('href', '/dashboard/apps/data-ai/ai-evaluation-studio/help');
    expect(screen.getByTestId('dataset-label')).toHaveTextContent('Ekene documents (synthetic)');
    expect(screen.getByTestId('dataset-counts')).toHaveTextContent('60 passages, 24 queries (24 judged, 183 judged pairs, 183 with a second grade), 2 systems, 30 extraction records, 200 calibration rows.');
    expect(screen.getByTestId('grade-scale')).toHaveTextContent('Grades: 3 answers the query; 2 relevant; 1 related; 0 judged not relevant.');
    expect(within(screen.getByTestId('queries-table')).getAllByRole('row')).toHaveLength(25);
  });

  it('retrieves by BM25 and explains Q10 with the tie on the duplicate passage', async () => {
    mount();
    openTab('Retrieval');
    fireEvent.change(await screen.findByTestId('ret-k'), { target: { value: '10' } });
    fireEvent.change(screen.getByTestId('ret-query'), { target: { value: 'Q10' } });
    fireEvent.click(screen.getByTestId('run-retrieval'));
    const table = await screen.findByTestId('explain-table');
    const g = golden('bm25-ekene-Q10');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(g.ranking.length);
    g.ranking.forEach((r, i) => {
      expect(rows[i]).toHaveTextContent(r.id);
      expect(rows[i]).toHaveTextContent(dn(r.score));
    });
    expect(g.ties.length).toBeGreaterThan(0);
    expect(screen.getByTestId('explain-ties')).toHaveTextContent(`Tied within the top 10: ${g.ties.map((t) => t.join(' = ')).join('; ')} (ordered by id).`);
    expect(screen.getByTestId('retrieval-basis')).toHaveTextContent('scores that agree to 12 significant digits tie');
  }, 60000);

  it('scores retrieval with the threshold visible, lists Q24 as excluded, and shows the oracle means', async () => {
    mount();
    openTab('Retrieval metrics');
    expect(await screen.findByTestId('met-grade')).toHaveValue('1');
    fireEvent.change(screen.getByTestId('met-source'), { target: { value: 'B' } });
    fireEvent.click(screen.getByTestId('run-metrics'));
    const means = await screen.findByTestId('means-table');
    const g = golden('eval-B-k5');
    const rows = within(means).getAllByRole('row').slice(1);
    ['precision', 'recall', 'hitRate', 'mrr', 'map', 'ndcg'].forEach((k, i) => expect(rows[i]).toHaveTextContent(dn(g.mean[k])));
    expect(screen.getByTestId('metrics-line')).toHaveTextContent('k 5; relevant at grade 1 or more; linear gain; means over 23 of 24 judged queries.');
    expect(screen.getByTestId('excluded-table')).toHaveTextContent('Q24');
    expect(screen.getByTestId('excluded-table')).toHaveTextContent('no judged document has grade 1 or more');
  }, 60000);

  it('compares A and B by a paired bootstrap with the seed shown and percentile labels on the interval', async () => {
    mount();
    openTab('Compare systems');
    fireEvent.click(await screen.findByTestId('run-compare'));
    const table = await screen.findByTestId('compare-table');
    const p = golden('paired-ndcg5-A-B');
    const a = golden('boot-A-ndcg5');
    const rows = within(table).getAllByRole('row');
    expect(rows[0]).toHaveTextContent(`${p.labels.lower} to ${p.labels.upper}`);
    expect(rows[0]).toHaveTextContent('2.5th percentile of the bootstrap difference');
    expect(rows[1]).toHaveTextContent(`${dn(a.lower)} to ${dn(a.upper)}`);
    expect(rows[3]).toHaveTextContent(dn(p.difference));
    expect(rows[3]).toHaveTextContent(`${dn(p.lower)} to ${dn(p.upper)}`);
    expect(screen.getByTestId('compare-line')).toHaveTextContent('nDCG@k over 23 included queries; 2,000 replicates, seed 20260925, 95 percent interval; paired by query');
    expect(screen.getByTestId('compare-share')).toHaveTextContent(`In ${dn(p.shareAtOrBelowZero * 100)} percent of the replicates A does not beat B`);
    expect(screen.getByTestId('compare-share')).toHaveTextContent('it is not a p-value');
  }, 60000);

  it('checks system B claim by claim and names the unsupported ones with the engine reason', async () => {
    mount();
    openTab('Answers and groundedness');
    fireEvent.change(await screen.findByTestId('ans-system'), { target: { value: 'B' } });
    fireEvent.click(screen.getByTestId('run-answers'));
    const summary = await screen.findByTestId('answers-summary');
    const g = golden('answers-B');
    expect(summary).toHaveTextContent(`Claims supported / claims${g.nSupported} / ${g.nClaims}`);
    expect(summary).toHaveTextContent(`Citations not retrieved${g.notRetrievedCitations}`);
    expect(summary).toHaveTextContent('Short answers, SQuAD exact match13 of 24');
    fireEvent.click(screen.getByTestId('answer-Q01'));
    const detail = await screen.findByTestId('answer-detail');
    const q01 = g.perAnswer.find((x) => x.query === 'Q01');
    q01.claims.filter((c) => !c.supported).forEach((c) => expect(detail).toHaveTextContent(c.reason));
  }, 60000);

  it('scores extraction with the four outcomes and the micro and macro figures', async () => {
    mount();
    openTab('Extraction scoring');
    fireEvent.click(await screen.findByTestId('run-extraction'));
    const overall = await screen.findByTestId('extraction-overall');
    const g = golden('ext-A').overall;
    expect(overall).toHaveTextContent(`Micro accuracy${dn(g.microAccuracy)}`);
    expect(overall).toHaveTextContent(`Micro F1${dn(g.microF1)}`);
    expect(overall).toHaveTextContent(`Macro F1 (fields with a filled cell)${dn(g.macroF1)}`);
    expect(overall).toHaveTextContent(`Missed${g.missed}`);
  }, 60000);

  it('computes the three kappas', async () => {
    mount();
    openTab('Agreement');
    fireEvent.click(await screen.findByTestId('run-agreement'));
    const t = await screen.findByTestId('kappa-table');
    const rows = within(t).getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent(dn(golden('kappa-ekene-none').kappa));
    expect(rows[1]).toHaveTextContent(dn(golden('kappa-ekene-linear').kappa));
    expect(rows[2]).toHaveTextContent(dn(golden('kappa-ekene-quadratic').kappa));
    expect(screen.getByTestId('agreement-line')).toHaveTextContent('183 pairs, grades 0, 1, 2, 3.');
  }, 60000);

  it('computes calibration with the closure shown and the reliability chart on the white theme', async () => {
    mount();
    openTab('Calibration');
    fireEvent.click(await screen.findByTestId('run-calibration'));
    const s = await screen.findByTestId('calibration-summary');
    const g = golden('cal-ekene-10');
    expect(s).toHaveTextContent(`Brier score${dn(g.brier)}`);
    expect(s).toHaveTextContent(`ECE (expected calibration error)${dn(g.ece)}`);
    expect(s).toHaveTextContent(`MCE (largest bin gap)${dn(g.mce)}`);
    const rt = within(screen.getByTestId('reliability-table')).getAllByRole('row').slice(1);
    expect(rt).toHaveLength(10);
    g.table.forEach((b, i) => expect(rt[i]).toHaveTextContent(`${b.n}`));
    expect(rt[9]).toHaveTextContent('[0.9, 1]');
    expect(rt[0]).toHaveTextContent('[0, 0.1)');
    expect(screen.getByTestId('murphy-table')).toHaveTextContent('Closure (Brier minus the sum)');
    // WBC is the fifth term of Stephenson, Coelho and Jolliffe (2008) eq. 7, with the paper's factor 2 (engines #258).
    expect(screen.getByTestId('murphy-table')).toHaveTextContent(`WBC, twice the pooled within-bin covariance${dn(g.murphy.withinBinCovariance)}`);
    expect(screen.getByTestId('reliability-chart')).toHaveClass('bg-white');
    expect(screen.getByTestId('export-csv')).not.toBeDisabled();
  }, 60000);
});

describe('the optional language-model helper', () => {
  it('scores a configured helper answer with the engine and labels it as model output, not graded', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        answer: 'Average reservoir pressure was 2,096 psia on 2023-01-01 and 9,999 psia later.', citations: ['EKD-018'], model: 'gpt-6-luna', reasoning_effort: 'low', calls_today: 3, daily_cap: 200, user_calls_today: 2, user_daily_cap: 40,
      },
      error: null,
    });
    mount();
    openTab('Answers and groundedness');
    fireEvent.click(await screen.findByTestId('assist-ask'));
    const res = await screen.findByTestId('assist-result');
    expect(res).toHaveTextContent('Model output, not graded');
    expect(screen.getByTestId('assist-grounded')).toHaveTextContent('Deterministic check: 2 of 3 claims supported');
    expect(screen.getByTestId('assist-claims')).toHaveTextContent('the number 9,999 is not in the cited passage EKD-018; it appears in no passage of the corpus');
    expect(res).toHaveTextContent('Model gpt-6-luna (reasoning effort low); 3 of 200 calls today for your organization, 2 of your 40.');
    expect(screen.getByTestId('assist-section')).toHaveTextContent(`Each organization can make ${ASSIST_DAILY_CAP} helper calls per UTC day and each person ${ASSIST_USER_DAILY_CAP} of them`);
    const [fn, { body }] = mockInvoke.mock.calls[0];
    expect(fn).toBe('ai-eval-assist');
    expect(body.organization_id).toBe('org-1');
    expect(body.passages.map((p) => p.id)).toEqual(['EKD-018', 'EKD-002', 'EKD-004', 'EKD-013', 'EKD-014']);
  }, 60000);

  it('shows a clear not-configured state on 503 and the cap message on 429', async () => {
    const httpError = (status, body) => ({ context: { status, json: async () => body } });
    mockInvoke.mockResolvedValueOnce({ data: null, error: httpError(503, { error: 'not configured' }) });
    mount();
    openTab('Answers and groundedness');
    fireEvent.click(await screen.findByTestId('assist-ask'));
    expect(await screen.findByTestId('assist-not-configured')).toHaveTextContent('The language-model helper is not configured on this server. Everything else in the studio works without it.');
    mockInvoke.mockResolvedValueOnce({ data: null, error: httpError(429, { error: `Personal cap reached: you have made ${ASSIST_USER_DAILY_CAP} of your ${ASSIST_USER_DAILY_CAP} helper calls for today (UTC), and your organization has made 57 of its ${ASSIST_DAILY_CAP}.`, cap_hit: 'user' }) });
    fireEvent.click(screen.getByTestId('assist-ask'));
    await waitFor(() => expect(screen.getByTestId('assist-failed')).toHaveTextContent(`Personal cap reached: you have made ${ASSIST_USER_DAILY_CAP} of your ${ASSIST_USER_DAILY_CAP}`));
  }, 60000);
});

describe('the help guide', () => {
  it('renders every section and states the conventions and the daily cap', () => {
    render(<MemoryRouter><AiEvaluationStudioHelpGuide /></MemoryRouter>);
    EVAL_GUIDE_SECTIONS.forEach((s) => expect(document.getElementById(`section-${s.id}`)).not.toBeNull());
    const text = document.body.textContent;
    expect(text).toContain('two scores equal at 12 digits TIE');
    expect(text).toContain('visible setting with default 1');
    expect(text).toContain('excluded from every mean and listed');
    expect(text).toContain('A probability on an edge opens the bin above it');
    expect(text).toContain('17 of 200 rows sit in a different bin');
    expect(text).toContain('"The end of 2025" is read as the number 2025');
    expect(text).toContain(`An organization can make ${ASSIST_DAILY_CAP} helper calls per UTC day, and each person can make ${ASSIST_USER_DAILY_CAP} of them`);
    expect(text).toContain('The model is OpenAI\'s gpt-6-luna unless the server names another. It is a reasoning model');
    expect(text).toContain('does not count against either cap');
    expect(text).toContain('names the cap reached (the organization\'s or your own)');
    expect(text).not.toMatch(/[–—]/);
    expect(text).not.toMatch(/AI-powered/i);
  });
});
