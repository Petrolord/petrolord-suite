import React from 'react';
import { useDeclineCurve } from '@/contexts/DeclineCurveContext';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Filter } from 'lucide-react';

// R1: real filters over what wells actually carry (name/tag search,
// fluid type, has-data). filteredWellIds in the context feeds every
// well list (grouping, type curves). Replaced the pre-R1 mock
// reservoir/lift dropdowns that filtered nothing.
const DCAWellFilters = () => {
  const { wells, wellFilters, setWellFilters, filteredWellIds } = useDeclineCurve();
  const totalWells = Object.keys(wells).length;

  const set = (patch) => setWellFilters(prev => ({ ...prev, ...patch }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-slate-400 mb-2">
        <div className="flex items-center gap-2">
          <Filter size={14} />
          <span className="text-xs font-medium uppercase tracking-wider">Well Filters</span>
        </div>
        <span className="text-[10px] text-slate-500">{filteredWellIds.length}/{totalWells}</span>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-slate-500">Search name or tag</Label>
        <Input
          value={wellFilters.search}
          onChange={(e) => set({ search: e.target.value })}
          placeholder="e.g. Alpha, pad-3"
          className="h-8 bg-slate-800 border-slate-700 text-xs"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-slate-500">Fluid type</Label>
        <Select value={wellFilters.fluidType} onValueChange={(v) => set({ fluidType: v })}>
          <SelectTrigger className="h-8 bg-slate-800 border-slate-700 text-xs">
            <SelectValue placeholder="All fluids" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All fluids</SelectItem>
            <SelectItem value="oil">Oil</SelectItem>
            <SelectItem value="gas">Gas</SelectItem>
            <SelectItem value="water">Water</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="dca-filter-hasdata"
          checked={wellFilters.onlyWithData}
          onCheckedChange={(v) => set({ onlyWithData: !!v })}
        />
        <Label htmlFor="dca-filter-hasdata" className="text-xs text-slate-400">
          Only wells with production data
        </Label>
      </div>
    </div>
  );
};

export default DCAWellFilters;
