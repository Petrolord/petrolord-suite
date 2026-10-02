/**
 * H9 (Reservoir honesty sweep): the Detailed Audit report always printed
 * "A default porosity-water-saturation correlation of -0.8 is applied",
 * whatever the correlation editor held. The note now prints the
 * correlations the run actually applied (results.meta.correlations, written
 * by the Monte Carlo engine).
 */
jest.mock('jspdf-autotable', () => ({}));
jest.mock('jspdf', () => jest.fn().mockImplementation(() => {
    const calls = { text: [], pages: 1 };
    const doc = {
        internal: { pageSize: { width: 210, height: 297 }, getNumberOfPages: () => calls.pages, scaleFactor: 1, getFontSize: () => 10 },
        lastAutoTable: { finalY: 60 },
        setFillColor() {}, rect() {}, setTextColor() {}, setFontSize() {}, setFont() {},
        roundedRect() {}, setDrawColor() {}, setPage() {},
        getTextWidth: (t) => (typeof t === 'string' ? t.length * 2 : 0),
        getImageProperties: () => ({ width: 1000, height: 400 }),
        splitTextToSize: (t) => [t],
        text(t) { if (typeof t === 'string') calls.text.push(t); },
        autoTable() { this.lastAutoTable = { finalY: (this.lastAutoTable.finalY || 45) + 30 }; },
        addImage() {}, addPage() { calls.pages += 1; }, save() {},
        __calls: calls,
    };
    global.__lastDoc = doc;
    return doc;
}));

import { ReportGenerator } from '@/pages/apps/ReservoirCalcPro/components/tools/ReportGenerator';
import { correlationSentence } from '@/pages/apps/ReservoirCalcPro/services/reportInfo';
import { MonteCarloEngine } from '@/pages/apps/ReservoirCalcPro/services/MonteCarloEngine';

const baseResults = (meta) => ({
    stats: {
        stooip: { p90: 30e6, p50: 45e6, p10: 65e6, mean: 46e6, stdDev: 12e6, min: 20e6, max: 90e6, cdf: [] },
        giip: {}, sensitivity: [], iterations: 1000, validCount: 1000,
    },
    raw: { stooip: new Array(1000).fill(45e6), giip: [] },
    diagnostics: { rejectedCount: 0, warnings: [], tracking: {} },
    meta,
});

const auditText = async (meta) => {
    await ReportGenerator.generateProbabilisticReport('North Field', baseResults(meta), 'field', {}, { template: 'audit', fluidType: 'oil' });
    return global.__lastDoc.__calls.text.join(' ');
};

describe('H9: the audit note prints the correlations the run applied', () => {
    it('a user correlation is printed, and the hard-coded -0.8 sentence is gone', async () => {
        const text = await auditText({ correlations: [{ a: 'porosity', b: 'sw', rho: -0.5 }, { a: 'area', b: 'thickness', rho: 0.3 }] });
        expect(text).toMatch(/porosity with sw -0\.5/);
        expect(text).toMatch(/area with thickness 0\.3/);
        expect(text).not.toMatch(/default porosity-water-saturation correlation of -0\.8 is applied/);
        expect(text).not.toMatch(/-0\.8/);
    });

    it('no correlation is said as none', async () => {
        const text = await auditText({ correlations: [] });
        expect(text).toMatch(/Correlations: none \(inputs sampled independently\)/);
        expect(text).not.toMatch(/-0\.8/);
    });

    it('the default is printed when the default is what ran', async () => {
        const text = await auditText({ correlations: [{ a: 'porosity', b: 'sw', rho: -0.8 }] });
        expect(text).toMatch(/porosity with sw -0\.8/);
    });

    it('a run with no record says so and does not claim a value', async () => {
        const text = await auditText(undefined);
        expect(text).toMatch(/not recorded on this run/);
        expect(correlationSentence(undefined)).toBe(correlationSentence({}));
    });

    it('the sentence follows what the Monte Carlo engine reports for the run', async () => {
        const dist = (min, mode, max) => ({ type: 'triangular', min, mode, max });
        const inputs = {
            area: dist(900, 1000, 1100), thickness: dist(40, 50, 60), ntg: dist(0.7, 0.8, 0.9),
            porosity: dist(0.15, 0.2, 0.25), sw: dist(0.2, 0.3, 0.4), fvf: dist(1.1, 1.2, 1.3),
        };
        const engine = MonteCarloEngine.simulate
            ? MonteCarloEngine
            : new MonteCarloEngine();
        const run = (correlations) => engine.simulate({ iterations: 200, seed: 7, unitSystem: 'field', fluidType: 'oil', correlations }, inputs);
        const custom = await run([{ a: 'porosity', b: 'sw', rho: -0.35 }]);
        expect(correlationSentence(custom.meta)).toMatch(/porosity with sw -0\.35/);
        const none = await run([]);
        expect(correlationSentence(none.meta)).toMatch(/none/);
        const dflt = await run(undefined);
        expect(correlationSentence(dflt.meta)).toMatch(/porosity with sw -0\.8/);
    });
});
