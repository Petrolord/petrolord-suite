import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Filter } from 'lucide-react';

export default function FindingsRegister({ findings = [], searchQuery = '' }) {
  const [showFilters, setShowFilters] = useState(false);

  const filteredFindings = useMemo(() => {
    return findings.filter(f => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return f.id.toLowerCase().includes(q) || 
             f.description.toLowerCase().includes(q) ||
             f.auditId.toLowerCase().includes(q);
    });
  }, [findings, searchQuery]);

  const getSeverityBadge = (severity) => {
    const base = "px-2 py-1 text-xs rounded-full font-medium whitespace-nowrap border ";
    if (severity === 'Low') return base + "bg-transparent border-emerald-500/30 text-emerald-500";
    if (severity === 'Medium') return base + "bg-transparent border-amber-500/30 text-amber-500";
    return base + "bg-transparent border-red-500/30 text-red-500";
  };

  const getStatusBadge = (status) => {
    const base = "px-2 py-1 text-xs rounded-full font-medium whitespace-nowrap ";
    if (status === 'Closed') return base + "bg-emerald-500/10 text-emerald-500";
    if (status === 'In Review') return base + "bg-blue-500/10 text-blue-500";
    return base + "bg-amber-500/10 text-amber-500";
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-[hsl(var(--foreground))]">Findings & Actions</h2>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">{filteredFindings.length} findings logged</p>
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
                  <th className="data-grid-th">Finding ID</th>
                  <th className="data-grid-th">Audit Ref</th>
                  <th className="data-grid-th">Type</th>
                  <th className="data-grid-th">Severity</th>
                  <th className="data-grid-th w-1/3">Description</th>
                  <th className="data-grid-th">Owner</th>
                  <th className="data-grid-th">Due Date</th>
                  <th className="data-grid-th">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredFindings.map(f => (
                  <tr key={f.id} className="data-grid-tr cursor-pointer">
                    <td className="data-grid-td font-medium text-[hsl(var(--primary))]">{f.id}</td>
                    <td className="data-grid-td text-[hsl(var(--muted-foreground))]">{f.auditId}</td>
                    <td className="data-grid-td font-medium">{f.type}</td>
                    <td className="data-grid-td">
                      <span className={getSeverityBadge(f.severity)}>{f.severity}</span>
                    </td>
                    <td className="data-grid-td truncate max-w-[200px]">{f.description}</td>
                    <td className="data-grid-td">{f.owner}</td>
                    <td className="data-grid-td text-[hsl(var(--muted-foreground))]">{f.dueDate}</td>
                    <td className="data-grid-td">
                      <span className={getStatusBadge(f.status)}>{f.status}</span>
                    </td>
                  </tr>
                ))}
                {filteredFindings.length === 0 && (
                  <tr>
                    <td colSpan="8" className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                      No findings found matching your search.
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