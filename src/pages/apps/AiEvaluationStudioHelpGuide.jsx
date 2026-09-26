// In-app help guide for the AI Evaluation Studio (Data & AI D5).
//
// Sourced from the engine itself (the basis strings and refusal messages
// engines/dataai/evaluate.js returns) and from its validation record,
// packages/engines/tools/validation/dataai/FINDINGS-evaluate.md. Where this
// guide states an equation, a constant or a convention, it is the engine's.
//
// Copy rule (owner): no em dashes and no contrastive negation phrasing.
import React from 'react';
import {
  AlertTriangle, BarChart3, Bot, BookOpen, CheckCircle2, Database, FileCheck2, GitCompare, ListOrdered, Save, ScanSearch, Search, Users, Zap,
} from 'lucide-react';
import {
  Callout, Code, Formula, GuideSection, HelpGuideShell, Para, SectionHeading, Step, SubHeading, Table,
} from '@/components/helpguide/HelpGuideLayout';
import { EVAL_ROUTE } from '@/utils/dataAi/evalStudy';
import { APP_CAPS } from '@/utils/dataAi/evalData';
import { ENGINE_DEFAULTS as D, DEFAULT_SEED, ASSIST_MAX_PASSAGES } from '@/utils/dataAi/evalWorkflows';
import { ASSIST_DAILY_CAP, ASSIST_DEFAULT_MODEL, ASSIST_USER_DAILY_CAP } from '@/utils/dataAi/evalAssist';

const n = (x) => x.toLocaleString('en-US');

export const EVAL_GUIDE_SECTIONS = [
  { id: 'overview', icon: BookOpen, title: 'What this does' },
  { id: 'scope', icon: AlertTriangle, title: 'Read this first' },
  { id: 'quickstart', icon: Zap, title: 'Quick start' },
  { id: 'data', icon: Database, title: 'Corpus, queries and judgments' },
  { id: 'retrieval', icon: Search, title: 'Retrieval: tokens, BM25, TF-IDF and ties' },
  { id: 'metrics', icon: ListOrdered, title: 'Retrieval metrics' },
  { id: 'compare', icon: GitCompare, title: 'Comparing two systems' },
  { id: 'grounded', icon: FileCheck2, title: 'Answers and groundedness' },
  { id: 'extraction', icon: ScanSearch, title: 'Extraction scoring' },
  { id: 'agreement', icon: Users, title: 'Agreement between graders' },
  { id: 'calibration', icon: BarChart3, title: 'Calibration' },
  { id: 'helper', icon: Bot, title: 'The optional language-model helper' },
  { id: 'saving', icon: Save, title: 'Saving, reproducing and exporting' },
  { id: 'validation', icon: CheckCircle2, title: 'How the engine was validated' },
];

const AiEvaluationStudioHelpGuide = () => (
  <HelpGuideShell
    title="AI Evaluation Studio Help Guide"
    subtitle="Deterministic evaluation of search and question-answering systems over oilfield documents"
    metaDescription="How to use the AI Evaluation Studio: loading a corpus with graded judgments, BM25 and TF-IDF retrieval with stated ties, precision, recall, MRR, MAP and nDCG at k, the no-relevant-query rule, a seeded paired bootstrap between two systems, claim-level groundedness, extraction scoring, Cohen's kappa, calibration with the Brier decomposition, the optional metered language-model helper, saved runs and the validation of the engine."
    backTo={EVAL_ROUTE}
    backLabel="Back to AI Evaluation Studio"
    icon={ScanSearch}
    sections={EVAL_GUIDE_SECTIONS}
  >
    <GuideSection id="overview">
      <SectionHeading icon={BookOpen}>What this does</SectionHeading>
      <Para>
        The studio measures how well a search or question-answering system works on a set of documents, with methods whose
        every step can be checked by hand. It ranks passages for each query by BM25 or TF-IDF and shows what each query term
        contributed; scores rankings against graded relevance judgments (precision, recall, hit, reciprocal rank, average
        precision and nDCG at a cutoff k); compares two systems with a seeded paired bootstrap; checks an answer&apos;s numbers,
        dates and quotes against the passages it cites; scores extracted field values against labels; measures agreement
        between two graders with Cohen&apos;s kappa; and measures how well predicted probabilities are calibrated.
      </Para>
      <Para>
        Every number is computed by the Petrolord evaluation engine, <Code>engines/dataai/evaluate.js</Code>, in a background
        worker so the page stays responsive. The engine runs no language model. An optional helper can send one query to a
        hosted language model; its answer is scored by the same deterministic checks and is never a graded figure.
      </Para>
    </GuideSection>

    <GuideSection id="scope">
      <SectionHeading icon={AlertTriangle}>Read this first</SectionHeading>
      <Callout tone="warn" title="What the checks can and cannot tell you">
        Grounded means the figure is in a passage the answer cites and that was retrieved. A grounded answer can still be wrong:
        in the Ekene set, system B dates a water breakthrough from a passage about another well, and the date is supported because
        that passage contains it. The claim reader sees numbers, ISO dates and quoted spans only, so a claim in words (&quot;the
        rate fell sharply&quot;) is not checked at all.
      </Callout>
      <Para>
        The default dataset, the Ekene documents, is synthetic teaching data for Petrolord&apos;s fictional Ekene field (block
        EK-11): 60 short passages (end of well summaries, geology, PVT, pressure surveys, production and injection notes, daily
        drilling reports, HSE and facilities notes), 24 queries with graded judgments and a second grader, two fixed
        question-answering systems whose answers are hand-written fixture text, 30 extraction records and 200 calibration rows.
        No real company, person, well or incident appears. The NextGen course Applied AI and Language Models reads the same files.
      </Para>
    </GuideSection>

    <GuideSection id="quickstart">
      <SectionHeading icon={Zap}>Quick start</SectionHeading>
      <Step n={1} title="Look at the data">The Ekene documents are loaded when the studio opens. The Corpus and queries tab lists every query with its judged passages and grades, and every passage.</Step>
      <Step n={2} title="Retrieve">On Retrieval, keep BM25 with k 5 and run. Pick Q10 to see two passages tie (EKD-058 is an exact copy of EKD-046).</Step>
      <Step n={3} title="Score the rankings">On Retrieval metrics, run with the defaults. The means are over 23 queries: Q24 has no relevant passage and is listed as excluded, with the reason.</Step>
      <Step n={4} title="Compare the systems">On Compare systems, run System A against System B on nDCG@5 with seed {DEFAULT_SEED}. Read the interval of A minus B.</Step>
      <Step n={5} title="Check the answers">On Answers and groundedness, check System A and then System B, and open an answer to read each claim and its reason.</Step>
      <Step n={6} title="Save and export">Name and save the run for your organization, and export the CSV report.</Step>
    </GuideSection>

    <GuideSection id="data">
      <SectionHeading icon={Database}>Corpus, queries and judgments</SectionHeading>
      <Para>
        Upload either one JSON file in the Ekene fixture shapes (<Code>passages</Code>, <Code>queries</Code> with
        <Code>judgments</Code> and optionally <Code>secondAnnotator</Code>, <Code>systems</Code>, <Code>extraction</Code>,
        <Code>calibration</Code>), or CSV files. Files stay in your browser. CSV is read as RFC 4180: a text that holds a comma,
        a quote or a line break is quoted, and a doubled quote is one quote. The first row names the columns.
      </Para>
      <Table
        headers={['File', 'Columns']}
        rows={[
          ['Passages', 'id, text (title optional)'],
          ['Queries', 'id, text (reference optional: a short reference answer)'],
          ['Judgments', 'query, passage, grade, and optionally grade2 (a second grader on the same pair)'],
          ['Calibration', 'probability, outcome (0 or 1)'],
        ]}
      />
      <Para>
        A grade is a whole number, 0 or more; the Ekene scale is 3 answers the query, 2 relevant, 1 related, 0 judged not
        relevant. A passage that was never judged for a query counts as grade 0 and is counted separately as unjudged. Queries
        without judgments are listed and left out of the retrieval metrics. The studio takes up to {n(APP_CAPS.PASSAGES)} passages
        and {APP_CAPS.QUERIES} queries at a time (the engine itself accepts {n(D.MAX_DOCS)} passages of up to {n(D.MAX_CHARS)} characters).
      </Para>
    </GuideSection>

    <GuideSection id="retrieval">
      <SectionHeading icon={Search}>Retrieval: tokens, BM25, TF-IDF and ties</SectionHeading>
      <SubHeading>Tokens</SubHeading>
      <Para>
        The letters A to Z are lowercased (no other character changes), and the text is split on every run of characters outside
        a to z and 0 to 9. So &quot;1.25&quot; becomes the two tokens 1 and 25, &quot;Ekene-3&quot; becomes ekene and 3, and an
        accented letter is a separator. There is no stemming, so &quot;producing&quot; and &quot;production&quot; are different
        tokens. The optional stop list is scikit-learn&apos;s English list (318 words, BSD-3-Clause). It is off by default because
        it removes words that carry meaning in oilfield text: well, top, bottom, fire, system, the number words one to twelve,
        first and third among them. The query &quot;the well top&quot; loses every token.
      </Para>
      <SubHeading>BM25</SubHeading>
      <Formula>score(d) = sum over distinct query terms t in d of idf(t) x tf (k1 + 1) / (tf + k1 (1 - b + b dl / avgdl))</Formula>
      <Formula>idf(t) = ln(1 + (N - df + 0.5) / (df + 0.5))   (the Lucene idf, never negative)</Formula>
      <Para>
        tf is the term&apos;s count in the passage, dl the passage&apos;s token count after the stop list, avgdl the mean over the
        corpus, N the number of passages and df the number that contain the term. The defaults are k1 {D.K1} and b {D.B}; a blank box
        is the default. b = 0 removes length normalisation; k1 = 0 scores each matched term at its idf. A word repeated in the query
        counts once. Lucene 8 and later drop the (k1 + 1) factor, which scales every score and leaves the order unchanged.
      </Para>
      <SubHeading>TF-IDF</SubHeading>
      <Formula>idf(t) = ln((1 + N) / (1 + df)) + 1;   weight = tf x idf (or (1 + ln tf) x idf with sublinear tf)</Formula>
      <Para>
        These are scikit-learn&apos;s TfidfVectorizer defaults. Each passage vector and the query vector are scaled to unit length and
        the score is their dot product, the cosine. Query terms outside the corpus vocabulary are dropped and listed.
      </Para>
      <SubHeading>Ranking and ties</SubHeading>
      <Para>
        Only passages that match at least one query term (a score above 0) are ranked, so a list can be shorter than k. Scores
        are compared rounded to 12 significant digits: two scores equal at 12 digits TIE, and tied passages go in id order
        (ascending by character code). The Retrieval tab lists every tie within the top k and says when the passage at rank k
        ties with the one below the cut, because then the id alone decided which one made the list.
      </Para>
    </GuideSection>

    <GuideSection id="metrics">
      <SectionHeading icon={ListOrdered}>Retrieval metrics</SectionHeading>
      <Para>
        Each judged query&apos;s ranked list is cut at k. A passage is relevant when its grade is at least the threshold, a visible
        setting with default {D.RELEVANT_GRADE} (the trec_eval default). With the Ekene scale, grade 1 means related; set 2 to count
        only relevant and answering passages. Unjudged passages count as grade 0.
      </Para>
      <Table
        headers={['Metric', 'Definition at cutoff k']}
        rows={[
          ['Precision@k', 'relevant in the top k / k; the divisor is k even when fewer passages are ranked'],
          ['Recall@k', 'relevant in the top k / every relevant judged passage of the query'],
          ['Hit@k', '1 when a relevant passage is in the top k, else 0; the mean is the hit rate'],
          ['Reciprocal rank', '1 / rank of the first relevant passage in the top k, 0 when there is none; the mean is MRR'],
          ['Average precision', '(1 / relevant judged) x sum of precision@i at each relevant rank i up to k; a relevant passage below the cut lowers it; the mean is MAP'],
          ['nDCG@k', 'DCG / ideal DCG; DCG = sum over ranks i up to k of gain / log2(i + 1)'],
        ]}
      />
      <Para>
        The nDCG gain is the grade (linear, the default) or 2^grade - 1 (exponential, which weights a grade 3 passage seven times
        a grade 1). The ideal DCG ranks EVERY judged grade of the query, retrieved or not, best first. The gain uses every grade,
        so the relevance threshold does not change nDCG. When the query has no judged passages, or every judged grade is 0, the
        ideal DCG is 0 and nDCG is undefined: the results table shows &quot;undefined&quot; with a note naming which of the two
        cases applies.
      </Para>
      <Callout tone="info" title="Queries with no relevant passage">
        When a query has no judged passage at the threshold, its recall and average precision are undefined. By default the query
        is excluded from every mean and listed with the engine&apos;s reason (&quot;no judged document has grade 1 or more&quot;), as
        trec_eval does. Choose &quot;Keep, undefined metrics scored 0&quot; to keep it in every mean with each undefined metric
        counted as 0. Either way every mean runs over the same queries. In the Ekene set Q24 has no relevant passage.
      </Callout>
    </GuideSection>

    <GuideSection id="compare">
      <SectionHeading icon={GitCompare}>Comparing two systems</SectionHeading>
      <Para>
        Choose two sources of ranked lists (a system&apos;s own retrieved lists, or the current retrieval settings) and one metric.
        Both are scored with the metric settings of the Retrieval metrics tab, and the per-query values over the included queries
        are resampled {n(APP_CAPS.BOOT_DEFAULT)} times by default (up to {n(APP_CAPS.BOOT_MAX)} here).
      </Para>
      <Para>
        Each replicate draws the query positions with replacement from one seeded mulberry32 stream (index floor(u x n)), replicate
        by replicate, so the same seed gives the same numbers every time. Paired (the default), a replicate uses the same queries
        for both systems and averages A minus B at those positions; unpaired resamples each system on its own, which ignores that
        both answered the same queries and gives a wider interval. Each system&apos;s mean gets its own interval from the same seed.
      </Para>
      <Para>
        The interval is the percentile interval: the lib/stats quantile of the replicates at (1 - level) / 2 and 1 - (1 - level) / 2,
        so at 95 percent the 2.5th and 97.5th percentiles of the bootstrap statistic. They are labelled as percentiles of a statistic
        (the P10, P50 and P90 labels are kept for outcomes such as reserves). The standard error is the standard deviation of the
        replicates with divisor nBoot - 1. The share of replicates at or below 0 is the share where A does not beat B; it describes
        the resampling and is not a p-value.
      </Para>
    </GuideSection>

    <GuideSection id="grounded">
      <SectionHeading icon={FileCheck2}>Answers and groundedness</SectionHeading>
      <Para>
        The deterministic hallucination check reads an answer&apos;s checkable claims in text order: quoted spans (straight or curly
        double quotes) first, then ISO dates YYYY-MM-DD, then numbers (digits with optional comma thousands groups and a decimal
        part; a percent sign is ignored, so &quot;45%&quot; is 45). A number glued to a letter, or joined by a hyphen, underscore or
        slash to a letter or digit, is part of an identifier (Ekene-3, EK1-P, EKD-010) and is not a claim. A leading minus is a sign
        only after a character that is not a letter or digit. Every occurrence is a claim.
      </Para>
      <Para>
        A claim is supported when it appears in a passage the answer cites AND that was retrieved for the query: a number as an equal
        value (or within the relative tolerance you set; 0.002 lets 2,100 stand for 2,096), a date as the same date, a quote as the
        same run of tokens. A citation that was not retrieved is flagged and supports nothing; a citation that is not a passage of the
        corpus is flagged as unknown. Each unsupported claim says why: the figure is in a retrieved passage the answer does not cite,
        in a cited passage that was not retrieved, only in passages neither cited nor retrieved, or in no passage at all.
      </Para>
      <Callout tone="warn" title="Known limits of the claim reader">
        &quot;The end of 2025&quot; is read as the number 2025, never as the date 2025-12-01, so system A&apos;s Q13 answer loses a
        claim it states correctly: a false negative of the claim grammar. A number can also match by coincidence (&quot;5 bbl&quot;
        is found in a passage that says &quot;5 months&quot;). And grounded is a weaker test than correct.
      </Callout>
      <SubHeading>Short answers</SubHeading>
      <Para>
        A system&apos;s short answer is scored against the query&apos;s reference by SQuAD exact match and token F1. Both are normalised
        first: lowercased, ASCII punctuation removed, the words a, an and the removed, whitespace collapsed. So &quot;45.0
        percent&quot; becomes &quot;450 percent&quot; and does not match &quot;45 percent&quot;, and &quot;Ekene-3&quot; becomes
        &quot;ekene3&quot;, which does not match &quot;Ekene 3&quot;. Token F1 counts shared tokens as a multiset; when either side has
        no token, F1 is 1 if both are empty (a correct abstention) and 0 otherwise.
      </Para>
    </GuideSection>

    <GuideSection id="extraction">
      <SectionHeading icon={ScanSearch}>Extraction scoring</SectionHeading>
      <Table
        headers={['Outcome', 'Meaning']}
        rows={[
          ['correct', 'the values match, or both are empty'],
          ['wrong', 'both have a value and they do not match'],
          ['missed', 'the label has a value and the prediction is empty'],
          ['unsupported', 'the label is empty and the prediction has a value'],
        ]}
      />
      <Para>
        Empty means null, absent or a blank string. A text field matches by exact match after the SQuAD normalisation; a number field
        when |prediction - label| &lt;= max(absTol, relTol x |label|), the bound included. A number field reads a number or digits with
        comma thousands groups and a decimal part (&quot;3,038&quot; is 3038; &quot;150 bopd&quot; is wrong, with the reason). A
        labelled record the system did not return is scored as all empty.
      </Para>
      <Para>
        Accuracy is correct cells / cells. Micro accuracy pools every cell and macro accuracy averages the fields; every labelled record
        is scored on every field, so the two are equal. Because correctly empty cells inflate accuracy, precision, recall and F1 are
        also given on the filled cells: precision = correct filled / cells with a prediction, recall = correct filled / cells with a
        label. Micro F1 pools the cells; macro F1 averages the fields that have a filled cell on either side.
      </Para>
    </GuideSection>

    <GuideSection id="agreement">
      <SectionHeading icon={Users}>Agreement between graders</SectionHeading>
      <Formula>kappa = 1 - sum w O / sum w E,   E = row total x column total / n</Formula>
      <Para>
        O counts the items by first grade (rows) and second grade (columns). Unweighted, w is 0 on the diagonal and 1 off it; linear
        weights are |i - j| and quadratic (i - j)^2 on the grade positions, which run from the lowest to the highest grade seen, so a
        grade nobody used still takes its place. Kappa is undefined when both graders gave every item one and the same grade (the
        expected disagreement is 0); the studio then says so where scikit-learn would print nan.
      </Para>
    </GuideSection>

    <GuideSection id="calibration">
      <SectionHeading icon={BarChart3}>Calibration</SectionHeading>
      <Para>
        The probabilities are put in M equal-width bins ({D.BINS} by default, up to {D.MAX_BINS}): p is in bin i when i/M &lt;= p &lt;
        (i+1)/M, with the edges as computed in double precision, and the last bin is closed at 1. A probability on an edge opens the
        bin above it. scikit-learn&apos;s calibration_curve puts an edge value in the bin below (its edges come from linspace), so on the
        Ekene set 17 of 200 rows sit in a different bin there; ECE happens to agree, the table, MCE and reliability differ.
      </Para>
      <Table
        headers={['Score', 'Definition']}
        rows={[
          ['Brier', 'mean (p - y)^2'],
          ['ECE', 'sum over non-empty bins of n_k / N x |observed_k - mean p_k|'],
          ['MCE', 'the largest |observed_k - mean p_k| over non-empty bins'],
          ['Log loss', 'engines/dataai/ml.js logLoss, with probabilities clipped at eps = 1e-15; the clipped count is shown'],
        ]}
      />
      <Formula>Brier = REL - RES + UNC + WBV - WBC</Formula>
      <Para>
        REL = sum n_k (mean p_k - observed_k)^2 / N, RES = sum n_k (observed_k - base rate)^2 / N, UNC = base rate (1 - base rate),
        WBV = sum (p - mean p_k)^2 / N and WBC = 2 sum (y - observed_k)(p - mean p_k) / N. With the two within-bin terms (Stephenson,
        Coelho and Jolliffe 2008, eq. 7) the identity is exact; the studio shows the closure, Brier minus the sum, which is 0 up to
        rounding. WBC is the fifth term of eq. 7 as the paper names it, so it carries the factor 2: it is twice the pooled
        within-bin covariance of outcome and probability.
      </Para>
    </GuideSection>

    <GuideSection id="helper">
      <SectionHeading icon={Bot}>The optional language-model helper</SectionHeading>
      <Para>
        On the Answers tab, the helper sends one query and the passages the current retrieval settings return for it (at most
        {` ${ASSIST_MAX_PASSAGES}`}) to a hosted language model, told to answer only from those passages and to cite passage ids. Its
        answer is then checked by the same deterministic groundedness check as the fixture answers, against the passages it was given.
        It is labelled as model output and is not graded, saved or exported.
      </Para>
      <Para>
        The model is OpenAI&apos;s {ASSIST_DEFAULT_MODEL} unless the server names another. It is a reasoning model, so it is asked for a
        low reasoning effort and runs at the provider&apos;s default temperature; an older model such as gpt-4o-mini, if the server names
        one, runs at temperature 0. The answer line shows the model and the effort used.
      </Para>
      <Para>
        Calls are metered per organization. You must be a member of the organization selected; every call is logged with the model, the
        reasoning effort and the tokens used. An organization can make {ASSIST_DAILY_CAP} helper calls per UTC day, and each person can
        make {ASSIST_USER_DAILY_CAP} of them, so one person cannot use up the organization&apos;s calls. The day runs from 00:00 UTC to
        00:00 UTC. At either cap the helper refuses with a message that names the cap reached (the organization&apos;s or your own) and
        both counts, until 00:00 UTC. A call the model provider fails is logged and does not count against either cap. When the helper
        is not configured on the server, the button says so; everything else in the studio works without it.
      </Para>
    </GuideSection>

    <GuideSection id="saving">
      <SectionHeading icon={Save}>Saving, reproducing and exporting</SectionHeading>
      <Para>
        A saved run keeps the dataset it used (the Ekene documents by name; an upload in the run up to a size limit, beyond which the
        files are asked for again), the settings as typed with the seed, the petrolord-engines commit it ran on, and a record of the
        results with a fingerprint of the data. With the same data, settings, seed and engine the numbers are the same. When a run
        opens, the page says if the data or the engine commit differ. Runs belong to your organization; the author or an owner or
        admin can delete one.
      </Para>
      <Para>
        The CSV report has one row per record: the run, dataset and engine; the settings; engine refusals; every query&apos;s ranking
        with its ties; every metric per query and averaged with the excluded queries and reasons; the comparison values and bootstraps
        with their labels and seed; every claim with its reason and every citation&apos;s status; every extraction cell; the kappas; and
        the calibration table and decomposition, each with the engine&apos;s stated method. Numbers are written at full precision.
      </Para>
    </GuideSection>

    <GuideSection id="validation">
      <SectionHeading icon={CheckCircle2}>How the engine was validated</SectionHeading>
      <Para>
        The engine is gated by 2,707 tests: 282 golden cases (107 of them refusals, each message pinned in full) written by an
        independent Python oracle that uses only the standard library and takes a different road on every route (BM25 and TF-IDF in
        50-digit Decimal arithmetic, every metric, kappa and the calibration table in exact fractions, hand-written scanners for the
        SQuAD normalisation and the claim grammar, mulberry32 in 32-bit integers), and 2,382 pins against scikit-learn and numpy as a
        second witness. A negative control planted 68 defects in the engine, and every one turned the gates red. The studio&apos;s own
        workflows are checked against the same goldens.
      </Para>
    </GuideSection>
  </HelpGuideShell>
);

export default AiEvaluationStudioHelpGuide;
