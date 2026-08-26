// Completion schematic: an honest SVG drawing of the exposed casing program
// and the completion stack, to depth scale in MD. White canvas + ChartLogo
// per the suite chart standard. No decorative fluid fills, no pretend TOC —
// only what the case actually models.

import React, { useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import ChartLogo from '@/components/charts/ChartLogo';
import { resolveProgram, depthDisp, depthLabel } from '../services/cdRun';

const W = 720;
const AXIS_X = 66;
const CX = 300; // wellbore centreline
const LABEL_X = 470;
const PX_PER_IN = 14; // diameter -> px

const TYPE_FILL = {
  tubing: '#94a3b8',
  'flow-coupling': '#64748b',
  'blast-joint': '#475569',
  sssv: '#0e7490',
  'nipple-x': '#7c3aed',
  'nipple-xn': '#6d28d9',
  'sliding-sleeve': '#b45309',
  spm: '#15803d',
  'expansion-joint': '#334155',
  packer: '#111827',
  pbr: '#9333ea',
  'seal-assembly': '#a855f7',
  'perforated-joint': '#dc2626',
  weg: '#64748b',
  custom: '#0f766e',
};

function niceTicks(maxV, n = 8) {
  const raw = maxV / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => maxV / s <= n) || mag * 10;
  const ticks = [];
  for (let v = 0; v <= maxV + 1e-9; v += step) ticks.push(v);
  return ticks;
}

export default function CdSchematic({ caseDraft, res, depthUnit, wellboreName, height = 640 }) {
  const svgRef = useRef(null);
  const unit = depthLabel(depthUnit);

  const model = useMemo(() => {
    if (!res) return null;
    let strings = [];
    try {
      strings = resolveProgram(caseDraft.casing_program);
    } catch {
      strings = [];
    }
    const maxMd = Math.max(
      res.tdMdM,
      res.stack.bottomMdM,
      ...strings.flatMap((s) => s.sections.map((x) => x.bottomMdM)),
    ) * 1.03;
    return { strings, maxMd };
  }, [caseDraft, res]);

  if (!res || !model) {
    return <div className="flex h-64 items-center justify-center text-sm text-slate-500">Fix the case inputs to draw the schematic.</div>;
  }

  const H = height;
  const TOP = 34;
  const BOT = H - 26;
  const y = (md) => TOP + ((BOT - TOP) * md) / model.maxMd;
  const hw = (odIn) => (odIn * PX_PER_IN) / 2;

  const exportPng = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = W * 2;
      canvas.height = H * 2;
      const ctx = canvas.getContext('2d');
      ctx.scale(2, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(img, 0, 0, W, H);
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `${caseDraft.name || 'completion'}-schematic.png`;
      a.click();
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  };

  // Right-hand labels for jewelry (everything except plain tubing joints),
  // pushed apart vertically so they stay readable.
  const labels = [];
  let lastY = -Infinity;
  for (const c of res.stack.components) {
    if (c.type === 'tubing') continue;
    const midY = Math.max((y(c.topMdM) + y(c.bottomMdM)) / 2, lastY + 13);
    lastY = midY;
    labels.push({
      y: midY,
      anchorY: (y(c.topMdM) + y(c.bottomMdM)) / 2,
      text: `${c.name} @ ${Math.round(depthDisp(c.topMdM, depthUnit))} ${unit}`,
      color: TYPE_FILL[c.type] || '#334155',
    });
  }

  const ticks = niceTicks(model.maxMd);

  return (
    <div className="relative flex w-full flex-col overflow-hidden rounded-md bg-white" data-testid="cd-schematic">
      <div className="flex items-center justify-between px-3 pt-2">
        <span className="text-[11px] font-semibold text-slate-700">
          Completion schematic — {caseDraft.name}{wellboreName ? ` (${wellboreName})` : ''} (MD {unit}, diameters to scale)
        </span>
        <Button size="sm" variant="ghost" className="h-6 text-[11px] text-slate-500 hover:text-slate-800" onClick={exportPng} data-testid="cd-schematic-png">
          <Download className="mr-1 h-3 w-3" /> PNG
        </Button>
      </div>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxHeight: H }} xmlns="http://www.w3.org/2000/svg">
        {/* depth axis */}
        <line x1={AXIS_X} y1={TOP} x2={AXIS_X} y2={BOT} stroke="#cbd5e1" />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={AXIS_X - 4} y1={y(t)} x2={AXIS_X} y2={y(t)} stroke="#94a3b8" />
            <text x={AXIS_X - 7} y={y(t) + 3} textAnchor="end" fontSize="9" fill="#64748b">
              {Math.round(depthDisp(t, depthUnit))}
            </text>
          </g>
        ))}
        <text x={AXIS_X - 40} y={TOP - 12} fontSize="9" fill="#64748b">MD ({unit})</text>

        {/* casing strings: wall pairs + shoe chevrons */}
        {model.strings.map((s, si) => s.sections.map((sec, i) => {
          const odw = hw(sec.odM / 0.0254);
          const isShoe = i === s.sections.length - 1;
          return (
            <g key={`${si}-${i}`}>
              <line x1={CX - odw} y1={y(sec.topMdM)} x2={CX - odw} y2={y(sec.bottomMdM)} stroke="#475569" strokeWidth="2.5" />
              <line x1={CX + odw} y1={y(sec.topMdM)} x2={CX + odw} y2={y(sec.bottomMdM)} stroke="#475569" strokeWidth="2.5" />
              {isShoe && (
                <>
                  <path d={`M ${CX - odw - 6} ${y(sec.bottomMdM)} L ${CX - odw} ${y(sec.bottomMdM) - 8} L ${CX - odw} ${y(sec.bottomMdM)} Z`} fill="#475569" />
                  <path d={`M ${CX + odw + 6} ${y(sec.bottomMdM)} L ${CX + odw} ${y(sec.bottomMdM) - 8} L ${CX + odw} ${y(sec.bottomMdM)} Z`} fill="#475569" />
                  <text x={CX + odw + 9} y={y(sec.bottomMdM) + 3} fontSize="8.5" fill="#475569">
                    {s.name} shoe {Math.round(depthDisp(sec.bottomMdM, depthUnit))} {unit}
                  </text>
                </>
              )}
            </g>
          );
        }))}

        {/* completion components */}
        {res.stack.components.map((c, i) => {
          const w = hw(c.odIn);
          const y0 = y(c.topMdM);
          const y1 = Math.max(y(c.bottomMdM), y0 + 2);
          const fill = TYPE_FILL[c.type] || '#334155';
          return (
            <g key={c.id || i}>
              <rect x={CX - w} y={y0} width={2 * w} height={y1 - y0} fill={fill}
                fillOpacity={c.type === 'tubing' ? 0.55 : 0.9} stroke="#1e293b" strokeWidth="0.4" />
              {c.type === 'packer' && (
                <>
                  <path d={`M ${CX - w - 7} ${y0} L ${CX - w} ${y0} L ${CX - w} ${y1} L ${CX - w - 7} ${y1} Z`} fill="#111827" />
                  <path d={`M ${CX + w + 7} ${y0} L ${CX + w} ${y0} L ${CX + w} ${y1} L ${CX + w + 7} ${y1} Z`} fill="#111827" />
                </>
              )}
              {c.type === 'perforated-joint' && [0.25, 0.5, 0.75].map((f) => (
                <g key={f}>
                  <circle cx={CX - w - 4} cy={y0 + f * (y1 - y0)} r={1.6} fill="#dc2626" />
                  <circle cx={CX + w + 4} cy={y0 + f * (y1 - y0)} r={1.6} fill="#dc2626" />
                </g>
              ))}
              {c.type === 'sssv' && (
                <path d={`M ${CX - w} ${(y0 + y1) / 2 - 4} L ${CX + w} ${(y0 + y1) / 2 + 4} M ${CX - w} ${(y0 + y1) / 2 + 4} L ${CX + w} ${(y0 + y1) / 2 - 4}`} stroke="#e0f2fe" strokeWidth="1.2" />
              )}
            </g>
          );
        })}

        {/* TD marker */}
        <line x1={CX - 60} y1={y(res.tdMdM)} x2={CX + 60} y2={y(res.tdMdM)} stroke="#94a3b8" strokeDasharray="4 3" />
        <text x={CX - 60} y={y(res.tdMdM) + 11} fontSize="8.5" fill="#64748b">TD {Math.round(depthDisp(res.tdMdM, depthUnit))} {unit}</text>

        {/* jewelry labels with leader lines */}
        {labels.map((l, i) => (
          <g key={i}>
            <line x1={CX + 62} y1={l.anchorY} x2={LABEL_X - 4} y2={l.y} stroke="#cbd5e1" strokeWidth="0.7" />
            <circle cx={CX + 62} cy={l.anchorY} r={1.4} fill={l.color} />
            <text x={LABEL_X} y={l.y + 3} fontSize="9" fill="#334155">{l.text}</text>
          </g>
        ))}
      </svg>
      <ChartLogo style={{ height: 36 }} />
    </div>
  );
}
