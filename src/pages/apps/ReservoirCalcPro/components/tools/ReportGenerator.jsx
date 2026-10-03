import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { tornadoSwings } from '@/lib/monteCarlo';
// Economics E5 closes the D5 parked item. This file carried its own copy of
// the brand banner and the logo loader, which src/lib/pdfBrand.js was
// extracted from; the fork was left in place at the time to avoid disturbing
// this file's export test suite. One implementation now, so a change to the
// Suite's report header reaches every report.
import { loadPetrolordLogo, drawBrandHeader } from '@/lib/pdfBrand';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { inPlaceScale } from '../../services/volumeDisplay';
import {
    latin1, correlationSentence, distributionRows, deterministicInputRows, limitsLines, basisLine,
} from '../../services/reportInfo';
// RL re-check (2026-10-02): the expectation curve is drawn as vectors by the
// shared Report Kit plot, from the run's own realizations, so the report
// has its plot whether or not a screen chart was mounted to be captured.
import { drawPlot } from '@/lib/reportKit/plot.js';

// RCP-U1-019 (PL7): the reviewer block under the banner (field, analyst,
// date, build, units, method, contacts with their datum, gridding, open
// closure, Monte Carlo basis). Lines come from services/reportInfo.js.
function drawReviewer(doc, lines, margin, yPos, maxWidth) {
    if (!Array.isArray(lines) || !lines.length) return yPos;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    let y = yPos;
    for (const line of lines) {
        const wrapped = typeof doc.splitTextToSize === 'function' ? doc.splitTextToSize(latin1(line), maxWidth) : [latin1(line)];
        for (const w of wrapped) { doc.text(w, margin, y); y += 3.6; }
    }
    doc.setTextColor(0, 0, 0);
    return y + 4;
}

// ── Text-fitting helpers ────────────────────────────────────────────────────
// Long project/reservoir names used to be drawn at full length and collided
// with the banner title; big KPI values could overflow their cards. Both are
// now measured with jsPDF's own metrics and clipped/shrunk to fit.


// Draw centred text shrunk (never enlarged) to fit `maxWidth` mm.
function textFitted(doc, text, x, y, maxWidth, startSize, minSize = 7) {
    let size = startSize;
    doc.setFontSize(size);
    while (size > minSize && doc.getTextWidth(text) > maxWidth) {
        size -= 0.5;
        doc.setFontSize(size);
    }
    doc.text(text, x, y, { align: 'center' });
    doc.setFontSize(startSize);
}



// "Limits of this analysis" (RL9), on both reports.
function drawLimits(doc, lines, margin, yPos, maxWidth, ensureSpace) {
    let y = ensureSpace(24, yPos);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('Limits of this analysis', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(70, 70, 70);
    y += 6;
    for (const line of lines) {
        const wrapped = doc.splitTextToSize(latin1(`- ${line}`), maxWidth);
        y = ensureSpace(wrapped.length * 3.8 + 2, y);
        doc.text(wrapped, margin, y);
        y += wrapped.length * 3.8 + 1.2;
    }
    doc.setTextColor(0, 0, 0);
    return y + 4;
}

/**
 * The expectation curve of a run from its own realizations: the chance of
 * exceeding each volume, as up to 200 points across the sorted outcomes.
 * @returns {?Array<[number, number]>} [volume in the display unit, percent]
 */
export function expectationCurvePoints(values, denom, points = 200) {
    const v = (values || []).filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
    const n = v.length;
    if (n < 20) return null;
    const m = Math.min(points, n);
    const out = [];
    for (let k = 0; k < m; k += 1) {
        const i = Math.round((k * (n - 1)) / (m - 1));
        out.push([v[i] / denom, (1 - i / n) * 100]);
    }
    return out;
}

// Report presets. Each successive tier is a superset of the previous one.
//   executive  — one-page decision summary: KPI band + key stats + histogram.
//   technical  — full statistics, all three charts, and the sensitivity table.
//   audit      — technical + simulation diagnostics, the representative P50
//                realization inputs, and the methodology/assumptions notes.
export const REPORT_TEMPLATES = [
    { value: 'executive', label: 'Executive Summary' },
    { value: 'technical', label: 'Technical Report' },
    { value: 'audit', label: 'Detailed Audit' },
];

export class ReportGenerator {

    static async generateProbabilisticReport(projectName, results, unitSystem, chartImages = {}, options = {}) {
        const { template = 'technical', fluidType = 'oil' } = options;
        const templateLabel = (REPORT_TEMPLATES.find((t) => t.value === template) || REPORT_TEMPLATES[1]).label;
        const includeTechnical = template === 'technical' || template === 'audit';
        const includeAudit = template === 'audit';

        const gas = fluidType === 'gas';
        const stats = (gas ? results.stats.giip : results.stats.stooip) || {};
        // RCP-U1-001: one divisor and label per stream (GIIP in sm3 over 1e9 is Bsm3)
        const { denom, label: unit } = inPlaceScale(gas ? 'gas' : 'oil', results.meta?.unitSystem || unitSystem);
        const fmt = (v) => (Number.isFinite(v) ? (v / denom).toFixed(2) : EMPTY_VALUE);

        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;
        const margin = 20;
        const logo = await loadPetrolordLogo();

        const addHeader = () => drawBrandHeader(doc, {
            logo, margin, pageWidth,
            appTitle: 'ReservoirCalc Pro',
            subtitle: `${templateLabel} · Probabilistic Volumetrics`,
            rightLines: [
                `Project: ${projectName}`,
                options.reservoirName ? `Reservoir: ${options.reservoirName}` : null,
            ].filter(Boolean),
        });

        const addFooter = (pageNo, totalPages) => {
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(`Page ${pageNo} of ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
            doc.text('Petrolord Suite | ReservoirCalc Pro', pageWidth - margin, pageHeight - 10, { align: 'right' });
        };

        // Start a fresh page when the next block wouldn't fit.
        const ensureSpace = (needed, yPos) => {
            if (yPos + needed > pageHeight - 20) {
                doc.addPage();
                addHeader();
                return 45;
            }
            return yPos;
        };

        // Draw a captured chart preserving its aspect ratio (the old fixed
        // 170×70 box stretched/squashed the bitmap and clipped axis text).
        const addChart = (img, title, y, maxH = 90) => {
            if (!img) {
                // RL6: a chart that was not captured is said, never skipped silently
                const yy = ensureSpace(12, y);
                doc.setFontSize(9);
                doc.setTextColor(100, 116, 139);
                doc.text(latin1(`${title}: not included. The chart was not on screen when the report was made; open the results view and export again to add it.`), margin, yy, { maxWidth: pageWidth - 2 * margin });
                doc.setTextColor(0, 0, 0);
                return yy + 11;
            }
            let w = 170, h = 70;
            try {
                const props = doc.getImageProperties(img);
                if (props?.width && props?.height) {
                    h = Math.min(maxH, (props.height / props.width) * w);
                    w = (props.width / props.height) * h;
                }
            } catch { /* fall back to the default box */ }
            let yPos = ensureSpace(h + 12, y);
            doc.setFontSize(12);
            doc.setTextColor(0, 0, 0);
            doc.text(title, margin, yPos);
            yPos += 5;
            doc.addImage(img, 'PNG', margin, yPos, w, h);
            return yPos + h + 10;
        };

        // ── Page 1: summary ──
        addHeader();
        let yPos = drawReviewer(doc, options.reviewer, margin, 43, pageWidth - margin * 2) + 3;
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('Executive Summary', margin, yPos);

        yPos += 9;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('Probabilistic volumetric estimate from Monte Carlo simulation (correlated inputs).', margin, yPos);
        doc.text(`Fluid: ${fluidType === 'oil_gas' ? 'Oil & Gas' : fluidType.charAt(0).toUpperCase() + fluidType.slice(1)}   |   Unit system: ${unitSystem.charAt(0).toUpperCase() + unitSystem.slice(1)}`, margin, yPos + 5);
        // RL7: what the headline volumes are
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        const basis = doc.splitTextToSize(basisLine({ fluidType, unitSystem: results.meta?.unitSystem || unitSystem }), pageWidth - 2 * margin);
        doc.text(basis, margin, yPos + 10);
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);
        yPos += basis.length * 3.6;

        // KPI band (P90 / P50 / P10)
        yPos += 17;
        const cardWidth = (pageWidth - (margin * 2) - 10) / 3;
        const cardHeight = 30;
        const drawCard = (x, label, value, accent) => {
            if (accent) { doc.setDrawColor(16, 185, 129); doc.setFillColor(236, 253, 245); }
            else { doc.setDrawColor(200, 200, 200); doc.setFillColor(248, 250, 252); }
            doc.roundedRect(x, yPos, cardWidth, cardHeight, 2, 2, 'FD');
            doc.setFontSize(9);
            doc.setTextColor(accent ? 5 : 100, accent ? 150 : 116, accent ? 105 : 139);
            doc.text(label, x + cardWidth / 2, yPos + 10, { align: 'center' });
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(accent ? 6 : 15, accent ? 95 : 23, accent ? 70 : 42);
            textFitted(doc, `${value} ${unit}`, x + cardWidth / 2, yPos + 22, cardWidth - 6, 16);
            doc.setFont('helvetica', 'normal');
        };
        drawCard(margin, 'P90 (LOW)', fmt(stats.p90), false);
        drawCard(margin + cardWidth + 5, 'P50 (BEST)', fmt(stats.p50), true);
        drawCard(margin + (cardWidth * 2) + 10, 'P10 (HIGH)', fmt(stats.p10), false);

        // Key statistics table
        yPos += 45;
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Statistical Breakdown', margin, yPos);
        doc.setFont('helvetica', 'normal');

        const fullRows = [
            ['Mean', fmt(stats.mean), unit, 'Average expected volume'],
            ['Median (P50)', fmt(stats.p50), unit, 'Middle value of distribution'],
            ['P90 / P10', `${fmt(stats.p90)} / ${fmt(stats.p10)}`, unit, 'Low / high case'],
            ['Std. Deviation', fmt(stats.stdDev), unit, 'Spread / uncertainty'],
            ['Min / Max', `${fmt(stats.min)} / ${fmt(stats.max)}`, unit, 'Simulated extremes'],
            ['P10 / P90 Ratio', Number.isFinite(stats.p10 / stats.p90) ? (stats.p10 / stats.p90).toFixed(2) : EMPTY_VALUE, '-', 'Uncertainty ratio'],
        ];
        // Executive keeps it short (mean / P50 / spread); technical shows all rows.
        const bodyRows = includeTechnical ? fullRows : fullRows.filter((r) => ['Mean', 'Median (P50)', 'P90 / P10', 'Std. Deviation'].includes(r[0]));

        doc.autoTable({
            startY: yPos + 5,
            head: [['Metric', 'Value', 'Unit', 'Description']],
            body: bodyRows,
            theme: 'grid',
            headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
            styles: { fontSize: 10, cellPadding: 4 },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 }, 3: { fontStyle: 'italic', textColor: 100 } },
        });
        yPos = doc.lastAutoTable.finalY + 12;

        // RL3: in place and recoverable are different quantities; print the
        // recoverable stream the run computed beside the in-place headline
        const recOil = results.stats.recoverableOil;
        const recGas = results.stats.recoverableGas;
        const sys = results.meta?.unitSystem || unitSystem;
        const recRows = [];
        const recRow = (label, st, stream) => {
            if (!st || !Number.isFinite(st.mean) || !(st.mean > 0)) return;
            const sc = inPlaceScale(stream, sys);
            const f = (v) => (Number.isFinite(v) ? (v / sc.denom).toFixed(2) : EMPTY_VALUE);
            recRows.push([label, f(st.p90), f(st.p50), f(st.p10), f(st.mean), latin1(sc.label)]);
        };
        if (fluidType !== 'gas') recRow('Recoverable oil', recOil, 'oil');
        if (fluidType !== 'oil') recRow(fluidType === 'oil_gas' ? 'Recoverable free gas' : 'Recoverable gas', recGas, 'gas');
        if (recRows.length) {
            yPos = ensureSpace(34 + recRows.length * 11, yPos);
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(0, 0, 0);
            doc.text('Recoverable Volumes', margin, yPos);
            doc.setFont('helvetica', 'normal');
            doc.autoTable({
                startY: yPos + 5,
                head: [['Stream', 'P90 (low)', 'P50 (best)', 'P10 (high)', 'Mean', 'Unit']],
                body: recRows,
                theme: 'grid',
                headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
                styles: { fontSize: 9, cellPadding: 3 },
            });
            yPos = doc.lastAutoTable.finalY + 12;
        }

        // RL1: every input distribution with its type, parameters, unit and source
        const distRows = distributionRows(results.meta, options.report);
        yPos = ensureSpace(distRows ? Math.min(34 + distRows.length * 12, 200) : 20, yPos);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text('Input Distributions', margin, yPos);
        doc.setFont('helvetica', 'normal');
        if (distRows) {
            doc.autoTable({
                startY: yPos + 5,
                head: [['Input', 'Distribution', 'Parameters', 'Unit', 'Source']],
                body: distRows,
                theme: 'grid',
                headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
                styles: { fontSize: 8, cellPadding: 2.5, overflow: 'linebreak' },
                columnStyles: { 0: { fontStyle: 'bold', cellWidth: 38 }, 1: { cellWidth: 26 }, 3: { cellWidth: 18 } },
                margin: { left: margin, right: margin, top: 45 },
            });
            yPos = doc.lastAutoTable.finalY + 12;
        } else {
            doc.setFontSize(9);
            doc.setTextColor(100, 116, 139);
            doc.text(latin1('Not recorded on this run: it was made before the run kept its input distributions. Run the simulation again to print them.'), margin, yPos + 6, { maxWidth: pageWidth - 2 * margin });
            doc.setTextColor(0, 0, 0);
            yPos += 16;
        }

        // RL6: the expectation curve as a vector plot from the run's own
        // realizations (drawn whether or not a screen chart was captured)
        const figures = [];
        const curve = expectationCurvePoints(gas ? results.raw?.giip : results.raw?.stooip, denom);
        const figTitle = 'Figure 1. Expectation curve (probability of exceeding each volume)';
        if (curve) {
            yPos = ensureSpace(96, yPos);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(0, 0, 0);
            doc.text(figTitle, margin, yPos);
            doc.setFont('helvetica', 'normal');
            const box = { x: margin, y: yPos + 3, w: pageWidth - 2 * margin, h: 70 };
            const plabel = (k) => ({ x: stats[k] / denom, label: k.toUpperCase(), dash: [1, 1] });
            const drawn = drawPlot(doc, box, {
                xTitle: latin1(`${gas ? 'GIIP' : 'STOIIP'} in place (${unit})`), yTitle: 'Chance of exceeding (%)', yInclude: [0, 100],
                lines: ['p90', 'p50', 'p10'].filter((k) => Number.isFinite(stats[k])).map((k, i) => ({ ...plabel(k), row: i % 2 })),
                series: [{ name: `Exceedance, ${curve.length} points of ${(gas ? results.raw.giip : results.raw.stooip).length.toLocaleString('en-US')} realizations`, pts: curve, rgb: [37, 99, 235], width: 0.6 }],
                logo,
            });
            figures.push({ id: 'expectation', number: 1, page: doc.internal.getNumberOfPages(), plotted: true, panels: [{ box, ...drawn }] });
            yPos = box.y + box.h + 5;
            doc.setFontSize(8);
            doc.setTextColor(71, 85, 105);
            const cap = doc.splitTextToSize(latin1('In-place volume against the chance of exceeding it, from the realizations saved with the run. P90 (low), P50 and P10 (high) are marked: the P90 is exceeded with 90 percent probability.'), pageWidth - 2 * margin);
            doc.text(cap, margin, yPos);
            doc.setTextColor(0, 0, 0);
            yPos += cap.length * 3.6 + 8;
        } else {
            yPos = ensureSpace(16, yPos);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(0, 0, 0);
            doc.text(figTitle, margin, yPos);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(100, 116, 139);
            doc.text(latin1('Not plotted: the run holds too few saved realizations to draw a curve.'), margin, yPos + 5);
            doc.setTextColor(0, 0, 0);
            figures.push({ id: 'expectation', number: 1, page: doc.internal.getNumberOfPages(), plotted: false, panels: [] });
            yPos += 14;
        }

        // ── Charts ──
        // Executive: histogram only. Technical/Audit: histogram + CDF + tornado.
        yPos = addChart(chartImages.histogram, `Volume Distribution (${unit})`, yPos);
        if (includeTechnical) {
            yPos = addChart(chartImages.cdf, 'Expectation curve (probability of exceeding each volume)', yPos);
            yPos = addChart(chartImages.tornado, 'Sensitivity Tornado (P50 swing per parameter)', yPos, 90);
            yPos += 4;

            // Sensitivity table — variance share plus the conditional P50 swing
            // (median volume when the parameter sits in its bottom / top decile).
            const sens = results.stats.sensitivity || [];
            if (sens.length) {
                const swings = tornadoSwings(results.raw?.samples || []);
                const swingByParam = Object.fromEntries(swings.map((s) => [s.parameter, s]));
                const hasSwings = swings.length > 0;
                yPos = ensureSpace(20 + sens.length * 8, yPos);
                doc.setFontSize(14);
                doc.setFont('helvetica', 'bold');
                doc.text('Parameter Sensitivity', margin, yPos);
                doc.setFont('helvetica', 'normal');
                const PL = { area: 'Area', thickness: 'Thickness', ntg: 'NTG', phi: 'Porosity', sw: 'Water Saturation', fvf: 'Bo', bg: 'Bg', owc: 'OWC', goc: 'GOC', grvFactor: 'GRV Factor', recovery: 'Oil Recovery Factor', recoveryGas: 'Gas Recovery Factor', gasCapFraction: 'Gas Cap Fraction' };
                doc.autoTable({
                    startY: yPos + 5,
                    head: [hasSwings
                        ? ['Parameter', 'Variance Share', 'Direction', `Low Swing (${unit})`, `High Swing (${unit})`]
                        : ['Parameter', 'Contribution to Variance', 'Direction']],
                    body: sens.map((s) => {
                        const row = [PL[s.parameter] || s.parameter, `${s.contribution.toFixed(1)}%`, s.impactDirection > 0 ? 'Increases volume' : 'Decreases volume'];
                        if (hasSwings) {
                            const sw = swingByParam[s.parameter];
                            row.push(sw ? fmt(sw.low) : EMPTY_VALUE, sw ? fmt(sw.high) : EMPTY_VALUE);
                        }
                        return row;
                    }),
                    theme: 'striped',
                    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
                    styles: { fontSize: 10, cellPadding: 3 },
                });
                yPos = doc.lastAutoTable.finalY + 12;
            }
        }

        // ── Audit-only sections ──
        if (includeAudit) {
            const diag = results.diagnostics || {};
            const iterations = results.stats.iterations || (results.raw?.stooip?.length ?? 0);
            const validCount = results.stats.validCount ?? (results.raw?.stooip?.length ?? 0);
            const rejRate = iterations ? ((diag.rejectedCount || 0) / iterations * 100).toFixed(2) : '0.00';

            yPos = ensureSpace(60, yPos);
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text('Simulation Diagnostics', margin, yPos);
            doc.setFont('helvetica', 'normal');
            doc.autoTable({
                startY: yPos + 5,
                head: [['Diagnostic', 'Value']],
                body: [
                    ['Iterations requested', iterations.toLocaleString()],
                    ['Valid realizations', validCount.toLocaleString()],
                    ['Rejected (out of bounds)', `${(diag.rejectedCount || 0).toLocaleString()} (${rejRate}%)`],
                    ['Warnings', (diag.warnings && diag.warnings.length) ? diag.warnings.join('; ') : 'None'],
                ],
                theme: 'grid',
                headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
                styles: { fontSize: 9, cellPadding: 3 },
                columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 } },
            });
            yPos = doc.lastAutoTable.finalY + 12;

            // Representative P50 realization inputs (traceability).
            const p50 = diag.tracking?.P50?.inputs;
            if (p50) {
                yPos = ensureSpace(50, yPos);
                doc.setFontSize(14);
                doc.setFont('helvetica', 'bold');
                doc.text('Representative P50 Realization (Inputs)', margin, yPos);
                doc.setFont('helvetica', 'normal');
                doc.autoTable({
                    startY: yPos + 5,
                    head: [['Area', 'Thickness', 'NTG', 'Porosity', 'Sw', 'Bo', 'Bg']],
                    body: [[
                        p50.area?.toFixed(0), p50.thickness?.toFixed(1), p50.ntg?.toFixed(2),
                        p50.phi?.toFixed(3), p50.sw?.toFixed(3), p50.fvf?.toFixed(2), p50.bg?.toFixed(4),
                    ]],
                    theme: 'grid',
                    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
                    styles: { fontSize: 9, cellPadding: 3, halign: 'center' },
                });
                yPos = doc.lastAutoTable.finalY + 12;
            }

            // Methodology / assumptions.
            yPos = ensureSpace(50, yPos);
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text('Methodology & Assumptions', margin, yPos);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(60, 60, 60);
            // H9: the correlations line is the run's own record
            // (results.meta.correlations), never a fixed sentence.
            const wrap = (t) => (typeof doc.splitTextToSize === 'function' ? doc.splitTextToSize(latin1(t), pageWidth - 2 * margin) : [latin1(t)]);
            const notes = [
                'Monte Carlo simulation with a Gaussian copula: correlated standard normals are mapped',
                'through each variable\'s marginal distribution (triangular / normal / lognormal / uniform).',
                ...wrap(`${correlationSentence(results.meta)}.`.replace(/\.\.$/, '.')),
                'Out-of-bounds draws for unbounded (normal/lognormal) marginals are rejected.',
                'Volumetrics: HCPV = GRV x NTG x phi x (1-Sw);',
                'STOOIP = HCPV·7758/Bo (field) or HCPV/Bo (metric); GIIP = HCPV·43560/Bg (field) or HCPV/Bg.',
                'P90/P50/P10 follow the petroleum convention (P90 = low, P10 = high). Screening estimate:',
                'confirm against reservoir simulation before use in reserves booking.',
            ];
            notes.forEach((line, i) => doc.text(line, margin, yPos + 5 + i * 5));
            yPos += 5 + notes.length * 5;
            doc.setTextColor(0, 0, 0);
        }

        // RL9: the limits, on every template
        yPos = drawLimits(doc, limitsLines({ probabilistic: true, inputMethod: options.inputMethod || (results.meta?.grvMode === 'structural' ? 'hybrid' : 'simple'), fluidType }), margin, yPos + 6, pageWidth - 2 * margin, ensureSpace);
        const runWarnings = results.diagnostics?.warnings || [];
        if (runWarnings.length && !includeAudit) {
            doc.setFontSize(8);
            doc.setTextColor(160, 90, 0);
            for (const w of runWarnings) {
                const wrapped = doc.splitTextToSize(latin1(`- Run warning: ${w}`), pageWidth - 2 * margin);
                yPos = ensureSpace(wrapped.length * 3.8 + 2, yPos);
                doc.text(wrapped, margin, yPos);
                yPos += wrapped.length * 3.8 + 1.2;
            }
            doc.setTextColor(0, 0, 0);
        }

        // Footers
        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            addFooter(i, totalPages);
        }

        const probName = [projectName, options.reservoirName].filter(Boolean).join('_').replace(/\s+/g, '_');
        doc.save(`${probName}_${template}_report.pdf`);
        return { doc, figures, pages: totalPages };
    }

    // Branded, printable one/two-page deterministic volumetrics report.
    // `results` is the ReservoirCalc deterministic result object; `inputs` its
    // echoed input set (falls back to live inputs for legacy projects).
    static async generateDeterministicReport(projectName, results, unitSystem, options = {}) {
        const { fluidType = results.fluidType || 'oil', inputs = results.inputs || {} } = options;
        const isField = (results.unitSystem || unitSystem) === 'field';
        const showOil = fluidType === 'oil' || fluidType === 'oil_gas';
        const showGas = fluidType === 'gas' || fluidType === 'oil_gas';

        const num = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }) : EMPTY_VALUE);
        const oilUnit = results.volumeUnit || (isField ? 'STB' : 'sm³');
        const gasB = 'B' + (isField ? 'scf' : 'sm³');

        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;
        const margin = 20;
        const logo = await loadPetrolordLogo();

        const addHeader = () => drawBrandHeader(doc, {
            logo, margin, pageWidth,
            appTitle: 'ReservoirCalc Pro',
            subtitle: 'Deterministic Volumetrics',
            rightLines: [
                `Project: ${projectName}`,
                options.reservoirName ? `Reservoir: ${options.reservoirName}` : null,
            ].filter(Boolean),
        });

        const addFooter = (pageNo, totalPages) => {
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(`Page ${pageNo} of ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
            doc.text('Petrolord Suite | ReservoirCalc Pro', pageWidth - margin, pageHeight - 10, { align: 'right' });
        };

        const ensureSpace = (needed, yPos) => {
            if (yPos + needed > pageHeight - 20) { doc.addPage(); addHeader(); return 45; }
            return yPos;
        };

        addHeader();
        let yPos = drawReviewer(doc, options.reviewer, margin, 43, pageWidth - margin * 2) + 3;
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('Deterministic Volumetric Estimate', margin, yPos);
        yPos += 8;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const fluidLabel = fluidType === 'oil_gas' ? 'Oil & Gas' : fluidType.charAt(0).toUpperCase() + fluidType.slice(1);
        doc.text(`Fluid: ${fluidLabel}   |   Unit system: ${isField ? 'Field' : 'Metric'}`, margin, yPos);

        // KPI band
        yPos += 12;
        const cards = [];
        if (showOil) cards.push({ label: 'STOIIP', value: `${num(results.stooip)} ${oilUnit}`, accent: true });
        if (showGas) cards.push({ label: fluidType === 'oil_gas' ? 'GIIP (FREE GAS)' : 'GIIP', value: `${num((results.giip || 0) / 1e9, 3)} ${gasB}`, accent: true });
        cards.push({ label: 'GROSS ROCK VOLUME', value: `${num(results.bulkVolume)} ${results.volUnit || ''}`, accent: false });
        const cardW = (pageWidth - margin * 2 - (cards.length - 1) * 5) / cards.length;
        const cardH = 26;
        cards.forEach((c, i) => {
            const x = margin + i * (cardW + 5);
            if (c.accent) { doc.setDrawColor(16, 185, 129); doc.setFillColor(236, 253, 245); }
            else { doc.setDrawColor(200, 200, 200); doc.setFillColor(248, 250, 252); }
            doc.roundedRect(x, yPos, cardW, cardH, 2, 2, 'FD');
            doc.setFontSize(8);
            doc.setTextColor(c.accent ? 5 : 100, c.accent ? 150 : 116, c.accent ? 105 : 139);
            doc.text(c.label, x + cardW / 2, yPos + 9, { align: 'center' });
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(c.accent ? 6 : 15, c.accent ? 95 : 23, c.accent ? 70 : 42);
            textFitted(doc, c.value, x + cardW / 2, yPos + 19, cardW - 6, 13);
            doc.setFont('helvetica', 'normal');
        });
        yPos += cardH + 12;

        // Input summary
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text('Input Parameters', margin, yPos);
        doc.setFont('helvetica', 'normal');
        // RL1: every input with its unit and its source
        doc.autoTable({
            startY: yPos + 4,
            head: [['Input', 'Value', 'Unit', 'Source']],
            body: deterministicInputRows({ inputs, fluidType, unitSystem: isField ? 'field' : 'metric', inputMethod: options.inputMethod || results.inputMethod || 'simple', report: options.report }),
            theme: 'grid',
            headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
            styles: { fontSize: 9, cellPadding: 3, overflow: 'linebreak' },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 62 }, 1: { cellWidth: 24, halign: 'right' }, 2: { cellWidth: 20 } },
        });
        yPos = doc.lastAutoTable.finalY + 10;

        // Volumetrics breakdown
        yPos = ensureSpace(60, yPos);
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text('Volumetrics', margin, yPos);
        doc.setFont('helvetica', 'normal');
        const volRows = [
            ['Gross Rock Volume', num(results.bulkVolume), results.volUnit || ''],
            ['Net Rock Volume', num(results.netVolume), results.volUnit || ''],
            ['Pore Volume', num(results.poreVolumeRes ?? results.poreVolume), results.resVolUnit || results.volUnit || ''],
            ['HC Pore Volume', num(results.hcPoreVolume), results.resVolUnit || results.volUnit || ''],
        ];
        if (showOil) {
            volRows.push(['STOOIP', num(results.stooip), oilUnit]);
            volRows.push(['Recoverable Oil', num(results.recoverableOil ?? results.recoverable), oilUnit]);
        }
        if (showGas) {
            volRows.push([fluidType === 'oil_gas' ? 'GIIP (free gas)' : 'GIIP', num((results.giip || 0) / 1e9, 3), gasB]);
            volRows.push(['Recoverable Gas', num((results.recoverableGas || 0) / 1e9, 3), gasB]);
        }
        // RL3: the hydrocarbons the screen reports beside the headline streams
        if (Number.isFinite(results.solutionGas) && results.solutionGas > 0) {
            volRows.push([`Solution gas in place (Rs ${results.rs})`, num(results.solutionGas / 1e9, 3), gasB]);
            if (Number.isFinite(results.recoverableSolutionGas)) volRows.push(['Recoverable solution gas', num(results.recoverableSolutionGas / 1e9, 3), gasB]);
        }
        if (Number.isFinite(results.condensate) && results.condensate > 0) {
            const liq = isField ? 'MMSTB' : 'MMsm3';
            volRows.push([results.condensateKind === 'vaporised oil' ? 'Vaporised oil in the gas cap' : 'Condensate in place', num(results.condensate / 1e6, 3), liq]);
            if (Number.isFinite(results.recoverableCondensate)) volRows.push([results.condensateKind === 'vaporised oil' ? 'Recoverable vaporised oil' : 'Recoverable condensate', num(results.recoverableCondensate / 1e6, 3), liq]);
        }
        doc.autoTable({
            startY: yPos + 4,
            head: [['Quantity', 'Value', 'Unit']],
            body: volRows,
            theme: 'striped',
            headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
            styles: { fontSize: 9, cellPadding: 3 },
            columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right' } },
        });
        yPos = doc.lastAutoTable.finalY + 10;

        // Input quality & warnings
        const warnings = results.warnings || [];
        yPos = ensureSpace(30 + warnings.length * 6, yPos);
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text('Input Quality Check', margin, yPos);
        yPos += 6;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        if (results.qualityScore != null) {
            doc.setTextColor(60, 60, 60);
            doc.text(`Consistency score: ${results.qualityScore}/100`, margin, yPos);
            yPos += 6;
        }
        if (warnings.length === 0) {
            doc.setTextColor(16, 130, 90);
            doc.text('Inputs are physically consistent: no issues detected.', margin, yPos);
            yPos += 6;
        } else {
            doc.setTextColor(160, 90, 0);
            warnings.forEach((w) => {
                const lines = doc.splitTextToSize(latin1(`- ${w}`), pageWidth - margin * 2);
                lines.forEach((ln) => { yPos = ensureSpace(6, yPos); doc.text(ln, margin, yPos); yPos += 5; });
            });
        }

        // Methodology
        yPos = ensureSpace(40, yPos) + 6;
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text('Methodology', margin, yPos);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(70, 70, 70);
        const notes = [
            'Deterministic (single-value) volumetric calculation. HCPV = GRV x NTG x phi x (1-Sw);',
            `STOIIP = HCPV x ${isField ? '7758/Bo' : '1/Bo'};  GIIP = HCPV x ${isField ? '43560/Bg' : '1/Bg'}.`,
            'Gross rock volume is derived from the mapped structure surface and fluid contacts.',
            'A screening estimate: confirm it against a probabilistic run and reservoir simulation',
            'before use in reserves booking.',
        ];
        notes.forEach((line, i) => doc.text(line, margin, yPos + 6 + i * 5));
        yPos += 6 + notes.length * 5 + 2;
        // RL7: what the volumes are
        const basis = doc.splitTextToSize(basisLine({ fluidType, unitSystem: isField ? 'field' : 'metric' }), pageWidth - margin * 2);
        yPos = ensureSpace(basis.length * 4 + 4, yPos);
        doc.text(basis, margin, yPos);
        yPos += basis.length * 4 + 4;
        // RL6: a single-value estimate has no distribution to plot, and says so
        yPos = ensureSpace(14, yPos);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text('Figure 1. Volume against contact depth', margin, yPos);
        const figPage = doc.internal.getNumberOfPages();
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(70, 70, 70);
        const why = doc.splitTextToSize(latin1('Not plotted in this report: a deterministic estimate is one value per input, so it has no distribution to draw. The volume against contact depth curve is on the Results screen for a structural method; the probabilistic report carries the expectation curve.'), pageWidth - margin * 2);
        doc.text(why, margin, yPos + 4.5);
        yPos += 4.5 + why.length * 3.8 + 6;
        // RL9
        drawLimits(doc, limitsLines({ probabilistic: false, inputMethod: options.inputMethod || results.inputMethod || 'simple', fluidType }), margin, yPos, pageWidth - margin * 2, ensureSpace);

        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) { doc.setPage(i); addFooter(i, totalPages); }

        const safeName = ([projectName || 'volumetrics', options.reservoirName].filter(Boolean).join('_')).replace(/\s+/g, '_');
        doc.save(`${safeName}_deterministic_report.pdf`);
        return { doc, figures: [{ id: 'sweep', number: 1, page: figPage, plotted: false, panels: [] }], pages: totalPages };
    }
}
