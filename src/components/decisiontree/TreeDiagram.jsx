import React, { useMemo } from 'react';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS, CHART_TYPOGRAPHY } from '@/utils/chartTheme';

// SVG decision-tree diagram (D3). Industry drawing conventions: squares are
// decisions, circles are chance nodes, triangles are terminals. Branches on
// the optimal path draw solid emerald; pruned decision branches draw dashed
// grey. Rendered on the white chart surface with the ChartLogo watermark,
// matching the Suite chart standard (this is bespoke SVG, not recharts, so
// the frame is drawn directly rather than through ChartFrame).

const NODE_R = 9;
const COL_W = 190;
const ROW_H = 56;
const PAD = { left: 16, right: 170, top: 24, bottom: 16 };

const fmt = (v) => {
  if (!Number.isFinite(v)) return '';
  const digits = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2;
  return v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
};

// Assign layout positions: leaves get consecutive rows, parents center on
// their children, x advances by depth.
function layoutTree(root) {
  const nodes = [];
  const edges = [];
  let leafRow = 0;
  let maxDepth = 0;

  const walk = (node, depth, incoming) => {
    maxDepth = Math.max(maxDepth, depth);
    let y;
    if (node.type === 'terminal' || !node.branches?.length) {
      y = leafRow++ * ROW_H;
    } else {
      const childYs = node.branches.map((b) => walk(b.node, depth + 1, b));
      y = (Math.min(...childYs) + Math.max(...childYs)) / 2;
      node.branches.forEach((b, i) => {
        edges.push({ from: { depth, y }, to: { depth: depth + 1, y: childYs[i] }, branch: b });
      });
    }
    nodes.push({ node, depth, y, incoming });
    return y;
  };

  walk(root, 0, null);
  return { nodes, edges, rows: leafRow, cols: maxDepth + 1 };
}

const NodeGlyph = ({ type, x, y, onPath }) => {
  const stroke = onPath ? '#059669' : CHART_COLORS.axisLine;
  const fill = onPath ? '#ecfdf5' : '#ffffff';
  if (type === 'decision') {
    return <rect x={x - NODE_R} y={y - NODE_R} width={NODE_R * 2} height={NODE_R * 2} fill={fill} stroke={stroke} strokeWidth={1.6} />;
  }
  if (type === 'chance') {
    return <circle cx={x} cy={y} r={NODE_R} fill={fill} stroke={stroke} strokeWidth={1.6} />;
  }
  return <path d={`M ${x - NODE_R} ${y - NODE_R} L ${x + NODE_R} ${y} L ${x - NODE_R} ${y + NODE_R} Z`} fill={fill} stroke={stroke} strokeWidth={1.4} />;
};

const TreeDiagram = ({ annotated, unit = '$MM' }) => {
  const layout = useMemo(() => (annotated ? layoutTree(annotated) : null), [annotated]);
  if (!layout) return null;

  const width = PAD.left + layout.cols * COL_W + PAD.right;
  const height = PAD.top + Math.max(1, layout.rows - 1) * ROW_H + NODE_R * 2 + PAD.bottom;
  const X = (depth) => PAD.left + NODE_R + depth * COL_W;
  const Y = (y) => PAD.top + NODE_R + y;
  const fs = CHART_TYPOGRAPHY.axisFontSize;

  return (
    <div className="relative bg-white rounded-lg overflow-x-auto" style={{ paddingBottom: 56 }}>
      <svg width={width} height={height} role="img" aria-label="Decision tree diagram">
        {/* edges first */}
        {layout.edges.map((e, i) => {
          const onPath = e.branch.onOptimalPath;
          const x1 = X(e.from.depth) + NODE_R;
          const y1 = Y(e.from.y);
          const x2 = X(e.to.depth) - NODE_R;
          const y2 = Y(e.to.y);
          const midX = (x1 + x2) / 2;
          const pParts = [];
          if (e.branch.probability !== undefined) pParts.push(`p=${Number(e.branch.probability).toFixed(2)}`);
          if (Number(e.branch.cost)) pParts.push(`cost ${fmt(Number(e.branch.cost))}`);
          return (
            <g key={i}>
              <path
                d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke={onPath ? '#059669' : CHART_COLORS.axisLine}
                strokeWidth={onPath ? 2 : 1.2}
                strokeDasharray={onPath ? 'none' : '4 3'}
              />
              <text x={midX} y={(y1 + y2) / 2 - 5} textAnchor="middle" fontSize={fs - 1} fill={onPath ? '#047857' : CHART_COLORS.axisText}>
                {e.branch.label}{pParts.length ? ` (${pParts.join(', ')})` : ''}
              </text>
            </g>
          );
        })}
        {/* nodes on top */}
        {layout.nodes.map((n, i) => {
          const x = X(n.depth);
          const y = Y(n.y);
          const onPath = n.depth === 0 || n.incoming?.onOptimalPath;
          const isTerm = n.node.type === 'terminal';
          const label = isTerm
            ? `${fmt(n.node.emv)} ${unit}`
            : `EMV ${fmt(n.node.emv)} ${unit}`;
          return (
            <g key={n.node.id ?? i}>
              <NodeGlyph type={n.node.type} x={x} y={y} onPath={onPath} />
              <text x={x + NODE_R + 5} y={y + 3.5} fontSize={fs} fontWeight={onPath ? 600 : 400} fill={onPath ? '#065f46' : CHART_COLORS.axisText}>
                {label}
              </text>
            </g>
          );
        })}
        {/* legend */}
        <g transform={`translate(${PAD.left}, ${height - 8})`} fontSize={fs - 1} fill={CHART_COLORS.axisText}>
          <rect x={0} y={-9} width={10} height={10} fill="#fff" stroke={CHART_COLORS.axisLine} />
          <text x={14} y={0}>decision</text>
          <circle cx={78} cy={-4} r={5} fill="#fff" stroke={CHART_COLORS.axisLine} />
          <text x={88} y={0}>chance</text>
          <path d="M 140 -9 L 150 -4 L 140 1 Z" fill="#fff" stroke={CHART_COLORS.axisLine} />
          <text x={155} y={0}>outcome</text>
          <line x1={215} y1={-4} x2={240} y2={-4} stroke="#059669" strokeWidth={2} />
          <text x={245} y={0}>optimal path</text>
        </g>
      </svg>
      <ChartLogo style={{ height: '96px', bottom: '10px', opacity: 0.55 }} />
    </div>
  );
};

export default TreeDiagram;
