// Curves tab, main area (SC3): kr curves (linear or semilog) + optional fw
// preview, white chartTheme + ChartFrame with PNG export.
import React, { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ChartFrame from '@/components/charts/ChartFrame';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE, LEGEND_PROPS, XAXIS_LABEL_HEIGHT,
} from '@/utils/chartTheme';

// Senior test T1: one-decimal labels on auto ticks printed 0.25 as 0.3.
const UNIT_TICKS = [0, 0.2, 0.4, 0.6, 0.8, 1];
import { useScalStudio } from '@/contexts/ScalStudioContext';
import { Kpi, LINE } from '@/components/waterflooddesign/primitives';
import { sfmt as fmt } from '@/utils/scalstudio/format';
import { crossoverSw } from '@/utils/scalstudio/series';

const axisProps = {
  stroke: CHART_COLORS.axisLine,
  tick: { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize },
};

const CurvesResults = () => {
  const { curves, ow, go, owCurves, goCurves, fwPreview } = useScalStudio();
  const isOw = curves.phase === 'oilwater';
  const [scale, setScale] = useState('linear');

  const rows = isOw ? owCurves?.rows : goCurves?.rows;
  const error = isOw ? ow.error : go.error;

  const chartRows = useMemo(() => {
    if (!rows) return [];
    if (scale === 'linear') return rows;
    // Semilog: drop definitional zeros so the log axis stays finite.
    return rows.filter((r) => (isOw ? r.krw > 1e-6 || r.kro > 1e-6 : r.krg > 1e-6 || r.krog > 1e-6));
  }, [rows, scale, isOw]);

  if (error || !rows) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-pl-muted">
          {error ?? 'Set the Corey parameters in the left rail.'}
        </CardContent>
      </Card>
    );
  }

  const mobileSpan = isOw
    ? 1 - ow.params.Swc - ow.params.Sor
    : 1 - go.params.Swc - go.params.Sorg - go.params.Sgc;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {isOw ? (
          <>
            <Kpi title="Mobile saturation span" value={fmt.f3(mobileSpan)} />
            <Kpi title="krw @ Sor" value={fmt.f3(ow.params.krwMax)} />
            <Kpi title="kro @ Swc" value={fmt.f3(ow.params.kroMax)} />
            <Kpi title="Crossover Sw" value={fmt.f3(crossoverSw(ow.params))} />
          </>
        ) : (
          <>
            <Kpi title="Mobile gas span" value={fmt.f3(mobileSpan)} />
            <Kpi title="krg endpoint" value={fmt.f3(go.params.krgMax)} />
            <Kpi title="krog endpoint" value={fmt.f3(go.params.krogMax)} />
            <Kpi title="Critical gas Sgc" value={fmt.f3(go.params.Sgc)} />
          </>
        )}
      </div>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            {isOw ? 'Relative permeability (oil-water)' : 'Relative permeability (gas-oil)'}
          </CardTitle>
          <Tabs value={scale} onValueChange={setScale}>
            <TabsList className="h-8">
              <TabsTrigger value="linear" className="text-xs px-2">Linear</TabsTrigger>
              <TabsTrigger value="log" className="text-xs px-2">Semilog</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="p-0">
          <ChartFrame height={320} exportFilename={isOw ? 'scal-kr-oil-water' : 'scal-kr-gas-oil'}>
            <LineChart data={chartRows} margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
              <CartesianGrid {...GRID_STYLE} vertical={false} />
              <XAxis height={XAXIS_LABEL_HEIGHT}
                dataKey={isOw ? 'Sw' : 'Sg'}
                type="number"
                domain={[0, 1]}
                ticks={UNIT_TICKS} tickFormatter={(v) => v.toFixed(1)}
                {...axisProps}
                label={{
                  value: isOw ? 'Water saturation Sw' : 'Gas saturation Sg',
                  position: 'insideBottom', offset: 0,
                  fill: CHART_COLORS.axisText, fontSize: 11,
                }}
              />
              <YAxis
                scale={scale === 'log' ? 'log' : 'linear'}
                domain={scale === 'log' ? [1e-4, 1] : [0, 1]}
                allowDataOverflow
                tickFormatter={(v) => (scale === 'log' ? v.toExponential(0) : v.toFixed(1))}
                {...axisProps}
                label={{ value: 'kr', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: 11 }}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: CHART_COLORS.tooltipText }}
                formatter={(v, name) => [Number(v).toFixed(4), name]}
                labelFormatter={(v) => `${isOw ? 'Sw' : 'Sg'} = ${Number(v).toFixed(3)}`}
              />
              <Legend {...LEGEND_PROPS} />
              {isOw ? (
                <>
                  <Line dataKey="krw" name="krw" stroke={LINE.water} strokeWidth={2} dot={false} />
                  <Line dataKey="kro" name="kro" stroke={LINE.oil} strokeWidth={2} dot={false} />
                </>
              ) : (
                <>
                  <Line dataKey="krg" name="krg" stroke={LINE.ref} strokeWidth={2} dot={false} />
                  <Line dataKey="krog" name="krog" stroke={LINE.oil} strokeWidth={2} dot={false} />
                </>
              )}
            </LineChart>
          </ChartFrame>
        </CardContent>
      </Card>

      {isOw && fwPreview && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Fractional flow preview</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ChartFrame height={260} exportFilename="scal-fw-preview">
              <LineChart data={fwPreview.rows} margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid {...GRID_STYLE} vertical={false} />
                <XAxis height={XAXIS_LABEL_HEIGHT}
                  dataKey="Sw" type="number" domain={[0, 1]}
                  ticks={UNIT_TICKS} tickFormatter={(v) => v.toFixed(1)} {...axisProps}
                  label={{ value: 'Water saturation Sw', position: 'insideBottom', offset: 0, fill: CHART_COLORS.axisText, fontSize: 11 }}
                />
                <YAxis
                  domain={[0, 1]} ticks={UNIT_TICKS} tickFormatter={(v) => v.toFixed(1)} {...axisProps}
                  label={{ value: 'fw', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={{ color: CHART_COLORS.tooltipText }}
                  formatter={(v) => [Number(v).toFixed(4), 'fw']}
                  labelFormatter={(v) => `Sw = ${Number(v).toFixed(3)}`}
                />
                <Line dataKey="fw" name="fw" stroke={LINE.fw} strokeWidth={2} dot={false} />
              </LineChart>
            </ChartFrame>
            <p className="text-[11px] text-pl-muted px-4 pb-3">
              Mobility context at μw {fwPreview.muW} cp and μo {fwPreview.muO} cp. Displacement design (Welge,
              breakthrough, recovery) lives in the Waterflood Design Studio.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CurvesResults;
