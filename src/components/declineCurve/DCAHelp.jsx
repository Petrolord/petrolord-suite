import React from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from '@/components/ui/button';
import { HelpCircle, Keyboard, BookOpen, AlertTriangle, CheckCircle2, Sparkles, BarChart2, Layers, Save } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const DCAHelp = () => {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-white" title="DCA Documentation">
          <HelpCircle size={18} />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[500px] sm:w-[600px] bg-slate-950 border-l border-slate-800 text-slate-100 shadow-2xl">
        <SheetHeader className="pb-4 border-b border-slate-800">
          <SheetTitle className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <BookOpen className="text-blue-500" size={24} />
            DCA User Guide
          </SheetTitle>
          <SheetDescription className="text-slate-400">
            Complete guide to Decline Curve Analysis in Petrolord Suite — single-well fitting, type curves, probabilistic forecasting, and scenarios.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-120px)] pr-6 pt-6">
          <div className="space-y-6 pb-10">

            {/* Shortcuts Section */}
            <section className="bg-slate-900/50 p-4 rounded-lg border border-slate-800">
              <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-blue-400">
                <Keyboard size={16} />
                <h3>Keyboard Shortcuts</h3>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="flex justify-between items-center bg-slate-950 p-2 rounded border border-slate-800">
                  <span className="text-slate-400">Save Project</span>
                  <kbd className="bg-slate-800 px-2 py-0.5 rounded font-mono text-slate-200 border border-slate-700 shadow-sm">Ctrl+S</kbd>
                </div>
                <div className="flex justify-between items-center bg-slate-950 p-2 rounded border border-slate-800">
                  <span className="text-slate-400">Undo Action</span>
                  <kbd className="bg-slate-800 px-2 py-0.5 rounded font-mono text-slate-200 border border-slate-700 shadow-sm">Ctrl+Z</kbd>
                </div>
                <div className="flex justify-between items-center bg-slate-950 p-2 rounded border border-slate-800">
                  <span className="text-slate-400">Redo Action</span>
                  <kbd className="bg-slate-800 px-2 py-0.5 rounded font-mono text-slate-200 border border-slate-700 shadow-sm">Ctrl+Y</kbd>
                </div>
                <div className="flex justify-between items-center bg-slate-950 p-2 rounded border border-slate-800">
                  <span className="text-slate-400">Export Chart</span>
                  <kbd className="bg-slate-800 px-2 py-0.5 rounded font-mono text-slate-200 border border-slate-700 shadow-sm">Ctrl+E</kbd>
                </div>
              </div>
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
                      <li><strong>Upload a CSV</strong> by dragging into the upload box. The file must have <code className="bg-slate-800 px-1 rounded">date</code> and <code className="bg-slate-800 px-1 rounded">rate</code> columns. After upload, the box turns green showing the filename, record count, and date range.</li>
                      <li><strong>Fit a model</strong>: leave Decline Model at "Auto-Select (Best Fit)" and click <em>Fit Model</em>. The fitted curve overlays the historical points.</li>
                      <li><strong>Generate a forecast</strong>: scroll down to Forecast Settings, then click <em>Generate Forecast</em>. The chart extends with the projected decline; KPI cards above show EUR and life of well.</li>
                    </ol>
                    <div className="bg-emerald-900/20 border border-emerald-900/50 p-3 rounded text-xs">
                      That's the minimum path. The next sections cover the full feature set.
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Item 2: CSV Format */}
                <AccordionItem value="item-2" className="border border-slate-800 rounded-lg bg-slate-900/30 px-3">
                  <AccordionTrigger className="text-sm font-medium text-slate-200 hover:text-white hover:no-underline py-3">
                    2. CSV Format & Data Import
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-slate-400 space-y-3 pb-4 pt-1">
                    <p className="text-xs">
                      Petrolord auto-detects the date and rate columns from common header names. Two columns are required:
                    </p>
                    <div className="bg-slate-900 p-3 rounded border border-slate-800 font-mono text-xs">
                      <div className="text-slate-300">date,rate</div>
                      <div className="text-slate-500">2020-01-01,1850.0</div>
                      <div className="text-slate-500">2020-01-06,1827.5</div>
                      <div className="text-slate-500">2020-01-11,1805.3</div>
                      <div className="text-slate-500">...</div>
                    </div>
                    <ul className="text-xs list-disc pl-4 space-y-1">
                      <li>Date column accepts ISO format (YYYY-MM-DD), MM/DD/YYYY, or DD/MM/YYYY.</li>
                      <li>Rate column should be in <strong>bbl/d</strong> (oil), <strong>Mscf/d</strong> (gas), or <strong>bbl/d</strong> (water).</li>
                      <li>Zero rates are interpreted as shut-ins; the segment detector handles them automatically.</li>
                      <li>Additional columns are tolerated but ignored.</li>
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

                {/* Item 3: Arps Models */}
                <AccordionItem value="item-3" className="border border-slate-800 rounded-lg bg-slate-900/30 px-3">
                  <AccordionTrigger className="text-sm font-medium text-slate-200 hover:text-white hover:no-underline py-3">
                    3. Arps Decline Models
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
                      <li><span className="text-blue-400 font-semibold">Hyperbolic (0 &lt; b &lt; 2):</span> Decline rate decreases over time. Standard for unconventional wells. Most shales fit b = 0.8 to 1.5.</li>
                      <li><span className="text-blue-400 font-semibold">Harmonic (b = 1):</span> Special case of hyperbolic. Most optimistic late-time behavior.</li>
                      <li><span className="text-blue-400 font-semibold">Auto-Select:</span> Petrolord fits all three and picks the highest R². Good default for unfamiliar wells.</li>
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

                {/* Item 4: Diagnostics */}
                <AccordionItem value="item-4" className="border border-slate-800 rounded-lg bg-slate-900/30 px-3">
                  <AccordionTrigger className="text-sm font-medium text-slate-200 hover:text-white hover:no-underline py-3">
                    4. Diagnostics — Verdict, Residuals, Segments
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-slate-400 space-y-3 pb-4 pt-1">
                    <p className="text-xs">
                      The right-sidebar Diagnostics section evaluates fit quality after every fit:
                    </p>
                    <ul className="text-xs space-y-2 list-disc pl-4">
                      <li><strong className="text-emerald-400">Excellent Fit (R² ≥ 0.95):</strong> Forecast is reliable for typical use.</li>
                      <li><strong className="text-blue-400">Good Fit (0.85 ≤ R² &lt; 0.95):</strong> Acceptable, minor uncertainty.</li>
                      <li><strong className="text-amber-400">Reasonable Fit (0.7 ≤ R² &lt; 0.85):</strong> Use with caution on late-time extrapolation.</li>
                      <li><strong className="text-red-400">Poor Fit (R² &lt; 0.7):</strong> Check for multi-segment behavior or data anomalies.</li>
                    </ul>
                    <div className="bg-slate-900 p-3 rounded border border-slate-800">
                      <h4 className="text-xs font-bold text-slate-200 mb-1">Detected Segments</h4>
                      <p className="text-xs">
                        Petrolord uses piecewise regression to find regime changes (e.g., transient → boundary-dominated → terminal). Each breakpoint is flagged with the date and the R² improvement that splitting yields. Robust against noise — clean wells correctly report "single-segment".
                      </p>
                    </div>
                    <div className="bg-slate-900 p-3 rounded border border-slate-800">
                      <h4 className="text-xs font-bold text-slate-200 mb-1">Normalized Residuals</h4>
                      <p className="text-xs">
                        The residuals chart shows per-point fit error normalized by the predicted rate. Random scatter around zero = good fit. Systematic patterns (waves, drift, clustered outliers) suggest the wrong model or a missing regime change.
                      </p>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Item 5: Probabilistic Mode */}
                <AccordionItem value="item-5" className="border border-slate-800 rounded-lg bg-slate-900/30 px-3">
                  <AccordionTrigger className="text-sm font-medium text-slate-200 hover:text-white hover:no-underline py-3 flex items-center gap-2">
                    <Sparkles size={14} className="text-purple-400 inline" />
                    5. Probabilistic Mode (Monte Carlo P10/P50/P90)
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-slate-400 space-y-3 pb-4 pt-1">
                    <p className="text-xs">
                      Probabilistic Mode replaces the deterministic forecast with a 1,000-iteration Monte Carlo simulation. After Fit Model runs, toggle <em>Probabilistic Mode</em> in Forecast Settings, then click <em>Run Monte Carlo</em>.
                    </p>
                    <div className="bg-slate-900 p-3 rounded border border-slate-800">
                      <h4 className="text-xs font-bold text-slate-200 mb-2">How it works</h4>
                      <ol className="text-xs space-y-1 list-decimal pl-4">
                        <li>From the fit, Petrolord computes 95% confidence intervals on qᵢ, Dᵢ, b using regression standard errors propagated through the Arps transforms (delta method).</li>
                        <li>Each iteration samples qᵢ, Dᵢ, b from normal distributions with those CIs as ±2σ ranges.</li>
                        <li>1,000 forecasts are run, each producing an EUR.</li>
                        <li>EUR distribution is sorted to extract P10, P50, P90 percentiles.</li>
                      </ol>
                    </div>
                    <div className="bg-blue-900/20 border border-blue-900/50 p-3 rounded text-xs">
                      <strong className="text-blue-400 block mb-1">Petroleum convention</strong>
                      P10 = optimistic = high EUR (10% chance of exceeding). P90 = conservative = low EUR. P50 = median.
                      The KPI cards and chart envelope follow this convention.
                    </div>
                    <p className="text-xs">
                      The chart shows a translucent band between P10 and P90 that widens with time, reflecting growing forecast uncertainty.
                    </p>
                  </AccordionContent>
                </AccordionItem>

                {/* Item 6: Forecast Settings */}
                <AccordionItem value="item-6" className="border border-slate-800 rounded-lg bg-slate-900/30 px-3">
                  <AccordionTrigger className="text-sm font-medium text-slate-200 hover:text-white hover:no-underline py-3">
                    6. Forecast Settings — Limits & Constraints
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-slate-400 space-y-3 pb-4 pt-1">
                    <ul className="text-xs space-y-2 list-disc pl-4">
                      <li><strong>Economic Limit Rate:</strong> Production rate where opex exceeds revenue. The forecast stops here when <em>Stop at Limit</em> is on. Set realistically — typically 1–10 bbl/d for oil.</li>
                      <li><strong>Max Duration (Days):</strong> Hard cap on forecast length. Default 3,650 (10 years).</li>
                      <li><strong>Facility Limit (Max Rate):</strong> Caps the rate during early life if a well is choked back. 0 means no cap.</li>
                      <li><strong>Stop at Limit:</strong> When on, the forecast terminates at the economic limit rate. When off, it runs to Max Duration.</li>
                    </ul>
                    <div className="bg-amber-900/20 border border-amber-900/50 p-3 rounded flex gap-2">
                      <AlertTriangle className="text-amber-500 shrink-0" size={16} />
                      <div className="text-xs">
                        <strong className="text-amber-500 block mb-1">High b factors with no economic limit</strong>
                        For hyperbolic fits with b ≥ 1, the forecast asymptotes — EUR grows indefinitely if the economic limit isn't enforced. Always set a realistic limit.
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Item 7: Type Curves */}
                <AccordionItem value="item-7" className="border border-slate-800 rounded-lg bg-slate-900/30 px-3">
                  <AccordionTrigger className="text-sm font-medium text-slate-200 hover:text-white hover:no-underline py-3 flex items-center gap-2">
                    <Layers size={14} className="text-blue-400 inline" />
                    7. Type Curve — Multi-Well Analysis
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
                            <li><strong>Time &amp; Rate:</strong> Both transforms. Most common — produces a normalized type curve in the 0–1 rate range.</li>
                          </ul>
                        </li>
                        <li>Select 2+ wells from the list. Pick wells with similar character (same play, same completion era).</li>
                        <li>Name the curve and click <em>Create &amp; Fit Curve</em>.</li>
                        <li>The fitted Arps parameters and R² appear in the stats footer; the cloud and fitted line render in the chart.</li>
                      </ol>
                    </div>
                    <div className="bg-blue-900/20 border border-blue-900/50 p-3 rounded text-xs">
                      <strong className="text-blue-400 block mb-1">Apply to Target Well</strong>
                      With a type curve fitted, use the <em>Apply To Well</em> panel to project a target well. Petrolord holds <strong>b</strong> from the type curve (more reliable than single-well b) and solves for qᵢ and Dᵢ from the target's history.
                    </div>
                    <ul className="text-xs space-y-1 list-disc pl-4">
                      <li><strong>Good Fit (R² ≥ 0.85):</strong> Target well closely follows the type curve population.</li>
                      <li><strong>Fair Fit:</strong> Acceptable proxy when single-well data is sparse.</li>
                      <li><strong>Poor Fit:</strong> Target well behavior differs from the population — type curve may not be applicable.</li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>

                {/* Item 8: Scenarios */}
                <AccordionItem value="item-8" className="border border-slate-800 rounded-lg bg-slate-900/30 px-3">
                  <AccordionTrigger className="text-sm font-medium text-slate-200 hover:text-white hover:no-underline py-3 flex items-center gap-2">
                    <Save size={14} className="text-emerald-400 inline" />
                    8. Scenarios — Save, Compare, Iterate
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-slate-400 space-y-3 pb-4 pt-1">
                    <p className="text-xs">
                      A scenario captures the entire fit + forecast state for a well at a moment in time. Use scenarios to:
                    </p>
                    <ul className="text-xs space-y-1 list-disc pl-4">
                      <li>Compare different decline models (Hyperbolic vs. Exponential).</li>
                      <li>Bracket uncertainty (Low / Base / High b factor).</li>
                      <li>Test sensitivity to economic limits or facility caps.</li>
                      <li>Snapshot a fit before re-running with different parameters.</li>
                    </ul>
                    <div className="bg-slate-900 p-3 rounded border border-slate-800">
                      <h4 className="text-xs font-bold text-slate-200 mb-2">Workflow</h4>
                      <ol className="text-xs space-y-1 list-decimal pl-4">
                        <li>Run a fit and a forecast (Probabilistic optional).</li>
                        <li>In the right sidebar's Scenarios section, type a name (e.g., "Base Case P50") and click <strong>+</strong>.</li>
                        <li>Re-fit with different parameters; save another scenario.</li>
                        <li>Click the empty circles to <strong>select</strong> scenarios — selected ones appear in the comparison table below.</li>
                        <li>Compare Qi, Di, b, and EUR side-by-side.</li>
                      </ol>
                    </div>
                    <div className="text-xs">
                      Scenarios are filtered by stream — oil scenarios only appear when the Oil stream is selected, etc. Saved scenarios persist with the project.
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Item 9: Common Issues */}
                <AccordionItem value="item-9" className="border border-slate-800 rounded-lg bg-slate-900/30 px-3">
                  <AccordionTrigger className="text-sm font-medium text-slate-200 hover:text-white hover:no-underline py-3 flex items-center gap-2">
                    <BarChart2 size={14} className="text-amber-400 inline" />
                    9. Troubleshooting
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-slate-400 space-y-3 pb-4 pt-1">
                    <div className="space-y-3 text-xs">
                      <div>
                        <h4 className="text-slate-200 font-semibold mb-1">"Could not auto-detect Date or Rate columns"</h4>
                        <p>Header names like <code className="bg-slate-800 px-1 rounded">date_time</code>, <code className="bg-slate-800 px-1 rounded">prod_date</code>, <code className="bg-slate-800 px-1 rounded">qo</code>, <code className="bg-slate-800 px-1 rounded">oil_rate</code> are recognized. Rename your columns to clear matches if detection fails.</p>
                      </div>
                      <div>
                        <h4 className="text-slate-200 font-semibold mb-1">R² is below 0.7 (Poor Fit)</h4>
                        <p>Check the residuals chart for systematic patterns. Likely causes: (1) wrong fit window — exclude transient flow, (2) multi-segment behavior — check the Detected Segments section, (3) data quality — outliers or shut-ins skewing the fit.</p>
                      </div>
                      <div>
                        <h4 className="text-slate-200 font-semibold mb-1">Probabilistic Mode toggle is greyed out</h4>
                        <p>Confidence intervals are computed during fit. If the toggle won't enable, the fit didn't converge well enough to produce reliable CIs. Try a different Decline Model or trim the fit window.</p>
                      </div>
                      <div>
                        <h4 className="text-slate-200 font-semibold mb-1">Type Curve application returns "non-hyperbolic shape"</h4>
                        <p>The target well's history doesn't fit the type curve's b at all. The well's decline may be a different regime (e.g., applying a high-b shale type curve to a conventional well).</p>
                      </div>
                      <div>
                        <h4 className="text-slate-200 font-semibold mb-1">EUR seems unrealistically high</h4>
                        <p>Check the b factor. Values ≥ 1.5 produce optimistic late-time forecasts. Either constrain the b range using the B-FACTOR CONSTRAINTS sliders, or set a realistic Economic Limit Rate.</p>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

              </Accordion>
            </section>

          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

export default DCAHelp;
