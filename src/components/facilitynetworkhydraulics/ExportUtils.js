import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

export const exportToJSON = (data, filename = 'pipeline-sizing.json') => {
  const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}`;
  const link = document.createElement('a');
  link.href = jsonString;
  link.download = filename;
  link.click();
};

export const exportToPDF = (data, filename = 'pipeline-sizing.pdf') => {
  const doc = new jsPDF();
  
  doc.setFontSize(18);
  doc.text('Pipeline Sizing Report', 14, 22);
  
  doc.setFontSize(12);
  doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 32);
  
  doc.autoTable({
    startY: 40,
    head: [['Parameter', 'Value']],
    body: [
      ['Flow Rate (m3/hr)', data.inputs.flowRate],
      ['Diameter (in)', data.inputs.diameter],
      ['Length (m)', data.inputs.length],
      ['Velocity (m/s)', data.results.velocity.toFixed(2)],
      ['Pressure Drop (bar)', data.results.totalPressureDropBar.toFixed(2)],
      ['Reynolds Number', data.results.reynolds.toFixed(0)],
    ],
  });
  
  doc.save(filename);
};