import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// --- Templates ---

export const REPORT_TEMPLATES = {
  executive: {
    name: 'Executive Summary',
    description: 'High-level overview of key volumetric findings and risks.',
    sections: [
      { id: 'header', type: 'header', title: 'Report Header' },
      { id: 'summary_text', type: 'text', title: 'Executive Summary', content: 'The volumetric analysis indicates a substantial potential accumulation. Key uncertainties have been identified in the porosity and water saturation parameters.' },
      { id: 'kpi_summary', type: 'kpi-grid', title: 'Key Performance Indicators' },
      { id: 'risk_summary', type: 'risk-matrix', title: 'Risk Assessment' },
      { id: 'footer', type: 'footer', title: 'Report Footer' }
    ]
  },
  technical: {
    name: 'Technical Report',
    description: 'Detailed technical breakdown of methodology and calculations.',
    sections: [
      { id: 'header', type: 'header', title: 'Report Header' },
      { id: 'methodology', type: 'text', title: 'Methodology', content: 'A dual approach using deterministic map-based volumes and probabilistic Monte Carlo simulation (5,000 iterations) was employed to assess range of uncertainty.' },
      { id: 'input_summary', type: 'table-inputs', title: 'Input Parameters' },
      { id: 'det_results', type: 'table-deterministic', title: 'Deterministic Results' },
      { id: 'prob_dist', type: 'chart-histogram', title: 'Probabilistic Distribution' },
      { id: 'prob_cdf', type: 'chart-cdf', title: 'Expectation Curve (CDF)' },
      { id: 'sensitivity', type: 'chart-tornado', title: 'Sensitivity Analysis' },
      { id: 'footer', type: 'footer', title: 'Report Footer' }
    ]
  },
  detailed: {
    name: 'Detailed Audit Report',
    description: 'Comprehensive record including audit trails and validation logs.',
    sections: [
      { id: 'header', type: 'header', title: 'Report Header' },
      { id: 'meta', type: 'text-meta', title: 'Project Metadata' },
      { id: 'input_summary', type: 'table-inputs', title: 'Input Parameters' },
      { id: 'validation', type: 'validation-log', title: 'Data Validation Checks' },
      { id: 'det_results', type: 'table-deterministic', title: 'Deterministic Results' },
      { id: 'prob_results', type: 'table-probabilistic', title: 'Probabilistic Statistics' },
      { id: 'all_charts', type: 'chart-group', title: 'Visualizations' },
      { id: 'audit', type: 'audit-log', title: 'Audit Trail' },
      { id: 'footer', type: 'footer', title: 'Report Footer' }
    ]
  }
};

// --- Generators ---

export const generateReportData = (templateKey, contextData) => {
  const template = REPORT_TEMPLATES[templateKey] || REPORT_TEMPLATES.executive;
  // Deep copy sections to avoid mutation issues and assign unique IDs
  return template.sections.map(s => ({
    ...s,
    id: `${s.type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }));
};

// --- Exporters ---

export const exportToExcel = (data, fileName = 'QuickVol_Report.xlsx') => {
  const wb = XLSX.utils.book_new();

  // 1. Summary Sheet
  const summaryData = [
    ["QuickVol Report", ""],
    ["Generated At", new Date().toLocaleString()],
    ["", ""],
    ["Deterministic STOOIP", data.mapResults?.stooip || '-'],
    ["Probabilistic P50", data.stochasticResults?.in_place?.p50 || '-'],
    ["Scenario Count", data.scenarios?.length || 0]
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

  // 2. Inputs Sheet
  const inputsData = [["Parameter", "Distribution", "Values"]];
  if (data.stochasticInputs) {
      Object.entries(data.stochasticInputs).forEach(([key, val]) => {
          if(typeof val === 'object') {
               inputsData.push([key, val.dist || 'triangular', JSON.stringify(val)]);
          } else {
               inputsData.push([key, 'constant', val]);
          }
      });
  }
  const wsInputs = XLSX.utils.aoa_to_sheet(inputsData);
  XLSX.utils.book_append_sheet(wb, wsInputs, "Inputs");

  // 3. Results Sheet
  // ... (Simplified for brevity)
  
  XLSX.writeFile(wb, fileName);
};

export const exportToPdf = async (elementId, fileName = 'QuickVol_Report.pdf', watermarkText) => {
  const element = document.getElementById(elementId);
  if (!element) return;

  // Visual tweaks for capture
  const originalStyle = element.style.cssText;
  element.style.width = '1200px'; // Fixed width for consistency
  element.style.height = 'auto';
  element.style.background = '#0f172a'; // Ensure dark background capture
  element.style.color = '#ffffff';
  
  // Temporarily hide tools/buttons that shouldn't be in print
  const noPrintElements = element.querySelectorAll('.no-print');
  noPrintElements.forEach(el => el.style.display = 'none');

  try {
      const canvas = await html2canvas(element, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#0f172a', // Dark theme bg
          logging: false
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'pt',
          format: 'a4'
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      // First page
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;

      // Subsequent pages if long
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }
      
      pdf.save(fileName);

  } catch (error) {
      console.error("PDF Export failed", error);
      throw error;
  } finally {
      // Restore styles
      element.style.cssText = originalStyle;
      noPrintElements.forEach(el => el.style.display = '');
  }
};

export const exportToWordMock = (fileName) => {
    // Real .docx generation client-side is heavy. 
    // We simulate by creating an MHTML or simple HTML blob which Word can open.
    const content = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head><title>QuickVol Report</title></head>
        <body>
            <h1>QuickVol Advanced Report</h1>
            <p>Generated on ${new Date().toLocaleString()}</p>
            <hr/>
            <p>This is a placeholder for the Word export functionality. In a production environment, this would generate a complete .docx file using libraries like 'docx' or server-side generation.</p>
        </body>
        </html>
    `;
    
    const blob = new Blob(['\ufeff', content], {
        type: 'application/msword'
    });
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};