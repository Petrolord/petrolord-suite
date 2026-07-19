import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { MinusCircle, PlusCircle, Atom, SlidersHorizontal, Beaker, Combine, Route, Snowflake } from 'lucide-react';
import CompositionInput from '@/components/fluidstudio/CompositionInput';

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

const FluidStudioInput = ({ inputs, setInputs }) => {
  const streamA = inputs.streamA.blackOil;
  const streamB = inputs.streamB?.blackOil ?? {};
  const correlations = inputs.correlations ?? { pb_rs_bo: 'standing', viscosity: 'beggs_robinson' };
  const blending = inputs.blending ?? { enabled: false, streamB_fraction: 50 };
  const batch = inputs.batchRun ?? { enabled: false, variable: 'api', min: 20, max: 40, steps: 5 };
  const fa = inputs.flowAssurance ?? { flowline: {}, inhibitors: [] };

  const handleStreamChange = (field, value) => {
    setInputs((prev) => ({
      ...prev,
      streamA: { ...prev.streamA, blackOil: { ...prev.streamA.blackOil, [field]: value === '' ? null : Number(value) } },
    }));
  };

  const handleStreamBChange = (field, value) => {
    setInputs((prev) => ({
      ...prev,
      streamB: { ...(prev.streamB ?? {}), blackOil: { ...(prev.streamB?.blackOil ?? {}), [field]: value === '' ? null : Number(value) } },
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

  const setBlending = (patch) => setInputs((prev) => ({ ...prev, blending: { ...(prev.blending ?? {}), ...patch } }));
  const setBatch = (patch) => setInputs((prev) => ({ ...prev, batchRun: { ...(prev.batchRun ?? {}), ...patch } }));
  const handleFlowlineChange = (field, value) => setInputs((prev) => ({ ...prev, flowAssurance: { ...(prev.flowAssurance ?? {}), flowline: { ...(prev.flowAssurance?.flowline ?? {}), [field]: value === '' ? null : Number(value) } } }));
  const handleFaScalar = (field, value) => setInputs((prev) => ({ ...prev, flowAssurance: { ...(prev.flowAssurance ?? {}), [field]: value === '' ? null : Number(value) } }));
  const handlePtRaw = (value) => setInputs((prev) => ({ ...prev, ptProfile: { ...(prev.ptProfile ?? {}), raw: value } }));

  const fluidModel = inputs.fluidModel ?? 'black-oil';
  const setFluidModel = (v) => setInputs((prev) => ({ ...prev, fluidModel: v }));
  const setComposition = (composition) => setInputs((prev) => ({
    ...prev,
    streamA: { ...prev.streamA, composition },
  }));

  return (
    <div className="space-y-4 h-full flex flex-col">
      <h2 className="text-2xl font-bold text-white mb-2">Analysis Setup</h2>
      <p className="text-xs text-slate-400 -mt-2">Results recompute instantly as you type.</p>
      <div>
        <Label className="text-sm font-medium text-slate-300">Fluid model</Label>
        <Select value={fluidModel} onValueChange={setFluidModel}>
          <SelectTrigger className="bg-slate-800 border-slate-600 text-white mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="black-oil">Black oil correlations (default)</SelectItem>
            <SelectItem value="eos">Compositional PR78 EOS (adds a Composition tab)</SelectItem>
          </SelectContent>
        </Select>
        {fluidModel === 'eos' && (
          <p className="text-xs text-slate-500 mt-1">The compositional path runs beside the black oil analysis. Separators, blending and flow assurance stay on the black oil stream.</p>
        )}
      </div>
      <Tabs defaultValue="stream-a" className="flex-grow flex flex-col">
        <TabsList className="flex flex-wrap h-auto justify-start bg-slate-800">
          <TabsTrigger value="stream-a">Stream A</TabsTrigger>
          {fluidModel === 'eos' && <TabsTrigger value="composition">Composition</TabsTrigger>}
          <TabsTrigger value="correlations">Correlations</TabsTrigger>
          <TabsTrigger value="separators">Separators</TabsTrigger>
          <TabsTrigger value="blending">Blending</TabsTrigger>
          <TabsTrigger value="batch-run">Batch</TabsTrigger>
          <TabsTrigger value="flow-assurance">Flow Assurance</TabsTrigger>
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

          {fluidModel === 'eos' && (
            <TabsContent value="composition">
              <CompositionInput composition={inputs.streamA?.composition} onChange={setComposition} />
            </TabsContent>
          )}

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
              <p className="text-xs text-slate-500">Standing + Beggs-Robinson are the audited defaults. Other options are selectable but flagged in the results if non-standard.</p>
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

          <TabsContent value="blending">
            <div className="space-y-4 p-1">
              <div className="flex items-center gap-2">
                <Switch id="blending-enabled" checked={!!blending.enabled} onCheckedChange={(c) => setBlending({ enabled: c })} />
                <Label htmlFor="blending-enabled" className="text-lg font-semibold text-lime-300 flex items-center"><Combine className="w-5 h-5 mr-2" />Blend Stream B into A</Label>
              </div>
              {blending.enabled && (
                <>
                  <div>
                    <Label className="text-sm text-slate-300">Blend ratio — A {100 - (blending.streamB_fraction ?? 0)}% / B {blending.streamB_fraction ?? 0}%</Label>
                    <Slider className="mt-3" value={[blending.streamB_fraction ?? 0]} onValueChange={([v]) => setBlending({ streamB_fraction: v })} max={100} step={1} />
                  </div>
                  <h4 className="text-sm font-semibold text-lime-300 pt-2">Stream B — black-oil properties</h4>
                  <InputField label="API Gravity" id="b-api" value={streamB.api} onChange={(e) => handleStreamBChange('api', e.target.value)} unit="°API" />
                  <InputField label="Solution GOR (Rsb)" id="b-gor" value={streamB.gor} onChange={(e) => handleStreamBChange('gor', e.target.value)} unit="scf/STB" />
                  <InputField label="Gas Specific Gravity" id="b-gasSg" value={streamB.gasSg} onChange={(e) => handleStreamBChange('gasSg', e.target.value)} unit="air=1" />
                  <InputField label="Reservoir Temperature" id="b-temp" value={streamB.temp} onChange={(e) => handleStreamBChange('temp', e.target.value)} unit="°F" />
                  <InputField label="Water Salinity" id="b-salinity" value={streamB.salinity} onChange={(e) => handleStreamBChange('salinity', e.target.value)} unit="ppm" />
                  <p className="text-xs text-slate-500">No Pb field — the blend&apos;s bubble point is re-solved and drives the PVT &amp; Separator tabs.</p>
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="batch-run">
            <div className="space-y-4 p-1">
              <div className="flex items-center gap-2">
                <Switch id="batch-enabled" checked={!!batch.enabled} onCheckedChange={(c) => setBatch({ enabled: c })} />
                <Label htmlFor="batch-enabled" className="text-lg font-semibold text-lime-300 flex items-center"><SlidersHorizontal className="w-5 h-5 mr-2" />Batch sensitivity sweep</Label>
              </div>
              {batch.enabled && (
                <>
                  <div>
                    <Label className="text-sm font-medium text-slate-300">Sweep variable (Stream A)</Label>
                    <Select value={batch.variable} onValueChange={(v) => setBatch({ variable: v })}>
                      <SelectTrigger className="bg-slate-800 border-slate-600 text-white mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="api">API Gravity</SelectItem>
                        <SelectItem value="gor">Solution GOR</SelectItem>
                        <SelectItem value="gasSg">Gas SG</SelectItem>
                        <SelectItem value="temp">Temperature</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <InputField label="Min" id="batch-min" value={batch.min} onChange={(e) => setBatch({ min: e.target.value === '' ? null : Number(e.target.value) })} />
                    <InputField label="Max" id="batch-max" value={batch.max} onChange={(e) => setBatch({ max: e.target.value === '' ? null : Number(e.target.value) })} />
                    <InputField label="Steps" id="batch-steps" value={batch.steps} onChange={(e) => setBatch({ steps: e.target.value === '' ? null : Number(e.target.value) })} step="1" hint="≥2" />
                  </div>
                  <p className="text-xs text-slate-500">Endpoints always included. Other inputs stay fixed at Stream A; WAT populates only when Flow Assurance supplies one.</p>
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="flow-assurance">
            <div className="space-y-4 p-1">
              <h3 className="text-lg font-semibold text-lime-300 flex items-center"><Snowflake className="w-5 h-5 mr-2" />Flow assurance</h3>
              <h4 className="text-sm font-semibold text-lime-300 flex items-center"><Route className="w-4 h-4 mr-2" />Flowline</h4>
              <div className="grid grid-cols-2 gap-3">
                <InputField label="Length" id="fl-length" value={fa.flowline?.length} onChange={(e) => handleFlowlineChange('length', e.target.value)} unit="ft" />
                <InputField label="Diameter" id="fl-diameter" value={fa.flowline?.diameter} onChange={(e) => handleFlowlineChange('diameter', e.target.value)} unit="in" />
                <InputField label="Outlet pressure" id="fl-outletP" value={fa.flowline?.outletPressure} onChange={(e) => handleFlowlineChange('outletPressure', e.target.value)} unit="psia" />
                <InputField label="Ambient temp" id="fl-ambient" value={fa.flowline?.ambientTemp} onChange={(e) => handleFlowlineChange('ambientTemp', e.target.value)} unit="°F" />
              </div>
              <p className="text-xs text-slate-500">Flowline geometry is carried for Phase-3 heat-loss/Nodal; hydrate screening consumes only gas SG + the P-T profile.</p>

              <h4 className="text-sm font-semibold text-lime-300 pt-1">Wax / asphaltene</h4>
              <InputField label="Measured WAT (optional)" id="fa-wat" value={fa.measuredWat} onChange={(e) => handleFaScalar('measuredWat', e.target.value)} unit="°F" hint="Authoritative — overrides screening." />
              <InputField label="Wax content (optional)" id="fa-wax" value={fa.waxContent} onChange={(e) => handleFaScalar('waxContent', e.target.value)} unit="wt%" hint="Enables a labeled screening WAT." />
              <p className="text-xs text-slate-500">AOP is not computable from black-oil inputs — reported as N/A in results.</p>

              <div>
                <Label htmlFor="pt-profile" className="text-sm font-medium text-slate-300">P-T profile</Label>
                <Textarea
                  id="pt-profile"
                  value={inputs.ptProfile?.raw ?? ''}
                  onChange={(e) => handlePtRaw(e.target.value)}
                  placeholder={'P_psia, T_F  (one per line)\n3000, 180\n2500, 165\n2000, 140'}
                  className="bg-slate-800 border-slate-600 text-white h-28 mt-1 font-mono text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">Paste the flowline pressure/temperature profile; crossings into the hydrate region are flagged in results.</p>
              </div>
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default FluidStudioInput;
