import React, { useState } from 'react';
import { useCasingTubingDesign } from '../../contexts/CasingTubingDesignContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Copy, MoreVertical } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import AddCasingStringDialog from './AddCasingStringDialog';
import { depthDisp, depthLabel } from '../../services/ctRun';

const CasingStringList = ({ selectedId, onSelect }) => {
  const { caseDoc, setStrings, addLog, depthUnit } = useCasingTubingDesign();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const casingStrings = caseDoc?.strings?.casingStrings || [];
  const unit = depthLabel(depthUnit);

  const handleDelete = (id, e) => {
    e.stopPropagation();
    setStrings((prev) => ({
      ...prev,
      casingStrings: prev.casingStrings.filter((s) => s.id !== id),
    }));
    addLog('Casing string deleted.', 'warning');
  };

  const handleDuplicate = (str, e) => {
    e.stopPropagation();
    const stamp = Date.now();
    setStrings((prev) => ({
      ...prev,
      casingStrings: [...prev.casingStrings, {
        ...str,
        id: `cs-${stamp}`,
        name: `${str.name} (Copy)`,
        sections: str.sections.map((s, i) => ({ ...s, id: `sec-${stamp}-${i}` })),
      }],
    }));
    addLog('Casing string duplicated.');
  };

  return (
    <div className="space-y-3">
      <Button
        data-testid="ct-add-casing-string"
        className="w-full bg-lime-600 hover:bg-lime-700 text-white shadow-sm border border-lime-500/50"
        onClick={() => setIsAddDialogOpen(true)}
      >
        <Plus className="w-4 h-4 mr-2" /> Add Casing String
      </Button>

      <div className="space-y-2">
        {casingStrings.map((str) => {
          const top = Math.min(...str.sections.map((s) => s.topMdM));
          const bottom = Math.max(...str.sections.map((s) => s.bottomMdM));
          const od = str.sections[0]?.odIn;
          return (
            <Card
              key={str.id}
              className={`cursor-pointer transition-all border-l-4 ${
                selectedId === str.id
                  ? 'bg-slate-800 border-l-lime-500 border-y-slate-700 border-r-slate-700 shadow-md'
                  : 'bg-slate-900 border-l-slate-600 border-y-slate-800 border-r-slate-800 hover:bg-slate-800/50'
              }`}
              onClick={() => onSelect(str.id)}
            >
              <div className="p-3 flex justify-between items-start">
                <div>
                  <div className="flex items-center space-x-2">
                    <h4 className={`text-sm font-bold ${selectedId === str.id ? 'text-white' : 'text-slate-300'}`}>
                      {str.name}
                    </h4>
                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-slate-600 text-slate-400">
                      {str.sections?.length || 0} Sec
                    </Badge>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1 font-mono">
                    {Math.round(depthDisp(top, depthUnit))}-{Math.round(depthDisp(bottom, depthUnit))}{unit} • {od}&quot; OD
                  </div>
                  <div className="mt-2 flex items-center space-x-2 text-[10px]">
                    {[...new Set(str.sections.map((s) => s.grade))].map((g) => (
                      <span key={g} className="text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">{g}</span>
                    ))}
                  </div>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-slate-500 hover:text-white">
                      <MoreVertical className="w-3.5 h-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-slate-900 border-slate-700 text-slate-300" align="end">
                    <DropdownMenuItem onClick={(e) => handleDuplicate(str, e)}>
                      <Copy className="w-3.5 h-3.5 mr-2" /> Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-red-400 focus:text-red-300" onClick={(e) => handleDelete(str.id, e)}>
                      <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </Card>
          );
        })}

        {casingStrings.length === 0 && (
          <div className="text-center p-6 border-2 border-dashed border-slate-800 rounded-lg text-slate-600 text-xs">
            No casing strings defined.
          </div>
        )}
      </div>

      <AddCasingStringDialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen} />
    </div>
  );
};

export default CasingStringList;
