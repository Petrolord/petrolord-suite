// Profile tab: the line marched along its elevation profile, in the
// physics of the active mode, so the answer is a hydraulic gradient
// you can read rather than one number you have to trust.
import React from 'react';
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useLineSizing } from '@/contexts/LineSizingContext';
import { fmt, Stat, ErrorNote, Field, NumberInput } from './fields';

const SegmentTable = () => {
  const { inputs, setSegment, addSegment, removeSegment } = useLineSizing();
  return (
    <div className="space-y-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
            <th className="py-1.5 pr-2">#</th>
            <th className="py-1.5 pr-2">Length (ft)</th>
            <th className="py-1.5 pr-2">Elevation change (ft)</th>
            <th className="py-1.5" />
          </tr>
        </thead>
        <tbody>
          {inputs.profile.segments.map((seg, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <tr key={i} className="border-b border-slate-800/60">
              <td className="py-1 pr-2 text-slate-500">{i + 1}</td>
              <td className="py-1 pr-2">
                <Input type="number" value={seg.lengthFt} onChange={(e) => setSegment(i, 'lengthFt', e.target.value)} className="h-8 bg-slate-800 border-slate-700" />
              </td>
              <td className="py-1 pr-2">
                <Input type="number" value={seg.elevChangeFt} onChange={(e) => setSegment(i, 'elevChangeFt', e.target.value)} className="h-8 bg-slate-800 border-slate-700" />
              </td>
              <td className="py-1 text-right">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-red-400" onClick={() => removeSegment(i)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Button variant="outline" size="sm" onClick={addSegment}>
        <Plus className="w-3.5 h-3.5 mr-1" /> Add segment
      </Button>
    </div>
  );
};

const GradientChart = () => {
  const { profile } = useLineSizing();
  if (profile.error || !profile.stations) return null;
  const data = profile.stations.map((s) => ({
    x: s.distanceFt, p: s.pPsia, z: s.elevFt,
  }));
  const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };
  return (
    <ChartFrame height={320} exportFilename="hydraulic-gradient">
      <ComposedChart data={data} margin={{ top: 8, right: 40, bottom: 24, left: 8 }}>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis type="number" dataKey="x" domain={['dataMin', 'dataMax']} stroke={CHART_COLORS.axisLine} tick={tick}
          label={{ value: 'Distance (ft)', position: 'insideBottom', offset: -8, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
        <YAxis yAxisId="p" stroke={CHART_COLORS.axisLine} tick={tick}
          label={{ value: 'Pressure (psia)', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
        <YAxis yAxisId="z" orientation="right" stroke={CHART_COLORS.axisLine} tick={tick}
          label={{ value: 'Elevation (ft)', angle: 90, position: 'insideRight', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
        <Tooltip {...TOOLTIP_STYLE} formatter={(v, n) => [fmt(v, 1), n]} labelFormatter={(x) => `${fmt(x)} ft`} />
        <Legend verticalAlign="top" />
        <Area yAxisId="z" dataKey="z" name="Elevation (ft)" fill="#e2e8f0" stroke="#94a3b8" />
        <Line yAxisId="p" dataKey="p" name="Pressure (psia)" stroke="#059669" strokeWidth={2} dot />
      </ComposedChart>
    </ChartFrame>
  );
};

const modeNote = {
  liquid: 'Marched with Darcy-Weisbach per segment.',
  gas: 'Marched with the selected gas flow equation per segment, elevation adjustment included.',
  multiphase: 'Marched with Beggs & Brill per segment at each local inclination, so a hilly line pays for its hills.',
};

const ProfilePanel = () => {
  const { inputs, profile } = useLineSizing();
  return (
    <div className="space-y-4">
      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Elevation profile</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Inlet pressure (psia)"><NumberInput section="profile" name="p1Psia" /></Field>
          </div>
          <SegmentTable />
          <p className="text-[11px] text-slate-600">{modeNote[inputs.mode]}</p>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Hydraulic gradient</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {profile.error ? <ErrorNote>{profile.error}</ErrorNote> : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Stat label="Arrival pressure" value={fmt(profile.p2Psia, 1)} unit="psia" />
                <Stat label="Total drop" value={fmt(profile.dpTotalPsi, 1)} unit="psi" />
                <Stat label="Stations" value={String(profile.stations.length)} />
              </div>
              <GradientChart />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ProfilePanel;
