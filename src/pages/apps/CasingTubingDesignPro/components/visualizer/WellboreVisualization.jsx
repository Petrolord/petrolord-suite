// Full-well schematic (Casing & Tubing Design Studio): every casing string
// with its per-section OD, the tubing, the packer, and a casing shoe symbol
// with its depth on every string. White chart background with the
// Petrolord mark (tester fix 2026-09-07), a depth axis at round steps in
// the display unit, and a vertical exaggeration control: stretch or
// squeeze the depth scale while the diameters stay put, so a deep well
// with thin strings can still be read. MD metres in, display unit on
// labels. No fake cement: cement placement lives in Cementing Studio.

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Minus, Plus, Maximize2 } from 'lucide-react';
import ChartLogo from '@/components/charts/ChartLogo';
import { depthDisp, depthLabel } from '../../services/ctRun';

export const VEX_MIN = 0.5;
export const VEX_MAX = 8;
export const VEX_STEP = 0.5;
const clampVex = (v) => Math.min(VEX_MAX, Math.max(VEX_MIN, Math.round(v / VEX_STEP) * VEX_STEP));

const readVex = (key) => { try { const v = Number(localStorage.getItem(`ct-viz-vex:${key}`)); return v > 0 ? clampVex(v) : 1; } catch { return 1; } };
const writeVex = (key, v) => { try { localStorage.setItem(`ct-viz-vex:${key}`, String(v)); } catch { /* storage may be blocked */ } };

/** Round tick step so the axis carries roughly 6 to 10 labels. */
export function depthTickStep(maxDisp) {
  const raw = maxDisp / 8;
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= raw) return m * pow;
  return 10 * pow;
}

const CASING_COLORS = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed'];
const TUBING_COLOR = '#9333ea';
const PACKER_COLOR = '#dc2626';
const TEXT = '#1e293b';
const MUTED = '#64748b';
const GRID = '#e2e8f0';

const TOOLBAR_H = 26;
const FOOTER_H = 22;

const WellboreVisualization = ({
  casingStrings = [], tubingStrings = [], packer = null, depthUnit = 'm',
  width: widthProp = null, baseHeight: baseHeightProp = null, storageKey = 'full', compact = false,
  emptyText = 'Add casing or tubing strings to draw the schematic.',
}) => {
  const unit = depthLabel(depthUnit);
  const [vex, setVex] = useState(() => readVex(storageKey));
  useEffect(() => { writeVex(storageKey, vex); }, [storageKey, vex]);
  const bump = (d) => setVex((v) => clampVex(v + d));

  // size to the box we are given: x1 means the whole well fits the box;
  // stretching scrolls. Explicit props still win (tests, exports).
  const boxRef = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect;
      setBox((b) => (Math.abs(b.w - w) > 1 || Math.abs(b.h - h) > 1 ? { w, h } : b));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const width = widthProp || Math.max(compact ? 160 : 320, Math.floor(box.w) - 2);
  const baseHeight = baseHeightProp || Math.max(compact ? 200 : 320, Math.floor(box.h) - TOOLBAR_H - FOOTER_H - 4);

  const allSections = useMemo(() => [
    ...casingStrings.flatMap((s) => (s.sections || []).map((sec) => ({ ...sec, stringName: s.name }))),
    ...tubingStrings.flatMap((s) => (s.sections || []).map((sec) => ({ ...sec, stringName: s.name, isTubing: true }))),
  ], [casingStrings, tubingStrings]);

  if (!allSections.length) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-slate-500 bg-white" data-testid="ct-viz-empty">
        {emptyText}
      </div>
    );
  }

  const axisW = compact ? 44 : 60;
  const plotW = width - axisW;
  const height = Math.round(baseHeight * vex);
  const maxDepth = Math.max(...allSections.map((s) => s.bottomMdM), packer?.hasPacker ? packer.depthMdM : 0) * (compact ? 1.14 : 1.08);
  const maxOD = Math.max(20, ...allSections.map((s) => s.odIn)) * 1.4;
  const scaleY = (depth) => (depth / maxDepth) * height;
  const scaleX = (od) => (od / maxOD) * plotW;
  const cx = axisW + plotW / 2;

  const sortedCasing = [...casingStrings].filter((s) => s.sections?.length).sort(
    (a, b) => Math.max(...b.sections.map((s) => s.odIn)) - Math.max(...a.sections.map((s) => s.odIn)),
  );
  const maxDisp = depthDisp(maxDepth, depthUnit);
  const step = depthTickStep(maxDisp);
  const ticks = [];
  for (let d = 0; d <= maxDisp; d += step) ticks.push(d);
  const toMd = (disp) => (depthUnit === 'ft' ? disp * 0.3048 : disp);
  const fs = compact ? 8 : 10;

  const narrow = width < 260;
  return (
    <div ref={boxRef} className="w-full h-full relative bg-white overflow-hidden flex flex-col" data-testid="ct-viz">
      <div className={`shrink-0 flex items-center justify-end gap-1 border-b border-slate-200 bg-slate-50 px-1.5 ${compact ? 'text-[10px]' : 'text-xs'} text-slate-600`} style={{ height: TOOLBAR_H }} title="Vertical exaggeration: stretch or squeeze the depth scale; diameters stay to scale">
        {!narrow && <span className="text-slate-500 mr-auto">Vertical scale</span>}
        <button type="button" data-testid="ct-viz-squeeze" className="rounded border border-slate-300 px-1 hover:bg-slate-100 disabled:opacity-40" disabled={vex <= VEX_MIN} onClick={() => bump(-VEX_STEP)} title="Squeeze"><Minus className="w-3 h-3" /></button>
        {!narrow && (
          <input
            type="range" min={VEX_MIN} max={VEX_MAX} step={VEX_STEP} value={vex}
            className="w-16 accent-cyan-600" data-testid="ct-viz-vex-slider"
            onChange={(e) => setVex(clampVex(Number(e.target.value)))}
            title="Vertical exaggeration"
          />
        )}
        <button type="button" data-testid="ct-viz-stretch" className="rounded border border-slate-300 px-1 hover:bg-slate-100 disabled:opacity-40" disabled={vex >= VEX_MAX} onClick={() => bump(VEX_STEP)} title="Stretch"><Plus className="w-3 h-3" /></button>
        <span className="font-mono text-slate-700 text-right" style={{ minWidth: 28 }} data-testid="ct-viz-vex">×{vex}</span>
        <button type="button" data-testid="ct-viz-fit" className="rounded border border-slate-300 px-1 hover:bg-slate-100" onClick={() => setVex(1)} title="Reset to fit"><Maximize2 className="w-3 h-3" /></button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto relative">
        <svg width={width} height={height + 24} data-testid="ct-viz-svg" style={{ display: 'block', margin: '0 auto' }}>
          <defs>
            <pattern id={`ct-grid-${storageKey}`} width="50" height="50" patternUnits="userSpaceOnUse">
              <path d="M 50 0 L 0 0 0 50" fill="none" stroke={GRID} strokeWidth="0.6" />
            </pattern>
          </defs>
          <rect x={axisW} y="0" width={plotW} height={height} fill={`url(#ct-grid-${storageKey})`} />

          {/* depth axis */}
          <line x1={axisW} y1="0" x2={axisW} y2={height} stroke={MUTED} strokeWidth="1" />
          {ticks.map((d) => {
            const y = scaleY(toMd(d));
            return (
              <g key={d}>
                <line x1={axisW - 5} y1={y} x2={axisW} y2={y} stroke={MUTED} />
                <line x1={axisW} y1={y} x2={axisW + plotW} y2={y} stroke={GRID} strokeWidth="0.8" />
                <text x={axisW - 7} y={y + 3} textAnchor="end" fill={TEXT} fontSize={fs} fontFamily="monospace">{Math.round(d)}</text>
              </g>
            );
          })}
          <text x={axisW - 7} y={height + 16} textAnchor="end" fill={MUTED} fontSize={fs}>MD {unit}</text>

          {/* ground line + centre line */}
          <line x1={axisW} y1="1" x2={axisW + plotW} y2="1" stroke="#334155" strokeWidth="2" />
          <line x1={cx} y1="0" x2={cx} y2={height} stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 4" />

          {/* casing strings, largest OD first so the inner ones draw on top */}
          {sortedCasing.map((casing, idx) => {
            const color = CASING_COLORS[idx % CASING_COLORS.length];
            const shoeMd = Math.max(...casing.sections.map((s) => s.bottomMdM));
            const topMd = Math.min(...casing.sections.map((s) => s.topMdM));
            const od = Math.max(...casing.sections.map((s) => s.odIn));
            const w = scaleX(od);
            const yShoe = scaleY(shoeMd);
            const shoeH = Math.max(6, Math.min(14, 0.012 * height));
            const shoeW = Math.max(6, Math.min(12, w * 0.25));
            const shoeText = `Shoe ${Math.round(depthDisp(shoeMd, depthUnit))} ${unit}`;
            return (
              <g key={casing.id} data-testid={`ct-viz-string-${casing.name}`}>
                {casing.sections.map((sec) => {
                  const sw = scaleX(sec.odIn);
                  const y = scaleY(sec.topMdM);
                  const h = Math.max(1, scaleY(sec.bottomMdM) - y);
                  return (
                    <rect key={sec.id} x={cx - sw / 2} y={y} width={sw} height={h} fill={color} fillOpacity="0.08" stroke={color} strokeWidth="2">
                      <title>{casing.name} · {sec.name}: {sec.odIn}&quot; {sec.weightLbFt ? `${sec.weightLbFt}# ` : ''}{sec.grade || ''} {Math.round(depthDisp(sec.topMdM, depthUnit))} to {Math.round(depthDisp(sec.bottomMdM, depthUnit))} {unit}</title>
                    </rect>
                  );
                })}
                {/* casing shoe: the classic paired wedges at the bottom of the string, pointing in */}
                <polygon points={`${cx - w / 2},${yShoe - shoeH} ${cx - w / 2},${yShoe} ${cx - w / 2 + shoeW},${yShoe}`} fill={color} />
                <polygon points={`${cx + w / 2},${yShoe - shoeH} ${cx + w / 2},${yShoe} ${cx + w / 2 - shoeW},${yShoe}`} fill={color} />
                <line x1={cx - w / 2 - 4} y1={yShoe} x2={cx + w / 2 + 4} y2={yShoe} stroke={color} strokeWidth="1.5" />
                {/* compact cards have no room beside the string: labels sit on the centre line */}
                <text
                  x={compact ? cx : cx + w / 2 + 8}
                  y={compact ? yShoe + fs + 4 : yShoe + 3}
                  textAnchor={compact ? 'middle' : 'start'}
                  fill={color} fontSize={fs} fontWeight="700" data-testid={`ct-viz-shoe-${casing.name}`}
                >
                  {shoeText}
                </text>
                <text
                  x={compact ? cx : cx + w / 2 + 8}
                  y={scaleY(topMd) + fs + 3}
                  textAnchor={compact ? 'middle' : 'start'}
                  fill={color} fontSize={fs}
                >
                  {compact ? `${casing.name} ${od}"` : `${casing.name} (${od}")`}
                </text>
              </g>
            );
          })}

          {tubingStrings.map((tubing) => (tubing.sections || []).map((sec) => {
            const w = Math.max(scaleX(sec.odIn), 4);
            const y = scaleY(sec.topMdM);
            const h = Math.max(1, scaleY(sec.bottomMdM) - y);
            return (
              <g key={sec.id}>
                <rect x={cx - w / 2} y={y} width={w} height={h} fill={TUBING_COLOR} fillOpacity="0.25" stroke={TUBING_COLOR} strokeWidth="1.2">
                  <title>{tubing.name} · {sec.name}: {sec.odIn}&quot; {sec.weightLbFt ? `${sec.weightLbFt}# ` : ''}{sec.grade || ''}</title>
                </rect>
                <text
                  x={compact ? cx : cx - w / 2 - 6}
                  y={compact ? y + h - 5 : y + h - 4}
                  textAnchor={compact ? 'middle' : 'end'}
                  fill={TUBING_COLOR} fontSize={fs}
                >
                  {compact ? `Tubing ${sec.odIn}" to ${Math.round(depthDisp(sec.bottomMdM, depthUnit))} ${unit}` : `Tubing ${sec.odIn}" to ${Math.round(depthDisp(sec.bottomMdM, depthUnit))} ${unit}`}
                </text>
              </g>
            );
          }))}

          {packer?.hasPacker && (() => {
            const cy = scaleY(packer.depthMdM);
            return (
              <g data-testid="ct-viz-packer">
                <polygon points={`${cx - 16},${cy} ${cx - 5},${cy - 5} ${cx - 5},${cy + 5}`} fill={PACKER_COLOR} />
                <polygon points={`${cx + 16},${cy} ${cx + 5},${cy - 5} ${cx + 5},${cy + 5}`} fill={PACKER_COLOR} />
                <text
                  x={compact ? cx : cx + 20}
                  y={compact ? cy + fs + 6 : cy + 3}
                  textAnchor={compact ? 'middle' : 'start'}
                  fill={PACKER_COLOR} fontSize={fs}
                >
                  Packer {Math.round(depthDisp(packer.depthMdM, depthUnit))} {unit}
                </text>
              </g>
            );
          })()}
        </svg>
      </div>

      <div className={`shrink-0 flex items-center border-t border-slate-200 bg-slate-50 px-1.5 ${compact ? 'text-[9px]' : 'text-[10px]'} text-slate-500 font-mono`} style={{ height: FOOTER_H }} data-testid="ct-viz-scale">
        {narrow ? `×${vex}` : `1 px = ${(maxDisp / height).toFixed(2)} ${unit} · diameters to scale, depth ×${vex}`}
      </div>
      <ChartLogo style={{ bottom: `${FOOTER_H + 4}px`, right: '10px', ...(compact ? { height: '22px', opacity: 0.45 } : {}) }} />
    </div>
  );
};

export default WellboreVisualization;
