// Mock jsPDF so we can assert which sections each report template emits,
// without producing a real PDF.
jest.mock('jspdf-autotable', () => ({}));
jest.mock('jspdf', () => jest.fn().mockImplementation(() => {
    const calls = { text: [], tableHeads: [], images: 0, pages: 1, saveName: null };
    const doc = {
        internal: { pageSize: { width: 210, height: 297 }, getNumberOfPages: () => calls.pages, scaleFactor: 1, getFontSize: () => 10 },
        lastAutoTable: { finalY: 60 },
        setFillColor() {}, rect() {}, setTextColor() {}, setFontSize() {}, setFont() {},
        roundedRect() {}, setDrawColor() {}, setPage() {},
        text(t) { if (typeof t === 'string') calls.text.push(t); },
        autoTable(opts) { calls.tableHeads.push((opts.head?.[0] || []).join('|')); this.lastAutoTable = { finalY: (this.lastAutoTable.finalY || 45) + 30 }; },
        addImage() { calls.images += 1; },
        addPage() { calls.pages += 1; },
        save(name) { calls.saveName = name; },
        __calls: calls,
    };
    global.__lastDoc = doc;
    return doc;
}));

import { ReportGenerator, REPORT_TEMPLATES } from '@/pages/apps/ReservoirCalcPro/components/tools/ReportGenerator';

const results = {
    stats: {
        stooip: { p90: 30e6, p50: 45e6, p10: 65e6, mean: 46e6, stdDev: 12e6, min: 20e6, max: 90e6, cdf: [] },
        giip: {},
        sensitivity: [
            { parameter: 'area', contribution: 60, impactDirection: 1 },
            { parameter: 'sw', contribution: 40, impactDirection: -1 },
        ],
        iterations: 10000,
        validCount: 9985,
    },
    raw: { stooip: new Array(9985).fill(45e6), giip: [] },
    diagnostics: {
        rejectedCount: 15,
        warnings: [],
        tracking: { P50: { inputs: { area: 1000, thickness: 50, ntg: 1, phi: 0.2, sw: 0.3, fvf: 1.2, bg: 0.005 } } },
    },
};

const run = (template) => ReportGenerator.generateProbabilisticReport(
    'North Field', results, 'field', { histogram: 'img', cdf: 'img', tornado: 'img' }, { template, fluidType: 'oil' },
);

const texts = () => global.__lastDoc.__calls.text;

describe('ReportGenerator templates', () => {
    it('exposes the three presets', () => {
        expect(REPORT_TEMPLATES.map((t) => t.value)).toEqual(['executive', 'technical', 'audit']);
    });

    it('executive: summary + histogram only, no technical/audit sections', async () => {
        await run('executive');
        const t = texts();
        expect(t).toContain('Executive Summary');
        expect(t).toContain('Statistical Breakdown');
        expect(t).not.toContain('Parameter Sensitivity');
        expect(t).not.toContain('Simulation Diagnostics');
        expect(global.__lastDoc.__calls.images).toBe(1); // histogram only
        expect(global.__lastDoc.__calls.saveName).toMatch(/executive/);
    });

    it('technical: adds all charts + the sensitivity table, but not audit sections', async () => {
        await run('technical');
        const t = texts();
        expect(t).toContain('Parameter Sensitivity');
        expect(t).not.toContain('Simulation Diagnostics');
        expect(global.__lastDoc.__calls.images).toBe(3); // histogram + cdf + tornado
    });

    it('audit: adds diagnostics, representative P50 inputs, and methodology', async () => {
        await run('audit');
        const t = texts();
        expect(t).toContain('Parameter Sensitivity');
        expect(t).toContain('Simulation Diagnostics');
        expect(t).toContain('Representative P50 Realization (Inputs)');
        expect(t).toContain('Methodology & Assumptions');
        expect(global.__lastDoc.__calls.saveName).toMatch(/audit/);
    });

    it('uses gas units (Bscf) when fluidType is gas', async () => {
        const gasResults = { ...results, stats: { ...results.stats, giip: { ...results.stats.stooip } } };
        await ReportGenerator.generateProbabilisticReport('Gas Field', gasResults, 'field', {}, { template: 'executive', fluidType: 'gas' });
        // KPI cards render "<value> Bscf"
        expect(texts().some((s) => s.includes('Bscf'))).toBe(true);
    });
});
