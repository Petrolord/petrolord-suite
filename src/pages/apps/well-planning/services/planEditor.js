// Plan Editor (Compass-style) for the Well Design Studio.
//
// The plan of record is the UI `segments` array in DesignTab. This
// module is the pure bridge between that array and two views of it:
//
//   resolvePlan      segments -> compiler segments + one span per UI
//                    segment (start/end MD and attitude). It is also
//                    where the 'IncAziMD' section type is compiled: the
//                    row stores a target inclination, azimuth and MD and
//                    becomes a single minimum-curvature arc (a
//                    toolfaceArc, or a hold when nothing changes) from
//                    whatever attitude the rows above deliver, so it
//                    re-solves whenever an earlier row changes.
//   derivePlanTable  segments + spans + compiled survey rows -> one
//                    table row per segment end plus a tie-on row.
//   applyPlanEdit /  table edits -> a new segments array. The table
//   changeSegmentType never holds a second copy of the plan.
//   insert/delete/move
//   historyReducer   undo/redo shared by the table, the segments panel,
//                    solver applies and drag reorder.
//
// Lengths and rates stay in the wellbore depth unit (rates per 30 m or
// per 100 ft), exactly as the segment compiler expects. Azimuths shown
// and entered in the table are in the wellbore azimuth reference; the
// compile runs in grid (grid = reference + aziDelta), the same chain as
// the KO Azi field. Pure functions, no React, no I/O.

import { attitudeAfterArc } from '../engine/segmentCompiler';
import { toolfaceForTarget } from '../engine/profileDesign';

const DEG = Math.PI / 180;

export const SEGMENT_TYPES = ['Hold', 'Build', 'Turn', 'ToolfaceArc', 'IncAziMD'];

export const SEGMENT_TYPE_LABELS = {
    Hold: 'Hold',
    Build: 'Build/Drop',
    Turn: 'Turn',
    ToolfaceArc: 'TF Arc',
    IncAziMD: 'Inc Azi MD',
};

/** Which table cells are defining inputs, per section type. */
export const EDITABLE_FIELDS = {
    Hold: ['md', 'cl'],
    Build: ['md', 'cl', 'dls', 'build'],
    Turn: ['md', 'cl', 'turn'],
    ToolfaceArc: ['md', 'cl', 'dls', 'tf'],
    IncAziMD: ['md', 'cl', 'inc', 'azi'],
};

export const rateInterval = (mdUnit) => (mdUnit === 'ft' ? 100 : 30);

export const normalizeAzi = (a) => ((a % 360) + 360) % 360;

const wrapDelta = (a1, a2) => {
    let d = normalizeAzi(a2) - normalizeAzi(a1);
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
};

const num = (v) => {
    if (v === '' || v == null) return NaN;
    return typeof v === 'number' ? v : parseFloat(v);
};

// Lengths from MD arithmetic carry float noise (1234.5 - 1000.1); keep
// stored inputs to 1e-6 of the depth unit.
const tidy = (v) => Math.round(v * 1e6) / 1e6;

/** Canonical UI type (case-insensitive; unknown types compile as Hold). */
export function canonicalType(t) {
    const s = String(t || 'Hold').toLowerCase();
    return SEGMENT_TYPES.find((x) => x.toLowerCase() === s) || 'Hold';
}

/**
 * Walk the UI segments from the tie-on, producing the compiler segment
 * list (the same mapping and skip rule DesignTab has always used) and
 * one span per UI segment.
 *
 * Skip rule (unchanged): a length-based segment with no positive length,
 * or a Build/Turn/TF Arc with a zero rate, is left out of the compile
 * and its span has compiled=false. An Inc Azi MD row with a missing
 * value is skipped the same way; one whose MD is not deeper than its
 * start (or whose inclination is outside 0-180) is also left out, and
 * its message is returned in `errors` so the studio can say so: it is a
 * stated target the plan cannot meet. Never throws, so the table can
 * still show every row while the user fixes one.
 *
 * @returns {{compilerSegments: object[], spans: object[], errors: string[]}}
 */
export function resolvePlan(segments, { mdUnit = 'm', tieOn = {}, aziDelta = 0 } = {}) {
    const interval = rateInterval(mdUnit);
    const rpu = (rate) => rate / interval;
    let cur = {
        md: Number.isFinite(tieOn.md) ? tieOn.md : 0,
        inc: Number.isFinite(tieOn.inc) ? tieOn.inc : 0,
        azi: normalizeAzi(Number.isFinite(tieOn.azi) ? tieOn.azi : 0),
    };
    const compilerSegments = [];
    const spans = [];
    const errors = [];

    (segments || []).forEach((s, index) => {
        const type = canonicalType(s.type);
        const start = { ...cur };
        const span = {
            index, type, compiled: false, fromMd: cur.md, toMd: cur.md,
            start: { inc: cur.inc, azi: cur.azi }, end: { inc: cur.inc, azi: cur.azi },
            dls: null, toolface: null,
        };
        let seg = null;
        let end = { inc: cur.inc, azi: cur.azi };

        if (type === 'IncAziMD') {
            const md = num(s.md);
            const inc = num(s.inc);
            const azi = num(s.azi);
            if (Number.isFinite(md) && Number.isFinite(inc) && Number.isFinite(azi)) {
                const L = md - cur.md;
                if (!(L > 0)) {
                    span.error = `Segment ${index + 1} (Inc Azi MD): MD ${md} must be deeper than the segment start at ${cur.md.toFixed(2)}.`;
                } else if (inc < 0 || inc > 180) {
                    span.error = `Segment ${index + 1} (Inc Azi MD): inclination must be between 0 and 180 deg.`;
                }
            }
            if (!span.error && Number.isFinite(md) && Number.isFinite(inc) && Number.isFinite(azi)) {
                const L = md - cur.md;
                const to = { inc, azi: normalizeAzi(azi + (aziDelta || 0)) };
                const { toolfaceDeg, doglegDeg } = toolfaceForTarget(cur, to);
                if (doglegDeg < 1e-9) {
                    seg = { kind: 'hold', length: L };
                    span.dls = 0;
                } else {
                    const dls = (doglegDeg * interval) / L;
                    seg = { kind: 'toolfaceArc', length: L, dls, toolfaceDeg };
                    end = attitudeAfterArc(cur.inc, cur.azi, doglegDeg * DEG, toolfaceDeg);
                    span.dls = dls;
                    span.toolface = toolfaceDeg;
                }
            }
        } else {
            const length = parseFloat(s.length || 0);
            if (type === 'Build') {
                const rate = parseFloat(s.buildRate || 0);
                if (length > 0 && Math.abs(rate) > 0) {
                    seg = { kind: 'build', rate, length };
                    end = { inc: cur.inc + rpu(rate) * length, azi: cur.azi };
                    span.dls = Math.abs(rate);
                    span.toolface = rate >= 0 ? 0 : 180;
                }
            } else if (type === 'Turn') {
                const rate = parseFloat(s.turnRate || 0);
                if (length > 0 && Math.abs(rate) > 0) {
                    seg = { kind: 'turn', rate, length };
                    end = { inc: cur.inc, azi: normalizeAzi(cur.azi + rpu(rate) * length) };
                }
            } else if (type === 'ToolfaceArc') {
                const dls = parseFloat(s.dls || 0);
                const toolfaceDeg = parseFloat(s.toolface || 0);
                if (length > 0 && dls > 0) {
                    seg = { kind: 'toolfaceArc', length, dls, toolfaceDeg };
                    end = attitudeAfterArc(cur.inc, cur.azi, rpu(dls) * length * DEG, toolfaceDeg);
                    span.dls = dls;
                    span.toolface = normalizeAzi(toolfaceDeg);
                }
            } else if (length > 0) {
                seg = { kind: 'hold', length };
                span.dls = 0;
            }
        }

        if (seg) {
            compilerSegments.push(seg);
            cur = { md: start.md + seg.length, inc: end.inc, azi: end.azi };
            span.compiled = true;
            span.toMd = cur.md;
            span.end = { inc: end.inc, azi: end.azi };
        }
        if (span.error) errors.push(span.error);
        spans.push(span);
    });

    return { compilerSegments, spans, errors };
}

/** The compiled survey row at an MD (exact station when present, else
 *  linear interpolation between the bracketing rows). */
export function rowAtMd(planRows, md, tol = 1e-6) {
    if (!Array.isArray(planRows) || !planRows.length) return null;
    let lo = 0;
    let hi = planRows.length - 1;
    if (md <= planRows[0].md + tol) return planRows[0];
    if (md >= planRows[hi].md - tol) return planRows[hi];
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (planRows[mid].md < md) lo = mid; else hi = mid;
    }
    const a = planRows[lo];
    const b = planRows[hi];
    if (Math.abs(a.md - md) <= tol) return a;
    if (Math.abs(b.md - md) <= tol) return b;
    const f = (md - a.md) / (b.md - a.md);
    const lerp = (k) => a[k] + (b[k] - a[k]) * f;
    return {
        ...b, md, inc: lerp('inc'), azi: normalizeAzi(a.azi + wrapDelta(a.azi, b.azi) * f),
        tvd: lerp('tvd'), n: lerp('n'), e: lerp('e'), vs: lerp('vs'),
    };
}

/** Default "lands on a target" tolerance in the depth unit. */
export const defaultTargetTolerance = (mdUnit) => (mdUnit === 'ft' ? 5 : 1.5);

/**
 * Name of the site target a point lands on, or null. Targets are the
 * wellhead-relative chart rows from targetsToChart ({name, n, e, tvd,
 * geometry.radius_m in the depth unit}). Horizontal tolerance is the
 * larger of `tol` and the target radius; TVD must be within `tol`.
 */
export function targetAt(point, targets, tol) {
    if (!point || !Array.isArray(targets)) return null;
    let best = null;
    let bestD = Infinity;
    for (const t of targets) {
        if (!Number.isFinite(t?.n) || !Number.isFinite(t?.e) || !Number.isFinite(t?.tvd)) continue;
        const horiz = Math.hypot(point.n - t.n, point.e - t.e);
        const dz = Math.abs(point.tvd - t.tvd);
        const hTol = Math.max(tol, Number(t.geometry?.radius_m) || 0);
        if (horiz <= hTol && dz <= tol) {
            const d = Math.hypot(horiz, dz);
            if (d < bestD) { bestD = d; best = t.name || 'Target'; }
        }
    }
    return best;
}

const dlsKeyFor = (mdUnit) => (mdUnit === 'ft' ? 'dls100ft' : 'dls30m');

/**
 * Table rows: a tie-on row, then one row per UI segment at its end.
 * Every numeric cell is in the wellbore unit; azimuths in the wellbore
 * reference (grid - aziDelta).
 */
export function derivePlanTable({
    segments = [], spans = [], planRows = [], mdUnit = 'm', aziDelta = 0,
    targets = [], targetTolerance = null,
} = {}) {
    const interval = rateInterval(mdUnit);
    const dlsKey = dlsKeyFor(mdUnit);
    const toRef = (grid) => normalizeAzi(grid - (aziDelta || 0));
    const tol = targetTolerance ?? defaultTargetTolerance(mdUnit);
    const rows = [];
    const tie = planRows && planRows.length ? planRows[0] : null;
    const tieAtt = spans[0]?.start || { inc: 0, azi: 0 };
    rows.push({
        key: 'tie-on', segIndex: -1, type: 'TieOn', label: 'Tie-on',
        md: tie ? tie.md : (spans[0]?.fromMd ?? 0), cl: null,
        inc: tie ? tie.inc : tieAtt.inc, azi: toRef(tie ? tie.azi : tieAtt.azi),
        tvd: tie ? tie.tvd : 0, n: tie ? tie.n : 0, e: tie ? tie.e : 0, vs: tie ? tie.vs : 0,
        dls: null, tf: null, build: null, turn: null,
        target: tie ? targetAt(tie, targets, tol) : null,
        editable: [], compiled: true,
    });

    spans.forEach((span, i) => {
        const seg = segments[i] || {};
        const type = span.type;
        const cl = span.toMd - span.fromMd;
        const endRow = span.compiled ? rowAtMd(planRows, span.toMd) : null;
        const row = {
            key: seg.id != null ? String(seg.id) : `seg-${i}`,
            segIndex: i, type, label: SEGMENT_TYPE_LABELS[type],
            fromMd: span.fromMd,
            md: span.toMd, cl: span.compiled ? cl : null,
            inc: span.end.inc, azi: toRef(span.end.azi),
            tvd: endRow ? endRow.tvd : null, n: endRow ? endRow.n : null,
            e: endRow ? endRow.e : null, vs: endRow ? endRow.vs : null,
            dls: null, tf: null, build: null, turn: null, target: null,
            editable: EDITABLE_FIELDS[type] || [], compiled: span.compiled,
        };
        if (span.compiled && cl > 0) {
            row.build = ((span.end.inc - span.start.inc) * interval) / cl;
            row.turn = (wrapDelta(span.start.azi, span.end.azi) * interval) / cl;
            if (type === 'Build') row.build = parseFloat(seg.buildRate);
            if (type === 'Turn') {
                row.turn = parseFloat(seg.turnRate);
                // A constant-inclination turn is not a circular arc: report
                // the steepest station DLS the compile produced inside it.
                let worst = 0;
                for (const r of planRows || []) {
                    if (r.md > span.fromMd + 1e-6 && r.md <= span.toMd + 1e-6 && r[dlsKey] > worst) worst = r[dlsKey];
                }
                row.dls = worst;
                row.tf = toolfaceForTarget(span.start, span.end).toolfaceDeg;
            } else {
                row.dls = span.dls ?? 0;
                row.tf = type === 'Hold' || (type === 'IncAziMD' && span.toolface == null)
                    ? null : span.toolface;
            }
            if (Math.abs(row.turn) < 1e-12) row.turn = 0;
            if (Math.abs(row.build) < 1e-12) row.build = 0;
            if (endRow) row.target = targetAt(endRow, targets, tol);
        }
        // Inc Azi MD rows show the stated inputs, so a row whose compile
        // skipped still reads back what the user typed.
        if (type === 'IncAziMD') {
            const md = num(seg.md);
            const inc = num(seg.inc);
            const azi = num(seg.azi);
            if (!span.compiled) {
                row.md = Number.isFinite(md) ? md : null;
                row.inc = Number.isFinite(inc) ? inc : null;
                row.azi = Number.isFinite(azi) ? normalizeAzi(azi) : null;
            }
        }
        rows.push(row);
    });
    return rows;
}

/** The value a defining cell currently holds in the segment itself. */
function storedValue(seg, field, row) {
    const type = canonicalType(seg.type);
    if (type === 'IncAziMD') {
        if (field === 'md') return num(seg.md);
        if (field === 'cl') return num(seg.md) - row.fromMd;
        if (field === 'inc') return num(seg.inc);
        if (field === 'azi') return num(seg.azi);
    }
    if (field === 'cl') return num(seg.length);
    if (field === 'md') return row.fromMd + num(seg.length);
    if (field === 'build') return num(seg.buildRate);
    if (field === 'turn') return num(seg.turnRate);
    if (field === 'tf') return num(seg.toolface);
    if (field === 'dls') return type === 'Build' ? Math.abs(num(seg.buildRate)) : num(seg.dls);
    return NaN;
}

/**
 * Map one table edit back onto the segments array.
 * Returns the SAME array when the value does not change (so a no-op
 * edit leaves no undo entry), else a new array. Throws an Error with a
 * user-facing message when the value cannot be applied.
 */
export function applyPlanEdit(segments, row, field, rawValue) {
    const i = row?.segIndex;
    if (!Array.isArray(segments) || !(i >= 0) || i >= segments.length) {
        throw new Error('That row has no editable section.');
    }
    const seg = segments[i];
    const type = canonicalType(seg.type);
    if (!(EDITABLE_FIELDS[type] || []).includes(field)) {
        throw new Error(`${SEGMENT_TYPE_LABELS[type]} rows compute ${field.toUpperCase()}; edit a defining cell instead.`);
    }
    const v = num(rawValue);
    if (!Number.isFinite(v)) throw new Error('Enter a number.');
    const cur = storedValue(seg, field, row);
    if (Number.isFinite(cur) && Math.abs(cur - v) < 1e-9) return segments;

    const from = row.fromMd;
    let patch;
    if (field === 'md' || field === 'cl') {
        const cl = field === 'md' ? v - from : v;
        if (!(cl > 0)) {
            throw new Error(field === 'md'
                ? `MD must be deeper than the section start at ${from.toFixed(2)}.`
                : 'Course length must be positive.');
        }
        patch = type === 'IncAziMD' ? { md: tidy(from + cl) } : { length: tidy(cl) };
    } else if (field === 'build') {
        if (v === 0) throw new Error('A build rate of zero is a hold; change the section type instead.');
        patch = { buildRate: v };
    } else if (field === 'turn') {
        if (v === 0) throw new Error('A turn rate of zero is a hold; change the section type instead.');
        patch = { turnRate: v };
    } else if (field === 'dls') {
        if (!(v > 0)) throw new Error('DLS must be positive.');
        patch = type === 'Build'
            ? { buildRate: num(seg.buildRate) < 0 ? -v : v }
            : { dls: v };
    } else if (field === 'tf') {
        patch = { toolface: normalizeAzi(v) };
    } else if (field === 'inc') {
        if (v < 0 || v > 180) throw new Error('Inclination must be between 0 and 180 deg.');
        patch = { inc: v };
    } else if (field === 'azi') {
        patch = { azi: normalizeAzi(v) };
    }
    const next = segments.slice();
    next[i] = { ...seg, ...patch };
    return next;
}

const defaultRate = 3;

/**
 * Change a row's section type, keeping the geometry where the new type
 * can express it (the new type's defining inputs are filled from the
 * row's computed values; e.g. TF Arc -> Inc Azi MD keeps the same arc).
 * `row` is the derived table row for that segment, or null.
 */
export function changeSegmentType(segments, index, newType, row = null) {
    const seg = segments[index];
    if (!seg) return segments;
    const type = canonicalType(newType);
    if (canonicalType(seg.type) === type && seg.type === type) return segments;
    const ok = (x) => Number.isFinite(x);
    const cl = row && ok(row.cl) && row.cl > 0 ? row.cl : (num(seg.length) > 0 ? num(seg.length) : null);
    const base = { id: seg.id, type };
    let next;
    if (type === 'IncAziMD') {
        next = {
            ...base,
            md: row && ok(row.md) ? tidy(row.md) : (cl ?? 0),
            inc: row && ok(row.inc) ? tidy(row.inc) : 0,
            azi: row && ok(row.azi) ? tidy(row.azi) : 0,
        };
    } else {
        next = { ...base, length: tidy(cl ?? 0), buildRate: 0, turnRate: 0 };
        if (type === 'Build') {
            const b = row && ok(row.build) && row.build !== 0 ? row.build : num(seg.buildRate);
            next.buildRate = ok(b) && b !== 0 ? tidy(b) : defaultRate;
        } else if (type === 'Turn') {
            const t = row && ok(row.turn) && row.turn !== 0 ? row.turn : num(seg.turnRate);
            next.turnRate = ok(t) && t !== 0 ? tidy(t) : defaultRate;
        } else if (type === 'ToolfaceArc') {
            const d = row && ok(row.dls) && row.dls > 0 ? row.dls : num(seg.dls);
            next.dls = ok(d) && d > 0 ? tidy(d) : defaultRate;
            const tf = row && ok(row.tf) ? row.tf : num(seg.toolface);
            next.toolface = ok(tf) ? tidy(tf) : 0;
        }
    }
    const out = segments.slice();
    out[index] = next;
    return out;
}

let idCounter = 0;
export const makeSegmentId = () => `seg-${Date.now()}-${(idCounter += 1)}`;

/** Insert a default hold at position `at` (0 = directly below the tie-on). */
export function insertSegment(segments, at, { mdUnit = 'm', makeId = makeSegmentId } = {}) {
    const pos = Math.max(0, Math.min(at, segments.length));
    const out = segments.slice();
    out.splice(pos, 0, {
        id: makeId(), type: 'Hold', length: mdUnit === 'ft' ? 100 : 30, buildRate: 0, turnRate: 0,
    });
    return out;
}

export function deleteSegment(segments, index) {
    if (!(index >= 0) || index >= segments.length) return segments;
    return segments.filter((_, i) => i !== index);
}

export function moveSegment(segments, from, to) {
    if (from === to || !(from >= 0) || from >= segments.length) return segments;
    const out = segments.slice();
    const [item] = out.splice(from, 1);
    out.splice(Math.max(0, Math.min(to, out.length)), 0, item);
    return out;
}

// ---- undo / redo ------------------------------------------------------------

export const HISTORY_LIMIT = 100;
export const COALESCE_MS = 1000;

export const initHistory = (value) => ({
    past: [], present: value, future: [], lastKey: null, lastAt: 0,
});

/**
 * Undo/redo reducer over plan snapshots.
 *   {type:'reset', value}                     new design loaded; history cleared
 *   {type:'commit', value, coalesceKey?, at?} a change; typing bursts on the
 *                                             same field (same key within
 *                                             COALESCE_MS) fold into one step
 *   {type:'undo'} / {type:'redo'}
 */
export function historyReducer(state, action) {
    switch (action.type) {
    case 'reset':
        return initHistory(action.value);
    case 'commit': {
        if (action.value === state.present) return state;
        const at = Number.isFinite(action.at) ? action.at : 0;
        const key = action.coalesceKey || null;
        if (key && key === state.lastKey && at - state.lastAt <= COALESCE_MS) {
            return { ...state, present: action.value, future: [], lastAt: at };
        }
        const past = [...state.past, state.present];
        if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
        return { past, present: action.value, future: [], lastKey: key, lastAt: at };
    }
    case 'undo': {
        if (!state.past.length) return state;
        const prev = state.past[state.past.length - 1];
        return {
            past: state.past.slice(0, -1), present: prev,
            future: [state.present, ...state.future], lastKey: null, lastAt: 0,
        };
    }
    case 'redo': {
        if (!state.future.length) return state;
        const [nextValue, ...rest] = state.future;
        return {
            past: [...state.past, state.present], present: nextValue,
            future: rest, lastKey: null, lastAt: 0,
        };
    }
    default:
        return state;
    }
}
