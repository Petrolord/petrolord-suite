import React, { useState } from 'react';
import { useCasingTubingDesign } from '../../contexts/CasingTubingDesignContext';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Plus, Trash } from 'lucide-react';
import AddCompletionComponentDialog from './AddCompletionComponentDialog';
import { depthDisp, depthLabel } from '../../services/ctRun';

// Schematic completion hardware on the tubing string (markers for the
// drawing; D7 Completion Design absorbs the real equipment modeling).
const CompletionComponentsList = ({ stringId }) => {
  const { caseDoc, setStrings, depthUnit } = useCasingTubingDesign();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const activeString = (caseDoc?.strings?.tubingStrings || []).find((s) => s.id === stringId);
  const unit = depthLabel(depthUnit);

  if (!activeString) return null;

  const handleDelete = (compId) => {
    setStrings((prev) => ({
      ...prev,
      tubingStrings: prev.tubingStrings.map((str) => (str.id !== stringId ? str : {
        ...str,
        components: (str.components || []).filter((c) => c.id !== compId),
      })),
    }));
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center px-1">
        <h3 className="text-sm font-semibold text-slate-300">Completion Components</h3>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs border-lime-600 text-lime-400 hover:bg-lime-600 hover:text-white"
          onClick={() => setIsAddDialogOpen(true)}
        >
          <Plus className="w-3 h-3 mr-1" /> Add
        </Button>
      </div>

      <div className="rounded-md border border-slate-800 bg-slate-900/50 overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-900">
            <TableRow className="border-slate-800 hover:bg-transparent">
              <TableHead className="h-8 text-[10px] font-bold text-slate-400">Type</TableHead>
              <TableHead className="h-8 text-[10px] font-bold text-slate-400 text-right">MD ({unit})</TableHead>
              <TableHead className="h-8 text-[10px] font-bold text-slate-400 text-right">OD (in)</TableHead>
              <TableHead className="h-8 w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(!activeString.components || activeString.components.length === 0) ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-xs text-slate-500 py-4 italic">
                  No components added.
                </TableCell>
              </TableRow>
            ) : (
              activeString.components.map((comp) => (
                <TableRow key={comp.id} className="border-slate-800 hover:bg-slate-800/50 h-8">
                  <TableCell className="py-1 text-xs font-medium text-slate-200" title={comp.description || ''}>
                    {comp.type}
                  </TableCell>
                  <TableCell className="py-1 text-xs font-mono text-slate-400 text-right">
                    {Math.round(depthDisp(comp.depthMdM || 0, depthUnit))}
                  </TableCell>
                  <TableCell className="py-1 text-xs font-mono text-slate-400 text-right">{comp.odIn ?? '—'}</TableCell>
                  <TableCell className="py-1 text-right">
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-500 hover:text-red-400" onClick={() => handleDelete(comp.id)}>
                      <Trash className="w-3 h-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AddCompletionComponentDialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen} stringId={stringId} />
    </div>
  );
};

export default CompletionComponentsList;
