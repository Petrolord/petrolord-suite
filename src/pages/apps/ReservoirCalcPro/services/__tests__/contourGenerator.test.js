import { generateContours, niceInterval, contourLevels } from '@/pages/apps/ReservoirCalcPro/services/ContourGenerator';

describe('niceInterval', () => {
    it('picks round 1/2/5 steps', () => {
        expect(niceInterval(0, 100, 10)).toBe(10);
        expect(niceInterval(0, 50, 10)).toBe(5);
        expect(niceInterval(0, 1000, 10)).toBe(100);
    });
    it('is defensive on degenerate input', () => {
        expect(niceInterval(5, 5)).toBe(1);
    });
});

describe('contourLevels', () => {
    it('snaps to interval multiples within range', () => {
        expect(contourLevels(0, 100, 25)).toEqual([0, 25, 50, 75, 100]);
    });
    it('returns nothing for an invalid range', () => {
        expect(contourLevels(100, 0, 25)).toEqual([]);
    });
});

describe('generateContours', () => {
    // A plane rising in +x: z = i*100 across a 3x3 grid → vertical isolines.
    const grid = {
        x: [0, 1, 2],
        y: [0, 1, 2],
        z: [
            [0, 100, 200],
            [0, 100, 200],
            [0, 100, 200],
        ],
    };

    it('produces isolines crossing the field', () => {
        const { levels, interval } = generateContours(grid, { min: 0, max: 200, count: 4 });
        expect(interval).toBeGreaterThan(0);
        expect(levels.length).toBeGreaterThan(0);
        // Every level should have at least one segment with two endpoints.
        levels.forEach((l) => {
            expect(l.segments.length).toBeGreaterThan(0);
            l.segments.forEach(([a, b]) => {
                expect(a).toHaveProperty('x');
                expect(b).toHaveProperty('y');
            });
        });
    });

    it('places the z=100 contour at x≈1', () => {
        const { levels } = generateContours(grid, { min: 0, max: 200, interval: 100 });
        const lvl = levels.find((l) => l.level === 100);
        expect(lvl).toBeTruthy();
        lvl.segments.forEach(([a, b]) => {
            expect(a.x).toBeCloseTo(1, 5);
            expect(b.x).toBeCloseTo(1, 5);
        });
    });

    it('skips cells touching null nodes', () => {
        const holed = { x: [0, 1, 2], y: [0, 1], z: [[0, 100, 200], [0, null, 200]] };
        const { levels } = generateContours(holed, { min: 0, max: 200, interval: 100 });
        // Should still run without throwing and produce some geometry from valid cells.
        expect(Array.isArray(levels)).toBe(true);
    });
});
