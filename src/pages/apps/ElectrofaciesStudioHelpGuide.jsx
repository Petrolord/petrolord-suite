// In-app help guide for the Electrofacies Studio (Data & AI D3).
//
// Sourced from the engine itself (the basis strings and refusal messages
// engines/dataai/cluster.js returns) and from its validation record,
// packages/engines/tools/validation/dataai/FINDINGS-cluster.md. Where this
// guide states an equation, a constant or a convention, it is the engine's.
//
// Copy rule (owner): no em dashes and no contrastive negation phrasing.
import React from 'react';
import {
  AlertTriangle, BookOpen, CheckCircle2, Database, GitBranch, Layers, Network, Scale, ScatterChart, Sigma, Target, Upload, Zap,
} from 'lucide-react';
import {
  Callout, Code, Formula, GuideSection, HelpGuideShell, Para, SectionHeading, Step, SubHeading, Table,
} from '@/components/helpguide/HelpGuideLayout';
import { ELECTROFACIES_ROUTE } from '@/utils/dataAi/faciesStudy';
import {
  MAX_ROWS, MAX_KNN_TRAIN_ROWS, ELBOW_SAMPLE_ROWS, SILHOUETTE_MAX_ROWS, AGGLOMERATIVE_MAX_ROWS,
} from '@/utils/dataAi/faciesData';

const n = (x) => x.toLocaleString('en-US');

export const FACIES_GUIDE_SECTIONS = [
  { id: 'overview', icon: BookOpen, title: 'What this does' },
  { id: 'scope', icon: AlertTriangle, title: 'Read this first' },
  { id: 'quickstart', icon: Zap, title: 'Quick start' },
  { id: 'data', icon: Database, title: 'Data, core facies and caps' },
  { id: 'scaling', icon: Scale, title: 'Scaling the logs' },
  { id: 'pca', icon: ScatterChart, title: 'Principal components' },
  { id: 'kmeans', icon: Target, title: 'k-means, elbow and silhouette' },
  { id: 'agglomerative', icon: Network, title: 'Agglomerative clustering' },
  { id: 'supervised', icon: GitBranch, title: 'kNN and CART against the core' },
  { id: 'matching', icon: Sigma, title: 'Comparing clusters with the core' },
  { id: 'writeback', icon: Upload, title: 'Writing a facies log' },
  { id: 'validation', icon: CheckCircle2, title: 'How the engine was validated' },
];

const ElectrofaciesStudioHelpGuide = () => (
  <HelpGuideShell
    title="Electrofacies Studio Help Guide"
    subtitle="Clustering and classification of well logs, compared with core facies"
    metaDescription="How to use the Electrofacies Studio: loading logs and core facies, scaling, principal component analysis, k-means with the elbow and silhouette, agglomerative clustering, kNN and CART scored on held-out wells, matching clusters to core facies with the adjusted Rand index, depth tracks, writing a facies log, and the validation of the engine."
    backTo={ELECTROFACIES_ROUTE}
    backLabel="Back to Electrofacies Studio"
    icon={Layers}
    sections={FACIES_GUIDE_SECTIONS}
  >
    <GuideSection id="overview">
      <SectionHeading icon={BookOpen}>What this does</SectionHeading>
      <Para>
        An electrofacies is a class of depth samples whose log responses are alike. The studio finds such classes from the
        logs alone (unsupervised: k-means and agglomerative clustering) or learns them from core facies and carries them into
        uncored intervals and wells (supervised: k-nearest neighbours and a CART classification tree).
      </Para>
      <Para>
        Around those sit principal component analysis to see how the logs vary together, the elbow and the silhouette to
        judge the number of clusters, a comparison of clusters with the core, facies against depth for each well, and a
        facies log written back to a well with its provenance. Every number is computed by the Petrolord clustering engine,
        <Code>engines/dataai/cluster.js</Code>, in a background worker so the page stays responsive.
      </Para>
      <Para>
        Runs are saved to your organization with their inputs, seeds and a record of the scores. When a run opens, the data
        is read again and you rerun each method; if the data has changed since the save, the studio says so.
      </Para>
    </GuideSection>

    <GuideSection id="scope">
      <SectionHeading icon={AlertTriangle}>Read this first</SectionHeading>
      <Callout tone="warn" title="A cluster is a statistical group of log responses">
        k-means and agglomerative clustering group samples by distance in log space. A cluster becomes a facies only when
        someone who knows the rocks names it, usually against core. The comparison with the core facies is there for that.
      </Callout>
      <Callout tone="warn" title="Held-out wells are the honest test of kNN and CART">
        kNN and CART are scored on cored wells they did not learn from. Their scores describe wells like the training wells;
        a well in another facies belt, borehole condition or logging suite can do worse.
      </Callout>
      <Callout tone="info" title="Methods offered">
        Principal component analysis, k-means (k-means++ starts, Lloyd iterations), agglomerative clustering (Ward,
        complete and average linkage), kNN and CART. A self-organising map is not offered: the engine has no seeded,
        validated version of one.
      </Callout>
    </GuideSection>

    <GuideSection id="quickstart">
      <SectionHeading icon={Zap}>Quick start</SectionHeading>
      <Step n={1} title="Load logs">
        Choose wells from the registry and the curves to read, or upload a CSV or Excel table with a well column, a depth
        column, log columns and, if you have one, a core facies column.
      </Step>
      <Step n={2} title="Choose the logs and the core facies">
        Under <Code>Logs and core</Code>, tick the logs to cluster on (log10 for resistivity), set a depth window if you
        need one, and pick where the core facies come from: a facies code curve, registry interval logs of one kind, or the
        uploaded column.
      </Step>
      <Step n={3} title="Look at the data first">
        Run PCA. The scree plot says how many directions carry the variance; the loadings say which logs drive each one; the
        score crossplot, coloured by core facies, shows whether the facies separate at all.
      </Step>
      <Step n={4} title="Cluster">
        Run the elbow over a range of k, pick k from the drops and the silhouette, run k-means at that k, and read the
        comparison with the core. Try agglomerative clustering on the same k.
      </Step>
      <Step n={5} title="Classify">
        Choose the wells to hold out and run kNN and CART. Read the held-out confusion matrix and the printed tree.
      </Step>
      <Step n={6} title="Look and write">
        Compare the columns under <Code>Depth tracks</Code>, then write the labels you trust to a well as a new curve.
      </Step>
    </GuideSection>

    <GuideSection id="data">
      <SectionHeading icon={Database}>Data, core facies and caps</SectionHeading>
      <Para>
        Registry curves are joined sample by sample within each well; a curve on another depth grid is refused by name. A row
        needs every chosen log: a row missing one, or zero or negative in a log10 log, is left out and counted. Thinning keeps
        entry 0 of each well and every nth entry after it, counting from 0.
      </Para>
      <SubHeading>Core facies</SubHeading>
      <Table
        headers={['Source', 'What a sample gets']}
        rows={[
          ['Facies code curve', 'the curve value at that sample (a number)'],
          ['Registry interval logs', 'the code (or, if blank, the label) of the interval of the chosen kind with top <= depth < base'],
          ['Uploaded column', 'the cell, read as numbers when every filled cell is a number, else as text'],
        ]}
      />
      <Para>
        A row with no core facies is still clustered and classified. It takes no part in the comparison with the core, and
        kNN and CART never learn from it.
      </Para>
      <SubHeading>Caps</SubHeading>
      <Table
        headers={['Limit', 'Value', 'What happens above it']}
        rows={[
          ['Rows per design', n(MAX_ROWS), 'refused with a thinning that fits'],
          ['Silhouette in full', n(SILHOUETTE_MAX_ROWS), 'a seeded sample of that many rows, stated on screen'],
          ['Elbow rows', n(ELBOW_SAMPLE_ROWS), 'a seeded sample of that many rows, stated on screen, with a progress count'],
          ['Agglomerative rows', n(AGGLOMERATIVE_MAX_ROWS), "the engine's refusal, shown as written, or a seeded sample if you tick it"],
          ['kNN training rows', n(MAX_KNN_TRAIN_ROWS), 'refused with a thinning suggestion'],
          ['kNN distance pairs per engine call', '100,000,000', 'classified in batches inside the limit'],
        ]}
      />
      <Para>
        Every seeded sample uses the engine&apos;s own rule: the first m rows of a mulberry32 Fisher-Yates shuffle from the end,
        put back in row order. The same seed gives the same rows.
      </Para>
    </GuideSection>

    <GuideSection id="scaling">
      <SectionHeading icon={Scale}>Scaling the logs</SectionHeading>
      <Para>
        Distances mean nothing across logs in different units until the logs are scaled. The engine default is the standard
        scaler:
      </Para>
      <Formula>z = (x - mean) / SD, with the population SD, fitted on the rows clustered</Formula>
      <Para>
        Min-max scales each log to 0 to 1; None uses the logs as given. A constant log is refused by name. kNN fits the scaler
        on the training rows only and applies it unchanged to the rows it classifies. CART reads the logs as given, since a
        tree&apos;s splits do not change when a log is rescaled.
      </Para>
    </GuideSection>

    <GuideSection id="pca">
      <SectionHeading icon={ScatterChart}>Principal components</SectionHeading>
      <Para>
        With the correlation matrix (the default) each log is standardised with its sample SD (n - 1), so each score variance
        equals its eigenvalue and the eigenvalues sum to the number of logs. The covariance matrix keeps the units (divisor
        n - 1) and lets the widest log dominate.
      </Para>
      <Formula>explained ratio = eigenvalue / sum of eigenvalues; loading = component x sqrt(eigenvalue)</Formula>
      <Para>
        Eigenvalues come from cyclic Jacobi rotations, sorted from largest. A component&apos;s sign is arbitrary, so the
        engine fixes it: the loading with the largest absolute value is made positive. Two neighbouring eigenvalues that
        differ by at most 1e-10 times the largest eigenvalue are flagged, since their directions are not unique. If the
        50th sweep still rotates, the Jacobi method has not converged and that warning is shown first, above any
        repeated-eigenvalue warning.
      </Para>
    </GuideSection>

    <GuideSection id="kmeans">
      <SectionHeading icon={Target}>k-means, elbow and silhouette</SectionHeading>
      <Para>
        k-means++ picks the first centre at row floor(u n) and each later centre with probability proportional to its squared
        distance from the nearest centre chosen, all from one mulberry32 stream seeded as given. Lloyd iterations then move
        each row to its nearest centre and each centre to the mean of its rows until the labels stop changing. With nInit
        starts (default 10) the lowest inertia wins.
      </Para>
      <Formula>inertia = sum over rows of the squared distance to its centre (on the scaled logs)</Formula>
      <Para>
        Ties: squared distances within 1e-12 (relative) of the smallest go to the lower centre; an empty cluster takes the row
        farthest from its centre. The same seed, data and settings give the same clusters.
      </Para>
      <SubHeading>The elbow</SubHeading>
      <Para>
        Inertia generally falls as k grows, so the smallest inertia is no guide. Look for the k after which the drops become
        small. The engine picks no elbow for you. A rise in inertia with k is flagged: that run stopped in a local minimum,
        and more starts help.
      </Para>
      <SubHeading>The silhouette</SubHeading>
      <Formula>s = (b - a) / max(a, b)</Formula>
      <Para>
        a is the mean distance from a row to the other rows of its cluster, b the smallest mean distance to another cluster. s
        runs from -1 to 1; near 1 the row sits well inside its cluster. A row alone in its cluster scores 0. The studio shows
        the mean over the rows and per cluster, and the elbow table marks the k with the highest mean silhouette.
      </Para>
    </GuideSection>

    <GuideSection id="agglomerative">
      <SectionHeading icon={Network}>Agglomerative clustering</SectionHeading>
      <Para>
        Every row starts as its own cluster and the closest pair of clusters merges, step by step, until one is left. The cut
        at k clusters is the state after n - k merges. Distances between clusters follow the linkage:
      </Para>
      <Table
        headers={['Linkage', 'Distance between clusters']}
        rows={[
          ['Ward', 'the rise in the within-cluster sum of squares a merge would cause (height sqrt(2 x that rise), as scipy)'],
          ['Complete', 'the largest distance between a row of one and a row of the other'],
          ['Average (UPGMA)', 'the mean distance over all pairs across the two clusters'],
        ]}
      />
      <Para>
        Merges within 1e-12 (relative) of the smallest are tied and the pair with the lowest cluster ids merges first; the
        studio reports how many steps were tied. The merge height chart shows the last merges: a long bar means the merge
        joined clusters that were far apart, which argues for cutting below it.
      </Para>
    </GuideSection>

    <GuideSection id="supervised">
      <SectionHeading icon={GitBranch}>kNN and CART against the core</SectionHeading>
      <Para>
        Cored wells are split into training wells and held-out wells, whole: by the engine&apos;s seeded group split, or by
        your choice. Each method learns from the cored rows of the training wells and is scored on the cored rows of the
        held-out wells. The final model then learns from every cored row and classifies every row, for the depth tracks and
        the write-back.
      </Para>
      <SubHeading>kNN</SubHeading>
      <Para>
        A row takes the majority facies of its k nearest training rows (default 5). Neighbours are taken one at a time, the
        lowest training row winning among those within 1e-12 of the smallest remaining distance; a tied vote goes to the tied
        facies whose nearest member comes first.
      </Para>
      <SubHeading>CART</SubHeading>
      <Formula>Gini = 1 - sum of p_c squared</Formula>
      <Para>
        Each split takes the log and threshold with the largest fall in weighted Gini impurity; thresholds are midpoints
        between consecutive values, and a value at or below the threshold goes left. Equal falls go to the lower log, then the
        lower threshold. A node stops at the maximum depth (default 5, the root is depth 0), when pure, when it cannot leave
        the minimum rows in each leaf, or when no split lowers the impurity. The studio prints the tree as the engine writes
        it, with thresholds as exact decimals.
      </Para>
      <SubHeading>Scores</SubHeading>
      <Para>
        The confusion matrix counts held-out rows by core facies (down) and predicted facies (across). Precision, recall and
        F1 per facies, their macro and support-weighted means, and accuracy come from the engine&apos;s classification report; a
        ratio with a zero denominator scores 0. The adjusted Rand index compares the two partitions without regard to names.
      </Para>
    </GuideSection>

    <GuideSection id="matching">
      <SectionHeading icon={Sigma}>Comparing clusters with the core</SectionHeading>
      <Para>
        Cluster numbers carry no facies names, so each cluster is matched to a facies before a confusion matrix can be read.
        The studio chooses the matching and says which ran:
      </Para>
      <Table
        headers={['Clusters on the cored rows', 'Matching', 'Rule']}
        rows={[
          ['no more than the facies', 'one-to-one', 'each cluster to a different facies, maximising the rows matched (Hungarian); among equal totals, the first mapping in cluster order'],
          ['more than the facies', 'majority', "each cluster to its most common facies, several clusters can share one; a tie to the facies that sorts first"],
        ]}
      />
      <Para>
        The adjusted Rand index does not depend on the matching:
      </Para>
      <Formula>ARI = (sum C(n_ij, 2) - E) / (mean(sum C(a_i, 2), sum C(b_j, 2)) - E), E = sum C(a_i, 2) sum C(b_j, 2) / C(n, 2)</Formula>
      <Para>
        It is 1 when clusters and facies partition the rows the same way and near 0 for a partition no better than chance.
        With majority matching several clusters can take one facies, so read the accuracy beside the index.
      </Para>
    </GuideSection>

    <GuideSection id="writeback">
      <SectionHeading icon={Upload}>Writing a facies log</SectionHeading>
      <Para>
        The labels of one method on one loaded registry well are saved as a new curve through the wells registry&apos;s own
        write path. A stored curve is never replaced: the default mnemonic is EFAC_KM, EFAC_AGG, EFAC_KNN or EFAC_CART, and a
        name the well already has is refused.
      </Para>
      <Para>
        The curve holds a whole-number code per sample: cluster numbers for k-means and agglomerative clustering; for kNN and
        CART the facies itself when the core facies are numbers, else its position in the sorted facies list. Samples without
        a label are null. The legend, the method and its parameters, the seed, the scaling, the logs, the core facies source,
        the scores against the core, the rows and wells used and the engine version travel with the curve as provenance.
      </Para>
      <Para>
        Before the write the studio checks the training range. For each log it takes the min and max over the rows the
        method was fitted on (every row for k-means, the tree&apos;s rows for agglomerative clustering, every cored row for
        kNN and CART) and counts the labelled rows of the chosen well below the min or above the max; a value equal to a
        bound is inside. The counts per log and the number of rows with any log outside are shown, with a warning when that
        number is above 0, since a method extrapolates on those rows. The write goes ahead either way and the counts are
        stored in the provenance. For a log-scaled curve the check reads the log10 values the method read.
      </Para>
    </GuideSection>

    <GuideSection id="validation">
      <SectionHeading icon={CheckCircle2}>How the engine was validated</SectionHeading>
      <Para>
        The engine is checked against 145 cases written by an independent oracle in plain Python (68 of them refusals, each
        message pinned in full). The oracle takes a different road on every route: eigenvalues by bisection with Sylvester&apos;s
        law, merge heights from their definitions at every step, CART splits recounted in exact fractions, the adjusted Rand
        index by counting all row pairs, one-to-one matching by brute force. numpy, scipy and scikit-learn are a second
        witness (169 pins, 18 documented convention differences). A negative control planted 52 defects in the engine and
        every one turned the gates red.
      </Para>
      <Para>
        Fisher&apos;s iris measurements (1936) anchor the methods to published figures: the covariance PCA explained variance
        ratios 0.92461872 and 0.05306648 printed by scikit-learn&apos;s documentation are reproduced to 8 decimals.
      </Para>
      <Para>
        This studio is tested the same way: every PCA, clustering, silhouette, elbow table, matching, held-out prediction,
        confusion matrix and tree it shows is compared, whole, with direct calls to the engine made in the stated order on
        the same rows.
      </Para>
    </GuideSection>
  </HelpGuideShell>
);

export default ElectrofaciesStudioHelpGuide;
