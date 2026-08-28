// Help-sheet body for Decline Curve Analysis (rendered inside the shared
// StudioHelp drawer since W5; the Sheet chrome lives in the Studio kit).
// Kept in step with the shipped surface: multi-stream import, the Model Fit /
// Forecast Results split, well grouping and rollup, and the Economics handoff.
import React from 'react';
import { Save, BookOpen, AlertTriangle, Sparkles, BarChart2, Layers, Share2 } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const DCAHelpContent = () => {
  return (
    <>
    {/* Saving and undo */}
    <section className="bg-slate-900/50 p-4 rounded-lg border border-slate-800">
      <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-blue-400">
        <Save size={16} />
        <h3>Saving Your Work</h3>
      </div>
      <ul className="text-xs space-y-2 list-disc pl-4 text-slate-400">
        <li>Your project saves itself a few seconds after every change. The header shows when the last save landed, and you can force one with the Save button beside it.</li>
        <li>Deleting a project or a well shows a toast with an Undo button for ten seconds. The row is only removed for good once that window closes.</li>
        <li>Everything else, including fits, forecasts and scenarios, is stored with the project and is there when you come back.</li>
      </ul>
    </section>

    {/* Analysis Guide */}
    <section>
      <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-emerald-400 border-b border-slate-800 pb-2">
        <BookOpen size={16} />
        <h3>Workflow Guide</h3>
      </div>

      <Accordion type="single" collapsible className="w-full space-y-2">

        {/* Item 1: Quick Start */}
        <AccordionItem value="item-1" className="border border-slate-800 rounded-lg bg-slate-900/30 px-3">
          <AccordionTrigger className="text-sm font-medium text-slate-200 hover:text-white hover:no-underline py-3">
            1. Quick Start (5 minutes to first forecast)
          </AccordionTrigger>
          <AccordionContent className="text-sm text-slate-400 space-y-3 pb-4 pt-1">
            <ol className="list-decimal pl-4 text-xs space-y-2">
              <li><strong>Create a project</strong> using the Project dropdown in the top-left.</li>
              <li><strong>Add a well</strong> using the + button next to the Well dropdown.</li>
              <li><strong>Upload a CSV</strong> by dragging into the upload box. The file needs a date column and at least one rate column. After upload, the box turns green showing the filename, record count, and date range.</li>
              <li><strong>Pick a stream</strong> if the file carried more than one. The Production Stream strip under the importer switches between oil, gas and water.</li>
              <li><strong>Fit a model</strong>: leave Decline Model at "Auto-Select (Best Fit)" and click <em>Fit Model</em>. The fitted curve overlays the historical points on the Model Fit tab.</li>
              <li><strong>Generate a forecast</strong>: set your limits in Forecast Settings, then click <em>Generate Forecast</em>. Switch to the <strong>Forecast Results</strong> tab for the rate and cumulative table, the EUR cards and the CSV export.</li>
            </ol>
            <div className="bg-emerald-900/20 border border-emerald-900/50 p-3 rounded text-xs">
              That is the minimum path. The next sections cover the full feature set.
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Item 2: CSV Format */}
        <AccordionItem value="item-2" className="border border-slate-800 rounded-lg bg-slate-900/30 px-3">
          <AccordionTrigger className="text-sm font-medium text-slate-200 hover:text-white hover:no-underline py-3">
            2. CSV Format &amp; Data Import
          </AccordionTrigger>
          <AccordionContent className="text-sm text-slate-400 space-y-3 pb-4 pt-1">
            <p className="text-xs">
              Petrolord auto-detects the date and rate columns from common header names. You need a date column and at least one rate column. A single file can carry all three streams at once:
            </p>
            <div className="bg-slate-900 p-3 rounded border border-slate-800 font-mono text-xs">
              <div className="text-slate-300">date,oilRate,gasRate,waterRate</div>
              <div className="text-slate-500">2020-01-01,1850.0,2400.0,120.0</div>
              <div className="text-slate-500">2020-01-06,1827.5,2385.1,131.4</div>
              <div className="text-slate-500">2020-01-11,1805.3,2370.6,143.8</div>
              <div className="text-slate-500">...</div>
            </div>
            <ul className="text-xs list-disc pl-4 space-y-1">
              <li>A plain <code className="bg-slate-800 px-1 rounded">rate</code> column is still accepted and is read as the oil stream.</li>
              <li>Date column accepts ISO format (YYYY-MM-DD), MM/DD/YYYY, or DD/MM/YYYY.</li>
              <li>Rates are in <strong>bbl/d</strong> for oil and water, <strong>Mscf/d</strong> for gas.</li>
              <li>Zero rates are interpreted as shut-ins; the segment detector handles them automatically.</li>
              <li>Additional columns are tolerated but ignored.</li>
              <li>After upload, the data quality summary reports the record count, the date range and any gaps or outliers found.</li>
            </ul>
            <div className="bg-amber-900/20 border border-amber-900/50 p-3 rounded flex gap-2">
              <AlertTriangle className="text-amber-500 shrink-0" size={16} />
              <div className="text-xs">
                <strong className="text-amber-500 block mb-1">Replace vs Clear</strong>
                After upload, use <em>Replace File</em> to swap the data without losing the well, or <em>Clear</em> to wipe the data and reset the upload box.
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Item 3: Streams and well metadata */}
        <AccordionItem value="item-3" className="border border-slate-800 rounded-lg bg-slate-900/30 px-3">
          <AccordionTrigger className="text-sm font-medium text-slate-200 hover:text-white hover:no-underline py-3">
            3. Production Streams &amp; Well Metadata
          </AccordionTrigger>
          <AccordionContent className="text-sm text-slate-400 space-y-3 pb-4 pt-1">
            <p className="text-xs">
              A well holds an oil, gas and water history side by side. The Production Stream strip picks which one you are working on, and it drives everything downstream: the fit, the diagnostics, the forecast, and which scenarios are listed.
            </p>
            <ul className="text-xs space-y-1 list-disc pl-4">
              <li>Only the streams present in your CSV are offered.</li>
              <li>Each stream carries its own fit and its own forecast, so a gas fit is never overwritten by refitting oil.</li>
              <li><strong className="text-amber-400">The fit belongs to the stream rather than to the well.</strong> Switching wells leaves the previous well's fit, diagnostics, KPI cards and forecast on screen, now shown against the new well. Re-fit immediately after every well change, and treat any result you did not just generate as belonging to the previous well.</li>
              <li>Switching streams re-renders the charts against that stream's units.</li>
            </ul>
            <div className="bg-slate-900 p-3 rounded border border-slate-800">
              <h4 className="text-xs font-bold text-slate-200 mb-1">Well Metadata</h4>
              <p className="text-xs">
                The metadata panel at the top of the right sidebar holds two fields: comma separated <strong>Tags</strong> for grouping and filtering, and free text <strong>Notes</strong> for engineering comments. Tags are what the well filters on the Type Curve tab read, so they are worth keeping tidy on a field with many wells.
              </p>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Item 4: Arps Models */}
        <AccordionItem value="item-4" className="border border-slate-800 rounded-lg bg-slate-900/30 px-3">
          <AccordionTrigger className="text-sm font-medium text-slate-200 hover:text-white hover:no-underline py-3">
            4. Arps Decline Models
          </AccordionTrigger>
          <AccordionContent className="text-sm text-slate-400 space-y-3 pb-4 pt-1">
            <div className="bg-slate-900 p-3 rounded border border-slate-800">
              <div className="font-mono text-xs bg-black/30 p-2 rounded text-emerald-400 text-center mb-2">
                q(t) = qᵢ / (1 + b · Dᵢ · t)^(1/b)
              </div>
              <ul className="space-y-1 text-xs list-disc pl-4">
                <li><strong className="text-slate-200">qᵢ</strong>: initial rate at t=0.</li>
                <li><strong className="text-slate-200">Dᵢ</strong>: initial nominal decline (1/d). Reported as %/yr in the UI.</li>
                <li><strong className="text-slate-200">b</strong>: decline exponent.</li>
              </ul>
            </div>
            <ul className="text-xs space-y-2 list-disc pl-4">
              <li><span className="text-blue-400 font-semibold">Exponential (b = 0):</span> Constant percentage decline. Conservative; appropriate for boundary-dominated flow in conventional reservoirs.</li>
              <li><span className="text-blue-400 font-semibold">Hyperbolic (0 &lt; b &lt; 2):</span> Decline rate decreases over time. Standard for unconventional wells. Most shales fit b = 0.8 to 1.5, and the B-FACTOR CONSTRAINTS default caps b at 1.0, so raise that ceiling before fitting a shale or the fit will sit on the bound.</li>
              <li><span className="text-blue-400 font-semibold">Harmonic (b = 1):</span> Special case of hyperbolic. Most optimistic late-time behavior.</li>
              <li><span className="text-blue-400 font-semibold">Auto-Select:</span> Petrolord fits all three and keeps the one with the lowest RMSE. Good default for unfamiliar wells. Note that RMSE decides it, so on noisy data the winner is not always the one with the best R².</li>
            </ul>
            <div className="bg-amber-900/20 border border-amber-900/50 p-3 rounded flex gap-2">
              <AlertTriangle className="text-amber-500 shrink-0" size={16} />
              <div className="text-xs">
                <strong className="text-amber-500 block mb-1">Choosing the Fit Window</strong>
                Including transient flow (early-life flush production) gives artificially high b values and over-forecast reserves. Use the Fit Window date pickers to start the fit AT the onset of established decline.
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Item 5: Diagnostics */}
        <AccordionItem value="item-5" className="border border-slate-800 rounded-lg bg-slate-900/30 px-3">
          <AccordionTrigger className="text-sm font-medium text-slate-200 hover:text-white hover:no-underline py-3">
            5. Diagnostics: Verdict, Residuals, Segments
          </AccordionTrigger>
          <AccordionContent className="text-sm text-slate-400 space-y-3 pb-4 pt-1">
            <p className="text-xs">
              The right-sidebar Diagnostics section evaluates fit quality after every fit:
            </p>
            <ul className="text-xs space-y-2 list-disc pl-4">
              <li><strong className="text-emerald-400">Excellent (R² ≥ 0.95):</strong> Forecast is reliable for typical use.</li>
              <li><strong className="text-amber-400">Good (0.85 ≤ R² &lt; 0.95):</strong> Acceptable, with minor uncertainty on late-time extrapolation.</li>
              <li><strong className="text-red-400">Poor (R² &lt; 0.85):</strong> Check for multi-segment behavior or data anomalies.</li>
            </ul>
            <div className="bg-slate-900 p-3 rounded border border-slate-800">
              <h4 className="text-xs font-bold text-slate-200 mb-1">Detected Segments</h4>
              <p className="text-xs">
                Petrolord uses piecewise regression to find regime changes such as transient giving way to boundary-dominated and then terminal decline. Each breakpoint is flagged with the date and the R² improvement that splitting yields. The detector is robust against noise, so clean wells correctly report a single segment.
              </p>
            </div>
            <div className="bg-slate-900 p-3 rounded border border-slate-800">
              <h4 className="text-xs font-bold text-slate-200 mb-1">Normalized Residuals</h4>
              <p className="text-xs">
                The residuals chart shows per-point fit error normalized by the predicted rate. Random scatter around zero means a good fit. Systematic patterns such as waves, drift or clustered outliers suggest the wrong model or a missing regime change.
              </p>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Item 6: Forecast Settings */}
        <AccordionItem value="item-6" className="border border-slate-800 rounded-lg bg-slate-900/30 px-3">
          <AccordionTrigger className="text-sm font-medium text-slate-200 hover:text-white hover:no-underline py-3">
            6. Forecast Settings: Limits &amp; Constraints
          </AccordionTrigger>
          <AccordionContent className="text-sm text-slate-400 space-y-3 pb-4 pt-1">
            <ul className="text-xs space-y-2 list-disc pl-4">
              <li><strong>Economic Limit Rate:</strong> Production rate where opex exceeds revenue. The forecast stops here when <em>Stop at Limit</em> is on. Set it realistically, typically 1 to 10 bbl/d for oil.</li>
              <li><strong>Max Duration (Days):</strong> Hard cap on forecast length. Default 3,650 (10 years).</li>
              <li><strong>Facility Limit (Max Rate):</strong> Intended to cap the rate during early life on a choked-back well. It is currently read but not applied by the deterministic forecast, so setting it changes nothing on the Forecast Results tab. Leave it at 0 and impose any plateau outside this app until that is wired.</li>
              <li><strong>Stop at Limit:</strong> When on, the forecast terminates at the economic limit rate. When off, it runs to Max Duration.</li>
              <li><strong>Random Seed</strong> (probabilistic mode only): Fixes the Monte Carlo draws so a run can be repeated exactly. Default 42.</li>
              <li><strong>Economic Limit Uncertainty</strong> (probabilistic mode only): How far each realization may move the economic limit, as a percentage of it. Default ±20%. Set 0 to hold the limit fixed and let only the fitted parameters vary.</li>
            </ul>
            <div className="bg-amber-900/20 border border-amber-900/50 p-3 rounded flex gap-2">
              <AlertTriangle className="text-amber-500 shrink-0" size={16} />
              <div className="text-xs">
                <strong className="text-amber-500 block mb-1">High b factors with no economic limit</strong>
                For hyperbolic fits with b ≥ 1 the forecast asymptotes, so EUR grows indefinitely if the economic limit is not enforced. Always set a realistic limit.
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Item 7: Forecast Results tab */}
        <AccordionItem value="item-7" className="border border-slate-800 rounded-lg bg-slate-900/30 px-3">
          <AccordionTrigger className="text-sm font-medium text-slate-200 hover:text-white hover:no-underline py-3">
            7. Reading the Forecast Results Tab
          </AccordionTrigger>
          <AccordionContent className="text-sm text-slate-400 space-y-3 pb-4 pt-1">
            <p className="text-xs">
              Results are split across two tabs above the chart. <strong>Model Fit</strong> shows the history with the fitted curve and the forecast extension. <strong>Forecast Results</strong> is where the numbers live:
            </p>
            <ul className="text-xs space-y-2 list-disc pl-4">
              <li><strong>EUR cards</strong> reporting remaining reserves, cumulative to date and estimated ultimate recovery. After a Monte Carlo run these show P10, P50 and P90 side by side.</li>
              <li><strong>The forecast table</strong>, one row per period, carrying rate and running cumulative through to the economic limit or the duration cap.</li>
              <li><strong>Export CSV</strong> writes that table out for use elsewhere.</li>
              <li><strong>The EUR distribution histogram</strong>, shown once a probabilistic run has produced a spread of outcomes.</li>
            </ul>
            <div className="bg-blue-900/20 border border-blue-900/50 p-3 rounded text-xs">
              The chart itself has its own export button on the plot card, which writes the current view as an image for reports.
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Item 8: Probabilistic Mode */}
        <AccordionItem value="item-8" className="border border-slate-800 rounded-lg bg-slate-900/30 px-3">
          <AccordionTrigger className="text-sm font-medium text-slate-200 hover:text-white hover:no-underline py-3 flex items-center gap-2">
            <Sparkles size={14} className="text-purple-400 inline" />
            8. Probabilistic Mode (Monte Carlo P10/P50/P90)
          </AccordionTrigger>
          <AccordionContent className="text-sm text-slate-400 space-y-3 pb-4 pt-1">
            <div className="bg-red-900/25 border border-red-700/60 p-3 rounded flex gap-2">
              <AlertTriangle className="text-red-400 shrink-0" size={16} />
              <div className="text-xs">
                <strong className="text-red-300 block mb-1">Check your build: probabilistic EUR was overstated</strong>
                On builds from before this was corrected, the Monte Carlo forecast read the fitted decline
                in the wrong time unit. It declined roughly 365 times too slowly and almost never reached
                the economic limit, so every iteration ran to the duration cap instead and the
                overstatement grew with Max Duration: about 5 times at the default 3,650 days, about 25
                times at 20,000 days, and about 45 times at 36,500 days.
                <br /><br />
                <strong>How to tell which build you are on.</strong> Run a forecast both ways on the same
                well. If the probabilistic P50 EUR is close to the deterministic EUR, you have the fix. If
                it is many times larger, you do not, and you should take your EUR from the deterministic
                forecast on the Forecast Results tab, which was never affected.
              </div>
            </div>
            <p className="text-xs">
              Probabilistic Mode replaces the deterministic forecast with a 1,000-iteration Monte Carlo simulation. After Fit Model runs, toggle <em>Probabilistic Mode</em> in Forecast Settings, then click <em>Run Monte Carlo</em>.
            </p>
            <div className="bg-slate-900 p-3 rounded border border-slate-800">
              <h4 className="text-xs font-bold text-slate-200 mb-2">How it works</h4>
              <ol className="text-xs space-y-1 list-decimal pl-4">
                <li>From the fit, Petrolord computes 95% confidence intervals on qᵢ, Dᵢ, b using regression standard errors propagated through the Arps transforms (delta method).</li>
                <li>Each iteration samples qᵢ, Dᵢ, b from normal distributions with those CIs as ±2σ ranges.</li>
                <li>Each iteration also samples the economic limit within the <em>Economic Limit Uncertainty</em> you set (±20% by default), so the point where the curve stops carries uncertainty too. Set it to 0 to hold the limit fixed.</li>
                <li>1,000 forecasts are run, each producing an EUR.</li>
                <li>EUR distribution is sorted to extract P10, P50, P90 percentiles.</li>
              </ol>
            </div>
            <div className="bg-slate-900 p-3 rounded border border-slate-800">
              <h4 className="text-xs font-bold text-slate-200 mb-2">Reproducibility</h4>
              <p className="text-xs">
                Every draw goes through the <em>Random Seed</em> in Forecast Settings, so the same fit, the same forecast settings and the same seed always return the same P10/P50/P90. Quote the seed alongside the numbers: it is printed under the EUR distribution and saved with the scenario, and it is what lets a reviewer re-run your exact realization. Press <em>New seed</em> to look at a different one.
              </p>
            </div>
            <div className="bg-blue-900/20 border border-blue-900/50 p-3 rounded text-xs">
              <strong className="text-blue-400 block mb-1">Petroleum convention</strong>
              P10 is the optimistic case with high EUR (a 10% chance of exceeding it). P90 is conservative and low. P50 is the median.
              The KPI cards and chart envelope follow this convention.
            </div>
            <p className="text-xs">
              The chart shows a translucent band between P10 and P90 that widens with time, reflecting growing forecast uncertainty.
            </p>
          </AccordionContent>
        </AccordionItem>

        {/* Item 9: Type Curves */}
        <AccordionItem value="item-9" className="border border-slate-800 rounded-lg bg-slate-900/30 px-3">
          <AccordionTrigger className="text-sm font-medium text-slate-200 hover:text-white hover:no-underline py-3 flex items-center gap-2">
            <Layers size={14} className="text-blue-400 inline" />
            9. Type Curve: Multi-Well Analysis
          </AccordionTrigger>
          <AccordionContent className="text-sm text-slate-400 space-y-3 pb-4 pt-1">
            <p className="text-xs">
              Type curves represent the average performance of a well population. Useful for forecasting new wells (PUDs) where no production history exists, and for benchmarking wells against analogues.
            </p>
            <div className="bg-slate-900 p-3 rounded border border-slate-800">
              <h4 className="text-xs font-bold text-slate-200 mb-2">Workflow</h4>
              <ol className="text-xs space-y-1 list-decimal pl-4">
                <li>Switch to the <strong>Type Curve</strong> tab.</li>
                <li>Pick a normalization method:
                  <ul className="list-disc pl-4 mt-1 text-slate-500 space-y-1">
                    <li><strong>Time Only:</strong> Aligns wells to days from first production. Keeps absolute rates.</li>
                    <li><strong>Rate Only:</strong> Each well's rate divided by its peak. Keeps absolute dates.</li>
                    <li><strong>Time &amp; Rate:</strong> Both transforms. The most common choice, producing a normalized type curve in the 0 to 1 rate range.</li>
                  </ul>
                </li>
                <li>Select 2 or more wells from the list. Pick wells with similar character (same play, same completion era).</li>
                <li>Name the curve and click <em>Create &amp; Fit Curve</em>.</li>
                <li>The fitted Arps parameters and R² appear in the stats footer; the cloud and fitted line render in the chart.</li>
              </ol>
            </div>
            <div className="bg-slate-900 p-3 rounded border border-slate-800">
              <h4 className="text-xs font-bold text-slate-200 mb-1">Groups, Filters and Rollup</h4>
              <p className="text-xs mb-2">
                On a field with many wells, build the population once instead of picking wells by hand every time:
              </p>
              <ul className="text-xs space-y-1 list-disc pl-4">
                <li><strong>Well grouping</strong> saves a named set of wells, for example a pad, a horizon or a completion vintage, and makes it selectable as a unit.</li>
                <li><strong>Well filters</strong> narrow the list by the metadata you recorded, so you can assemble a population by field, reservoir or well type rather than by name.</li>
                <li><strong>Group rollup</strong> sums the member wells into a single group profile and forecasts that, which is the quickest route to a pad or field level outlook.</li>
              </ul>
            </div>
            <div className="bg-blue-900/20 border border-blue-900/50 p-3 rounded text-xs">
              <strong className="text-blue-400 block mb-1">Apply to Target Well</strong>
              With a type curve fitted, use the <em>Apply To Well</em> panel to project a target well. Petrolord holds <strong>b</strong> from the type curve, which is more reliable than a single-well b, and solves for qᵢ and Dᵢ from the target's history.
            </div>
            <ul className="text-xs space-y-1 list-disc pl-4">
              <li><strong>Good Fit (R² ≥ 0.85):</strong> Target well closely follows the type curve population.</li>
              <li><strong>Fair Fit:</strong> Acceptable proxy when single-well data is sparse.</li>
              <li><strong>Poor Fit:</strong> Target well behavior differs from the population, so the type curve may not be applicable.</li>
            </ul>
          </AccordionContent>
        </AccordionItem>

        {/* Item 10: Scenarios */}
        <AccordionItem value="item-10" className="border border-slate-800 rounded-lg bg-slate-900/30 px-3">
          <AccordionTrigger className="text-sm font-medium text-slate-200 hover:text-white hover:no-underline py-3 flex items-center gap-2">
            <Save size={14} className="text-emerald-400 inline" />
            10. Scenarios: Save, Compare, Iterate
          </AccordionTrigger>
          <AccordionContent className="text-sm text-slate-400 space-y-3 pb-4 pt-1">
            <p className="text-xs">
              A scenario captures the entire fit and forecast state for a well at a moment in time. Use scenarios to:
            </p>
            <ul className="text-xs space-y-1 list-disc pl-4">
              <li>Compare different decline models (Hyperbolic against Exponential).</li>
              <li>Bracket uncertainty (Low, Base and High b factor).</li>
              <li>Test sensitivity to economic limits or facility caps.</li>
              <li>Snapshot a fit before re-running with different parameters.</li>
            </ul>
            <div className="bg-slate-900 p-3 rounded border border-slate-800">
              <h4 className="text-xs font-bold text-slate-200 mb-2">Workflow</h4>
              <ol className="text-xs space-y-1 list-decimal pl-4">
                <li>Run a fit and a forecast (Probabilistic optional).</li>
                <li>In the right sidebar's Scenarios section, type a name such as "Base Case P50" and click <strong>+</strong>.</li>
                <li>Re-fit with different parameters; save another scenario.</li>
                <li>Click the empty circles to <strong>select</strong> scenarios. Selected ones appear in the comparison table below.</li>
                <li>Compare Qi, Di, b, and EUR side by side.</li>
              </ol>
            </div>
            <div className="text-xs">
              Scenarios are filtered by stream, so oil scenarios only appear when the oil stream is selected. Saved scenarios persist with the project.
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Item 11: Integration */}
        <AccordionItem value="item-11" className="border border-slate-800 rounded-lg bg-slate-900/30 px-3">
          <AccordionTrigger className="text-sm font-medium text-slate-200 hover:text-white hover:no-underline py-3 flex items-center gap-2">
            <Share2 size={14} className="text-cyan-400 inline" />
            11. Sending a Forecast Downstream
          </AccordionTrigger>
          <AccordionContent className="text-sm text-slate-400 space-y-3 pb-4 pt-1">
            <div className="bg-red-900/25 border border-red-700/60 p-3 rounded flex gap-2">
              <AlertTriangle className="text-red-400 shrink-0" size={16} />
              <div className="text-xs">
                <strong className="text-red-300 block mb-1">The Integration panel does not transmit anything yet</strong>
                The NPV &amp; Economics and FDP Accelerator cards in the right sidebar report a successful
                sync, but the functions behind them are placeholders that log to the console and return
                success after a short delay. No forecast data leaves this app through them, and the call
                sites pass an empty payload. Ignore the success message.
              </div>
            </div>
            <p className="text-xs">
              <strong>Use the CSV export instead.</strong> The Export CSV button on the Forecast Results tab
              writes the rate and cumulative profile, and that file is the working handoff into NPV Scenario
              Builder, Petroleum Economics Studio and FDP Accelerator until the panel is wired.
            </p>
            <p className="text-xs">
              For a route that genuinely carries a profile between apps today, build the case in Forecast
              Scenario Hub instead. Petroleum Economics Studio reads saved scenario sets from that app
              directly.
            </p>
          </AccordionContent>
        </AccordionItem>

        {/* Item 12: Common Issues */}
        <AccordionItem value="item-12" className="border border-slate-800 rounded-lg bg-slate-900/30 px-3">
          <AccordionTrigger className="text-sm font-medium text-slate-200 hover:text-white hover:no-underline py-3 flex items-center gap-2">
            <BarChart2 size={14} className="text-amber-400 inline" />
            12. Troubleshooting
          </AccordionTrigger>
          <AccordionContent className="text-sm text-slate-400 space-y-3 pb-4 pt-1">
            <div className="space-y-3 text-xs">
              <div>
                <h4 className="text-slate-200 font-semibold mb-1">"Could not auto-detect Date or Rate columns"</h4>
                <p>Header names like <code className="bg-slate-800 px-1 rounded">date_time</code>, <code className="bg-slate-800 px-1 rounded">prod_date</code>, <code className="bg-slate-800 px-1 rounded">qo</code>, <code className="bg-slate-800 px-1 rounded">oil_rate</code> are recognized. Rename your columns to clear matches if detection fails.</p>
              </div>
              <div>
                <h4 className="text-slate-200 font-semibold mb-1">A stream is missing from the Production Stream strip</h4>
                <p>Only streams found in the CSV are offered. If gas or water is absent, the importer did not recognize that column. Rename it to <code className="bg-slate-800 px-1 rounded">gasRate</code> or <code className="bg-slate-800 px-1 rounded">waterRate</code> and re-upload with Replace File.</p>
              </div>
              <div>
                <h4 className="text-slate-200 font-semibold mb-1">R² is below 0.7 (Poor Fit)</h4>
                <p>Check the residuals chart for systematic patterns. Likely causes: the wrong fit window, so exclude transient flow; multi-segment behavior, so check the Detected Segments section; or data quality, where outliers or shut-ins skew the fit.</p>
              </div>
              <div>
                <h4 className="text-slate-200 font-semibold mb-1">Probabilistic Mode toggle is greyed out</h4>
                <p>Confidence intervals are computed during fit. If the toggle will not enable, the fit did not converge well enough to produce reliable CIs. Try a different Decline Model or trim the fit window.</p>
              </div>
              <div>
                <h4 className="text-slate-200 font-semibold mb-1">I deleted a well by mistake</h4>
                <p>The toast that appears after a delete carries an Undo button for ten seconds. Use it and the well comes back with its data. Once the toast closes the removal is final.</p>
              </div>
              <div>
                <h4 className="text-slate-200 font-semibold mb-1">Type Curve application returns "non-hyperbolic shape"</h4>
                <p>The target well's history does not fit the type curve's b at all. The well's decline may be a different regime, for example applying a high-b shale type curve to a conventional well.</p>
              </div>
              <div>
                <h4 className="text-slate-200 font-semibold mb-1">EUR seems unrealistically high</h4>
                <p>Check the b factor. Values at or above 1.5 produce optimistic late-time forecasts. Either constrain the b range using the B-FACTOR CONSTRAINTS sliders, or set a realistic Economic Limit Rate.</p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

      </Accordion>
    </section>
    </>
  );
};

export default DCAHelpContent;
