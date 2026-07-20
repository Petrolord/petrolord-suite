// Re-export shim — this engine lives in the central @petrolord/engines repo, vendored at packages/engines (git subtree). Never edit the vendored copy from the Suite; changes go to Petrolord/petrolord-engines and are subtree-pulled.
export * from '../../../packages/engines/engines/dca/arps';

// Browser-only export helpers stay Suite-side: file-saver is a DOM
// dependency the pure engines package must not carry.
import { saveAs } from 'file-saver';

// --- Export Functions ---
export const exportToLAS = (wellData, filename = 'decline_curve_analysis.las') => {
  let lasContent = '~VERSION INFORMATION\n';
  lasContent += 'VERS. 2.0: CWLS LOG ASCII STANDARD - VERSION 2.0\n';
  lasContent += 'WRAP. NO: ONE LINE PER DEPTH STEP\n';
  lasContent += '\n~WELL INFORMATION\n';
  lasContent += `STRT.M ${wellData[0]?.date || '2024-01-01'}: START DATE\n`;
  lasContent += `STOP.M ${wellData[wellData.length - 1]?.date || '2024-12-31'}: STOP DATE\n`;
  lasContent += `STEP.M 1: STEP (DAYS)\n`;
  lasContent += 'NULL. -999.25: NULL VALUE\n';
  lasContent += 'WELL. DECLINE_CURVE: WELL NAME\n';
  lasContent += '\n~CURVE INFORMATION\n';
  lasContent += 'DATE. : DATE\n';
  lasContent += 'RATE.BBL/D: PRODUCTION RATE\n';
  lasContent += 'CUMULATIVE.BBL: CUMULATIVE PRODUCTION\n';
  lasContent += '\n~ASCII\n';
  
  wellData.forEach(point => {
    lasContent += `${point.date || ''} ${point.rate || -999.25} ${point.cumulative || -999.25}\n`;
  });
  
  const blob = new Blob([lasContent], { type: 'text/plain;charset=utf-8' });
  saveAs(blob, filename);
};

export const exportToCSV = (data, filename = 'decline_curve_data.csv') => {
  const headers = Object.keys(data[0] || {}).join(',');
  const rows = data.map(row => Object.values(row).join(','));
  const csvContent = [headers, ...rows].join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  saveAs(blob, filename);
};
