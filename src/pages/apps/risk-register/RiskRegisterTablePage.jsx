import React, { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Download, Search, Filter, Plus } from 'lucide-react';
import { useRiskRegister } from './hooks/useRiskRegister';
import { exportDataAsCSV, exportToPDF } from '@/utils/exportUtils';
import { useToast } from '@/hooks/use-toast';

const RiskRegisterTablePage = () => {
  const { risks, loading } = useRiskRegister();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');

  const handleExport = (format) => {
    if (!risks.length) {
      toast({ description: "No risks available to export." });
      return;
    }
    const filename = `Risk_Register_${new Date().toISOString().split('T')[0]}`;
    if (format === 'csv') {
      exportDataAsCSV(risks, filename);
    } else {
      exportToPDF('Risk Register', risks, filename);
    }
  };

  const filteredRisks = risks.filter(r => 
    r.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 bg-[hsl(var(--background))] min-h-screen text-[hsl(var(--foreground))]">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Risk Register</h1>
          <p className="text-[hsl(var(--muted-foreground))]">Manage and monitor project risks across the organization.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport('csv')}>
            <Download className="w-4 h-4 mr-2" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('pdf')}>
            <Download className="w-4 h-4 mr-2" /> PDF
          </Button>
          <Button size="sm" className="bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">
            <Plus className="w-4 h-4 mr-2" /> New Risk
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-[hsl(var(--card))] p-4 rounded-lg border border-[hsl(var(--border))]">
        <Search className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
        <input 
          className="flex-1 bg-transparent border-none outline-none text-sm"
          placeholder="Search risks..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <Button variant="ghost" size="sm"><Filter className="w-4 h-4" /></Button>
      </div>

      <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-[hsl(var(--border))] hover:bg-transparent">
              <TableHead className="w-[100px]">ID</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Likelihood</TableHead>
              <TableHead>Impact</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10">Loading risks...</TableCell></TableRow>
            ) : filteredRisks.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10 text-[hsl(var(--muted-foreground))] italic">No risks found</TableCell></TableRow>
            ) : (
              filteredRisks.map((risk) => (
                <TableRow key={risk.id} className="border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]/50">
                  <TableCell className="font-mono text-xs text-[hsl(var(--muted-foreground))]">{risk.risk_id}</TableCell>
                  <TableCell className="font-medium">{risk.title}</TableCell>
                  <TableCell>{risk.category}</TableCell>
                  <TableCell>{risk.likelihood}</TableCell>
                  <TableCell>{risk.impact}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded text-xs font-bold ${risk.risk_score > 15 ? 'bg-red-500/20 text-red-500' : 'bg-green-500/20 text-green-500'}`}>
                      {risk.risk_score}
                    </span>
                  </TableCell>
                  <TableCell>{risk.status}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default RiskRegisterTablePage;