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

const LINE = { bubble: '#059669', dew: '#2563eb', res: '#dc2626', sat: '#7c3aed' };

const fmt = (v, d = 0) => (v == null || !Number.isFinite(v) ? 'n/a' : Number(v).toFixed(d));

/**
 * PT phase-envelope card (FS5). The trace runs in a web worker (seconds
 * of stability bisections); the button keeps the cost explicit and one
 * trace is in flight at a time. Bubble and dew branches plot on the
 * shared white chart surface with the reservoir point and the traced
 * saturation pressure marked.
 */
const PhaseEnvelopeCard = ({ composition }) => {
  const clientRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [tracedFor, setTracedFor] = useState(null);

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
      setResult(res);
      setTracedFor(requestKey);
    } catch (err) {
      if (err?.message !== 'superseded' && err?.message !== 'disposed') {
        setError(err?.message || 'Envelope trace failed');
      }
    } finally {
      setBusy(false);
    }
  };

  const reservoirPoint = request
    ? [{ tF: request.resTempF, pPsia: request.resPressurePsia }]
    : [];
  const satPoint = result?.satAtRes && request
    ? [{ tF: request.resTempF, pPsia: result.satAtRes.pPsia }]
    : [];

  return (
    <Card className="bg-slate-800/50 border-slate-700 text-white">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center text-base">
            <Mountain className="w-4 h-4 mr-2 text-cyan-300" />PT phase envelope
          </CardTitle>
          <div className="flex items-center gap-2">
            <FluidStudioTierBadge
              tier="oracle_gated"
              note="Each envelope point is a stability boundary located by bisection on the validated PR78 stability test. The boundary finder is cross-checked point by point against the independent Python oracle in the validation harness."
            />
            <Button size="sm" onClick={run} disabled={!request || busy} className="bg-teal-600 hover:bg-teal-700 h-8">
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
              {busy ? 'Tracing' : result ? 'Retrace' : 'Trace envelope'}
            </Button>
          </div>
        </div>
        {!request && <p className="text-xs text-amber-300 mt-1">Complete the composition and flash conditions to enable tracing.</p>}
        {stale && !busy && <p className="text-xs text-amber-300 mt-1">Inputs changed since this trace. Retrace to refresh.</p>}
        {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      </CardHeader>
      <CardContent className="p-0">
        {result ? (
          <>
            <div className="px-4 pb-3 text-sm text-slate-200">
              {result.satAtRes
                ? (
                  <span>
                    Saturation pressure at {fmt(request?.resTempF)} °F: <span className="font-semibold">{fmt(result.satAtRes.pPsia)} psia</span>
                    <span className="text-slate-400"> ({result.satAtRes.kind} point)</span>
                  </span>
                )
                : <span className="text-slate-400">Single phase across the pressure window at the flash temperature.</span>}
            </div>
            <ChartFrame height={300}>
              <ScatterChart margin={{ top: 8, right: 24, bottom: 8, left: 0 }}>
                <CartesianGrid {...GRID_STYLE} />
                <XAxis
                  dataKey="tF"
                  type="number"
                  domain={['auto', 'auto']}
                  stroke={CHART_COLORS.axisLine}
                  tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                  label={{ value: 'Temperature (°F)', fill: CHART_COLORS.axisLabel, fontSize: 11, position: 'insideBottom', dy: 12 }}
                />
                <YAxis
                  dataKey="pPsia"
                  type="number"
                  domain={[0, 'auto']}
                  stroke={CHART_COLORS.axisLine}
                  tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                  tickFormatter={(v) => Math.round(v).toLocaleString()}
                  width={64}
                  label={{ value: 'Pressure (psia)', angle: -90, fill: CHART_COLORS.axisLabel, fontSize: 11, position: 'insideLeft', dy: 30 }}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={{ color: CHART_COLORS.tooltipText }}
                  itemStyle={{ color: CHART_COLORS.tooltipText }}
                  formatter={(v, name) => [`${Math.round(v).toLocaleString()}`, name]}
                  labelFormatter={() => ''}
                />
                <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
                <Scatter name="Bubble points" data={result.bubble} fill={LINE.bubble} line={{ stroke: LINE.bubble, strokeWidth: 2 }} shape="circle" />
                <Scatter name="Dew points" data={result.dew} fill={LINE.dew} line={{ stroke: LINE.dew, strokeWidth: 2, strokeDasharray: '5 4' }} shape="circle" />
                <Scatter name="Flash conditions" data={reservoirPoint} fill={LINE.res} shape="diamond" />
                {satPoint.length > 0 && <Scatter name="Saturation point" data={satPoint} fill={LINE.sat} shape="star" />}
              </ScatterChart>
            </ChartFrame>
            <p className="px-4 py-2 text-xs text-slate-500">
              The trace stops where the stability test loses the boundary near the critical point, so the two branches may not meet. Tighten the window or add points in the Composition tab for more detail.
            </p>
          </>
        ) : (
          <div className="px-4 pb-4 text-sm text-slate-400">
            Trace the envelope to see the two-phase region, the critical neighborhood and the saturation pressure at your flash temperature. The calculation runs off the main thread and takes a few seconds.
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PhaseEnvelopeCard;
