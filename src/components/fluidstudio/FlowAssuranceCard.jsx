import React from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Legend, Cell,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ChartFrame from '@/components/charts/ChartFrame';
import { Snowflake, AlertTriangle, Thermometer, Route, ShieldCheck } from 'lucide-react';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE,
} from '@/utils/chartTheme';

const C = { hydrate: '#2563eb', profile: '#d97706', risk: '#dc2626', wat: '#7c3aed' };
const fmt = (v, d = 1) => (v == null || !Number.isFinite(v) ? '—' : Number(v).toFixed(d));

const Tile = ({ label, value, sub, icon: Icon, tone = 'text-white' }) => (
  <div className="rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2">
    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-500">
      {Icon && <Icon className="w-3 h-3" />}{label}
    </div>
    <div className={`text-base font-bold mt-0.5 ${tone}`}>{value}</div>
    {sub && <div className="text-[10px] text-slate-500 mt-0.5 lowercase">{sub}</div>}
  </div>
);

/**
 * Flow-assurance screening: hydrate formation envelope (Motiee) vs the flowline
 * P-T profile, with crossing points highlighted, plus WAT/AOP status tiles. All
 * screening caveats are shown locally (they don't clutter the global banner).
 */
const FlowAssuranceCard = ({ fa }) => {
  if (!fa) return null;
  if (!fa.hydrate_curve?.length) {
    return (
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="p-6 text-sm text-slate-400">
          Provide a valid gas gravity and a P-T profile (or WAT/wax data) to run hydrate screening.
        </CardContent>
      </Card>
    );
  }

  const crosses = fa.hydrate_risk.profile_crosses;
  const watLabel = fa.wat != null ? `${fmt(fa.wat, 1)} °F` : 'N/A';
  const watSub = fa.wat_basis ? fa.wat_basis.replace(/_/g, ' ') : 'not from black-oil';

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-white flex items-center"><Snowflake className="mr-2 text-cyan-300 w-5 h-5" /> Flow assurance screening</CardTitle>
        <p className="text-xs text-slate-400">Hydrate formation envelope (Motiee 1991) vs the flowline P-T profile. Sweet-gas basis; indicative only.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Tile label="Wax Appearance (WAT)" value={watLabel} sub={watSub} icon={Thermometer} />
          <Tile label="Asphaltene Onset (AOP)" value="N/A" sub="needs SARA data" icon={AlertTriangle} />
          <Tile label="Min profile temp" value={fa.hydrate_risk.min_temp != null ? `${fmt(fa.hydrate_risk.min_temp)} °F` : '—'} icon={Thermometer} />
          <Tile label="Max subcooling" value={`${fmt(fa.hydrate_risk.max_subcooling)} °F`} icon={Snowflake} tone={fa.hydrate_risk.max_subcooling > 0 ? 'text-red-300' : 'text-white'} />
        </div>

        <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${crosses ? 'bg-red-900/30 border-red-700 text-red-300' : 'bg-emerald-900/30 border-emerald-700 text-emerald-300'}`}>
          {crosses ? <Route className="w-6 h-6 shrink-0" /> : <ShieldCheck className="w-6 h-6 shrink-0" />}
          <div className="text-sm font-semibold">
            {crosses
              ? `Hydrate risk — profile enters the hydrate region near ${fmt(fa.hydrate_risk.first_crossing.pressure, 0)} psia (${fmt(fa.hydrate_risk.first_crossing.temp, 0)} °F).`
              : 'No hydrate crossing — the flowline profile stays warmer than the hydrate curve.'}
          </div>
        </div>

        <ChartFrame height={288}>
          <ScatterChart margin={{ top: 8, right: 20, bottom: 16, left: 4 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis type="number" dataKey="temp" name="Temperature" domain={['dataMin - 5', 'dataMax + 5']} stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} label={{ value: 'Temperature (°F)', fill: CHART_COLORS.axisLabel, fontSize: 11, position: 'insideBottom', dy: 12 }} />
            <YAxis type="number" dataKey="pressure" name="Pressure" domain={['dataMin', 'dataMax']} stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} width={62} tickFormatter={(v) => Math.round(v).toLocaleString()} label={{ value: 'Pressure (psia)', angle: -90, fill: CHART_COLORS.axisLabel, fontSize: 11, position: 'insideLeft', dy: 30 }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: CHART_COLORS.tooltipText }} itemStyle={{ color: CHART_COLORS.tooltipText }} cursor={{ strokeDasharray: '3 3' }} formatter={(v, n) => [Math.round(v).toLocaleString(), n]} />
            <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
            {fa.wat != null && (
              <ReferenceLine x={Number(fa.wat.toFixed(0))} stroke={C.wat} strokeDasharray="4 4" label={{ value: 'WAT', fill: C.wat, fontSize: 11, position: 'top' }} />
            )}
            <Scatter name="Hydrate curve (Motiee)" data={fa.hydrate_curve} line={{ stroke: C.hydrate, strokeWidth: 2 }} fill={C.hydrate} shape="circle" />
            <Scatter name="Flowline P-T" data={fa.pt_profile} line={{ stroke: C.profile, strokeWidth: 2 }} fill={C.profile}>
              {fa.pt_profile.map((pt, i) => (
                <Cell key={i} fill={pt.at_risk ? C.risk : C.profile} />
              ))}
            </Scatter>
          </ScatterChart>
        </ChartFrame>

        <p className="text-xs text-slate-500">
          Points left of the hydrate curve (colder than T<sub>hyd</sub> at their pressure) are inside the hydrate region and shown in red.
          Motiee validity ~0.55–1.0 gas SG, ±5–8 °F, no H₂S/CO₂/inhibitor/salt correction. AOP needs SARA/compositional data (not
          computable here); WAT is populated only from a measured value or a labeled wax-content screening estimate — never fabricated from API.
        </p>
      </CardContent>
    </Card>
  );
};

export default FlowAssuranceCard;
