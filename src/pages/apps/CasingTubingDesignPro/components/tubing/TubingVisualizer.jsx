import React from 'react';
import { depthDisp, depthLabel } from '../../services/ctRun';

// Schematic of the tubing string with the packer (from the case doc) and
// any schematic completion components. MD metres in, display unit out.
const TubingVisualizer = ({ activeString, packer, depthUnit = 'm' }) => {
  if (!activeString || !activeString.sections || activeString.sections.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-slate-600 bg-slate-950">
        No active string to visualize.
      </div>
    );
  }

  const sections = activeString.sections;
  const components = activeString.components || [];
  const unit = depthLabel(depthUnit);

  const maxDepth = Math.max(
    ...sections.map((s) => s.bottomMdM),
    packer?.hasPacker ? packer.depthMdM : 0,
    ...(components.length ? components.map((c) => c.depthMdM || 0) : [0]),
  ) * 1.1;

  const width = 200;
  const height = 400;
  const scaleY = (depth) => (depth / maxDepth) * height;

  return (
    <div className="w-full h-full flex items-center justify-center bg-slate-950 relative overflow-hidden">
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMin slice" className="max-h-full">
        <defs>
          <pattern id="grid-tubing" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#1e293b" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid-tubing)" />

        <line x1="0" y1="0" x2={width} y2="0" stroke="#94a3b8" strokeWidth="2" />
        <line x1={width / 2} y1="0" x2={width / 2} y2={height} stroke="#334155" strokeWidth="1" strokeDasharray="4 4" />

        {sections.map((sec) => {
          const topY = scaleY(sec.topMdM);
          const bottomY = scaleY(sec.bottomMdM);
          const sectionWidth = 10;
          const startX = (width - sectionWidth) / 2;
          return (
            <g key={sec.id}>
              <rect
                x={startX}
                y={topY}
                width={sectionWidth}
                height={bottomY - topY}
                fill="#3b82f6"
                fillOpacity="0.4"
                stroke="#60a5fa"
                strokeWidth="1"
              />
              <title>{sec.name}: {sec.odIn}&quot; {sec.weightLbFt}# {sec.grade}</title>
            </g>
          );
        })}

        {packer?.hasPacker && (() => {
          const cy = scaleY(packer.depthMdM);
          const cx = width / 2;
          return (
            <g>
              <polygon points={`${cx - 15},${cy} ${cx},${cy - 8} ${cx + 15},${cy} ${cx},${cy + 8}`} fill="#ef4444" stroke="white" strokeWidth="0.5" />
              <text x={cx + 20} y={cy + 3} fill="#ef4444" fontSize="8" fontFamily="monospace">
                Packer @ {Math.round(depthDisp(packer.depthMdM, depthUnit))}{unit}
              </text>
            </g>
          );
        })()}

        {components.map((comp) => {
          const depthY = scaleY(comp.depthMdM || 0);
          const cx = width / 2;
          let shape;
          if ((comp.type || '').includes('Valve')) {
            shape = <circle cx={cx} cy={depthY} r="6" fill="#f97316" stroke="white" strokeWidth="0.5" />;
          } else {
            shape = <rect x={cx - 12} y={depthY - 3} width="24" height="6" fill="#eab308" stroke="white" strokeWidth="0.5" />;
          }
          return (
            <g key={comp.id} className="group cursor-pointer">
              {shape}
              <title>{comp.type} @ {Math.round(depthDisp(comp.depthMdM || 0, depthUnit))}{unit}</title>
            </g>
          );
        })}

        <text x="5" y="15" fill="#64748b" fontSize="8" fontFamily="monospace">0{unit}</text>
        <text x="5" y={height - 5} fill="#64748b" fontSize="8" fontFamily="monospace">
          {Math.round(depthDisp(maxDepth, depthUnit))}{unit}
        </text>
      </svg>

      <div className="absolute bottom-2 right-2 bg-slate-900/80 p-2 rounded border border-slate-800 backdrop-blur-sm">
        <div className="text-[10px] text-slate-400 font-mono">
          Blue: Tubing
          <br />Red: Packer
        </div>
      </div>
    </div>
  );
};

export default TubingVisualizer;
