import React from 'react';
import { useDeclineCurve } from '@/contexts/DeclineCurveContext';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Play, Loader2 } from 'lucide-react';

const DCAModelFitting = () => {
  const { 
    selectedStream, 
    streamState, 
    updateStreamConfig,
    runFit,
    isFitting,
    fitWindow,
    setFitWindow
  } = useDeclineCurve();

  const config = streamState[selectedStream];

  const handleConstraintChange = (key, val) => {
    updateStreamConfig('constraints', { ...config.constraints, [key]: parseFloat(val) });
  };

  // Helper to safely format date for input[type="date"] (YYYY-MM-DD)
  const formatDateForInput = (dateVal) => {
    if (!dateVal) return '';
    try {
      // Handle Date objects directly
      if (dateVal instanceof Date) {
        return dateVal.toISOString().split('T')[0];
      }
      // Handle strings (ISO or other formats)
      const date = new Date(dateVal);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
      return '';
    } catch (e) {
      return '';
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Model Selection */}
      <div className="space-y-2">
        <Label>Decline Model</Label>
        <Select 
          value={config.modelType} 
          onValueChange={(val) => updateStreamConfig('modelType', val)}
        >
          <SelectTrigger className="bg-slate-800 border-slate-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
            <SelectItem value="Auto">Auto-Select (Best Fit)</SelectItem>
            <SelectItem value="Exponential">Arps Exponential</SelectItem>
            <SelectItem value="Hyperbolic">Arps Hyperbolic</SelectItem>
            <SelectItem value="Harmonic">Arps Harmonic</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Constraints */}
      {(config.modelType === 'Hyperbolic' || config.modelType === 'Auto') && (
        <div className="space-y-4 p-3 bg-slate-800/50 rounded border border-slate-800">
          <Label className="text-xs text-slate-400 uppercase">b-Factor Constraints</Label>
          
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px]">Min b</Label>
              <Input 
                type="number" 
                step="0.1"
                value={config.constraints.minB}
                onChange={(e) => handleConstraintChange('minB', e.target.value)}
                className="h-8 bg-slate-900 border-slate-700"
              />
            </div>
            <div>
              <Label className="text-[10px]">Max b</Label>
              <Input 
                type="number" 
                step="0.1"
                value={config.constraints.maxB}
                onChange={(e) => handleConstraintChange('maxB', e.target.value)}
                className="h-8 bg-slate-900 border-slate-700"
              />
            </div>
          </div>
        </div>
      )}

      {/* Fit Window */}
      <div className="space-y-2">
        <Label>Fit Window</Label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px] text-slate-400">Start Date</Label>
            <Input 
              type="date" 
              value={formatDateForInput(fitWindow.startDate)}
              onChange={(e) => setFitWindow(prev => ({...prev, startDate: e.target.value}))}
              className="bg-slate-800 border-slate-700 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px] text-slate-400">End Date</Label>
            <Input 
              type="date" 
              value={formatDateForInput(fitWindow.endDate)}
              onChange={(e) => setFitWindow(prev => ({...prev, endDate: e.target.value}))}
              className="bg-slate-800 border-slate-700 text-xs"
            />
          </div>
        </div>
      </div>

      {/* Fit Action */}
      <Button 
        onClick={runFit} 
        disabled={isFitting}
        className="w-full bg-blue-600 hover:bg-blue-500 transition-colors"
      >
        {isFitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
        {isFitting ? "Fitting..." : "Fit Model"}
      </Button>

    </div>
  );
};

export default DCAModelFitting;