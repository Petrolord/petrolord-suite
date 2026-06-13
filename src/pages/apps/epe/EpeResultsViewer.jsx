import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { BarChart, ArrowLeft, DollarSign, TrendingUp, Clock, FileText, Receipt, Wallet, Landmark } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import {
  ResponsiveContainer, ComposedChart, Bar, Area, Line, XAxis, YAxis,
  CartesianGrid, Tooltip as RTooltip, Legend as RLegend, ReferenceLine,
  Cell, LabelList, Label
} from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
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
    <div style={{ position: 'relative', width: '100%', height: 480, background: CHART_COLORS.background, borderRadius: 8, padding: 12 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: CHART_COLORS.axisLabel, margin: '0 0 8px 4px' }}>
        Cash Flow Profile {isPIA ? '(PIA 2021)' : ''}
      </h3>
      <ResponsiveContainer width="100%" height="92%">
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
      </ResponsiveContainer>
      <ChartLogo />
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

  const row = cf[Math.min(selectedIdx, cf.length - 1)];
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
    <div style={{ position: 'relative', width: '100%', background: CHART_COLORS.background, borderRadius: 8, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: CHART_COLORS.axisLabel, margin: 0 }}>
          Cash Flow Waterfall — Year {row.year} {isPIA ? '(PIA 2021)' : ''}
        </h3>
        <label style={{ fontSize: 12, color: CHART_COLORS.axisText, display: 'flex', alignItems: 'center', gap: 8 }}>
          Year:
          <select
            value={selectedIdx}
            onChange={(e) => setSelectedIdx(Number(e.target.value))}
            style={{
              padding: '4px 8px',
              fontSize: 12,
              borderRadius: 4,
              border: `1px solid ${CHART_COLORS.tooltipBorder}`,
              background: '#ffffff',
              color: CHART_COLORS.axisLabel,
            }}
          >
            {cf.map((r, i) => (
              <option key={r.year} value={i}>{r.year}</option>
            ))}
          </select>
        </label>
      </div>
      <div style={{ width: '100%', height: 440, position: 'relative' }}>
        <ResponsiveContainer width="100%" height="100%">
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
        </ResponsiveContainer>
        <ChartLogo />
      </div>
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
    <div style={{ width: '100%', height: dynamicHeight, position: 'relative' }}>
      <ResponsiveContainer width="100%" height="100%">
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
          <Bar dataKey="deltaLow"  name="-20% variant" fill="#dc2626" />
          <Bar dataKey="deltaHigh" name="+20% variant" fill="#059669" />
          <RLegend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} verticalAlign="top" />
        </ComposedChart>
      </ResponsiveContainer>
      <ChartLogo />
    </div>
  );
};

// SensitivityPanel — orchestrates the run lifecycle:
// idle → invoking → running → complete (or failed)
const SensitivityPanel = ({ runId, runConfigId, userId }) => {
  const [state, setState] = useState('loading');  // 'loading' | 'idle' | 'invoking' | 'running' | 'complete' | 'failed'
  const [sensitivityRun, setSensitivityRun] = useState(null);
  const [results, setResults] = useState([]);
  const [errorMsg, setErrorMsg] = useState(null);

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
          through the engine ~20 times with each variable at ±20% of its current value,
          then plots the NPV change as a tornado chart sorted by impact magnitude.
        </p>
        <p style={{ color: CHART_COLORS.axisText, fontSize: 12, marginBottom: 16 }}>
          Estimated time: 1–5 seconds.
        </p>
        <Button
          onClick={handleRunSensitivity}
          className="bg-gradient-to-r from-green-500 to-cyan-500 text-white hover:opacity-90"
        >
          Run Sensitivity Analysis
        </Button>
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
        <Button
          onClick={handleRunSensitivity}
          className="bg-gradient-to-r from-green-500 to-cyan-500 text-white hover:opacity-90"
        >
          Retry
        </Button>
      </div>
    );
  }

  // state === 'complete'
  const baseNpv = Number(sensitivityRun?.base_npv) || 0;
  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: CHART_COLORS.axisLabel, margin: 0 }}>
          Tornado — NPV Sensitivity (±20%)
        </h3>
        <Button
          onClick={handleRunSensitivity}
          size="sm"
          variant="outline"
          className="text-xs"
        >
          Re-run
        </Button>
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
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('profile');  // 'profile' default per L1b/Q2

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
      setLoading(false);
    };

    fetchResults();
  }, [runId, toast, navigate]);

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
      <Helmet><title>EPE Results: {runDetails?.run_name} - Petrolord</title></Helmet>
      <div className="p-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <Link to={`/dashboard/apps/economics/epe/cases/${runDetails?.case_id}`}>
              <Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Case</Button>
            </Link>
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
                    { key: 'detail',      label: 'Year-by-Year Detail' },
                  ]}
                />
              </div>

              {activeTab === 'annual' && (
              <div className="h-96">
                <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 300, background: CHART_COLORS.background, borderRadius: 8, padding: 8 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: CHART_COLORS.axisLabel, margin: '0 0 8px 4px' }}>Annual Cash Flow</h3>
              <ResponsiveContainer width="100%" height="92%">
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
                  <RLegend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText, paddingTop: 8 }} />
                  <Bar dataKey="netCashFlow" name="Net Cash Flow" fill="#059669" />
                  <Bar dataKey="revenue" name="Revenue" fill="#2563eb" hide />
                  <Bar dataKey="capex" name="CAPEX" fill="#dc2626" hide />
                  <Bar dataKey="opex" name="OPEX" fill="#d97706" hide />
                </ComposedChart>
              </ResponsiveContainer>
              <ChartLogo />
            </div>
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