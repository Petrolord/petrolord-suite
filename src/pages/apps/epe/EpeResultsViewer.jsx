import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { BarChart, ArrowLeft, DollarSign, TrendingUp, Clock, FileText, Receipt, Wallet, Landmark, Download, Pencil } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import {
  ComposedChart, Bar, Area, Line, XAxis, YAxis,
  CartesianGrid, Tooltip as RTooltip, Legend as RLegend, ReferenceLine,
  ReferenceDot, Cell, LabelList, Label
} from 'recharts';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import html2canvas from 'html2canvas';
import ChartFrame from '@/components/charts/ChartFrame';
import { drawBrandHeader, loadPetrolordLogo } from '@/lib/pdfBrand';
import { configSectionsForReport } from './epeConfigLabels';
import EpeMonteCarloPanel from './EpeMonteCarloPanel';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS,
  GRID_STYLE, TOOLTIP_STYLE
} from '@/utils/chartTheme';

const KpiCard = ({ icon: Icon, title, value, color }) => (
  <div className="bg-white/5 p-4 rounded-lg flex items-center space-x-4">
    <div className={`p-3 rounded-lg bg-gradient-to-r ${color}`}>
      <Icon className="w-6 h-6 text-white" />
    </div>
    <div>
      <p className="text-sm text-slate-300">{title}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  </div>
);

// ----------------------------------------------------------------------------
// B3 Piece 2: helper components
// ----------------------------------------------------------------------------

// Pill-style tab bar — matches the JV/PSC/PIA fiscal regime buttons elsewhere
const TabBar = ({ tabs, active, onChange }) => (
  <div className="flex gap-2 flex-wrap">
    {tabs.map((tab) => (
      <button
        key={tab.key}
        type="button"
        onClick={() => onChange(tab.key)}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          active === tab.key
            ? 'bg-gradient-to-r from-green-500 to-cyan-500 text-white shadow'
            : 'bg-gray-700 text-slate-300 hover:bg-gray-600'
        }`}
      >
        {tab.label}
      </button>
    ))}
  </div>
);

// Format a USD number as $XXX.XM or $X.XB depending on magnitude
const fmtCompact = (n) => {
  if (n == null || isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${n < 0 ? '-' : ''}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${n < 0 ? '-' : ''}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${n < 0 ? '-' : ''}${(abs / 1e3).toFixed(0)}K`;
  return `${n < 0 ? '-' : ''}${abs.toFixed(0)}`;
};

// ----------------------------------------------------------------------------
// Export helpers (v3.4): one canonical column spec feeds CSV and XLSX so the
// downloads always match what the engine wrote.
// ----------------------------------------------------------------------------

const cashFlowColumns = (isPIA) => {
  const cols = [
    { key: 'year', label: 'Year' },
    { key: 'oil_bbl', label: 'Oil (bbl)' },
    { key: 'gas_mscf', label: 'Gas (Mscf)' },
    { key: 'condensate_bbl', label: 'Condensate (bbl)' },
    { key: 'gross_revenue', label: 'Gross Revenue (USD)' },
    { key: 'royalty', label: 'Royalty (USD)' },
    { key: 'opex', label: 'OPEX (USD)' },
    { key: 'capex', label: 'CAPEX (USD)' },
  ];
  if (isPIA) {
    cols.push(
      { key: 'hcdt', label: 'HCDT (USD)' },
      { key: 'nddc', label: 'NDDC (USD)' },
      { key: 'hct_tax', label: 'HCT (USD)' },
      { key: 'cit_tax', label: 'CIT (USD)' },
      { key: 'tet_tax', label: 'TET (USD)' },
      { key: 'dev_levy_tax', label: 'Dev Levy (USD)' },
      { key: 'production_allowance', label: 'Production Allowance (USD)' },
    );
  } else {
    cols.push(
      { key: 'taxable_income', label: 'Taxable Income (USD)' },
      { key: 'tax', label: 'Tax (USD)' },
    );
  }
  cols.push(
    { key: 'abandonment_cost', label: 'Abandonment (USD)' },
    { key: 'net_cash_flow', label: 'Net Cash Flow (USD)' },
    { key: 'real_net_cash_flow', label: 'Real NCF (USD)' },
    { key: 'discounted_cash_flow', label: 'Discounted CF (USD)' },
    { key: 'cumulative_nominal', label: 'Cumulative NCF (USD)' },
  );
  return cols;
};

const KPI_EXPORT_ROWS = [
  ['npv', 'NPV (USD)'],
  ['irr', 'IRR (%)'],
  ['payback_years', 'Payback (years)'],
  ['discounted_payback_years', 'Discounted Payback (years)'],
  ['breakeven_oil_price_usd_bbl', 'Breakeven Oil Price (USD/bbl)'],
  ['dpi', 'DPI (NPV / PV capex)'],
  ['government_take_pct', 'Government Take (%)'],
  ['government_take_pct_discounted', 'Government Take, Discounted (%)'],
  ['unit_technical_cost_usd_per_boe', 'Unit Technical Cost (USD/boe)'],
  ['opex_usd_per_boe', 'OPEX (USD/boe)'],
  ['total_revenue', 'Total Revenue (USD)'],
  ['total_capex', 'Total CAPEX (USD)'],
  ['total_opex', 'Total OPEX (USD)'],
  ['total_tax', 'Total Tax (USD)'],
  ['total_abandonment_cost', 'Abandonment (USD)'],
  ['total_oil_bbl', 'Total Oil (bbl)'],
  ['total_gas_mscf', 'Total Gas (Mscf)'],
  ['total_boe', 'Total BOE'],
  ['economic_limit_year', 'Economic Limit Year'],
  ['fiscal_regime', 'Fiscal Regime'],
  ['fiscal_framework', 'Fiscal Framework'],
  ['pv_basis', 'PV Basis'],
  ['discount_rate_applied_pct', 'Discount Rate Applied (%)'],
];

// ----------------------------------------------------------------------------
// Cash Flow Profile: stacked inflow/outflow area chart with cumulative line
// ----------------------------------------------------------------------------
const CashFlowProfile = ({ results }) => {
  const cf = results?.cash_flow_data || [];
  const isPIA = results?.kpis?.fiscal_regime === 'PIA';

  // Shape data for Recharts.
  // Revenue is positive. All costs are stored as NEGATIVE values so the area
  // chart draws them below the zero line. Cumulative CF flows through 0 and
  // shows payback inflection.
  let cum = 0;
  const data = cf.map((row) => {
    const ncf = row.net_cash_flow ?? row.netCashFlow ?? 0;
    cum += ncf;
    const base = {
      year: row.year,
      revenue: row.gross_revenue ?? row.revenue ?? 0,
      capex: -(row.capex || 0),
      opex: -(row.opex || 0),
      royalty: -(row.royalty || 0),
      cumulative: cum,
    };
    if (isPIA) {
      return {
        ...base,
        hcdt: -(row.hcdt || 0),
        nddc: -(row.nddc || 0),
        hct: -(row.hct_tax || 0),
        cit: -(row.cit_tax || 0),
        tet: -(row.tet_tax || 0),
        dev_levy: -(row.dev_levy_tax || 0),
      };
    } else {
      return { ...base, tax: -(row.tax || 0) };
    }
  });

  return (
    <div id="epe-pdf-capture-profile" style={{ width: '100%', background: CHART_COLORS.background, borderRadius: 8, padding: 12 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: CHART_COLORS.axisLabel, margin: '0 0 8px 4px' }}>
        Cash Flow Profile {isPIA ? '(PIA 2021)' : ''}
      </h3>
      <ChartFrame height={410} exportFilename="pe-studio-cash-flow-profile">
        <ComposedChart data={data} margin={CHART_MARGINS.withLegend} stackOffset="sign">
          <CartesianGrid {...GRID_STYLE} />
          <XAxis
            dataKey="year"
            tick={{ fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText }}
            stroke={CHART_COLORS.axisLine}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText }}
            stroke={CHART_COLORS.axisLine}
            tickFormatter={fmtCompact}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText }}
            stroke={CHART_COLORS.axisLine}
            tickFormatter={fmtCompact}
          />
          <RTooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value) => fmtCompact(value)}
          />
          <RLegend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText, paddingTop: 8 }} />
          <ReferenceLine yAxisId="left" y={0} stroke={CHART_COLORS.axisLabel} strokeWidth={1.5} />

          {/* Inflow */}
          <Area yAxisId="left" type="monotone" dataKey="revenue" name="Revenue" stackId="inflow" stroke="#059669" fill="#059669" fillOpacity={0.45} />

          {/* Outflows: stacked downward */}
          <Area yAxisId="left" type="monotone" dataKey="capex" name="CAPEX" stackId="outflow" stroke="#dc2626" fill="#dc2626" fillOpacity={0.5} />
          <Area yAxisId="left" type="monotone" dataKey="opex" name="OPEX" stackId="outflow" stroke="#d97706" fill="#d97706" fillOpacity={0.5} />
          <Area yAxisId="left" type="monotone" dataKey="royalty" name="Royalty" stackId="outflow" stroke="#7c3aed" fill="#7c3aed" fillOpacity={0.5} />

          {isPIA ? (
            <>
              <Area yAxisId="left" type="monotone" dataKey="hcdt" name="HCDT" stackId="outflow" stroke="#0891b2" fill="#0891b2" fillOpacity={0.5} />
              <Area yAxisId="left" type="monotone" dataKey="nddc" name="NDDC" stackId="outflow" stroke="#475569" fill="#475569" fillOpacity={0.5} />
              <Area yAxisId="left" type="monotone" dataKey="hct" name="HCT" stackId="outflow" stroke="#be123c" fill="#be123c" fillOpacity={0.5} />
              <Area yAxisId="left" type="monotone" dataKey="cit" name="CIT" stackId="outflow" stroke="#ea580c" fill="#ea580c" fillOpacity={0.5} />
              <Area yAxisId="left" type="monotone" dataKey="tet" name="TET" stackId="outflow" stroke="#a16207" fill="#a16207" fillOpacity={0.5} />
              <Area yAxisId="left" type="monotone" dataKey="dev_levy" name="Dev Levy" stackId="outflow" stroke="#92400e" fill="#92400e" fillOpacity={0.5} />
            </>
          ) : (
            <Area yAxisId="left" type="monotone" dataKey="tax" name="Tax" stackId="outflow" stroke="#be123c" fill="#be123c" fillOpacity={0.5} />
          )}

          {/* Cumulative CF as a line on the right axis */}
          <Line yAxisId="right" type="monotone" dataKey="cumulative" name="Cumulative CF" stroke="#0f172a" strokeWidth={2.5} dot={false} />
        </ComposedChart>
      </ChartFrame>
    </div>
  );
};

// ----------------------------------------------------------------------------
// NPV vs discount rate (Wave D, audit 4.5): the classic profile exhibit.
// Engine v3.8 writes kpis.npv_profile; older runs simply skip this panel.
// ----------------------------------------------------------------------------
const NpvProfileChart = ({ kpis }) => {
  const profile = kpis?.npv_profile;
  if (!Array.isArray(profile) || profile.length === 0) return null;
  const applied = kpis.discount_rate_applied_pct != null
    ? Math.round(Number(kpis.discount_rate_applied_pct) * 100) / 100 : null;
  const appliedPoint = applied != null
    ? profile.find((p) => Math.abs(p.rate_pct - applied) < 0.005) : null;
  return (
    <div id="epe-pdf-capture-npvprofile" style={{ width: '100%', background: CHART_COLORS.background, borderRadius: 8, padding: 12, marginTop: 16 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: CHART_COLORS.axisLabel, margin: '0 0 2px 4px' }}>
        NPV vs Discount Rate
      </h3>
      <p style={{ fontSize: 11, color: CHART_COLORS.axisText, margin: '0 0 6px 4px' }}>
        On the run's PV basis and discounting convention. The dot marks the applied rate.
      </p>
      <ChartFrame height={220} logoHeight={24} exportFilename="pe-studio-npv-vs-rate">
        <ComposedChart data={profile} margin={CHART_MARGINS.standard}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis
            dataKey="rate_pct"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText }}
            stroke={CHART_COLORS.axisLine}
          />
          <YAxis
            tickFormatter={fmtCompact}
            tick={{ fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText }}
            stroke={CHART_COLORS.axisLine}
          />
          <RTooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value) => fmtCompact(value)}
            labelFormatter={(v) => `Discount rate ${v}%`}
          />
          <ReferenceLine y={0} stroke={CHART_COLORS.axisLabel} strokeWidth={1.5} />
          <Line type="monotone" dataKey="npv" name="NPV" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 2.5 }} />
          {appliedPoint && (
            <ReferenceDot x={appliedPoint.rate_pct} y={appliedPoint.npv} r={6} fill="#059669" stroke="#ffffff" strokeWidth={2} />
          )}
        </ComposedChart>
      </ChartFrame>
    </div>
  );
};

// ----------------------------------------------------------------------------
// Cash Flow Waterfall: single-year cascade from Gross Revenue to ATCF
// ----------------------------------------------------------------------------
//
// Waterfall rendering uses the "floating bar" trick:
// Each bar is a stacked Bar with two segments:
//   - `base` (transparent) — anchors the bar at the running total
//   - `value` (colored)    — the actual change at this step
// The start and end bars sit at the absolute total (base=0).
//
const CashFlowWaterfall = ({ results }) => {
  const cf = results?.cash_flow_data || [];
  const isPIA = results?.kpis?.fiscal_regime === 'PIA';

  // Default year: first year with positive revenue (production has started)
  const defaultYearIdx = Math.max(0, cf.findIndex(r => (r.gross_revenue ?? r.revenue ?? 0) > 0));
  const [selectedIdx, setSelectedIdx] = useState(defaultYearIdx);

  if (cf.length === 0) {
    return <div style={{ color: CHART_COLORS.axisText, padding: 16 }}>No cash flow data available.</div>;
  }

  // Wave D (audit 4.7): "All years" sums every row into one full-life
  // cascade, the standard government-take exhibit.
  const isAllYears = selectedIdx === 'all';
  const sumKeys = ['gross_revenue', 'revenue', 'royalty', 'opex', 'capex',
    'hcdt', 'nddc', 'hct_tax', 'cit_tax', 'tet_tax', 'dev_levy_tax', 'tax',
    'abandonment_cost', 'net_cash_flow'];
  const row = isAllYears
    ? cf.reduce((acc, r) => {
        for (const k of sumKeys) acc[k] = (acc[k] || 0) + (r[k] || 0);
        return acc;
      }, {})
    : cf[Math.min(Number(selectedIdx), cf.length - 1)];
  if (!row) return null;

  // Build the cascade. Each step has: label, value (signed), color.
  // Negative values are deductions (paint red); positive are inflows or final ATCF (green).
  const steps = [];
  const grossRev = row.gross_revenue ?? row.revenue ?? 0;
  steps.push({ label: 'Gross Revenue', value: grossRev, color: '#059669', isStart: true });

  if ((row.royalty || 0) > 0) steps.push({ label: 'Royalty', value: -(row.royalty), color: '#7c3aed' });
  if ((row.opex || 0) > 0) steps.push({ label: 'OPEX', value: -(row.opex), color: '#d97706' });
  if ((row.capex || 0) > 0) steps.push({ label: 'CAPEX', value: -(row.capex), color: '#dc2626' });

  if (isPIA) {
    if ((row.hcdt || 0) > 0) steps.push({ label: 'HCDT', value: -(row.hcdt), color: '#0891b2' });
    if ((row.nddc || 0) > 0) steps.push({ label: 'NDDC', value: -(row.nddc), color: '#475569' });
    if ((row.hct_tax || 0) > 0) steps.push({ label: 'HCT', value: -(row.hct_tax), color: '#be123c' });
    if ((row.cit_tax || 0) > 0) steps.push({ label: 'CIT', value: -(row.cit_tax), color: '#ea580c' });
    if ((row.tet_tax || 0) > 0) steps.push({ label: 'TET', value: -(row.tet_tax), color: '#a16207' });
    if ((row.dev_levy_tax || 0) > 0) steps.push({ label: 'Dev Levy', value: -(row.dev_levy_tax), color: '#92400e' });
  } else {
    if ((row.tax || 0) > 0) steps.push({ label: 'Tax', value: -(row.tax), color: '#be123c' });
  }

  if ((row.abandonment_cost || 0) > 0) steps.push({ label: 'Abandonment', value: -(row.abandonment_cost), color: '#0f172a' });

  const finalNcf = row.net_cash_flow ?? row.netCashFlow ?? 0;
  steps.push({ label: 'Net Cash Flow', value: finalNcf, color: finalNcf >= 0 ? '#059669' : '#dc2626', isEnd: true });

  // Compute floating-bar data. Each row has:
  //   base   — invisible bar sitting at the running total floor of this step
  //   value  — the absolute height of the actual change
  // For increases (start, end, positive values), base = previousTotal, value = +amount
  // For decreases, base = previousTotal - amount, value = +amount (still positive height)
  // For start/end bars, base = 0, value = absolute total
  let running = 0;
  const data = steps.map((s, i) => {
    if (s.isStart) {
      running = s.value;
      return { name: s.label, base: 0, value: s.value, color: s.color, signedValue: s.value };
    }
    if (s.isEnd) {
      // End bar shows absolute total from zero
      return { name: s.label, base: 0, value: Math.max(s.value, 0), color: s.color, signedValue: s.value };
    }
    // Intermediate: deductions are negative values; the floating bar floor sits at (running - amount)
    const before = running;
    running += s.value;  // s.value is already signed (negative for deductions)
    const height = Math.abs(s.value);
    const base = Math.min(before, running);
    return { name: s.label, base, value: height, color: s.color, signedValue: s.value };
  });

  // Custom tooltip showing the signed value and the running total after this step
  const renderTooltip = ({ active, payload }) => {
    if (!active || !payload || payload.length === 0) return null;
    const d = payload[0].payload;
    return (
      <div style={{ ...TOOLTIP_STYLE, padding: '8px 12px' }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{d.name}</div>
        <div style={{ fontSize: 12 }}>
          {d.signedValue >= 0 ? '+' : ''}{fmtCompact(d.signedValue)}
        </div>
      </div>
    );
  };

  // Each bar uses its row-specific color, so we render Cell-by-Cell using Recharts' approach:
  // Bar with shape function would be cleaner but a simpler approach: render the value Bar
  // with fill from data via a 'fill' field. Recharts 2.x supports per-cell fill via <Cell>.

  return (
    <div id="epe-pdf-capture-waterfall" style={{ position: 'relative', width: '100%', background: CHART_COLORS.background, borderRadius: 8, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: CHART_COLORS.axisLabel, margin: 0 }}>
          Cash Flow Waterfall: {isAllYears ? 'All Years (full life)' : `Year ${row.year}`} {isPIA ? '(PIA 2021)' : ''}
        </h3>
        <label style={{ fontSize: 12, color: CHART_COLORS.axisText, display: 'flex', alignItems: 'center', gap: 8 }}>
          Year:
          <select
            value={selectedIdx}
            onChange={(e) => setSelectedIdx(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            style={{
              padding: '4px 8px',
              fontSize: 12,
              borderRadius: 4,
              border: `1px solid ${CHART_COLORS.tooltipBorder}`,
              background: '#ffffff',
              color: CHART_COLORS.axisLabel,
            }}
          >
            <option value="all">All years</option>
            {cf.map((r, i) => (
              <option key={r.year} value={i}>{r.year}</option>
            ))}
          </select>
        </label>
      </div>
      <ChartFrame height={440} exportFilename="pe-studio-cash-flow-waterfall">
          <ComposedChart data={data} margin={CHART_MARGINS.standard}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText }}
              stroke={CHART_COLORS.axisLine}
              interval={0}
              angle={-30}
              textAnchor="end"
              height={70}
            />
            <YAxis
              tick={{ fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText }}
              stroke={CHART_COLORS.axisLine}
              tickFormatter={fmtCompact}
            />
            <RTooltip content={renderTooltip} />
            <ReferenceLine y={0} stroke={CHART_COLORS.axisLabel} strokeWidth={1.5} />
            {/* Invisible base bars stack the colored values at the right floor height */}
            <Bar dataKey="base" stackId="a" fill="transparent" />
            <Bar dataKey="value" stackId="a">
              {data.map((entry, idx) => (
                <Cell key={`cell-${idx}`} fill={entry.color} />
              ))}
              <LabelList
                dataKey="signedValue"
                position="top"
                formatter={(v) => (v >= 0 ? '+' : '') + fmtCompact(v)}
                style={{ fontSize: 10, fill: CHART_COLORS.axisLabel, fontWeight: 600 }}
              />
            </Bar>
          </ComposedChart>
      </ChartFrame>
    </div>
  );
};

// ----------------------------------------------------------------------------
// Year-by-Year Detail: horizontal-scroll table
// ----------------------------------------------------------------------------
// ----------------------------------------------------------------------------
// Sensitivity (Tornado): horizontal bar chart showing NPV deltas from ±20% sweeps
// ----------------------------------------------------------------------------

// Tornado chart — horizontal bars, low/high delta per variable.
// Recharts layout="vertical" means the value axis is X and the category axis is Y.
const TornadoChart = ({ rows, baseNpv }) => {
  if (!rows || rows.length === 0) {
    return <div style={{ color: CHART_COLORS.axisText, padding: 16 }}>No sensitivity data.</div>;
  }

  // Build chart data: each row has 'name' (variable label) plus deltaLow/deltaHigh as separate bar values.
  // Bars are drawn from zero outward. The sign of delta_*_npv determines direction:
  //   - If delta is negative, the bar extends LEFT
  //   - If positive, the bar extends RIGHT
  // We use two separate Bar series (low + high) with their own colors.
  const data = rows.map(r => ({
    name: r.variable_label,
    deltaLow: r.delta_low_npv,
    deltaHigh: r.delta_high_npv,
    lowValue: r.low_value,
    highValue: r.high_value,
    baseValue: r.base_value,
  }));

  // Determine X-axis bounds symmetrically around 0
  const allDeltas = data.flatMap(d => [d.deltaLow, d.deltaHigh]);
  const maxAbs = Math.max(...allDeltas.map(Math.abs), 1);
  const padding = maxAbs * 0.1;
  const xDomain = [-(maxAbs + padding), maxAbs + padding];

  // Custom tooltip showing both directions for the hovered variable
  const renderTooltip = ({ active, payload, label }) => {
    if (!active || !payload || payload.length === 0) return null;
    const d = payload[0].payload;
    return (
      <div style={{ ...TOOLTIP_STYLE, padding: '10px 12px', minWidth: 220 }}>
        <div style={{ fontWeight: 600, marginBottom: 6, color: CHART_COLORS.axisLabel }}>{label}</div>
        <div style={{ fontSize: 11, marginBottom: 4 }}>
          <span style={{ color: '#dc2626' }}>● Low ({fmtCompact(d.lowValue)}): </span>
          <span style={{ fontWeight: 600 }}>{d.deltaLow >= 0 ? '+' : ''}{fmtCompact(d.deltaLow)}</span>
        </div>
        <div style={{ fontSize: 11, marginBottom: 4 }}>
          <span style={{ color: '#059669' }}>● High ({fmtCompact(d.highValue)}): </span>
          <span style={{ fontWeight: 600 }}>{d.deltaHigh >= 0 ? '+' : ''}{fmtCompact(d.deltaHigh)}</span>
        </div>
        <div style={{ fontSize: 10, color: CHART_COLORS.axisText, marginTop: 4 }}>
          Base: {fmtCompact(d.baseValue)}
        </div>
      </div>
    );
  };

  const dynamicHeight = Math.max(360, 60 + data.length * 36);

  return (
    <ChartFrame height={dynamicHeight} exportFilename="pe-studio-npv-tornado">
        <ComposedChart
          data={data}
          layout="vertical"
          margin={{ top: 20, right: 60, left: 100, bottom: 50 }}
        >
          <CartesianGrid {...GRID_STYLE} />
          <XAxis
            type="number"
            domain={xDomain}
            tick={{ fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText }}
            stroke={CHART_COLORS.axisLine}
            tickFormatter={fmtCompact}
          >
            <Label
              value={`Δ NPV from base ${fmtCompact(baseNpv)}`}
              position="bottom"
              offset={20}
              style={{ fontSize: 11, fill: CHART_COLORS.axisLabel, fontWeight: 600 }}
            />
          </XAxis>
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText }}
            stroke={CHART_COLORS.axisLine}
            width={130}
            interval={0}
          />
          <RTooltip content={renderTooltip} cursor={{ fill: 'rgba(15,23,42,0.04)' }} />
          <ReferenceLine x={0} stroke={CHART_COLORS.axisLabel} strokeWidth={1.5} />
          <Bar dataKey="deltaLow"  name="Low variant" fill="#dc2626" />
          <Bar dataKey="deltaHigh" name="High variant" fill="#059669" />
          <RLegend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} verticalAlign="top" />
        </ComposedChart>
    </ChartFrame>
  );
};

// SensitivityPanel — orchestrates the run lifecycle:
// idle → invoking → running → complete (or failed)
const SensitivityPanel = ({ runId, runConfigId, userId }) => {
  const [state, setState] = useState('loading');  // 'loading' | 'idle' | 'invoking' | 'running' | 'complete' | 'failed'
  const [sensitivityRun, setSensitivityRun] = useState(null);
  const [results, setResults] = useState([]);
  const [errorMsg, setErrorMsg] = useState(null);
  // Wave C (audit 3.2): user-set sweep ranges, in percent vs the base value.
  const [rangeLow, setRangeLow] = useState(-20);
  const [rangeHigh, setRangeHigh] = useState(20);

  // On mount: check whether a recent sensitivity run already exists for this base run
  useEffect(() => {
    if (!runId) return;
    const fetchExisting = async () => {
      setState('loading');
      try {
        const { data: runs, error: runErr } = await supabase
          .from('epe_sensitivity_runs')
          .select('*')
          .eq('base_run_id', runId)
          .order('created_at', { ascending: false })
          .limit(1);
        if (runErr) throw runErr;
        if (!runs || runs.length === 0) {
          setState('idle');
          return;
        }
        const latest = runs[0];
        setSensitivityRun(latest);
        if (latest.status === 'complete') {
          const { data: res, error: resErr } = await supabase
            .from('epe_sensitivity_results')
            .select('*')
            .eq('sensitivity_run_id', latest.id)
            .order('ordinal', { ascending: true });
          if (resErr) throw resErr;
          setResults(res || []);
          setState('complete');
        } else if (latest.status === 'failed') {
          setErrorMsg(latest.error_message || 'Run failed');
          setState('failed');
        } else {
          // 'queued' or 'running' — should be rare since runs complete synchronously,
          // but possible if a previous invocation crashed mid-flight
          setState('idle');
        }
      } catch (err) {
        console.error('Sensitivity panel load error:', err);
        setErrorMsg(err?.message || String(err));
        setState('failed');
      }
    };
    fetchExisting();
  }, [runId]);

  const handleRunSensitivity = async () => {
    const low = Number(rangeLow);
    const high = Number(rangeHigh);
    if (!Number.isFinite(low) || low < -99 || low > 0) {
      setErrorMsg('Low must be between -99 and 0 percent.');
      setState('failed');
      return;
    }
    if (!Number.isFinite(high) || high < 0 || high > 400) {
      setErrorMsg('High must be between 0 and 400 percent.');
      setState('failed');
      return;
    }
    setState('invoking');
    setErrorMsg(null);
    try {
      // 1. Create the sensitivity_runs row (queued)
      const { data: newRun, error: insErr } = await supabase
        .from('epe_sensitivity_runs')
        .insert({
          base_run_id: runId,
          base_run_config_id: runConfigId,
          user_id: userId,
          status: 'queued',
        })
        .select('*')
        .single();
      if (insErr) throw insErr;

      // 2. Invoke the batch engine
      setState('running');
      const { data: invokeData, error: invokeErr } = await supabase.functions.invoke(
        'epe-cash-flow-engine-batch',
        {
          body: {
            run_id: runId,
            base_run_config_id: runConfigId,
            sensitivity_run_id: newRun.id,
            // Wave C: ranges apply to every multiplicative bar.
            sweep_options: { factor_low: 1 + Number(rangeLow) / 100, factor_high: 1 + Number(rangeHigh) / 100 },
          },
        }
      );
      if (invokeErr) throw invokeErr;
      if (invokeData?.error) throw new Error(invokeData.error);

      // 3. Refresh state from DB
      const { data: completedRun, error: refreshErr } = await supabase
        .from('epe_sensitivity_runs')
        .select('*')
        .eq('id', newRun.id)
        .single();
      if (refreshErr) throw refreshErr;
      setSensitivityRun(completedRun);

      const { data: res, error: resErr } = await supabase
        .from('epe_sensitivity_results')
        .select('*')
        .eq('sensitivity_run_id', newRun.id)
        .order('ordinal', { ascending: true });
      if (resErr) throw resErr;
      setResults(res || []);
      setState('complete');
    } catch (err) {
      console.error('Sensitivity run error:', err);
      setErrorMsg(err?.message || String(err));
      setState('failed');
    }
  };


  const rangeControls = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: CHART_COLORS.axisText }}>
      Low
      <input
        type="number"
        step="1"
        value={rangeLow}
        onChange={(e) => setRangeLow(e.target.value)}
        style={{ width: 56, padding: '2px 6px', borderRadius: 4, border: `1px solid ${CHART_COLORS.grid}`, background: 'transparent', color: 'inherit', fontSize: 12 }}
      />
      % High
      <input
        type="number"
        step="1"
        value={rangeHigh}
        onChange={(e) => setRangeHigh(e.target.value)}
        style={{ width: 56, padding: '2px 6px', borderRadius: 4, border: `1px solid ${CHART_COLORS.grid}`, background: 'transparent', color: 'inherit', fontSize: 12 }}
      />
      %
    </span>
  );

  // ----- Render by state -----
  const containerStyle = {
    background: CHART_COLORS.background,
    borderRadius: 8,
    padding: 20,
    minHeight: 240,
  };

  if (state === 'loading') {
    return (
      <div style={containerStyle}>
        <p style={{ color: CHART_COLORS.axisText, fontSize: 13 }}>Loading sensitivity data…</p>
      </div>
    );
  }

  if (state === 'idle') {
    return (
      <div style={containerStyle}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: CHART_COLORS.axisLabel, marginTop: 0 }}>
          Sensitivity Analysis
        </h3>
        <p style={{ color: CHART_COLORS.axisText, fontSize: 13, lineHeight: 1.5, marginBottom: 16 }}>
          Quantify how much each input variable affects NPV. The analysis runs your project
          through the engine with each variable at your chosen Low and High of its current
          value, then plots the NPV change as a tornado chart sorted by impact magnitude.
          The ranges apply to every multiplicative bar; Production and First Oil Delay
          bars are included.
        </p>
        <p style={{ color: CHART_COLORS.axisText, fontSize: 12, marginBottom: 16 }}>
          Estimated time: 1 to 5 seconds.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          {rangeControls}
          <Button
            onClick={handleRunSensitivity}
            className="bg-gradient-to-r from-green-500 to-cyan-500 text-white hover:opacity-90"
          >
            Run Sensitivity Analysis
          </Button>
        </div>
      </div>
    );
  }

  if (state === 'invoking' || state === 'running') {
    return (
      <div style={containerStyle}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: CHART_COLORS.axisLabel, marginTop: 0 }}>
          Running Sensitivity Analysis…
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
          <div style={{
            width: 18, height: 18, borderRadius: '50%',
            border: `3px solid ${CHART_COLORS.grid}`,
            borderTopColor: '#059669',
            animation: 'spin 0.8s linear infinite',
          }} />
          <span style={{ color: CHART_COLORS.axisText, fontSize: 13 }}>
            {state === 'invoking' ? 'Submitting…' : 'Running variations through the engine…'}
          </span>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (state === 'failed') {
    return (
      <div style={containerStyle}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#dc2626', marginTop: 0 }}>
          Sensitivity Analysis Failed
        </h3>
        <p style={{ color: CHART_COLORS.axisText, fontSize: 13, marginBottom: 16 }}>
          {errorMsg || 'An unknown error occurred.'}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          {rangeControls}
          <Button
            onClick={handleRunSensitivity}
            className="bg-gradient-to-r from-green-500 to-cyan-500 text-white hover:opacity-90"
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // state === 'complete'
  const baseNpv = Number(sensitivityRun?.base_npv) || 0;
  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: CHART_COLORS.axisLabel, margin: 0 }}>
          Tornado: NPV Sensitivity ({rangeLow}% / +{rangeHigh}%)
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {rangeControls}
          <Button
            onClick={handleRunSensitivity}
            size="sm"
            variant="outline"
            className="text-xs"
          >
            Re-run
          </Button>
        </div>
      </div>
      <p style={{ fontSize: 11, color: CHART_COLORS.axisText, marginBottom: 4 }}>
        Base NPV: <span style={{ fontWeight: 600 }}>{fmtCompact(baseNpv)}</span>
        {sensitivityRun?.duration_ms ? ` · Ran in ${sensitivityRun.duration_ms}ms` : ''}
      </p>
      <TornadoChart rows={results} baseNpv={baseNpv} />
    </div>
  );
};

const YearByYearTable = ({ results }) => {
  const cf = results?.cash_flow_data || [];
  const isPIA = results?.kpis?.fiscal_regime === 'PIA';

  if (cf.length === 0) {
    return <div style={{ color: CHART_COLORS.axisText, padding: 16 }}>No per-year data available.</div>;
  }

  // Build row definitions (label, accessor, formatter)
  const rows = [
    { label: 'Oil (bbl)',          get: (r) => r.oil_bbl || 0,         fmt: (v) => v ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—' },
    { label: 'Gas (Mscf)',         get: (r) => r.gas_mscf || 0,        fmt: (v) => v ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—' },
    { label: 'Condensate (bbl)',   get: (r) => r.condensate_bbl || 0,  fmt: (v) => v ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—' },
    { label: 'Gross Revenue',      get: (r) => r.gross_revenue ?? r.revenue ?? 0,  fmt: fmtCompact },
    { label: 'Royalty',            get: (r) => r.royalty || 0,         fmt: fmtCompact },
    { label: 'OPEX',               get: (r) => r.opex || 0,            fmt: fmtCompact },
    { label: 'CAPEX',              get: (r) => r.capex || 0,           fmt: fmtCompact },
  ];

  if (isPIA) {
    rows.push(
      { label: 'HCDT',                 get: (r) => r.hcdt || 0,                  fmt: fmtCompact },
      { label: 'NDDC',                 get: (r) => r.nddc || 0,                  fmt: fmtCompact },
      { label: 'HCT',                  get: (r) => r.hct_tax || 0,               fmt: fmtCompact },
      { label: 'CIT',                  get: (r) => r.cit_tax || 0,               fmt: fmtCompact },
      { label: 'TET',                  get: (r) => r.tet_tax || 0,               fmt: fmtCompact },
      { label: 'Dev Levy',             get: (r) => r.dev_levy_tax || 0,          fmt: fmtCompact },
      { label: 'Production Allowance', get: (r) => r.production_allowance || 0,  fmt: fmtCompact },
    );
  } else {
    rows.push({ label: 'Tax', get: (r) => r.tax || 0, fmt: fmtCompact });
  }

  if (cf.some((r) => (r.abandonment_cost || 0) > 0)) {
    rows.push({ label: 'Abandonment', get: (r) => r.abandonment_cost || 0, fmt: fmtCompact });
  }
  rows.push(
    { label: 'Net Cash Flow', get: (r) => r.net_cash_flow ?? r.netCashFlow ?? 0, fmt: fmtCompact, bold: true },
  );

  // Build cumulative row separately (needs running total)
  let cumRunning = 0;
  const cumValues = cf.map((r) => {
    cumRunning += (r.net_cash_flow ?? r.netCashFlow ?? 0);
    return cumRunning;
  });

  const cellStyle = {
    padding: '8px 12px',
    fontSize: 12,
    color: CHART_COLORS.axisText,
    borderBottom: `1px solid ${CHART_COLORS.grid}`,
    textAlign: 'right',
    whiteSpace: 'nowrap',
  };
  const labelCellStyle = {
    ...cellStyle,
    textAlign: 'left',
    fontWeight: 500,
    color: CHART_COLORS.axisLabel,
    position: 'sticky',
    left: 0,
    background: CHART_COLORS.background,
    zIndex: 1,
  };
  const headerCellStyle = {
    ...cellStyle,
    fontWeight: 600,
    color: CHART_COLORS.axisLabel,
    background: '#f1f5f9',
    borderBottom: `2px solid ${CHART_COLORS.axisLine}`,
  };

  return (
    <div style={{ background: CHART_COLORS.background, borderRadius: 8, padding: 12, overflowX: 'auto' }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: CHART_COLORS.axisLabel, margin: '0 0 12px 4px' }}>
        Year-by-Year Detail {isPIA ? '(PIA 2021)' : ''}
      </h3>
      <table style={{ borderCollapse: 'collapse', minWidth: '100%', fontFamily: CHART_TYPOGRAPHY.fontFamily }}>
        <thead>
          <tr>
            <th style={{ ...headerCellStyle, textAlign: 'left', position: 'sticky', left: 0, background: '#f1f5f9', zIndex: 2 }}>Metric</th>
            {cf.map((r) => (
              <th key={r.year} style={headerCellStyle}>{r.year}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td style={labelCellStyle}>{row.label}</td>
              {cf.map((r, i) => (
                <td
                  key={`${row.label}-${r.year}`}
                  style={{
                    ...cellStyle,
                    fontWeight: row.bold ? 600 : 400,
                    color: row.bold ? CHART_COLORS.axisLabel : CHART_COLORS.axisText,
                  }}
                >
                  {row.fmt(row.get(r))}
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <td style={{ ...labelCellStyle, fontWeight: 600 }}>Cumulative CF</td>
            {cumValues.map((v, i) => (
              <td
                key={`cum-${i}`}
                style={{
                  ...cellStyle,
                  fontWeight: 600,
                  color: v >= 0 ? '#059669' : '#dc2626',
                }}
              >
                {fmtCompact(v)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
};

const EpeResultsViewer = () => {
  const { runId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [results, setResults] = useState(null);
  const [runDetails, setRunDetails] = useState(null);
  const [runConfig, setRunConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('profile');  // 'profile' default per L1b/Q2
  // Annual chart legend toggles (default view matches the original: only Net
  // Cash Flow visible; the legend now actually toggles the other three).
  const [hiddenSeries, setHiddenSeries] = useState({ netCashFlow: false, revenue: true, capex: true, opex: true });

  useEffect(() => {
    const fetchResults = async () => {
      setLoading(true);
      const { data: runData, error: runError } = await supabase
        .from('epe_runs')
        .select('*, epe_cases(case_name)')
        .eq('id', runId)
        .single();

      if (runError) {
        toast({ title: 'Error', description: 'Could not fetch run details.', variant: 'destructive' });
        navigate('/dashboard/apps/economics/epe/cases');
        return;
      }
      setRunDetails(runData);

      const { data: resultData, error: resultError } = await supabase
        .from('epe_results')
        .select('*')
        .eq('run_id', runId)
        .single();

      if (resultError) {
        toast({ title: 'Error', description: 'Could not fetch results for this run.', variant: 'destructive' });
      } else {
        setResults(resultData);
      }

      // Config row (assumptions sheet in exports + the re-run link); optional
      if (runData?.run_config_id) {
        const { data: cfgData } = await supabase
          .from('epe_run_configs')
          .select('*')
          .eq('id', runData.run_config_id)
          .maybeSingle();
        if (cfgData) setRunConfig(cfgData);
      }
      setLoading(false);
    };

    fetchResults();
  }, [runId, toast, navigate]);

  // -------------------------------------------------------------------------
  // Exports (v3.4): CSV / XLSX / branded PDF of the run
  // -------------------------------------------------------------------------
  const exportBaseName = () => {
    const run = (runDetails?.run_name || 'run').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    return `pe_studio_${run}`;
  };

  // Wave D (audit 4.9): assumptions render with report-grade labels from the
  // shared epeConfigLabels map instead of raw column names.
  const configRowsForExport = () => {
    if (!runConfig) return [];
    return configSectionsForReport(runConfig).flatMap((section) =>
      section.rows.map((r) => [section.title, r.label, r.value, r.unit || '']));
  };

  const handleExportCsv = () => {
    const cf = results?.cash_flow_data || [];
    const cols = cashFlowColumns(results?.kpis?.fiscal_regime === 'PIA');
    const esc = (v) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      cols.map((c) => esc(c.label)).join(','),
      ...cf.map((row) => cols.map((c) => esc(row[c.key] ?? '')).join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportBaseName()}_cash_flow.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportXlsx = () => {
    try {
      const kpis = results?.kpis || {};
      const cf = results?.cash_flow_data || [];
      const cols = cashFlowColumns(kpis.fiscal_regime === 'PIA');
      const wb = XLSX.utils.book_new();

      const kpiAoa = [
        ['Petroleum Economics Studio', ''],
        ['Run', runDetails?.run_name || ''],
        ['Case', runDetails?.epe_cases?.case_name || ''],
        [],
        ['Metric', 'Value'],
        ...KPI_EXPORT_ROWS
          .filter(([k]) => kpis[k] !== undefined && kpis[k] !== null)
          .map(([k, label]) => [label, kpis[k]]),
      ];
      const wsKpi = XLSX.utils.aoa_to_sheet(kpiAoa);
      wsKpi['!cols'] = [{ wch: 34 }, { wch: 22 }];
      XLSX.utils.book_append_sheet(wb, wsKpi, 'KPIs');

      const cfAoa = [
        cols.map((c) => c.label),
        ...cf.map((row) => cols.map((c) => row[c.key] ?? '')),
      ];
      const wsCf = XLSX.utils.aoa_to_sheet(cfAoa);
      wsCf['!cols'] = cols.map(() => ({ wch: 16 }));
      XLSX.utils.book_append_sheet(wb, wsCf, 'Cash Flow');

      const cfgRows = configRowsForExport();
      if (cfgRows.length > 0) {
        const wsCfg = XLSX.utils.aoa_to_sheet([['Section', 'Assumption', 'Value', 'Unit'], ...cfgRows]);
        wsCfg['!cols'] = [{ wch: 16 }, { wch: 38 }, { wch: 28 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, wsCfg, 'Assumptions');
      }

      XLSX.writeFile(wb, `${exportBaseName()}.xlsx`);
    } catch (err) {
      console.error('XLSX export error:', err);
      toast({ variant: 'destructive', title: 'Export failed', description: err?.message || 'Could not generate the workbook.' });
    }
  };

  // Wave D (audit 4.1): submission-grade PDF. Page 1 is the economics
  // one-pager (title block, assumptions, full KPI panel); then a landscape
  // regime-aware annual cash flow table with every fiscal line item; then
  // one landscape page per branded chart panel currently on screen,
  // captured with html2canvas so the watermark rides along.
  const handleExportPdf = async () => {
    try {
      const kpis = results?.kpis || {};
      const cf = results?.cash_flow_data || [];
      const isPIA = kpis.fiscal_regime === 'PIA';
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 14;
      const logo = await loadPetrolordLogo();
      let y = drawBrandHeader(doc, {
        logo, margin, pageWidth,
        appTitle: 'Petroleum Economics Studio',
        subtitle: `${runDetails?.epe_cases?.case_name || ''}`.trim() || 'Economic run report',
        rightLines: [runDetails?.run_name || ''],
      }) + 6;

      // ---- Title block info line ----
      const frameworkLabel = kpis.fiscal_framework === 'nta_2025' ? 'NTA 2025'
        : kpis.fiscal_framework === 'pia_only' ? 'PIA 2021' : null;
      const infoBits = [
        `Regime: ${kpis.fiscal_regime || runConfig?.fiscal_regime || 'n/a'}`,
        frameworkLabel ? `Framework: ${frameworkLabel}` : null,
        kpis.working_interest_pct != null ? `Working interest: ${Number(kpis.working_interest_pct).toFixed(0)}%` : null,
        `Generated: ${new Date().toISOString().slice(0, 10)}`,
        kpis.engine_version ? `Engine v${kpis.engine_version}` : null,
      ].filter(Boolean);
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(infoBits.join('   |   '), margin, y);
      y += 7;

      // ---- Key metrics: paired two-per-row so the one-pager stays one page ----
      const money = (v) => (v == null ? null : `$${fmtCompact(v)}`);
      const pct = (v, d = 1) => (v == null ? null : `${Number(v).toFixed(d)}%`);
      const yrs = (v) => (v == null ? null : `${Number(v).toFixed(2)} yrs`);
      const vol = (v, unit) => (v == null || v === 0 ? null
        : `${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })} ${unit}`);
      const conventionNote = kpis.discounting_convention === 'mid_year' ? ', mid-year' : '';
      const kpiPairs = [
        [`NPV @ ${kpis.discount_rate_applied_pct != null ? Number(kpis.discount_rate_applied_pct).toFixed(1) : '10'}% (${kpis.pv_basis || 'real'}${conventionNote})`, money(kpis.npv)],
        ['IRR', pct(kpis.irr, 2)],
        ['Payback', kpis.payback ?? null],
        ['Discounted payback', yrs(kpis.discounted_payback_years)],
        ['Breakeven oil price', kpis.breakeven_oil_price_usd_bbl != null ? `$${Number(kpis.breakeven_oil_price_usd_bbl).toFixed(1)}/bbl` : null],
        ['DPI (NPV / PV capex)', kpis.dpi != null ? Number(kpis.dpi).toFixed(2) : null],
        ['Government take', pct(kpis.government_take_pct)],
        ['Government take (discounted)', pct(kpis.government_take_pct_discounted)],
        ['Unit technical cost', kpis.unit_technical_cost_usd_per_boe != null ? `$${Number(kpis.unit_technical_cost_usd_per_boe).toFixed(2)}/boe` : null],
        ['OPEX per boe', kpis.opex_usd_per_boe != null ? `$${Number(kpis.opex_usd_per_boe).toFixed(2)}/boe` : null],
        ['Total revenue', money(kpis.total_revenue)],
        ['Total CAPEX', money(kpis.total_capex)],
        ['Total OPEX', money(kpis.total_opex)],
        ['Total tax', money(kpis.total_tax)],
        ['Total oil', vol(kpis.total_oil_bbl, 'bbl')],
        ['Total gas', vol(kpis.total_gas_mscf, 'Mscf')],
        ['Total condensate', vol(kpis.total_condensate_bbl, 'bbl')],
        ['Total BOE', vol(kpis.total_boe, 'boe')],
        ['Abandonment', kpis.total_abandonment_cost != null ? `${money(kpis.total_abandonment_cost)} in ${kpis.abandonment_year}` : null],
        ['Economic limit year', kpis.economic_limit_year != null ? String(kpis.economic_limit_year) : null],
        ['Sunk (pre-valuation) NCF', kpis.sunk_net_cash_flow != null ? money(kpis.sunk_net_cash_flow) : null],
      ].filter(([, v]) => v != null);
      const kpiBody = [];
      for (let i = 0; i < kpiPairs.length; i += 2) {
        const a = kpiPairs[i];
        const b = kpiPairs[i + 1] || ['', ''];
        kpiBody.push([a[0], a[1], b[0], b[1]]);
      }

      doc.setTextColor(15, 23, 42);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Key metrics', margin, y);
      y += 3;
      doc.autoTable({
        startY: y,
        head: [['Metric', 'Value', 'Metric', 'Value']],
        body: kpiBody,
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42], fontSize: 7.5 },
        styles: { fontSize: 7.5, cellPadding: 1.4 },
        columnStyles: { 1: { fontStyle: 'bold' }, 3: { fontStyle: 'bold' } },
        margin: { left: margin, right: margin },
      });
      y = doc.lastAutoTable.finalY + 8;

      // ---- Assumptions from the shared label map ----
      const sections = configSectionsForReport(runConfig);
      if (sections.length > 0) {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text('Assumptions', margin, y);
        y += 3;
        const cfgBody = sections.flatMap((section) =>
          section.rows.map((r, i) => [
            i === 0 ? section.title : '',
            r.label,
            r.unit && r.unit !== 'table' ? `${r.value} ${r.unit}` : r.value,
          ]));
        doc.autoTable({
          startY: y,
          head: [['Section', 'Assumption', 'Value']],
          body: cfgBody,
          theme: 'striped',
          headStyles: { fillColor: [15, 23, 42], fontSize: 7 },
          styles: { fontSize: 6.8, cellPadding: 1.1 },
          columnStyles: { 0: { fontStyle: 'bold', cellWidth: 28 }, 1: { cellWidth: 62 } },
          margin: { left: margin, right: margin },
        });
      }

      // ---- Landscape: full regime-aware annual cash flow ----
      doc.addPage('a4', 'landscape');
      const lsWidth = doc.internal.pageSize.getWidth();
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(`Annual cash flow${isPIA ? ' (PIA 2021)' : ''}`, margin, margin + 2);
      const sum = (get) => cf.reduce((s, r) => s + (get(r) || 0), 0);
      let head; let body; let foot;
      if (isPIA) {
        head = [['Year', 'Oil (bbl)', 'Gross Rev', 'Royalty', 'HCDT', 'NDDC', 'Prod. Allow.', 'HCT', 'CIT', 'TET / Levy', 'OPEX', 'CAPEX', 'Net CF', 'Cum. NCF']];
        body = cf.map((r) => [
          r.year,
          (r.oil_bbl || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }),
          fmtCompact(r.gross_revenue ?? r.revenue ?? 0),
          fmtCompact(r.royalty || 0),
          fmtCompact(r.hcdt || 0),
          fmtCompact(r.nddc || 0),
          fmtCompact(r.production_allowance || 0),
          fmtCompact(r.hct_tax || 0),
          fmtCompact(r.cit_tax || 0),
          fmtCompact((r.tet_tax || 0) + (r.dev_levy_tax || 0)),
          fmtCompact(r.opex || 0),
          fmtCompact(r.capex || 0),
          fmtCompact(r.net_cash_flow ?? r.netCashFlow ?? 0),
          fmtCompact(r.cumulative_nominal ?? 0),
        ]);
        foot = [['Total', '', fmtCompact(sum((r) => r.gross_revenue ?? r.revenue)), fmtCompact(sum((r) => r.royalty)),
          fmtCompact(sum((r) => r.hcdt)), fmtCompact(sum((r) => r.nddc)), fmtCompact(sum((r) => r.production_allowance)),
          fmtCompact(sum((r) => r.hct_tax)), fmtCompact(sum((r) => r.cit_tax)),
          fmtCompact(sum((r) => (r.tet_tax || 0) + (r.dev_levy_tax || 0))),
          fmtCompact(sum((r) => r.opex)), fmtCompact(sum((r) => r.capex)),
          fmtCompact(sum((r) => r.net_cash_flow ?? r.netCashFlow)), '']];
      } else {
        head = [['Year', 'Oil (bbl)', 'Gross Rev', 'Royalty', 'Taxable Income', 'Tax', 'OPEX', 'CAPEX', 'Net CF', 'Cum. NCF']];
        body = cf.map((r) => [
          r.year,
          (r.oil_bbl || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }),
          fmtCompact(r.gross_revenue ?? r.revenue ?? 0),
          fmtCompact(r.royalty || 0),
          fmtCompact(r.taxable_income || 0),
          fmtCompact(r.tax || 0),
          fmtCompact(r.opex || 0),
          fmtCompact(r.capex || 0),
          fmtCompact(r.net_cash_flow ?? r.netCashFlow ?? 0),
          fmtCompact(r.cumulative_nominal ?? 0),
        ]);
        foot = [['Total', '', fmtCompact(sum((r) => r.gross_revenue ?? r.revenue)), fmtCompact(sum((r) => r.royalty)),
          '', fmtCompact(sum((r) => r.tax)), fmtCompact(sum((r) => r.opex)), fmtCompact(sum((r) => r.capex)),
          fmtCompact(sum((r) => r.net_cash_flow ?? r.netCashFlow)), '']];
      }
      doc.autoTable({
        startY: margin + 6,
        head,
        body,
        foot,
        theme: 'grid',
        headStyles: { fillColor: [15, 23, 42], fontSize: 6.8 },
        footStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 6.8 },
        styles: { fontSize: 6.8, cellPadding: 1.2, halign: 'right' },
        columnStyles: { 0: { halign: 'left' } },
        margin: { left: margin, right: margin },
      });

      // ---- Chart pages: capture the branded panels currently on screen ----
      const captureIds = [
        'epe-pdf-capture-profile',
        'epe-pdf-capture-waterfall',
        'epe-pdf-capture-annual',
        'epe-pdf-capture-npvprofile',
      ];
      let chartsEmbedded = 0;
      for (const id of captureIds) {
        const el = document.getElementById(id);
        if (!el) continue;
        try {
          const canvas = await html2canvas(el, { backgroundColor: '#ffffff', scale: 2, logging: false });
          doc.addPage('a4', 'landscape');
          const pw = doc.internal.pageSize.getWidth();
          const ph = doc.internal.pageSize.getHeight();
          const maxW = pw - margin * 2;
          const maxH = ph - margin * 2 - 6;
          const scale = Math.min(maxW / canvas.width, maxH / canvas.height);
          doc.addImage(canvas.toDataURL('image/png'), 'PNG', margin, margin, canvas.width * scale, canvas.height * scale);
          chartsEmbedded += 1;
        } catch (capErr) {
          console.warn(`PDF chart capture skipped for ${id}:`, capErr);
        }
      }
      if (chartsEmbedded === 0) {
        doc.setPage(doc.internal.getNumberOfPages());
        const ph = doc.internal.pageSize.getHeight();
        doc.setFontSize(7.5);
        doc.setTextColor(120);
        doc.text(
          'Charts are captured from the open tab. Open the Cash Flow Profile or Waterfall tab before exporting, or use each chart\'s PNG download button.',
          margin, ph - 14);
      }

      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        const pw = doc.internal.pageSize.getWidth();
        const ph = doc.internal.pageSize.getHeight();
        doc.setFontSize(8);
        doc.setTextColor(120);
        doc.text(`Page ${i} of ${pageCount}`, pw - margin, ph - 8, { align: 'right' });
      }
      doc.save(`${exportBaseName()}.pdf`);
    } catch (err) {
      console.error('PDF export error:', err);
      toast({ variant: 'destructive', title: 'Export failed', description: err?.message || 'Could not generate the PDF.' });
    }
  };

  const formatCurrency = (value) => {
    if (typeof value !== 'number') return 'N/A';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact' }).format(value);
  };

  // Recharts-shaped chart data: array of {year, netCashFlow, revenue, capex, opex}
  const chartData = (results?.cash_flow_data || []).map(d => ({
    year: d.year,
    netCashFlow: d.netCashFlow ?? d.net_cash_flow ?? 0,
    revenue: d.revenue ?? d.gross_revenue ?? 0,
    capex: d.capex ?? 0,
    opex: d.opex ?? 0,
  }));

  // Tooltip formatter — short currency display (USD millions)
  const fmtMillions = (n) => {
    if (n == null || isNaN(n)) return '—';
    const m = n / 1_000_000;
    return `$${m.toFixed(1)}M`;
  };
if (loading) {
    return <div className="p-8 text-white">Loading results...</div>;
  }

  return (
    <>
      <Helmet><title>Results: {runDetails?.run_name} - Petroleum Economics Studio</title></Helmet>
      <div className="p-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-8">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <Link to={`/dashboard/apps/economics/epe/cases/${runDetails?.case_id}`}>
              <Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Case</Button>
            </Link>
            {results && (
              <div className="flex items-center gap-2 flex-wrap">
                {runDetails?.case_id && runDetails?.run_config_id && (
                  <Link to={`/dashboard/apps/economics/epe/cases/${runDetails.case_id}/run?fromConfig=${runDetails.run_config_id}`}>
                    <Button variant="outline" size="sm">
                      <Pencil className="mr-2 h-3.5 w-3.5" /> Re-run with edits
                    </Button>
                  </Link>
                )}
                <Button variant="outline" size="sm" onClick={handleExportCsv}>
                  <Download className="mr-2 h-3.5 w-3.5" /> CSV
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportXlsx}>
                  <Download className="mr-2 h-3.5 w-3.5" /> Excel
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportPdf}>
                  <FileText className="mr-2 h-3.5 w-3.5" /> PDF report
                </Button>
              </div>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <div className="bg-gradient-to-r from-green-500 to-cyan-500 p-3 rounded-xl"><BarChart className="w-8 h-8 text-white" /></div>
            <div>
              <h1 className="text-4xl font-bold text-white">{runDetails?.run_name}</h1>
              <p className="text-lime-200 text-lg">Results for case: {runDetails?.epe_cases?.case_name}</p>
              {results?.kpis?.fiscal_regime === 'PIA' && results?.kpis?.fiscal_framework && (
                <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded ${
                  results.kpis.fiscal_framework === 'nta_2025'
                    ? 'bg-amber-900/40 text-amber-200 border border-amber-500/30'
                    : 'bg-cyan-900/40 text-cyan-200 border border-cyan-500/30'
                }`}>
                  {results.kpis.fiscal_framework === 'nta_2025' ? 'Computed under NTA 2025' : 'Computed under PIA 2021 (pre-NTA)'}
                </span>
              )}
            </div>
          </div>
        </motion.div>

        {results ? (
          <div className="space-y-8">
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <KpiCard
                  icon={DollarSign}
                  title={`NPV @ ${results.kpis.discount_rate_applied_pct !== undefined ? results.kpis.discount_rate_applied_pct.toFixed(1) : '10'}% (${results.kpis.pv_basis || 'real'})`}
                  value={formatCurrency(results.kpis.npv)}
                  color="from-green-500 to-lime-500"
                />
                <KpiCard icon={TrendingUp} title="IRR" value={results.kpis.irr ? `${results.kpis.irr.toFixed(2)}%` : 'N/A'} color="from-blue-500 to-cyan-500" />
                <KpiCard icon={Clock} title="Payback" value={results.kpis.payback} color="from-orange-500 to-amber-500" />
                <KpiCard
                  icon={Receipt}
                  title="Total Revenue"
                  value={results.kpis.total_revenue !== undefined ? formatCurrency(results.kpis.total_revenue) : '—'}
                  color="from-cyan-500 to-blue-500"
                />
                <KpiCard
                  icon={Wallet}
                  title="Total CAPEX"
                  value={results.kpis.total_capex !== undefined ? formatCurrency(results.kpis.total_capex) : '—'}
                  color="from-purple-500 to-pink-500"
                />
                <KpiCard
                  icon={Landmark}
                  title="Total Tax"
                  value={results.kpis.total_tax !== undefined ? formatCurrency(results.kpis.total_tax) : '—'}
                  color="from-red-500 to-orange-500"
                />
              </div>

              {/* v3.4 decision metrics (older runs predate these KPIs) */}
              {(results.kpis.government_take_pct != null || results.kpis.unit_technical_cost_usd_per_boe != null
                || results.kpis.breakeven_oil_price_usd_bbl != null || results.kpis.dpi != null) && (
                <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  {[
                    ['Breakeven oil price', results.kpis.breakeven_oil_price_usd_bbl != null
                      ? `$${Number(results.kpis.breakeven_oil_price_usd_bbl).toFixed(1)}/bbl` : null],
                    ['Government take', results.kpis.government_take_pct != null
                      ? `${Number(results.kpis.government_take_pct).toFixed(1)}%` : null],
                    ['Govt take (disc.)', results.kpis.government_take_pct_discounted != null
                      ? `${Number(results.kpis.government_take_pct_discounted).toFixed(1)}%` : null],
                    ['Unit technical cost', results.kpis.unit_technical_cost_usd_per_boe != null
                      ? `$${Number(results.kpis.unit_technical_cost_usd_per_boe).toFixed(2)}/boe` : null],
                    ['OPEX per boe', results.kpis.opex_usd_per_boe != null
                      ? `$${Number(results.kpis.opex_usd_per_boe).toFixed(2)}/boe` : null],
                    ['DPI', results.kpis.dpi != null ? Number(results.kpis.dpi).toFixed(2) : null],
                    ['Discounted payback', results.kpis.discounted_payback_years != null
                      ? `${Number(results.kpis.discounted_payback_years).toFixed(2)} yrs` : null],
                  ].filter(([, v]) => v !== null).map(([label, value]) => (
                    <div key={label} className="bg-white/5 rounded-lg px-3 py-2">
                      <p className="text-xs text-slate-400">{label}</p>
                      <p className="text-base font-semibold text-white">{value}</p>
                    </div>
                  ))}
                </div>
              )}

              {(results.kpis.economic_limit_year != null || results.kpis.total_abandonment_cost != null) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {results.kpis.economic_limit_year != null && (
                    <span className="text-xs px-2 py-0.5 rounded bg-amber-900/40 text-amber-200 border border-amber-500/30">
                      Economic limit applied: field life ends {results.kpis.economic_limit_year}
                      {results.kpis.years_trimmed_by_economic_limit
                        ? ` (${results.kpis.years_trimmed_by_economic_limit} uneconomic year${results.kpis.years_trimmed_by_economic_limit > 1 ? 's' : ''} trimmed)` : ''}
                    </span>
                  )}
                  {results.kpis.total_abandonment_cost != null && (
                    <span className="text-xs px-2 py-0.5 rounded bg-cyan-900/40 text-cyan-200 border border-cyan-500/30">
                      Abandonment {formatCurrency(results.kpis.total_abandonment_cost)} in {results.kpis.abandonment_year} (post-tax)
                    </span>
                  )}
                </div>
              )}

              <NpvProfileChart kpis={results.kpis} />
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }} className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
                <h2 className="text-2xl font-bold text-white">Cash Flow Analysis</h2>
                <TabBar
                  active={activeTab}
                  onChange={setActiveTab}
                  tabs={[
                    { key: 'annual',    label: 'Annual Cash Flow' },
                    { key: 'profile',   label: 'Cash Flow Profile' },
                    { key: 'waterfall',   label: 'Waterfall' },
                    { key: 'sensitivity', label: 'Sensitivity (Tornado)' },
                    { key: 'risk',        label: 'Risk (Monte Carlo)' },
                    { key: 'detail',      label: 'Year-by-Year Detail' },
                  ]}
                />
              </div>

              {activeTab === 'annual' && (
                <div id="epe-pdf-capture-annual" style={{ background: CHART_COLORS.background, borderRadius: 8, padding: 8 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: CHART_COLORS.axisLabel, margin: '0 0 8px 4px' }}>Annual Cash Flow</h3>
                  <p style={{ fontSize: 11, color: CHART_COLORS.axisText, margin: '0 0 4px 4px' }}>
                    Click a legend entry to show or hide its series.
                  </p>
                  <ChartFrame height={330} exportFilename="pe-studio-annual-cash-flow">
                    <ComposedChart data={chartData} margin={CHART_MARGINS.withLegend}>
                      <CartesianGrid {...GRID_STYLE} />
                      <XAxis
                        dataKey="year"
                        tick={{ fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText }}
                        stroke={CHART_COLORS.axisLine}
                      />
                      <YAxis
                        tick={{ fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText }}
                        stroke={CHART_COLORS.axisLine}
                        tickFormatter={fmtMillions}
                      />
                      <RTooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(value) => fmtMillions(value)}
                      />
                      <RLegend
                        wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText, paddingTop: 8, cursor: 'pointer' }}
                        onClick={(e) => {
                          const key = e?.dataKey;
                          if (key) setHiddenSeries((prev) => ({ ...prev, [key]: !prev[key] }));
                        }}
                      />
                      <Bar dataKey="netCashFlow" name="Net Cash Flow" fill="#059669" hide={hiddenSeries.netCashFlow} />
                      <Bar dataKey="revenue" name="Revenue" fill="#2563eb" hide={hiddenSeries.revenue} />
                      <Bar dataKey="capex" name="CAPEX" fill="#dc2626" hide={hiddenSeries.capex} />
                      <Bar dataKey="opex" name="OPEX" fill="#d97706" hide={hiddenSeries.opex} />
                    </ComposedChart>
                  </ChartFrame>
                </div>
              )}

              {activeTab === 'profile' && (
                <CashFlowProfile results={results} />
              )}

              {activeTab === 'waterfall' && (
                <CashFlowWaterfall results={results} />
              )}

              {activeTab === 'sensitivity' && (
                <SensitivityPanel
                  runId={runId}
                  runConfigId={runDetails?.run_config_id}
                  userId={runDetails?.user_id}
                />
              )}

              {activeTab === 'risk' && (
                <EpeMonteCarloPanel runConfigId={runDetails?.run_config_id} />
              )}

              {activeTab === 'detail' && (
                <YearByYearTable results={results} />
              )}
            </motion.div>
          </div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }} className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl p-6">
            <div className="text-center py-16">
              <h3 className="text-xl font-semibold text-white">No Results Found</h3>
              <p className="text-lime-300 mt-2">Could not load the results for this economic run.</p>
            </div>
          </motion.div>
        )}
      </div>
    </>
  );
};

export default EpeResultsViewer;