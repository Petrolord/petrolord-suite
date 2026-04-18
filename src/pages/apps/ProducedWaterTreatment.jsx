import React from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  Settings, 
  Activity, 
  DollarSign, 
  Download, 
  Save, 
  Droplets,
  Zap,
  PlayCircle,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from '@/components/ui/use-toast';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

import { usePwtCalculations } from '@/hooks/usePwtCalculations';
import { PwtVisualizer } from '@/components/pwt/PwtVisualizer';

const PIE_COLORS = ['#00D9FF', '#FF9500', '#D946EF', '#10B981'];

const MetricCard = ({ title, value, unit, icon: Icon, colorClass }) => (
  <Card className="bg-card border-border shadow-md hover:shadow-lg transition-shadow duration-300">
    <CardContent className="p-5 flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-slate-400">{title}</p>
        <div className="flex items-baseline space-x-1 mt-2">
          <h4 className="text-3xl font-bold text-slate-100">{value}</h4>
          <span className="text-sm text-slate-400">{unit}</span>
        </div>
      </div>
      <div className={`p-4 rounded-xl ${colorClass}`}>
        <Icon className="w-7 h-7" />
      </div>
    </CardContent>
  </Card>
);

const ProducedWaterTreatment = () => {
  const { toast } = useToast();
  const { 
    inputs, 
    updateInput, 
    applyPreset, 
    train, 
    updateTrain, 
    results, 
    isCalculating, 
    triggerCalculation 
  } = usePwtCalculations();

  const handleExport = () => {
    toast({ title: "Exporting Report", description: "Your PDF report is being generated..." });
  };

  const handleSave = () => {
    toast({ title: "Configuration Saved", description: "Treatment train configuration saved successfully." });
  };

  const handleCalculate = async () => {
    await triggerCalculation();
    toast({ 
      title: "Calculation Complete", 
      description: "Treatment train performance has been successfully updated.",
      className: "bg-emerald-950 border-emerald-500 text-emerald-100"
    });
  };

  return (
    <TooltipProvider>
      <Helmet>
        <title>Produced Water Treatment Pro - Petrolord</title>
        <meta name="description" content="Advanced design and modeling for produced water treatment facilities." />
      </Helmet>

      {/* Forced dark theme wrapper to ensure compliance with Task 1 & 2 */}
      <div className="dark min-h-screen bg-background text-foreground pb-12 font-sans selection:bg-primary/30">
        
        {/* Top Navigation Bar */}
        <div className="bg-card border-b border-border sticky top-0 z-20 shadow-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-18 py-4">
              <div className="flex items-center space-x-4">
                <div className="bg-primary/10 p-2.5 rounded-xl border border-primary/20 shadow-[0_0_15px_rgba(0,217,255,0.15)]">
                  <Droplets className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-extrabold tracking-tight text-slate-100">
                    Produced Water Pro
                  </h1>
                  <p className="text-xs text-slate-400 font-medium tracking-wide">TREATMENT TRAIN OPTIMIZER</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <Button variant="outline" size="sm" onClick={handleSave} className="border-slate-700 hover:bg-slate-800 text-slate-200">
                  <Save className="w-4 h-4 mr-2" /> Save
                </Button>
                <Button variant="outline" size="sm" onClick={handleExport} className="border-slate-700 hover:bg-slate-800 text-slate-200">
                  <Download className="w-4 h-4 mr-2" /> Export
                </Button>
                <Button asChild variant="ghost" size="sm" className="text-slate-300 hover:text-white hover:bg-slate-800">
                  <Link to="/dashboard/facilities"><ArrowLeft className="mr-2 h-4 w-4" /> Back</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
          
          {/* Key Metrics Dashboard */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
            <MetricCard 
              title="Overall OIW Removal" 
              value={results.metrics.oiwEfficiency.toFixed(1)} 
              unit="%" 
              icon={Activity} 
              colorClass="bg-primary/10 text-primary border border-primary/20 shadow-[inset_0_0_15px_rgba(0,217,255,0.05)]" 
            />
            <MetricCard 
              title="Est. OPEX" 
              value={results.metrics.totalCost.toFixed(2)} 
              unit="$/m³" 
              icon={DollarSign} 
              colorClass="bg-secondary/10 text-secondary border border-secondary/20 shadow-[inset_0_0_15px_rgba(255,149,0,0.05)]" 
            />
            <MetricCard 
              title="Total Pressure Drop" 
              value={results.metrics.totalPDrop.toFixed(1)} 
              unit="psi" 
              icon={Settings} 
              colorClass="bg-accent/10 text-accent border border-accent/20 shadow-[inset_0_0_15px_rgba(217,70,239,0.05)]" 
            />
            <MetricCard 
              title="Total Energy" 
              value={results.metrics.totalEnergy.toFixed(2)} 
              unit="kWh/m³" 
              icon={Zap} 
              colorClass="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[inset_0_0_15px_rgba(16,185,129,0.05)]" 
            />
          </div>

          <Tabs defaultValue="design" className="space-y-6">
            <TabsList className="bg-card border border-border w-full justify-start overflow-x-auto rounded-xl p-1.5 shadow-sm">
              <TabsTrigger value="design" className="px-6 py-2.5 rounded-lg data-[state=active]:bg-primary/10 data-[state=active]:text-primary font-semibold transition-all">Treatment Design</TabsTrigger>
              <TabsTrigger value="performance" className="px-6 py-2.5 rounded-lg data-[state=active]:bg-secondary/10 data-[state=active]:text-secondary font-semibold transition-all">Performance Analytics</TabsTrigger>
            </TabsList>

            <TabsContent value="design" className="m-0 focus-visible:outline-none">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* Left Panel: Inputs */}
                <div className="lg:col-span-4 space-y-6">
                  
                  {/* Influent Properties */}
                  <Card className="bg-card border-border shadow-lg">
                    <CardHeader className="bg-slate-800/50 border-b border-border pb-4 rounded-t-xl">
                      <CardTitle className="text-lg flex items-center justify-between text-slate-100">
                        <span>Influent Properties</span>
                        <Badge variant="outline" className="font-medium text-xs border-primary/50 text-primary bg-primary/5">Input</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-5 space-y-5">
                      <div className="flex space-x-2 mb-2">
                        <Button variant="secondary" size="sm" onClick={() => applyPreset('conventional')} className="text-xs flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700">Conventional</Button>
                        <Button variant="secondary" size="sm" onClick={() => applyPreset('unconventional')} className="text-xs flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700">Unconventional</Button>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <Label className="text-sm font-medium text-slate-400">Flow Rate (bwpd)</Label>
                          <Input 
                            type="number"
                            value={inputs.flowRate} 
                            onChange={(e) => updateInput('flowRate', e.target.value)} 
                            className="bg-slate-900 border-slate-700 text-slate-100 font-semibold focus-visible:ring-primary h-11"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label className="text-sm font-medium text-slate-400">Inlet OIW (ppm)</Label>
                            <Input 
                              type="number"
                              value={inputs.oiw} 
                              onChange={(e) => updateInput('oiw', e.target.value)} 
                              className="bg-slate-900 border-slate-700 text-slate-100 font-semibold focus-visible:ring-primary h-11"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-sm font-medium text-slate-400">Inlet TSS (ppm)</Label>
                            <Input 
                              type="number"
                              value={inputs.tss} 
                              onChange={(e) => updateInput('tss', e.target.value)} 
                              className="bg-slate-900 border-slate-700 text-slate-100 font-semibold focus-visible:ring-primary h-11"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Calculate Button */}
                      <div className="pt-2">
                        <Button 
                          onClick={handleCalculate} 
                          disabled={isCalculating}
                          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold h-12 shadow-[0_0_15px_rgba(0,217,255,0.3)] transition-all hover:shadow-[0_0_25px_rgba(0,217,255,0.5)]"
                        >
                          {isCalculating ? (
                            <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Computing...</>
                          ) : (
                            <><PlayCircle className="w-5 h-5 mr-2" /> Calculate Treatment Train</>
                          )}
                        </Button>
                      </div>

                    </CardContent>
                  </Card>

                  {/* Treatment Selection */}
                  <Card className="bg-card border-border shadow-lg">
                    <CardHeader className="bg-slate-800/50 border-b border-border pb-4 rounded-t-xl">
                      <CardTitle className="text-lg flex items-center justify-between text-slate-100">
                        <span>Train Configuration</span>
                        <Badge variant="outline" className="font-medium text-xs border-secondary/50 text-secondary bg-secondary/5">Setup</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-5 space-y-5">
                      <div className="space-y-2">
                        <Label className="text-sm font-bold text-primary tracking-wide">Primary Treatment</Label>
                        <Select value={train.primary} onValueChange={(val) => updateTrain('primary', val)}>
                          <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100 h-11 focus:ring-primary">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-700">
                            <SelectItem value="api" className="text-slate-200 focus:bg-slate-700 focus:text-white">API Separator</SelectItem>
                            <SelectItem value="cpi" className="text-slate-200 focus:bg-slate-700 focus:text-white">CPI Separator</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="text-sm font-bold text-secondary tracking-wide">Secondary Treatment</Label>
                        <Select value={train.secondary} onValueChange={(val) => updateTrain('secondary', val)}>
                          <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100 h-11 focus:ring-secondary">
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-700">
                            <SelectItem value="none" className="text-slate-200 focus:bg-slate-700 focus:text-white">None</SelectItem>
                            <SelectItem value="hydrocyclone" className="text-slate-200 focus:bg-slate-700 focus:text-white">De-oiling Hydrocyclone</SelectItem>
                            <SelectItem value="igf" className="text-slate-200 focus:bg-slate-700 focus:text-white">Induced Gas Flotation</SelectItem>
                            <SelectItem value="daf" className="text-slate-200 focus:bg-slate-700 focus:text-white">Dissolved Air Flotation</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-bold text-accent tracking-wide">Tertiary Treatment</Label>
                        <Select value={train.tertiary} onValueChange={(val) => updateTrain('tertiary', val)}>
                          <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100 h-11 focus:ring-accent">
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-700">
                            <SelectItem value="none" className="text-slate-200 focus:bg-slate-700 focus:text-white">None</SelectItem>
                            <SelectItem value="nutshell" className="text-slate-200 focus:bg-slate-700 focus:text-white">Nutshell Filter</SelectItem>
                            <SelectItem value="media" className="text-slate-200 focus:bg-slate-700 focus:text-white">Multi-Media Filter</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Right Panel: Visualization & Details */}
                <div className="lg:col-span-8 space-y-6">
                  {isCalculating ? (
                    <Card className="bg-card border-border shadow-lg h-96 flex flex-col items-center justify-center">
                      <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
                      <p className="text-slate-400 font-medium animate-pulse">Running advanced simulations...</p>
                    </Card>
                  ) : (
                    <>
                      <PwtVisualizer stageResults={results.stageResults} />
                      
                      {/* Detailed Stage Cards */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        {results.stageResults.map((stage, idx) => (
                          <Card key={idx} className="bg-card border-border shadow-lg hover:border-slate-600 transition-colors">
                            <CardHeader className="pb-3 bg-slate-800/30 rounded-t-xl border-b border-border">
                              <CardTitle className="text-sm font-bold text-slate-200 truncate">{stage.name}</CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 space-y-3">
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-400">Effluent OIW</span>
                                <span className="font-bold text-primary">{stage.outOiw.toFixed(1)} ppm</span>
                              </div>
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-400">Effluent TSS</span>
                                <span className="font-bold text-secondary">{stage.outTss.toFixed(1)} ppm</span>
                              </div>
                              <div className="w-full bg-slate-800 rounded-full h-2 mt-3 overflow-hidden shadow-inner">
                                <div 
                                  className="bg-gradient-to-r from-primary to-accent h-full rounded-full transition-all duration-1000" 
                                  style={{ width: `${Math.max(0, 100 - (stage.outOiw / inputs.oiw * 100))}%` }}
                                ></div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </>
                  )}
                </div>

              </div>
            </TabsContent>

            <TabsContent value="performance" className="m-0 focus-visible:outline-none">
              {isCalculating ? (
                 <Card className="bg-card border-border shadow-lg h-96 flex flex-col items-center justify-center">
                   <Loader2 className="w-12 h-12 text-secondary animate-spin mb-4" />
                   <p className="text-slate-400 font-medium animate-pulse">Updating analytics...</p>
                 </Card>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  
                  {/* Water Quality Profile Chart */}
                  <Card className="bg-card border-border shadow-lg">
                    <CardHeader className="bg-slate-800/30 border-b border-border rounded-t-xl">
                      <CardTitle className="text-lg font-semibold text-slate-100">Water Quality Profile</CardTitle>
                    </CardHeader>
                    <CardContent className="h-96 p-6">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={results.charts.qualityChartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                          <XAxis dataKey="stage" stroke="#94a3b8" tick={{fill: '#cbd5e1', fontSize: 12}} axisLine={{stroke: '#475569'}} />
                          <YAxis stroke="#94a3b8" tick={{fill: '#cbd5e1', fontSize: 12}} axisLine={{stroke: '#475569'}} />
                          <RechartsTooltip 
                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)' }}
                            itemStyle={{ color: '#f8fafc', fontWeight: 500 }}
                            cursor={{fill: '#1e293b'}}
                          />
                          <Legend wrapperStyle={{ fontSize: '13px', paddingTop: '10px' }}/>
                          <Bar dataKey="OIW" name="Oil in Water (ppm)" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={50} />
                          <Bar dataKey="TSS" name="Total Suspended Solids (ppm)" fill="var(--secondary)" radius={[4, 4, 0, 0]} maxBarSize={50} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Cost Breakdown Chart */}
                  <Card className="bg-card border-border shadow-lg">
                    <CardHeader className="bg-slate-800/30 border-b border-border rounded-t-xl">
                      <CardTitle className="text-lg font-semibold text-slate-100">OPEX Breakdown ($/m³)</CardTitle>
                    </CardHeader>
                    <CardContent className="h-96 p-6">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={results.charts.costChartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={70}
                            outerRadius={120}
                            paddingAngle={5}
                            dataKey="value"
                            label={({name, percent}) => `${name} ${(percent * 100).toFixed(0)}%`}
                            labelLine={false}
                            stroke="none"
                          >
                            {results.charts.costChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <RechartsTooltip 
                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)' }}
                            formatter={(value) => `$${value.toFixed(2)}`}
                            itemStyle={{fontWeight: 500}}
                          />
                          <Legend wrapperStyle={{ fontSize: '13px', paddingTop: '10px' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                </div>
              )}
            </TabsContent>

          </Tabs>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default ProducedWaterTreatment;