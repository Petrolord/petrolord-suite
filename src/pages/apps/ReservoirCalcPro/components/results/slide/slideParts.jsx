import React from 'react';

/*
 * Shared building blocks for the presentation-ready "result slides".
 *
 * Every slide renders inside a fixed 1280×720 (16:9) white canvas so a screenshot
 * — or the built-in Copy/Download — drops straight onto a PowerPoint/Keynote slide
 * with no cropping or reflow. SlideShell supplies the Petrolord-branded header,
 * accent bar, footer and watermark; the individual slides fill the content area.
 */

export const OIL = { key: 'oil', main: '#047857', soft: '#ecfdf5', line: '#a7f3d0', text: '#065f46' };
export const GAS = { key: 'gas', main: '#b45309', soft: '#fffbeb', line: '#fde68a', text: '#92400e' };
export const SLATE = { main: '#334155', soft: '#f8fafc', line: '#e2e8f0', text: '#475569' };

export const fmtInt = (v) =>
    Number.isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—';

export const fmtDec = (v, d = 2) =>
    Number.isFinite(v) ? v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';

// Big headline number scaled to millions/billions for the hero tiles.
export const scaleMM = (v) => (Number.isFinite(v) ? (v / 1e6).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');
export const scaleB = (v) => (Number.isFinite(v) ? (v / 1e9).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : '—');

export const Chip = ({ children, tone = 'slate' }) => {
    const tones = {
        slate: 'bg-slate-100 text-slate-600 border-slate-200',
        oil: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        gas: 'bg-amber-50 text-amber-700 border-amber-200',
        blue: 'bg-blue-50 text-blue-700 border-blue-200',
    };
    return (
        <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-[13px] font-semibold leading-none ${tones[tone] || tones.slate}`}>
            {children}
        </span>
    );
};

// One labelled figure in the input / statistics grids.
export const StatCell = ({ label, value, unit, accent }) => (
    <div className={`rounded-lg border px-3 py-2.5 ${accent ? 'border-slate-300 bg-slate-50' : 'border-slate-200 bg-white'}`}>
        <div className="text-[12px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
        <div className="mt-0.5 flex items-baseline gap-1">
            <span className="text-[19px] font-bold text-slate-800 tabular-nums">{value}</span>
            {unit && <span className="text-[12px] font-medium text-slate-400">{unit}</span>}
        </div>
    </div>
);

// A hero KPI tile — the number an executive reads first.
export const HeroTile = ({ label, value, unit, sub, palette = SLATE, primary = false }) => (
    <div
        className="flex flex-1 flex-col justify-center rounded-2xl border px-6 py-4"
        style={{
            borderColor: primary ? palette.line : SLATE.line,
            background: primary ? palette.soft : '#ffffff',
        }}
    >
        <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: palette.main }} />
            <span className="text-[13px] font-bold uppercase tracking-wider" style={{ color: primary ? palette.text : SLATE.text }}>
                {label}
            </span>
        </div>
        <div className="mt-1 flex items-baseline gap-2">
            <span className={`font-black tracking-tight tabular-nums ${primary ? 'text-[52px]' : 'text-[34px]'}`} style={{ color: '#0f172a', lineHeight: 1 }}>
                {value}
            </span>
            <span className="text-[18px] font-semibold text-slate-400">{unit}</span>
        </div>
        {sub && <div className="mt-1.5 text-[13px] font-medium text-slate-500">{sub}</div>}
    </div>
);

// A titled panel used for the funnel / statistics columns.
export const Panel = ({ title, icon, right, children, className = '' }) => (
    <div className={`flex flex-col rounded-2xl border border-slate-200 bg-white p-4 ${className}`}>
        <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2 text-[15px] font-bold text-slate-700">
                {icon}
                {title}
            </div>
            {right}
        </div>
        {children}
    </div>
);

/**
 * The branded 16:9 shell every slide lives inside.
 * `subtitle` names the analysis, `chips` render fluid/unit context, `children`
 * is the slide body (a flex column that fills the remaining height).
 */
export const SlideShell = ({ subtitle, project, dateStr, chips, children }) => (
    <div className="flex h-full w-full flex-col px-11 py-8" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
        {/* Header */}
        <div className="flex items-start justify-between">
            <div className="flex items-center gap-3.5">
                <img src="/petrolord-icon.png" alt="Petrolord" className="h-12 w-12 rounded-lg object-contain" crossOrigin="anonymous" />
                <div>
                    <div className="text-[26px] font-black leading-none tracking-tight text-slate-900">
                        ReservoirCalc <span className="text-emerald-600">Pro</span>
                    </div>
                    <div className="mt-1 text-[14px] font-semibold text-slate-500">{subtitle}</div>
                </div>
            </div>
            <div className="text-right">
                <div className="max-w-[420px] truncate text-[22px] font-bold text-slate-800">{project}</div>
                <div className="mt-1.5 flex items-center justify-end gap-2">{chips}</div>
                <div className="mt-1.5 text-[12px] font-medium text-slate-400">{dateStr}</div>
            </div>
        </div>

        {/* Accent bar */}
        <div className="mt-4 h-1.5 w-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-500 to-blue-600" />

        {/* Body */}
        <div className="mt-5 flex min-h-0 flex-1 flex-col gap-4">{children}</div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
            <div className="text-[12px] font-medium text-slate-400">
                Generated with <span className="font-bold text-slate-500">Petrolord Suite</span> · ReservoirCalc Pro — screening estimate, confirm against reservoir simulation before reserves booking.
            </div>
            <div className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> petrolord.com
            </div>
        </div>
    </div>
);
