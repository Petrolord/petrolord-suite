import React, { useState, useMemo } from 'react';
import { useDeclineCurve } from '@/contexts/DeclineCurveContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Save, Trash2, TrendingUp, BarChart2 } from 'lucide-react';
import DCATypeCurvePlot from './DCATypeCurvePlot';

const DCATypeCurve = () => {
  const { 
    wells, 
    createTypeCurve, 
    typeCurves, 
    selectedTypeCurve, 
    setSelectedTypeCurve,
    deleteTypeCurve,
    applyTypeCurveToWell
  } = useDeclineCurve();

  const [newCurveName, setNewCurveName] = useState('');
  const [selectedWells, setSelectedWells] = useState([]);
  const [normMethod, setNormMethod] = useState('TimeAndRate');
  const [isCreating, setIsCreating] = useState(false);
  const [applyTargetWellId, setApplyTargetWellId] = useState('');
  const [isApplying, setIsApplying] = useState(false);

  const wellList = Object.values(wells);

  const handleToggleWell = (wellId) => {
    setSelectedWells(prev => 
      prev.includes(wellId) 
        ? prev.filter(id => id !== wellId) 
        : [...prev, wellId]
    );
  };

  const handleCreate = async () => {
    if (!newCurveName || selectedWells.length === 0) return;
    setIsCreating(true);
    
    await createTypeCurve({
      name: newCurveName,
      wellIds: selectedWells,
      normalizationMethod: normMethod,
      modelType: 'Hyperbolic' // Default
    });

    setIsCreating(false);
    setNewCurveName('');
    setSelectedWells([]);
  };

  const handleApply = async () => {
    if (!activeCurve || !applyTargetWellId) return;
    setIsApplying(true);
    try {
      applyTypeCurveToWell({ typeCurveId: activeCurve.id, targetWellId: applyTargetWellId });
    } finally {
      setIsApplying(false);
    }
  };

  const activeCurve = typeCurves.find(tc => tc.id === selectedTypeCurve);

  return (
    <div className="h-full flex flex-col space-y-4">
      {/* Header / Toolbar */}
      <div className="flex items-center justify-between p-2 bg-slate-800 rounded-md">
        <div className="flex items-center gap-2">
          <TrendingUp size={18} className="text-purple-400" />
          <h3 className="text-sm font-semibold text-slate-100">Type Curve Analysis</h3>
        </div>
        <div className="flex gap-2">
          <Select value={selectedTypeCurve || ''} onValueChange={setSelectedTypeCurve}>
            <SelectTrigger className="w-[200px] h-8 bg-slate-900 border-slate-700 text-xs">
              <SelectValue placeholder="Select Type Curve" />
            </SelectTrigger>
            <SelectContent>
              {typeCurves.map(tc => (
                <SelectItem key={tc.id} value={tc.id}>{tc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedTypeCurve && (
            <Button 
              variant="destructive" 
              size="icon" 
              className="h-8 w-8"
              onClick={() => deleteTypeCurve(selectedTypeCurve)}
            >
              <Trash2 size={14} />
            </Button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0">
        
        {/* Left: Creation & Selection */}
        <Card className="bg-slate-900 border-slate-800 flex flex-col overflow-hidden">
          <CardHeader className="py-3 px-4 border-b border-slate-800 bg-slate-800/50">
            <CardTitle className="text-xs font-medium text-slate-300 uppercase tracking-wider">Create New Curve</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-4 flex flex-col gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Name</Label>
              <Input 
                value={newCurveName} 
                onChange={(e) => setNewCurveName(e.target.value)} 
                placeholder="e.g. Eagle Ford High GOR"
                className="h-8 bg-slate-950 border-slate-800"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Normalization</Label>
              <Select value={normMethod} onValueChange={setNormMethod}>
                <SelectTrigger className="h-8 bg-slate-950 border-slate-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TimeOnly">Time Only (Rate Absolute)</SelectItem>
                  <SelectItem value="RateOnly">Rate Only (Time Absolute)</SelectItem>
                  <SelectItem value="TimeAndRate">Time & Rate (Fully Normalized)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 flex flex-col min-h-0 space-y-2">
              <Label className="text-xs">Select Wells ({selectedWells.length})</Label>
              <div className="flex-1 border border-slate-800 rounded-md bg-slate-950 overflow-hidden">
                <ScrollArea className="h-full p-2">
                  {wellList.map(well => (
                    <div key={well.id} className="flex items-center gap-2 py-1.5 px-2 hover:bg-slate-900 rounded cursor-pointer" onClick={() => handleToggleWell(well.id)}>
                      <Checkbox 
                        checked={selectedWells.includes(well.id)} 
                        onCheckedChange={() => handleToggleWell(well.id)}
                        id={`well-${well.id}`}
                      />
                      <span className="text-xs text-slate-300 truncate">{well.name}</span>
                    </div>
                  ))}
                </ScrollArea>
              </div>
            </div>

            <Button onClick={handleCreate} disabled={isCreating || !newCurveName || selectedWells.length < 2} className="w-full bg-purple-600 hover:bg-purple-500">
              {isCreating ? 'Fitting...' : 'Create & Fit Curve'}
            </Button>
          </CardContent>
        </Card>

        {/* Center/Right: Plot & Results */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {activeCurve ? (
            <>
              {/* Plot */}
              <Card className="flex-1 bg-slate-900 border-slate-800 flex flex-col min-h-[400px]">
                <CardHeader className="py-2 px-4 border-b border-slate-800 flex flex-row justify-between items-center bg-slate-800/50">
                  <CardTitle className="text-xs font-medium text-slate-300">Type Curve Plot: {activeCurve.name}</CardTitle>
                  <Badge variant="outline" className="bg-slate-800 border-purple-500/50 text-purple-400">
                    {activeCurve.fit?.quality || 'N/A'} Fit
                  </Badge>
                </CardHeader>
                <CardContent className="flex-1 p-0 relative">
                  <DCATypeCurvePlot typeCurve={activeCurve} />
                </CardContent>
              </Card>

              {/* Stats Footer */}
              <div className="grid grid-cols-4 gap-2">
                <div className="bg-slate-800 p-2 rounded border border-slate-700">
                  <div className="text-[10px] text-slate-400">Avg Qi</div>
                  <div className="text-sm font-mono text-emerald-400">{activeCurve.fit?.qi.toFixed(3)}</div>
                </div>
                <div className="bg-slate-800 p-2 rounded border border-slate-700">
                  <div className="text-[10px] text-slate-400">Avg Di</div>
                  <div className="text-sm font-mono text-blue-400">{activeCurve.fit?.Di.toFixed(3)}</div>
                </div>
                <div className="bg-slate-800 p-2 rounded border border-slate-700">
                  <div className="text-[10px] text-slate-400">b-Factor</div>
                  <div className="text-sm font-mono text-purple-400">{activeCurve.fit?.b.toFixed(2)}</div>
                </div>
                <div className="bg-slate-800 p-2 rounded border border-slate-700">
                  <div className="text-[10px] text-slate-400">R²</div>
                  <div className="text-sm font-mono text-orange-400">{activeCurve.fit?.R2.toFixed(3)}</div>
                </div>
              </div>

              {/* Apply Type Curve to Target Well */}
              <Card className="bg-slate-900 border-slate-800">
                <CardHeader className="py-3 px-4 border-b border-slate-800 bg-slate-800/50">
                  <CardTitle className="text-xs font-medium text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <BarChart2 size={14} className="text-emerald-400" />
                    Apply To Well
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  <div className="text-[11px] text-slate-400">
                    Holds b={activeCurve.fit.b.toFixed(2)} from this type curve, fits qi and Di to the target well's history.
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Target Well</Label>
                      <Select value={applyTargetWellId} onValueChange={setApplyTargetWellId}>
                        <SelectTrigger className="h-8 bg-slate-950 border-slate-800">
                          <SelectValue placeholder="Choose a well..." />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.values(wells).map(w => (
                            <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      onClick={handleApply}
                      disabled={isApplying || !applyTargetWellId}
                      className="h-8 bg-emerald-700 hover:bg-emerald-600 text-xs"
                    >
                      {isApplying ? 'Applying...' : 'Apply Curve'}
                    </Button>
                  </div>

                  {/* Applications list */}
                  {activeCurve.applications && Object.keys(activeCurve.applications).length > 0 && (
                    <div className="mt-2 border-t border-slate-800 pt-3">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">Applied To ({Object.keys(activeCurve.applications).length})</div>
                      <div className="space-y-1.5">
                        {Object.entries(activeCurve.applications).map(([wellId, app]) => (
                          <div key={wellId} className="grid grid-cols-5 gap-2 items-center text-xs bg-slate-800/40 rounded px-2 py-1.5 border border-slate-800">
                            <div className="text-slate-300 truncate">{app.targetWellName}</div>
                            <div className="font-mono text-emerald-400">qi: {app.result.qi.toFixed(0)}</div>
                            <div className="font-mono text-orange-400">Di: {(app.result.Di*365*100).toFixed(1)}%/yr</div>
                            <div className="font-mono text-blue-400">R²: {app.result.R2.toFixed(3)}</div>
                            <div>
                              <Badge variant="outline" className={
                                app.result.quality === 'Good' ? 'border-emerald-500/50 text-emerald-400 text-[10px]' :
                                app.result.quality === 'Fair' ? 'border-amber-500/50 text-amber-400 text-[10px]' :
                                'border-red-500/50 text-red-400 text-[10px]'
                              }>{app.result.quality}</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="h-full flex items-center justify-center bg-slate-900/50 border border-dashed border-slate-800 rounded-lg text-slate-500 text-sm">
              Select or create a type curve to view analysis
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DCATypeCurve;