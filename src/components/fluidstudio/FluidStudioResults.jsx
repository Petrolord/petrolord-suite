
import React from 'react';
    import { useNavigate } from 'react-router-dom';
    import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
    import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
    import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
    import { ScrollArea } from "@/components/ui/scroll-area";
    import { Button } from '@/components/ui/button';
    import { Droplets, Thermometer, Wind, Beaker, BarChart, AlertTriangle, Snowflake, Route, Combine as Blend, CheckCircle, XCircle, SlidersHorizontal, Share2, Zap } from 'lucide-react';

    const KPICard = ({ title, value, unit, icon: Icon }) => (
      <Card className="bg-slate-800/50 border-slate-700 text-white">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-slate-300">{title}</CardTitle>
          <Icon className="h-4 w-4 text-cyan-300" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{value}</div>
          <p className="text-xs text-slate-400">{unit}</p>
        </CardContent>
      </Card>
    );

    const PvtPlot = ({ data, yKey, yAxisTitle, bubblePoint }) => {
      return (
        <div className="bg-white/5 p-2 rounded-lg h-80 border border-white/10 flex items-center justify-center text-slate-500">
          Chart removed
        </div>
      );
    };
    
    const FlowAssurancePlot = ({ hydrateCurve, ptProfile }) => {
      return (
        <div className="bg-white/5 p-2 rounded-lg h-96 border border-white/10 flex items-center justify-center text-slate-500">
          Chart removed
        </div>
      );
    };

    const BatchRunPlot = ({ summary, variable }) => {
        return (
            <div className="bg-white/5 p-2 rounded-lg h-96 border border-white/10 flex items-center justify-center text-slate-500">
                Chart removed
            </div>
        );
    };

    const IntegrationSuite = ({ results }) => {
        const navigate = useNavigate();

        const handleSendToNodal = () => {
            const pvtData = {
                pb: results.pvt.kpis.pb,
                rsb: results.pvt.kpis.rsb,
                bo_at_pb: results.pvt.kpis.bo_at_pb,
                mu_o_at_pb: results.pvt.kpis.mu_o_at_pb,
                pvt_table: results.pvt.table,
            };
            navigate('/dashboard/production/nodal-analysis-engine', { state: { fluidStudioData: pvtData } });
        };

        const handleSendToPipelineSizer = () => {
            const pipelineData = {
                oil_gravity: results.pvt.kpis.api, // Assuming API is available in kpis
                gas_gravity: results.pvt.kpis.gasSg, // Assuming gasSg is available
                gor: results.pvt.kpis.rsb,
                inlet_temperature: results.pvt.kpis.temp, // Assuming temp is available
                wat: results.flowAssurance.wat,
            };
            navigate('/dashboard/facilities/pipeline-sizer', { state: { fluidStudioData: pipelineData } });
        };

        return (
            <Card className="bg-slate-800/50 border-slate-700 text-white mt-6">
                <CardHeader>
                    <CardTitle className="flex items-center"><Share2 className="mr-2 text-cyan-300" /> Integration Suite</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-slate-300">Send these fluid properties to other Petrolord applications.</p>
                    <div className="flex flex-col sm:flex-row gap-4">
                        <Button onClick={handleSendToNodal} className="flex-1 bg-sky-600 hover:bg-sky-700">
                            <Zap className="w-4 h-4 mr-2" /> Send to Nodal Analysis
                        </Button>
                        <Button onClick={handleSendToPipelineSizer} className="flex-1 bg-teal-600 hover:bg-teal-700">
                            <Zap className="w-4 h-4 mr-2" /> Send to Pipeline Sizer
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    };

    const FluidStudioResults = ({ results, batchRunSettings }) => {
      const { pvt, separator, flowAssurance, blending, batchSummary } = results;
      const isBatchRun = !!batchSummary;
      
      const singleRunResults = isBatchRun ? results.results[0] : results;
      const { pvt: singlePvt, separator: singleSeparator, flowAssurance: singleFlowAssurance } = singleRunResults;

      const tabs = ["pvt", "blending", "separators", "flow-assurance", "batch-summary"];
      const availableTabs = tabs.filter(tab => singleRunResults[tab] || (tab === 'blending' && blending) || (tab === 'batch-summary' && isBatchRun));
      
      return (
        <>
        <Tabs defaultValue={isBatchRun ? "batch-summary" : "pvt"} className="w-full">
          <TabsList className={`grid w-full grid-cols-${availableTabs.length} bg-slate-800 h-auto flex-wrap`}>
            {isBatchRun && <TabsTrigger value="batch-summary" className="flex-grow">Batch Summary</TabsTrigger>}
            {singlePvt && <TabsTrigger value="pvt" className="flex-grow">PVT Analysis {isBatchRun && '(First Run)'}</TabsTrigger>}
            {blending && <TabsTrigger value="blending" className="flex-grow">Blending</TabsTrigger>}
            {singleSeparator && <TabsTrigger value="separators" className="flex-grow">Separator Train</TabsTrigger>}
            {singleFlowAssurance && <TabsTrigger value="flow-assurance" className="flex-grow">Flow Assurance</TabsTrigger>}
          </TabsList>
          {isBatchRun && (
            <TabsContent value="batch-summary" className="mt-4">
                <Card className="bg-slate-800/50 border-slate-700 text-white">
                    <CardHeader><CardTitle className="flex items-center"><SlidersHorizontal className="mr-2 text-cyan-300" /> Batch Run Summary</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <BatchRunPlot summary={batchSummary} variable={batchRunSettings.variable} />
                        <ScrollArea className="h-72">
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-slate-700">
                                        <TableHead className="text-lime-300">Run</TableHead>
                                        <TableHead className="text-lime-300">{batchRunSettings.variable.toUpperCase()}</TableHead>
                                        <TableHead className="text-lime-300">Pb (psi)</TableHead>
                                        <TableHead className="text-lime-300">Bo @ Pb</TableHead>
                                        <TableHead className="text-lime-300">μo @ Pb</TableHead>
                                        <TableHead className="text-lime-300">WAT (°F)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {batchSummary.map((run, index) => (
                                        <TableRow key={index} className="border-slate-700">
                                            <TableCell>{index + 1}</TableCell>
                                            <TableCell>{run.input.toFixed(2)}</TableCell>
                                            <TableCell>{run.pb.toFixed(0)}</TableCell>
                                            <TableCell>{run.bo_at_pb.toFixed(3)}</TableCell>
                                            <TableCell>{run.mu_o_at_pb.toFixed(3)}</TableCell>
                                            <TableCell>{run.wat.toFixed(1)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                    </CardContent>
                </Card>
            </TabsContent>
          )}
          <TabsContent value="pvt" className="mt-4">
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <KPICard title="Bubble Point" value={singlePvt.kpis.pb.toFixed(0)} unit="psia" icon={Droplets} />
                <KPICard title="Solution GOR" value={singlePvt.kpis.rsb.toFixed(0)} unit="scf/stb" icon={Wind} />
                <KPICard title="Oil FVF @ Pb" value={singlePvt.kpis.bo_at_pb.toFixed(3)} unit="rb/stb" icon={Beaker} />
                <KPICard title="Oil Viscosity @ Pb" value={singlePvt.kpis.mu_o_at_pb.toFixed(3)} unit="cP" icon={Thermometer} />
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <PvtPlot data={singlePvt.table} yKey="bo" yAxisTitle="Oil FVF (rb/stb)" bubblePoint={singlePvt.kpis.pb} />
                <PvtPlot data={singlePvt.table} yKey="rs" yAxisTitle="Solution GOR (scf/stb)" bubblePoint={singlePvt.kpis.pb} />
                <PvtPlot data={singlePvt.table} yKey="mu_o" yAxisTitle="Oil Viscosity (cP)" bubblePoint={singlePvt.kpis.pb} />
                <PvtPlot data={singlePvt.table} yKey="z" yAxisTitle="Gas Z-Factor" bubblePoint={singlePvt.kpis.pb} />
              </div>
            </div>
          </TabsContent>
          {blending && (
            <TabsContent value="blending" className="mt-4">
                <Card className="bg-slate-800/50 border-slate-700 text-white">
                    <CardHeader>
                        <CardTitle className="flex items-center"><Blend className="mr-2 text-cyan-300" /> Blending Compatibility Analysis</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className={`p-4 rounded-lg flex items-center gap-4 ${blending.compatibility.stable ? 'bg-green-900/30 border-green-700' : 'bg-red-900/30 border-red-700'}`}>
                            {blending.compatibility.stable ? <CheckCircle className="w-8 h-8 text-green-400" /> : <XCircle className="w-8 h-8 text-red-400" />}
                            <div>
                                <h3 className={`text-lg font-bold ${blending.compatibility.stable ? 'text-green-300' : 'text-red-300'}`}>{blending.compatibility.message}</h3>
                                <p className="text-sm text-slate-300">Asphaltene Stability Index (ASI): {blending.compatibility.asi.toFixed(3)}</p>
                            </div>
                        </div>
                        <div>
                            <h4 className="text-md font-semibold text-lime-300 mb-2">Blended Fluid Properties</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <KPICard title="Blended API" value={blending.properties.api.toFixed(1)} unit="°API" icon={Droplets} />
                                <KPICard title="Blended GOR" value={blending.properties.gor.toFixed(0)} unit="scf/stb" icon={Wind} />
                                <KPICard title="Blended Gas SG" value={blending.properties.gasSg.toFixed(3)} unit="" icon={Beaker} />
                                <KPICard title="Blended Salinity" value={blending.properties.salinity.toFixed(0)} unit="ppm" icon={Thermometer} />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </TabsContent>
          )}
          <TabsContent value="separators" className="mt-4">
            <Card className="bg-slate-800/50 border-slate-700 text-white">
              <CardHeader>
                <CardTitle>Separator Stage Results</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-700">
                      <TableHead className="text-lime-300">Stage</TableHead>
                      <TableHead className="text-lime-300">Pressure (psia)</TableHead>
                      <TableHead className="text-lime-300">Temp (°F)</TableHead>
                      <TableHead className="text-lime-300">Oil Out (stb/d)</TableHead>
                      <TableHead className="text-lime-300">Gas Out (Mscf/d)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {singleSeparator.stages.map((stage, index) => (
                      <TableRow key={index} className="border-slate-700">
                        <TableCell>{stage.name}</TableCell>
                        <TableCell>{stage.pressure.toFixed(0)}</TableCell>
                        <TableCell>{stage.temperature.toFixed(0)}</TableCell>
                        <TableCell>{stage.oil_out.toFixed(2)}</TableCell>
                        <TableCell>{stage.gas_out.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2 border-lime-400 font-bold">
                        <TableCell colSpan={3}>Total</TableCell>
                        <TableCell>{singleSeparator.total_oil.toFixed(2)}</TableCell>
                        <TableCell>{singleSeparator.total_gas.toFixed(2)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="flow-assurance" className="mt-4">
            <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <KPICard title="Wax Appearance Temp (WAT)" value={singleFlowAssurance.wat.toFixed(1)} unit="°F" icon={Snowflake} />
                    <KPICard title="Asphaltene Onset Pressure" value={singleFlowAssurance.aop.toFixed(0)} unit="psia" icon={AlertTriangle} />
                    <KPICard title="Min Hydrate Temp" value={singleFlowAssurance.hydrate_risk.min_temp.toFixed(1)} unit="°F" icon={Thermometer} />
                    <KPICard title="Profile Risk" value={singleFlowAssurance.hydrate_risk.profile_crosses ? 'High' : 'Low'} unit={singleFlowAssurance.hydrate_risk.profile_crosses ? 'Profile crosses envelope' : 'No crossing detected'} icon={Route} />
                </div>
                <FlowAssurancePlot hydrateCurve={singleFlowAssurance.hydrate_curve} ptProfile={singleFlowAssurance.pt_profile} />
            </div>
          </TabsContent>
        </Tabs>
        <IntegrationSuite results={singleRunResults} />
        </>
      );
    };

    export default FluidStudioResults;
