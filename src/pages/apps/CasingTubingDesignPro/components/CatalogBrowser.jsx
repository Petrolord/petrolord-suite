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
      <DialogContent className="max-w-5xl h-[85vh] bg-slate-950 border-slate-800 text-white flex flex-col p-0 overflow-hidden shadow-2xl shadow-black/50">
        <div className="p-6 pb-4 border-b border-slate-800 bg-slate-900/50">
          <DialogHeader>
            <DialogTitle className="flex items-center text-xl text-white">
              <Database className="w-5 h-5 mr-3 text-purple-400" />
              Tubular Catalog
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              API 5CT dimensional rows; burst, collapse and yield computed live by the validated engine.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-4 mt-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <Input
                placeholder="Search by grade (e.g. L-80) or size..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 bg-slate-900 border-slate-700 text-sm focus:border-purple-500"
              />
            </div>
            {!kindFilter && (
              <div className="w-40">
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="bg-slate-900 border-slate-700 h-10">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700">
                    <SelectItem value="All">All</SelectItem>
                    <SelectItem value="casing">Casing</SelectItem>
                    <SelectItem value="tubing">Tubing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="w-32">
              <Select value={odFilter.toString()} onValueChange={setOdFilter}>
                <SelectTrigger className="bg-slate-900 border-slate-700 h-10">
                  <SelectValue placeholder="OD" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700">
                  {uniqueODs.map((od) => (
                    <SelectItem key={od} value={od.toString()}>{od === 'All' ? 'All Sizes' : `${od}"`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-hidden bg-slate-950">
          <ScrollArea className="h-full">
            <Table>
              <TableHeader className="sticky top-0 bg-slate-900 z-10 shadow-sm border-b border-slate-800">
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-400 font-semibold w-[70px]">Type</TableHead>
                  <TableHead className="text-slate-400 font-semibold">OD (in)</TableHead>
                  <TableHead className="text-slate-400 font-semibold">Weight (lb/ft)</TableHead>
                  <TableHead className="text-slate-400 font-semibold">Wall (in)</TableHead>
                  <TableHead className="text-slate-400 font-semibold">ID (in)</TableHead>
                  <TableHead className="text-slate-400 font-semibold">Grade</TableHead>
                  <TableHead className="text-slate-400 font-semibold text-right">Burst (psi)</TableHead>
                  <TableHead className="text-slate-400 font-semibold text-right">Collapse (psi)</TableHead>
                  <TableHead className="text-slate-400 font-semibold">Regime</TableHead>
                  <TableHead className="text-slate-400 font-semibold text-right">Body Yield (klbf)</TableHead>
                  <TableHead className="text-slate-400 w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center h-32 text-slate-500">
                      No items found matching your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((item) => (
                    <TableRow key={`${item.designation}-${item.grade}`} className="border-slate-800 hover:bg-slate-900/50 group transition-colors">
                      <TableCell className="text-slate-500 text-xs capitalize">{item.kind}</TableCell>
                      <TableCell className="font-bold text-white font-mono">{item.odIn}</TableCell>
                      <TableCell className="font-mono text-slate-300">{item.weightLbFt}</TableCell>
                      <TableCell className="font-mono text-slate-400 text-xs">{(item.wallM / 0.0254).toFixed(3)}</TableCell>
                      <TableCell className="font-mono text-slate-400 text-xs">{(item.idM / 0.0254).toFixed(3)}</TableCell>
                      <TableCell>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 border border-slate-700 text-slate-300">
                          {item.grade}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-emerald-400">{Math.round(paToPsi(item.burstPa)).toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono text-amber-400">{Math.round(paToPsi(item.collapsePa)).toLocaleString()}</TableCell>
                      <TableCell className="text-slate-500 text-[10px]">{item.collapseRegime}</TableCell>
                      <TableCell className="text-right font-mono text-blue-400">{Math.round(item.bodyYieldN / 4448.22 / 1000).toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        {onSelect && (
                          <Button
                            size="sm"
                            className="h-7 w-full bg-slate-800 hover:bg-purple-600 hover:text-white text-slate-400 transition-all opacity-0 group-hover:opacity-100"
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

        <div className="p-3 border-t border-slate-800 bg-slate-900 flex justify-between items-center text-xs text-slate-500">
          <span>Showing {rows.length} rows</span>
          <span className="flex items-center"><Database className="w-3 h-3 mr-1" /> API 5CT dims · engine-computed ratings (validated, see /help)</span>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CatalogBrowser;
