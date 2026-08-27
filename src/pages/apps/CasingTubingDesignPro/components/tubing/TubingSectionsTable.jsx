import React, { useState } from 'react';
import { useCasingTubingDesign } from '../../contexts/CasingTubingDesignContext';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash, Database } from 'lucide-react';
import CatalogBrowser from '../CatalogBrowser';
import {
  findCatalogRow, catalogRatings, paToPsi, depthDisp, depthStore, depthLabel,
} from '../../services/ctRun';

const TubingSectionsTable = ({ stringId }) => {
  const { caseDoc, setStrings, depthUnit } = useCasingTubingDesign();
  const [catalogFor, setCatalogFor] = useState(null);
  const unit = depthLabel(depthUnit);

  const activeString = (caseDoc?.strings?.tubingStrings || []).find((s) => s.id === stringId);
  if (!activeString) {
    return <div className="text-xs text-slate-500 italic p-4">Select a tubing string to view sections.</div>;
  }

  const patchSection = (secId, patch) => {
    setStrings((prev) => ({
      ...prev,
      tubingStrings: prev.tubingStrings.map((s) => (s.id !== stringId ? s : {
        ...s,
        sections: s.sections.map((sec) => (sec.id === secId ? { ...sec, ...patch } : sec)),
      })),
    }));
  };

  const deleteSection = (secId) => {
    setStrings((prev) => ({
      ...prev,
      tubingStrings: prev.tubingStrings.map((s) => (s.id !== stringId ? s : {
        ...s,
        sections: s.sections.filter((sec) => sec.id !== secId),
      })),
    }));
  };

  const handleCatalogSelect = (item) => {
    if (catalogFor && catalogFor !== 'new') {
      patchSection(catalogFor, {
        odIn: item.odIn,
        weightLbFt: item.weightLbFt,
        grade: item.grade,
        connection: item.connection || 'EUE',
      });
    }
    setCatalogFor(null);
  };

  return (
    <div className="space-y-2 mb-6">
      <h3 className="text-sm font-semibold text-slate-300 px-1">Tubing Sections</h3>
      <div className="rounded-md border border-slate-800 bg-slate-900/50 overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-900">
            <TableRow className="border-slate-800 hover:bg-transparent">
              <TableHead className="h-8 text-[10px] font-bold text-slate-400">Section</TableHead>
              <TableHead className="h-8 text-[10px] font-bold text-slate-400 text-right">Top ({unit})</TableHead>
              <TableHead className="h-8 text-[10px] font-bold text-slate-400 text-right">Bottom ({unit})</TableHead>
              <TableHead className="h-8 text-[10px] font-bold text-slate-400">Tubular</TableHead>
              <TableHead className="h-8 text-[10px] font-bold text-slate-400 text-right">Burst (psi)</TableHead>
              <TableHead className="h-8 text-[10px] font-bold text-slate-400 w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activeString.sections.map((sec) => {
              const row = findCatalogRow('tubing', sec.odIn, sec.weightLbFt);
              const ratings = row ? catalogRatings(row, sec.grade, sec.connection) : null;
              return (
                <TableRow key={sec.id} className="border-slate-800 hover:bg-slate-800/50 h-9">
                  <TableCell className="py-1 text-xs font-medium text-slate-200">{sec.name}</TableCell>
                  <TableCell className="py-1 text-right w-20">
                    <Input
                      type="number"
                      value={Math.round(depthDisp(sec.topMdM, depthUnit))}
                      onChange={(e) => patchSection(sec.id, { topMdM: depthStore(parseFloat(e.target.value) || 0, depthUnit) })}
                      className="h-6 bg-slate-950 border-slate-800 text-[11px] font-mono text-right px-1"
                    />
                  </TableCell>
                  <TableCell className="py-1 text-right w-20">
                    <Input
                      type="number"
                      value={Math.round(depthDisp(sec.bottomMdM, depthUnit))}
                      onChange={(e) => patchSection(sec.id, { bottomMdM: depthStore(parseFloat(e.target.value) || 0, depthUnit) })}
                      className="h-6 bg-slate-950 border-slate-800 text-[11px] font-mono text-right px-1"
                    />
                  </TableCell>
                  <TableCell className="py-1">
                    <button
                      type="button"
                      className="text-[11px] font-mono text-lime-400 hover:text-lime-300 hover:underline"
                      onClick={() => setCatalogFor(sec.id)}
                      title="Pick from catalog"
                    >
                      {sec.odIn}&quot; {sec.weightLbFt}# {sec.grade}
                    </button>
                  </TableCell>
                  <TableCell className="py-1 text-xs font-mono text-emerald-400 text-right">
                    {ratings ? Math.round(paToPsi(ratings.burstPa)).toLocaleString() : '—'}
                  </TableCell>
                  <TableCell className="py-1 text-right">
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-500 hover:text-red-400" onClick={() => deleteSection(sec.id)}>
                      <Trash className="w-3 h-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <CatalogBrowser
        open={catalogFor != null}
        onOpenChange={(o) => { if (!o) setCatalogFor(null); }}
        onSelect={handleCatalogSelect}
        kindFilter="tubing"
      />
    </div>
  );
};

export default TubingSectionsTable;
