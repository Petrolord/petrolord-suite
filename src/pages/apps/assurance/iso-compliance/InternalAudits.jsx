import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Filter } from 'lucide-react';

export default function InternalAudits({ audits = [], searchQuery = '' }) {
  const [showFilters, setShowFilters] = useState(false);

  const filteredAudits = useMemo(() => {
    return audits.filter(a => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return a.title.toLowerCase().includes(q) || 
             a.standard.toLowerCase().includes(q) ||
             a.id.toLowerCase().includes(q);
    });
  }, [audits, searchQuery]);

  const getStatusBadge = (status) => {
    const base = "px-2 py-1 text-xs rounded-full font-medium whitespace-nowrap ";
    if (status === 'Completed') return base + "bg-emerald-500/10 text-emerald-500";
    if (status === 'In Progress') return base + "bg-blue-500/10 text-blue-500";
    return base + "bg-amber-500/10 text-amber-500";
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-[hsl(var(--foreground))]">Internal Audits</h2>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">{filteredAudits.length} audits found</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)} className="bg-[hsl(var(--card))] border-[hsl(var(--border))] text-[hsl(var(--foreground))]">
          <Filter className="w-4 h-4 mr-2" /> Filters
        </Button>
      </div>

      <Card className="bg-[hsl(var(--card))] border-[hsl(var(--border))]">
        <CardContent className="p-0">
          <div className="data-grid-container border-0 rounded-none">
            <table className="data-grid-table">
              <thead>
                <tr>
                  <th className="data-grid-th">Audit ID</th>
                  <th className="data-grid-th">Title</th>
                  <th className="data-grid-th">Standard</th>
                  <th className="data-grid-th">Department</th>
                  <th className="data-grid-th">Lead Auditor</th>
                  <th className="data-grid-th">Date</th>
                  <th className="data-grid-th text-center">Score</th>
                  <th className="data-grid-th">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredAudits.map(a => (
                  <tr key={a.id} className="data-grid-tr cursor-pointer">
                    <td className="data-grid-td font-medium text-[hsl(var(--primary))]">{a.id}</td>
                    <td className="data-grid-td">{a.title}</td>
                    <td className="data-grid-td text-[hsl(var(--muted-foreground))]">{a.standard}</td>
                    <td className="data-grid-td">{a.department}</td>
                    <td className="data-grid-td">{a.leadAuditor}</td>
                    <td className="data-grid-td">{a.date}</td>
                    <td className="data-grid-td text-center font-bold">{a.score}%</td>
                    <td className="data-grid-td">
                      <span className={getStatusBadge(a.status)}>{a.status}</span>
                    </td>
                  </tr>
                ))}
                {filteredAudits.length === 0 && (
                  <tr>
                    <td colSpan="8" className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                      No audits found matching your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}