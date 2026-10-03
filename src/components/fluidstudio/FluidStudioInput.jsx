import React, { useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { MinusCircle, PlusCircle, Atom, SlidersHorizontal, Beaker, Combine, Route, Snowflake } from 'lucide-react';
import CompositionInput from '@/components/fluidstudio/CompositionInput';
import LabDataDoor from '@/components/fluidstudio/LabDataDoor';
import UnitField from '@/components/fluidstudio/UnitField';
import { useFluidUnits } from '@/components/fluidstudio/FluidUnitsContext';
import { readPtProfile, PT_PRESSURE_UNITS, PT_TEMPERATURE_UNITS, DEFAULT_PT_UNITS } from '@/utils/fluidstudio/ptProfileImport';

// Every numeric field converts at the door: UnitField shows the stored
// oilfield value in the display unit and stores what is typed in oilfield.
const InputField = UnitField;

// the kind of the batch sweep variable, for its Min and Max fields
const fmtStd = (u, kind, v, d) => Number(u.show(kind, v).toFixed(d));
const BATCH_KIND = { api: 'api', gor: 'gor', gasSg: 'gasGravity', temp: 'temperature' };

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
      streamA: { ...prev.streamA, blackOil: { ...prev.streamA.blackOil, [field]: value } },
    }));
  };

  const handleStreamBChange = (field, value) => {
    setInputs((prev) => ({
      ...prev,
      streamB: { ...(prev.streamB ?? {}), blackOil: { ...(prev.streamB?.blackOil ?? {}), [field]: value } },
    }));
  };

  const handleCorrelationChange = (field, value) => {
    setInputs((prev) => ({ ...prev, correlations: { ...(prev.correlations ?? {}), [field]: value } }));
  };

  const handleFeedChange = (value) => {
    setInputs((prev) => ({ ...prev, feed: { ...(prev.feed ?? {}), oilRate: value } }));
  };

  const handleSeparatorChange = (index, field, value) => {
    const newStages = inputs.separatorTrain.stages.map((s, i) => (i === index ? { ...s, [field]: value } : s));
    setInputs((prev) => ({ ...prev, separatorTrain: { ...prev.separatorTrain, stages: newStages } }));
  };

  const toggleSeparatorStage = (index) => {
    const newStages = inputs.separatorTrain.stages.map((s, i) => (i === index ? { ...s, enabled: !s.enabled } : s));
    setInputs((prev) => ({ ...prev, separatorTrain: { ...prev.separatorTrain, stages: newStages } }));
  };

  const setBlending = (patch) => setInputs((prev) => ({ ...prev, blending: { ...(prev.blending ?? {}), ...patch } }));
  const setBatch = (patch) => setInputs((prev) => ({ ...prev, batchRun: { ...(prev.batchRun ?? {}), ...patch } }));
  const handleFlowlineChange = (field, value) => setInputs((prev) => ({ ...prev, flowAssurance: { ...(prev.flowAssurance ?? {}), flowline: { ...(prev.flowAssurance?.flowline ?? {}), [field]: value } } }));
  const handleFaScalar = (field, value) => setInputs((prev) => ({ ...prev, flowAssurance: { ...(prev.flowAssurance ?? {}), [field]: value } }));
  const handlePtRaw = (value) => setInputs((prev) => ({ ...prev, ptProfile: { ...(prev.ptProfile ?? {}), raw: value } }));
  const setPtUnit = (which, value) => setInputs((prev) => ({
    ...prev,
    ptProfile: { ...(prev.ptProfile ?? {}), units: { ...DEFAULT_PT_UNITS, ...(prev.ptProfile?.units ?? {}), [which]: value } },
  }));
  // the door reads back what it read; the engine reads the same text with the same units
  const ptRead = useMemo(() => readPtProfile(inputs.ptProfile?.raw ?? '', inputs.ptProfile?.units), [inputs.ptProfile]);
  const u = useFluidUnits();

  const fluidModel = inputs.fluidModel ?? 'black-oil';
  const setFluidModel = (v) => setInputs((prev) => ({ ...prev, fluidModel: v }));
  const setComposition = (composition) => setInputs((prev) => ({
    ...prev,
    streamA: { ...prev.streamA, composition },
  }));

  return (
    <div className="space-y-4 h-full flex flex-col">
      <h2 className="text-2xl font-bold text-pl-text mb-2">Analysis Setup</h2>
      <p className="text-xs text-pl-muted -mt-2">Results recompute instantly as you type.</p>
      <div>
        <Label className="text-sm font-medium text-pl-text">Fluid model</Label>
        <Select value={fluidModel} onValueChange={setFluidModel}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="black-oil">Black oil correlations (default)</SelectItem>
            <SelectItem value="eos">Compositional PR78 EOS (adds a Composition tab)</SelectItem>
          </SelectContent>
        </Select>
        {fluidModel === 'eos' && (
          <p className="text-xs text-pl-muted mt-1">The compositional path runs beside the black oil analysis. Separators, blending and flow assurance stay on the black oil stream.</p>
        )}
      </div>
      <Tabs defaultValue="stream-a" className="flex-grow flex flex-col">
        <TabsList className="flex flex-wrap h-auto justify-start">
          <TabsTrigger value="stream-a">Stream A</TabsTrigger>
          {fluidModel === 'eos' && <TabsTrigger value="composition">Composition</TabsTrigger>}
          <TabsTrigger value="lab-data">Lab data</TabsTrigger>
          <TabsTrigger value="correlations">Correlations</TabsTrigger>
          <TabsTrigger value="separators">Separators</TabsTrigger>
          <TabsTrigger value="blending">Blending</TabsTrigger>
          <TabsTrigger value="batch-run">Batch</TabsTrigger>
          <TabsTrigger value="flow-assurance">Flow Assurance</TabsTrigger>
        </TabsList>
        <div className="flex-grow mt-4 overflow-y-auto">
          <TabsContent value="stream-a">
            <div className="space-y-4 p-1">
              <h3 className="text-lg font-semibold text-pl-text flex items-center"><Beaker className="w-5 h-5 mr-2" />Stream A: black-oil properties</h3>
              <InputField label="API Gravity" id="api" value={streamA.api} onChange={(v) => handleStreamChange('api', v)} kind="api" />
              <InputField label="Solution GOR (Rsb)" id="gor" value={streamA.gor} onChange={(v) => handleStreamChange('gor', v)} kind="gor" />
              <InputField label="Gas Specific Gravity" id="gasSg" value={streamA.gasSg} onChange={(v) => handleStreamChange('gasSg', v)} kind="gasGravity" />
              <InputField label="Reservoir Temperature" id="temp" value={streamA.temp} onChange={(v) => handleStreamChange('temp', v)} kind="temperature" />
              <InputField label="Bubble Point (optional)" id="pb" value={streamA.pb} onChange={(v) => handleStreamChange('pb', v)} kind="pressure" placeholder="auto" hint="Leave blank to solve Pb from the GOR." />
              <InputField label="Water Salinity" id="salinity" value={streamA.salinity} onChange={(v) => handleStreamChange('salinity', v)} kind="salinity" />
              <InputField
                label="Highest table pressure (optional)" id="table-top" kind="pressure" placeholder="default"
                value={inputs.tableRange?.pMax ?? null}
                onChange={(v) => setInputs((prev) => ({ ...prev, tableRange: v > 0 ? { pMax: v, from: 'entered' } : undefined }))}
                hint={inputs.tableRange?.from === 'consumer'
                  ? `Asked for by ${inputs.tableRange.requestedBy || 'a consuming app'}. Save the project so it can read the longer table.`
                  : 'By default the table ends at the larger of 1.4 times Pb and Pb plus 2,000 psi. Set a higher pressure for a reservoir further above its bubble point.'}
              />
            </div>
          </TabsContent>

          {fluidModel === 'eos' && (
            <TabsContent value="composition">
              <CompositionInput composition={inputs.streamA?.composition} onChange={setComposition} />
            </TabsContent>
          )}

          <TabsContent value="lab-data">
            <LabDataDoor
              inputs={inputs}
              setInputs={setInputs}
              modelTempF={fluidModel === 'eos' ? (inputs.streamA?.composition?.temp ?? null) : (streamA.temp ?? null)}
            />
          </TabsContent>

          <TabsContent value="correlations">
            <div className="space-y-4 p-1">
              <h3 className="text-lg font-semibold text-pl-text flex items-center"><SlidersHorizontal className="w-5 h-5 mr-2" />PVT correlations</h3>
              <div>
                <Label className="text-sm font-medium text-pl-text">Rs / Bo / Pb correlation</Label>
                <Select value={correlations.pb_rs_bo} onValueChange={(v) => handleCorrelationChange('pb_rs_bo', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standing">Standing (default)</SelectItem>
                    <SelectItem value="vasquez_beggs">Vasquez-Beggs</SelectItem>
                    <SelectItem value="glaso">Glaso</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-medium text-pl-text">Oil viscosity correlation</Label>
                <Select value={correlations.viscosity} onValueChange={(v) => handleCorrelationChange('viscosity', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beggs_robinson">Beggs-Robinson (default)</SelectItem>
                    <SelectItem value="beal_cook_spillman">Beal-Cook-Spillman (simplified)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-medium text-pl-text">Gas z-factor</Label>
                <Select value={correlations.z_factor ?? 'dranchuk_abou_kassem'} onValueChange={(v) => handleCorrelationChange('z_factor', v)}>
                  <SelectTrigger className="mt-1" data-testid="corr-z-factor"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dranchuk_abou_kassem">Dranchuk-Abou-Kassem (default)</SelectItem>
                    <SelectItem value="hall_yarborough">Hall-Yarborough</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-pl-muted">Standing and Beggs-Robinson are the defaults. The Report tab lists the method behind every property and the published range of each.</p>
            </div>
          </TabsContent>

          <TabsContent value="separators">
            <div className="space-y-4 p-1">
              <h3 className="text-lg font-semibold text-pl-text flex items-center"><Atom className="w-5 h-5 mr-2" />Separator train</h3>
              <InputField label="Stock-tank oil basis" id="oilRate" value={inputs.feed?.oilRate} onChange={(v) => handleFeedChange(v)} kind="liquidRate" hint="Reporting basis for stage gas rates." />
              {inputs.separatorTrain.stages.map((stage, index) => (
                <div key={index} className={`p-3 rounded-lg border ${stage.enabled ? 'border-pl-border bg-pl-sunken' : 'border-dashed border-pl-border bg-pl-surface'}`}>
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="font-semibold text-pl-text">Stage {index + 1}</h4>
                    <Button size="sm" variant="ghost" onClick={() => toggleSeparatorStage(index)} className="text-pl-muted hover:text-pl-text">
                      {stage.enabled ? <MinusCircle className="w-4 h-4 text-pl-muted" /> : <PlusCircle className="w-4 h-4 text-pl-muted" />}
                    </Button>
                  </div>
                  {stage.enabled && (
                    <div className="grid grid-cols-2 gap-3">
                      <InputField label="Pressure" id={`sep-p-${index}`} value={stage.pressure} onChange={(v) => handleSeparatorChange(index, 'pressure', v)} kind="pressure" />
                      <InputField label="Temperature" id={`sep-t-${index}`} value={stage.temperature} onChange={(v) => handleSeparatorChange(index, 'temperature', v)} kind="temperature" />
                    </div>
                  )}
                </div>
              ))}
              <p className="text-xs text-pl-muted">A stock-tank stage at standard conditions ({fmtStd(u, 'pressure', 14.7, 1)} {u.label('pressure')}, {fmtStd(u, 'temperature', 60, 1)} {u.label('temperature')}) is always added.</p>
            </div>
          </TabsContent>

          <TabsContent value="blending">
            <div className="space-y-4 p-1">
              <div className="flex items-center gap-2">
                <Switch id="blending-enabled" checked={!!blending.enabled} onCheckedChange={(c) => setBlending({ enabled: c })} />
                <Label htmlFor="blending-enabled" className="text-lg font-semibold text-pl-text flex items-center"><Combine className="w-5 h-5 mr-2" />Blend Stream B into A</Label>
              </div>
              {blending.enabled && (
                <>
                  <div>
                    <Label className="text-sm text-pl-text">Blend ratio: A {100 - (blending.streamB_fraction ?? 0)}% / B {blending.streamB_fraction ?? 0}%</Label>
                    <Slider className="mt-3" value={[blending.streamB_fraction ?? 0]} onValueChange={([v]) => setBlending({ streamB_fraction: v })} max={100} step={1} />
                  </div>
                  <h4 className="text-sm font-semibold text-pl-text pt-2">Stream B: black-oil properties</h4>
                  <InputField label="API Gravity" id="b-api" value={streamB.api} onChange={(v) => handleStreamBChange('api', v)} kind="api" />
                  <InputField label="Solution GOR (Rsb)" id="b-gor" value={streamB.gor} onChange={(v) => handleStreamBChange('gor', v)} kind="gor" />
                  <InputField label="Gas Specific Gravity" id="b-gasSg" value={streamB.gasSg} onChange={(v) => handleStreamBChange('gasSg', v)} kind="gasGravity" />
                  <InputField label="Reservoir Temperature" id="b-temp" value={streamB.temp} onChange={(v) => handleStreamBChange('temp', v)} kind="temperature" />
                  <InputField label="Water Salinity" id="b-salinity" value={streamB.salinity} onChange={(v) => handleStreamBChange('salinity', v)} kind="salinity" />
                  <p className="text-xs text-pl-muted">No Pb field; the blend&apos;s bubble point is re-solved and drives the PVT &amp; Separator tabs.</p>
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="batch-run">
            <div className="space-y-4 p-1">
              <div className="flex items-center gap-2">
                <Switch id="batch-enabled" checked={!!batch.enabled} onCheckedChange={(c) => setBatch({ enabled: c })} />
                <Label htmlFor="batch-enabled" className="text-lg font-semibold text-pl-text flex items-center"><SlidersHorizontal className="w-5 h-5 mr-2" />Batch sensitivity sweep</Label>
              </div>
              {batch.enabled && (
                <>
                  <div>
                    <Label className="text-sm font-medium text-pl-text">Sweep variable (Stream A)</Label>
                    <Select value={batch.variable} onValueChange={(v) => setBatch({ variable: v })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="api">API Gravity</SelectItem>
                        <SelectItem value="gor">Solution GOR</SelectItem>
                        <SelectItem value="gasSg">Gas SG</SelectItem>
                        <SelectItem value="temp">Temperature</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <InputField label="Min" id="batch-min" value={batch.min} kind={BATCH_KIND[batch.variable]} onChange={(v) => setBatch({ min: v })} />
                    <InputField label="Max" id="batch-max" value={batch.max} kind={BATCH_KIND[batch.variable]} onChange={(v) => setBatch({ max: v })} />
                    <InputField label="Steps" id="batch-steps" value={batch.steps} onChange={(v) => setBatch({ steps: v })} step="1" hint="2 or more" />
                  </div>
                  <p className="text-xs text-pl-muted">Endpoints always included. Other inputs stay fixed at Stream A; WAT populates only when Flow Assurance supplies one.</p>
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="flow-assurance">
            <div className="space-y-4 p-1">
              <h3 className="text-lg font-semibold text-pl-text flex items-center"><Snowflake className="w-5 h-5 mr-2" />Flow assurance</h3>
              <h4 className="text-sm font-semibold text-pl-text flex items-center"><Route className="w-4 h-4 mr-2" />Flowline</h4>
              <div className="grid grid-cols-2 gap-3">
                <InputField label="Length" id="fl-length" value={fa.flowline?.length} onChange={(v) => handleFlowlineChange('length', v)} kind="length" />
                <InputField label="Diameter" id="fl-diameter" value={fa.flowline?.diameter} onChange={(v) => handleFlowlineChange('diameter', v)} unit="in" />
                <InputField label="Outlet pressure" id="fl-outletP" value={fa.flowline?.outletPressure} onChange={(v) => handleFlowlineChange('outletPressure', v)} kind="pressure" />
                <InputField label="Ambient temp" id="fl-ambient" value={fa.flowline?.ambientTemp} onChange={(v) => handleFlowlineChange('ambientTemp', v)} kind="temperature" />
              </div>
              <p className="text-xs text-pl-muted">Flowline geometry is recorded only: no calculation in this app reads it. Hydrate screening uses the gas gravity and the P-T profile.</p>

              <h4 className="text-sm font-semibold text-pl-text pt-1">Wax / asphaltene</h4>
              <InputField label="Measured WAT (optional)" id="fa-wat" value={fa.measuredWat} onChange={(v) => handleFaScalar('measuredWat', v)} kind="temperature" hint="Authoritative; overrides screening." />
              <InputField label="Wax content (optional)" id="fa-wax" value={fa.waxContent} onChange={(v) => handleFaScalar('waxContent', v)} unit="wt%" hint="Enables a labeled screening WAT." />
              <p className="text-xs text-pl-muted">Asphaltene onset pressure cannot be computed from black-oil inputs, so the results leave it blank.</p>

              <div>
                <Label htmlFor="pt-profile" className="text-sm font-medium text-pl-text">P-T profile</Label>
                <div className="grid grid-cols-2 gap-3 mt-1">
                  <div>
                    <Label className="text-xs text-pl-muted">Pressure unit</Label>
                    <Select value={ptRead.units.pressure} onValueChange={(v) => setPtUnit('pressure', v)} disabled={ptRead.units.pressureFromHeader}>
                      <SelectTrigger className="mt-1 h-8" data-testid="pt-pressure-unit"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(PT_PRESSURE_UNITS).map(([k, d]) => <SelectItem key={k} value={k}>{d.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-pl-muted">Temperature unit</Label>
                    <Select value={ptRead.units.temperature} onValueChange={(v) => setPtUnit('temperature', v)} disabled={ptRead.units.temperatureFromHeader}>
                      <SelectTrigger className="mt-1 h-8" data-testid="pt-temperature-unit"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(PT_TEMPERATURE_UNITS).map(([k, d]) => <SelectItem key={k} value={k}>{d.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Textarea
                  id="pt-profile"
                  value={inputs.ptProfile?.raw ?? ''}
                  onChange={(e) => handlePtRaw(e.target.value)}
                  placeholder={'Pressure, temperature (one point per line)\n3000, 180\n2500, 165\n2000, 140'}
                  className="h-28 mt-2 font-pl-mono tabular-nums text-sm"
                />
                <p className="text-xs text-pl-muted mt-1">Paste the flowline pressure and temperature profile. Commas, semicolons, tabs or spaces separate the two columns; a header line may name them and their units.</p>
                {(inputs.ptProfile?.raw ?? '').trim() !== '' && (
                  <div className="mt-2 rounded-md border border-pl-border bg-pl-sunken px-3 py-2 text-xs text-pl-text" data-testid="pt-readback">
                    <p>{ptRead.summary}</p>
                    {ptRead.skipped.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-pl-warning-text">
                        {ptRead.skipped.slice(0, 8).map((sk) => <li key={sk.line}>Line {sk.line} not read: {sk.reason} ("{sk.text.slice(0, 40)}")</li>)}
                        {ptRead.skipped.length > 8 && <li>and {ptRead.skipped.length - 8} more</li>}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default FluidStudioInput;
