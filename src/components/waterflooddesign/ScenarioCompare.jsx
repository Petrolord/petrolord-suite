// Main area for the Scenarios tab: side-by-side comparison table plus a
// recovery-vs-PV overlay of every saved scenario against the working case.
// All results are recomputed from stored inputs through the shared engines.
import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useWaterfloodDesign, buildDisplacementSpec } from '@/contexts/WaterfloodDesignContext';
import { analyzeDisplacement } from '@/utils/fractionalFlowCalculations';
import { ChartCard, SCENARIO_COLORS, fmt } from './primitives';

const axisProps = { stroke: CHART_COLORS.axisLine, tick: { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize } };
const tooltipProps = { contentStyle: TOOLTIP_STYLE, labelStyle: { color: CHART_COLORS.tooltipText }, itemStyle: { color: CHART_COLORS.tooltipText } };
const legendProps = { wrapperStyle: { fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText } };

const ScenarioCompare = () => {
  const { scenarios, displacement } = useWaterfloodDesign();

  // Recompute displacement for each stored scenario.
  const rows = useMemo(() => {
    const list = [];
    if (displacement) {
      list.push({ id: 'working', name: 'Working case', result: displacement });
    }
    scenarios.forEach((s) => {
      const { spec } = buildDisplacementSpec({ ...s.displacementInputs });
      if (spec) list.push({ id: s.id, name: s.name, result: analyzeDisplacement(spec) });
    });
    return list;
  }, [scenarios, displacement]);

  // Overlay chart: merge each scenario's ED(Qi) curve onto a shared Qi axis.
  const overlay = useMemo(() => {
    const byQi = new Map();
    rows.forEach((r, idx) => {
      r.result.recovery.filter((p) => p.Qi <= 6).forEach((p) => {
        const qi = Number(p.Qi.toFixed(2));
        if (!byQi.has(qi)) byQi.set(qi, { Qi: qi });
        byQi.get(qi)[`s${idx}`] = Number((p.ED * 100).toFixed(2));
      });
    });
    return [...byQi.values()].sort((a, b) => a.Qi - b.Qi);
  }, [rows]);

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 px-4 py-3 text-sm">
        Nothing to compare yet: enter a valid working case and snapshot scenarios from the right rail.
      </div>
    );
  }

  return (
    <div className="space-y-4 overflow-y-auto">
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-base">Scenario comparison</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-slate-800">
                <TableHead>Scenario</TableHead>
                <TableHead>M</TableHead>
                <TableHead>Swf</TableHead>
                <TableHead>PV @ BT</TableHead>
                <TableHead>ED @ BT</TableHead>
                <TableHead>ED max</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, idx) => (
                <TableRow key={r.id} className="border-slate-800">
                  <TableCell>
                    <span className="inline-block w-2.5 h-2.5 rounded-full mr-2" style={{ background: SCENARIO_COLORS[idx % SCENARIO_COLORS.length] }} />
                    {r.name}
                  </TableCell>
                  <TableCell>{fmt.f2(r.result.M)}</TableCell>
                  <TableCell>{fmt.f3(r.result.bl?.Swf)}</TableCell>
                  <TableCell>{fmt.f2(r.result.bl?.QiBt)}</TableCell>
                  <TableCell>{fmt.pct(r.result.bl?.EDbt)}</TableCell>
                  <TableCell>{fmt.pct(r.result.bl?.EDmax)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ChartCard title="Displacement efficiency vs PV injected (all scenarios)" height={320}>
        <LineChart data={overlay} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis dataKey="Qi" {...axisProps} type="number" domain={[0, 'dataMax']} label={{ value: 'PV injected', fill: CHART_COLORS.axisLabel, fontSize: 11, position: 'insideBottom', dy: 12 }} />
          <YAxis {...axisProps} domain={[0, 'auto']} label={{ value: 'ED (%)', angle: -90, fill: CHART_COLORS.axisLabel, fontSize: 11, position: 'insideLeft', dy: 20 }} />
          <Tooltip {...tooltipProps} />
          <Legend {...legendProps} />
          {rows.map((r, idx) => (
            <Line
              key={r.id}
              type="monotone"
              dataKey={`s${idx}`}
              name={r.name}
              stroke={SCENARIO_COLORS[idx % SCENARIO_COLORS.length]}
              strokeWidth={r.id === 'working' ? 2.5 : 1.8}
              strokeDasharray={r.id === 'working' ? undefined : '5 4'}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ChartCard>

      <p className="text-xs text-slate-500">
        Every scenario is recomputed live from its stored inputs through the shared displacement engine; nothing is cached.
        Apply a scenario from the right rail to bring it back into the working case.
      </p>
    </div>
  );
};

export default ScenarioCompare;
