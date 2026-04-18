import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { saveAs } from 'file-saver';
import html2canvas from 'html2canvas';

export const createBlob = (content, type) => new Blob([content], { type });

export const downloadFile = (blob, fileName) => saveAs(blob, fileName);

export const exportToPDF = (title, data, fileName) => {
  try {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(title || 'Exported Report', 14, 20);
    
    if (data && Array.isArray(data) && data.length > 0) {
      const headers = Object.keys(data[0]);
      const rows = data.map(obj => headers.map(header => {
         const val = obj[header];
         if (val === null || val === undefined) return '';
         if (typeof val === 'object') return JSON.stringify(val);
         return String(val);
      }));
      
      doc.autoTable({
        startY: 30,
        head: [headers],
        body: rows,
        theme: 'grid',
        headStyles: { fillColor: [15, 23, 42] },
      });
    } else {
      doc.setFontSize(12);
      doc.text('No data available for this report.', 14, 30);
    }
    
    doc.save(`${fileName || 'export'}.pdf`);
    return true;
  } catch (error) {
    console.error('Error exporting to PDF:', error);
    return false;
  }
};

export const exportToCSV = (data, fileName) => {
  try {
    if (!data || !Array.isArray(data) || data.length === 0) {
      console.warn('No data provided for CSV export');
      return false;
    }
    const csv = Papa.unparse(data);
    const blob = createBlob(csv, 'text/csv;charset=utf-8;');
    downloadFile(blob, `${fileName || 'export'}.csv`);
    return true;
  } catch (error) {
    console.error('Error exporting to CSV:', error);
    return false;
  }
};

export const exportDataAsCSV = exportToCSV;

export const exportToExcel = (data, fileName) => {
  try {
    if (!data || !Array.isArray(data) || data.length === 0) {
      console.warn('No data provided for Excel export');
      return false;
    }
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
    XLSX.writeFile(workbook, `${fileName || 'export'}.xlsx`);
    return true;
  } catch (error) {
    console.error('Error exporting to Excel:', error);
    return false;
  }
};

export const exportToJSON = (data, fileName) => {
  try {
    const json = JSON.stringify(data, null, 2);
    const blob = createBlob(json, 'application/json');
    downloadFile(blob, `${fileName || 'export'}.json`);
    return true;
  } catch (error) {
    console.error('Error exporting to JSON:', error);
    return false;
  }
};

export const exportAsImage = async (elementId, fileName) => {
  try {
    const element = document.getElementById(elementId) || document.body;
    const canvas = await html2canvas(element, { useCORS: true, allowTaint: true });
    canvas.toBlob((blob) => {
      downloadFile(blob, `${fileName || 'export'}.png`);
    });
    return true;
  } catch (err) {
    console.error('Error exporting image:', err);
    return false;
  }
};

export const exportAsPDF = async (elementId, fileName) => {
  try {
    const element = document.getElementById(elementId) || document.body;
    const canvas = await html2canvas(element, { useCORS: true, allowTaint: true });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`${fileName || 'export'}.pdf`);
    return true;
  } catch (err) {
    console.error('Error exporting HTML to PDF:', err);
    return false;
  }
};

export const exportToGeoJSON = (data, fileName) => {
  try {
    const features = [];
    if (data && data.contours) {
      data.contours.forEach(c => {
        features.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: c.points || [] },
          properties: { value: c.value }
        });
      });
    }
    const geojson = {
      type: "FeatureCollection",
      features
    };
    const blob = createBlob(JSON.stringify(geojson, null, 2), 'application/geo+json');
    downloadFile(blob, `${fileName || 'export'}.geojson`);
    return true;
  } catch (err) {
    console.error('Error exporting to GeoJSON:', err);
    return false;
  }
};

export const exportToDXF = (data, fileName) => {
  try {
    let dxf = "0\nSECTION\n2\nENTITIES\n";
    if (data && data.contours) {
      data.contours.forEach(c => {
        dxf += "0\nPOLYLINE\n8\n0\n66\n1\n";
        if (c.points) {
          c.points.forEach(p => {
            dxf += `0\nVERTEX\n8\n0\n10\n${p[0]}\n20\n${p[1]}\n30\n0.0\n`;
          });
        }
        dxf += "0\nSEQEND\n";
      });
    }
    dxf += "0\nENDSEC\n0\nEOF\n";
    const blob = createBlob(dxf, 'application/dxf');
    downloadFile(blob, `${fileName || 'export'}.dxf`);
    return true;
  } catch (err) {
    console.error('Error exporting to DXF:', err);
    return false;
  }
};

export const printElement = (elementId, title = 'Document') => {
  try {
    const element = document.getElementById(elementId);
    if (!element) {
      console.warn(`Element with id ${elementId} not found.`);
      return false;
    }
    const printContents = element.innerHTML;
    const originalContents = document.body.innerHTML;
    document.body.innerHTML = printContents;
    document.title = title;
    window.print();
    document.body.innerHTML = originalContents;
    window.location.reload();
    return true;
  } catch (err) {
    console.error('Error printing element:', err);
    return false;
  }
};