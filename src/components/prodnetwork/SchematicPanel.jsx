// The network, drawn.
//
// LAID OUT AUTOMATICALLY, by depth from the delivery point. A gathering
// system is a graph that flows one way, so its layout is a fact about
// the topology rather than something a user should have to arrange by
// dragging boxes. That also frees the drawing to carry the RESULT --
// the pressure at every node, the rate on every line, the bottleneck
// picked out -- which a hand-positioned diagram never could, because it
// had nothing to say until somebody finished arranging it.
import React, { useMemo } from 'react';
import { Waypoints, Droplets, Component } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useProductionNetwork } from '@/contexts/ProductionNetworkContext';
import { fmt } from './fields';

const COL_W = 210;
const ROW_H = 92;
const PAD = 46;

const KIND_STYLE = {
  well: { fill: '#065f46', stroke: '#10b981', icon: Droplets },
  junction: { fill: '#1e3a8a', stroke: '#60a5fa', icon: Waypoints },
  sink: { fill: '#581c87', stroke: '#c084fc', icon: Component },
};

const SchematicPanel = () => {
  const {
    inputs, layout, topology, result, selectedId, setSelectedId,
  } = useProductionNetwork();

  const geometry = useMemo(() => {
    if (!layout) return null;
    const byId = new Map(inputs.nodes.map((n) => [n.id, n]));
    const pos = {};
    let maxRows = 1;
    for (const [id, p] of Object.entries(layout.positions)) {
      maxRows = Math.max(maxRows, p.rows);
      pos[id] = {
        x: PAD + p.col * COL_W,
        y: PAD + (p.row - (p.rows - 1) / 2) * ROW_H,
      };
    }
    const ys = Object.values(pos).map((p) => p.y);
    const minY = Math.min(...ys, 0);
    for (const id of Object.keys(pos)) pos[id].y -= minY - PAD;
    return {
      pos,
      byId,
      width: PAD * 2 + (layout.columns - 1) * COL_W + 120,
      height: PAD * 2 + (maxRows - 1) * ROW_H + 60,
    };
  }, [layout, inputs.nodes]);

  if (!topology.ok) {
    return (
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="py-8 text-center">
          <p className="text-sm text-rose-400">{topology.error}</p>
        </CardContent>
      </Card>
    );
  }
  if (!geometry) return null;

  const bottleneckId = result?.diagnosis?.bottleneck?.id;
  const branchById = new Map((result?.branches || []).map((b) => [b.id, b]));
  const wellById = new Map((result?.wells || []).map((w) => [w.id, w]));

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Waypoints className="w-4 h-4 text-sky-400" /> The network
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <svg
            width={geometry.width}
            height={geometry.height}
            className="min-w-full"
            role="img"
            aria-label="Production network schematic"
          >
            {inputs.branches.map((b) => {
              const a = geometry.pos[b.from];
              const c = geometry.pos[b.to];
              if (!a || !c) return null;
              const solved = branchById.get(b.id);
              const isBottleneck = b.id === bottleneckId;
              const mid = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 };
              return (
                <g key={b.id}>
                  <line
                    x1={a.x + 54} y1={a.y} x2={c.x - 54} y2={c.y}
                    stroke={isBottleneck ? '#f59e0b' : '#475569'}
                    strokeWidth={isBottleneck ? 3 : 2}
                  />
                  {solved && (
                    <text
                      x={mid.x} y={mid.y - 8} textAnchor="middle"
                      fill={isBottleneck ? '#fbbf24' : '#94a3b8'} fontSize="10"
                    >
                      {fmt(solved.dpPsi, 0)} psi
                    </text>
                  )}
                  {solved && (
                    <text
                      x={mid.x} y={mid.y + 14} textAnchor="middle"
                      fill="#64748b" fontSize="9"
                    >
                      {fmt(solved.stream.qoStbd, 0)} stb/d
                    </text>
                  )}
                </g>
              );
            })}

            {inputs.nodes.map((n) => {
              const p = geometry.pos[n.id];
              if (!p) return null;
              const style = KIND_STYLE[n.kind] || KIND_STYLE.junction;
              const solved = result?.solution?.pressures?.[n.id];
              const well = wellById.get(n.id);
              const selected = n.id === selectedId;
              return (
                <g
                  key={n.id}
                  onClick={() => setSelectedId(n.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x={p.x - 54} y={p.y - 22} width={108} height={44} rx={7}
                    fill={style.fill}
                    stroke={selected ? '#f8fafc' : style.stroke}
                    strokeWidth={selected ? 2.5 : 1.5}
                  />
                  <text
                    x={p.x} y={p.y - 4} textAnchor="middle" fill="#f1f5f9"
                    fontSize="11" fontWeight="600"
                  >
                    {n.label}
                  </text>
                  <text x={p.x} y={p.y + 11} textAnchor="middle" fill="#cbd5e1" fontSize="10">
                    {Number.isFinite(solved) ? `${fmt(solved, 0)} psia` : n.kind}
                  </text>
                  {well && well.shutIn && (
                    <text x={p.x} y={p.y + 34} textAnchor="middle" fill="#fb7185" fontSize="9">
                      shut in
                    </text>
                  )}
                  {well && !well.shutIn && Number.isFinite(well.lostFraction) && (
                    <text x={p.x} y={p.y + 34} textAnchor="middle" fill="#fbbf24" fontSize="9">
                      -{fmt(well.lostFraction * 100, 0)}% to the others
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
        <p className="text-[11px] text-slate-600 mt-2">
          Laid out by depth from the delivery point, because a gathering system flows one way and
          its arrangement is a fact about the topology rather than something worth dragging into
          place. Click a node to edit it.
          {bottleneckId && ' The amber line is burning the most pressure per unit it carries.'}
        </p>
      </CardContent>
    </Card>
  );
};

export default SchematicPanel;
