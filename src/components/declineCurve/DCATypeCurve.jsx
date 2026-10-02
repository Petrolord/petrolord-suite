import { formatNominalAnnual, describeNominalAnnual, DI_BASIS_LABEL } from '@/utils/declineCurve/declineDisplay';
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
    // min-h-full (not h-full): fills the viewport when content is short but
    // grows past it when a curve is active, letting the parent column scroll
    // instead of clipping the stats and apply panels.
    <div className="min-h-full flex flex-col space-y-4">
      {/* Header / Toolbar */}
      <div className="flex flex-wrap gap-2 items-center justify-between p-2 bg-pl-surface border border-pl-border rounded-md shadow-pl-sm">
        <div className="flex items-center gap-2">
          <TrendingUp size={18} className="text-pl-primary-text" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-pl-text">Type Curve Analysis</h3>
        </div>
        <div className="flex gap-2">
          <Select value={selectedTypeCurve || ''} onValueChange={setSelectedTypeCurve}>
            <SelectTrigger className="w-[200px] h-8 text-xs">
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
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4">
        
        {/* Left: Creation & Selection */}
        <Card className="flex flex-col overflow-hidden">
          <CardHeader className="py-3 px-4 border-b border-pl-border bg-pl-sunken">
            <CardTitle className="text-xs font-medium text-pl-text uppercase tracking-wider">Create New Curve</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-4 flex flex-col gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Name</Label>
              <Input 
                value={newCurveName} 
                onChange={(e) => setNewCurveName(e.target.value)} 
                placeholder="e.g. Eagle Ford High GOR"
                className="h-8"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Normalization</Label>
              <Select value={normMethod} onValueChange={setNormMethod}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TimeOnly">Time Only (Rate Absolute)</SelectItem>
                  <SelectItem value="RateOnly">Rate Only (Time Absolute)</SelectItem>
                  <SelectItem value="TimeAndRate">Time & Rate (Fully Normalized)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 flex flex-col space-y-2">
              <Label className="text-xs">Select Wells ({selectedWells.length})</Label>
              {/* Explicit min height: the card's height is now content-driven
                  (the page scrolls), so the list needs its own floor to keep
                  the ScrollArea from collapsing. */}
              <div className="flex-1 min-h-[200px] border border-pl-border rounded-md bg-pl-surface overflow-hidden">
                <ScrollArea className="h-full p-2">
                  {wellList.map(well => (
                    <div key={well.id} className="flex items-center gap-2 py-1.5 px-2 hover:bg-pl-sunken rounded cursor-pointer" onClick={() => handleToggleWell(well.id)}>
                      <Checkbox 
                        checked={selectedWells.includes(well.id)} 
                        onCheckedChange={() => handleToggleWell(well.id)}
                        id={`well-${well.id}`}
                      />
                      <span className="text-xs text-pl-text truncate">{well.name}</span>
                    </div>
                  ))}
                </ScrollArea>
              </div>
            </div>

            <Button onClick={handleCreate} disabled={isCreating || !newCurveName || selectedWells.length < 2} className="w-full">
              {isCreating ? 'Fitting...' : 'Create & Fit Curve'}
            </Button>
          </CardContent>
        </Card>

        {/* Center/Right: Plot & Results */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {activeCurve ? (
            <>
              {/* Plot. Same height floor as the Model Fit chart (480px), and
                  the plot sits in an absolutely positioned inset because the
                  card's height is min-h/stretch driven: Recharts'
                  ResponsiveContainer needs a definite-height ancestor or it
                  collapses to zero. */}
              <Card className="flex-1 flex flex-col min-h-[480px]">
                <CardHeader className="py-2 px-4 border-b border-pl-border flex flex-row justify-between items-center bg-pl-sunken">
                  <CardTitle className="text-xs font-medium text-pl-text">Type Curve Plot: {activeCurve.name}</CardTitle>
                  <Badge variant="secondary">
                    {activeCurve.fit?.quality || 'N/A'} Fit
                  </Badge>
                </CardHeader>
                <CardContent className="flex-1 p-0 relative">
                  <div className="absolute inset-0">
                    <DCATypeCurvePlot typeCurve={activeCurve} />
                  </div>
                </CardContent>
              </Card>

              {/* Stats Footer */}
              <div className="grid grid-cols-4 gap-2">
                <div className="bg-pl-surface p-2 rounded border border-pl-border shadow-pl-sm">
                  <div className="text-[10px] text-pl-muted">Avg Qi</div>
                  <div className="text-sm font-pl-mono tabular-nums text-pl-text">{activeCurve.fit?.qi.toFixed(3)}</div>
                </div>
                <div className="bg-pl-surface p-2 rounded border border-pl-border shadow-pl-sm">
                  <div className="text-[10px] text-pl-muted">Avg Di ({DI_BASIS_LABEL})</div>
                  <div className="text-sm font-pl-mono tabular-nums text-pl-text">{formatNominalAnnual(activeCurve.fit?.Di, 1)}</div>
                </div>
                <div className="bg-pl-surface p-2 rounded border border-pl-border shadow-pl-sm">
                  <div className="text-[10px] text-pl-muted">b-Factor</div>
                  <div className="text-sm font-pl-mono tabular-nums text-pl-text">{activeCurve.fit?.b.toFixed(2)}</div>
                </div>
                <div className="bg-pl-surface p-2 rounded border border-pl-border shadow-pl-sm">
                  <div className="text-[10px] text-pl-muted">R²</div>
                  <div className="text-sm font-pl-mono tabular-nums text-pl-text">{activeCurve.fit?.R2.toFixed(3)}</div>
                </div>
              </div>

              {/* Apply Type Curve to Target Well */}
              <Card>
                <CardHeader className="py-3 px-4 border-b border-pl-border bg-pl-sunken">
                  <CardTitle className="text-xs font-medium text-pl-text uppercase tracking-wider flex items-center gap-2">
                    <BarChart2 size={14} className="text-pl-muted" aria-hidden="true" />
                    Apply To Well
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  <div className="text-[11px] text-pl-muted">
                    Holds b={activeCurve.fit.b.toFixed(2)} from this type curve, fits qi and Di to the target well's history.
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Target Well</Label>
                      <Select value={applyTargetWellId} onValueChange={setApplyTargetWellId}>
                        <SelectTrigger className="h-8">
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
                      className="h-8 text-xs"
                    >
                      {isApplying ? 'Applying...' : 'Apply Curve'}
                    </Button>
                  </div>

                  {/* Applications list */}
                  {activeCurve.applications && Object.keys(activeCurve.applications).length > 0 && (
                    <div className="mt-2 border-t border-pl-border pt-3">
                      <div className="text-[10px] text-pl-muted uppercase tracking-wider mb-2">Applied To ({Object.keys(activeCurve.applications).length})</div>
                      <div className="space-y-1.5">
                        {Object.entries(activeCurve.applications).map(([wellId, app]) => (
                          <div key={wellId} className="grid grid-cols-5 gap-2 items-center text-xs bg-pl-surface rounded px-2 py-1.5 border border-pl-border">
                            <div className="text-pl-text truncate">{app.targetWellName}</div>
                            <div className="font-pl-mono tabular-nums text-pl-text">qi: {app.result.qi.toFixed(0)}</div>
                            <div className="font-pl-mono tabular-nums text-pl-text">Di: {describeNominalAnnual(app.result.Di, 1)}</div>
                            <div className="font-pl-mono tabular-nums text-pl-text">R²: {app.result.R2.toFixed(3)}</div>
                            <div>
                              <Badge className="text-[10px]" variant={
                                app.result.quality === 'Good' ? 'success' :
                                app.result.quality === 'Fair' ? 'warning' : 'danger'
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
            <div className="h-full flex items-center justify-center bg-pl-surface border border-dashed border-pl-border-strong rounded-lg text-pl-muted text-sm">
              Select or create a type curve to view analysis
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DCATypeCurve;