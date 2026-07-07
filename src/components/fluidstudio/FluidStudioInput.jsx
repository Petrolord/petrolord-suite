import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MinusCircle, PlusCircle, Atom, SlidersHorizontal, Beaker } from 'lucide-react';

const InputField = ({ label, id, value, onChange, unit, type = 'number', step = 'any', placeholder, hint }) => (
  <div>
    <Label htmlFor={id} className="text-sm font-medium text-slate-300">{label}</Label>
    <div className="flex items-center mt-1">
      <Input id={id} type={type} value={value ?? ''} onChange={onChange} step={step} placeholder={placeholder} className="bg-slate-800 border-slate-600 text-white" />
      {unit && <span className="ml-2 text-sm text-slate-400">{unit}</span>}
    </div>
    {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
  </div>
);

// A disabled tab trigger with a "Phase 2" badge, for deferred capabilities whose
// input seams are preserved in state but not yet wired to the engine.
const Phase2Trigger = ({ value, children }) => (
  <TabsTrigger value={value} disabled className="opacity-50">
    {children}
    <span className="ml-1.5 text-[9px] uppercase tracking-wide bg-slate-700 text-slate-300 rounded px-1 py-0.5">Phase 2</span>
  </TabsTrigger>
);

const FluidStudioInput = ({ inputs, setInputs }) => {
  const streamA = inputs.streamA.blackOil;
  const correlations = inputs.correlations ?? { pb_rs_bo: 'standing', viscosity: 'beggs_robinson' };

  const handleStreamChange = (field, value) => {
    setInputs((prev) => ({
      ...prev,
      streamA: { ...prev.streamA, blackOil: { ...prev.streamA.blackOil, [field]: value === '' ? null : Number(value) } },
    }));
  };

  const handleCorrelationChange = (field, value) => {
    setInputs((prev) => ({ ...prev, correlations: { ...(prev.correlations ?? {}), [field]: value } }));
  };

  const handleFeedChange = (value) => {
    setInputs((prev) => ({ ...prev, feed: { ...(prev.feed ?? {}), oilRate: value === '' ? null : Number(value) } }));
  };

  const handleSeparatorChange = (index, field, value) => {
    const newStages = inputs.separatorTrain.stages.map((s, i) => (i === index ? { ...s, [field]: value === '' ? null : Number(value) } : s));
    setInputs((prev) => ({ ...prev, separatorTrain: { ...prev.separatorTrain, stages: newStages } }));
  };

  const toggleSeparatorStage = (index) => {
    const newStages = inputs.separatorTrain.stages.map((s, i) => (i === index ? { ...s, enabled: !s.enabled } : s));
    setInputs((prev) => ({ ...prev, separatorTrain: { ...prev.separatorTrain, stages: newStages } }));
  };

  return (
    <div className="space-y-4 h-full flex flex-col">
      <h2 className="text-2xl font-bold text-white mb-2">Analysis Setup</h2>
      <p className="text-xs text-slate-400 -mt-2">Results recompute instantly as you type.</p>
      <Tabs defaultValue="stream-a" className="flex-grow flex flex-col">
        <TabsList className="flex flex-wrap h-auto justify-start bg-slate-800">
          <TabsTrigger value="stream-a">Stream A</TabsTrigger>
          <TabsTrigger value="correlations">Correlations</TabsTrigger>
          <TabsTrigger value="separators">Separators</TabsTrigger>
          <Phase2Trigger value="composition">Composition</Phase2Trigger>
          <Phase2Trigger value="blending">Blending</Phase2Trigger>
          <Phase2Trigger value="batch-run">Batch</Phase2Trigger>
          <Phase2Trigger value="flow-assurance">Flow Assurance</Phase2Trigger>
        </TabsList>
        <div className="flex-grow mt-4 overflow-y-auto">
          <TabsContent value="stream-a">
            <div className="space-y-4 p-1">
              <h3 className="text-lg font-semibold text-lime-300 flex items-center"><Beaker className="w-5 h-5 mr-2" />Stream A — black-oil properties</h3>
              <InputField label="API Gravity" id="api" value={streamA.api} onChange={(e) => handleStreamChange('api', e.target.value)} unit="°API" />
              <InputField label="Solution GOR (Rsb)" id="gor" value={streamA.gor} onChange={(e) => handleStreamChange('gor', e.target.value)} unit="scf/STB" />
              <InputField label="Gas Specific Gravity" id="gasSg" value={streamA.gasSg} onChange={(e) => handleStreamChange('gasSg', e.target.value)} unit="air=1" />
              <InputField label="Reservoir Temperature" id="temp" value={streamA.temp} onChange={(e) => handleStreamChange('temp', e.target.value)} unit="°F" />
              <InputField label="Bubble Point (optional)" id="pb" value={streamA.pb} onChange={(e) => handleStreamChange('pb', e.target.value)} unit="psia" placeholder="auto" hint="Leave blank to solve Pb from the GOR." />
              <InputField label="Water Salinity" id="salinity" value={streamA.salinity} onChange={(e) => handleStreamChange('salinity', e.target.value)} unit="ppm" />
            </div>
          </TabsContent>

          <TabsContent value="correlations">
            <div className="space-y-4 p-1">
              <h3 className="text-lg font-semibold text-lime-300 flex items-center"><SlidersHorizontal className="w-5 h-5 mr-2" />PVT correlations</h3>
              <div>
                <Label className="text-sm font-medium text-slate-300">Rs / Bo / Pb correlation</Label>
                <Select value={correlations.pb_rs_bo} onValueChange={(v) => handleCorrelationChange('pb_rs_bo', v)}>
                  <SelectTrigger className="bg-slate-800 border-slate-600 text-white mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standing">Standing (default)</SelectItem>
                    <SelectItem value="vasquez_beggs">Vasquez-Beggs</SelectItem>
                    <SelectItem value="glaso">Glaso (non-standard — verify)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-300">Oil viscosity correlation</Label>
                <Select value={correlations.viscosity} onValueChange={(v) => handleCorrelationChange('viscosity', v)}>
                  <SelectTrigger className="bg-slate-800 border-slate-600 text-white mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beggs_robinson">Beggs-Robinson (default)</SelectItem>
                    <SelectItem value="beal_cook_spillman">Beal-Cook-Spillman (simplified)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-slate-500">
                Standing + Beggs-Robinson are the audited defaults. Other options are selectable but flagged in the results if non-standard.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="separators">
            <div className="space-y-4 p-1">
              <h3 className="text-lg font-semibold text-lime-300 flex items-center"><Atom className="w-5 h-5 mr-2" />Separator train</h3>
              <InputField label="Stock-tank oil basis" id="oilRate" value={inputs.feed?.oilRate} onChange={(e) => handleFeedChange(e.target.value)} unit="STB/d" hint="Reporting basis for stage gas rates." />
              {inputs.separatorTrain.stages.map((stage, index) => (
                <div key={index} className={`p-3 rounded-lg border ${stage.enabled ? 'border-slate-600 bg-slate-800/50' : 'border-slate-700 bg-slate-800/20'}`}>
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="font-semibold text-white">Stage {index + 1}</h4>
                    <Button size="sm" variant="ghost" onClick={() => toggleSeparatorStage(index)} className="text-slate-400 hover:text-white">
                      {stage.enabled ? <MinusCircle className="w-4 h-4 text-red-500" /> : <PlusCircle className="w-4 h-4 text-green-500" />}
                    </Button>
                  </div>
                  {stage.enabled && (
                    <div className="grid grid-cols-2 gap-3">
                      <InputField label="Pressure" id={`sep-p-${index}`} value={stage.pressure} onChange={(e) => handleSeparatorChange(index, 'pressure', e.target.value)} unit="psia" />
                      <InputField label="Temperature" id={`sep-t-${index}`} value={stage.temperature} onChange={(e) => handleSeparatorChange(index, 'temperature', e.target.value)} unit="°F" />
                    </div>
                  )}
                </div>
              ))}
              <p className="text-xs text-slate-500">An implicit stock-tank stage (14.7 psia, 60 °F) is always added.</p>
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default FluidStudioInput;
