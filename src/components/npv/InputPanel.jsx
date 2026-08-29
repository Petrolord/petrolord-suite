import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Wand2, MonitorPlay, Calculator, Loader2 } from 'lucide-react';
import QuickInput from './QuickInput';
import ExpertInput from './ExpertInput';
import { expandQuickInputs } from '@/utils/npvCalculations';

// Economics E2: mode and both input sets live on the page now, so a scenario
// can be saved and reopened. This panel edits what it is given.
const InputPanel = ({ onCalculate, loading, state, setState }) => {
  const { mode, quickData, expertData } = state;
  const setMode = (val) => setState((prev) => ({ ...prev, mode: val }));
  const setQuickData = (val) => setState((prev) => ({
    ...prev, quickData: typeof val === 'function' ? val(prev.quickData) : val,
  }));
  const setExpertData = (val) => setState((prev) => ({
    ...prev, expertData: typeof val === 'function' ? val(prev.expertData) : val,
  }));

  const handleCalculate = () => {
      if (mode === 'Quick') {
          // Convert simple inputs to full engine inputs
          const fullInputs = expandQuickInputs(quickData);
          onCalculate(fullInputs, 'Quick');
      } else {
          onCalculate(expertData, 'Expert');
      }
  };

  return (
    <div className="h-full flex flex-col space-y-4">
        {/* Mode Toggle */}
        <div className="flex justify-center">
            <div className="bg-slate-900 p-1 rounded-lg border border-slate-800 inline-flex">
                <ToggleGroup type="single" value={mode} onValueChange={(val) => val && setMode(val)}>
                    <ToggleGroupItem value="Quick" className="data-[state=on]:bg-lime-600 data-[state=on]:text-white px-4 py-2 text-sm transition-all">
                        <Wand2 className="w-4 h-4 mr-2" /> Quick Mode
                    </ToggleGroupItem>
                    <ToggleGroupItem value="Expert" className="data-[state=on]:bg-purple-600 data-[state=on]:text-white px-4 py-2 text-sm transition-all">
                        <MonitorPlay className="w-4 h-4 mr-2" /> Expert Mode
                    </ToggleGroupItem>
                </ToggleGroup>
            </div>
        </div>

        {/* Input Area */}
        <div className="flex-1 overflow-y-auto px-1">
            {mode === 'Quick' ? (
                <QuickInput data={quickData} onChange={setQuickData} />
            ) : (
                <ExpertInput data={expertData} onChange={setExpertData} />
            )}
        </div>

        {/* Action Footer */}
        <div className="pt-4 border-t border-slate-800">
            <Button 
                onClick={handleCalculate} 
                disabled={loading}
                className={`w-full h-12 text-lg font-semibold shadow-lg ${mode === 'Quick' ? 'bg-gradient-to-r from-lime-600 to-green-600 hover:from-lime-500 hover:to-green-500' : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500'}`}
            >
                {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <><Calculator className="w-5 h-5 mr-2" /> Calculate Economics</>}
            </Button>
        </div>
    </div>
  );
};

export default InputPanel;