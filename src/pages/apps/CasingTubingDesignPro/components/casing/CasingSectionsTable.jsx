// CT-T1-003 (senior test T1): the table scrolls rather than clips at 1366 with both side panels open.
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
import { EMPTY_VALUE } from '@/lib/emptyValue';

// Section editor: depths are inline-editable (display unit), tubular
// identity comes ONLY from the catalog browser — engine ratings render
// live from the validated 5C3/Barlow formulas.
const CasingSectionsTable = ({ stringId }) => {
  const { caseDoc, setStrings, depthUnit } = useCasingTubingDesign();
  const [catalogFor, setCatalogFor] = useState(null); // section id or 'new'
  const unit = depthLabel(depthUnit);

  const activeString = (caseDoc?.strings?.casingStrings || []).find((s) => s.id === stringId);
  if (!activeString) {
    return <div className="text-xs text-pl-muted italic p-4">Select a casing string to view sections.</div>;
  }

  const patchSection = (secId, patch) => {
    setStrings((prev) => ({
      ...prev,
      casingStrings: prev.casingStrings.map((s) => (s.id !== stringId ? s : {
        ...s,
        sections: s.sections.map((sec) => (sec.id === secId ? { ...sec, ...patch } : sec)),
      })),
    }));
  };

  const deleteSection = (secId) => {
    setStrings((prev) => ({
      ...prev,
      casingStrings: prev.casingStrings.map((s) => (s.id !== stringId ? s : {
        ...s,
        sections: s.sections.filter((sec) => sec.id !== secId),
      })),
    }));
  };

  const addSectionFromCatalog = (item) => {
    const bottom = Math.max(...activeString.sections.map((s) => s.bottomMdM), 0);
    setStrings((prev) => ({
      ...prev,
      casingStrings: prev.casingStrings.map((s) => (s.id !== stringId ? s : {
        ...s,
        sections: [...s.sections, {
          id: `sec-${Date.now()}`,
          name: `Sec ${s.sections.length + 1}`,
          topMdM: bottom,
          bottomMdM: bottom + 500,
          odIn: item.odIn,
          weightLbFt: item.weightLbFt,
          grade: item.grade,
          connection: item.connection || 'BTC',
          kind: 'casing',
        }],
      })),
    }));
  };

  const handleCatalogSelect = (item) => {
    if (catalogFor === 'new') addSectionFromCatalog(item);
    else if (catalogFor) {
      patchSection(catalogFor, {
        odIn: item.odIn,
        weightLbFt: item.weightLbFt,
        grade: item.grade,
        connection: item.connection || 'BTC',
      });
    }
    setCatalogFor(null);
  };

  return (
    <div className="space-y-2">
      <div className="rounded-md border border-pl-border bg-pl-surface overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-pl-border hover:bg-transparent">
              <TableHead className="h-8 text-[10px] font-bold text-pl-muted">Section</TableHead>
              <TableHead className="h-8 text-[10px] font-bold text-pl-muted text-right">Top MD ({unit})</TableHead>
              <TableHead className="h-8 text-[10px] font-bold text-pl-muted text-right">Bottom MD ({unit})</TableHead>
              <TableHead className="h-8 text-[10px] font-bold text-pl-muted">Tubular</TableHead>
              <TableHead className="h-8 text-[10px] font-bold text-pl-muted text-right">Burst (psi)</TableHead>
              <TableHead className="h-8 text-[10px] font-bold text-pl-muted text-right">Collapse (psi)</TableHead>
              <TableHead className="h-8 text-[10px] font-bold text-pl-muted w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activeString.sections.map((sec) => {
              const row = findCatalogRow('casing', sec.odIn, sec.weightLbFt);
              const ratings = row ? catalogRatings(row, sec.grade, sec.connection) : null;
              return (
                <TableRow key={sec.id} className="border-pl-border hover:bg-pl-sunken h-9">
                  <TableCell className="py-1 text-xs font-medium text-pl-text">{sec.name}</TableCell>
                  <TableCell className="py-1 text-right w-24">
                    <Input
                      type="number"
                      value={Math.round(depthDisp(sec.topMdM, depthUnit))}
                      onChange={(e) => patchSection(sec.id, { topMdM: depthStore(parseFloat(e.target.value) || 0, depthUnit) })}
                      className="h-6 min-w-[72px] text-[11px] font-pl-mono tabular-nums text-right px-1"
                    />
                  </TableCell>
                  <TableCell className="py-1 text-right w-24">
                    <Input
                      type="number"
                      value={Math.round(depthDisp(sec.bottomMdM, depthUnit))}
                      onChange={(e) => patchSection(sec.id, { bottomMdM: depthStore(parseFloat(e.target.value) || 0, depthUnit) })}
                      className="h-6 min-w-[72px] text-[11px] font-pl-mono tabular-nums text-right px-1"
                    />
                  </TableCell>
                  <TableCell className="py-1">
                    <button
                      type="button"
                      className="text-[11px] font-pl-mono tabular-nums text-pl-primary-text hover:text-pl-primary-text-hover hover:underline"
                      onClick={() => setCatalogFor(sec.id)}
                      title="Pick from catalog"
                    >
                      {sec.odIn}&quot; {sec.weightLbFt}# {sec.grade} {sec.connection}
                    </button>
                  </TableCell>
                  <TableCell className="py-1 text-xs font-pl-mono tabular-nums text-pl-text text-right">
                    {ratings ? Math.round(paToPsi(ratings.burstPa)).toLocaleString() : EMPTY_VALUE}
                  </TableCell>
                  <TableCell className="py-1 text-xs font-pl-mono tabular-nums text-pl-text text-right">
                    {ratings ? Math.round(paToPsi(ratings.collapsePa)).toLocaleString() : EMPTY_VALUE}
                  </TableCell>
                  <TableCell className="py-1 text-right">
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-pl-muted hover:text-pl-danger-text" onClick={() => deleteSection(sec.id)}>
                      <Trash className="w-3 h-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={() => setCatalogFor('new')}
      >
        <Database className="w-3.5 h-3.5 mr-2" /> Add Section from Catalog
      </Button>

      <CatalogBrowser
        open={catalogFor != null}
        onOpenChange={(o) => { if (!o) setCatalogFor(null); }}
        onSelect={handleCatalogSelect}
        kindFilter="casing"
      />
    </div>
  );
};

export default CasingSectionsTable;
