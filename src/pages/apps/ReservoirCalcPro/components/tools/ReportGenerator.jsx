import jsPDF from 'jspdf';
import 'jspdf-autotable';

// Petrolord brand mark for report headers. Loaded once (from the public asset)
// and cached as a data URL so jsPDF can embed it. Resolves to null if the asset
// can't be fetched — reports still generate, just without the logo.
let _logoPromise;
function loadPetrolordLogo() {
    if (_logoPromise) return _logoPromise;
    _logoPromise = (async () => {
        try {
            const resp = await fetch('/petrolord-icon.png');
            if (!resp.ok) return null;
            const blob = await resp.blob();
            const dataUrl = await new Promise((res, rej) => {
                const r = new FileReader();
                r.onload = () => res(r.result);
                r.onerror = rej;
                r.readAsDataURL(blob);
            });
            const dims = await new Promise((res, rej) => {
                const im = new Image();
                im.onload = () => res({ w: im.naturalWidth || 1, h: im.naturalHeight || 1 });
                im.onerror = rej;
                im.src = dataUrl;
            });
            return { dataUrl, ...dims };
        } catch {
            return null;
        }
    })();
    return _logoPromise;
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
        const denom = gas ? 1e9 : 1e6;
        const unit = gas ? (unitSystem === 'field' ? 'Bscf' : 'MMsm³') : (unitSystem === 'field' ? 'MMstb' : 'MMsm³');
        const fmt = (v) => (Number.isFinite(v) ? (v / denom).toFixed(2) : '—');

        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;
        const margin = 20;
        const logo = await loadPetrolordLogo();

        const addHeader = () => {
            doc.setFillColor(15, 23, 42); // Slate 900
            doc.rect(0, 0, pageWidth, 30, 'F');
            // Petrolord logo on the left of the banner; title text shifts to clear it.
            let titleX = margin;
            if (logo) {
                const h = 15;
                const w = h * (logo.w / logo.h);
                try { doc.addImage(logo.dataUrl, 'PNG', margin, 7.5, w, h); titleX = margin + w + 5; } catch { /* skip logo */ }
            }
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(18);
            doc.setFont('helvetica', 'bold');
            doc.text('ReservoirCalc Pro', titleX, 13);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(200, 210, 225);
            doc.text(`${templateLabel} — Probabilistic Volumetrics  •  Petrolord Suite`, titleX, 21);
            doc.setTextColor(255, 255, 255);
            doc.text(`Project: ${projectName}`, pageWidth - margin, 12, { align: 'right' });
            doc.text(`Date: ${new Date().toLocaleDateString()}`, pageWidth - margin, 20, { align: 'right' });
        };

        const addFooter = (pageNo, totalPages) => {
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(`Page ${pageNo} of ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
            doc.text('Petrolord Suite • ReservoirCalc Pro', pageWidth - margin, pageHeight - 10, { align: 'right' });
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

        const addChart = (img, title, y, h = 70) => {
            if (!img) return y;
            let yPos = ensureSpace(h + 12, y);
            doc.setFontSize(12);
            doc.setTextColor(0, 0, 0);
            doc.text(title, margin, yPos);
            yPos += 5;
            doc.addImage(img, 'PNG', margin, yPos, 170, h);
            return yPos + h + 10;
        };

        // ── Page 1: summary ──
        addHeader();
        let yPos = 45;
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('Executive Summary', margin, yPos);

        yPos += 9;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('Probabilistic volumetric estimate from Monte Carlo simulation (correlated inputs).', margin, yPos);
        doc.text(`Fluid: ${fluidType === 'oil_gas' ? 'Oil & Gas' : fluidType.charAt(0).toUpperCase() + fluidType.slice(1)}   •   Unit system: ${unitSystem.charAt(0).toUpperCase() + unitSystem.slice(1)}`, margin, yPos + 5);

        // KPI band (P90 / P50 / P10)
        yPos += 15;
        const cardWidth = (pageWidth - (margin * 2) - 10) / 3;
        const cardHeight = 30;
        const drawCard = (x, label, value, accent) => {
            if (accent) { doc.setDrawColor(16, 185, 129); doc.setFillColor(236, 253, 245); }
            else { doc.setDrawColor(200, 200, 200); doc.setFillColor(248, 250, 252); }
            doc.roundedRect(x, yPos, cardWidth, cardHeight, 2, 2, 'FD');
            doc.setFontSize(9);
            doc.setTextColor(accent ? 5 : 100, accent ? 150 : 116, accent ? 105 : 139);
            doc.text(label, x + cardWidth / 2, yPos + 10, { align: 'center' });
            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(accent ? 6 : 15, accent ? 95 : 23, accent ? 70 : 42);
            doc.text(`${value} ${unit}`, x + cardWidth / 2, yPos + 22, { align: 'center' });
            doc.setFont('helvetica', 'normal');
        };
        drawCard(margin, 'P90 (PROVEN)', fmt(stats.p90), false);
        drawCard(margin + cardWidth + 5, 'P50 (PROBABLE)', fmt(stats.p50), true);
        drawCard(margin + (cardWidth * 2) + 10, 'P10 (POSSIBLE)', fmt(stats.p10), false);

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
            ['P10 / P90 Ratio', Number.isFinite(stats.p10 / stats.p90) ? (stats.p10 / stats.p90).toFixed(2) : '—', '-', 'Uncertainty ratio'],
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

        // ── Charts ──
        // Executive: histogram only. Technical/Audit: histogram + CDF + tornado.
        yPos = addChart(chartImages.histogram, `Volume Distribution (${unit})`, yPos);
        if (includeTechnical) {
            yPos = addChart(chartImages.cdf, 'Expectation Curve (Cumulative Probability)', yPos);
            yPos = addChart(chartImages.tornado, 'Sensitivity — Variance Decomposition (Tornado)', yPos, 80);

            // Sensitivity table
            const sens = results.stats.sensitivity || [];
            if (sens.length) {
                yPos = ensureSpace(20 + sens.length * 8, yPos);
                doc.setFontSize(14);
                doc.setFont('helvetica', 'bold');
                doc.text('Parameter Sensitivity', margin, yPos);
                doc.setFont('helvetica', 'normal');
                const PL = { area: 'Area', thickness: 'Thickness', ntg: 'NTG', phi: 'Porosity', sw: 'Water Saturation', fvf: 'Bo', bg: 'Bg' };
                doc.autoTable({
                    startY: yPos + 5,
                    head: [['Parameter', 'Contribution to Variance', 'Direction']],
                    body: sens.map((s) => [PL[s.parameter] || s.parameter, `${s.contribution.toFixed(1)}%`, s.impactDirection > 0 ? 'Increases volume' : 'Decreases volume']),
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
            const notes = [
                'Monte Carlo simulation with a Gaussian copula: correlated standard normals are mapped',
                'through each variable\'s marginal distribution (triangular / normal / lognormal / uniform).',
                'A default porosity-water-saturation correlation of -0.8 is applied. Out-of-bounds draws for',
                'unbounded (normal/lognormal) marginals are rejected. Volumetrics: HCPV = GRV·NTG·φ·(1-Sw);',
                'STOOIP = HCPV·7758/Bo (field) or HCPV/Bo (metric); GIIP = HCPV·43560/Bg (field) or HCPV/Bg.',
                'P90/P50/P10 follow the petroleum convention (P90 = low, P10 = high). Screening estimate —',
                'confirm against reservoir simulation before use in reserves booking.',
            ];
            notes.forEach((line, i) => doc.text(line, margin, yPos + 5 + i * 5));
        }

        // Footers
        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            addFooter(i, totalPages);
        }

        doc.save(`${projectName}_${template}_report.pdf`);
    }

    // Branded, printable one/two-page deterministic volumetrics report.
    // `results` is the ReservoirCalc deterministic result object; `inputs` its
    // echoed input set (falls back to live inputs for legacy projects).
    static async generateDeterministicReport(projectName, results, unitSystem, options = {}) {
        const { fluidType = results.fluidType || 'oil', inputs = results.inputs || {} } = options;
        const isField = (results.unitSystem || unitSystem) === 'field';
        const showOil = fluidType === 'oil' || fluidType === 'oil_gas';
        const showGas = fluidType === 'gas' || fluidType === 'oil_gas';

        const num = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
        const oilUnit = results.volumeUnit || (isField ? 'STB' : 'sm³');
        const gasB = 'B' + (isField ? 'scf' : 'sm³');

        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;
        const margin = 20;
        const logo = await loadPetrolordLogo();

        const addHeader = () => {
            doc.setFillColor(15, 23, 42);
            doc.rect(0, 0, pageWidth, 30, 'F');
            let titleX = margin;
            if (logo) {
                const h = 15;
                const w = h * (logo.w / logo.h);
                try { doc.addImage(logo.dataUrl, 'PNG', margin, 7.5, w, h); titleX = margin + w + 5; } catch { /* skip */ }
            }
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(18);
            doc.setFont('helvetica', 'bold');
            doc.text('ReservoirCalc Pro', titleX, 13);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(200, 210, 225);
            doc.text('Deterministic Volumetrics  •  Petrolord Suite', titleX, 21);
            doc.setTextColor(255, 255, 255);
            doc.text(`Project: ${projectName}`, pageWidth - margin, 12, { align: 'right' });
            doc.text(`Date: ${new Date().toLocaleDateString()}`, pageWidth - margin, 20, { align: 'right' });
        };

        const addFooter = (pageNo, totalPages) => {
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(`Page ${pageNo} of ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
            doc.text('Petrolord Suite • ReservoirCalc Pro', pageWidth - margin, pageHeight - 10, { align: 'right' });
        };

        const ensureSpace = (needed, yPos) => {
            if (yPos + needed > pageHeight - 20) { doc.addPage(); addHeader(); return 45; }
            return yPos;
        };

        addHeader();
        let yPos = 45;
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('Deterministic Volumetric Estimate', margin, yPos);
        yPos += 8;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const fluidLabel = fluidType === 'oil_gas' ? 'Oil & Gas' : fluidType.charAt(0).toUpperCase() + fluidType.slice(1);
        doc.text(`Fluid: ${fluidLabel}   •   Unit system: ${isField ? 'Field' : 'Metric'}`, margin, yPos);

        // KPI band
        yPos += 12;
        const cards = [];
        if (showOil) cards.push({ label: 'STOOIP', value: `${num(results.stooip)} ${oilUnit}`, accent: true });
        if (showGas) cards.push({ label: 'GIIP', value: `${num((results.giip || 0) / 1e9, 3)} ${gasB}`, accent: true });
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
            doc.setFontSize(13);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(c.accent ? 6 : 15, c.accent ? 95 : 23, c.accent ? 70 : 42);
            doc.text(c.value, x + cardW / 2, yPos + 19, { align: 'center' });
            doc.setFont('helvetica', 'normal');
        });
        yPos += cardH + 12;

        // Input summary
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text('Input Parameters', margin, yPos);
        doc.setFont('helvetica', 'normal');
        const inputRows = [
            ['Net-to-Gross (NTG)', num(inputs.ntg, 3)],
            ['Porosity (φ)', num(inputs.porosity, 3)],
            ['Water Saturation (Sw)', num(inputs.sw, 3)],
        ];
        if (showOil) {
            inputRows.push(['Oil FVF (Bo)', num(inputs.fvf, 3)]);
            inputRows.push(['Oil–Water Contact (OWC)', inputs.owc != null ? String(inputs.owc) : '—']);
            inputRows.push(['Oil Recovery Factor', num(inputs.recovery, 2)]);
        }
        if (showGas) {
            inputRows.push(['Gas FVF (Bg)', num(inputs.bg, 5)]);
            inputRows.push(['Gas–Oil Contact (GOC)', inputs.goc != null ? String(inputs.goc) : '—']);
            inputRows.push(['Gas Recovery Factor', num(inputs.recoveryGas, 2)]);
        }
        doc.autoTable({
            startY: yPos + 4,
            body: inputRows,
            theme: 'grid',
            styles: { fontSize: 9, cellPadding: 3 },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 70 } },
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
            volRows.push(['GIIP', num((results.giip || 0) / 1e9, 3), gasB]);
            volRows.push(['Recoverable Gas', num((results.recoverableGas || 0) / 1e9, 3), gasB]);
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
            doc.text('Inputs are physically consistent — no issues detected.', margin, yPos);
            yPos += 6;
        } else {
            doc.setTextColor(160, 90, 0);
            warnings.forEach((w) => {
                const lines = doc.splitTextToSize(`• ${w}`, pageWidth - margin * 2);
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
            'Deterministic (single-value) volumetric calculation. HCPV = GRV·NTG·φ·(1−Sw);',
            `STOOIP = HCPV·${isField ? '7758/Bo' : '1/Bo'};  GIIP = HCPV·${isField ? '43560/Bg' : '1/Bg'}.`,
            'Gross rock volume is derived from the mapped structure surface and fluid contacts.',
            'A screening estimate — confirm against a probabilistic run and reservoir simulation',
            'before use in reserves booking.',
        ];
        notes.forEach((line, i) => doc.text(line, margin, yPos + 6 + i * 5));

        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) { doc.setPage(i); addFooter(i, totalPages); }

        const safeName = (projectName || 'volumetrics').replace(/\s+/g, '_');
        doc.save(`${safeName}_deterministic_report.pdf`);
    }
}
