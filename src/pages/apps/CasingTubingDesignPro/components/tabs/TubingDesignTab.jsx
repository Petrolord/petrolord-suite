import React, { useState, useEffect } from 'react';
import { useCasingTubingDesign } from '../../contexts/CasingTubingDesignContext';
import TubingStringList from '../tubing/TubingStringList';
import TubingSectionsTable from '../tubing/TubingSectionsTable';
import TubingDetailedResultsTable from '../tubing/TubingDetailedResultsTable';
import PackerLoadsTable from '../tubing/PackerLoadsTable';
import TubingDesignSummary from '../tubing/TubingDesignSummary';
import PackerConfigPanel from '../tubing/PackerConfigPanel';
import { LoadProfileChart, TubingForcesChart } from '../charts/CtCharts';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ShieldAlert, ExternalLink, Wind } from 'lucide-react';
import TubingVisualizer from '../tubing/TubingVisualizer';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';

const PackerPanelBlock = () => (
  <>
    <PackerConfigPanel />
    <div className="bg-pl-surface border border-pl-border rounded-lg p-3 text-[10px] text-pl-muted space-y-1">
      <p className="text-pl-muted font-bold text-xs">How the deltas are built</p>
      <p>The landed condition is packer fluid balanced inside and out. Each operating case rebuilds the internal column (surface pressure + fluid gradient at the packer TVD) and takes the change from that baseline.</p>
    </div>
  </>
);

const TubingDesignTab = () => {
  const { caseDoc, results, depthUnit } = useCasingTubingDesign();

  const tubingStrings = caseDoc?.strings?.tubingStrings || [];
  const [selectedStringId, setSelectedStringId] = useState(null);
  const [viewMode, setViewMode] = useState('forces'); // forces, results, erosional

  useEffect(() => {
    if (tubingStrings.length > 0 && !tubingStrings.some((s) => s.id === selectedStringId)) {
      setSelectedStringId(tubingStrings[0].id);
    }
  }, [tubingStrings, selectedStringId]);

  const activeString = tubingStrings.find((s) => s.id === selectedStringId);
  const tubingResult = results?.tubing || null;
  const tubingCases = tubingResult?.cases || [];
  const failures = tubingCases.filter((c) => c.status !== 'PASS');

  return (
    <div className="flex flex-col h-full bg-pl-bg text-pl-text overflow-hidden m-0 p-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-pl-border bg-pl-surface shrink-0 h-10 mt-0">
        <span className="text-[10px] text-pl-muted">
          Lubinski force system: piston + ballooning + thermal at the packer, Dawson-Paslay buckling, PBR stroke check
        </span>
        <Tabs value={viewMode} onValueChange={setViewMode} className="h-7">
          <TabsList className="h-7 border p-0">
            <TabsTrigger value="forces" className="h-full text-xs px-3">Forces</TabsTrigger>
            <TabsTrigger value="results" className="h-full text-xs px-3">Tables</TabsTrigger>
            <TabsTrigger value="erosional" className="h-full text-xs px-3">Erosional</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: strings + sections + components */}
        <div className="w-[300px] flex flex-col border-r border-pl-border bg-pl-sunken py-0">
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-4">
            <TubingStringList selectedId={selectedStringId} onSelect={setSelectedStringId} />
            <div className="space-y-4">
              <TubingSectionsTable stringId={selectedStringId} />
              {/* D7: completion component architecture moved to Completion Design Studio */}
              <div className="rounded-md border border-pl-border bg-pl-surface p-2 text-[11px] text-pl-muted">
                Completion string architecture (jewelry, clearances, BOM) lives in{' '}
                <Link to="/dashboard/apps/drilling/completion-design-studio" className="text-pl-primary-text hover:text-pl-primary-text-hover hover:underline">
                  Completion Design Studio
                </Link>. The packer that drives the force analysis stays on the packer panel here.
              </div>
            </div>
          </div>
        </div>

        {/* Center */}
        <div className="flex-1 flex flex-col min-w-0 bg-pl-bg overflow-hidden">
          <div className="px-4 py-1 border-b border-pl-border bg-pl-surface">
            <TubingDesignSummary tubingResult={tubingResult} />
          </div>

          {failures.length > 0 && (
            <div className="px-4 py-1 bg-pl-surface border-b border-pl-border flex flex-wrap gap-2">
              {failures.map((c) => (
                <div key={c.loadCaseId} className={`flex items-center text-[10px] px-2 py-0.5 rounded border ${c.status === 'FAIL' ? 'bg-pl-danger-bg border-pl-danger/40 text-pl-danger-text' : 'bg-pl-warning-bg border-pl-warning/40 text-pl-warning-text'}`}>
                  <ShieldAlert className="w-3 h-3 mr-1.5" />
                  {c.name}: {c.status === 'FAIL'
                    ? (c.loads.packer.strokeOk === false ? 'seal stroke exceeded' : 'packer rating exceeded')
                    : `${c.loads.buckling.state} buckling`}
                </div>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-y-auto pt-0 px-4 pb-0 custom-scrollbar">
            <div className="2xl:hidden pt-4 grid gap-4 lg:grid-cols-2" data-testid="ct-packer-inline">
              <PackerPanelBlock />
            </div>
            {viewMode === 'forces' && (
              <div className="grid grid-cols-12 gap-4 h-full pt-4 pb-4">
                <div data-canvas="chart" className="col-span-4 h-full border border-pl-border rounded-lg overflow-hidden bg-white">
                  <TubingVisualizer activeString={activeString} packer={caseDoc?.packer} depthUnit={depthUnit} />
                </div>
                <div className="col-span-8 h-full min-h-[300px]">
                  <TubingForcesChart cases={tubingCases} />
                </div>
              </div>
            )}

            {viewMode === 'results' && (
              <div className="space-y-6 pt-4 pb-4">
                <div className="border border-pl-border rounded-lg overflow-hidden bg-pl-surface">
                  <div className="bg-pl-sunken px-4 py-2 border-b border-pl-border font-bold text-xs text-pl-text">Force System per Operating Case</div>
                  <TubingDetailedResultsTable cases={tubingCases} />
                </div>

                <div className="border border-pl-border rounded-lg overflow-hidden bg-pl-surface">
                  <div className="bg-pl-sunken px-4 py-2 border-b border-pl-border font-bold text-xs text-pl-text">Packer Loads</div>
                  <PackerLoadsTable cases={tubingCases} ratingN={caseDoc?.packer?.ratingN} />
                </div>
              </div>
            )}

            {viewMode === 'erosional' && (
              <div className="grid grid-cols-2 gap-4 pt-4 pb-4">
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <h4 className="text-xs font-bold text-pl-text flex items-center">
                      <Wind className="w-3.5 h-3.5 mr-2 text-pl-muted" /> API RP 14E Erosional Velocity
                    </h4>
                    {tubingResult?.erosional ? (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-pl-sunken p-3 rounded border border-pl-border">
                            <span className="text-[10px] text-pl-muted block">Ve = C/√ρ (C = {tubingResult.erosional.cFactor})</span>
                            <span className="text-lg font-pl-mono tabular-nums font-bold text-pl-text">
                              {tubingResult.erosional.veMs.toFixed(1)} m/s
                            </span>
                          </div>
                          <div className="bg-pl-sunken p-3 rounded border border-pl-border">
                            <span className="text-[10px] text-pl-muted block">Mixture density</span>
                            <span className="text-lg font-pl-mono tabular-nums text-pl-text">
                              {tubingResult.erosional.mixtureKgM3} kg/m³
                            </span>
                          </div>
                        </div>
                        <p className="text-[10px] text-pl-muted">
                          Keep the in-tubing mixture velocity below Ve for continuous service (C = 100 for solids-free continuous flow per API RP 14E). Set the mixture density on the Well &amp; Loads tab.
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-pl-muted">Define a tubing string and packer to compute the check.</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4 space-y-3">
                    <h4 className="text-xs font-bold text-pl-text">Flow Performance</h4>
                    <p className="text-xs text-pl-muted">
                      Tubing flow capacity, IPR/VLP matching and pressure traverses live in Nodal Analysis Studio, which shares the validated correlation set for the whole Suite.
                    </p>
                    <Link to="/dashboard/apps/production/nodal-analysis-studio" className="inline-flex items-center text-xs text-pl-primary-text hover:text-pl-primary-text-hover">
                      Open Nodal Analysis Studio <ExternalLink className="w-3 h-3 ml-1" />
                    </Link>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>

        {/* Right: packer config. CT-T1-004: inside the page's own two side
            panels this third column left the results about 160 px at 1366;
            below 2xl the packer panel moves into the centre flow instead. */}
        <div className="hidden 2xl:flex w-[300px] border-l border-pl-border bg-pl-sunken flex-col overflow-y-auto custom-scrollbar py-0">
          <div className="p-4 space-y-4">
            <PackerPanelBlock />
          </div>
        </div>
      </div>
    </div>
  );
};

export default TubingDesignTab;
