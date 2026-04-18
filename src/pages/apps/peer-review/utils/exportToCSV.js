import { toast } from '@/hooks/use-toast';

export const exportToCSV = (reportTitle, data) => {
  if (!data || data.length === 0) {
    toast({
      title: "Export Failed",
      description: "No data available to export.",
      variant: "destructive"
    });
    return;
  }

  try {
    // Extract headers
    const headers = Object.keys(data[0]);
    
    // Format rows
    const csvRows = data.map(row => {
      return headers.map(header => {
        let value = row[header];
        // Handle null/undefined
        if (value === null || value === undefined) value = '';
        // Escape quotes and wrap in quotes if contains comma
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      }).join(',');
    });

    // Add title as first row, empty row, then headers, then data
    const csvContent = [
      `"${reportTitle} - Generated on ${new Date().toLocaleDateString()}"`,
      '',
      headers.join(','),
      ...csvRows
    ].join('\n');

    // Create Blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    const safeTitle = reportTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const dateStr = new Date().toISOString().split('T')[0];
    
    link.setAttribute('href', url);
    link.setAttribute('download', `${safeTitle}_${dateStr}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Cleanup
    setTimeout(() => URL.revokeObjectURL(url), 100);

    toast({
      title: "Export Successful",
      description: `Report exported as CSV.`,
    });
  } catch (error) {
    console.error("CSV Export Error:", error);
    toast({
      title: "Export Failed",
      description: "An error occurred while generating the CSV.",
      variant: "destructive"
    });
  }
};