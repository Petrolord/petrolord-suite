// src/components/reservoirbalance/RbDiagnosticPlots.jsx
//
// Reservoir Balance — Diagnostic Plots component
// =================================================
//
// Phase 3 Capsule 3B (2026-05-15). Renders five diagnostic plots from a
// completed MBAL run's plot_data:
//
//   1. Havlena-Odeh F vs Et    — both fluid systems
//   2. p/z plot                — gas only
//   3. Cole plot               — gas only (F/Eg vs Gp)
//   4. Campbell plot           — oil only (F/Et vs F)
//   5. Drive indices stacked   — both fluid systems
//
// All data comes from rb_results.plot_data + scalar fields on rb_results.
// No re-running the engine; this is pure data binding + Recharts.
//
// Pressure history match plot is deferred to Phase 6 (needs forecast math
// to generate predicted pressures).
//
// Polish pass (2026-05-16):
//   - Auto-refresh when a new run completes (parent passes runVersion prop)
//   - Drill-down: clicking a plot point expands an inline panel below the
//     chart showing the full per-timestep payload (pressure, F, Et, drive
//     indices, cumulatives, fit-status). Stays open until another point is
//     clicked or the close button is pressed.
//   - Export-as-image: each plot card has an Export button that captures the
//     chart wrapper (id="rb-plot-..." already in place) as PNG using
//     exportChartAsImage from the DCA helper.
//
// Petrolord chart conventions followed:
//   - White background wrapper with slate-200 border
//   - chartTheme tokens (CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS,
//     GRID_STYLE, TOOLTIP_STYLE) for visual consistency with EPE/DCA
//   - <ChartLogo /> as bottom-right watermark inside each chart wrapper
//   - ComposedChart for plots that mix scatter points + lines

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Scatter,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Label,
  ReferenceLine,
} from 'recharts';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Info, RefreshCw, FlaskConical, Download, X } from 'lucide-react';
import ChartLogo from '@/components/charts/ChartLogo';
import {
  CHART_COLORS,
  CHART_TYPOGRAPHY,
  CHART_MARGINS,
  GRID_STYLE,
  TOOLTIP_STYLE,
} from '@/utils/chartTheme';
import { exportChartAsImage } from '@/utils/declineCurve/dcaExport';
import {
  listRuns,
  getResultByRunId,
  getCaseDefaultConfig,
} from '@/pages/apps/reservoir-balance/lib/api';
import { ramagostCorrectedPz } from '@/pages/apps/reservoir-balance/lib/pzRamagost';

// =============================================================================
// COLOR PALETTE — local to MBAL plots
// =============================================================================
// Distinct from stream palettes used in DCA. These colors map to drive indices
// and regression elements consistently across all five plots.

const MBAL_COLORS = {
  // Regression and fit
  regressionLine: '#0891b2',           // Cyan-600 — the fitted line
  pointInFit: '#0e7490',                // Cyan-700 — included data points
  pointExcluded: '#94a3b8',             // Slate-400 — excluded (early-time) points
  extrapolation: '#94a3b8',             // Slate-400 — extrapolated portion (dashed)

  // Drive indices (Pletcher conventions)
  ddi: '#16a34a',                        // Green-600 — depletion drive
  gdi: '#0891b2',                        // Cyan-600 — gas (or gas cap) drive
  wdi: '#2563eb',                        // Blue-600 — water drive
  cdi: '#a855f7',                        // Purple-500 — rock+water compressibility drive
  sdi: '#a855f7',                        // Same as cdi — oil sdi maps to compressibility

  // Annotations and references
  truthLine: '#dc2626',                  // Red-600 — true value reference line
  initialState: '#64748b',               // Slate-500 — initial timestep
  highlight: '#f59e0b',                  // Amber-500 — selected/hover state
};

// =============================================================================
// HELPERS
// =============================================================================

/** Format scientific notation for axis ticks where values span orders of magnitude. */
const fmtSci = (n, decimals = 2) => {
  if (n == null || !isFinite(n)) return '';
  if (n === 0) return '0';
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(decimals)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(decimals)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(decimals)}k`;
  return n.toFixed(decimals);
};

/** Format a value for tooltips (more precise than tick fmt). */
const fmtTip = (n) => {
  if (n == null || !isFinite(n)) return 'N/A';
  if (Math.abs(n) >= 1e6) return n.toExponential(3);
  if (Math.abs(n) >= 1) return n.toFixed(3);
  return n.toExponential(3);
};

/** Sanitize a string for filesystem use. */
const sanitizeFilename = (s) =>
  (s ?? 'mbal').replace(/[^a-zA-Z0-9_\-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

/**
 * Build chart data rows by zipping plot_data array fields.
 * Returns an array of { timestep_index, pressure, F, Et, ..., included, excluded }
 * Where `included` and `excluded` are the F values for fit/exclude, used to
 * make two Scatter series render different shapes.
 */
function buildBaseRows(plotData) {
  if (!plotData) return [];
  const n = plotData.timestep_index?.length ?? 0;
  const rows = [];
  for (let i = 0; i < n; i++) {
    const inFit = plotData.point_in_fit?.[i] === true;
    rows.push({
      timestep_index: plotData.timestep_index[i],
      pressure: plotData.pressure?.[i] ?? null,
      delta_p: plotData.delta_p?.[i] ?? null,
      F: plotData.F?.[i] ?? null,
      Et: plotData.Et?.[i] ?? null,
      Eo: plotData.Eo?.[i] ?? null,
      Eg_rb_mscf: plotData.Eg_rb_mscf?.[i] ?? null,
      Efw: plotData.Efw?.[i] ?? null,
      We: plotData.We?.[i] ?? null,
      p_over_z: plotData.p_over_z?.[i] ?? null,
      cum_oil_stb: plotData.cum_oil_stb?.[i] ?? null,
      cum_gas_scf: plotData.cum_gas_scf?.[i] ?? null,
      cum_water_stb: plotData.cum_water_stb?.[i] ?? null,
      ddi: plotData.ddi?.[i] ?? null,
      gdi: plotData.gdi?.[i] ?? null,
      wdi: plotData.wdi?.[i] ?? null,
      cdi: plotData.cdi?.[i] ?? null,
      sdi: plotData.sdi?.[i] ?? null,
      drive_index_sum: plotData.drive_index_sum?.[i] ?? null,
      point_in_fit: inFit,
      // Split F into two columns so Recharts can render included vs excluded
      // points with different Scatter shapes.
      F_included: inFit ? plotData.F?.[i] : null,
      F_excluded: !inFit ? plotData.F?.[i] : null,
    });
  }
  return rows;
}

// =============================================================================
// SHARED SUB-COMPONENTS (polish pass)
// =============================================================================

/**
 * Export button rendered in each plot card's header. Calls the DCA helper
 * to capture the wrapper div by ID and save as PNG.
 */
const ExportButton = ({ elementId, filename }) => (
  <Button
    onClick={() => exportChartAsImage(elementId, filename)}
    variant="ghost"
    size="sm"
    className="h-7 px-2 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100"
    title="Export plot as PNG"
  >
    <Download className="h-3.5 w-3.5 mr-1" />
    Export
  </Button>
);

const DetailRow = ({ label, value, unit, accent }) => (
  <div className="flex justify-between items-baseline gap-2 text-[11px]">
    <span className="text-slate-600">{label}</span>
    <span
      className={`font-mono ${accent ? 'text-amber-700 font-semibold' : 'text-slate-800'}`}
    >
      {value}
      <span className="text-[10px] text-slate-500 ml-1">{unit}</span>
    </span>
  </div>
);

/**
 * Inline drill-down panel. Renders below the chart when a point is clicked,
 * showing the timestep's full payload from the base row. Stays open until
 * another point is clicked or the close button is pressed.
 */
const TimestepDetailPanel = ({ row, isGas, onClose }) => {
  if (!row) return null;

  const fmt = (v, decimals = 3) => {
    if (v == null || !isFinite(v)) return '—';
    if (Math.abs(v) >= 1e6) return v.toExponential(3);
    if (Math.abs(v) >= 100) return v.toFixed(decimals > 1 ? 1 : decimals);
    return v.toFixed(decimals);
  };

  const fitBadge = row.point_in_fit ? (
    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-800 font-semibold">
      In fit
    </span>
  ) : (
    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 font-semibold">
      Excluded
    </span>
  );

  return (
    <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-start justify-between mb-2 gap-2">
        <div className="flex items-center gap-2">
          <Info className="w-3.5 h-3.5 text-cyan-600" />
          <span className="text-xs font-semibold text-slate-700">
            Timestep {row.timestep_index}
          </span>
          {fitBadge}
        </div>
        <Button
          onClick={onClose}
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-slate-400 hover:text-slate-700 hover:bg-slate-200"
          aria-label="Close detail panel"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">
            Reservoir state
          </p>
          <DetailRow label="Pressure" value={fmt(row.pressure, 1)} unit="psia" />
          <DetailRow label="Δp from initial" value={fmt(row.delta_p, 1)} unit="psi" />
          {isGas ? (
            <>
              <DetailRow label="p/z" value={fmt(row.p_over_z, 1)} unit="psia" />
              <DetailRow label="Cum gas (Gp)" value={fmt(row.cum_gas_scf, 0)} unit="scf" />
              <DetailRow label="Cum water (Wp)" value={fmt(row.cum_water_stb, 0)} unit="STB" />
            </>
          ) : (
            <>
              <DetailRow label="Cum oil (Np)" value={fmt(row.cum_oil_stb, 0)} unit="STB" />
              <DetailRow label="Cum gas (Gp)" value={fmt(row.cum_gas_scf, 0)} unit="scf" />
              <DetailRow label="Cum water (Wp)" value={fmt(row.cum_water_stb, 0)} unit="STB" />
            </>
          )}
        </div>

        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">
            MBE terms
          </p>
          <DetailRow label="F (voidage)" value={fmt(row.F)} unit="rb" />
          <DetailRow
            label={isGas ? 'Eg' : 'Et (total exp.)'}
            value={fmt(isGas ? row.Eg_rb_mscf : row.Et)}
            unit={isGas ? 'rb/Mscf' : 'rb/STB'}
          />
          {!isGas && row.Eo != null && (
            <DetailRow label="Eo (oil exp.)" value={fmt(row.Eo)} unit="rb/STB" />
          )}
          <DetailRow label="Efw (rock+water)" value={fmt(row.Efw)} unit={isGas ? 'rb/scf' : 'rb/STB'} />
          {row.We != null && (
            <DetailRow label="We (water influx)" value={fmt(row.We, 0)} unit="rb" />
          )}
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mt-2 mb-0.5">
            Drive indices
          </p>
          {!isGas && row.ddi != null && (
            <DetailRow label="DDI (depletion)" value={fmt(row.ddi, 3)} unit="—" />
          )}
          {row.gdi != null && (
            <DetailRow label="GDI (gas)" value={fmt(row.gdi, 3)} unit="—" />
          )}
          {row.wdi != null && (
            <DetailRow label="WDI (water)" value={fmt(row.wdi, 3)} unit="—" />
          )}
          {row.cdi != null && (
            <DetailRow label="CDI (compress.)" value={fmt(row.cdi, 3)} unit="—" />
          )}
          {row.drive_index_sum != null && (
            <DetailRow
              label="Σ drive indices"
              value={fmt(row.drive_index_sum, 3)}
              unit="—"
              accent={Math.abs((row.drive_index_sum ?? 1) - 1) > 0.05}
            />
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Recharts onClick handler factory. Recharts passes the data row as the
 * first argument when a Scatter point or Bar segment is clicked. We look up
 * the canonical row from the base `rows` array by timestep_index, which
 * preserves all fields even when the plot's derived dataset is sparse.
 */
function makePointClickHandler(rows, setExpandedRow) {
  return (data) => {
    if (!data || data.timestep_index == null) return;
    const fullRow = rows.find((r) => r.timestep_index === data.timestep_index);
    setExpandedRow(fullRow ?? null);
  };
}

// =============================================================================
// PLOT 1 — HAVLENA-ODEH F vs Et
// =============================================================================

const HavlenaOdehPlot = ({ rows, result, isGas, caseName }) => {
  const [expandedRow, setExpandedRow] = useState(null);
  const handlePointClick = useCallback(
    makePointClickHandler(rows, setExpandedRow),
    [rows],
  );

  // Compute regression line endpoints. Slope and intercept come from the
  // engine result (for no-aquifer case, slope = N or G; for pot aquifer,
  // intercept = N or G and slope is the aquifer-derived term).
  const lineData = useMemo(() => {
    const fitRows = rows.filter((r) => r.point_in_fit && r.Et != null && r.F != null);
    if (fitRows.length < 2) return [];
    const xs = fitRows.map((r) => r.Et);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const slope = result?.regression_slope ?? 0;
    const intercept = result?.regression_intercept ?? 0;
    // Extend slightly beyond the fit range for visual clarity
    const x0 = 0;
    const xN = xMax * 1.05;
    return [
      { Et: x0, F: intercept },
      { Et: xN, F: slope * xN + intercept },
    ];
  }, [rows, result]);

  const r2 = result?.r_squared;
  const ooipMmstb = isGas
    ? null
    : (result?.estimated_ooip_stb ?? 0) / 1e6;
  const ogipBcf = isGas
    ? (result?.estimated_ogip_scf ?? 0) / 1e9
    : null;
  const slopeForLabel = result?.regression_slope;

  return (
    <Card className="bg-white border-slate-200">
      <CardHeader className="pb-2 border-b border-slate-200">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-cyan-600" />
              Havlena-Odeh: F vs Et
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Reservoir voidage vs total expansion. For a depletion-drive case the line is straight through origin with slope = {isGas ? 'OGIP' : 'OOIP'}. With aquifer support the line curves and the intercept gives {isGas ? 'OGIP' : 'OOIP'}.
            </CardDescription>
          </div>
          <ExportButton
            elementId="rb-plot-havlena-odeh"
            filename={`${sanitizeFilename(caseName)}_havlena_odeh`}
          />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative h-[380px] bg-white" id="rb-plot-havlena-odeh">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={CHART_MARGINS.withLegend}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis
                dataKey="Et"
                type="number"
                domain={[0, 'auto']}
                tickFormatter={(v) => fmtSci(v, 3)}
                tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                axisLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
                tickLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
              >
                <Label
                  value={isGas ? 'Et (RB/Mscf)' : 'Et (RB/STB)'}
                  position="insideBottom"
                  offset={-5}
                  style={{ fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
                />
              </XAxis>
              <YAxis
                dataKey="F"
                type="number"
                domain={[0, 'auto']}
                tickFormatter={(v) => fmtSci(v, 2)}
                tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                axisLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
                tickLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
              >
                <Label
                  value="F (res bbl)"
                  angle={-90}
                  position="insideLeft"
                  style={{ fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
                />
              </YAxis>
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: CHART_COLORS.tooltipText }}
                itemStyle={{ color: CHART_COLORS.tooltipText }}
                formatter={(value, name) => [fmtTip(value), name]}
                labelFormatter={(label) => `Et = ${fmtTip(label)}`}
              />
              <Legend
                verticalAlign="bottom"
                height={36}
                wrapperStyle={{
                  fontSize: `${CHART_TYPOGRAPHY.legendFontSize}px`,
                  paddingTop: '10px',
                  color: CHART_COLORS.legendText,
                }}
              />
              <Scatter
                dataKey="F_included"
                name="In fit"
                fill={MBAL_COLORS.pointInFit}
                shape="circle"
                onClick={handlePointClick}
                cursor="pointer"
              />
              <Scatter
                dataKey="F_excluded"
                name="Excluded"
                fill="none"
                stroke={MBAL_COLORS.pointExcluded}
                strokeWidth={1.5}
                shape="circle"
                onClick={handlePointClick}
                cursor="pointer"
              />
              <Line
                data={lineData}
                dataKey="F"
                type="linear"
                stroke={MBAL_COLORS.regressionLine}
                strokeWidth={2}
                dot={false}
                name="Regression"
                legendType="line"
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
          <ChartLogo />
          {/* Annotation box top-right */}
          <div className="absolute top-3 right-3 bg-white/95 border border-slate-300 rounded px-3 py-2 text-[11px] font-mono leading-relaxed shadow-sm">
            <div className="text-slate-700">
              R² = <span className="font-semibold">{r2?.toFixed(4) ?? '—'}</span>
            </div>
            <div className="text-slate-700">
              slope = <span className="font-semibold">{slopeForLabel != null ? slopeForLabel.toExponential(3) : '—'}</span>
            </div>
            {ooipMmstb != null && (
              <div className="text-slate-700">
                OOIP = <span className="font-semibold">{ooipMmstb.toFixed(2)} MM STB</span>
              </div>
            )}
            {ogipBcf != null && (
              <div className="text-slate-700">
                OGIP = <span className="font-semibold">{ogipBcf.toFixed(2)} Bcf</span>
              </div>
            )}
          </div>
        </div>
        <TimestepDetailPanel
          row={expandedRow}
          isGas={isGas}
          onClose={() => setExpandedRow(null)}
        />
      </CardContent>
    </Card>
  );
};

// =============================================================================
// PLOT 2 — p/z (gas only)
// =============================================================================

const PZPlot = ({ rows, result, caseName, ramagost }) => {
  const [expandedRow, setExpandedRow] = useState(null);
  const handlePointClick = useCallback(
    makePointClickHandler(rows, setExpandedRow),
    [rows],
  );

  // Build data: (Gp_bcf, p/z) for each timestep. Add extrapolation line to p/z = 0.
  const data = useMemo(() => {
    const base = rows.filter((r) => r.p_over_z != null && r.cum_gas_scf != null);
    // MB7: Ramagost-Farshad cf-corrected p/z overlay. The corrected points
    // stay on the depletion straight line when formation compaction bends
    // the raw curve (abnormally pressured reservoirs).
    const corrected = ramagost
      ? ramagostCorrectedPz({
          pOverZ: base.map((r) => r.p_over_z),
          pressure: base.map((r) => r.pressure),
          pi: ramagost.pi,
          swi: ramagost.swi,
          cw: ramagost.cw,
          cf: ramagost.cf,
        })
      : null;
    return base.map((r, i) => ({
      timestep_index: r.timestep_index,
      Gp_bcf: r.cum_gas_scf / 1e9,
      p_over_z: r.p_over_z,
      point_in_fit: r.point_in_fit,
      pz_included: r.point_in_fit ? r.p_over_z : null,
      pz_excluded: !r.point_in_fit ? r.p_over_z : null,
      pz_ramagost: corrected ? corrected[i] : null,
    }));
  }, [rows, ramagost]);

  const hasRamagost = data.some((d) => d.pz_ramagost != null);

  // Extrapolation line: linear fit on included points, extend to p/z = 0.
  const extrapData = useMemo(() => {
    const fit = data.filter((d) => d.point_in_fit);
    if (fit.length < 2) return [];
    // Simple least-squares
    const n = fit.length;
    const sumX = fit.reduce((s, d) => s + d.Gp_bcf, 0);
    const sumY = fit.reduce((s, d) => s + d.p_over_z, 0);
    const sumXY = fit.reduce((s, d) => s + d.Gp_bcf * d.p_over_z, 0);
    const sumX2 = fit.reduce((s, d) => s + d.Gp_bcf * d.Gp_bcf, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    // x at p/z = 0
    const xAtZero = -intercept / slope;
    return [
      { Gp_bcf: 0, pz_line: intercept },
      { Gp_bcf: xAtZero, pz_line: 0 },
    ];
  }, [data]);

  // Apparent OGIP from p/z extrapolation (the x at p/z=0)
  const apparentOgipBcf = extrapData.length > 0 ? extrapData[1].Gp_bcf : null;

  // True OGIP from engine regression for comparison
  const ogipBcf = (result?.estimated_ogip_scf ?? 0) / 1e9;

  return (
    <Card className="bg-white border-slate-200">
      <CardHeader className="pb-2 border-b border-slate-200">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-cyan-600" />
              p/z plot
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Classic gas reservoir diagnostic. Linear p/z vs Gp extrapolates to apparent OGIP at p/z=0. With aquifer support the extrapolation overestimates because water influx props up pressure. The dashed purple series is the Ramagost-Farshad correction (p/z scaled by 1 minus the rock and water compressibility term); it matters for abnormally pressured reservoirs where compaction bends the raw curve.
            </CardDescription>
          </div>
          <ExportButton
            elementId="rb-plot-pz"
            filename={`${sanitizeFilename(caseName)}_pz`}
          />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative h-[380px] bg-white" id="rb-plot-pz">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={CHART_MARGINS.withLegend}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis
                dataKey="Gp_bcf"
                type="number"
                domain={[0, 'auto']}
                tickFormatter={(v) => fmtSci(v, 2)}
                tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                axisLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
                tickLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
              >
                <Label
                  value="Gp (Bcf)"
                  position="insideBottom"
                  offset={-5}
                  style={{ fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
                />
              </XAxis>
              <YAxis
                dataKey="p_over_z"
                type="number"
                domain={[0, 'auto']}
                tickFormatter={(v) => fmtSci(v, 2)}
                tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                axisLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
                tickLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
              >
                <Label
                  value="p/z (psia)"
                  angle={-90}
                  position="insideLeft"
                  style={{ fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
                />
              </YAxis>
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: CHART_COLORS.tooltipText }}
                itemStyle={{ color: CHART_COLORS.tooltipText }}
                formatter={(value, name) => [fmtTip(value), name]}
                labelFormatter={(label) => `Gp = ${fmtTip(label)} Bcf`}
              />
              <Legend
                verticalAlign="bottom"
                height={36}
                wrapperStyle={{
                  fontSize: `${CHART_TYPOGRAPHY.legendFontSize}px`,
                  paddingTop: '10px',
                  color: CHART_COLORS.legendText,
                }}
              />
              <Scatter
                dataKey="pz_included"
                name="In fit"
                fill={MBAL_COLORS.pointInFit}
                shape="circle"
                onClick={handlePointClick}
                cursor="pointer"
              />
              <Scatter
                dataKey="pz_excluded"
                name="Excluded"
                fill="none"
                stroke={MBAL_COLORS.pointExcluded}
                strokeWidth={1.5}
                shape="circle"
                onClick={handlePointClick}
                cursor="pointer"
              />
              <Line
                data={extrapData}
                dataKey="pz_line"
                type="linear"
                stroke={MBAL_COLORS.regressionLine}
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={false}
                name="Linear extrapolation"
                legendType="line"
                isAnimationActive={false}
              />
              {hasRamagost && (
                <Line
                  dataKey="pz_ramagost"
                  type="monotone"
                  stroke="#9333ea"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  dot={{ r: 2, fill: '#9333ea' }}
                  name="Ramagost-Farshad corrected"
                  legendType="line"
                  isAnimationActive={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
          <ChartLogo />
          <div className="absolute top-3 right-3 bg-white/95 border border-slate-300 rounded px-3 py-2 text-[11px] font-mono leading-relaxed shadow-sm">
            {apparentOgipBcf != null && (
              <div className="text-slate-700">
                p/z extrap: <span className="font-semibold">{apparentOgipBcf.toFixed(2)} Bcf</span>
              </div>
            )}
            <div className="text-slate-700">
              MBAL OGIP: <span className="font-semibold">{ogipBcf.toFixed(2)} Bcf</span>
            </div>
            {apparentOgipBcf != null && (
              <div className="text-[10px] text-slate-500 italic mt-1">
                {apparentOgipBcf > ogipBcf * 1.02
                  ? '↑ p/z overestimates — aquifer support present'
                  : 'p/z agrees with MBAL — likely depletion drive'}
              </div>
            )}
          </div>
        </div>
        <TimestepDetailPanel
          row={expandedRow}
          isGas={true}
          onClose={() => setExpandedRow(null)}
        />
      </CardContent>
    </Card>
  );
};

// =============================================================================
// PLOT 3 — Cole plot (gas only)
// =============================================================================
// y = F / Eg   (in same units as G; Mscf or scf depending on Eg units)
// x = Gp      (in Mscf or Bscf for readability)
//
// Pletcher's signature shapes:
//   - Depletion drive: horizontal line at y = G (OGIP)
//   - Strong waterdrive: positive-slope line
//   - Moderate waterdrive: hump
//   - Weak waterdrive: negative slope, points migrate down toward true G

const ColePlot = ({ rows, result, caseName }) => {
  const [expandedRow, setExpandedRow] = useState(null);
  const handlePointClick = useCallback(
    makePointClickHandler(rows, setExpandedRow),
    [rows],
  );

  // Compute F/Eg per timestep. Eg_rb_mscf is in RB/Mscf (display unit).
  // F is in res bbl. So F/Eg in Mscf. Convert to Bcf for x-axis.
  const data = useMemo(
    () =>
      rows
        .filter((r) => r.Eg_rb_mscf != null && r.Eg_rb_mscf > 0 && r.F != null && r.cum_gas_scf != null)
        .map((r) => {
          const f_over_eg_mscf = r.F / r.Eg_rb_mscf;
          return {
            timestep_index: r.timestep_index,
            Gp_bcf: r.cum_gas_scf / 1e9,
            f_over_eg_bcf: f_over_eg_mscf / 1e6, // Mscf → Bcf
            point_in_fit: r.point_in_fit,
            fEg_included: r.point_in_fit ? f_over_eg_mscf / 1e6 : null,
            fEg_excluded: !r.point_in_fit ? f_over_eg_mscf / 1e6 : null,
          };
        }),
    [rows],
  );

  // True OGIP reference line
  const ogipBcf = (result?.estimated_ogip_scf ?? 0) / 1e9;

  return (
    <Card className="bg-white border-slate-200">
      <CardHeader className="pb-2 border-b border-slate-200">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-cyan-600" />
              Cole plot
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Diagnostic for aquifer presence. Horizontal line = depletion drive; positive slope = strong waterdrive; negative slope = weak waterdrive (apparent OGIP decreases with time). The dashed red line shows the MBAL-derived OGIP for reference.
            </CardDescription>
          </div>
          <ExportButton
            elementId="rb-plot-cole"
            filename={`${sanitizeFilename(caseName)}_cole`}
          />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative h-[380px] bg-white" id="rb-plot-cole">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={CHART_MARGINS.withLegend}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis
                dataKey="Gp_bcf"
                type="number"
                domain={[0, 'auto']}
                tickFormatter={(v) => fmtSci(v, 2)}
                tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                axisLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
                tickLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
              >
                <Label
                  value="Gp (Bcf)"
                  position="insideBottom"
                  offset={-5}
                  style={{ fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
                />
              </XAxis>
              <YAxis
                dataKey="f_over_eg_bcf"
                type="number"
                domain={['auto', 'auto']}
                tickFormatter={(v) => fmtSci(v, 2)}
                tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                axisLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
                tickLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
              >
                <Label
                  value="F / Eg (Bcf)"
                  angle={-90}
                  position="insideLeft"
                  style={{ fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
                />
              </YAxis>
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: CHART_COLORS.tooltipText }}
                itemStyle={{ color: CHART_COLORS.tooltipText }}
                formatter={(value, name) => [fmtTip(value), name]}
              />
              <Legend
                verticalAlign="bottom"
                height={36}
                wrapperStyle={{
                  fontSize: `${CHART_TYPOGRAPHY.legendFontSize}px`,
                  paddingTop: '10px',
                  color: CHART_COLORS.legendText,
                }}
              />
              {ogipBcf > 0 && (
                <ReferenceLine
                  y={ogipBcf}
                  stroke={MBAL_COLORS.truthLine}
                  strokeDasharray="4 2"
                  label={{
                    value: `MBAL OGIP = ${ogipBcf.toFixed(2)} Bcf`,
                    position: 'insideTopRight',
                    fill: MBAL_COLORS.truthLine,
                    fontSize: 10,
                  }}
                />
              )}
              <Scatter
                dataKey="fEg_included"
                name="In fit"
                fill={MBAL_COLORS.pointInFit}
                shape="circle"
                onClick={handlePointClick}
                cursor="pointer"
              />
              <Scatter
                dataKey="fEg_excluded"
                name="Excluded"
                fill="none"
                stroke={MBAL_COLORS.pointExcluded}
                strokeWidth={1.5}
                shape="circle"
                onClick={handlePointClick}
                cursor="pointer"
              />
            </ComposedChart>
          </ResponsiveContainer>
          <ChartLogo />
        </div>
        <TimestepDetailPanel
          row={expandedRow}
          isGas={true}
          onClose={() => setExpandedRow(null)}
        />
      </CardContent>
    </Card>
  );
};

// =============================================================================
// PLOT 4 — Campbell plot (oil only)
// =============================================================================
// y = F / Et   (in STB if Et in RB/STB and F in res bbl)
// x = F        (in res bbl)
//
// Same diagnostic logic as Cole but for oil:
//   - Depletion drive: horizontal line at y = N (OOIP)
//   - Weak waterdrive: negative slope, points migrate toward true N

const CampbellPlot = ({ rows, result, caseName }) => {
  const [expandedRow, setExpandedRow] = useState(null);
  const handlePointClick = useCallback(
    makePointClickHandler(rows, setExpandedRow),
    [rows],
  );

  const data = useMemo(
    () =>
      rows
        .filter((r) => r.Et != null && r.Et > 0 && r.F != null && r.F > 0)
        .map((r) => {
          const f_over_et = r.F / r.Et;
          return {
            timestep_index: r.timestep_index,
            F: r.F,
            f_over_et_mstb: f_over_et / 1e6,
            point_in_fit: r.point_in_fit,
            fEt_included: r.point_in_fit ? f_over_et / 1e6 : null,
            fEt_excluded: !r.point_in_fit ? f_over_et / 1e6 : null,
          };
        }),
    [rows],
  );

  const ooipMmstb = (result?.estimated_ooip_stb ?? 0) / 1e6;

  return (
    <Card className="bg-white border-slate-200">
      <CardHeader className="pb-2 border-b border-slate-200">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-cyan-600" />
              Campbell plot
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Oil-side equivalent of the Cole plot. Horizontal = depletion drive; positive slope = strong waterdrive; negative slope = weak waterdrive. The dashed red line shows the MBAL-derived OOIP for reference.
            </CardDescription>
          </div>
          <ExportButton
            elementId="rb-plot-campbell"
            filename={`${sanitizeFilename(caseName)}_campbell`}
          />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative h-[380px] bg-white" id="rb-plot-campbell">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={CHART_MARGINS.withLegend}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis
                dataKey="F"
                type="number"
                domain={[0, 'auto']}
                tickFormatter={(v) => fmtSci(v, 2)}
                tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                axisLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
                tickLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
              >
                <Label
                  value="F (res bbl)"
                  position="insideBottom"
                  offset={-5}
                  style={{ fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
                />
              </XAxis>
              <YAxis
                dataKey="f_over_et_mstb"
                type="number"
                domain={['auto', 'auto']}
                tickFormatter={(v) => fmtSci(v, 2)}
                tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                axisLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
                tickLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
              >
                <Label
                  value="F / Et (MM STB)"
                  angle={-90}
                  position="insideLeft"
                  style={{ fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
                />
              </YAxis>
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: CHART_COLORS.tooltipText }}
                itemStyle={{ color: CHART_COLORS.tooltipText }}
                formatter={(value, name) => [fmtTip(value), name]}
              />
              <Legend
                verticalAlign="bottom"
                height={36}
                wrapperStyle={{
                  fontSize: `${CHART_TYPOGRAPHY.legendFontSize}px`,
                  paddingTop: '10px',
                  color: CHART_COLORS.legendText,
                }}
              />
              {ooipMmstb > 0 && (
                <ReferenceLine
                  y={ooipMmstb}
                  stroke={MBAL_COLORS.truthLine}
                  strokeDasharray="4 2"
                  label={{
                    value: `MBAL OOIP = ${ooipMmstb.toFixed(2)} MM STB`,
                    position: 'insideTopRight',
                    fill: MBAL_COLORS.truthLine,
                    fontSize: 10,
                  }}
                />
              )}
              <Scatter
                dataKey="fEt_included"
                name="In fit"
                fill={MBAL_COLORS.pointInFit}
                shape="circle"
                onClick={handlePointClick}
                cursor="pointer"
              />
              <Scatter
                dataKey="fEt_excluded"
                name="Excluded"
                fill="none"
                stroke={MBAL_COLORS.pointExcluded}
                strokeWidth={1.5}
                shape="circle"
                onClick={handlePointClick}
                cursor="pointer"
              />
            </ComposedChart>
          </ResponsiveContainer>
          <ChartLogo />
        </div>
        <TimestepDetailPanel
          row={expandedRow}
          isGas={false}
          onClose={() => setExpandedRow(null)}
        />
      </CardContent>
    </Card>
  );
};

// =============================================================================
// PLOT 5 — Drive indices stacked bar
// =============================================================================
// One stacked bar per timestep (excluding initial). Stacks: DDI/SDI/CDI for oil,
// GDI/CDI for gas, both plus WDI for aquifer cases.
//
// Pletcher's drive indices sum to 1.0 when MBE solved correctly; the bars give
// a quick visual sanity check.

const DriveIndicesPlot = ({ rows, isGas, caseName }) => {
  const [expandedRow, setExpandedRow] = useState(null);
  const handlePointClick = useCallback(
    makePointClickHandler(rows, setExpandedRow),
    [rows],
  );

  // Filter to non-initial timesteps (drive indices undefined at t=0)
  const data = useMemo(
    () =>
      rows
        .filter((r) => r.timestep_index > 0 && r.drive_index_sum != null)
        .map((r) => ({
          timestep_index: r.timestep_index,
          pressure: r.pressure,
          // Use the values directly; engine sets unused ones to 0 or null
          DDI: isGas ? null : (r.ddi ?? 0),
          GDI: isGas ? (r.gdi ?? 0) : (r.gdi ?? 0),
          CDI: isGas ? (r.cdi ?? 0) : (r.sdi ?? r.cdi ?? 0),
          WDI: r.wdi ?? 0,
          sum: r.drive_index_sum ?? 0,
        })),
    [rows, isGas],
  );

  return (
    <Card className="bg-white border-slate-200">
      <CardHeader className="pb-2 border-b border-slate-200">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-cyan-600" />
              Drive indices by timestep
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              {isGas
                ? 'Gas drive (GDI) + rock/water compressibility (CDI) + water drive (WDI) = 1.0 for a correctly-solved material balance.'
                : 'Depletion drive (DDI) + gas-cap drive (GDI) + rock/water compressibility (CDI) + water drive (WDI) = 1.0 for a correctly-solved material balance.'}
              {' '}A consistent sum away from 1.0 indicates a problem with the solution.
            </CardDescription>
          </div>
          <ExportButton
            elementId="rb-plot-drive-indices"
            filename={`${sanitizeFilename(caseName)}_drive_indices`}
          />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative h-[380px] bg-white" id="rb-plot-drive-indices">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={CHART_MARGINS.withLegend}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis
                dataKey="timestep_index"
                type="category"
                tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                axisLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
                tickLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
              >
                <Label
                  value="Timestep"
                  position="insideBottom"
                  offset={-5}
                  style={{ fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
                />
              </XAxis>
              <YAxis
                type="number"
                domain={[0, 1.2]}
                ticks={[0, 0.25, 0.5, 0.75, 1.0]}
                tickFormatter={(v) => v.toFixed(2)}
                tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                axisLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
                tickLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
              >
                <Label
                  value="Drive index (fraction)"
                  angle={-90}
                  position="insideLeft"
                  style={{ fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
                />
              </YAxis>
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: CHART_COLORS.tooltipText }}
                itemStyle={{ color: CHART_COLORS.tooltipText }}
                formatter={(value, name) => [typeof value === 'number' ? value.toFixed(3) : value, name]}
                labelFormatter={(label) => `Timestep ${label}`}
              />
              <Legend
                verticalAlign="bottom"
                height={36}
                wrapperStyle={{
                  fontSize: `${CHART_TYPOGRAPHY.legendFontSize}px`,
                  paddingTop: '10px',
                  color: CHART_COLORS.legendText,
                }}
              />
              <ReferenceLine
                y={1.0}
                stroke={MBAL_COLORS.truthLine}
                strokeDasharray="4 2"
                label={{
                  value: 'Sum = 1.0 (correct MBE)',
                  position: 'insideTopRight',
                  fill: MBAL_COLORS.truthLine,
                  fontSize: 10,
                }}
              />
              {!isGas && (
                <Bar
                  dataKey="DDI"
                  stackId="a"
                  name="Depletion (DDI)"
                  fill={MBAL_COLORS.ddi}
                  onClick={handlePointClick}
                  cursor="pointer"
                />
              )}
              <Bar
                dataKey="GDI"
                stackId="a"
                name={isGas ? 'Gas (GDI)' : 'Gas cap (GDI)'}
                fill={MBAL_COLORS.gdi}
                onClick={handlePointClick}
                cursor="pointer"
              />
              <Bar
                dataKey="CDI"
                stackId="a"
                name="Rock+water (CDI)"
                fill={MBAL_COLORS.cdi}
                onClick={handlePointClick}
                cursor="pointer"
              />
              <Bar
                dataKey="WDI"
                stackId="a"
                name="Water drive (WDI)"
                fill={MBAL_COLORS.wdi}
                onClick={handlePointClick}
                cursor="pointer"
              />
            </ComposedChart>
          </ResponsiveContainer>
          <ChartLogo />
        </div>
        <TimestepDetailPanel
          row={expandedRow}
          isGas={isGas}
          onClose={() => setExpandedRow(null)}
        />
      </CardContent>
    </Card>
  );
};

// =============================================================================
// MAIN COMPONENT — fetches latest result and renders applicable plots
// =============================================================================

const RbDiagnosticPlots = ({ caseId, caseData, runVersion = 0 }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const isGas = caseData?.fluid_system === 'gas';
  const caseName = caseData?.case_name ?? caseData?.name ?? 'mbal';

  // Load latest completed run + its result
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!caseId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);

      const { data: runs, error: runsErr } = await listRuns(caseId);
      if (cancelled) return;
      if (runsErr) {
        setError(runsErr.message);
        setLoading(false);
        return;
      }

      const lastCompleted = (runs ?? []).find((r) => r.status === 'completed');
      if (!lastCompleted) {
        setResult(null);
        setLoading(false);
        return;
      }

      const { data: res, error: resErr } = await getResultByRunId(lastCompleted.id);
      if (cancelled) return;
      if (resErr) {
        setError(resErr.message);
        setLoading(false);
        return;
      }
      setResult(res);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [caseId, refreshTick, runVersion]);

  const rows = useMemo(() => buildBaseRows(result?.plot_data), [result]);

  // MB7: rock and water compressibilities for the Ramagost-Farshad overlay
  // (same saved config the runs inherit).
  const [rockCfg, setRockCfg] = useState(null);
  useEffect(() => {
    if (!caseId || !isGas) return undefined;
    let cancelled = false;
    getCaseDefaultConfig(caseId).then(({ data }) => {
      if (!cancelled) setRockCfg(data ?? null);
    });
    return () => { cancelled = true; };
  }, [caseId, isGas, runVersion]);

  const ramagost = useMemo(() => ({
    pi: caseData?.initial_pressure_psia,
    swi: caseData?.initial_water_saturation,
    cw: rockCfg?.water_compressibility_psi ?? 3e-6,
    cf: rockCfg?.formation_compressibility_psi ?? 6e-6,
  }), [caseData, rockCfg]);

  // ── Loading ──
  if (loading) {
    return (
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </CardContent>
      </Card>
    );
  }

  // ── No case data ──
  if (!caseData) {
    return (
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="py-12 text-center text-slate-400">
          No case data. Diagnostic plots require an active case.
        </CardContent>
      </Card>
    );
  }

  // ── No run yet ──
  if (!result) {
    return (
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="py-12 text-center">
          <Info className="w-10 h-10 mx-auto text-slate-500 mb-3" />
          <p className="text-slate-300 font-medium">No MBAL results yet</p>
          <p className="text-sm text-slate-500 mt-1">
            Go to the Run tab and click Run MBAL. Diagnostic plots will appear here once a run completes.
          </p>
        </CardContent>
      </Card>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not load plot data</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  // ── Insufficient plot data ──
  if (!result.plot_data || (result.plot_data.timestep_index?.length ?? 0) < 2) {
    return (
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="py-12 text-center">
          <Info className="w-10 h-10 mx-auto text-amber-500 mb-3" />
          <p className="text-slate-300 font-medium">Insufficient data for plots</p>
          <p className="text-sm text-slate-500 mt-1">
            The latest run completed but its plot data has fewer than 2 timesteps. Re-run with more production observations.
          </p>
        </CardContent>
      </Card>
    );
  }

  // =============================================================================
  // RENDER
  // =============================================================================
  return (
    <div className="space-y-4">
      {/* Header card — summary + refresh */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <CardTitle className="text-lime-300">Diagnostic Plots</CardTitle>
            <CardDescription>
              Five plots derived from the latest MBAL run on this case.
              {' '}{isGas ? 'Gas reservoir — showing F vs Et, p/z, Cole, and drive indices.' : 'Oil reservoir — showing F vs Et, Campbell, and drive indices.'}
              {' '}Click any data point to inspect that timestep's full payload.
            </CardDescription>
          </div>
          <Button
            onClick={() => setRefreshTick((n) => n + 1)}
            variant="outline"
            size="sm"
            className="border-slate-600"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </CardHeader>
      </Card>

      {/* Plots — 2-column grid on lg screens, stacked otherwise */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* F vs Et — always shown */}
        <HavlenaOdehPlot rows={rows} result={result} isGas={isGas} caseName={caseName} />

        {/* Gas-only plots */}
        {isGas && <PZPlot rows={rows} result={result} caseName={caseName} ramagost={ramagost} />}
        {isGas && <ColePlot rows={rows} result={result} caseName={caseName} />}

        {/* Oil-only plot */}
        {!isGas && <CampbellPlot rows={rows} result={result} caseName={caseName} />}

        {/* Drive indices — always shown */}
        <DriveIndicesPlot rows={rows} isGas={isGas} caseName={caseName} />
      </div>

      {/* Honest footer note */}
      <Alert className="bg-slate-800/40 border-slate-700">
        <Info className="h-4 w-4" />
        <AlertTitle className="text-sm text-slate-300">About these plots</AlertTitle>
        <AlertDescription className="text-xs text-slate-400 leading-relaxed">
          Hollow circles are points excluded from the regression fit (typically early-time points where the straight-line trend hasn't fully developed). Filled circles are the points used. The dashed red reference line on Campbell/Cole plots shows the MBAL-derived OOIP/OGIP for visual comparison with the apparent value the plot would suggest at each timestep.
        </AlertDescription>
      </Alert>
    </div>
  );
};

export default RbDiagnosticPlots;
