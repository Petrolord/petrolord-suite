import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { format } from 'date-fns';

export const exportReportData = (data, columns, config, formatType) => {
  const filename = `${config.name || 'Report'}_${format(new Date(), 'yyyy-MM-dd')}`;
  
  if (!data || !data.length) {
    throw new Error("No data available to export.");
  }

  // Flatten data based on selected columns
  const exportData = data.map(item => {
    const row = {};
    columns.forEach(col => {
      let val = item[col.key];
      if (typeof val === 'object' && val !== null) {
        val = JSON.stringify(val);
      }
      row[col.label] = val;
    });
    return row;
  });

  switch (formatType) {
    case 'csv':
      exportToCSV(exportData, filename);
      break;
    case 'excel':
      exportToExcel(exportData, filename, config.name || 'Sheet1');
      break;
    case 'pdf':
      exportToPDF(exportData, columns, filename, config);
      break;
    case 'print':
      printReport(exportData, columns, config);
      break;
    default:
      throw new Error(`Unsupported export format: ${formatType}`);
  }
};

const exportToCSV = (data, filename) => {
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => 
      headers.map(header => {
        const val = row[header] || '';
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(',')
    )
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  saveAs(blob, `${filename}.csv`);
};

const exportToExcel = (data, filename, sheetName) => {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.substring(0, 31));
  XLSX.writeFile(workbook, `${filename}.xlsx`);
};

const exportToPDF = (data, columns, filename, config) => {
  const doc = new jsPDF('landscape');
  
  doc.setFontSize(18);
  doc.setTextColor(6, 182, 212); // Cyan-500
  doc.text(config.name || 'Risk Register Report', 14, 20);
  
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139); // Slate-500
  doc.text(`Generated on: ${format(new Date(), 'PPpp')}`, 14, 28);
  if (config.description) {
    doc.text(config.description, 14, 34);
  }

  const tableHeaders = columns.map(c => c.label);
  const tableData = data.map(row => columns.map(c => row[c.label] || ''));

  doc.autoTable({
    startY: config.description ? 42 : 36,
    head: [tableHeaders],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    styles: { fontSize: 8, cellPadding: 3 },
    alternateRowStyles: { fillColor: [241, 245, 249] }
  });

  doc.save(`${filename}.pdf`);
};

const printReport = (data, columns, config) => {
  const printWindow = window.open('', '_blank');
  
  let html = `
    <html>
      <head>
        <title>${config.name || 'Print Report'}</title>
        <style>
          body { font-family: system-ui, sans-serif; color: #0f172a; padding: 20px; }
          h1 { color: #06b6d4; margin-bottom: 5px; }
          p { color: #64748b; margin-top: 0; font-size: 14px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
          th { background-color: #f1f5f9; font-weight: 600; }
          @media print {
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <h1>${config.name || 'Risk Register Report'}</h1>
        <p>Generated on: ${format(new Date(), 'PPpp')}</p>
        ${config.description ? `<p>${config.description}</p>` : ''}
        <button onclick="window.print()" style="padding: 8px 16px; background: #06b6d4; color: white; border: none; border-radius: 4px; cursor: pointer; margin-bottom: 20px;">Print Now</button>
        <table>
          <thead>
            <tr>${columns.map(c => `<th>${c.label}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${data.map(row => `
              <tr>${columns.map(c => `<td>${row[c.label] || ''}</td>`).join('')}</tr>
            `).join('')}
          </tbody>
        </table>
      </body>
    </html>
  `;
  
  printWindow.document.write(html);
  printWindow.document.close();
};