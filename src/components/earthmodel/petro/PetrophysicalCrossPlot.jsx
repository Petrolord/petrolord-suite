
import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const PetrophysicalCrossPlot = () => {
  return (
    <Card className="h-full bg-slate-900 border-slate-800 flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-white text-sm">Cross-Plot Analysis</CardTitle>
        <div className="flex gap-2">
          <Select defaultValue="phi">
            <SelectTrigger className="w-[100px] h-8 text-xs bg-slate-950 border-slate-700"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-800">
              <SelectItem value="phi">Porosity</SelectItem>
              <SelectItem value="den">Density</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-slate-500 self-center">vs</span>
          <Select defaultValue="perm">
            <SelectTrigger className="w-[100px] h-8 text-xs bg-slate-950 border-slate-700"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-800">
              <SelectItem value="perm">Permeability</SelectItem>
              <SelectItem value="sw">Saturation</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 flex items-center justify-center text-slate-500">
        Chart removed
      </CardContent>
    </Card>
  );
};

export default PetrophysicalCrossPlot;
