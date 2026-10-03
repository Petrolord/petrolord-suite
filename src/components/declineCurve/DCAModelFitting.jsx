import React from 'react';
import { useDeclineCurve } from '@/contexts/DeclineCurveContext';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Play, Loader2 } from 'lucide-react';
import DcaNumberField from '@/components/declineCurve/DcaNumberField';

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

  // PL11: an empty box or "0." stays as typed; a cleared field keeps the default
  const handleConstraintChange = (key, val, fallback) => {
    updateStreamConfig('constraints', { ...config.constraints, [key]: Number.isFinite(val) ? val : fallback });
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
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Auto">Auto-Select (Best Fit)</SelectItem>
            <SelectItem value="Exponential">Arps Exponential</SelectItem>
            <SelectItem value="Hyperbolic">Arps Hyperbolic</SelectItem>
            <SelectItem value="Harmonic">Arps Harmonic</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Constraints */}
      {(config.modelType === 'Hyperbolic' || config.modelType === 'Auto') && (
        <div className="space-y-4 p-3 bg-pl-sunken rounded border border-pl-border">
          <Label className="text-xs text-pl-muted uppercase">b-Factor Limits</Label>
          <p className="text-[10px] text-pl-muted">The hyperbolic fit searches b in steps of 0.05 between these limits. b above 1 implies transient or boundary-free flow and needs a terminal decline; see the help.</p>
          
          <div className="grid grid-cols-2 gap-2">
            <DcaNumberField id="dca-min-b" label="Min b" value={config.constraints.minB} emptyValue={0}
              onCommit={(v) => handleConstraintChange('minB', v, 0)} testId="dca-min-b" labelClassName="text-[10px]" />
            <DcaNumberField id="dca-max-b" label="Max b" value={config.constraints.maxB} emptyValue={1}
              onCommit={(v) => handleConstraintChange('maxB', v, 1)} testId="dca-max-b" labelClassName="text-[10px]" />
          </div>
        </div>
      )}

      {/* Fit Window */}
      <div className="space-y-2">
        <Label>Fit Window</Label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px] text-pl-muted">Start Date</Label>
            <Input 
              type="date" 
              value={formatDateForInput(fitWindow.startDate)}
              onChange={(e) => setFitWindow(prev => ({...prev, startDate: e.target.value}))}
              className="text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px] text-pl-muted">End Date</Label>
            <Input 
              type="date" 
              value={formatDateForInput(fitWindow.endDate)}
              onChange={(e) => setFitWindow(prev => ({...prev, endDate: e.target.value}))}
              className="text-xs"
            />
          </div>
        </div>
      </div>

      {/* Fit Action */}
      <Button 
        onClick={runFit} 
        disabled={isFitting}
        className="w-full"
      >
        {isFitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
        {isFitting ? "Fitting..." : "Fit Model"}
      </Button>

    </div>
  );
};

export default DCAModelFitting;