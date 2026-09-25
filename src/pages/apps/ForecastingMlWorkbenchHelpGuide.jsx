// In-app help guide for the Production Forecasting ML Workbench (Data & AI D4).
//
// Sourced from the engine itself (the basis strings and refusal messages
// engines/dataai/forecast.js returns) and from its validation record,
// packages/engines/tools/validation/dataai/FINDINGS-forecast.md. Where this
// guide states an equation, a constant or a convention, it is the engine's.
//
// Copy rule (owner): no em dashes and no contrastive negation phrasing.
import React from 'react';
import {
  AlertTriangle, BarChart3, BookOpen, CheckCircle2, Database, GitCompare, Layers, Repeat, Save, Sigma, TrendingDown, Zap,
} from 'lucide-react';
import {
  Callout, Code, Formula, GuideSection, HelpGuideShell, Para, SectionHeading, Step, SubHeading, Table,
} from '@/components/helpguide/HelpGuideLayout';
import { FORECASTING_ROUTE } from '@/utils/dataAi/forecastStudy';
import { DEFAULT_FIRST_ORIGIN, ENGINE_DEFAULTS as D } from '@/utils/dataAi/forecastWorkflows';
import { MAX_WELLS, MAX_SAVED_UPLOAD_VALUES } from '@/utils/dataAi/forecastData';

const n = (x) => x.toLocaleString('en-US');

export const FORECAST_GUIDE_SECTIONS = [
  { id: 'overview', icon: BookOpen, title: 'What this does' },
  { id: 'scope', icon: AlertTriangle, title: 'Read this first' },
  { id: 'quickstart', icon: Zap, title: 'Quick start' },
  { id: 'data', icon: Database, title: 'Data, shut-in months and caps' },
  { id: 'methods', icon: TrendingDown, title: 'Exponential smoothing methods' },
  { id: 'fitting', icon: Sigma, title: 'How parameters are fitted' },
  { id: 'arps', icon: Layers, title: 'The Arps decline baseline' },
  { id: 'intervals', icon: BarChart3, title: 'Bootstrap intervals and P90, P50, P10' },
  { id: 'backtest', icon: Repeat, title: 'Backtests and accuracy metrics' },
  { id: 'field', icon: GitCompare, title: 'Comparing every well' },
  { id: 'saving', icon: Save, title: 'Saving, reproducing and exporting' },
  { id: 'validation', icon: CheckCircle2, title: 'How the engine was validated' },
];

const ForecastingMlWorkbenchHelpGuide = () => (
  <HelpGuideShell
    title="Production Forecasting ML Workbench Help Guide"
    subtitle="Exponential smoothing against the Arps decline, backtested on your own wells"
    metaDescription="How to use the Production Forecasting ML Workbench: loading production series, simple exponential smoothing, Holt's linear trend and the damped trend, parameter fitting, the Arps decline baseline, residual bootstrap P90, P50 and P10, rolling-origin backtests with MASE, sMAPE and MAPE, the field-wide comparison, saved runs and the validation of the engine."
    backTo={FORECASTING_ROUTE}
    backLabel="Back to Production Forecasting ML Workbench"
    icon={TrendingDown}
    sections={FORECAST_GUIDE_SECTIONS}
  >
    <GuideSection id="overview">
      <SectionHeading icon={BookOpen}>What this does</SectionHeading>
      <Para>
        The workbench forecasts a well&apos;s production from its own history with three exponential smoothing methods
        (simple exponential smoothing, Holt&apos;s linear trend and the Gardner and McKenzie damped trend) and sets them
        beside the Arps decline, the petroleum engineer&apos;s baseline. It tests every method the same way: by forecasting
        from past points in the history and scoring the forecasts against what the well then produced.
      </Para>
      <Para>
        Around those sit residual bootstrap intervals (P90, P50 and P10), a backtest you can read origin by origin, and the
        same backtest run across every well of a field. Every number is computed by the Petrolord forecasting engine,
        <Code>engines/dataai/forecast.js</Code>, in a background worker so the page stays responsive. The Arps fit is the
        engine&apos;s import of <Code>engines/dca/arps.js</Code>, the same decline code the Suite&apos;s decline curve
        work uses.
      </Para>
    </GuideSection>

    <GuideSection id="scope">
      <SectionHeading icon={AlertTriangle}>Read this first</SectionHeading>
      <Callout tone="warn" title="These are statistical forecasts of one series">
        Exponential smoothing extrapolates the level and trend it has seen. It knows nothing of reservoir pressure, a
        planned workover, a new well or a facility limit. A backtest says how well a method would have done on this
        well&apos;s past; it is evidence for the next few steps, and weaker evidence the further out you go.
      </Callout>
      <Callout tone="warn" title="The intervals leave out parameter uncertainty">
        The bootstrap resamples the fit&apos;s one-step residuals independently with the parameters held fixed. It carries
        no uncertainty in the parameters and no autocorrelation of errors, so the band is narrower than the whole
        uncertainty. The residuals are used as fitted, without centring, so a biased fit shifts the band as well.
      </Callout>
      <Callout tone="info" title="Methods offered">
        Simple exponential smoothing, Holt&apos;s linear trend, the damped trend, and the Arps decline (exponential,
        harmonic, hyperbolic or the best of the three by RMSE). The engine has no seasonal (Holt-Winters) smoothing and no
        multiplicative error forms, so the workbench offers neither.
      </Callout>
    </GuideSection>

    <GuideSection id="quickstart">
      <SectionHeading icon={Zap}>Quick start</SectionHeading>
      <Step n={1} title="Load production">
        Upload a CSV or Excel table with a well column, a period column and a production column, one row per well and month;
        or choose wells of a field in the Production data spine.
      </Step>
      <Step n={2} title="Fit and forecast">
        Pick a well, keep the three methods ticked with their parameters blank, set the horizon and run. Read the fitted
        parameters, whether the search converged, and which parameters ended on a bound.
      </Step>
      <Step n={3} title="Add intervals">
        Choose a method, the number of paths and a seed, and run the bootstrap for the P90 to P10 band.
      </Step>
      <Step n={4} title="Backtest">
        On <Code>Backtest</Code>, set the horizon and origins and run. The methods and the Arps decline are ranked by MASE;
        pick an origin to see each forecast against the actuals.
      </Step>
      <Step n={5} title="Every well">
        On <Code>Field comparison</Code>, run the same backtest on every well and read how often each method ranked first.
      </Step>
      <Step n={6} title="Save and export">
        Save the run to your organization, or export the CSV with every value at full precision.
      </Step>
    </GuideSection>

    <GuideSection id="data">
      <SectionHeading icon={Database}>Data, shut-in months and caps</SectionHeading>
      <Para>
        The engine treats each value as one time step, oldest first, and needs one value for every step. The workbench
        never invents a value: a blank or missing value refuses the table and names the rows, unless you choose to read
        missing values as 0 (shut in), and then the table notes count them.
      </Para>
      <SubHeading>Uploaded tables</SubHeading>
      <Para>
        Rows are read in file order within each well. The period column labels the steps on charts and in the export; it
        does not reorder them. Without a well column the whole file is one series. Numbers may carry thousands separators;
        text that is not a number is refused by name.
      </Para>
      <SubHeading>The Production data spine</SubHeading>
      <Para>
        The spine stores one row per well per day (<Code>po_daily_production</Code>, imported in the Production Operations
        apps). Choose calendar months and each step is the sum of the rows stored in that month; a month between the
        well&apos;s first and last stored month with no stored value is missing. A ledger imported from a monthly file
        holds one row a month, so its month total is that row as imported. Or take each stored row as one step. Injectors
        and observation wells are left out of the well list.
      </Para>
      <SubHeading>Shut-in steps</SubHeading>
      <Para>
        A 0 is a real value. The smoothing methods fit through it; MAPE is undefined whenever an actual is 0 and the engine
        says which one; the Arps fit drops zero and negative rates before fitting.
      </Para>
      <Table
        headers={['Limit', 'Value']}
        rows={[
          ['Steps per series', n(D.MAX_POINTS)],
          ['Wells per table', n(MAX_WELLS)],
          ['Forecast horizon h', `0 to ${n(D.MAX_H)} steps (1 or more for intervals)`],
          ['Bootstrap paths', `1 to ${n(D.MAX_SIMS)}`],
          ['Backtest origins', `at most ${n(D.MAX_ORIGINS)}`],
          ['Upload values kept in a saved run', n(MAX_SAVED_UPLOAD_VALUES)],
        ]}
      />
    </GuideSection>

    <GuideSection id="methods">
      <SectionHeading icon={TrendingDown}>Exponential smoothing methods</SectionHeading>
      <Para>
        The component form of Hyndman and Athanasopoulos, Forecasting: Principles and Practice (3rd ed.), sections 8.1 and
        8.2. l is the level, b the trend, f the one-step forecast.
      </Para>
      <Formula>f_t = l_(t-1) + phi b_(t-1)    (simple exponential smoothing: f_t = l_(t-1))</Formula>
      <Formula>l_t = alpha y_t + (1 - alpha) f_t</Formula>
      <Formula>b_t = beta (l_t - l_(t-1)) + (1 - beta) phi b_(t-1)</Formula>
      <Para>
        Holt&apos;s linear trend is phi = 1. h steps ahead from the last state: simple exponential smoothing gives l_n at
        every step, Holt l_n + h b_n, and the damped trend l_n + (phi + phi^2 + ... + phi^h) b_n, so its trend fades and the
        forecast levels off. beta is the trend smoothing FPP3 writes beta* (statsmodels smoothing_trend).
      </Para>
      <SubHeading>Initial state</SubHeading>
      <Para>
        Anchored at the first observation (NIST/SEMATECH e-Handbook 6.4.3): l_1 = y_1 and b_1 = y_2 - y_1. With that trend
        start the second value is spent on the initialisation, so errors are scored from step 2 (0-based) for Holt and the
        damped trend and from step 1 for simple exponential smoothing. The fit table shows the first scored step.
      </Para>
    </GuideSection>

    <GuideSection id="fitting">
      <SectionHeading icon={Sigma}>How parameters are fitted</SectionHeading>
      <Para>
        A parameter left blank is estimated by minimising the sum of squared one-step errors over the scored steps; a number
        typed is held fixed. The search is deterministic, so the same series always gives the same parameters.
      </Para>
      <Table
        headers={['Stage', 'Rule']}
        rows={[
          ['Bounds', `alpha and beta from 0 to 1; a fitted phi from ${D.PHI_MIN} to ${D.PHI_MAX} (FPP3 8.2); a typed phi above 0 and at most 1. All bounds inclusive.`],
          ['Grid', 'alpha and beta at 0, 0.1, ..., 1; phi at 0.8, 0.85, 0.9, 0.95, 0.98; the lowest SSE wins, and ties (within 1e-12 relative) keep the earlier point.'],
          ['Compass search', 'from the best grid point, steps of 0.05 of each range tried up and down on alpha, beta and phi in turn; a sweep with no improvement halves the step.'],
          ['Stop', `converged when a step of at most 2^-30 of the range improves nothing; otherwise after ${n(D.PS_MAX_EVALS)} SSE evaluations, with a warning.`],
        ]}
      />
      <Para>
        The fit table reports whether the search converged, how many SSE evaluations it made, and which parameters ended on a
        bound. A parameter on a bound (a phi of 0.98, a beta of 0) is the best value the box allows; the search could go no
        further in that direction. On a series the method fits exactly, every parameter gives the same SSE and the one reported is the
        point the stated rule reaches.
      </Para>
    </GuideSection>

    <GuideSection id="arps">
      <SectionHeading icon={Layers}>The Arps decline baseline</SectionHeading>
      <Para>
        The engine calls <Code>fitArpsModel</Code> and <Code>calculateArpsHyperbolic</Code> from
        <Code>engines/dca/arps.js</Code>: exponential by a log-linear regression, harmonic by a 1/q regression, hyperbolic by
        a b grid from 0.05 by 0.05 to 2 on q^-b, and Auto-Select takes the lowest RMSE. Step k is passed as day k, so qi is
        per step and Di is per step (per month for a monthly series). Zero and negative rates are dropped before fitting,
        and time 0 is the first positive value. At least 3 positive values are needed; a series that shows no decline
        gives no fit, and the engine says why.
      </Para>
    </GuideSection>

    <GuideSection id="intervals">
      <SectionHeading icon={BarChart3}>Bootstrap intervals and P90, P50, P10</SectionHeading>
      <Para>
        The residual bootstrap of FPP3 5.5. Each of nSims paths starts from the fitted final state; at each step it adds a
        residual drawn with replacement from the scored one-step residuals (index floor(u m) for m residuals) to the
        one-step forecast, and the simulated value updates the state. The draws u come from one seeded mulberry32 stream,
        path by path and step by step, so a seed reproduces every path. At least 2 scored residuals are needed.
      </Para>
      <Para>
        The residuals are drawn as fitted, without centring: their mean is not subtracted first. A method whose residuals
        have a non-zero mean therefore drifts. On a declining well the residuals of a flat method (simple exponential
        smoothing) are mostly negative, so its paths, and the P50 with them, can fall below its own point forecast.
      </Para>
      <Para>
        Per step, the 10th, 50th and 90th percentiles of the simulated values are taken with the lib/stats quantile rule
        (simple-statistics 7.8.8: idx = nSims p on the sorted values; idx not whole takes the ceil(idx)-th smallest, idx
        whole with nSims even the mean of the idx-th and (idx+1)-th, idx whole with nSims odd the (idx+1)-th).
      </Para>
      <Callout tone="info" title="The labels follow the exceedance convention">
        Production is an outcome where more is better, so P90 is the low case (the 10th percentile) and P10 the high case
        (the 90th percentile). P90 means a 90% probability the actual quantity meets or exceeds this value, per SPE PRMS.
        With the option ticked, a negative percentile is reported as 0 and counted.
      </Callout>
    </GuideSection>

    <GuideSection id="backtest">
      <SectionHeading icon={Repeat}>Backtests and accuracy metrics</SectionHeading>
      <Para>
        A rolling-origin backtest with an expanding window: origin o trains on steps 0 to o - 1 and forecasts steps o to
        o + H - 1. Origins run from the first origin by the step while o + H is at most the series length, so every origin
        has H actuals. A blank first origin is {DEFAULT_FIRST_ORIGIN}. With refit on, every parameter is re-estimated at
        each origin; with refit off, they are estimated on the first window and held. The Arps decline is refitted on every
        window. Every method is scored on the same origins with the same metrics.
      </Para>
      <Table
        headers={['Metric', 'Definition (e = actual - forecast)']}
        rows={[
          ['MASE', 'mean |e| / Q, with Q = mean |y_t - y_(t-m)| over that origin\'s training values (Hyndman and Koehler 2006); undefined when Q = 0 or the training series has m values or fewer'],
          ['MAE', 'mean |e|'],
          ['RMSE', 'sqrt(mean e^2), divisor n'],
          ['sMAPE', '100 x mean 2|e| / (|actual| + |forecast|), percent on a 0 to 200 scale; a term with actual = forecast = 0 scores 0'],
          ['MAPE', '100 x mean |e / actual|, percent; undefined when any actual is 0'],
          ['ME', 'mean e; positive means the forecast is low'],
        ]}
      />
      <Para>
        MASE is the headline and the default ranking metric: it is scale-free, so it compares wells of any rate, and it
        stays defined through shut-in months. Below 1, a method's forecast errors were smaller on average than the lag-m naive forecast's in-sample errors on the training values. The
        lag m defaults to 1 (the previous step); a production decline has no seasonality to scale by. Pooled metrics average
        over every origin and step. The ranking is lowest first; values within 1e-12 relative keep the listed order
        (methods as chosen, the Arps decline last), and a method whose metric is undefined is left unranked.
      </Para>
    </GuideSection>

    <GuideSection id="field">
      <SectionHeading icon={GitCompare}>Comparing every well</SectionHeading>
      <Para>
        The field comparison runs the same backtest on every well of the table, in the background with a count of wells
        done (on the engine's timing run, 200 wells of 120 months with three origins took about 2.5 seconds). A blank first origin is taken per well from its own
        length. For each method it reports the wells where it ranked first and the mean of the ranking metric over the
        wells where that metric is defined, with the count of wells behind the mean. A well the engine refuses is listed
        with the refusal.
      </Para>
    </GuideSection>

    <GuideSection id="saving">
      <SectionHeading icon={Save}>Saving, reproducing and exporting</SectionHeading>
      <Para>
        A saved run keeps where the series came from (the file&apos;s series, or the field and well ids with the phase and
        time step), the settings as typed with the seed and number of paths, the petrolord-engines commit it ran on, and a
        record of the results with a fingerprint of the series. With the same series, settings, seed and engine the numbers
        are the same. When a run opens, the series is read again; if it has changed, or the engine commit differs, the page
        says so. Runs belong to your organization; the author or an owner or admin can delete one.
      </Para>
      <Para>
        The CSV export has one row per record: the run, data and engine; the spec; every fitted value and residual,
        parameter, optimiser record and forecast; the Arps fit; every interval percentile with the exceedance definition;
        every backtest origin&apos;s forecasts and errors; the metrics; the reason a metric is undefined; engine refusals;
        and engine warnings. Numbers are written at full precision.
      </Para>
    </GuideSection>

    <GuideSection id="validation">
      <SectionHeading icon={CheckCircle2}>How the engine was validated</SectionHeading>
      <Para>
        The engine is gated by 432 tests on 130 golden cases (56 of them refusals, each message pinned in full) written by an
        independent Python oracle that uses only the standard library and takes a different road on every route: the
        error-correction form of the recursions in 60-digit Decimal arithmetic, the damped forecast in closed form, the
        parameter fit by a zoom grid, the metrics in exact fractions and mulberry32 in 32-bit integers.
      </Para>
      <Para>
        Published anchors from the NIST/SEMATECH e-Handbook of Statistical Methods, section 6.4.3, are held at NIST&apos;s
        printed precision, among them the single smoothing MSE of 19.0 at alpha 0.1 and the double smoothing forecasts for
        periods 11 to 15. A second witness, 216 pins from statsmodels, SciPy and scikit-learn, agrees to within 2.1e-16 on
        the metrics and 8e-16 on the backtest forecasts; 8 documented convention differences are recorded. A negative
        control planted 51 defects in the engine and every one turned a gate red.
      </Para>
    </GuideSection>
  </HelpGuideShell>
);

export default ForecastingMlWorkbenchHelpGuide;
