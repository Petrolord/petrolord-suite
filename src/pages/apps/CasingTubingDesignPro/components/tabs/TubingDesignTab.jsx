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
import CompletionComponentsList from '../tubing/CompletionComponentsList';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';

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
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden m-0 p-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-slate-800 bg-slate-900/50 shrink-0 h-10 mt-0">
        <span className="text-[10px] text-slate-500">
          Lubinski force system: piston + ballooning + thermal at the packer, Dawson-Paslay buckling, PBR stroke check
        </span>
        <Tabs value={viewMode} onValueChange={setViewMode} className="h-7">
          <TabsList className="h-7 bg-slate-900 border border-slate-800 p-0">
            <TabsTrigger value="forces" className="h-full text-xs px-3 data-[state=active]:bg-slate-800">Forces</TabsTrigger>
            <TabsTrigger value="results" className="h-full text-xs px-3 data-[state=active]:bg-slate-800">Tables</TabsTrigger>
            <TabsTrigger value="erosional" className="h-full text-xs px-3 data-[state=active]:bg-slate-800">Erosional</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: strings + sections + components */}
        <div className="w-[300px] flex flex-col border-r border-slate-800 bg-slate-950/50 py-0">
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-4">
            <TubingStringList selectedId={selectedStringId} onSelect={setSelectedStringId} />
            <div className="space-y-4">
              <TubingSectionsTable stringId={selectedStringId} />
              <CompletionComponentsList stringId={selectedStringId} />
            </div>
          </div>
        </div>

        {/* Center */}
        <div className="flex-1 flex flex-col min-w-0 bg-slate-950 overflow-hidden">
          <div className="px-4 py-1 border-b border-slate-800 bg-slate-900/20">
            <TubingDesignSummary tubingResult={tubingResult} />
          </div>

          {failures.length > 0 && (
            <div className="px-4 py-1 bg-slate-900/50 border-b border-slate-800 flex flex-wrap gap-2">
              {failures.map((c) => (
                <div key={c.loadCaseId} className={`flex items-center text-[10px] px-2 py-0.5 rounded border ${c.status === 'FAIL' ? 'bg-red-900/20 border-red-800 text-red-200' : 'bg-amber-900/20 border-amber-800 text-amber-200'}`}>
                  <ShieldAlert className="w-3 h-3 mr-1.5" />
                  {c.name}: {c.status === 'FAIL'
                    ? (c.loads.packer.strokeOk === false ? 'seal stroke exceeded' : 'packer rating exceeded')
                    : `${c.loads.buckling.state} buckling`}
                </div>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-y-auto pt-0 px-4 pb-0 custom-scrollbar">
            {viewMode === 'forces' && (
              <div className="grid grid-cols-12 gap-4 h-full pt-4 pb-4">
                <div className="col-span-3 h-full border border-slate-800 rounded-lg overflow-hidden bg-slate-900">
                  <TubingVisualizer activeString={activeString} packer={caseDoc?.packer} depthUnit={depthUnit} />
                </div>
                <div className="col-span-9 h-full min-h-[300px]">
                  <TubingForcesChart cases={tubingCases} />
                </div>
              </div>
            )}

            {viewMode === 'results' && (
              <div className="space-y-6 pt-4 pb-4">
                <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-900/50">
                  <div className="bg-slate-900 px-4 py-2 border-b border-slate-800 font-bold text-xs text-slate-300">Force System per Operating Case</div>
                  <TubingDetailedResultsTable cases={tubingCases} />
                </div>

                <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-900/50">
                  <div className="bg-slate-900 px-4 py-2 border-b border-slate-800 font-bold text-xs text-slate-300">Packer Loads</div>
                  <PackerLoadsTable cases={tubingCases} ratingN={caseDoc?.packer?.ratingN} />
                </div>
              </div>
            )}

            {viewMode === 'erosional' && (
              <div className="grid grid-cols-2 gap-4 pt-4 pb-4">
                <Card className="bg-slate-900/50 border-slate-800">
                  <CardContent className="p-4 space-y-3">
                    <h4 className="text-xs font-bold text-slate-300 flex items-center">
                      <Wind className="w-3.5 h-3.5 mr-2 text-cyan-400" /> API RP 14E Erosional Velocity
                    </h4>
                    {tubingResult?.erosional ? (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-slate-950/50 p-3 rounded border border-slate-800">
                            <span className="text-[10px] text-slate-500 block">Ve = C/√ρ (C = {tubingResult.erosional.cFactor})</span>
                            <span className="text-lg font-mono font-bold text-cyan-400">
                              {tubingResult.erosional.veMs.toFixed(1)} m/s
                            </span>
                          </div>
                          <div className="bg-slate-950/50 p-3 rounded border border-slate-800">
                            <span className="text-[10px] text-slate-500 block">Mixture density</span>
                            <span className="text-lg font-mono text-slate-200">
                              {tubingResult.erosional.mixtureKgM3} kg/m³
                            </span>
                          </div>
                        </div>
                        <p className="text-[10px] text-slate-500">
                          Keep the in-tubing mixture velocity below Ve for continuous service (C = 100 for solids-free continuous flow per API RP 14E). Set the mixture density on the Well &amp; Loads tab.
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-slate-500">Define a tubing string and packer to compute the check.</p>
                    )}
                  </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-slate-800">
                  <CardContent className="p-4 space-y-3">
                    <h4 className="text-xs font-bold text-slate-300">Flow Performance</h4>
                    <p className="text-xs text-slate-400">
                      Tubing flow capacity, IPR/VLP matching and pressure traverses live in Nodal Analysis Studio, which shares the validated correlation set for the whole Suite.
                    </p>
                    <Link to="/dashboard/apps/production/nodal-analysis-studio" className="inline-flex items-center text-xs text-lime-400 hover:text-lime-300">
                      Open Nodal Analysis Studio <ExternalLink className="w-3 h-3 ml-1" />
                    </Link>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>

        {/* Right: packer config */}
        <div className="w-[300px] border-l border-slate-800 bg-slate-950/50 flex flex-col overflow-y-auto custom-scrollbar py-0">
          <div className="p-4 space-y-4">
            <PackerConfigPanel />
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-[10px] text-slate-500 space-y-1">
              <p className="text-slate-400 font-bold text-xs">How the deltas are built</p>
              <p>The landed condition is packer fluid balanced inside and out. Each operating case rebuilds the internal column (surface pressure + fluid gradient at the packer TVD) and takes the change from that baseline.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TubingDesignTab;
