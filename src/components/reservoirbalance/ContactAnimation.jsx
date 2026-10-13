// Contacts tab: the contacts moving through time on a cross-section.
// Plays the series of lib/contactMovement.js (the OWC risen by the net
// influx and the GOC lowered by the gas-cap expansion of the last run) with
// a time slider and a play button. Frames on a timestep show that
// timestep's computed contacts; frames between are interpolated
// (lib/contactAnimation.js). Depths are true; the shape of the structure is
// a schematic drawn through the initial contacts. White chart surface and
// the Petrolord watermark, as every Suite chart.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS, CHART_TYPOGRAPHY } from '@/utils/chartTheme';
import { frameAt, sectionGeometry, contactExtent, playPosition } from '@/pages/apps/reservoir-balance/lib/contactAnimation';

const VB = { w: 1000, h: 420, left: 92, right: 150, top: 24, bottom: 28 };
const FILL = { gas: '#fca5a5', oil: '#86efac', water: '#93c5fd', sand: '#f5f5f4' };
const LINE = { owc: '#1d4ed8', goc: '#b91c1c', initial: '#64748b' };

const fmtDate = (ms) => (ms == null ? '' : new Date(ms).toISOString().slice(0, 7));
const group = (v, d = 1) => (Number.isFinite(v) ? v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '');

/**
 * @param {{series: Array<object>, initialOwcFt: number, initialGocFt: ?number, units: object, waterLabel?: string, depthRef?: string}} props
 */
export default function ContactAnimation({ series, initialOwcFt, initialGocFt = null, units, waterLabel = 'OWC', depthRef = 'TVDSS' }) {
  const n = series?.length ?? 0;
  const [t, setT] = useState(n > 0 ? n - 1 : 0);
  const [playing, setPlaying] = useState(false);
  const raf = useRef(null);
  useEffect(() => { setT(n > 0 ? n - 1 : 0); setPlaying(false); }, [n, initialOwcFt, initialGocFt]);

  const durationMs = Math.max(8000, n * 650);
  useEffect(() => {
    if (!playing) return undefined;
    const startT = t >= n - 1 ? 0 : t;
    const t0 = performance.now();
    const tick = (now) => {
      const next = playPosition(n, startT, now - t0, durationMs);
      setT(next);
      if (next >= n - 1) { setPlaying(false); return; }
      raf.current = requestAnimationFrame(tick);
    };
    if (startT === 0) setT(0);
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const geom = useMemo(() => sectionGeometry({ initialOwcFt, initialGocFt, series }), [initialOwcFt, initialGocFt, series]);
  if (!n || !geom) return null;
  const fr = frameAt(series, t);
  const W = VB.w - VB.left - VB.right;
  const H = VB.h - VB.top - VB.bottom;
  const x = (f) => VB.left + f * W;
  const y = (z) => VB.top + ((z - geom.minFt) / (geom.maxFt - geom.minFt)) * H;
  const N = 80;
  const topPts = Array.from({ length: N + 1 }, (_, i) => [x(i / N), y(geom.topAt(i / N))]);
  const basePts = Array.from({ length: N + 1 }, (_, i) => [x(1 - i / N), y(geom.topAt(1 - i / N) + geom.thicknessFt)]);
  const sandPath = `M${[...topPts, ...basePts].map((p) => p.map((v) => v.toFixed(1)).join(',')).join('L')}Z`;
  const band = (z0, z1) => ({ x: VB.left, y: y(z0), width: W, height: Math.max(0, y(z1) - y(z0)) });
  const gocNow = fr.gocFt;
  const owcNow = fr.owcFt;
  const dz = (z) => units.to('depth', z);
  const dl = units.label('depth');
  const contactLine = (z, colour, dashed, label, testId) => {
    const ext = contactExtent(geom, z);
    if (!ext) return null;
    const x0 = x(ext[0]); const x1 = x(ext[1]);
    return (
      <g data-testid={testId}>
        <line x1={x0} x2={x1} y1={y(z)} y2={y(z)} stroke={colour} strokeWidth={dashed ? 1.5 : 3} strokeDasharray={dashed ? '6 4' : undefined} />
        {label && (
          <text x={VB.w - VB.right + 10} y={y(z) + 4} fill={colour} fontSize={14} fontWeight={600}>{label}</text>
        )}
      </g>
    );
  };
  const rise = series[0].owcFt - owcNow;
  const drop = gocNow != null && series[0].gocFt != null ? gocNow - series[0].gocFt : null;

  return (
    <Card className="bg-white" data-testid="mbal-contacts-anim">
      <CardHeader>
        <CardTitle>Contacts through time</CardTitle>
        <CardDescription>
          The {waterLabel}{gocNow != null ? ' and the GOC' : ''} of the last run at each date: press play, or drag the slider. On a timestep the contacts are the computed ones; between timesteps they are interpolated. The depths are true; the shape of the structure is a schematic drawn through the initial contacts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative bg-white rounded border border-pl-border">
          <svg viewBox={`0 0 ${VB.w} ${VB.h}`} className="w-full h-auto block" role="img" aria-label="Contacts on a cross-section">
            <defs>
              <clipPath id="mbal-sand-clip"><path d={sandPath} /></clipPath>
              <pattern id="mbal-swept-water" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="8" height="8" fill={FILL.water} /><line x1="0" y1="0" x2="0" y2="8" stroke="#16a34a" strokeWidth="3" />
              </pattern>
              <pattern id="mbal-swept-gas" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
                <rect width="8" height="8" fill={FILL.gas} /><line x1="0" y1="0" x2="0" y2="8" stroke="#16a34a" strokeWidth="3" />
              </pattern>
            </defs>
            {geom.ticks.map((v) => (
              <g key={v}>
                <line x1={VB.left} x2={VB.w - VB.right} y1={y(v)} y2={y(v)} stroke={CHART_COLORS.grid} strokeWidth={1} />
                <text x={VB.left - 8} y={y(v) + 4} textAnchor="end" fill={CHART_COLORS.axisText} fontSize={CHART_TYPOGRAPHY.axisFontSize + 1}>{group(dz(v), 0)}</text>
              </g>
            ))}
            <text x={18} y={VB.top + H / 2} transform={`rotate(-90 18 ${VB.top + H / 2})`} textAnchor="middle" fill={CHART_COLORS.axisText} fontSize={12}>{`Depth (${dl} ${depthRef})`}</text>
            <g clipPath="url(#mbal-sand-clip)">
              <rect {...band(geom.minFt, geom.maxFt)} fill={FILL.water} />
              <rect {...band(geom.minFt, owcNow)} fill={FILL.oil} />
              {owcNow < series[0].owcFt && <rect {...band(owcNow, series[0].owcFt)} fill="url(#mbal-swept-water)" data-testid="mbal-contacts-anim-swept-water" />}
              {gocNow != null && <rect {...band(geom.minFt, gocNow)} fill={FILL.gas} />}
              {gocNow != null && gocNow > series[0].gocFt && <rect {...band(series[0].gocFt, gocNow)} fill="url(#mbal-swept-gas)" data-testid="mbal-contacts-anim-swept-gas" />}
            </g>
            <path d={sandPath} fill="none" stroke="#57534e" strokeWidth={1.5} />
            {contactLine(series[0].owcFt, LINE.initial, true, null, 'mbal-contacts-anim-owc0')}
            {series[0].gocFt != null && contactLine(series[0].gocFt, LINE.initial, true, null, 'mbal-contacts-anim-goc0')}
            {contactLine(owcNow, LINE.owc, false, `${waterLabel} ${group(dz(owcNow))} ${dl}`, 'mbal-contacts-anim-owc')}
            {gocNow != null && contactLine(gocNow, LINE.goc, false, `GOC ${group(dz(gocNow))} ${dl}`, 'mbal-contacts-anim-goc')}
            <g fontSize={13} fill={CHART_COLORS.axisText}>
              {[['Gas cap', FILL.gas, gocNow != null], ['Oil', FILL.oil, true], ['Water', FILL.water, true], ['Swept by water', 'url(#mbal-swept-water)', true], ['Swept by gas', 'url(#mbal-swept-gas)', gocNow != null]]
                .filter(([, , on]) => on)
                .map(([label, fill], i) => (
                  <g key={label} transform={`translate(${VB.left + 8 + i * 128}, ${VB.top + 6})`}>
                    <rect width={14} height={14} fill={fill} stroke="#57534e" strokeWidth={0.5} />
                    <text x={20} y={12}>{label}</text>
                  </g>
                ))}
            </g>
          </svg>
          <ChartLogo style={{ height: '28px' }} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" variant="outline" onClick={() => setPlaying((p) => !p)} data-testid="mbal-contacts-anim-play">
            {playing ? <Pause className="h-4 w-4 mr-1" /> : <Play className="h-4 w-4 mr-1" />}{playing ? 'Pause' : 'Play'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setPlaying(false); setT(0); }} data-testid="mbal-contacts-anim-reset" title="Back to the initial contacts">
            <RotateCcw className="h-4 w-4" />
          </Button>
          <input type="range" min={0} max={Math.max(n - 1, 0)} step={0.01} value={t} aria-label="Time"
            onChange={(e) => { setPlaying(false); setT(Number(e.target.value)); }}
            className="flex-1 min-w-[200px] accent-pl-primary" data-testid="mbal-contacts-anim-slider" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs" data-testid="mbal-contacts-anim-readout">
          <div><p className="text-pl-muted">Date</p><p className="font-pl-mono tabular-nums text-pl-text text-sm" data-testid="mbal-contacts-anim-date">{fmtDate(fr.dateMs) || `Timestep ${fr.step}`}{fr.onStep ? '' : ' (between surveys)'}</p></div>
          <div><p className="text-pl-muted">Pressure</p><p className="font-pl-mono tabular-nums text-pl-text text-sm">{Number.isFinite(fr.pressure) ? `${group(units.to('pressure', fr.pressure), 0)} ${units.label('pressure')}` : ''}</p></div>
          <div><p className="text-pl-muted">{waterLabel} risen by</p><p className="font-pl-mono tabular-nums text-pl-text text-sm" data-testid="mbal-contacts-anim-rise">{group(units.to('depth', rise))} {dl}</p></div>
          {drop != null && <div><p className="text-pl-muted">GOC lowered by</p><p className="font-pl-mono tabular-nums text-pl-text text-sm" data-testid="mbal-contacts-anim-drop">{group(units.to('depth', drop))} {dl}</p></div>}
        </div>
      </CardContent>
    </Card>
  );
}
