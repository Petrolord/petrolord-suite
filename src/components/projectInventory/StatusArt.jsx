// Project Data Inventory: the state glyphs and the matrix cell art. Every
// state has its own icon shape and fill pattern as well as its colour, so
// the matrix reads in greyscale, on a projector and for colour-blind
// readers. Plain SVG with no shared ids or defs: the PNG export
// (html2canvas) rasterises each SVG on its own, so patterns are drawn as
// geometry inside each cell.
import React from 'react';
import { STATUS, hex } from '@/lib/projectInventory';

/** The icon of a state, centred at (cx, cy) with radius r. */
export function glyphShapes(key, cx, cy, r) {
  const s = STATUS[key] || STATUS.unrecorded;
  const c = hex(s.rgb);
  const ink = hex(s.ink);
  switch (s.icon) {
    case 'check':
      return [
        <circle key="b" cx={cx} cy={cy} r={r} fill={c} />,
        <path key="t" d={`M${cx - r * 0.5} ${cy + r * 0.02} L${cx - r * 0.12} ${cy + r * 0.4} L${cx + r * 0.52} ${cy - r * 0.38}`} fill="none" stroke="#fff" strokeWidth={r * 0.28} strokeLinecap="round" strokeLinejoin="round" />,
      ];
    case 'half':
      return [
        <circle key="o" cx={cx} cy={cy} r={r - r * 0.12} fill="#fff" stroke={c} strokeWidth={r * 0.24} />,
        <path key="h" d={`M${cx} ${cy - r + r * 0.12} A${r - r * 0.12} ${r - r * 0.12} 0 0 0 ${cx} ${cy + r - r * 0.12} Z`} fill={c} />,
      ];
    case 'spark':
      return [
        <path key="d" d={`M${cx} ${cy - r} L${cx + r * 0.32} ${cy - r * 0.32} L${cx + r} ${cy} L${cx + r * 0.32} ${cy + r * 0.32} L${cx} ${cy + r} L${cx - r * 0.32} ${cy + r * 0.32} L${cx - r} ${cy} L${cx - r * 0.32} ${cy - r * 0.32} Z`} fill={c} />,
      ];
    case 'doc':
      return [
        <path key="p" d={`M${cx - r * 0.62} ${cy - r} H${cx + r * 0.22} L${cx + r * 0.68} ${cy - r * 0.54} V${cy + r} H${cx - r * 0.62} Z`} fill="#fff" stroke={c} strokeWidth={r * 0.2} strokeLinejoin="round" />,
        <path key="l" d={`M${cx - r * 0.32} ${cy - r * 0.1} H${cx + r * 0.38} M${cx - r * 0.32} ${cy + r * 0.32} H${cx + r * 0.38}`} stroke={c} strokeWidth={r * 0.18} strokeLinecap="round" />,
      ];
    case 'cross':
      return [
        <circle key="o" cx={cx} cy={cy} r={r - r * 0.12} fill="#fff" stroke={c} strokeWidth={r * 0.24} />,
        <path key="x" d={`M${cx - r * 0.36} ${cy - r * 0.36} L${cx + r * 0.36} ${cy + r * 0.36} M${cx + r * 0.36} ${cy - r * 0.36} L${cx - r * 0.36} ${cy + r * 0.36}`} stroke={c} strokeWidth={r * 0.24} strokeLinecap="round" />,
      ];
    case 'dash':
      return [
        <circle key="b" cx={cx} cy={cy} r={r} fill={c} />,
        <path key="m" d={`M${cx - r * 0.5} ${cy} H${cx + r * 0.5}`} stroke="#fff" strokeWidth={r * 0.3} strokeLinecap="round" />,
      ];
    case 'clock':
      return [
        <circle key="o" cx={cx} cy={cy} r={r - r * 0.12} fill="#fff" stroke={ink} strokeWidth={r * 0.16} />,
        <path key="h" d={`M${cx} ${cy - r * 0.5} V${cy} L${cx + r * 0.4} ${cy + r * 0.25}`} fill="none" stroke={ink} strokeWidth={r * 0.16} strokeLinecap="round" />,
      ];
    default: // ring: to confirm
      return [<circle key="o" cx={cx} cy={cy} r={r - r * 0.15} fill="#fff" stroke={ink} strokeWidth={r * 0.16} strokeDasharray={`${r * 0.32} ${r * 0.26}`} />];
  }
}

/** A standalone glyph (legend, tiles, readiness). */
export function StatusGlyph({ status, size = 14, title }) {
  const r = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={title || STATUS[status]?.label} style={{ display: 'inline-block', flex: 'none', verticalAlign: 'middle' }}>
      {glyphShapes(status, r, r, r - 0.5)}
    </svg>
  );
}

// pattern geometry inside a w x h box (no clip paths: segments are cut to the box)
function hatch(w, h, gap, angle) {
  const out = [];
  // lines x - y = k (45 deg) or x + y = k (135 deg), cut to the box
  for (let k = -h; k <= w + h; k += gap) {
    const pts = [];
    if (angle === 45) {
      // y = x - k
      for (const [x, y] of [[k, 0], [k + h, h], [0, -k], [w, w - k]]) if (x >= 0 && x <= w && y >= 0 && y <= h) pts.push([x, y]);
    } else {
      // y = k - x
      for (const [x, y] of [[k, 0], [k - h, h], [0, k], [w, k - w]]) if (x >= 0 && x <= w && y >= 0 && y <= h) pts.push([x, y]);
    }
    if (pts.length >= 2) out.push([pts[0], pts[pts.length - 1]]);
  }
  return out;
}

function patternShapes(pattern, w, h, rgb) {
  const c = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.32)`;
  if (pattern === 'hatch') return hatch(w, h, 6, 45).map(([a, b], i) => <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={c} strokeWidth="1.4" />);
  if (pattern === 'cross') {
    return [...hatch(w, h, 7, 45), ...hatch(w, h, 7, 135)].map(([a, b], i) => <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={`rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.22)`} strokeWidth="1" />);
  }
  if (pattern === 'dots') {
    const out = [];
    for (let y = 3; y < h; y += 5) for (let x = (y % 10 === 3 ? 3 : 5.5); x < w; x += 5) out.push(<circle key={`${x}-${y}`} cx={x} cy={y} r="0.9" fill={c} />);
    return out;
  }
  if (pattern === 'lines') {
    const out = [];
    for (let y = 3.5; y < h; y += 4.5) out.push(<line key={y} x1="0" y1={y} x2={w} y2={y} stroke={c} strokeWidth="1" />);
    return out;
  }
  return [];
}

/**
 * One matrix cell: the state's tint and pattern, its glyph, and a coverage
 * bar along the bottom where the cell has a coverage.
 */
export function CellArt({ status, coverage = null, w = 34, h = 26, overridden = false }) {
  const s = STATUS[status] || STATUS.unrecorded;
  const showBar = Number.isFinite(coverage) && ['complete', 'partial', 'derived'].includes(status);
  const bodyH = showBar ? h - 5 : h;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" style={{ display: 'block' }}>
      <rect x="0.5" y="0.5" width={w - 1} height={h - 1} rx="4" fill={hex(s.fill)} stroke={s.pattern === 'none' ? hex(s.ink) : hex(s.rgb)} strokeOpacity={s.pattern === 'none' ? 0.5 : 0.35} strokeDasharray={s.pattern === 'none' ? '2 2' : undefined} />
      {patternShapes(s.pattern, w, bodyH, s.rgb).map((el) => React.cloneElement(el, { key: `p${el.key}` }))}
      {glyphShapes(status, w / 2, bodyH / 2 + 0.5, Math.min(7, bodyH / 2 - 3))}
      {showBar && (
        <>
          <rect x="4" y={h - 5} width={w - 8} height="2.5" rx="1.25" fill="#e2e8f0" />
          <rect x="4" y={h - 5} width={Math.max(1.5, (w - 8) * Math.max(0, Math.min(1, coverage)))} height="2.5" rx="1.25" fill={hex(s.rgb)} />
        </>
      )}
      {overridden && <path d={`M${w - 8} 1 H${w - 1.5} V7.5 Z`} fill={hex(s.ink)} />}
    </svg>
  );
}
