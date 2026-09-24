// In-app help guide for the ML Workbench (Data & AI D2).
//
// Sourced from the engine itself (the basis strings and refusal messages
// engines/dataai/ml.js returns) and from its validation record,
// packages/engines/tools/validation/dataai/FINDINGS-ml.md. Where this guide
// states an equation, a constant or a convention, it is the engine's.
//
// Copy rule (owner): no em dashes and no contrastive negation phrasing.
import React from 'react';
import {
  AlertTriangle, BarChart3, BookOpen, BrainCircuit, CheckCircle2, Database, Gauge, GitBranch, Layers, Scale, Shuffle, Sigma,
  Upload, Zap,
} from 'lucide-react';
import {
  Callout, Code, Formula, GuideSection, HelpGuideShell, Para, SectionHeading, Step, SubHeading, Table,
} from '@/components/helpguide/HelpGuideLayout';
import { ML_WORKBENCH_ROUTE } from '@/utils/dataAi/mlStudy';
import { MAX_FIT_ROWS, MAX_IMPORTANCE_ROWS } from '@/utils/dataAi/mlData';

export const ML_GUIDE_SECTIONS = [
  { id: 'overview', icon: BookOpen, title: 'What this does' },
  { id: 'scope', icon: AlertTriangle, title: 'Read this first' },
  { id: 'quickstart', icon: Zap, title: 'Quick start' },
  { id: 'data', icon: Database, title: 'Data, rows and caps' },
  { id: 'scaling', icon: Scale, title: 'Standardising features' },
  { id: 'validation-schemes', icon: GitBranch, title: 'Group split and group k-fold' },
  { id: 'regression', icon: Sigma, title: 'OLS and ridge regression' },
  { id: 'classification', icon: Layers, title: 'Logistic regression' },
  { id: 'metrics', icon: Gauge, title: 'Every score and its convention' },
  { id: 'leakage', icon: Shuffle, title: 'The leakage comparison' },
  { id: 'diagnostics', icon: BarChart3, title: 'Permutation importance and learning curves' },
  { id: 'writeback', icon: Upload, title: 'Writing a predicted curve' },
  { id: 'validation', icon: CheckCircle2, title: 'How the engine was validated' },
];

const MlWorkbenchHelpGuide = () => (
  <HelpGuideShell
    title="ML Workbench Help Guide"
    subtitle="Regression and logistic classification on well data, validated by holding out whole wells"
    metaDescription="How to use the ML Workbench: the data, standardisation, group split and group k-fold, OLS, ridge and logistic regression, every metric and its convention, the leakage comparison, permutation importance, learning curves, writing a predicted curve to a well, and the NIST validation of the engine."
    backTo={ML_WORKBENCH_ROUTE}
    backLabel="Back to ML Workbench"
    icon={BrainCircuit}
    sections={ML_GUIDE_SECTIONS}
  >
    <GuideSection id="overview">
      <SectionHeading icon={BookOpen}>What this does</SectionHeading>
      <Para>
        The workbench fits linear and logistic models to well data and tells you how well they do on wells they have
        never seen. Its headline job is the missing log: predict a curve (a sonic, a density) in a well that lacks it from
        curves that well does have, trained on wells that have them all. It also classifies rows into two classes you
        define, such as pay and non-pay by a cutoff on a curve.
      </Para>
      <Para>
        Three methods are available: ordinary least squares (OLS), ridge regression and binary logistic regression.
        Validation always holds out whole wells. Around them sit a leakage comparison (random rows against whole wells),
        permutation importance and a learning curve. Every fit, split, score and prediction is computed by the Petrolord ML
        engine, <Code>engines/dataai/ml.js</Code>, in a background worker so the page stays responsive. These are
        statistical models fitted by least squares or maximum likelihood; the workbench says which one ran and with what
        settings.
      </Para>
      <Para>
        Runs are saved to your organization with their inputs and a record of the scores. When a run opens, the data is
        read again, and pressing Fit and validate recomputes everything; if the data has changed since the save, the
        workbench says so.
      </Para>
    </GuideSection>

    <GuideSection id="scope">
      <SectionHeading icon={AlertTriangle}>Read this first</SectionHeading>
      <Callout tone="warn" title="Held-out scores are the only honest scores">
        A model always looks good on the rows it was fitted on. The scores that matter are the held-out ones, from wells
        the model did not see. Even those describe wells like the training wells; a well in another facies belt, another
        borehole condition or another logging suite can do worse.
      </Callout>
      <Callout tone="warn" title="A predicted curve is a model output">
        A predicted DT or RHOB is a regression estimate with an error about the size of the held-out RMSE. It carries its
        provenance in the registry, and it should be used knowing that: a density porosity from a predicted RHOB inherits
        that error.
      </Callout>
      <Callout tone="info" title="What is not here">
        The models are linear in the features you give them (with log10 where you ask for it). There are no trees, no
        neural networks, no automatic feature search and no hyperparameter search. Classification is binary. Curves of one
        well must share one depth grid; the workbench joins them sample by sample and refuses a curve on another grid.
      </Callout>
    </GuideSection>

    <GuideSection id="quickstart">
      <SectionHeading icon={Zap}>Quick start</SectionHeading>
      <Step n={1} title="Choose the wells and curves">
        In the left panel pick Well logs, tick two or more wells, list their curves and tick the ones you need (the target
        and the features). Or upload a table with a column naming the well of every row.
      </Step>
      <Step n={2} title="Set up the model">
        On the Model tab choose Predict a curve or Classify rows, the target (or the label rule) and the features, with
        log10 on resistivity. Leave standardisation on. Choose group k-fold (k = 5 by default) or a group split, and a seed.
      </Step>
      <Step n={3} title="Fit and validate">
        The Validation results tab shows each fold&apos;s held-out wells and scores, the pooled scores, the coefficients of
        the model fitted on every row, and the crossplot, depth track or ROC curve.
      </Step>
      <Step n={4} title="Check it, then use it">
        Run the leakage comparison, permutation importance and the learning curve. Then, for a regression, write the
        prediction to a well on the Write to a well tab. Export the CSV (every number at full precision) or the PDF.
      </Step>
      <SubHeading>With the Ekene demonstration data</SubHeading>
      <Para>
        Import the kit&apos;s <Code>01-wells/*.las</Code> files in the Well Data Manager. Ekene-1 to Ekene-8 carry GR, RHOB,
        NPHI, DT and RT; Ekene-9 has GR, DT and RT and no density. Train RHOB on GR, DT and log10(RT) over Ekene-1 to 8
        and write RHOB_ML into Ekene-9. Ekene is a synthetic teaching field, so its scores say nothing about a real one.
      </Para>
    </GuideSection>

    <GuideSection id="data">
      <SectionHeading icon={Database}>Data, rows and caps</SectionHeading>
      <Para>
        A row is one depth sample of one well. The design matrix X has one column per feature (log10 applied where you
        ticked it), the target y is the target curve (or the 0 and 1 label) and the group of each row is its well name.
        A row is left out, and counted, when it is outside the depth window, thinned out, missing the target or any feature,
        or has a zero or negative value in a logged feature. Nothing is filled in.
      </Para>
      <Para>
        Thinning keeps entry 0 of each well and every nth entry after it, entries counted from 0 in each well. A label from
        a cutoff is class 1 where the comparison you chose holds (for example RT &gt;= 3) and class 0 elsewhere; a label
        column must hold only 0 and 1.
      </Para>
      <Table
        headers={['Cap', 'Why']}
        rows={[
          [`${MAX_FIT_ROWS.toLocaleString('en-US')} rows per fit`, 'Engine timings (Node 18, one host): one OLS fit on 200,000 rows and 8 features about 1 s, one logistic fit about 2 s, or 5 to 6 s when the label is separated (the separation test is the heaviest path). Group k-fold repeats the fit per fold.'],
          [`${MAX_IMPORTANCE_ROWS.toLocaleString('en-US')} held-out rows for permutation importance`, 'It re-scores the model once per feature and repeat. With AUC every re-scoring sorts the rows: 200,000 rows and 8 features took about 10 s, 50,000 rows about 2.3 s.'],
          ['4,000 points per chart', 'Charts with more points show every nth row from row 0 and say so; the CSV export has every row.'],
        ]}
      />
      <Para>
        Above a cap the workbench refuses and says by how much. Narrow the depth window or keep every 2nd or nth sample;
        neighbouring log samples are strongly correlated, so thinning loses little.
      </Para>
    </GuideSection>

    <GuideSection id="scaling">
      <SectionHeading icon={Scale}>Standardising features</SectionHeading>
      <Formula>z = (x - mean) / sd, per feature, with the mean and the POPULATION sd (divide by n) of the training rows</Formula>
      <Para>
        Standardisation is on by default. In every fold the scaler is fitted on that fold&apos;s training rows only and
        applied unchanged to its held-out rows, so nothing about the held-out wells reaches the model. The population SD
        matches scikit-learn&apos;s StandardScaler. (The Data Quality Studio&apos;s z-scores use the sample SD, n - 1, as
        the NIST z-score does; the two differ by the factor sqrt(n / (n - 1)).) A feature whose training values are all
        identical is refused by name, because standardising would divide by zero.
      </Para>
      <Para>
        Why it matters. OLS and unpenalised logistic predictions do not change when a feature is rescaled, but the
        coefficients do, and two things depend on their size. Ridge penalises the sum of squared coefficients, so the
        penalty is only fair across features on one scale (the engine standardises inside ridge in any case). And the
        logistic stopping rule is in coefficient units: the fit stops when the largest component of the full Newton step
        is at most 1e-10. With a feature in very small units (a compressibility in 1/Pa gives a coefficient near 1e9) that
        test cannot be met and the fit ends with converged false and a warning. On standardised features coefficients are
        of order one and the rule means what it says.
      </Para>
      <Para>
        With standardisation on, a coefficient is the change in the target (or in the log odds) per one training SD of its
        feature, and the intercept is the value at the training means.
      </Para>
    </GuideSection>

    <GuideSection id="validation-schemes">
      <SectionHeading icon={GitBranch}>Group split and group k-fold</SectionHeading>
      <Para>
        Both hold out whole wells, so no well has rows on both sides. Well names are sorted (by character code), then
        shuffled once with the seed (the mulberry32 generator of the Petrolord statistics library; Fisher-Yates from the
        end, j = floor(u (i + 1))). The same seed always gives the same wells.
      </Para>
      <Table
        headers={['Scheme', 'Rule']}
        rows={[
          ['Group split', 'The first ceil(test fraction x wells) wells of the shuffled order are held out. A product within 1e-9 of a whole number counts as that number (0.28 x 25 is 7 in exact arithmetic and 7.000000000000001 in floating point; it holds out 7). A fraction that would hold out every well is refused.'],
          ['Group k-fold', 'The shuffled wells are dealt round robin: the well at shuffled position q goes to fold q mod k. Each fold is held out once, trained on every other well. k runs from 2 to the number of wells; k equal to the number of wells is leave-one-well-out.'],
        ]}
      />
      <Callout tone="info" title="Folds balance wells">
        Round robin puts the same number of wells in each fold, give or take one. A fold with long wells therefore holds
        more rows than a fold with short ones. (scikit-learn&apos;s GroupKFold balances row counts instead and has no seed.)
      </Callout>
      <Para>
        Folds and wells are numbered from 0, as the engine numbers them. The pooled scores put every held-out prediction
        back on its own row and score all of them together: with k-fold that is every row, each predicted by the one fold
        model that never saw its well. If the engine refuses any fold, the pooled score is withheld and the refusal is
        shown.
      </Para>
    </GuideSection>

    <GuideSection id="regression">
      <SectionHeading icon={Sigma}>OLS and ridge regression</SectionHeading>
      <SubHeading>Ordinary least squares</SubHeading>
      <Formula>minimise sum (y - b0 - x&apos;b)^2;  s^2 = RSS / (n - p);  SE_j = s sqrt(diag((X&apos;X)^-1))</Formula>
      <Para>
        Solved by Householder QR on the design with unit-length columns, then two steps of iterative refinement with the
        residual carried in double-double precision. p counts the intercept; n must exceed p. R-squared on the fitted rows
        is centred (about the mean of y). The coefficient table shows each estimate with its standard error and t value.
      </Para>
      <Callout tone="warn" title="The condition limit, 1e8">
        The engine computes the scaled condition number of the design (every column scaled to unit length, Belsley) and
        refuses a fit above 1e8. At that condition number, squared and multiplied by machine epsilon (2.2e-16), the
        classical worst-case bound for a least squares solution is about 2, so no digit of some coefficient could be
        guaranteed. Exactly at the limit is fitted. This refuses nearly collinear features (a curve and a copy of it, or
        two curves that move together everywhere): drop or combine one. NIST&apos;s Filip dataset, a degree 10 polynomial
        with a scaled condition number of 5.2e9, is refused at this limit for the same reason; forced through, it can
        reach only about 8 digits, the most its float64 inputs carry. The workbench keeps the default limit.
      </Callout>
      <SubHeading>Ridge regression</SubHeading>
      <Formula>minimise sum (y - b0 - z&apos;b)^2 + lambda sum b_j^2   (z standardised, b0 not penalised)</Formula>
      <Para>
        The engine standardises the features with the population SD of the training rows, centres y, and solves by QR of
        [Z; sqrt(lambda) I]. lambda multiplies the sum of squares, so it equals scikit-learn Ridge&apos;s alpha on the same
        standardised features; lambda = 0 is OLS. Ridge fits collinear designs that OLS refuses. The table shows the
        coefficients in the units of the features passed and on the engine&apos;s standardised features, and the effective
        degrees of freedom, sum d_i^2 / (d_i^2 + lambda) over the singular values d_i of Z. Ridge gives no standard errors.
      </Para>
    </GuideSection>

    <GuideSection id="classification">
      <SectionHeading icon={Layers}>Logistic regression</SectionHeading>
      <Formula>P(class 1) = 1 / (1 + exp(-(b0 + x&apos;b)))</Formula>
      <Para>
        Fitted by Newton-Raphson (iteratively reweighted least squares) from all coefficients at zero. It stops when the
        largest component of the full Newton step is at most 1e-10, or after 100 updates with converged false and a
        warning quoting the last step. A step that lowers the log likelihood by more than 1e-12 x (1 + |log likelihood|) is
        halved, up to 30 times; convergence is judged on the full step, so halving can never fake it. The Newton system is
        solved by a Cholesky factorisation of the unit-diagonal scaled matrix with a relative pivot rule. Each fold shows
        whether it converged and in how many updates. Standard errors come from the inverse information at the solution.
      </Para>
      <Callout tone="warn" title="Separation is refused, in the engine's words">
        If a combination of the features puts every class 1 row on one side of a line and every class 0 row on the other
        (complete separation), or on or on their own side with some exactly on it (quasi-complete), the maximum likelihood
        coefficients are infinite. The engine tests for this before iterating, with two linear programmes (Gordan&apos;s
        and Stiemke&apos;s theorems of the alternative), and refuses an unpenalised fit with a message saying which kind it
        found. The usual cause in well data is a label cut from a curve that is also a feature. Remove that feature, or add
        an L2 penalty: with L2 &gt; 0 the fit proceeds and the separation is reported.
      </Callout>
      <Para>
        The optional penalty is (L2 / 2) x the sum of squared non-intercept coefficients, so L2 = 1 / C in
        scikit-learn&apos;s terms. A probability above 0.5 is class 1; a probability of exactly 0.5 is class 0.
      </Para>
    </GuideSection>

    <GuideSection id="metrics">
      <SectionHeading icon={Gauge}>Every score and its convention</SectionHeading>
      <Table
        headers={['Score', 'Definition and convention']}
        rows={[
          ['RMSE', 'sqrt(sum (y - yhat)^2 / n), in the target units'],
          ['MAE', 'sum |y - yhat| / n'],
          ['R-squared (held out)', '1 - SSE / sum (y - mean of these held-out y)^2, as scikit-learn r2_score. Negative when the model does worse than that mean. A fold whose held-out target does not vary is refused.'],
          ['Confusion matrix', 'Rows are the TRUE class, columns the PREDICTED class (the scikit-learn layout), classes 0 then 1.'],
          ['Precision, recall, F1', 'TP / (TP + FP), TP / (TP + FN), F1 = 2TP / (2TP + FP + FN). A zero denominator scores 0 and is listed. Macro is the plain mean over the classes; weighted is weighted by support (true count).'],
          ['ROC and AUC', 'Class 1 is positive. One point per distinct probability, so tied rows move together as one diagonal step. AUC by the trapezoid rule, which equals the probability that a random class 1 row scores above a random class 0 row, ties counting one half. A held-out fold with only one class has no ROC and says so.'],
          ['Log loss', '-(1/n) sum [y ln p + (1 - y) ln(1 - p)], natural log, with every probability clipped to [1e-15, 1 - 1e-15] (eps = 1e-15); the number of clipped rows is shown.'],
        ]}
      />
      <Para>
        On screen figures are shortened to at most 6 decimal places (at least 4 significant figures for a small number);
        the CSV export writes every number at full precision.
      </Para>
    </GuideSection>

    <GuideSection id="leakage">
      <SectionHeading icon={Shuffle}>The leakage comparison</SectionHeading>
      <Para>
        The same model and data are scored under a random row split and under a group split with the same test fraction
        and seed. In the random split, neighbouring samples of every well sit on both sides; the panel lists those shared
        wells. Optimism is the random-split test score minus the group-split test score (the other way round for RMSE,
        MAE and log loss), so a positive optimism means the random split looked better.
      </Para>
      <Callout tone="info" title="Which way it falls depends on the data">
        A random split flatters a model when the features let it recognise the well: a per-well offset, a well-level
        attribute. On the engine&apos;s constructed leak data (five well-level attributes and a large per-well offset) the
        random-split test R-squared was 0.60 to 0.68 against a group-split R-squared of -2.3 to -36. On plain log curves
        with no well identifiers the difference was small and went the other way (optimism -0.016 in RMSE). Read the sign
        the engine reports for your data. The group split is the estimate for a new well either way.
      </Callout>
      <Para>
        The comparison and the learning curve fit on the features as given. Ridge standardises inside them on each
        training set, and OLS and unpenalised logistic predictions are unchanged by rescaling; a penalised logistic fit
        there is penalised in the features&apos; own units.
      </Para>
    </GuideSection>

    <GuideSection id="diagnostics">
      <SectionHeading icon={BarChart3}>Permutation importance and learning curves</SectionHeading>
      <SubHeading>Permutation importance</SubHeading>
      <Para>
        One group split (the diagnostics fraction and seed); the scaler and the model are fitted on its training wells.
        For each feature in column order, and each repeat, the feature&apos;s values are shuffled across the held-out rows
        (one seeded stream for the whole run) and the model is re-scored. The drop is the loss of score, positive when the
        feature matters: baseline minus permuted for R-squared, accuracy and AUC, permuted minus baseline for RMSE, MAE and
        log loss. The SD over repeats is the population SD. The ranking is by mean drop, ties in column order. A drop at or
        below zero is possible and is shown; a correlated partner feature can carry the same information, so a low
        importance does not prove a feature is useless.
      </Para>
      <SubHeading>Learning curve</SubHeading>
      <Para>
        One group split fixes the held-out wells. The model is fitted on the first 1, 2, 3 and more training wells of the
        split&apos;s shuffled order and scored on its own training rows and on the held-out wells. If the engine cannot fit
        the smallest sizes (one well can hold only one class), the curve starts at the first size it can fit and shows the
        engine&apos;s reason for each size left out. A held-out curve still rising at the last point suggests more wells
        would help; a wide gap between the training and held-out curves suggests the wells differ in ways the features do
        not capture.
      </Para>
    </GuideSection>

    <GuideSection id="writeback">
      <SectionHeading icon={Upload}>Writing a predicted curve</SectionHeading>
      <Para>
        After a regression fit, the model fitted on every row (its scaler fitted on every row too) predicts the target in a
        well you choose, from that well&apos;s own feature curves. A sample with a missing feature, or a zero or negative
        value in a logged feature, gets no prediction and is stored as null.
      </Para>
      <Para>
        The curve is saved through the wells registry&apos;s own write path as a NEW curve. Its mnemonic defaults to the
        target with the suffix _ML (DT_ML, RHOB_ML), and the workbench refuses the target&apos;s own name or any name the
        well already has, so a measured curve is never overwritten. The stored provenance lists the method, the features
        and transforms, the scaler and the coefficients, the training wells and rows, the validation scheme, seed and
        pooled held-out scores, the engine version and the run name.
      </Para>
    </GuideSection>

    <GuideSection id="validation">
      <SectionHeading icon={CheckCircle2}>How the engine was validated</SectionHeading>
      <Para>
        The engine, <Code>engines/dataai/ml.js</Code> in the Petrolord engines, is checked against 171 cases written by an
        independent oracle in plain Python from the published equations (exact rational arithmetic for least squares,
        60-digit decimals for ridge and logistic regression), and against numpy, scikit-learn and statsmodels as a second
        witness (276 pins). A negative control planted 41 defects in the engine and every one turned the gates red.
      </Para>
      <Para>
        The least squares solver is anchored to the NIST Statistical Reference Datasets for linear regression, which
        publish certified coefficients, standard errors, residual SD and R-squared:
      </Para>
      <Table
        headers={['NIST dataset', 'Difficulty', 'Result']}
        rows={[
          ['Norris, Pontius', 'lower', 'fitted; coefficients to 14.1 and 13.5 significant digits'],
          ['NoInt1, NoInt2', 'average', 'fitted without an intercept; uncentred R-squared as certified'],
          ['Longley', 'higher', 'fitted; coefficients to 14.6 digits'],
          ['Wampler1 to Wampler5', 'higher', 'fitted; coefficients to 13.2 to 16 digits'],
          ['Filip', 'higher', 'refused at the default condition limit 1e8 (scaled condition number 5.2e9)'],
        ]}
      />
      <Para>
        On the ten datasets it fits, every engine coefficient reaches the number of digits the float64 data themselves
        allow. The splits and permutation importance have one independent witness (the oracle&apos;s own mulberry32),
        since no library shares that generator.
      </Para>
      <Para>
        This workbench is tested on Ekene data the same way: every fold, score, coefficient, importance, learning curve
        point and leakage figure it shows is compared, whole, with direct calls to the engine made in the stated order
        (engine split, scaler fitted on the training rows, fit, predict the held-out wells, score).
      </Para>
    </GuideSection>
  </HelpGuideShell>
);

export default MlWorkbenchHelpGuide;
