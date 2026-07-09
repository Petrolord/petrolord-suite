import React, { useRef, useState } from 'react';
import { TrendingUp, Activity, BarChart3, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useReservoirCalc } from '../../../contexts/ReservoirCalcContext';
import { ReportGenerator } from '../../tools/ReportGenerator';
import SlideFrame from './SlideFrame';
import {
    SlideShell, HeroTile, Panel, StatCell, Chip,
    fmtDec, OIL, GAS, SLATE,
} from './slideParts';

// Rasterise an inline <svg> element to a PNG data URL so it can be embedded in the
// branded PDF. Renders at the SVG's viewBox size × 2 for a crisp result; resolves
// to null on failure so the report simply omits the chart.
const svgToPng = (svg, w, h, scale = 2) =>
    new Promise((resolve) => {
        try {
            const clone = svg.cloneNode(true);
            clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            const xml = new XMLSerializer().serializeToString(clone);
            const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = w * scale;
                canvas.height = h * scale;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = () => resolve(null);
            img.src = src;
        } catch {
            resolve(null);
        }
    });

const PARAM_LABELS = { area: 'Area', thickness: 'Thickness', ntg: 'NTG', phi: 'Porosity', sw: 'Water Sat.', fvf: 'Bo', bg: 'Bg', owc: 'OWC', goc: 'GOC', grvFactor: 'GRV Factor' };

// Expectation curve (cumulative probability) drawn as a self-contained SVG so it
// captures crisply in the screenshot without a charting runtime.
const ExpectationCurve = ({ cdf, denom, unit, p90, p50, p10, svgRef }) => {
    const W = 600, H = 250, padL = 46, padR = 18, padT = 14, padB = 32;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const pts = (cdf || []).map((p) => ({ x: p.x / denom, y: p.y })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (pts.length < 2) return <div className="flex h-full items-center justify-center text-[13px] text-slate-400">No distribution data.</div>;
    let xmin = Infinity, xmax = -Infinity;
    for (const p of pts) { if (p.x < xmin) xmin = p.x; if (p.x > xmax) xmax = p.x; }
    const span = xmax - xmin || 1;
    const sx = (x) => padL + ((x - xmin) / span) * plotW;
    const sy = (y) => padT + (1 - y / 100) * plotH;
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
    const area = `${line} L${sx(pts[pts.length - 1].x).toFixed(1)},${sy(0).toFixed(1)} L${sx(pts[0].x).toFixed(1)},${sy(0).toFixed(1)} Z`;
    const markers = [
        { v: p90 / denom, p: 90, c: '#94a3b8' },
        { v: p50 / denom, p: 50, c: '#059669' },
        { v: p10 / denom, p: 10, c: '#94a3b8' },
    ];
    const xticks = [xmin, (xmin + xmax) / 2, xmax];

    return (
        <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet">
            {[10, 50, 90].map((gy) => (
                <g key={gy}>
                    <line x1={padL} y1={sy(gy)} x2={W - padR} y2={sy(gy)} stroke="#e2e8f0" strokeDasharray="3 3" />
                    <text x={padL - 6} y={sy(gy) + 3} textAnchor="end" fontSize="10" fill="#94a3b8">{gy}%</text>
                </g>
            ))}
            <path d={area} fill="#05966915" />
            <path d={line} fill="none" stroke="#059669" strokeWidth="2.5" strokeLinejoin="round" />
            {markers.map((m) => Number.isFinite(m.v) && (
                <g key={m.p}>
                    <line x1={sx(m.v)} y1={padT} x2={sx(m.v)} y2={padT + plotH} stroke={m.c} strokeDasharray="4 3" strokeWidth={m.p === 50 ? 1.5 : 1} />
                    <text x={sx(m.v)} y={padT - 3} textAnchor="middle" fontSize="10.5" fontWeight="700" fill={m.p === 50 ? '#059669' : '#64748b'}>P{m.p}</text>
                </g>
            ))}
            {xticks.map((t, i) => (
                <text key={i} x={sx(t)} y={H - 10} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'} fontSize="10" fill="#94a3b8">{fmtDec(t, 1)}</text>
            ))}
            <text x={(padL + W - padR) / 2} y={H} textAnchor="middle" fontSize="10" fill="#64748b" fontWeight="600">Volume ({unit})</text>
        </svg>
    );
};

const ProbabilisticSlide = () => {
    const { state } = useReservoirCalc();
    const { probResults, inputs } = state;
    const { toast } = useToast();
    const curveRef = useRef(null);
    const [isExporting, setIsExporting] = useState(false);

    const ready = probResults && probResults.stats;
    if (!ready) {
        return (
            <SlideFrame fileName="reservoircalc-simulation">
                <div className="flex h-full items-center justify-center text-slate-400">Run a Monte Carlo simulation to build the results slide.</div>
            </SlideFrame>
        );
    }

    const ft = inputs?.fluidType || 'oil';
    const isGas = ft === 'gas';
    const isField = state.unitSystem === 'field';
    const stats = isGas ? probResults.stats.giip : probResults.stats.stooip;
    const denom = isGas ? 1e9 : 1e6;
    const unit = isGas ? (isField ? 'Bscf' : 'MMsm³') : (isField ? 'MMstb' : 'MMsm³');
    const palette = isGas ? GAS : OIL;

    const project = state.currentProjectMeta?.name || state.reservoirName || 'Untitled Project';
    const dateStr = new Date().toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const iterations = probResults.stats.iterations || (isGas ? probResults.raw?.giip?.length : probResults.raw?.stooip?.length) || 0;
    const ratio = Number.isFinite(stats.p10 / stats.p90) ? (stats.p10 / stats.p90).toFixed(2) : '—';

    const sens = [...(probResults.stats.sensitivity || [])].sort((a, b) => b.contribution - a.contribution).slice(0, 5);
    const maxContrib = sens.length ? Math.max(...sens.map((s) => s.contribution)) : 1;

    const hero = [
        { label: 'P90 · Proven', value: fmtDec(stats.p90 / denom, 2), unit, palette: SLATE, primary: false },
        { label: 'P50 · Probable', value: fmtDec(stats.p50 / denom, 2), unit, palette, primary: true, sub: `Mean ${fmtDec(stats.mean / denom, 2)} ${unit}` },
        { label: 'P10 · Possible', value: fmtDec(stats.p10 / denom, 2), unit, palette: SLATE, primary: false },
    ];

    const warnCount = probResults.diagnostics?.warnings?.length || 0;

    const exportPDF = async () => {
        setIsExporting(true);
        try {
            const cdfImg = curveRef.current ? await svgToPng(curveRef.current, 600, 250) : null;
            await ReportGenerator.generateProbabilisticReport(
                project, probResults, state.unitSystem, { cdf: cdfImg }, { template: 'technical', fluidType: ft },
            );
            toast({ title: 'Report downloaded', description: 'The full branded PDF was saved.', className: 'bg-emerald-900 text-white border-emerald-800' });
        } catch (e) {
            toast({ variant: 'destructive', title: 'Export failed', description: e?.message || 'Could not generate the PDF.' });
        } finally {
            setIsExporting(false);
        }
    };

    const pdfButton = (
        <Button size="sm" variant="outline" className="h-8 gap-2 border-slate-300 bg-white text-slate-700 hover:bg-slate-100" onClick={exportPDF} disabled={isExporting}>
            <FileText className="h-4 w-4" /> {isExporting ? 'Exporting…' : 'Full PDF'}
        </Button>
    );

    return (
        <SlideFrame fileName={`${project.replace(/\s+/g, '_')}_probabilistic`} extraActions={pdfButton}>
            <SlideShell
                subtitle="Probabilistic Volumetric Estimate · Monte Carlo"
                project={project}
                dateStr={dateStr}
                chips={<>
                    <Chip tone={isGas ? 'gas' : 'oil'}>{isGas ? 'Gas' : 'Oil'}</Chip>
                    <Chip tone="blue">{iterations.toLocaleString()} runs</Chip>
                    <Chip tone={warnCount ? 'gas' : 'slate'}>{warnCount ? `${warnCount} warning${warnCount > 1 ? 's' : ''}` : 'Validated'}</Chip>
                </>}
            >
                {/* P90 / P50 / P10 hero */}
                <div className="flex gap-4" style={{ height: 132 }}>
                    {hero.map((h) => <HeroTile key={h.label} {...h} />)}
                </div>

                {/* Expectation curve + statistics / sensitivity */}
                <div className="flex min-h-0 flex-1 gap-4">
                    <Panel
                        title="Expectation Curve"
                        icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
                        right={<span className="text-[11px] font-medium text-slate-400">cumulative probability</span>}
                        className="flex-[1.4]"
                    >
                        <div className="min-h-0 flex-1">
                            <ExpectationCurve svgRef={curveRef} cdf={stats.cdf} denom={denom} unit={unit} p90={stats.p90} p50={stats.p50} p10={stats.p10} />
                        </div>
                    </Panel>

                    <div className="flex flex-1 flex-col gap-4">
                        <Panel title="Statistics" icon={<BarChart3 className="h-4 w-4 text-blue-500" />}>
                            <div className="grid grid-cols-2 gap-2">
                                <StatCell label="Mean" value={fmtDec(stats.mean / denom, 2)} unit={unit} />
                                <StatCell label="Std. Dev" value={fmtDec(stats.stdDev / denom, 2)} unit={unit} />
                                <StatCell label="P10 / P90" value={ratio} accent />
                                <StatCell label="Iterations" value={iterations.toLocaleString()} />
                            </div>
                        </Panel>

                        <Panel title="Sensitivity" icon={<Activity className="h-4 w-4 text-purple-500" />} className="flex-1" right={<span className="text-[11px] font-medium text-slate-400">variance share</span>}>
                            {sens.length ? (
                                <div className="flex flex-col justify-center gap-2">
                                    {sens.map((s) => (
                                        <div key={s.parameter} className="flex items-center gap-2">
                                            <span className="w-[74px] shrink-0 truncate text-[12.5px] font-semibold text-slate-600">{PARAM_LABELS[s.parameter] || s.parameter}</span>
                                            <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                                                <div className="h-full rounded-full" style={{ width: `${Math.max((s.contribution / maxContrib) * 100, 3)}%`, background: s.impactDirection > 0 ? '#059669' : '#dc2626' }} />
                                            </div>
                                            <span className="w-[42px] shrink-0 text-right text-[12px] font-bold tabular-nums text-slate-700">{fmtDec(s.contribution, 0)}%</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex h-full items-center justify-center text-[12px] text-slate-400">Add uncertainty variables to see sensitivity.</div>
                            )}
                        </Panel>
                    </div>
                </div>
            </SlideShell>
        </SlideFrame>
    );
};

export default ProbabilisticSlide;
