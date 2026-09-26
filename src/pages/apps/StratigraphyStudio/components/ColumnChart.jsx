// The stratigraphic column as a chart (Stratigraphy T1 ST-T1-005,
// 2026-09-26): time down on the left in Ma with the ICS stages beside it,
// then one lane per rank (group, formation, member, bed), each unit a box
// from its top age to its base age in its own colour. What a Petrel or
// StrataBugs user reads a column as; the table above stays the editor.

import React, { useMemo } from 'react';
import { unitsBetween } from '@/lib/stratigraphy/timescale';
import { RANKS } from '@/lib/stratigraphy/column';

const AXIS_W = 44; const STAGE_W = 86; const LANE_W = 130; const HEAD_H = 22; const H = 420;

export default function ColumnChart({ units }) {
  const dated = useMemo(() => (units || []).filter((u) => Number.isFinite(Number(u.age_top_ma)) && Number.isFinite(Number(u.age_base_ma)) && u.age_top_ma !== '' && u.age_base_ma !== ''
    && Number(u.age_base_ma) > Number(u.age_top_ma)), [units]);
  if (!dated.length) return null;
  const top = Math.min(...dated.map((u) => Number(u.age_top_ma)));
  const base = Math.max(...dated.map((u) => Number(u.age_base_ma)));
  const span = base - top || 1;
  const yOf = (ma) => HEAD_H + ((ma - top) / span) * (H - HEAD_H - 8);
  const lanes = RANKS.filter((r) => dated.some((u) => u.rank === r));
  const stages = unitsBetween(top, base, 'age');
  const W = AXIS_W + STAGE_W + lanes.length * LANE_W + 8;
  const raw = span / 8; const mag = 10 ** Math.floor(Math.log10(raw)); const step = [1, 2, 5, 10].map((m) => m * mag).find((v) => v >= raw);
  const ticks = [];
  for (let t = Math.ceil(top / step) * step; t <= base + 1e-9; t += step) ticks.push(+t.toFixed(6));
  return (
    <div className="overflow-x-auto" data-testid="strat-column-chart">
      <svg width={W} height={H} className="block">
        <text x={AXIS_W - 6} y={HEAD_H - 8} fontSize="9" fill="#94a3b8" textAnchor="end">Ma</text>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={AXIS_W - 4} y1={yOf(t)} x2={AXIS_W} y2={yOf(t)} stroke="#94a3b8" />
            <text x={AXIS_W - 6} y={yOf(t) + 3} fontSize="9" fill="#cbd5e1" textAnchor="end">{t}</text>
          </g>
        ))}
        <text x={AXIS_W + STAGE_W / 2} y={HEAD_H - 8} fontSize="9" fill="#94a3b8" textAnchor="middle">ICS stage</text>
        {stages.map((s) => {
          const y0 = yOf(Math.max(s.top_ma, top)); const y1 = yOf(Math.min(s.base_ma, base));
          return (
            <g key={s.name}>
              <rect x={AXIS_W} y={y0} width={STAGE_W - 4} height={Math.max(0, y1 - y0)} fill="#1e293b" stroke="#334155" strokeWidth="0.5" />
              {y1 - y0 > 10 && <text x={AXIS_W + 4} y={(y0 + y1) / 2 + 3} fontSize="8" fill="#94a3b8">{s.name}</text>}
            </g>
          );
        })}
        {lanes.map((rank, li) => {
          const x = AXIS_W + STAGE_W + li * LANE_W;
          return (
            <g key={rank}>
              <text x={x + LANE_W / 2} y={HEAD_H - 8} fontSize="9" fill="#94a3b8" textAnchor="middle">{rank}</text>
              {dated.filter((u) => u.rank === rank).map((u) => {
                const y0 = yOf(Number(u.age_top_ma)); const y1 = yOf(Number(u.age_base_ma));
                return (
                  <g key={u.id} data-testid={`strat-column-box-${u.name}`}>
                    <rect x={x} y={y0} width={LANE_W - 6} height={Math.max(1, y1 - y0)} fill={u.colour || '#94a3b8'} fillOpacity="0.8" stroke="#0f172a" strokeWidth="0.8">
                      <title>{`${u.name} (${u.rank}), ${u.age_top_ma} to ${u.age_base_ma} Ma`}</title>
                    </rect>
                    {y1 - y0 > 12 && <text x={x + (LANE_W - 6) / 2} y={(y0 + y1) / 2 + 3} fontSize="10" fill="#0f172a" textAnchor="middle">{u.name}</text>}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
