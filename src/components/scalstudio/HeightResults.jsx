// Height & Saturation tab, main area (SC5): the saturation-height profile
// from the working J spec scaled to the reservoir rock.
import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ChartFrame from '@/components/charts/ChartFrame';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE, LEGEND_PROPS, XAXIS_LABEL_HEIGHT,
} from '@/utils/chartTheme';

// Senior test T1: one-decimal labels on auto ticks printed 0.25 as 0.3.
const UNIT_TICKS = [0, 0.2, 0.4, 0.6, 0.8, 1];
import { useScalStudio } from '@/contexts/ScalStudioContext';
import { Kpi, LINE } from '@/components/waterflooddesign/primitives';
import { heightSeries, heightAtSwFt } from '@/utils/scalstudio/series';
import { sfmt } from '@/utils/scalstudio/format';

const axisProps = {
  stroke: CHART_COLORS.axisLine,
  tick: { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize },
};

const HeightResults = () => {
  const { height, heightProfile, jResolved, reservoir, unitSystem, u } = useScalStudio();
  const hs = useMemo(() => heightSeries({ heightProfile, height, system: unitSystem }), [heightProfile, height, unitSystem]);
  const hasFwl = hs.hasFwl;
  const fwl = hs.fwl;

  const kpis = useMemo(() => {
    if (!heightProfile?.length) return null;
    const swirr = jResolved.jSpec?.Swirr ?? null;
    const top = heightProfile[heightProfile.length - 1];
    // Transition zone: from the FWL (highest Sw row) up to Sw within 5
    // saturation points of Swirr (or the chart top when never reached).
    const nearIrr = swirr != null
      ? heightProfile.find((r) => r.Sw <= swirr + 0.05)
      : null;
    // Senior test T1: this took the first grid row at or below Sw 0.5
    // (about 0.488 on the 61-point grid), 2 % high. The engine evaluates
    // Sw = 0.5 itself.
    const halfH = heightAtSwFt({ jSpec: jResolved.jSpec, reservoir, height, Sw: 0.5 });
    return {
      topH: u.show('length', top.h_ft),
      topSw: top.Sw,
      transitionTopH: nearIrr ? u.show('length', nearIrr.h_ft) : null,
      halfSwH: halfH != null ? u.show('length', halfH) : null,
    };
  }, [heightProfile, jResolved, reservoir, height, u]);

  if (!heightProfile?.length) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-pl-muted">
          The saturation-height profile needs the Capillary tab's working J-function and reservoir rock, plus a
          positive specific gravity difference in the left rail.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi title="Chart top height" value={sfmt.f1(kpis.topH)} unit={`${hs.unit} above FWL`} />
        <Kpi title="Sw at chart top" value={sfmt.f3(kpis.topSw)} />
        <Kpi
          title="Height to near-irreducible"
          value={kpis.transitionTopH != null ? sfmt.f1(kpis.transitionTopH) : 'above chart'}
          unit={kpis.transitionTopH != null ? hs.unit : ''}
        />
        <Kpi title="Height at Sw = 0.5" value={sfmt.f1(kpis.halfSwH)} unit={kpis.halfSwH != null ? hs.unit : ''} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Saturation vs height above free water level</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ChartFrame height={340} exportFilename="scal-saturation-height">
            <LineChart data={hs.points.map((p) => ({ Sw: p.x, h: p.y }))} margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
              <CartesianGrid {...GRID_STYLE} vertical={false} />
              <XAxis height={XAXIS_LABEL_HEIGHT}
                dataKey="Sw" type="number" domain={[0, 1]}
                ticks={UNIT_TICKS} tickFormatter={(v) => v.toFixed(1)} {...axisProps}
                label={{ value: 'Water saturation Sw', position: 'insideBottom', offset: 0, fill: CHART_COLORS.axisText, fontSize: 11 }}
              />
              <YAxis
                type="number" domain={[0, 'auto']}
                tickFormatter={(v) => v.toFixed(0)} {...axisProps}
                label={{ value: hs.yTitle, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: 11 }}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: CHART_COLORS.tooltipText }}
                formatter={(v) => [
                  `${Number(v).toFixed(1)} ${hs.unit}${hasFwl ? ` (TVDSS ${(fwl - v).toFixed(1)} ${hs.unit})` : ''}`,
                  'Height above FWL',
                ]}
                labelFormatter={(v) => `Sw = ${Number(v).toFixed(3)}`}
              />
              <ReferenceLine y={0} stroke="#d97706" strokeDasharray="4 3" label={{ value: hasFwl ? `FWL ${fwl.toFixed(0)} ${hs.unit} TVDSS` : 'FWL (h = 0)', position: 'insideBottomRight', dy: -6, fill: '#b45309', fontSize: 11 }} />
              <Line dataKey="h" name="Height above FWL" stroke={LINE.water} strokeWidth={2} dot={false} />
            </LineChart>
          </ChartFrame>
          {hasFwl && (
            <p className="text-[11px] text-pl-muted px-4 pb-3">
              FWL at {fwl.toFixed(0)} {hs.unit} TVDSS. The Export tab's height CSV carries both height above FWL and
              TVDSS per row.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default HeightResults;
