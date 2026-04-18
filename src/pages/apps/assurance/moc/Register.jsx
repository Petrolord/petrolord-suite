import React, { useState } from 'react';
import { MOCPageShell } from './components/MOCPageShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Search, Filter, Download, Columns, MoreHorizontal } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { exportToCSV, exportToExcel, exportToPDF } from '@/utils/exportUtils';
import { useToast } from '@/hooks/use-toast';

export default function MOCRegister() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');

  const mockData = [
    { id: 'MOC-2026-089', title: 'Upgrade Compressor C-101', type: 'Permanent', category: 'Facility', stage: 'Review', owner: 'J. Smith', risk: 'Medium', date: '2026-03-25' },
    { id: 'MOC-2026-088', title: 'Update bypass procedure', type: 'Procedural', category: 'Operations', stage: 'Approval', owner: 'A. Davis', risk: 'Low', date: '2026-03-22' },
    { id: 'MOC-2026-085', title: 'Chemical injection rate change', type: 'Temporary', category: 'Process', stage: 'Implemented', owner: 'R. Chen', risk: 'Low', date: '2026-03-15' },
    { id: 'MOC-2026-082', title: 'Temporary pipeline clamp', type: 'Emergency', category: 'Integrity', stage: 'Draft', owner: 'M. Wong', risk: 'High', date: '2026-03-10' },
    { id: 'MOC-2026-077', title: 'New DCS Control Logic', type: 'Permanent', category: 'Automation', stage: 'Closed', owner: 'T. Lee', risk: 'Medium', date: '2026-02-28' },
  ];

  const filteredData = mockData.filter(d => d.id.includes(searchTerm) || d.title.toLowerCase().includes(searchTerm.toLowerCase()));

  const getStageBadge = (stage) => {
    switch(stage) {
      case 'Draft': return 'badge-draft';
      case 'Implemented': case 'Closed': return 'badge-success';
      case 'Approval': return 'badge-approval';
      case 'Review': case 'Screening': return 'badge-review';
      default: return 'badge-draft';
    }
  };

  const handleExport = (type) => {
    const filename = `MOC-Register-${new Date().toISOString().split('T')[0]}`;
    let success = false;
    if (type === 'csv') success = exportToCSV(filteredData, filename);
    if (type === 'excel') success = exportToExcel(filteredData, filename);
    if (type === 'pdf') success = exportToPDF('MOC Register', filteredData, filename);

    if (success) {
      toast({ title: 'Export Successful', description: `${filename}.${type} downloaded.` });
    } else {
      toast({ title: 'Export Failed', description: 'No data to export.', variant: 'destructive' });
    }
  };

  return (
    <MOCPageShell title="MOC Register" description="Complete registry of all change records">
      <div className="h-full flex flex-col space-y-4 pb-20 md:pb-0 animate-in fade-in duration-300">
        
        {/* Top Controls */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 bg-[hsl(var(--card))] p-4 rounded-xl border border-[hsl(var(--border))] shadow-sm no-print">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
              <Input 
                placeholder="Search ID, Title..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 bg-[hsl(var(--background))] border-[hsl(var(--border))]"
              />
            </div>
            <Button variant="outline" size="icon" className="shrink-0 bg-[hsl(var(--background))] border-[hsl(var(--border))]">
              <Filter className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
            </Button>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar">
            <Select defaultValue="all">
              <SelectTrigger className="w-[140px] bg-[hsl(var(--background))] border-[hsl(var(--border))]">
                <SelectValue placeholder="Stage" />
              </SelectTrigger>
              <SelectContent className="bg-[hsl(var(--card))] border-[hsl(var(--border))]">
                <SelectItem value="all">All Stages</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="review">Review</SelectItem>
                <SelectItem value="approval">Approval</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" className="bg-[hsl(var(--background))] border-[hsl(var(--border))]">
              <Columns className="w-4 h-4 mr-2" /> Columns
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="bg-[hsl(var(--background))] border-[hsl(var(--border))]">
                  <Download className="w-4 h-4 mr-2" /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-[hsl(var(--card))] border-[hsl(var(--border))]">
                <DropdownMenuItem onClick={() => handleExport('csv')}>Export as CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('excel')}>Export as Excel</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('pdf')}>Export as PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Data Grid */}
        <div className="data-grid-container flex-1 overflow-hidden flex flex-col print-only">
          <div className="overflow-x-auto flex-1">
            <table className="data-grid-table">
              <thead className="sticky top-0 z-10 no-print">
                <tr>
                  <th className="data-grid-th w-10 text-center"><input type="checkbox" className="rounded border-slate-600 bg-slate-800" /></th>
                  <th className="data-grid-th">MOC Number</th>
                  <th className="data-grid-th">Title</th>
                  <th className="data-grid-th">Type</th>
                  <th className="data-grid-th">Stage</th>
                  <th className="data-grid-th">Risk</th>
                  <th className="data-grid-th">Owner</th>
                  <th className="data-grid-th">Created</th>
                  <th className="data-grid-th w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((row) => (
                  <tr key={row.id} className="data-grid-tr" onClick={() => navigate(row.id)}>
                    <td className="data-grid-td text-center no-print" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="rounded border-slate-600 bg-slate-800" /></td>
                    <td className="data-grid-td font-medium text-[hsl(var(--primary))]">{row.id}</td>
                    <td className="data-grid-td max-w-[300px] truncate">{row.title}</td>
                    <td className="data-grid-td text-xs">
                      <span className={`px-2 py-1 rounded bg-[hsl(var(--secondary-background))] border border-[hsl(var(--border))] ${row.type === 'Emergency' ? 'text-[hsl(var(--destructive))]' : ''}`}>
                        {row.type}
                      </span>
                    </td>
                    <td className="data-grid-td">
                      <span className={`badge-status ${getStageBadge(row.stage)}`}>{row.stage}</span>
                    </td>
                    <td className="data-grid-td">
                      <span className={`text-xs font-semibold ${row.risk === 'High' ? 'text-[hsl(var(--destructive))]' : row.risk === 'Medium' ? 'text-[hsl(var(--warning))]' : 'text-[hsl(var(--success))]'}`}>
                        {row.risk}
                      </span>
                    </td>
                    <td className="data-grid-td text-xs text-[hsl(var(--muted-foreground))]">{row.owner}</td>
                    <td className="data-grid-td text-xs text-[hsl(var(--muted-foreground))]">{row.date}</td>
                    <td className="data-grid-td text-right no-print" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-[hsl(var(--secondary))]">
                        <MoreHorizontal className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Pagination Footer */}
          <div className="border-t border-[hsl(var(--border))] p-3 flex items-center justify-between bg-[hsl(var(--card))] no-print">
            <span className="text-xs text-[hsl(var(--muted-foreground))]">Showing 1 to {filteredData.length} of {filteredData.length} entries</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled className="h-8 text-xs bg-transparent border-[hsl(var(--border))]">Prev</Button>
              <Button variant="outline" size="sm" disabled className="h-8 text-xs bg-transparent border-[hsl(var(--border))]">Next</Button>
            </div>
          </div>
        </div>

      </div>
    </MOCPageShell>
  );
}