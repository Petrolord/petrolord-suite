// Main area for the Layered Sweep tab: V_DP KPI row, coverage-vs-WOR and
// coverage-vs-water-cut comparison charts, per-stage tables.
import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar,
} from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useWaterfloodDesign } from '@/contexts/WaterfloodDesignContext';
import { ChartCard, Kpi, LINE, WarningBanner, fmt } from './primitives';

const axisProps = { stroke: CHART_COLORS.axisLine, tick: { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize } };
const tooltipProps = { contentStyle: TOOLTIP_STYLE, labelStyle: { color: CHART_COLORS.tooltipText }, itemStyle: { color: CHART_COLORS.tooltipText } };
const legendProps = { wrapperStyle: { fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText } };

const LayeredResults = () => {
  const { layeredResult } = useWaterfloodDesign();

  const dpData = useMemo(() => {
    if (!layeredResult) return [];
    return layeredResult.dykstraParsons
      .filter((s) => Number.isFinite(s.WOR))
      .map((s) => ({ WOR: Number(s.WOR.toFixed(2)), coverage: Number((s.coverage * 100).toFixed(1)) }));
  }, [layeredResult]);

  const stilesData = useMemo(() => {
    if (!layeredResult) return [];
    return layeredResult.stiles.map((s) => ({ waterCut: Number((s.waterCut * 100).toFixed(1)), coverage: Number((s.coverage * 100).toFixed(1)) }));
  }, [layeredResult]);

  const kDist = useMemo(() => {
    if (!layeredResult) return [];
    return layeredResult.layers.map((l, i) => ({ layer: `L${i + 1}`, k: l.k, h: l.h }));
  }, [layeredResult]);

  if (!layeredResult) {
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 px-4 py-3 text-sm">
        Enter at least two layers with positive h and k, plus a positive M and capacity ratio A.
      </div>
    );
  }

  const { V, dykstraParsons, stiles, M, A } = layeredResult;

  return (
    <div className="space-y-4 overflow-y-auto">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi title="Dykstra-Parsons V" value={fmt.f3(V?.V)} accent />
        <Kpi title="Median k (log-normal fit)" value={fmt.f1(V?.k50)} unit="md" />
        <Kpi title="Mobility ratio M" value={fmt.f2(M)} />
        <Kpi title="Stiles capacity ratio A" value={fmt.f2(A)} />
      </div>

      <WarningBanner warnings={layeredResult.warnings} />

      <div className="grid xl:grid-cols-2 gap-4">
        <ChartCard title="Dykstra-Parsons: vertical coverage vs WOR (reservoir)">
          <LineChart data={dpData} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis dataKey="WOR" {...axisProps} type="number" domain={[0, 'dataMax']} label={{ value: 'WOR (rb/rb)', fill: CHART_COLORS.axisLabel, fontSize: 11, position: 'insideBottom', dy: 12 }} />
            <YAxis {...axisProps} domain={[0, 100]} label={{ value: 'Coverage (%)', angle: -90, fill: CHART_COLORS.axisLabel, fontSize: 11, position: 'insideLeft', dy: 30 }} />
            <Tooltip {...tooltipProps} />
            <Line type="monotone" dataKey="coverage" name="Coverage" stroke={LINE.water} strokeWidth={2} dot />
          </LineChart>
        </ChartCard>

        <ChartCard title="Stiles: vertical coverage vs surface water cut">
          <LineChart data={stilesData} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis dataKey="waterCut" {...axisProps} type="number" domain={[0, 100]} label={{ value: 'Water cut (%)', fill: CHART_COLORS.axisLabel, fontSize: 11, position: 'insideBottom', dy: 12 }} />
            <YAxis {...axisProps} domain={[0, 100]} label={{ value: 'Coverage (%)', angle: -90, fill: CHART_COLORS.axisLabel, fontSize: 11, position: 'insideLeft', dy: 30 }} />
            <Tooltip {...tooltipProps} />
            <Line type="monotone" dataKey="coverage" name="Coverage" stroke={LINE.oil} strokeWidth={2} dot />
          </LineChart>
        </ChartCard>
      </div>

      <ChartCard title="Layer permeability distribution (ordered fastest first)" height={200}>
        <BarChart data={kDist} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis dataKey="layer" {...axisProps} />
          <YAxis {...axisProps} label={{ value: 'k (md)', angle: -90, fill: CHART_COLORS.axisLabel, fontSize: 11, position: 'insideLeft', dy: 15 }} />
          <Tooltip {...tooltipProps} />
          <Legend {...legendProps} />
          <Bar dataKey="k" name="k (md)" fill={LINE.alt} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ChartCard>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-base">Breakthrough stages</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-slate-800">
                <TableHead>Stage (layer BT)</TableHead>
                <TableHead>k broken (md)</TableHead>
                <TableHead>DP coverage</TableHead>
                <TableHead>DP WOR (rb/rb)</TableHead>
                <TableHead>Stiles coverage</TableHead>
                <TableHead>Stiles water cut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dykstraParsons.map((s, i) => (
                <TableRow key={i} className="border-slate-800">
                  <TableCell>{i + 1}</TableCell>
                  <TableCell>{fmt.f1(s.kBroken)}</TableCell>
                  <TableCell>{fmt.pct(s.coverage)}</TableCell>
                  <TableCell>{Number.isFinite(s.WOR) ? fmt.f2(s.WOR) : '∞'}</TableCell>
                  <TableCell>{fmt.pct(stiles[i]?.coverage)}</TableCell>
                  <TableCell>{fmt.pct(stiles[i]?.waterCut)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default LayeredResults;
