import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Play, Mountain } from 'lucide-react';
import ChartFrame from '@/components/charts/ChartFrame';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE,
} from '@/utils/chartTheme';
import { createEnvelopeClient } from '@/utils/fluidstudio/envelopeClient';
import { envelopeRequest } from '@/utils/fluidstudio/eosAnalysis';
import FluidStudioTierBadge from '@/components/fluidstudio/FluidStudioTierBadge';
import { useFluidUnits } from '@/components/fluidstudio/FluidUnitsContext';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { buildEnvelopeSeries } from '@/utils/fluidstudio/pvtSeries';

const LINE = { bubble: '#059669', dew: '#2563eb', res: '#dc2626', sat: '#7c3aed' };

const fmt = (v, d = 0) => (v == null || !Number.isFinite(v) ? EMPTY_VALUE : Number(v).toFixed(d));

/**
 * PT phase-envelope card (FS5). The trace runs in a web worker (seconds
 * of stability bisections); the button keeps the cost explicit and one
 * trace is in flight at a time. Bubble and dew branches plot on the
 * shared white chart surface with the reservoir point and the traced
 * saturation pressure marked.
 */
const PhaseEnvelopeCard = ({ composition, tuned = false, envelope, onEnvelope }) => {
  const u = useFluidUnits();
  const clientRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // FLUID-U1: the trace is held by the page when it asks for it (`onEnvelope`),
  // so the report can draw the envelope the screen shows; otherwise locally.
  const [local, setLocal] = useState(null);
  const held = onEnvelope ? envelope : local;
  const result = held?.result ?? null;
  const tracedFor = held?.requestKey ?? null;
  const keep = onEnvelope || setLocal;

  useEffect(() => {
    clientRef.current = createEnvelopeClient();
    return () => clientRef.current?.dispose();
  }, []);

  const request = useMemo(() => envelopeRequest(composition), [composition]);
  const requestKey = useMemo(() => JSON.stringify(request), [request]);
  const stale = result && tracedFor !== requestKey;

  const run = async () => {
    if (!request || !clientRef.current) return;
    setBusy(true);
    setError(null);
    try {
      const res = await clientRef.current.trace(request);
      keep({ result: res, requestKey });
    } catch (err) {
      if (err?.message !== 'superseded' && err?.message !== 'disposed') {
        setError(err?.message || 'Envelope trace failed');
      }
    } finally {
      setBusy(false);
    }
  };

  // one series builder for this chart and the report figure
  const series = useMemo(
    () => buildEnvelopeSeries({ result, flashTempF: request?.resTempF, flashPressure: request?.resPressurePsia, system: u.system }),
    [result, request, u.system],
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center text-base">
            <Mountain className="w-4 h-4 mr-2 text-pl-muted" />PT phase envelope
          </CardTitle>
          <div className="flex items-center gap-2">
            {tuned && <FluidStudioTierBadge tier="lab_tuned" />}
            <FluidStudioTierBadge
              tier="oracle_gated"
              note="Each envelope point is a stability boundary located by bisection on the validated PR78 stability test. The boundary finder is cross-checked point by point against the independent Python oracle in the validation harness."
            />
            <Button size="sm" onClick={run} disabled={!request || busy} className="h-8">
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
              {busy ? 'Tracing' : result ? 'Retrace' : 'Trace envelope'}
            </Button>
          </div>
        </div>
        {!request && <p className="text-xs text-pl-warning-text mt-1">Complete the composition and flash conditions to enable tracing.</p>}
        {stale && !busy && <p className="text-xs text-pl-warning-text mt-1">Inputs changed since this trace. Retrace to refresh.</p>}
        {error && <p className="text-xs text-pl-danger-text mt-1">{error}</p>}
      </CardHeader>
      <CardContent className="p-0">
        {result && series ? (
          <>
            <div className="px-4 pb-3 text-sm text-pl-text">
              {result.satAtRes
                ? (
                  <span>
                    Saturation pressure at {fmt(u.show('temperature', request?.resTempF))} {u.label('temperature')}: <span className="font-semibold">{fmt(u.show('pressure', result.satAtRes.pPsia))} {u.label('pressure')}</span>
                    <span className="text-pl-muted"> ({result.satAtRes.kind} point)</span>
                  </span>
                )
                : <span className="text-pl-muted">Single phase across the pressure window at the flash temperature.</span>}
            </div>
            <ChartFrame height={300}>
              <ScatterChart margin={{ top: 8, right: 24, bottom: 8, left: 0 }}>
                <CartesianGrid {...GRID_STYLE} />
                <XAxis
                  dataKey="x"
                  type="number"
                  domain={['auto', 'auto']}
                  stroke={CHART_COLORS.axisLine}
                  tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                  label={{ value: series.xTitle, fill: CHART_COLORS.axisLabel, fontSize: 11, position: 'insideBottom', dy: 12 }}
                />
                <YAxis
                  dataKey="y"
                  type="number"
                  domain={[0, 'auto']}
                  stroke={CHART_COLORS.axisLine}
                  tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                  tickFormatter={(v) => Math.round(v).toLocaleString()}
                  width={64}
                  label={{ value: series.yTitle, angle: -90, fill: CHART_COLORS.axisLabel, fontSize: 11, position: 'insideLeft', dy: 30 }}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={{ color: CHART_COLORS.tooltipText }}
                  itemStyle={{ color: CHART_COLORS.tooltipText }}
                  formatter={(v, name) => [`${Math.round(v).toLocaleString()}`, name]}
                  labelFormatter={() => ''}
                />
                <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
                <Scatter name="Bubble points" data={series.bubble} isAnimationActive={false} fill={LINE.bubble} line={{ stroke: LINE.bubble, strokeWidth: 2 }} shape="circle" />
                <Scatter name="Dew points" data={series.dew} isAnimationActive={false} fill={LINE.dew} line={{ stroke: LINE.dew, strokeWidth: 2, strokeDasharray: '5 4' }} shape="circle" />
                <Scatter name="Flash conditions" data={series.flash} fill={LINE.res} shape="diamond" />
                {series.saturation.length > 0 && <Scatter name="Saturation point" data={series.saturation} fill={LINE.sat} shape="star" />}
              </ScatterChart>
            </ChartFrame>
            <p className="px-4 py-2 text-xs text-pl-muted">
              The trace stops where the stability test loses the boundary near the critical point, so the two branches may not meet. Tighten the window or add points in the Composition tab for more detail.
            </p>
          </>
        ) : (
          <div className="px-4 pb-4 text-sm text-pl-muted">
            Trace the envelope to see the two-phase region, the critical neighborhood and the saturation pressure at your flash temperature. The calculation runs off the main thread and takes a few seconds.
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PhaseEnvelopeCard;
