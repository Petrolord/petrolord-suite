import React, { useState } from 'react';
import { useCasingTubingDesign } from '../contexts/CasingTubingDesignContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ChevronRight, ChevronLeft, ShieldCheck, Database, Activity, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import CatalogBrowser from './CatalogBrowser';
import { fmtSF, nToKN, depthDisp, depthLabel } from '../services/ctRun';

const RightPanel = () => {
  const {
    caseDoc, setSafetyFactors, results, depthUnit,
  } = useCasingTubingDesign();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);

  const safetyFactors = caseDoc?.safetyFactors || {};
  const kpis = results?.kpis;
  const unit = depthLabel(depthUnit);

  if (isCollapsed) {
    return (
      <div className="w-14 bg-slate-950 border-l border-slate-800 flex flex-col items-center py-4 space-y-6 shrink-0 transition-all duration-300 z-10">
        <Button variant="ghost" size="icon" onClick={() => setIsCollapsed(false)} className="text-slate-400 hover:text-white">
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="h-px w-8 bg-slate-800" />
        <Button variant="ghost" size="icon" title="Design Factors">
          <ShieldCheck className="w-5 h-5 text-slate-400 hover:text-blue-400" />
        </Button>
        <Button variant="ghost" size="icon" title="KPIs">
          <Activity className="w-5 h-5 text-slate-400 hover:text-emerald-400" />
        </Button>
      </div>
    );
  }

  const sfField = (label, key, def) => (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <Label className="text-slate-400">{label}</Label>
        <span className="text-slate-500 font-mono text-[10px]">Default: {def}</span>
      </div>
      <Input
        type="number"
        step="0.05"
        value={safetyFactors[key] ?? def}
        onChange={(e) => setSafetyFactors({ [key]: parseFloat(e.target.value) })}
        className="h-8 bg-slate-950 border-slate-700 text-xs font-mono text-right"
      />
    </div>
  );

  const governing = kpis?.minCollapse && kpis?.minBurst
    ? (kpis.minCollapse.value < kpis.minBurst.value ? { ...kpis.minCollapse, mode: 'Collapse' } : { ...kpis.minBurst, mode: 'Burst' })
    : (kpis?.minBurst ? { ...kpis.minBurst, mode: 'Burst' } : null);

  return (
    <div className="w-80 bg-slate-950 border-l border-slate-800 flex flex-col shrink-0 transition-all duration-300 overflow-y-auto custom-scrollbar z-10">
      <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/30">
        <span className="text-sm font-semibold text-slate-200">Analysis Parameters</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsCollapsed(true)}>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </Button>
      </div>

      <div className="p-4 space-y-6">
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center">
            <Activity className="w-3 h-3 mr-2" /> Design KPIs
          </h4>
          {kpis ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-900 p-3 rounded border border-slate-800">
                <span className="text-[10px] text-slate-500 block mb-1">Min Burst SF</span>
                <span data-testid="ct-kpi-burst" className={`text-xl font-mono font-bold ${kpis.minBurst && kpis.minBurst.value < (safetyFactors.burst ?? 1.1) ? 'text-red-400' : 'text-emerald-400'}`}>
                  {fmtSF(kpis.minBurst?.value)}
                </span>
              </div>
              <div className="bg-slate-900 p-3 rounded border border-slate-800">
                <span className="text-[10px] text-slate-500 block mb-1">Min Coll SF</span>
                <span data-testid="ct-kpi-collapse" className={`text-xl font-mono font-bold ${kpis.minCollapse && kpis.minCollapse.value < (safetyFactors.collapse ?? 1.0) ? 'text-red-400' : 'text-amber-400'}`}>
                  {fmtSF(kpis.minCollapse?.value)}
                </span>
              </div>
              <div className="bg-slate-900 p-3 rounded border border-slate-800">
                <span className="text-[10px] text-slate-500 block mb-1">Min Triaxial SF</span>
                <span data-testid="ct-kpi-triaxial" className="text-sm font-mono text-white">{fmtSF(kpis.minTriaxial?.value)}</span>
              </div>
              <div className="bg-slate-900 p-3 rounded border border-slate-800">
                <span className="text-[10px] text-slate-500 block mb-1">Buoyed Weight</span>
                <span className="text-sm font-mono text-white">{Math.round(nToKN(kpis.totalCasingBuoyedN)).toLocaleString()} kN</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Select a design case to compute KPIs.</p>
          )}

          {governing && (
            <div className="bg-slate-900/50 p-3 rounded border border-slate-800/50 flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <span className="text-xs text-amber-200 font-medium block">Controlling Load</span>
                <span className="text-[10px] text-slate-400" data-testid="ct-controlling-load">
                  {governing.caseName} ({governing.mode}) — {governing.stringName}
                  {governing.tvdM != null && ` at ${Math.round(depthDisp(governing.tvdM, depthUnit))} ${unit} TVD`}
                </span>
              </div>
            </div>
          )}
        </div>

        <Separator className="bg-slate-800" />

        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-white flex items-center">
            <ShieldCheck className="w-4 h-4 mr-2 text-blue-400" /> Design Factors
          </h4>

          <div className="space-y-4 bg-slate-900/30 p-3 rounded border border-slate-800">
            {sfField('Burst Factor', 'burst', 1.1)}
            {sfField('Collapse Factor', 'collapse', 1.0)}
            {sfField('Tension Factor', 'tension', 1.6)}
            {sfField('Triaxial Factor', 'triaxial', 1.25)}
          </div>
        </div>

        <Separator className="bg-slate-800" />

        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-white flex items-center">
            <Database className="w-4 h-4 mr-2 text-purple-400" /> Catalog
          </h4>
          <Button
            variant="outline"
            className="w-full text-xs h-9 bg-slate-900 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
            onClick={() => setIsCatalogOpen(true)}
          >
            Browse Tubular Catalog
          </Button>
          <p className="text-[10px] text-slate-500">
            Ratings compute live from the validated Barlow / API 5C3 formulas. Connection efficiencies are nominal planning values; verify against the manufacturer data sheet.
          </p>
        </div>
      </div>

      <CatalogBrowser open={isCatalogOpen} onOpenChange={setIsCatalogOpen} />
    </div>
  );
};

export default RightPanel;
