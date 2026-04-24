
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle, ShieldCheck, TrendingUp, Users, Target, Box as Cube, Download, Settings, ChevronRight, Maximize2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import Select from 'react-select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import WellTrajectory3DView from '../components/WellTrajectory3DView';

const getRiskLevel = (sf, rules) => {
    if (sf < rules.criticalSf) return 'Critical';
    if (sf < rules.warningSf) return 'Warning';
    return 'Safe';
};

const getBadgeColor = (level) => {
    if (level === 'Critical') return 'bg-red-500/20 text-red-500 border-red-500/30';
    if (level === 'Warning') return 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30';
    return 'bg-green-500/20 text-green-500 border-green-500/30';
};

const TravelingCylinderPlot = ({ plotData, currentDepth, depthUnit }) => {
    if (!plotData || !plotData.series) return null;
    return (
        <div className="w-full h-full flex items-center justify-center text-slate-500 bg-white rounded">
            Chart removed
        </div>
    );
};

const AntiCollisionTab = ({ wellId, user }) => {
  const [projectWells, setProjectWells] = useState([]);
  const [selectedForAnalysis, setSelectedForAnalysis] = useState([]);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingWells, setLoadingWells] = useState(true);
  const { toast } = useToast();
  const [plotData, setPlotData] = useState(null);
  const [currentDepth, setCurrentDepth] = useState(0);
  const [maxDepth, setMaxDepth] = useState(0);
  const [wellDetails, setWellDetails] = useState({});
  const [referenceWellData, setReferenceWellData] = useState(null);
  const [offsetWellsData, setOffsetWellsData] = useState([]);
  const [activeTab, setActiveTab] = useState('summary');
  
  // Settings
  const [rules, setRules] = useState({
      warningSf: 1.5,
      criticalSf: 1.25,
      scanRadius: 500, // meters
      uncertaintyModel: 'ISCWSA'
  });

  const fetchProjectWells = useCallback(async () => {
    if (!user || !wellId) return;

    setLoadingWells(true);
    try {
        const { data: wellsData, error: wellsError } = await supabase
          .from('wells')
          .select('id, name, depth_unit')
          .eq('user_id', user.id);
        
        if (wellsError) throw wellsError;

        const wellsWithSurveyStatus = await Promise.all(
            (wellsData || []).map(async (well) => {
                const { count, error } = await supabase
                    .from('trajectory_plans')
                    .select('id', { count: 'exact', head: true })
                    .eq('well_id', well.id);
                
                if(error) return { ...well, has_survey: false };
                return { ...well, has_survey: count > 0 };
            })
        );
        
        const wellMap = wellsWithSurveyStatus.reduce((acc, well) => {
            acc[well.id] = well;
            return acc;
        }, {});

        setWellDetails(wellMap);
        setProjectWells(wellsWithSurveyStatus.filter(w => w.id !== wellId));
    } catch (error) {
         toast({ variant: 'destructive', title: 'Error fetching project wells', description: error.message });
    } finally {
        setLoadingWells(false);
    }
  }, [user, wellId, toast]);

  useEffect(() => {
    if (user && wellId) fetchProjectWells();
  }, [user, wellId, fetchProjectWells]);
  
  const handleRunCheck = async () => {
    if (selectedForAnalysis.length === 0) {
      toast({ variant: 'destructive', title: 'No offset wells selected.' });
      return;
    }
    setLoading(true);
    setResults(null);
    setPlotData(null);
    setOffsetWellsData([]);

    try {
        const { data: refPlan, error: refPlanError } = await supabase
            .from('trajectory_plans')
            .select('id, stations')
            .eq('well_id', wellId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (refPlanError || !refPlan) throw new Error("No trajectory plan found for reference well.");
        
        const refWellInfo = wellDetails[wellId];
        setReferenceWellData({ id: wellId, name: refWellInfo?.name || 'Reference', stations: refPlan.stations });

        const offsetWellIds = selectedForAnalysis.map(o => o.value);

        const { data: offsetPlans, error: offsetPlansError } = await supabase
            .from('trajectory_plans')
            .select('well_id, stations')
            .in('well_id', offsetWellIds)
            .order('created_at', { ascending: false });

        if (offsetPlansError) throw offsetPlansError;
        
        const latestOffsetPlans = offsetWellIds.map(id => {
            const plan = offsetPlans.find(p => p.well_id === id);
            const wellInfo = wellDetails[id];
            return { id, name: wellInfo?.name || `Offset ${id}`, stations: plan?.stations || [] };
        });
        
        const { data, error } = await supabase.functions.invoke('anti-collision-guardian', {
            body: JSON.stringify({
                reference_plan_id: refPlan.id,
                offset_well_ids: offsetWellIds,
                ref_well_radius_m: 5,
                offset_well_radius_m: 5,
                rules
            }),
        });

        if (error) throw error;
        if (data.error) throw new Error(data.error);

        const processedResults = data.summary.map(res => {
            const risk = getRiskLevel(res.min_sf, rules);
            return { ...res, riskLevel: risk };
        });

        const coloredOffsetWells = latestOffsetPlans.map(well => {
            const res = processedResults.find(r => r.offset_well_id === well.id);
            const risk = res ? res.riskLevel : 'Safe';
            const color = risk === 'Critical' ? '#ef4444' : risk === 'Warning' ? '#eab308' : '#22c55e';
            return { ...well, color };
        });

        setResults(processedResults);
        setPlotData(data.plots);
        setOffsetWellsData(coloredOffsetWells);

        const refStations = refPlan.stations || [];
        const maxMd = refStations.length > 0 ? refStations[refStations.length - 1].MD : 0;
        setMaxDepth(maxMd);
        setCurrentDepth(0);

        toast({ title: 'Analysis Complete', description: `${processedResults.length} offsets analyzed.` });

    } catch (error) {
        toast({ variant: 'destructive', title: 'Analysis Failed', description: error.message });
    } finally {
        setLoading(false);
    }
  };
  
  const customStyles = {
    control: (styles) => ({ ...styles, backgroundColor: '#1f2937', borderColor: '#4b5563' }),
    menu: (styles) => ({ ...styles, backgroundColor: '#1f2937', zIndex: 100 }),
    option: (styles, { isFocused, isDisabled }) => ({ 
        ...styles, 
        backgroundColor: isDisabled ? '#111827' : isFocused ? '#374151' : '#1f2937', 
        color: isDisabled ? '#6b7280' : '#f3f4f6',
        cursor: isDisabled ? 'not-allowed' : 'default',
    }),
    multiValue: (styles) => ({ ...styles, backgroundColor: '#374151' }),
    multiValueLabel: (styles) => ({ ...styles, color: '#f3f4f6' }),
  };

  const wellOptions = useMemo(() => projectWells.map(w => ({
      value: w.id,
      label: `${w.name} ${w.has_survey ? '✔️' : '(No Plan)'}`,
      isDisabled: !w.has_survey,
  })), [projectWells]);
  
  const referenceWell = wellDetails[wellId];
  const depthUnit = referenceWell?.depth_unit === 'feet' ? 'ft' : 'm';
  const METERS_TO_FEET = 3.28084;
  const convertDepth = (val) => (depthUnit === 'ft' ? val * METERS_TO_FEET : val);

  const criticalCount = results?.filter(r => r.riskLevel === 'Critical').length || 0;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full flex flex-col gap-4">
      {/* Header / Toolbar */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 bg-slate-900/50 p-4 rounded-xl border border-slate-800 shrink-0">
        <div className="flex-1 min-w-[300px]">
            <Label className="text-slate-400 text-xs uppercase font-bold mb-2 block">Offset Wells</Label>
            {loadingWells ? <Loader2 className="animate-spin text-lime-400" /> : (
                <Select
                    isMulti
                    options={wellOptions}
                    onChange={setSelectedForAnalysis}
                    styles={customStyles}
                    className="text-white text-sm"
                    placeholder="Select offsets..."
                />
            )}
        </div>
        
        <div className="flex items-end gap-2">
            <Sheet>
                <SheetTrigger asChild>
                    <Button variant="outline" className="border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300">
                        <Settings className="w-4 h-4 mr-2" /> Rules
                    </Button>
                </SheetTrigger>
                <SheetContent className="bg-slate-900 border-slate-800 text-white">
                    <SheetHeader><SheetTitle className="text-white">Analysis Rules</SheetTitle></SheetHeader>
                    <div className="py-6 space-y-4">
                        <div>
                            <Label>Critical Separation Factor</Label>
                            <Input type="number" step="0.05" value={rules.criticalSf} onChange={e => setRules({...rules, criticalSf: parseFloat(e.target.value)})} className="bg-slate-800 border-slate-700 mt-1" />
                        </div>
                        <div>
                            <Label>Warning Separation Factor</Label>
                            <Input type="number" step="0.05" value={rules.warningSf} onChange={e => setRules({...rules, warningSf: parseFloat(e.target.value)})} className="bg-slate-800 border-slate-700 mt-1" />
                        </div>
                        <div>
                            <Label>Scan Radius (m)</Label>
                            <Input type="number" value={rules.scanRadius} onChange={e => setRules({...rules, scanRadius: parseFloat(e.target.value)})} className="bg-slate-800 border-slate-700 mt-1" />
                        </div>
                        <div>
                            <Label>Uncertainty Model</Label>
                            <Select 
                                value={{value: rules.uncertaintyModel, label: rules.uncertaintyModel}} 
                                options={[{value: 'ISCWSA', label: 'ISCWSA Standard'}, {value: 'Cone', label: 'Simple Cone'}]}
                                onChange={v => setRules({...rules, uncertaintyModel: v.value})}
                                styles={customStyles}
                                className="mt-1"
                            />
                        </div>
                    </div>
                </SheetContent>
            </Sheet>

            <Button onClick={handleRunCheck} disabled={loading || selectedForAnalysis.length === 0} className="bg-[#4CAF50] hover:bg-[#43a047] text-white shadow-lg shadow-green-900/20">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                Run Analysis
            </Button>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="flex-1 bg-slate-900/50 rounded-xl border border-slate-800 flex flex-col overflow-hidden">
        {results ? (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
                <div className="flex items-center justify-between p-2 border-b border-slate-800 bg-slate-900 px-4">
                    <TabsList className="bg-slate-800">
                        <TabsTrigger value="summary">Summary Table</TabsTrigger>
                        <TabsTrigger value="plots">Diagnostic Plots</TabsTrigger>
                        <TabsTrigger value="3d">3D Visualization</TabsTrigger>
                    </TabsList>
                    
                    {criticalCount > 0 && (
                        <div className="flex items-center text-red-400 bg-red-900/20 px-3 py-1 rounded-full border border-red-500/20">
                            <AlertTriangle className="w-4 h-4 mr-2" />
                            <span className="text-xs font-bold">{criticalCount} Critical Risks Detected</span>
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-hidden p-0 relative">
                    <TabsContent value="summary" className="h-full overflow-auto m-0 p-4">
                        <Table>
                            <TableHeader className="bg-slate-800/50 sticky top-0">
                                <TableRow className="border-slate-700 hover:bg-transparent">
                                    <TableHead className="text-slate-300">Offset Well</TableHead>
                                    <TableHead className="text-slate-300">Status</TableHead>
                                    <TableHead className="text-slate-300 text-right">Min SF</TableHead>
                                    <TableHead className="text-slate-300 text-right">Min Dist ({depthUnit})</TableHead>
                                    <TableHead className="text-slate-300 text-right">@ Depth ({depthUnit})</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {results.map((res, i) => (
                                    <TableRow key={i} className="border-slate-800 hover:bg-slate-800/50 group">
                                        <TableCell className="font-medium text-white">{wellDetails[res.offset_well_id]?.name}</TableCell>
                                        <TableCell>
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${getBadgeColor(res.riskLevel)}`}>
                                                {res.riskLevel.toUpperCase()}
                                            </span>
                                        </TableCell>
                                        <TableCell className={`text-right font-mono font-bold ${res.riskLevel === 'Critical' ? 'text-red-400' : 'text-slate-300'}`}>
                                            {res.min_sf.toFixed(2)}
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-slate-300">{convertDepth(res.min_separation_m).toFixed(2)}</TableCell>
                                        <TableCell className="text-right font-mono text-slate-400">{convertDepth(res.ref_md_at_min_sep_m).toFixed(0)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TabsContent>

                    <TabsContent value="plots" className="h-full overflow-auto m-0 p-4 space-y-4">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-[500px]">
                            <div className="bg-white rounded-lg p-2 shadow-sm border border-slate-200 flex items-center justify-center text-slate-500">
                                Chart removed
                            </div>
                            <div className="bg-white rounded-lg p-2 shadow-sm border border-slate-200 flex items-center justify-center text-slate-500">
                                Chart removed
                            </div>
                        </div>
                        <div className="bg-white rounded-lg p-4 shadow-sm border border-slate-200 h-[600px] flex flex-col">
                            <div className="flex-1 min-h-0">
                                <TravelingCylinderPlot plotData={plotData} currentDepth={currentDepth} depthUnit={depthUnit} />
                            </div>
                            <div className="mt-4 px-8 pb-4">
                                <div className="flex justify-between text-sm font-bold text-slate-600 mb-2">
                                    <span>Surface</span>
                                    <span>Scanning Depth: {currentDepth.toFixed(0)} {depthUnit}</span>
                                    <span>TD</span>
                                </div>
                                <Slider
                                    min={0}
                                    max={maxDepth}
                                    step={maxDepth/100}
                                    value={[currentDepth]}
                                    onValueChange={(v) => setCurrentDepth(v[0])}
                                    className="cursor-pointer"
                                />
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="3d" className="h-full m-0 bg-black">
                        <WellTrajectory3DView 
                            planResult={referenceWellData?.stations}
                            offsetWells={offsetWellsData}
                            exaggeration={5}
                        />
                    </TabsContent>
                </div>
            </Tabs>
        ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
                <div className="bg-slate-800 p-6 rounded-full mb-4 ring-1 ring-slate-700">
                    <ShieldCheck className="w-12 h-12 text-slate-600" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">Ready for Analysis</h3>
                <p className="max-w-md text-center text-slate-400">Select offset wells above and click 'Run Analysis' to calculate separation factors and identify collision risks.</p>
            </div>
        )}
      </div>
    </motion.div>
  );
};

export default AntiCollisionTab;
