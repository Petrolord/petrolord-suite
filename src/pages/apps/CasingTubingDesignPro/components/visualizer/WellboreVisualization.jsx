import React, { useMemo } from 'react';
import { depthDisp, depthLabel } from '../../services/ctRun';

// Full-well schematic: casing strings (per-section OD), tubing, packer.
// MD metres in, display unit on labels. No fake cement — cement placement
// design lives in Cementing Studio.
const WellboreVisualization = ({
  casingStrings = [], tubingStrings = [], packer = null, depthUnit = 'm',
  width = 600, height = 600,
}) => {
  const unit = depthLabel(depthUnit);

  const allSections = useMemo(() => [
    ...casingStrings.flatMap((s) => s.sections.map((sec) => ({ ...sec, stringName: s.name }))),
    ...tubingStrings.flatMap((s) => s.sections.map((sec) => ({ ...sec, stringName: s.name, isTubing: true }))),
  ], [casingStrings, tubingStrings]);

  if (!allSections.length) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-slate-600 bg-slate-950">
        Add casing or tubing strings to draw the schematic.
      </div>
    );
  }

  const maxDepth = Math.max(...allSections.map((s) => s.bottomMdM)) * 1.1;
  const maxOD = Math.max(20, ...allSections.map((s) => s.odIn)) * 1.5;
  const scaleY = (depth) => (depth / maxDepth) * height;
  const scaleX = (od) => (od / maxOD) * width;
  const cx = width / 2;

  const sortedCasingStrings = [...casingStrings].sort(
    (a, b) => Math.max(...b.sections.map((s) => s.odIn)) - Math.max(...a.sections.map((s) => s.odIn)),
  );
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  return (
    <div className="w-full h-full flex justify-center bg-slate-950 overflow-hidden relative">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMin meet">
        <defs>
          <pattern id="vis-grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#1e293b" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#vis-grid)" />

        <line x1="0" y1="0" x2={width} y2="0" stroke="#64748b" strokeWidth="2" />
        <text x="5" y="15" fill="#64748b" fontSize="10" fontFamily="monospace">0 {unit}</text>

        {sortedCasingStrings.map((casing, idx) => {
          const color = colors[idx % colors.length];
          const shoeMd = Math.max(...casing.sections.map((s) => s.bottomMdM));
          const od = Math.max(...casing.sections.map((s) => s.odIn));
          return (
            <g key={casing.id}>
              {casing.sections.map((sec) => {
                const w = scaleX(sec.odIn);
                const y = scaleY(sec.topMdM);
                const h = scaleY(sec.bottomMdM) - y;
                return (
                  <rect
                    key={sec.id}
                    x={cx - w / 2}
                    y={y}
                    width={w}
                    height={h}
                    fill="none"
                    stroke={color}
                    strokeWidth="2"
                  />
                );
              })}
              {(() => {
                const w = scaleX(od);
                const yShoe = scaleY(shoeMd);
                return (
                  <polygon
                    points={`${cx - w / 2},${yShoe} ${cx + w / 2},${yShoe} ${cx},${yShoe + scaleY(maxDepth * 0.015)}`}
                    fill={color}
                    opacity="0.5"
                  />
                );
              })()}
              <text x={cx + scaleX(od) / 2 + 5} y={scaleY(shoeMd)} fill={color} fontSize="9" alignmentBaseline="middle">
                {casing.name} ({od}&quot;) @ {Math.round(depthDisp(shoeMd, depthUnit))}{unit}
              </text>
            </g>
          );
        })}

        {tubingStrings.map((tubing) => tubing.sections.map((sec) => {
          const w = Math.max(scaleX(sec.odIn), 4);
          const y = scaleY(sec.topMdM);
          const h = scaleY(sec.bottomMdM) - y;
          return (
            <g key={sec.id}>
              <rect
                x={cx - w / 2}
                y={y}
                width={w}
                height={h}
                fill="#a855f7"
                fillOpacity="0.3"
                stroke="#a855f7"
                strokeWidth="1"
              />
              <text x={cx - w / 2 - 65} y={y + h - 10} fill="#a855f7" fontSize="9">
                Tubing ({sec.odIn}&quot;)
              </text>
            </g>
          );
        }))}

        {packer?.hasPacker && (() => {
          const cy = scaleY(packer.depthMdM);
          return (
            <g>
              <polygon points={`${cx - 15},${cy} ${cx - 5},${cy - 5} ${cx - 5},${cy + 5}`} fill="#ef4444" />
              <polygon points={`${cx + 15},${cy} ${cx + 5},${cy - 5} ${cx + 5},${cy + 5}`} fill="#ef4444" />
              <text x={cx + 20} y={cy} fill="#ef4444" fontSize="9" alignmentBaseline="middle">
                Packer @ {Math.round(depthDisp(packer.depthMdM, depthUnit))}{unit}
              </text>
            </g>
          );
        })()}

        <line x1="20" y1="0" x2="20" y2={height} stroke="#334155" strokeWidth="1" />
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1="15" y1={height * f} x2="25" y2={height * f} stroke="#64748b" />
            <text x="10" y={height * f + 3} textAnchor="end" fill="#64748b" fontSize="9">
              {Math.round(depthDisp(maxDepth * f, depthUnit))}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
};

export default WellboreVisualization;
