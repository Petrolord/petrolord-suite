import React, { useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Search, Database } from 'lucide-react';
import { browsableCatalog, paToPsi } from '../services/ctRun';

// API 5CT dimensional rows with ENGINE-computed ratings (Barlow burst,
// 5C3 four-regime collapse, body yield). onSelect hands the picked row
// back to the caller (section editors) — the wire the legacy app never had.
const CatalogBrowser = ({ open, onOpenChange, onSelect, kindFilter = null }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [odFilter, setOdFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState(kindFilter || 'All');

  const catalog = useMemo(() => browsableCatalog(), []);

  const rows = useMemo(() => catalog.filter((item) => {
    if (kindFilter && item.kind !== kindFilter) return false;
    const matchesSearch = !searchTerm
      || item.grade.toLowerCase().includes(searchTerm.toLowerCase())
      || item.designation.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesOD = odFilter === 'All' || item.odIn === parseFloat(odFilter);
    const matchesType = kindFilter || typeFilter === 'All' || item.kind === typeFilter;
    return matchesSearch && matchesOD && matchesType;
  }), [catalog, searchTerm, odFilter, typeFilter, kindFilter]);

  const uniqueODs = useMemo(() => ['All', ...new Set(
    catalog.filter((c) => !kindFilter || c.kind === kindFilter).map((c) => c.odIn),
  )], [catalog, kindFilter]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 overflow-hidden">
        <div className="p-6 pb-4 border-b border-pl-border">
          <DialogHeader>
            <DialogTitle className="flex items-center text-xl text-pl-text">
              <Database className="w-5 h-5 mr-3 text-pl-muted" />
              Tubular Catalog
            </DialogTitle>
            <DialogDescription className="text-pl-muted">
              API 5CT dimensional rows; burst, collapse and yield computed live by the validated engine.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-4 mt-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-pl-muted" />
              <Input
                placeholder="Search by grade (e.g. L-80) or size..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 text-sm"
              />
            </div>
            {!kindFilter && (
              <div className="w-40">
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All</SelectItem>
                    <SelectItem value="casing">Casing</SelectItem>
                    <SelectItem value="tubing">Tubing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="w-32">
              <Select value={odFilter.toString()} onValueChange={setOdFilter}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="OD" />
                </SelectTrigger>
                <SelectContent>
                  {uniqueODs.map((od) => (
                    <SelectItem key={od} value={od.toString()}>{od === 'All' ? 'All Sizes' : `${od}"`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-hidden bg-pl-surface">
          <ScrollArea className="h-full">
            <Table>
              <TableHeader className="sticky top-0 bg-pl-sunken z-10 border-b border-pl-border">
                <TableRow className="border-pl-border hover:bg-transparent">
                  <TableHead className="text-pl-muted font-semibold w-[70px]">Type</TableHead>
                  <TableHead className="text-pl-muted font-semibold">OD (in)</TableHead>
                  <TableHead className="text-pl-muted font-semibold">Weight (lb/ft)</TableHead>
                  <TableHead className="text-pl-muted font-semibold">Wall (in)</TableHead>
                  <TableHead className="text-pl-muted font-semibold">ID (in)</TableHead>
                  <TableHead className="text-pl-muted font-semibold">Grade</TableHead>
                  <TableHead className="text-pl-muted font-semibold text-right">Burst (psi)</TableHead>
                  <TableHead className="text-pl-muted font-semibold text-right">Collapse (psi)</TableHead>
                  <TableHead className="text-pl-muted font-semibold">Regime</TableHead>
                  <TableHead className="text-pl-muted font-semibold text-right">Body Yield (klbf)</TableHead>
                  <TableHead className="text-pl-muted w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center h-32 text-pl-muted">
                      No items found matching your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((item) => (
                    <TableRow key={`${item.designation}-${item.grade}`} className="border-pl-border hover:bg-pl-sunken group transition-colors">
                      <TableCell className="text-pl-muted text-xs capitalize">{item.kind}</TableCell>
                      <TableCell className="font-bold text-pl-text font-pl-mono tabular-nums">{item.odIn}</TableCell>
                      <TableCell className="font-pl-mono tabular-nums text-pl-text">{item.weightLbFt}</TableCell>
                      <TableCell className="font-pl-mono tabular-nums text-pl-muted text-xs">{(item.wallM / 0.0254).toFixed(3)}</TableCell>
                      <TableCell className="font-pl-mono tabular-nums text-pl-muted text-xs">{(item.idM / 0.0254).toFixed(3)}</TableCell>
                      <TableCell>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-pl-sunken border border-pl-border text-pl-text">
                          {item.grade}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-pl-mono tabular-nums text-pl-text">{Math.round(paToPsi(item.burstPa)).toLocaleString()}</TableCell>
                      <TableCell className="text-right font-pl-mono tabular-nums text-pl-text">{Math.round(paToPsi(item.collapsePa)).toLocaleString()}</TableCell>
                      <TableCell className="text-pl-muted text-[10px]">{item.collapseRegime}</TableCell>
                      <TableCell className="text-right font-pl-mono tabular-nums text-pl-text">{Math.round(item.bodyYieldN / 4448.22 / 1000).toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        {onSelect && (
                          <Button
                            size="sm"
                            className="h-7 w-full transition-all opacity-0 group-hover:opacity-100"
                            onClick={() => { onSelect(item); onOpenChange(false); }}
                          >
                            Select
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>

        <div className="p-3 border-t border-pl-border flex justify-between items-center text-xs text-pl-muted">
          <span>Showing {rows.length} rows</span>
          <span className="flex items-center"><Database className="w-3 h-3 mr-1" /> API 5CT dims · engine-computed ratings (validated, see /help)</span>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CatalogBrowser;
