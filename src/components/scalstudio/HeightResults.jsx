// Height & Saturation tab, main area (SC5): the saturation-height profile
// from the working J spec scaled to the reservoir rock.
import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ChartFrame from '@/components/charts/ChartFrame';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE,
} from '@/utils/chartTheme';
import { useScalStudio } from '@/contexts/ScalStudioContext';
import { Kpi, LINE, fmt } from '@/components/waterflooddesign/primitives';

const axisProps = {
  stroke: CHART_COLORS.axisLine,
  tick: { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize },
};

const HeightResults = () => {
  const { height, heightProfile, jResolved } = useScalStudio();
  const fwl = parseFloat(height.fwl_tvdss);
  const hasFwl = Number.isFinite(fwl);

  const kpis = useMemo(() => {
    if (!heightProfile?.length) return null;
    const swirr = jResolved.jSpec?.Swirr ?? null;
    const top = heightProfile[heightProfile.length - 1];
    // Transition zone: from the FWL (highest Sw row) up to Sw within 5
    // saturation points of Swirr (or the chart top when never reached).
    const nearIrr = swirr != null
      ? heightProfile.find((r) => r.Sw <= swirr + 0.05)
      : null;
    const half = heightProfile.find((r) => r.Sw <= 0.5);
    return {
      topH: top.h_ft,
      topSw: top.Sw,
      transitionTopH: nearIrr?.h_ft ?? null,
      halfSwH: half?.h_ft ?? null,
    };
  }, [heightProfile, jResolved]);

  if (!heightProfile?.length) {
    return (
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="py-10 text-center text-sm text-slate-400">
          The saturation-height profile needs the Capillary tab's working J-function and reservoir rock, plus a
          positive specific gravity difference in the left rail.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi title="Chart top height" value={fmt.f1(kpis.topH)} unit="ft above FWL" />
        <Kpi title="Sw at chart top" value={fmt.f3(kpis.topSw)} />
        <Kpi
          title="Height to near-irreducible"
          value={kpis.transitionTopH != null ? fmt.f1(kpis.transitionTopH) : 'above chart'}
          unit={kpis.transitionTopH != null ? 'ft' : ''}
        />
        <Kpi title="Height at Sw = 0.5" value={kpis.halfSwH != null ? fmt.f1(kpis.halfSwH) : '—'} unit={kpis.halfSwH != null ? 'ft' : ''} />
      </div>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Saturation vs height above free water level</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ChartFrame height={340} exportFilename="scal-saturation-height">
            <LineChart data={heightProfile} margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
              <CartesianGrid {...GRID_STYLE} vertical={false} />
              <XAxis
                dataKey="Sw" type="number" domain={[0, 1]}
                tickFormatter={(v) => v.toFixed(1)} {...axisProps}
                label={{ value: 'Water saturation Sw', position: 'insideBottom', offset: -4, fill: CHART_COLORS.axisText, fontSize: 11 }}
              />
              <YAxis
                type="number" domain={[0, 'auto']}
                tickFormatter={(v) => v.toFixed(0)} {...axisProps}
                label={{ value: 'Height above FWL (ft)', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: 11 }}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: CHART_COLORS.tooltipText }}
                formatter={(v) => [
                  `${Number(v).toFixed(1)} ft${hasFwl ? ` (TVDSS ${(fwl - v).toFixed(1)} ft)` : ''}`,
                  'Height above FWL',
                ]}
                labelFormatter={(v) => `Sw = ${Number(v).toFixed(3)}`}
              />
              <Line dataKey="h_ft" name="Height above FWL" stroke={LINE.water} strokeWidth={2} dot={false} />
            </LineChart>
          </ChartFrame>
          {hasFwl && (
            <p className="text-[11px] text-slate-500 px-4 pb-3">
              FWL at {fwl.toFixed(0)} ft TVDSS. The Export tab's height CSV carries both height above FWL and
              TVDSS per row.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default HeightResults;
