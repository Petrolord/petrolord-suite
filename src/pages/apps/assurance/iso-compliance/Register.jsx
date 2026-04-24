import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Filter } from 'lucide-react';

export default function Register({ clauses = [], searchQuery = '' }) {
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const itemsPerPage = 25;

  const filteredClauses = useMemo(() => {
    return clauses.filter(c => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return c.clause.toLowerCase().includes(q) || 
             c.title.toLowerCase().includes(q) || 
             c.standard.toLowerCase().includes(q);
    });
  }, [clauses, searchQuery]);

  const totalPages = Math.ceil(filteredClauses.length / itemsPerPage);
  const currentData = filteredClauses.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const getStatusBadge = (status) => {
    const base = "px-2 py-1 text-xs rounded-full font-medium whitespace-nowrap ";
    if (status === 'Compliant') return base + "bg-emerald-500/10 text-emerald-500";
    if (status === 'Partial') return base + "bg-amber-500/10 text-amber-500";
    return base + "bg-red-500/10 text-red-500";
  };

  const getEvidenceBadge = (status) => {
    const base = "px-2 py-1 text-xs rounded-full font-medium whitespace-nowrap border ";
    if (status === 'Current') return base + "bg-transparent border-emerald-500/30 text-emerald-500";
    if (status === 'Needs Update') return base + "bg-transparent border-amber-500/30 text-amber-500";
    return base + "bg-transparent border-red-500/30 text-red-500";
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-[hsl(var(--foreground))]">Clause Register</h2>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Showing {currentData.length} of {filteredClauses.length} clauses</p>
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
                  <th className="data-grid-th">Clause</th>
                  <th className="data-grid-th">Standard</th>
                  <th className="data-grid-th">Title</th>
                  <th className="data-grid-th">Department</th>
                  <th className="data-grid-th">Status</th>
                  <th className="data-grid-th">Evidence</th>
                  <th className="data-grid-th text-right">Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {currentData.map(c => (
                  <tr key={c.id} className="data-grid-tr cursor-pointer">
                    <td className="data-grid-td font-medium">{c.clause}</td>
                    <td className="data-grid-td text-[hsl(var(--muted-foreground))]">{c.standard}</td>
                    <td className="data-grid-td max-w-[300px] truncate">{c.title}</td>
                    <td className="data-grid-td">{c.department}</td>
                    <td className="data-grid-td">
                      <span className={getStatusBadge(c.status)}>{c.status}</span>
                    </td>
                    <td className="data-grid-td">
                      <span className={getEvidenceBadge(c.evidenceStatus)}>{c.evidenceStatus}</span>
                    </td>
                    <td className="data-grid-td text-right text-[hsl(var(--muted-foreground))]">{c.lastUpdated}</td>
                  </tr>
                ))}
                {currentData.length === 0 && (
                  <tr>
                    <td colSpan="7" className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                      No clauses found matching your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-3 border-t border-[hsl(var(--border))]">
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Page {currentPage} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="bg-[hsl(var(--background))] border-[hsl(var(--border))]">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="bg-[hsl(var(--background))] border-[hsl(var(--border))]">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}