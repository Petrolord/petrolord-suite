import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { saveAs } from 'file-saver';

export class ExportEngine {
    /**
     * Generate and download a comprehensive PDF report
     * @param {Object} project - Project metadata and settings
     * @param {Object} results - Simulation results
     * @param {Array} chartImages - Array of { title, dataUrl } for charts
     */
    static async generatePDF(project, results, chartImages = []) {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.width;
        const margin = 14;
        let yPos = 20;

        // Header
        doc.setFontSize(22);
        doc.setTextColor(40, 40, 40);
        doc.text("BasinFlow Genesis Report", pageWidth / 2, yPos, { align: 'center' });
        yPos += 10;

        doc.setFontSize(12);
        doc.setTextColor(100, 100, 100);
        doc.text(`Project: ${project.name || 'Untitled'}`, pageWidth / 2, yPos, { align: 'center' });
        yPos += 6;
        doc.text(`Date: ${new Date().toLocaleDateString()}`, pageWidth / 2, yPos, { align: 'center' });
        yPos += 20;

        // Executive Summary
        doc.setFontSize(16);
        doc.setTextColor(0, 0, 0);
        doc.text("1. Executive Summary", margin, yPos);
        yPos += 10;
        
        doc.setFontSize(10);
        doc.setTextColor(60, 60, 60);
        const maxTemp = Math.max(...(results.data.temperature.flat().map(t => t.value) || [0]));
        const maxRo = Math.max(...(results.data.maturity.flat().map(t => t.value) || [0]));
        
        const summaryText = `This report details the 1D basin modeling simulation results. The basin reached a maximum temperature of ${maxTemp.toFixed(1)}°C and a maximum vitrinite reflectance of ${maxRo.toFixed(2)}%Ro. The simulation utilized a ${project.heatFlow?.type || 'constant'} heat flow model.`;
        
        const splitText = doc.splitTextToSize(summaryText, pageWidth - 2 * margin);
        doc.text(splitText, margin, yPos);
        yPos += splitText.length * 5 + 10;

        // Stratigraphy Table
        doc.setFontSize(16);
        doc.setTextColor(0, 0, 0);
        doc.text("2. Stratigraphy Model", margin, yPos);
        yPos += 6;

        const tableData = project.stratigraphy.map(l => [
            l.name,
            l.ageStart,
            l.ageEnd,
            l.thickness,
            l.lithology,
            l.sourceRock?.isSource ? `Yes (TOC: ${l.sourceRock.toc}%)` : 'No'
        ]);

        doc.autoTable({
            startY: yPos,
            head: [['Name', 'Start (Ma)', 'End (Ma)', 'Thick (m)', 'Lithology', 'Source']],
            body: tableData,
            theme: 'striped',
            headStyles: { fillColor: [41, 128, 185] }
        });

        yPos = doc.lastAutoTable.finalY + 20;

        // Charts
        if (chartImages.length > 0) {
            doc.addPage();
            yPos = 20;
            doc.setFontSize(16);
            doc.text("3. Simulation Plots", margin, yPos);
            yPos += 15;

            chartImages.forEach((chart, index) => {
                if (yPos + 100 > doc.internal.pageSize.height) {
                    doc.addPage();
                    yPos = 20;
                }
                
                doc.setFontSize(12);
                doc.text(chart.title, margin, yPos);
                yPos += 5;
                
                try {
                    doc.addImage(chart.dataUrl, 'PNG', margin, yPos, pageWidth - 2 * margin, 100);
                    yPos += 110;
                } catch (e) {
                    console.error("Failed to add image to PDF", e);
                    doc.text("(Image export failed)", margin, yPos + 10);
                    yPos += 20;
                }
            });
        }

        doc.save(`BasinFlow_Report_${project.name.replace(/\s+/g, '_')}.pdf`);
    }

    /**
     * Generate CSV export of Time-Depth-Temp-Ro data
     */
    static generateCSV(results) {
        if (!results || !results.data) return;

        const headers = ['Age_Ma', 'Layer_ID', 'Layer_Name', 'Depth_Top_m', 'Depth_Bottom_m', 'Temp_C', 'Ro_Percent'];
        const rows = [];

        // Layer series start at deposition (shorter than timeSteps) —
        // align rows by each entry's own age, never by global index.
        const byAge = (arr) => new Map((arr || []).map(e => [e.age, e]));
        const burialMaps = results.data.burial.map(byAge);
        const tempMaps = results.data.temperature.map(byAge);
        const matMaps = results.data.maturity.map(byAge);

        results.data.timeSteps.forEach((age) => {
            results.meta.layers.forEach((layer, layerIdx) => {
                const burial = burialMaps[layerIdx].get(age);
                const temp = tempMaps[layerIdx].get(age);
                const mat = matMaps[layerIdx].get(age);

                if (burial && temp && mat) {
                    rows.push([
                        age.toFixed(2),
                        layer.id,
                        layer.name,
                        burial.top.toFixed(2),
                        burial.bottom.toFixed(2),
                        temp.value.toFixed(2),
                        mat.value.toFixed(3)
                    ].join(','));
                }
            });
        });

        const csvContent = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        saveAs(blob, 'BasinFlow_Simulation_Data.csv');
    }

    /**
     * Export full project state as JSON
     */
    static generateJSON(project) {
        const json = JSON.stringify(project, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        saveAs(blob, `BasinFlow_Project_${project.name.replace(/\s+/g, '_')}.json`);
    }
}