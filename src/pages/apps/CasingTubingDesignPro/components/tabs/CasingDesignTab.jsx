import React, { useState, useEffect } from 'react';
import { useCasingTubingDesign } from '../../contexts/CasingTubingDesignContext';
import CasingStringList from '../casing/CasingStringList';
import DesignResultsTable from '../casing/DesignResultsTable';
import CasingVisualizer from '../casing/CasingVisualizer';
import DesignSummary from '../casing/DesignSummary';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Layers, Activity } from 'lucide-react';
import CasingSectionsTable from '../casing/CasingSectionsTable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const CasingDesignTab = () => {
  const { caseDoc, results, depthUnit } = useCasingTubingDesign();

  const casingStrings = caseDoc?.strings?.casingStrings || [];
  const casingLoadCases = (caseDoc?.loadCases || []).filter((lc) => lc.target !== 'tubing');
  const safetyFactors = caseDoc?.safetyFactors || {};

  const [selectedStringId, setSelectedStringId] = useState(null);
  const [activeLoadCaseId, setActiveLoadCaseId] = useState(null);

  useEffect(() => {
    if (casingStrings.length > 0 && !casingStrings.some((s) => s.id === selectedStringId)) {
      setSelectedStringId(casingStrings[0].id);
    }
  }, [casingStrings, selectedStringId]);

  useEffect(() => {
    if (casingLoadCases.length > 0 && !casingLoadCases.some((lc) => lc.id === activeLoadCaseId)) {
      setActiveLoadCaseId(casingLoadCases[0].id);
    }
  }, [casingLoadCases, activeLoadCaseId]);

  const activeString = casingStrings.find((s) => s.id === selectedStringId);
  const stringResult = results?.casing?.find((r) => r.stringId === selectedStringId) || null;
  const caseResult = stringResult?.cases?.find((c) => c.loadCaseId === activeLoadCaseId) || null;

  return (
    <div className="flex flex-col h-full bg-pl-bg text-pl-text overflow-hidden m-0 p-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-1.5 border-b border-pl-border bg-pl-surface shrink-0 h-10 mt-0">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <span className="text-[10px] uppercase text-pl-muted font-bold tracking-wider">Active Load Case</span>
            <Select value={activeLoadCaseId || ''} onValueChange={setActiveLoadCaseId}>
              <SelectTrigger data-testid="ct-load-case-picker" className="w-[220px] h-7 text-xs">
                <SelectValue placeholder="Select Load Case" />
              </SelectTrigger>
              <SelectContent>
                {casingLoadCases.map((lc) => (
                  <SelectItem key={lc.id} value={lc.id}>{lc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="h-6 w-px bg-pl-border mx-2" />

          <div className="flex items-center space-x-2 text-xs text-pl-muted">
            <span className="font-semibold text-pl-muted">Design Factors:</span>
            <span className="bg-pl-sunken px-2 py-0.5 rounded border border-pl-border" title="Burst">B: {safetyFactors.burst}</span>
            <span className="bg-pl-sunken px-2 py-0.5 rounded border border-pl-border" title="Collapse">C: {safetyFactors.collapse}</span>
            <span className="bg-pl-sunken px-2 py-0.5 rounded border border-pl-border" title="Tension">T: {safetyFactors.tension}</span>
            <span className="bg-pl-sunken px-2 py-0.5 rounded border border-pl-border" title="Triaxial">VME: {safetyFactors.triaxial}</span>
          </div>
        </div>

        <span className="text-[10px] text-pl-muted">
          Ratings: API Barlow burst / 5C3 four-regime collapse with axial derate / Lamé-VME triaxial
        </span>
      </div>

      {/* Main Workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: String Manager */}
        <div className="w-1/4 border-r border-pl-border bg-pl-surface flex flex-col min-w-[300px]">
          <div className="p-2 border-b border-pl-border">
            <h3 className="text-xs font-semibold text-pl-text px-2">Casing Strings</h3>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
            <CasingStringList selectedId={selectedStringId} onSelect={setSelectedStringId} />
          </div>
        </div>

        {/* Center: Editor & Results */}
        <div className="w-2/5 border-r border-pl-border flex flex-col bg-pl-bg min-w-[420px]">
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-pl-text mb-3 flex items-center">
                <Layers className="w-4 h-4 mr-2 text-pl-muted" />
                Section Configuration {activeString && ` - ${activeString.name}`}
              </h3>
              <CasingSectionsTable stringId={selectedStringId} />
            </div>

            <Separator />

            <div>
              <h3 className="text-sm font-semibold text-pl-text mb-3 flex items-center">
                <Activity className="w-4 h-4 mr-2 text-pl-muted" />
                Results: {caseResult ? caseResult.name : 'select a load case'}
              </h3>
              <DesignResultsTable caseResult={caseResult} depthUnit={depthUnit} />
            </div>
          </div>
        </div>

        {/* Right: Summary & Viz */}
        <div className="flex-1 bg-pl-surface flex flex-col min-w-[300px]">
          <div className="p-4 flex flex-col h-full space-y-4">
            <DesignSummary stringResult={stringResult} />

            <Card className="flex-1 flex flex-col overflow-hidden">
              <CardHeader className="py-2 px-4 border-b border-pl-border bg-pl-sunken">
                <CardTitle className="text-xs font-bold text-pl-muted uppercase tracking-wider">String Schematic</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 p-0 relative">
                <CasingVisualizer activeString={activeString} depthUnit={depthUnit} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CasingDesignTab;
