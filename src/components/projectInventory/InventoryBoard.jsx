// Project Data Inventory board: the part a project kick-off deck shows.
// Header and readiness score, summary tiles, readiness per workflow, the
// well matrix with its legend, the seismic and interpretation sections, the
// notes and the items held outside Petrolord. Drawn on white paper in both
// themes (the Suite chart template standard: white surface, ChartLogo), so
// the screen, the presentation view and the PNG are the same picture.
// mode 'screen' is interactive and compact; 'present' is the full-width
// slide (no controls, larger cells).
import React from 'react';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS } from '@/utils/chartTheme';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import {
  STATUS, hex, LEVEL, SEVERITY_LABEL, fmtDepth, fmtBytes,
} from '@/lib/projectInventory';
import { StatusGlyph, CellArt } from './StatusArt';

const INK = CHART_COLORS.axisLabel;
const BODY = CHART_COLORS.axisText;
const MUTED = '#64748b';
const LINE = CHART_COLORS.grid;
const ACCENT = '#1d4ed8';
const SEV = {
  high: { fg: '#991b1b', bg: '#fee2e2', bd: '#fca5a5' },
  medium: { fg: '#92400e', bg: '#fef3c7', bd: '#fcd34d' },
  low: { fg: '#334155', bg: '#f1f5f9', bd: '#cbd5e1' },
  info: { fg: '#155e75', bg: '#ecfeff', bd: '#a5f3fc' },
};
// html2canvas does not draw text-overflow: ellipsis, so long text is clipped here
const clip = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s || '');
const pct = (f) => (Number.isFinite(f) ? `${Math.round(f * 100)}%` : EMPTY_VALUE);

function ScoreRing({ score, size = 92 }) {
  const r = size / 2 - 7;
  const c = 2 * Math.PI * r;
  const col = score >= 75 ? '#059669' : score >= 50 ? '#d97706' : '#dc2626';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Readiness ${score} out of 100`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth="9" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth="9" strokeLinecap="round"
        strokeDasharray={`${(c * score) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="47%" textAnchor="middle" dominantBaseline="middle" fontSize={size * 0.3} fontWeight="700" fill={INK}>{score}</text>
      <text x="50%" y="70%" textAnchor="middle" dominantBaseline="middle" fontSize={size * 0.11} fill={MUTED}>of 100</text>
    </svg>
  );
}

function Tile({ label, value, sub, children, testId }) {
  return (
    <div data-testid={testId} style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: '10px 14px', background: '#fff', minWidth: 0 }}>
      <div style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: INK, lineHeight: 1.15, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: BODY, marginTop: 2 }}>{sub}</div>}
      {children}
    </div>
  );
}

function SectionTitle({ children, aside }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, margin: '18px 0 8px' }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: INK, margin: 0 }}>{children}</h3>
      {aside && <span style={{ fontSize: 11.5, color: MUTED }}>{aside}</span>}
    </div>
  );
}

export function Legend({ inv, compact = false }) {
  return (
    <div data-testid="pdi-legend" style={{ display: 'flex', flexWrap: 'wrap', gap: compact ? '6px 14px' : '8px 18px', alignItems: 'center' }}>
      {inv.statusesShown.map((k) => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, maxWidth: compact ? 'none' : 300 }} title={STATUS[k].meaning}>
          <CellArt status={k} w={28} h={20} />
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: INK }}>{STATUS[k].label}</div>
            {!compact && <div style={{ fontSize: 10.5, color: MUTED }}>{STATUS[k].meaning}</div>}
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <svg width="28" height="12" aria-hidden="true"><rect x="2" y="4" width="24" height="3" rx="1.5" fill="#e2e8f0" /><rect x="2" y="4" width="16" height="3" rx="1.5" fill={hex(STATUS.complete.rgb)} /></svg>
        <span style={{ fontSize: 11, color: BODY }}>Bar: coverage of the interval</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <svg width="14" height="14" aria-hidden="true"><rect x="0.5" y="0.5" width="13" height="13" rx="3" fill="#fff" stroke="#cbd5e1" /><path d="M7 1 H13.5 V7.5 Z" fill="#334155" /></svg>
        <span style={{ fontSize: 11, color: BODY }}>Corner: set by hand</span>
      </div>
    </div>
  );
}

export function Matrix({ inv, mode, selected, onCellClick, onRemarkClick }) {
  const present = mode === 'present';
  const cw = present ? 46 : 34;
  const ch = present ? 34 : 26;
  const th = { fontSize: present ? 11 : 10, fontWeight: 600, color: BODY, padding: '3px 1px', textAlign: 'center', lineHeight: 1.1, borderBottom: `1px solid ${LINE}` };
  const unit = inv.unit;
  return (
    <div style={{ overflowX: present ? 'visible' : 'auto' }} data-testid="pdi-matrix">
      <table style={{ borderCollapse: 'separate', borderSpacing: present ? '3px 3px' : '2px 2px', width: '100%' }}>
        <thead>
          <tr>
            <th rowSpan={2} style={{ ...th, textAlign: 'left', fontSize: present ? 12 : 11, color: INK, minWidth: present ? 170 : 132, borderBottom: `2px solid ${INK}`, verticalAlign: 'bottom', paddingLeft: 4 }}>Well</th>
            {inv.groups.map((g) => (
              <th key={g.key} colSpan={g.columns.length} style={{ ...th, fontSize: present ? 10.5 : 9.5, letterSpacing: '0.05em', textTransform: 'uppercase', color: INK, background: '#f1f5f9', borderRadius: 4, borderBottom: 'none' }}>
                {g.label}
              </th>
            ))}
            <th rowSpan={2} style={{ ...th, textAlign: 'left', color: INK, minWidth: present ? 300 : 150, width: '100%', borderBottom: `2px solid ${INK}`, verticalAlign: 'bottom', paddingLeft: 6 }}>Remarks</th>
          </tr>
          <tr>
            {inv.columns.map((c) => (
              <th key={c.key} title={c.title} style={{ ...th, width: cw, maxWidth: cw, borderBottom: `2px solid ${INK}`, color: c.source === 'manual' ? MUTED : BODY, fontStyle: c.source === 'manual' ? 'italic' : 'normal' }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {inv.rows.map((r) => (
            <tr key={r.wellId} data-testid={`pdi-row-${r.wellName}`}>
              <td style={{ padding: '0 6px 0 4px', verticalAlign: 'middle', borderBottom: `1px solid ${LINE}` }}>
                <div style={{ fontSize: present ? 13 : 12, fontWeight: 600, color: INK, whiteSpace: 'nowrap' }}>{r.wellName}</div>
                <div style={{ fontSize: present ? 10.5 : 9.5, color: MUTED, whiteSpace: 'nowrap' }}>
                  {r.interval ? `${fmtDepth(r.interval.top, unit)}-${fmtDepth(r.interval.base, unit)} ${unit}` : 'no logged interval'}
                </div>
              </td>
              {inv.columns.map((c) => {
                const cell = r.cells[c.key];
                const isSel = selected && selected.wellId === r.wellId && selected.column === c.key;
                const label = `${r.wellName}, ${c.title}: ${STATUS[cell.status]?.label}${Number.isFinite(cell.coverage) ? `, ${pct(cell.coverage)} coverage` : ''}. ${cell.text}`;
                const art = <CellArt status={cell.status} coverage={cell.coverage} w={cw} h={ch} overridden={cell.overridden} />;
                return (
                  <td key={c.key} style={{ padding: 0, verticalAlign: 'middle' }}>
                    {onCellClick ? (
                      <button type="button" data-testid={`pdi-cell-${r.wellName}-${c.key}`} data-status={cell.status} title={label} aria-label={label}
                        onClick={() => onCellClick({ wellId: r.wellId, column: c.key })}
                        style={{ display: 'block', padding: 0, border: 0, background: 'none', cursor: 'pointer', borderRadius: 5, outline: isSel ? `2px solid ${ACCENT}` : 'none', outlineOffset: 1 }}>
                        {art}
                      </button>
                    ) : <div data-testid={`pdi-cell-${r.wellName}-${c.key}`} data-status={cell.status} title={label}>{art}</div>}
                  </td>
                );
              })}
              <td style={{ padding: '0 6px', verticalAlign: 'middle', borderBottom: `1px solid ${LINE}` }}>
                {onRemarkClick ? (
                  <button type="button" onClick={() => onRemarkClick(r.wellId)} data-testid={`pdi-remark-${r.wellName}`} title={`${r.remark} (click to edit)`}
                    style={{ border: 0, background: 'none', padding: 0, textAlign: 'left', fontSize: 11, color: r.remarkEdited ? INK : BODY, cursor: 'pointer', fontStyle: r.remarkEdited ? 'normal' : 'normal' }}>
                    {clip(r.remark, present ? 90 : 46)}
                  </button>
                ) : <span style={{ fontSize: present ? 12 : 11, color: BODY }}>{clip(r.remark, present ? 90 : 46)}</span>}
              </td>
            </tr>
          ))}
          {!inv.rows.length && (
            <tr><td colSpan={inv.columns.length + 2} style={{ fontSize: 12, color: MUTED, padding: 12 }}>No wells in the inventory yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ReadinessStrip({ inv, present }) {
  return (
    <div data-testid="pdi-readiness" style={{ display: 'grid', gridTemplateColumns: `repeat(${present ? 7 : 'auto-fill'}, minmax(${present ? 0 : 168}px, 1fr))`, gap: 8 }}>
      {inv.readiness.workflows.map((w) => {
        const lv = LEVEL[w.level];
        const s = STATUS[lv.status];
        return (
          <div key={w.key} data-testid={`pdi-ready-${w.key}`} data-level={w.level} style={{ border: `1px solid ${hex(s.rgb)}55`, borderLeft: `4px solid ${hex(s.rgb)}`, borderRadius: 8, padding: '7px 10px', background: hex(s.fill) }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <StatusGlyph status={lv.status} size={14} title={lv.label} />
              <span style={{ fontSize: 12, fontWeight: 700, color: INK }}>{w.label}</span>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: hex(s.ink), marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{lv.label}</div>
            <div style={{ fontSize: 11, color: BODY, marginTop: 1, lineHeight: 1.3 }}>{w.reason}</div>
          </div>
        );
      })}
    </div>
  );
}

function SeismicTable({ inv, present }) {
  const rows = inv.seismic.rows;
  const td = { fontSize: present ? 11.5 : 11, color: BODY, padding: '4px 8px 4px 0', borderBottom: `1px solid ${LINE}`, whiteSpace: 'nowrap', verticalAlign: 'top' };
  const th = { ...td, color: MUTED, fontWeight: 600, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `2px solid ${INK}` };
  if (!rows.length) return <p style={{ fontSize: 12, color: MUTED }}>No seismic volumes or prestack files in the project.</p>;
  return (
    <div style={{ overflowX: present ? 'visible' : 'auto' }}>
      <table data-testid="pdi-seismic" style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr>{['Volume', 'Type', 'Domain', 'Format', 'Inline', 'Crossline', 'Bin, area', 'Sample, record', 'CRS', 'Size'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((v) => (
            <tr key={v.id} data-testid="pdi-seismic-row">
              <td style={{ ...td, color: INK, fontWeight: 600 }} title={v.name}>{clip(v.name, present ? 34 : 28)}</td>
              <td style={{ ...td, color: v.derived ? MUTED : BODY }}>{v.type}</td>
              <td style={td}>{v.domain || EMPTY_VALUE}</td>
              <td style={td} title={v.formatLong || ''}>{v.format ? `${v.format}${v.bits ? `, ${v.bits}-bit` : ''}` : EMPTY_VALUE}</td>
              <td style={td}>{v.il ? `${v.il.min}-${v.il.max}` : EMPTY_VALUE}</td>
              <td style={td}>{v.xl ? `${v.xl.min}-${v.xl.max}` : EMPTY_VALUE}</td>
              <td style={td}>{v.binIl ? `${v.binIl.toFixed(1)} x ${v.binXl.toFixed(1)} m, ${v.areaKm2.toFixed(1)} km²` : v.bins ? `${v.bins} offset bins of ${v.binWidthM} m` : EMPTY_VALUE}</td>
              <td style={td}>{v.dtMs ? `${v.dtMs} ms, ${Math.round(v.recordMs)} ${v.recordUnit}` : v.traces ? `${v.traces.toLocaleString('en-GB')} traces` : EMPTY_VALUE}</td>
              <td style={{ ...td, color: v.crs || v.store ? BODY : '#b91c1c' }}>{v.crs || (v.store ? 'worker store' : 'not set')}</td>
              <td style={td}>{fmtBytes(v.bytes) || EMPTY_VALUE}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InterpretationList({ inv }) {
  return (
    <div data-testid="pdi-interpretations" style={{ display: 'grid', gap: 6 }}>
      {inv.interpretations.map((r) => (
        <div key={r.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span style={{ marginTop: 2 }}><StatusGlyph status={r.status} size={14} /></span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: INK }}>{r.label}{Number.isFinite(r.count) && r.count > 0 ? <span style={{ fontWeight: 600, color: MUTED }}>{`  ${r.count}`}</span> : null}</div>
            <div style={{ fontSize: 11, color: BODY, lineHeight: 1.35 }}>{r.text}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function NoteCard({ f, present, children }) {
  const sev = SEV[f.severity] || SEV.low;
  const field = (label, text) => (
    <div style={{ marginTop: 4 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label} </span>
      <span style={{ fontSize: present ? 11.5 : 11, color: BODY, lineHeight: 1.4 }}>{text}</span>
    </div>
  );
  return (
    <div data-testid={`pdi-note-${f.id}`} style={{ border: `1px solid ${sev.bd}`, borderLeft: `4px solid ${sev.fg}`, borderRadius: 8, padding: '8px 11px', background: '#fff', opacity: f.dismissed ? 0.55 : 1, breakInside: 'avoid' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: sev.fg, background: sev.bg, borderRadius: 4, padding: '1px 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{SEVERITY_LABEL[f.severity]}</span>
        <span style={{ fontSize: 10, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{f.area}</span>
        {f.dismissed && <span style={{ fontSize: 10, color: MUTED }}>dismissed</span>}
      </div>
      <div style={{ fontSize: present ? 13 : 12.5, fontWeight: 700, color: INK, marginTop: 3 }}>{f.title}</div>
      {field('Impact', f.impact)}
      {field('Workaround', f.workaround)}
      {field('Uncertainty', f.uncertainty)}
      {field('Mitigation', f.mitigation)}
      {f.comment && field('Comment', f.comment)}
      {children}
    </div>
  );
}

function ManualTable({ inv }) {
  if (!inv.manual.length) return null;
  const td = { fontSize: 11, color: BODY, padding: '4px 8px 4px 0', borderBottom: `1px solid ${LINE}`, verticalAlign: 'top' };
  return (
    <table data-testid="pdi-manual-board" style={{ borderCollapse: 'collapse', width: '100%' }}>
      <tbody>
        {inv.manual.map((m) => (
          <tr key={m.id}>
            <td style={{ ...td, width: 20 }}><StatusGlyph status={m.status} size={13} /></td>
            <td style={{ ...td, color: INK, fontWeight: 600 }}>{m.title || m.kindLabel}</td>
            <td style={td}>{m.kindLabel}</td>
            <td style={td}>{m.well || 'Project'}</td>
            <td style={td}>{m.stateLabel}</td>
            <td style={td}>{[m.source, m.date].filter(Boolean).join(', ')}</td>
            <td style={td}>{m.note}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * @param {Object} p
 * @param {Object} p.inv buildInventory output
 * @param {'screen'|'present'} [p.mode]
 * @param {number} [p.maxNotes] notes shown (present mode shows the open ones, most severe first)
 */
export default function InventoryBoard({
  inv, mode = 'screen', projectName = '', appLabel = '', builtAt = new Date(), selected, onCellClick, onRemarkClick, renderNoteActions, maxNotes = null, boardRef,
}) {
  const present = mode === 'present';
  const s = inv.summary;
  const notes = (present ? inv.findings.filter((f) => !f.dismissed) : inv.findings).slice(0, maxNotes || undefined);
  const intervalLabel = inv.interval?.mode === 'zones' ? inv.interval.names.join(', ') : 'logged interval of each well';
  const date = builtAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <div ref={boardRef} data-testid={present ? 'pdi-board-present' : 'pdi-board'} data-canvas="chart"
      style={{ position: 'relative', background: '#ffffff', color: INK, borderRadius: present ? 0 : 12, border: present ? 'none' : `1px solid ${LINE}`, padding: present ? '28px 36px 56px' : '16px 18px 48px', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: ACCENT }}>Project data inventory</div>
          <div data-testid="pdi-title" style={{ fontSize: present ? 30 : 22, fontWeight: 800, color: INK, lineHeight: 1.15, marginTop: 2 }}>{projectName || 'Untitled project'}</div>
          <div style={{ fontSize: present ? 13 : 12, color: BODY, marginTop: 4 }}>
            {`${s.wells} well${s.wells === 1 ? '' : 's'}, ${s.volumes} seismic volume${s.volumes === 1 ? '' : 's'} and ${s.horizons} horizon${s.horizons === 1 ? '' : 's'}, read from the Petrolord registries${appLabel ? ` in ${appLabel}` : ''}. Interval: ${intervalLabel}. Depths in ${inv.unit} MD. ${date}.`}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} data-testid="pdi-score">
          <ScoreRing score={s.score} size={present ? 104 : 84} />
          <div style={{ maxWidth: 150 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: INK }}>Readiness</div>
            <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.3 }}>Seven workflows: ready counts 1, limited one half, blocked 0.</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: present ? 'repeat(5, minmax(0, 1fr))' : 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginTop: 14 }} data-testid="pdi-tiles">
        <Tile testId="pdi-tile-wells" label="Wells" value={s.wells} sub={`${s.curves} curves loaded`} />
        <Tile testId="pdi-tile-completeness" label="Well data completeness" value={pct(s.completeness)} sub="Of the judged cells, partial and derived counting half">
          <div style={{ height: 5, background: '#e2e8f0', borderRadius: 3, marginTop: 6 }}><div style={{ height: 5, width: pct(s.completeness || 0), background: hex(STATUS.complete.rgb), borderRadius: 3 }} /></div>
        </Tile>
        <Tile testId="pdi-tile-seismic" label="Seismic" value={s.volumes} sub={`${s.angleStacks} angle stack${s.angleStacks === 1 ? '' : 's'}, ${s.gathers ? `${s.gathers} gather set${s.gathers === 1 ? '' : 's'}` : 'no gathers'}${s.areaKm2 ? `, ${s.areaKm2.toFixed(1)} km²` : ''}`} />
        <Tile testId="pdi-tile-interp" label="Interpretation" value={s.horizons} sub={`horizons, ${s.faults} fault${s.faults === 1 ? '' : 's'}, ${s.derivedVolumes} derived volume${s.derivedVolumes === 1 ? '' : 's'}`} />
        <Tile testId="pdi-tile-notes" label="Open notes" value={s.notes} sub={`${s.high} high severity`} />
      </div>

      <SectionTitle aside="What the loaded data supports today">Readiness by workflow</SectionTitle>
      <ReadinessStrip inv={inv} present={present} />

      <SectionTitle aside={inv.scanned ? 'Coverage computed from the curve samples' : 'Coverage from the curve extents while the samples are read'}>Well data</SectionTitle>
      <Matrix inv={inv} mode={mode} selected={selected} onCellClick={present ? null : onCellClick} onRemarkClick={present ? null : onRemarkClick} />
      <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${LINE}` }}>
        <Legend inv={inv} compact={present} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: present ? '1.9fr 1fr' : 'minmax(0, 1fr)', gap: present ? 28 : 0 }}>
        <div style={{ minWidth: 0 }}>
          <SectionTitle aside={`${inv.seismic.delivered.length} delivered, ${inv.seismic.derived.length} derived`}>Seismic</SectionTitle>
          <SeismicTable inv={inv} present={present} />
        </div>
        <div style={{ minWidth: 0 }}>
          <SectionTitle>Interpretation</SectionTitle>
          <InterpretationList inv={inv} />
        </div>
      </div>

      {inv.manual.length > 0 && (
        <>
          <SectionTitle aside="Reports and data held outside Petrolord">Other project data</SectionTitle>
          <ManualTable inv={inv} />
        </>
      )}

      <SectionTitle aside="Rule-based: impact, workaround, uncertainty and mitigation for each gap">Notes</SectionTitle>
      {notes.length ? (
        <div data-testid="pdi-notes" style={{ display: 'grid', gridTemplateColumns: `repeat(${present ? 3 : 'auto-fill'}, minmax(${present ? 0 : 340}px, 1fr))`, gap: 10 }}>
          {notes.map((f) => <NoteCard key={f.id} f={f} present={present}>{renderNoteActions ? renderNoteActions(f) : null}</NoteCard>)}
        </div>
      ) : <p style={{ fontSize: 12, color: MUTED }}>No gaps found in the loaded data.</p>}
      {present && maxNotes && inv.findings.filter((f) => !f.dismissed).length > maxNotes && (
        <p style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>{`${inv.findings.filter((f) => !f.dismissed).length - maxNotes} more notes in the PDF and CSV.`}</p>
      )}

      <div style={{ position: 'absolute', left: present ? 36 : 18, bottom: 14, fontSize: 10.5, color: MUTED }}>
        Built by Petrolord from the project registries; notes come from fixed rules.
      </div>
      <ChartLogo style={{ height: present ? 34 : 26 }} />
    </div>
  );
}
