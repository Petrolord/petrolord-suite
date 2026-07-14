/**
 * G7.2 — real analysis plumbing: results-view alignment, heat-flow
 * auto-fit recovery, sensitivity sweeps through the real engine.
 */
import { SimulationEngine } from '../services/SimulationEngine';
import { HeatFlowFitter } from '../services/HeatFlowFitter';
import { alignSeriesByAge, finalDepthProfile } from '../services/resultsView';
import { applySweptParameter } from '../components/sensitivity/SensitivityAnalysisView';

const PROJECT = {
    stratigraphy: [
        { id: 'a', name: 'Upper', thickness: 1500, lithology: 'shale', ageStart: 60, ageEnd: 10 },
        { id: 'b', name: 'Source', thickness: 400, lithology: 'shale', ageStart: 100, ageEnd: 60,
          sourceRock: { isSource: true, toc: 3, hi: 400, kerogen: 'type2' } },
        { id: 'c', name: 'Base', thickness: 1000, lithology: 'sandstone', ageStart: 140, ageEnd: 100 },
    ],
    heatFlow: { type: 'constant', value: 70 },
    erosionEvents: [],
};

describe('resultsView helpers', () => {
    let results;
    beforeAll(async () => {
        results = await SimulationEngine.run(PROJECT);
    });

    test('alignSeriesByAge keys rows by each entry\'s own age', () => {
        const rows = alignSeriesByAge(results.data.timeSteps, results.data.temperature, results.meta.layers);
        // Oldest step: only the oldest layer exists.
        expect(rows[0].age).toBe(140);
        expect(rows[0].Base).toBeDefined();
        expect(rows[0].Upper).toBeUndefined();
        // The Upper layer's first defined row is at its deposition age,
        // not shifted to the start of the run.
        const firstUpper = rows.find(r => r.Upper !== undefined);
        expect(firstUpper.age).toBe(60);
        // Final step has everyone.
        const last = rows[rows.length - 1];
        expect(last.age).toBe(0);
        results.meta.layers.forEach(l => expect(last[l.name]).toBeDefined());
    });

    test('finalDepthProfile is depth-ordered with Ro increasing downward', () => {
        const prof = finalDepthProfile(results);
        expect(prof.length).toBe(3);
        for (let i = 1; i < prof.length; i++) {
            expect(prof[i].depth).toBeGreaterThan(prof[i - 1].depth);
            expect(prof[i].ro).toBeGreaterThan(prof[i - 1].ro);
            expect(prof[i].temp).toBeGreaterThan(prof[i - 1].temp);
        }
    });
});

describe('HeatFlowFitter', () => {
    test('recovers a known constant heat flow from synthetic calibration data', async () => {
        // Truth: Q = 70. Sample the truth model, then fit starting from Q = 45.
        const truth = await SimulationEngine.run(PROJECT);
        const prof = finalDepthProfile(truth);
        const roPoints = prof.map((p, i) => ({ id: i, depth: p.depth, value: p.ro }));
        const bhtPoints = prof.map((p, i) => ({ id: i, depth: p.depth, value: p.temp }));

        const start = { ...PROJECT, heatFlow: { type: 'constant', value: 45 } };
        const fitted = await HeatFlowFitter.fit(start, roPoints, bhtPoints);
        expect(Math.abs(fitted.heatFlow.value - 70)).toBeLessThan(2);
        expect(fitted.misfit).toBeLessThan(0.05);
    }, 30000);

    test('variable heat flow fits a shape-preserving scale', async () => {
        const variable = {
            ...PROJECT,
            heatFlow: { type: 'variable', value: 70, history: [{ age: 140, value: 90 }, { age: 0, value: 70 }] },
        };
        const truth = await SimulationEngine.run(variable);
        const prof = finalDepthProfile(truth);
        const roPoints = prof.map((p, i) => ({ id: i, depth: p.depth, value: p.ro }));

        const start = {
            ...PROJECT,
            heatFlow: { type: 'variable', value: 87.5, history: [{ age: 140, value: 112.5 }, { age: 0, value: 87.5 }] },
        };
        const fitted = await HeatFlowFitter.fit(start, roPoints, []);
        // 112.5/87.5 is the truth history scaled by 1.25 — the fitted
        // scale should undo it (0.8) within a few percent.
        expect(Math.abs(fitted.heatFlow.history[1].value - 70)).toBeLessThan(3);
        const ratio = fitted.heatFlow.history[0].value / fitted.heatFlow.history[1].value;
        expect(ratio).toBeCloseTo(90 / 70, 5); // shape preserved
    }, 30000);
});

describe('sensitivity sweeps run the real engine', () => {
    test('max final Ro increases monotonically with constant heat flow', async () => {
        const state = { ...PROJECT };
        const values = [50, 65, 80];
        const out = [];
        for (const v of values) {
            const project = applySweptParameter(state, 'heatFlow', v);
            const res = await SimulationEngine.run(project);
            out.push(Math.max(...finalDepthProfile(res).map(p => p.ro)));
        }
        expect(out[1]).toBeGreaterThan(out[0]);
        expect(out[2]).toBeGreaterThan(out[1]);
    }, 30000);

    test('erosion sweep adds/overrides an event; conductivity sweep scales all layers', async () => {
        const eroded = applySweptParameter(PROJECT, 'erosion', 800);
        expect(eroded.erosionEvents).toEqual([{ age: 10, amount: 800 }]);

        const scaled = applySweptParameter(PROJECT, 'conductivity', 0.5);
        scaled.stratigraphy.forEach((l, i) => {
            const base = SimulationEngine.resolveThermal(PROJECT.stratigraphy[i]);
            expect(l.thermal.conductivity).toBeCloseTo(base.conductivity * 0.5, 12);
        });
        // Lower conductivity -> hotter basin -> higher Ro.
        const cold = await SimulationEngine.run(applySweptParameter(PROJECT, 'conductivity', 1.3));
        const hot = await SimulationEngine.run(scaled);
        const roCold = Math.max(...finalDepthProfile(cold).map(p => p.ro));
        const roHot = Math.max(...finalDepthProfile(hot).map(p => p.ro));
        expect(roHot).toBeGreaterThan(roCold);
    }, 30000);
});
