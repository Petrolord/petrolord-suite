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
  // Phone width: the panel opens collapsed so the work area keeps the screen.
  const [isCollapsed, setIsCollapsed] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 767px)').matches);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);

  const safetyFactors = caseDoc?.safetyFactors || {};
  const kpis = results?.kpis;
  const unit = depthLabel(depthUnit);

  if (isCollapsed) {
    return (
      <div className="w-14 bg-pl-surface border-l border-pl-border flex flex-col items-center py-4 space-y-6 shrink-0 transition-all duration-300 z-10">
        <Button variant="ghost" size="icon" onClick={() => setIsCollapsed(false)} className="text-pl-muted hover:text-pl-text">
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="h-px w-8 bg-pl-border" />
        <Button variant="ghost" size="icon" title="Design Factors">
          <ShieldCheck className="w-5 h-5 text-pl-muted hover:text-pl-text" />
        </Button>
        <Button variant="ghost" size="icon" title="KPIs">
          <Activity className="w-5 h-5 text-pl-muted hover:text-pl-text" />
        </Button>
      </div>
    );
  }

  const sfField = (label, key, def) => (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <Label className="text-pl-muted">{label}</Label>
        <span className="text-pl-muted font-pl-mono tabular-nums text-[10px]">Default: {def}</span>
      </div>
      <Input
        type="number"
        step="0.05"
        value={safetyFactors[key] ?? def}
        onChange={(e) => setSafetyFactors({ [key]: parseFloat(e.target.value) })}
        className="h-8 text-xs font-pl-mono tabular-nums text-right"
      />
    </div>
  );

  const governing = kpis?.minCollapse && kpis?.minBurst
    ? (kpis.minCollapse.value < kpis.minBurst.value ? { ...kpis.minCollapse, mode: 'Collapse' } : { ...kpis.minBurst, mode: 'Burst' })
    : (kpis?.minBurst ? { ...kpis.minBurst, mode: 'Burst' } : null);

  return (
    <div className="w-80 bg-pl-surface border-l border-pl-border flex flex-col shrink-0 transition-all duration-300 overflow-y-auto custom-scrollbar z-10">
      <div className="p-4 border-b border-pl-border flex justify-between items-center">
        <span className="text-sm font-semibold text-pl-text">Analysis Parameters</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsCollapsed(true)}>
          <ChevronRight className="w-4 h-4 text-pl-muted" />
        </Button>
      </div>

      <div className="p-4 space-y-6">
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-pl-muted uppercase flex items-center">
            <Activity className="w-3 h-3 mr-2" /> Design KPIs
          </h4>
          {kpis ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-pl-raised p-3 rounded border border-pl-border">
                <span className="text-[10px] text-pl-muted block mb-1">Min Burst SF</span>
                <span data-testid="ct-kpi-burst" className={`text-xl font-pl-mono tabular-nums font-bold ${kpis.minBurst && kpis.minBurst.value < (safetyFactors.burst ?? 1.1) ? 'text-pl-danger-text' : 'text-pl-success-text'}`}>
                  {fmtSF(kpis.minBurst?.value)}
                </span>
              </div>
              <div className="bg-pl-raised p-3 rounded border border-pl-border">
                <span className="text-[10px] text-pl-muted block mb-1">Min Coll SF</span>
                <span data-testid="ct-kpi-collapse" className={`text-xl font-pl-mono tabular-nums font-bold ${kpis.minCollapse && kpis.minCollapse.value < (safetyFactors.collapse ?? 1.0) ? 'text-pl-danger-text' : 'text-pl-success-text'}`}>
                  {fmtSF(kpis.minCollapse?.value)}
                </span>
              </div>
              <div className="bg-pl-raised p-3 rounded border border-pl-border">
                <span className="text-[10px] text-pl-muted block mb-1">Min Triaxial SF</span>
                <span data-testid="ct-kpi-triaxial" className="text-sm font-pl-mono tabular-nums text-pl-text">{fmtSF(kpis.minTriaxial?.value)}</span>
              </div>
              <div className="bg-pl-raised p-3 rounded border border-pl-border">
                <span className="text-[10px] text-pl-muted block mb-1">Buoyed Weight</span>
                <span className="text-sm font-pl-mono tabular-nums text-pl-text">{Math.round(nToKN(kpis.totalCasingBuoyedN)).toLocaleString()} kN</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-pl-muted">Select a design case to compute KPIs.</p>
          )}

          {governing && (
            <div className="bg-pl-warning-bg p-3 rounded border border-pl-warning/40 flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-pl-warning-text mt-0.5 shrink-0" />
              <div>
                <span className="text-xs text-pl-warning-text font-medium block">Controlling Load</span>
                <span className="text-[10px] text-pl-muted" data-testid="ct-controlling-load">
                  {governing.caseName} ({governing.mode}), {governing.stringName}
                  {governing.tvdM != null && ` at ${Math.round(depthDisp(governing.tvdM, depthUnit))} ${unit} TVD`}
                </span>
              </div>
            </div>
          )}
        </div>

        <Separator />

        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-pl-text flex items-center">
            <ShieldCheck className="w-4 h-4 mr-2 text-pl-muted" /> Design Factors
          </h4>

          <div className="space-y-4 bg-pl-sunken p-3 rounded border border-pl-border">
            {sfField('Burst Factor', 'burst', 1.1)}
            {sfField('Collapse Factor', 'collapse', 1.0)}
            {sfField('Tension Factor', 'tension', 1.6)}
            {sfField('Triaxial Factor', 'triaxial', 1.25)}
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-pl-text flex items-center">
            <Database className="w-4 h-4 mr-2 text-pl-muted" /> Catalog
          </h4>
          <Button
            variant="outline"
            className="w-full text-xs h-9"
            onClick={() => setIsCatalogOpen(true)}
          >
            Browse Tubular Catalog
          </Button>
          <p className="text-[10px] text-pl-muted">
            Ratings compute live from the validated Barlow / API 5C3 formulas. Connection efficiencies are nominal planning values; verify against the manufacturer data sheet.
          </p>
        </div>
      </div>

      <CatalogBrowser open={isCatalogOpen} onOpenChange={setIsCatalogOpen} />
    </div>
  );
};

export default RightPanel;
