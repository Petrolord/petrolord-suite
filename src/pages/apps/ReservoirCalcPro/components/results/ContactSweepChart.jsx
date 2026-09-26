// Volume against the fluid contact (ReservoirCalc Pro senior test T1,
// E1): STOIIP (GIIP for gas) as the OWC (GWC) moves from the crest to the
// deepest base of the structural model, with the entered contact marked.
// The same hypsometry the Monte Carlo uses, so the curve and the
// deterministic result agree at the entered contact. White chart template.

import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { ContactVolumetricsEngine } from '../../services/ContactVolumetricsEngine';
import { useReservoirCalc } from '../../contexts/ReservoirCalcContext';

const AXIS_TICK = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };

export default function ContactSweepChart() {
  const { state } = useReservoirCalc();
  const { inputMethod, inputs = {}, surfaces = {}, unitSystem, aois = [], activeAoiId } = state;
  const structural = inputMethod === 'hybrid' || inputMethod === 'surfaces';
  const top = surfaces[inputs.topSurfaceId];
  const base = inputMethod === 'surfaces' ? surfaces[inputs.baseSurfaceId] : null;
  const aoi = aois.find((a) => a.id === activeAoiId) || null;

  const sweep = useMemo(() => {
    if (!structural || !top || (inputMethod === 'surfaces' && !base)) return null;
    const h = ContactVolumetricsEngine.buildHypsometry({
      topSurface: top, baseSurface: base,
      constantThickness: inputMethod === 'hybrid' ? parseFloat(inputs.thickness) : null,
      unitSystem, aoiPolygon: aoi, options: { resolution: 100, interpolation: 'idw' },
    });
    return ContactVolumetricsEngine.contactSweep(h, inputs, 60);
  }, [structural, top, base, inputMethod, inputs, unitSystem, aoi]);

  if (!sweep) return null;
  const gas = inputs.fluidType === 'gas';
  const scale = gas ? 1e9 : 1e6;
  const vLabel = gas ? (unitSystem === 'field' ? 'GIIP, Bscf' : 'GIIP, Bsm³') : (unitSystem === 'field' ? 'STOIIP, MMSTB' : 'STOIIP, MMsm³');
  const data = sweep.points.map((p) => ({ contact: p.contact, volume: p.volume / scale }));
  const entered = parseFloat(gas && inputs.goc !== '' && inputs.goc != null ? inputs.goc : inputs.owc);
  const cLabel = `${gas ? 'GWC' : 'OWC'}, TVDSS ${sweep.contactUnit}`;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4" data-testid="rcp-contact-sweep">
      <h3 className="text-sm font-bold text-white mb-1">{gas ? 'GIIP' : 'STOIIP'} against the contact</h3>
      <p className="text-[11px] text-slate-400 mb-2">
        Every other input held. Read how much the volume moves if the contact is shallower or deeper than entered.
      </p>
      <ChartFrame height={240} exportFilename="rcp-volume-vs-contact">
        <LineChart data={data} margin={{ top: 12, right: 20, bottom: 18, left: 8 }}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis dataKey="contact" type="number" domain={['dataMin', 'dataMax']} reversed tick={AXIS_TICK} stroke={CHART_COLORS.axisLine}
            tickFormatter={(v) => Math.round(v).toLocaleString()}
            label={{ value: `${cLabel} (deeper to the right)`, position: 'insideBottom', offset: -10, style: AXIS_TICK }} />
          <YAxis tick={AXIS_TICK} stroke={CHART_COLORS.axisLine} width={52}
            label={{ value: vLabel, angle: -90, position: 'insideLeft', style: AXIS_TICK, dy: 50 }} />
          <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(v) => `${cLabel} ${Number(v).toFixed(1)}`}
            formatter={(v) => [Number(v).toFixed(2), vLabel]} />
          <Line dataKey="volume" stroke="#2563eb" strokeWidth={2} dot={false} isAnimationActive={false} />
          {Number.isFinite(entered) && <ReferenceLine x={entered} stroke="#dc2626" label={{ value: 'entered', position: 'top', fontSize: 9, fill: '#b91c1c' }} />}
        </LineChart>
      </ChartFrame>
    </div>
  );
}
