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
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { useFluidUnits } from '@/components/fluidstudio/FluidUnitsContext';

const C = { hydrate: '#2563eb', profile: '#d97706', risk: '#dc2626', wat: '#7c3aed' };
const fmt = (v, d = 1) => (v == null || !Number.isFinite(v) ? EMPTY_VALUE : Number(v).toFixed(d));

const Tile = ({ label, value, sub, icon: Icon, tone = 'text-pl-text' }) => (
  <div className="rounded-lg border border-pl-border bg-pl-sunken px-3 py-2">
    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-pl-muted">
      {Icon && <Icon className="w-3 h-3" />}{label}
    </div>
    <div className={`text-base font-bold mt-0.5 ${tone}`}>{value}</div>
    {sub && <div className="text-[10px] text-pl-muted mt-0.5 lowercase">{sub}</div>}
  </div>
);

/**
 * Flow-assurance screening: hydrate formation envelope (Motiee) vs the flowline
 * P-T profile, with crossing points highlighted, plus WAT/AOP status tiles. All
 * screening caveats are shown locally (they don't clutter the global banner).
 */
const FlowAssuranceCard = ({ fa }) => {
  const u = useFluidUnits();
  if (!fa) return null;
  if (!fa.hydrate_curve?.length) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-pl-muted">
          Provide a valid gas gravity and a P-T profile (or WAT/wax data) to run hydrate screening.
        </CardContent>
      </Card>
    );
  }

  const crosses = fa.hydrate_risk.profile_crosses;
  const T = u.label('temperature');
  const P = u.label('pressure');
  const watLabel = fa.wat != null ? `${fmt(u.show('temperature', fa.wat), 1)} ${T}` : EMPTY_VALUE;
  const watSub = fa.wat_basis ? fa.wat_basis.replace(/_/g, ' ') : 'needs a measured value or a wax content';
  // the chart reads the display units
  const curve = fa.hydrate_curve.map((p) => ({ temp: u.show('temperature', p.temp), pressure: u.show('pressure', p.pressure) }));
  const profile = fa.pt_profile.map((p) => ({ ...p, temp: u.show('temperature', p.temp), pressure: u.show('pressure', p.pressure) }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-pl-text flex items-center"><Snowflake className="mr-2 text-pl-muted w-5 h-5" /> Flow assurance screening</CardTitle>
        <p className="text-xs text-pl-muted">Hydrate formation curve (Motiee 1991) against the flowline pressure and temperature profile. Sweet gas basis; a screening result.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Tile label="Wax Appearance (WAT)" value={watLabel} sub={watSub} icon={Thermometer} />
          <Tile label="Asphaltene Onset (AOP)" value={EMPTY_VALUE} sub="needs SARA data" icon={AlertTriangle} />
          <Tile label="Min profile temp" value={fa.hydrate_risk.min_temp != null ? `${fmt(u.show('temperature', fa.hydrate_risk.min_temp))} ${T}` : EMPTY_VALUE} icon={Thermometer} />
          <Tile label="Max subcooling" value={`${fmt(u.showDelta('temperature', fa.hydrate_risk.max_subcooling))} ${T}`} icon={Snowflake} tone={fa.hydrate_risk.max_subcooling > 0 ? 'text-pl-danger-text' : 'text-pl-text'} />
        </div>

        <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${crosses ? 'bg-pl-danger-bg border-pl-danger/40 text-pl-danger-text' : 'bg-pl-success-bg border-pl-success/40 text-pl-success-text'}`}>
          {crosses ? <Route className="w-6 h-6 shrink-0" /> : <ShieldCheck className="w-6 h-6 shrink-0" />}
          <div className="text-sm font-semibold">
            {crosses
              ? `Hydrate risk: profile enters the hydrate region near ${fmt(u.show('pressure', fa.hydrate_risk.first_crossing.pressure), 0)} ${P} (${fmt(u.show('temperature', fa.hydrate_risk.first_crossing.temp), 0)} ${T}).`
              : 'No hydrate crossing; the flowline profile stays warmer than the hydrate curve.'}
          </div>
        </div>

        <ChartFrame height={288}>
          <ScatterChart margin={{ top: 8, right: 20, bottom: 16, left: 4 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis type="number" dataKey="temp" name="Temperature" domain={['dataMin - 5', 'dataMax + 5']} stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} label={{ value: u.head('Temperature', 'temperature'), fill: CHART_COLORS.axisLabel, fontSize: 11, position: 'insideBottom', dy: 12 }} />
            <YAxis type="number" dataKey="pressure" name="Pressure" domain={['dataMin', 'dataMax']} stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} width={62} tickFormatter={(v) => Math.round(v).toLocaleString()} label={{ value: u.head('Pressure', 'pressure'), angle: -90, fill: CHART_COLORS.axisLabel, fontSize: 11, position: 'insideLeft', dy: 30 }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: CHART_COLORS.tooltipText }} itemStyle={{ color: CHART_COLORS.tooltipText }} cursor={{ strokeDasharray: '3 3' }} formatter={(v, n) => [Math.round(v).toLocaleString(), n]} />
            <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
            {fa.wat != null && (
              <ReferenceLine x={Number(u.show('temperature', fa.wat).toFixed(0))} stroke={C.wat} strokeDasharray="4 4" label={{ value: 'WAT', fill: C.wat, fontSize: 11, position: 'top' }} />
            )}
            <Scatter name="Hydrate curve (Motiee)" data={curve} isAnimationActive={false} line={{ stroke: C.hydrate, strokeWidth: 2 }} fill={C.hydrate} shape="circle" />
            <Scatter name="Flowline P-T" data={profile} isAnimationActive={false} line={{ stroke: C.profile, strokeWidth: 2 }} fill={C.profile}>
              {profile.map((pt, i) => (
                <Cell key={i} fill={pt.at_risk ? C.risk : C.profile} />
              ))}
            </Scatter>
          </ScatterChart>
        </ChartFrame>

        <p className="text-xs text-pl-muted">
          Points left of the hydrate curve (colder than the hydrate temperature at their pressure) are inside the hydrate region and shown in red.
          The Motiee correlation holds for gas gravity 0.55 to 1.0, within about {fmt(u.showDelta('temperature', 5), 0)} to {fmt(u.showDelta('temperature', 8), 0)} {T}, with no correction for hydrogen sulphide, carbon dioxide, inhibitor or salt.
          Asphaltene onset needs composition and SARA data, so it is left blank. The wax appearance temperature is shown only when it is measured or screened from a wax content; it is never derived from the API gravity.
        </p>
      </CardContent>
    </Card>
  );
};

export default FlowAssuranceCard;
