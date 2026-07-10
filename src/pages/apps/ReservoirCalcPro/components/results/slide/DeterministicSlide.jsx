import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileText, ShieldCheck, AlertTriangle, Droplets, Layers } from 'lucide-react';
import { useReservoirCalc } from '../../../contexts/ReservoirCalcContext';
import { useToast } from '@/components/ui/use-toast';
import { ReportGenerator } from '../../tools/ReportGenerator';
import SlideFrame from './SlideFrame';
import {
    SlideShell, HeroTile, Panel, StatCell, Chip,
    fmtInt, fmtDec, scaleMM, scaleB, OIL, GAS, SLATE,
} from './slideParts';

// The volumetric chain: each stage as a fraction of Gross Rock Volume. These are
// all reservoir-volume fractions (GRV·NTG·φ·(1−Sw)) so they share one honest axis.
const chainColors = ['#64748b', '#3b82f6', '#0ea5e9', '#059669'];

const ChainRow = ({ stage }) => (
    <div>
        <div className="flex items-baseline justify-between">
            <span className="text-[13.5px] font-semibold text-slate-700">{stage.label}</span>
            <span className="text-[14px] font-bold tabular-nums text-slate-800">
                {stage.value} <span className="text-[11px] font-medium text-slate-400">{stage.unit}</span>
            </span>
        </div>
        <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full" style={{ width: `${Math.max(stage.pct, 1.5)}%`, background: stage.color }} />
        </div>
        <div className="mt-0.5 flex items-center justify-between text-[11px] font-medium text-slate-400">
            <span>{stage.op}</span>
            <span>{fmtDec(stage.pct, 1)}% of GRV</span>
        </div>
    </div>
);

const DeterministicSlide = () => {
    const { state } = useReservoirCalc();
    const { toast } = useToast();
    const [isExporting, setIsExporting] = useState(false);
    const r = state.results;

    if (!r) {
        return (
            <SlideFrame fileName="reservoircalc-results">
                <div className="flex h-full items-center justify-center text-slate-400">Run a calculation to build the results slide.</div>
            </SlideFrame>
        );
    }

    const ft = r.fluidType || 'oil';
    const showOil = ft === 'oil' || ft === 'oil_gas';
    const showGas = ft === 'gas' || ft === 'oil_gas';
    const isField = (r.unitSystem || state.unitSystem) === 'field';
    const inp = r.inputs || state.inputs || {};
    const volumeUnit = r.volumeUnit || (isField ? 'STB' : 'sm³');
    const gasUnit = 'B' + (isField ? 'scf' : 'sm³');
    const project = state.currentProjectMeta?.name || state.reservoirName || 'Untitled Project';
    const dateStr = new Date().toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    // Hero tiles — headline in-place volumes, plus a rock-volume context tile.
    const hero = [];
    if (showOil) hero.push({
        label: 'STOOIP', value: scaleMM(r.stooip), unit: `MM${volumeUnit}`, palette: OIL, primary: true,
        sub: `Recoverable ${scaleMM(r.recoverableOil)} MM${volumeUnit} · RF ${fmtDec(inp.recovery, 0)}%`,
    });
    if (showGas) hero.push({
        label: 'GIIP', value: scaleB(r.giip), unit: gasUnit, palette: GAS, primary: true,
        sub: `Recoverable ${scaleB(r.recoverableGas)} ${gasUnit} · RF ${fmtDec(inp.recoveryGas, 0)}%`,
    });
    hero.push({
        label: 'Gross Rock Volume', value: fmtInt(r.bulkVolume), unit: r.volUnit, palette: SLATE, primary: false,
        sub: `HC area ${fmtInt(r.hcArea)} ${r.areaUnit || (isField ? 'acres' : 'km²')}`,
    });

    const ntg = inp.ntg ?? 0, phi = inp.porosity ?? 0, sw = inp.sw ?? 0;
    const chain = [
        { label: 'Gross Rock Volume', value: fmtInt(r.bulkVolume), unit: r.volUnit, pct: 100, op: 'structure × contacts', color: chainColors[0] },
        { label: 'Net Rock Volume', value: fmtInt(r.netVolume), unit: r.volUnit, pct: ntg * 100, op: `× NTG ${fmtDec(ntg, 2)}`, color: chainColors[1] },
        { label: 'Pore Volume', value: fmtInt(r.poreVolumeRes), unit: r.resVolUnit, pct: ntg * phi * 100, op: `× φ ${fmtDec(phi, 2)}`, color: chainColors[2] },
        { label: 'Hydrocarbon Pore Volume', value: fmtInt(r.hcPoreVolume), unit: r.resVolUnit, pct: ntg * phi * (1 - sw) * 100, op: `× (1−Sw) ${fmtDec(1 - sw, 2)}`, color: chainColors[3] },
    ];

    const warnings = r.warnings || [];
    const quality = r.qualityScore;
    const qTone = quality >= 85 ? { c: '#047857', b: 'border-emerald-200 bg-emerald-50', t: 'text-emerald-700' }
        : quality >= 60 ? { c: '#b45309', b: 'border-amber-200 bg-amber-50', t: 'text-amber-700' }
            : { c: '#b91c1c', b: 'border-red-200 bg-red-50', t: 'text-red-700' };

    const contactStr = [
        showOil && inp.owc != null ? `OWC ${inp.owc}` : null,
        showGas && inp.goc != null ? `GOC ${inp.goc}` : null,
    ].filter(Boolean).join('  ·  ') || '—';

    const exportPDF = async () => {
        setIsExporting(true);
        try {
            await ReportGenerator.generateDeterministicReport(project, r, r.unitSystem || state.unitSystem, { fluidType: ft, inputs: inp });
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
        <SlideFrame fileName={`${project.replace(/\s+/g, '_')}_volumetrics`} extraActions={pdfButton}>
            <SlideShell
                subtitle="Deterministic Volumetric Estimate"
                project={project}
                dateStr={dateStr}
                chips={<>
                    <Chip tone={showGas && !showOil ? 'gas' : 'oil'}>{ft === 'oil_gas' ? 'Oil & Gas' : ft.charAt(0).toUpperCase() + ft.slice(1)}</Chip>
                    <Chip tone="slate">{isField ? 'Field units' : 'Metric units'}</Chip>
                </>}
            >
                {/* Hero KPIs */}
                <div className="flex gap-4" style={{ height: 132 }}>
                    {hero.map((h) => <HeroTile key={h.label} {...h} />)}
                </div>

                {/* Two-column body: volumetric chain + parameters/quality */}
                <div className="flex min-h-0 flex-1 gap-4">
                    <Panel
                        title="Volumetric Chain"
                        icon={<Layers className="h-4 w-4 text-blue-500" />}
                        right={<span className="text-[11px] font-medium text-slate-400">rock → hydrocarbons</span>}
                        className="flex-[1.35] justify-between"
                    >
                        <div className="flex flex-col justify-between gap-2.5">
                            {chain.map((s) => <ChainRow key={s.label} stage={s} />)}
                        </div>
                        <div className="mt-3 flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
                            <Droplets className="h-4 w-4 shrink-0 text-emerald-600" />
                            <span className="text-[12px] font-medium text-slate-500">
                                {showOil && <>STOOIP = HCPV × {isField ? '7758' : '1'} / Bo ({fmtDec(inp.fvf, 2)})</>}
                                {showOil && showGas && <span className="mx-2 text-slate-300">|</span>}
                                {showGas && <>GIIP = HCPV × {isField ? '43560' : '1'} / Bg ({fmtDec(inp.bg, 4)})</>}
                            </span>
                        </div>
                    </Panel>

                    <div className="flex flex-1 flex-col gap-4">
                        <Panel title="Input Parameters" icon={<span className="text-[15px]">⚙︎</span>} className="flex-1">
                            <div className="grid grid-cols-2 gap-2">
                                <StatCell label="Net-to-Gross" value={fmtDec(ntg, 3)} />
                                <StatCell label="Porosity φ" value={fmtDec(phi, 3)} />
                                <StatCell label="Water Sat. Sw" value={fmtDec(sw, 3)} />
                                {showOil
                                    ? <StatCell label="Oil FVF Bo" value={fmtDec(inp.fvf, 3)} unit={isField ? 'RB/STB' : 'rm³/sm³'} />
                                    : <StatCell label="Gas FVF Bg" value={fmtDec(inp.bg, 4)} />}
                                <StatCell label="Fluid Contacts" value={contactStr} />
                                <StatCell label="Recovery" value={showOil ? `${fmtDec(inp.recovery, 0)}%` : `${fmtDec(inp.recoveryGas, 0)}%`} />
                            </div>
                        </Panel>

                        <div className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${qTone.b}`}>
                            <div className="flex items-center gap-2.5">
                                <ShieldCheck className="h-6 w-6" style={{ color: qTone.c }} />
                                <div>
                                    <div className={`text-[13px] font-bold ${qTone.t}`}>Input Quality</div>
                                    <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-slate-500">
                                        {warnings.length === 0
                                            ? 'Physically consistent'
                                            : <><AlertTriangle className="h-3.5 w-3.5 text-amber-500" />{warnings.length} issue{warnings.length > 1 ? 's' : ''} flagged</>}
                                    </div>
                                </div>
                            </div>
                            {quality != null && (
                                <div className="text-right">
                                    <span className="text-[30px] font-black tabular-nums" style={{ color: qTone.c }}>{quality}</span>
                                    <span className="text-[14px] font-semibold text-slate-400">/100</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </SlideShell>
        </SlideFrame>
    );
};

export default DeterministicSlide;
