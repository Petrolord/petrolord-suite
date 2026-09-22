// Plan Editor service: table rows are derived from the one segments
// array and the compiled survey; edits map back onto segments.

import { compileSegments } from '../engine/segmentCompiler';
import { toolfaceForTarget } from '../engine/profileDesign';
import {
    resolvePlan, derivePlanTable, applyPlanEdit, changeSegmentType,
    insertSegment, deleteSegment, moveSegment, rowAtMd, targetAt,
    historyReducer, initHistory, HISTORY_LIMIT, COALESCE_MS, EDITABLE_FIELDS,
} from '../services/planEditor';

function plan(segments, {
    mdUnit = 'm', aziDelta = 0, kickoffAzi = 0, targets = [], subdivideMd,
} = {}) {
    const tieOn = { md: 0, inc: 0, azi: kickoffAzi + aziDelta };
    const { compilerSegments, spans } = resolvePlan(segments, { mdUnit, tieOn, aziDelta });
    const compiled = compileSegments({
        mdUnit, tieOn, segments: compilerSegments,
        subdivideMd: subdivideMd ?? (mdUnit === 'ft' ? 100 : 30),
    });
    const rows = derivePlanTable({
        segments, spans, planRows: compiled.table, mdUnit, aziDelta, targets,
    });
    return { rows, compiled, spans, compilerSegments };
}

const J = () => ([
    { id: 'a', type: 'Hold', length: 500, buildRate: 0, turnRate: 0 },
    { id: 'b', type: 'Build', length: 300, buildRate: 3, turnRate: 0 },
    { id: 'c', type: 'Hold', length: 400, buildRate: 0, turnRate: 0 },
]);

describe('derivePlanTable: one row per segment end plus a tie-on', () => {
    test('hold / build / hold', () => {
        const { rows, compiled } = plan(J());
        expect(rows).toHaveLength(4);
        expect(rows[0]).toMatchObject({ type: 'TieOn', md: 0, inc: 0, editable: [] });
        expect(rows[1]).toMatchObject({ type: 'Hold', md: 500, cl: 500, dls: 0, tf: null });
        expect(rows[1].inc).toBeCloseTo(0, 12);
        expect(rows[1].tvd).toBeCloseTo(500, 9);
        expect(rows[2]).toMatchObject({ type: 'Build', md: 800, cl: 300, dls: 3, tf: 0, build: 3 });
        expect(rows[2].inc).toBeCloseTo(30, 9);
        expect(rows[3].md).toBe(1200);
        expect(rows[3].inc).toBeCloseTo(30, 9);
        expect(rows[3].build).toBe(0);
        // the compiler emits an exact station at every segment end
        for (const md of [500, 800, 1200]) {
            expect(compiled.table.some((r) => r.md === md)).toBe(true);
        }
        const last = compiled.table[compiled.table.length - 1];
        expect(rows[3].tvd).toBe(last.tvd);
        expect(rows[3].n).toBe(last.n);
        expect(rows[3].vs).toBe(last.vs);
        expect(rows[1].editable).toEqual(EDITABLE_FIELDS.Hold);
        expect(rows[2].editable).toEqual(EDITABLE_FIELDS.Build);
    });

    test('a drop reports toolface 180 and a negative build', () => {
        const segs = [...J(), { id: 'd', type: 'Build', length: 150, buildRate: -2, turnRate: 0 }];
        const { rows } = plan(segs);
        expect(rows[4]).toMatchObject({ tf: 180, build: -2, dls: 2 });
        expect(rows[4].inc).toBeCloseTo(20, 9);
    });

    test('turn row: rate as entered, right-hand toolface, DLS from the compile', () => {
        const segs = [...J(), { id: 't', type: 'Turn', length: 150, turnRate: 2, buildRate: 0 }];
        const { rows } = plan(segs, { subdivideMd: 10 });
        const r = rows[4];
        expect(r.turn).toBe(2);
        expect(r.azi).toBeCloseTo(10, 9);
        expect(r.inc).toBeCloseTo(30, 9);
        expect(r.tf).toBeGreaterThan(80);
        expect(r.tf).toBeLessThan(100);
        // curvature of a constant-inclination turn is turnRate * sin(inc)
        expect(r.dls).toBeCloseTo(2 * Math.sin(Math.PI / 6), 2);
        expect(r.editable).toEqual(EDITABLE_FIELDS.Turn);
    });

    test('TF arc row carries its DLS and toolface', () => {
        const segs = [...J(), { id: 'f', type: 'ToolfaceArc', length: 200, dls: 3, toolface: 45 }];
        const { rows, compiled } = plan(segs);
        const r = rows[4];
        expect(r).toMatchObject({ dls: 3, tf: 45, cl: 200, md: 1400 });
        const end = compiled.table[compiled.table.length - 1];
        expect(r.inc).toBeCloseTo(end.inc, 9);
        expect(r.azi).toBeCloseTo(end.azi, 9);
        // station DLS on the exact arc equals the entered DLS
        expect(end.dls30m).toBeCloseTo(3, 6);
    });

    test('segments left out of the compile keep a row, flagged, and the old skip rule holds', () => {
        const segs = [
            { id: 'a', type: 'Hold', length: 500 },
            { id: 'z', type: 'Build', length: 100, buildRate: 0 },
            { id: 'y', type: 'Hold', length: '' },
            { id: 'b', type: 'Build', length: 300, buildRate: 3 },
        ];
        const { rows, compilerSegments } = plan(segs);
        expect(compilerSegments.map((s) => s.kind)).toEqual(['hold', 'build']);
        expect(rows[2]).toMatchObject({ compiled: false, cl: null, md: 500 });
        expect(rows[3]).toMatchObject({ compiled: false });
        expect(rows[4]).toMatchObject({ md: 800, compiled: true });
    });
});

describe('Inc Azi MD sections', () => {
    const withIam = () => [...J(), { id: 'i', type: 'IncAziMD', inc: 60, azi: 45, md: 1600 }];

    test('solves one minimum-curvature arc to the stated attitude at the stated MD', () => {
        const { rows, compiled, compilerSegments } = plan(withIam());
        const r = rows[4];
        expect(compilerSegments[3].kind).toBe('toolfaceArc');
        expect(r.md).toBe(1600);
        expect(r.cl).toBe(400);
        expect(r.inc).toBeCloseTo(60, 9);
        expect(r.azi).toBeCloseTo(45, 9);
        const end = compiled.table[compiled.table.length - 1];
        expect(end.md).toBe(1600);
        expect(end.inc).toBeCloseTo(60, 9);
        expect(end.azi).toBeCloseTo(45, 9);
        const { toolfaceDeg, doglegDeg } = toolfaceForTarget({ inc: 30, azi: 0 }, { inc: 60, azi: 45 });
        expect(r.dls).toBeCloseTo((doglegDeg * 30) / 400, 9);
        expect(r.tf).toBeCloseTo(toolfaceDeg, 9);
        expect(end.dls30m).toBeCloseTo(r.dls, 6);
        expect(r.editable).toEqual(EDITABLE_FIELDS.IncAziMD);
    });

    test('re-solves when an earlier row changes; its MD, Inc and Azi stay put', () => {
        const segs = withIam();
        const before = plan(segs).rows[4];
        const edited = applyPlanEdit(segs, plan(segs).rows[1], 'cl', 400);
        const after = plan(edited).rows[4];
        expect(after.md).toBe(1600);
        expect(after.cl).toBe(500);
        expect(after.inc).toBeCloseTo(60, 9);
        expect(after.azi).toBeCloseTo(45, 9);
        expect(after.dls).not.toBeCloseTo(before.dls, 6);
    });

    test('no attitude change compiles as a hold', () => {
        const segs = [...J(), { id: 'i', type: 'IncAziMD', inc: 30, azi: 0, md: 1500 }];
        const { rows, compilerSegments } = plan(segs);
        expect(compilerSegments[3]).toEqual({ kind: 'hold', length: 300 });
        expect(rows[4]).toMatchObject({ dls: 0, tf: null, md: 1500 });
    });

    test('kicks off a vertical hole (toolface from north)', () => {
        const segs = [
            { id: 'a', type: 'Hold', length: 300 },
            { id: 'i', type: 'IncAziMD', inc: 20, azi: 120, md: 500 },
        ];
        const { rows } = plan(segs);
        expect(rows[2].inc).toBeCloseTo(20, 9);
        expect(rows[2].azi).toBeCloseTo(120, 9);
        expect(rows[2].tf).toBeCloseTo(120, 9);
        expect(rows[2].dls).toBeCloseTo(3, 9);
    });

    test('azimuth is in the wellbore reference; the compile runs in grid', () => {
        const segs = [...J(), { id: 'i', type: 'IncAziMD', inc: 60, azi: 45, md: 1600 }];
        const { rows, compiled } = plan(segs, { aziDelta: 2.5, kickoffAzi: 10 });
        const end = compiled.table[compiled.table.length - 1];
        expect(end.azi).toBeCloseTo(47.5, 9); // grid
        expect(rows[4].azi).toBeCloseTo(45, 9); // reference
        expect(rows[3].azi).toBeCloseTo(10, 9); // KO azimuth, reference
    });

    test('an MD that is not deeper than the section start is an error', () => {
        const segs = [...J(), { id: 'i', type: 'IncAziMD', inc: 60, azi: 45, md: 1100 }];
        const { errors, spans, compilerSegments } = resolvePlan(segs, { mdUnit: 'm' });
        expect(errors).toEqual([expect.stringMatching(/must be deeper than the segment start at 1200.00/)]);
        expect(spans[3]).toMatchObject({ compiled: false });
        expect(compilerSegments).toHaveLength(3);
        // the row still shows what was typed so it can be fixed in place
        const { rows } = plan(segs);
        expect(rows[4]).toMatchObject({ compiled: false, md: 1100, inc: 60, azi: 45 });
        expect(resolvePlan([{ type: 'IncAziMD', inc: 190, azi: 0, md: 100 }]).errors[0]).toMatch(/between 0 and 180/);
    });

    test('rows still derive (positions blank) when the compile itself fails', () => {
        const segs = [{ id: 't', type: 'Turn', length: 100, turnRate: 3 }];
        const { spans } = resolvePlan(segs, { mdUnit: 'm' });
        expect(() => compileSegments({ segments: resolvePlan(segs).compilerSegments })).toThrow(/vertical/);
        const rows = derivePlanTable({ segments: segs, spans, planRows: null });
        expect(rows).toHaveLength(2);
        expect(rows[1]).toMatchObject({ md: 100, tvd: null, turn: 3 });
    });

    test('a half-typed row is skipped and reads back what was typed', () => {
        const segs = [...J(), { id: 'i', type: 'IncAziMD', inc: 60, azi: '', md: 1600 }];
        const { rows, compilerSegments } = plan(segs);
        expect(compilerSegments).toHaveLength(3);
        expect(rows[4]).toMatchObject({ compiled: false, md: 1600, inc: 60, azi: null });
    });
});

describe('applyPlanEdit maps table edits back onto segments', () => {
    test('MD edit on a hold adjusts its course length; later rows shift', () => {
        const segs = J();
        const { rows } = plan(segs);
        const next = applyPlanEdit(segs, rows[1], 'md', 600);
        expect(next).not.toBe(segs);
        expect(next[0]).toMatchObject({ id: 'a', type: 'Hold', length: 600 });
        expect(next[1]).toBe(segs[1]);
        const r2 = plan(next).rows;
        expect(r2[2].md).toBe(900);
        expect(r2[3].md).toBe(1300);
    });

    test('MD and CL edits on later rows use the row start', () => {
        const segs = J();
        const { rows } = plan(segs);
        expect(applyPlanEdit(segs, rows[2], 'md', 850)[1].length).toBe(350);
        expect(applyPlanEdit(segs, rows[3], 'cl', 250)[2].length).toBe(250);
        // float noise from MD arithmetic is tidied
        expect(applyPlanEdit(segs, rows[3], 'md', 1234.3)[2].length).toBe(434.3);
    });

    test('Inc Azi MD edits store the target values', () => {
        const segs = [...J(), { id: 'i', type: 'IncAziMD', inc: 60, azi: 45, md: 1600 }];
        const { rows } = plan(segs);
        expect(applyPlanEdit(segs, rows[4], 'md', 1700)[3].md).toBe(1700);
        expect(applyPlanEdit(segs, rows[4], 'cl', 300)[3].md).toBe(1500);
        expect(applyPlanEdit(segs, rows[4], 'inc', 75)[3].inc).toBe(75);
        expect(applyPlanEdit(segs, rows[4], 'azi', -10)[3].azi).toBe(350);
    });

    test('rate, DLS and toolface edits', () => {
        const segs = [
            ...J(),
            { id: 't', type: 'Turn', length: 150, turnRate: 2 },
            { id: 'f', type: 'ToolfaceArc', length: 200, dls: 3, toolface: 45 },
            { id: 'd', type: 'Build', length: 100, buildRate: -2 },
        ];
        const { rows } = plan(segs);
        expect(applyPlanEdit(segs, rows[2], 'build', 4)[1].buildRate).toBe(4);
        expect(applyPlanEdit(segs, rows[2], 'dls', 5)[1].buildRate).toBe(5);
        // DLS on a drop keeps the drop direction
        expect(applyPlanEdit(segs, rows[6], 'dls', 2.5)[5].buildRate).toBe(-2.5);
        expect(applyPlanEdit(segs, rows[4], 'turn', -3)[3].turnRate).toBe(-3);
        expect(applyPlanEdit(segs, rows[5], 'dls', 4)[4].dls).toBe(4);
        expect(applyPlanEdit(segs, rows[5], 'tf', 370)[4].toolface).toBe(10);
    });

    test('bad values are refused with a message', () => {
        const segs = J();
        const { rows } = plan(segs);
        expect(() => applyPlanEdit(segs, rows[2], 'md', 400)).toThrow(/deeper than the section start at 500.00/);
        expect(() => applyPlanEdit(segs, rows[1], 'cl', 0)).toThrow(/positive/);
        expect(() => applyPlanEdit(segs, rows[1], 'cl', 'abc')).toThrow(/number/);
        expect(() => applyPlanEdit(segs, rows[1], 'tvd', 400)).toThrow(/compute/);
        expect(() => applyPlanEdit(segs, rows[1], 'inc', 10)).toThrow(/compute/);
        expect(() => applyPlanEdit(segs, rows[2], 'build', 0)).toThrow(/zero/);
        expect(() => applyPlanEdit(segs, rows[2], 'dls', -1)).toThrow(/positive/);
        expect(() => applyPlanEdit(segs, rows[0], 'md', 10)).toThrow(/no editable section/);
    });

    test('round trip: every defining cell written back unchanged returns the same array', () => {
        const segs = [
            ...J(),
            { id: 't', type: 'Turn', length: 150, turnRate: 2 },
            { id: 'f', type: 'ToolfaceArc', length: 200, dls: 3, toolface: 45 },
            { id: 'i', type: 'IncAziMD', inc: 70, azi: 80, md: 2300 },
            { id: 'd', type: 'Build', length: 100, buildRate: '-2' },
        ];
        const snapshot = JSON.stringify(segs);
        const { rows } = plan(segs);
        let edits = 0;
        for (const row of rows.slice(1)) {
            for (const field of row.editable) {
                expect(applyPlanEdit(segs, row, field, row[field])).toBe(segs);
                expect(applyPlanEdit(segs, row, field, String(row[field]))).toBe(segs);
                edits += 1;
            }
        }
        expect(edits).toBeGreaterThan(15);
        expect(JSON.stringify(segs)).toBe(snapshot);
    });
});

describe('changeSegmentType keeps the geometry where it can', () => {
    test('TF arc -> Inc Azi MD -> TF arc reproduces the same end point', () => {
        const segs = [...J(), { id: 'f', type: 'ToolfaceArc', length: 200, dls: 3, toolface: 45 }];
        const a = plan(segs);
        const toIam = changeSegmentType(segs, 3, 'IncAziMD', a.rows[4]);
        expect(toIam[3]).toMatchObject({ id: 'f', type: 'IncAziMD', md: 1400 });
        const b = plan(toIam);
        for (const k of ['md', 'inc', 'azi', 'tvd', 'n', 'e']) {
            expect(b.rows[4][k]).toBeCloseTo(a.rows[4][k], 5);
        }
        const back = changeSegmentType(toIam, 3, 'ToolfaceArc', b.rows[4]);
        expect(back[3].dls).toBeCloseTo(3, 5);
        expect(back[3].toolface).toBeCloseTo(45, 5);
        expect(back[3].length).toBeCloseTo(200, 6);
        expect(back[3].md).toBeUndefined();
    });

    test('Hold -> Build uses a default rate and keeps the length', () => {
        const segs = J();
        const { rows } = plan(segs);
        const next = changeSegmentType(segs, 2, 'Build', rows[3]);
        expect(next[2]).toMatchObject({ type: 'Build', length: 400, buildRate: 3 });
        expect(changeSegmentType(segs, 2, 'Hold', rows[3])).toBe(segs);
    });

    test('works without a derived row (compile failed)', () => {
        const segs = J();
        expect(changeSegmentType(segs, 0, 'Turn')[0]).toMatchObject({ type: 'Turn', length: 500, turnRate: 3 });
    });
});

describe('insert, delete and move', () => {
    const makeId = () => 'new';
    test('insert above and below a row', () => {
        const segs = J();
        const above = insertSegment(segs, 1, { makeId });
        expect(above.map((s) => s.id)).toEqual(['a', 'new', 'b', 'c']);
        expect(above[1]).toMatchObject({ type: 'Hold', length: 30 });
        const below = insertSegment(segs, 3, { makeId, mdUnit: 'ft' });
        expect(below.map((s) => s.id)).toEqual(['a', 'b', 'c', 'new']);
        expect(below[3].length).toBe(100);
        expect(insertSegment([], 0, { makeId })).toHaveLength(1);
        expect(segs).toHaveLength(3);
    });

    test('delete and move', () => {
        const segs = J();
        expect(deleteSegment(segs, 1).map((s) => s.id)).toEqual(['a', 'c']);
        expect(deleteSegment(segs, 9)).toBe(segs);
        expect(moveSegment(segs, 0, 2).map((s) => s.id)).toEqual(['b', 'c', 'a']);
        expect(moveSegment(segs, 1, 1)).toBe(segs);
    });

    test('inserting above an Inc Azi MD row leaves its MD and attitude fixed', () => {
        const segs = [...J(), { id: 'i', type: 'IncAziMD', inc: 60, azi: 45, md: 1600 }];
        const next = insertSegment(segs, 3, { makeId });
        const r = plan(next).rows;
        expect(r[4].md).toBe(1230);
        expect(r[5].md).toBe(1600);
        expect(r[5].cl).toBe(370);
        expect(r[5].inc).toBeCloseTo(60, 9);
    });
});

describe('feet wells', () => {
    test('rates per 100 ft, lengths in feet', () => {
        const segs = [
            { id: 'a', type: 'Hold', length: 1000 },
            { id: 'b', type: 'Build', length: 1000, buildRate: 3 },
            { id: 'i', type: 'IncAziMD', inc: 45, azi: 90, md: 2800 },
        ];
        const { rows, compiled } = plan(segs, { mdUnit: 'ft' });
        expect(rows[2].inc).toBeCloseTo(30, 9);
        expect(rows[2]).toMatchObject({ dls: 3, build: 3, md: 2000 });
        const { doglegDeg } = toolfaceForTarget({ inc: 30, azi: 0 }, { inc: 45, azi: 90 });
        expect(rows[3].dls).toBeCloseTo((doglegDeg * 100) / 800, 9);
        expect(compiled.table[compiled.table.length - 1].dls100ft).toBeCloseTo(rows[3].dls, 6);
        const next = applyPlanEdit(segs, rows[2], 'md', 2100);
        expect(next[1].length).toBe(1100);
    });
});

describe('target lookup and row interpolation', () => {
    test('a row that lands on a site target names it', () => {
        const segs = J();
        const { compiled } = plan(segs);
        const end = compiled.table[compiled.table.length - 1];
        const targets = [
            { name: 'T1', n: end.n + 0.5, e: end.e, tvd: end.tvd - 0.4 },
            { name: 'Far', n: 0, e: 0, tvd: 9999 },
        ];
        const { rows } = plan(segs, { targets });
        expect(rows[3].target).toBe('T1');
        expect(rows[2].target).toBeNull();
    });

    test('tolerance: radius widens the horizontal window, never the TVD', () => {
        const p = { n: 0, e: 0, tvd: 1000 };
        expect(targetAt(p, [{ name: 'A', n: 10, e: 0, tvd: 1000 }], 1.5)).toBeNull();
        expect(targetAt(p, [{ name: 'A', n: 10, e: 0, tvd: 1000, geometry: { radius_m: 15 } }], 1.5)).toBe('A');
        expect(targetAt(p, [{ name: 'A', n: 0, e: 0, tvd: 1010, geometry: { radius_m: 15 } }], 1.5)).toBeNull();
        expect(targetAt(p, [{ name: 'Near', n: 1, e: 0, tvd: 1000 }, { name: 'Nearer', n: 0.2, e: 0, tvd: 1000 }], 1.5)).toBe('Nearer');
    });

    test('rowAtMd returns exact stations and interpolates between them', () => {
        const rows = [
            { md: 0, inc: 0, azi: 350, tvd: 0, n: 0, e: 0, vs: 0 },
            { md: 10, inc: 10, azi: 10, tvd: 10, n: 2, e: 4, vs: 1 },
        ];
        expect(rowAtMd(rows, 10)).toBe(rows[1]);
        const mid = rowAtMd(rows, 5);
        expect(mid.inc).toBe(5);
        expect(mid.azi).toBeCloseTo(0, 9);
        expect(mid.e).toBe(2);
        expect(rowAtMd([], 5)).toBeNull();
    });
});

describe('historyReducer: one undo stack for every edit path', () => {
    const v = (n) => ({ segments: [n] });

    test('commit, undo, redo; a new commit clears redo', () => {
        let s = initHistory(v(0));
        s = historyReducer(s, { type: 'commit', value: v(1), at: 0 });
        s = historyReducer(s, { type: 'commit', value: v(2), at: 5000 });
        expect(s.present.segments).toEqual([2]);
        s = historyReducer(s, { type: 'undo' });
        expect(s.present.segments).toEqual([1]);
        s = historyReducer(s, { type: 'undo' });
        expect(s.present.segments).toEqual([0]);
        expect(historyReducer(s, { type: 'undo' })).toBe(s);
        s = historyReducer(s, { type: 'redo' });
        expect(s.present.segments).toEqual([1]);
        s = historyReducer(s, { type: 'commit', value: v(9), at: 9000 });
        expect(s.future).toEqual([]);
        expect(historyReducer(s, { type: 'redo' })).toBe(s);
        s = historyReducer(s, { type: 'undo' });
        expect(s.present.segments).toEqual([1]);
    });

    test('typing bursts on the same field fold into one step', () => {
        let s = initHistory(v(0));
        s = historyReducer(s, { type: 'commit', value: v(1), coalesceKey: 'a:length', at: 1000 });
        s = historyReducer(s, { type: 'commit', value: v(12), coalesceKey: 'a:length', at: 1300 });
        s = historyReducer(s, { type: 'commit', value: v(123), coalesceKey: 'a:length', at: 1600 });
        expect(s.past).toHaveLength(1);
        s = historyReducer(s, { type: 'commit', value: v(124), coalesceKey: 'a:length', at: 1600 + COALESCE_MS + 1 });
        expect(s.past).toHaveLength(2);
        s = historyReducer(s, { type: 'commit', value: v(5), coalesceKey: 'b:length', at: 2700 });
        expect(s.past).toHaveLength(3);
        s = historyReducer(s, { type: 'undo' });
        s = historyReducer(s, { type: 'undo' });
        s = historyReducer(s, { type: 'undo' });
        expect(s.present.segments).toEqual([0]);
        // after an undo, a same-key commit starts a fresh step
        s = historyReducer(s, { type: 'redo' });
        s = historyReducer(s, { type: 'commit', value: v(7), coalesceKey: 'a:length', at: 2701 });
        expect(s.past).toHaveLength(2);
    });

    test('identical value is not a step; reset clears; the stack is capped', () => {
        let s = initHistory(v(0));
        const same = s.present;
        expect(historyReducer(s, { type: 'commit', value: same })).toBe(s);
        for (let i = 1; i <= HISTORY_LIMIT + 20; i++) {
            s = historyReducer(s, { type: 'commit', value: v(i), at: i * 10000 });
        }
        expect(s.past).toHaveLength(HISTORY_LIMIT);
        s = historyReducer(s, { type: 'reset', value: v(-1) });
        expect(s).toEqual(initHistory(v(-1)));
    });
});
