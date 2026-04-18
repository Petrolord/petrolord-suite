import React, { useState, useMemo } from 'react';
import { X, Download, Printer, Search, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const ReportDetailModal = ({ isOpen, onClose, reportType, reportTitle, reportIcon: Icon, data, onExport, isLoading }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  // Handle sorting
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Filter, Sort, and Paginate Data
  const processedData = useMemo(() => {
    if (!data) return [];
    
    let filtered = [...data];

    // Filter
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      filtered = filtered.filter(item => 
        Object.values(item).some(val => 
          String(val).toLowerCase().includes(lowerSearch)
        )
      );
    }

    // Sort
    if (sortConfig.key) {
      filtered.sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [data, searchTerm, sortConfig]);

  const totalPages = Math.ceil(processedData.length / itemsPerPage);
  const paginatedData = processedData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const headers = data && data.length > 0 ? Object.keys(data[0]) : [];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full h-full bg-[hsl(var(--background))] flex flex-col relative animate-in slide-in-from-bottom-4 duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={onClose} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]">
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div className="h-8 w-px bg-[hsl(var(--border))]"></div>
            <div className="flex items-center gap-3">
              {Icon && (
                <div className="p-2 bg-[hsl(var(--primary))]/10 rounded-md">
                  <Icon className="w-5 h-5 text-[hsl(var(--primary))]" />
                </div>
              )}
              <div>
                <h2 className="text-xl font-bold text-[hsl(var(--foreground))]">{reportTitle}</h2>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  {processedData.length} records found
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
              <Input 
                placeholder="Search report..." 
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                className="pl-9 w-[250px] bg-[hsl(var(--background))] border-[hsl(var(--border))] text-[hsl(var(--foreground))]"
              />
            </div>
            <Button variant="outline" onClick={() => window.print()} className="bg-[hsl(var(--card))] border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]">
              <Printer className="w-4 h-4 mr-2" /> Print
            </Button>
            <Button onClick={() => onExport(reportTitle, processedData)} className="btn-primary">
              <Download className="w-4 h-4 mr-2" /> Export CSV
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} className="ml-2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))]">
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 bg-[hsl(var(--background))]">
          {isLoading ? (
            <div className="w-full h-full flex flex-col items-center justify-center text-[hsl(var(--muted-foreground))]">
              <div className="w-8 h-8 border-4 border-[hsl(var(--primary))] border-t-transparent rounded-full animate-spin mb-4"></div>
              <p>Generating report data...</p>
            </div>
          ) : !data || data.length === 0 ? (
            <div className="w-full h-full flex flex-col items-center justify-center text-[hsl(var(--muted-foreground))] border-2 border-dashed border-[hsl(var(--border))] rounded-lg">
              <p>No data available for this report type.</p>
            </div>
          ) : (
            <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg overflow-hidden flex flex-col max-h-full shadow-lg">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs uppercase bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] sticky top-0 z-10 shadow-sm">
                    <tr>
                      {headers.map((header) => (
                        <th 
                          key={header} 
                          onClick={() => handleSort(header)}
                          className="px-6 py-4 font-semibold cursor-pointer hover:bg-[hsl(var(--background))]/50 transition-colors whitespace-nowrap"
                        >
                          <div className="flex items-center gap-2">
                            {header.replace(/_/g, ' ')}
                            <ArrowUpDown className="w-3 h-3 opacity-50" />
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedData.length > 0 ? paginatedData.map((row, i) => (
                      <tr key={i} className="border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary))]/50 transition-colors">
                        {headers.map((header) => (
                          <td key={`${i}-${header}`} className="px-6 py-3 text-[hsl(var(--foreground))] whitespace-nowrap">
                            {row[header]}
                          </td>
                        ))}
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={headers.length} className="px-6 py-8 text-center text-[hsl(var(--muted-foreground))]">
                          No matching records found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-3 border-t border-[hsl(var(--border))] bg-[hsl(var(--card))] mt-auto">
                  <span className="text-sm text-[hsl(var(--muted-foreground))]">
                    Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, processedData.length)} of {processedData.length} entries
                  </span>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]"
                    >
                      Previous
                    </Button>
                    <div className="flex items-center px-4 text-sm font-medium text-[hsl(var(--foreground))]">
                      Page {currentPage} of {totalPages}
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};