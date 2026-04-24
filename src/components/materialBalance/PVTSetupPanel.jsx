import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Calculator, AlertCircle, RefreshCw, FileSpreadsheet } from 'lucide-react';
import { useMaterialBalance } from '@/hooks/useMaterialBalance';
import { pvtCalcs } from '@/utils/pvtCalculations';
import PVTPlots from './plots/PVTPlots';
import { useToast } from '@/components/ui/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';

const PVTSetupPanel = () => {
  const { pvtData, setPvtData } = useMaterialBalance();
  const { toast } = useToast();

  // We store as strings to allow typing decimals without immediate coercion issues
  const [inputs, setInputs] = useState({
    api: '35',
    gasGravity: '0.75',
    temp: '220',
    pb: '3500',
    correlations: {
      pb_rs_bo: 'standing',
      viscosity: 'beal_cook_spillman'
    }
  });

  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState(null);

  const handleInputChange = (field, value) => {
    setInputs(prev => ({
      ...prev,
      [field]: value
    }));
    if (error) setError(null);
  };

  const handleCorrelationChange = (type, value) => {
    setInputs(prev => ({
      ...prev,
      correlations: {
        ...prev.correlations,
        [type]: value
      }
    }));
    if (error) setError(null);
  };

  const generatePVT = async () => {
    console.log("PVTSetupPanel: Generating PVT Table initialized. Raw Inputs:", inputs);
    setIsCalculating(true);
    setError(null);

    try {
      const parsedInputs = {
          api: parseFloat(inputs.api),
          gasGravity: parseFloat(inputs.gasGravity),
          temp: parseFloat(inputs.temp),
          pb: parseFloat(inputs.pb),
          correlations: inputs.correlations
      };

      console.log("PVTSetupPanel: Parsed Inputs:", parsedInputs);

      // Input validation
      if (isNaN(parsedInputs.api) || parsedInputs.api <= 0 || 
          isNaN(parsedInputs.gasGravity) || parsedInputs.gasGravity <= 0 || 
          isNaN(parsedInputs.temp) || parsedInputs.temp <= 0 || 
          isNaN(parsedInputs.pb) || parsedInputs.pb <= 0) {
        throw new Error("All PVT parameters must be valid numbers greater than zero.");
      }

      // Simulate async processing for better UX feedback and unblocking main thread
      await new Promise(resolve => setTimeout(resolve, 500));

      const results = pvtCalcs.generatePvtTable(parsedInputs);
      console.log("PVTSetupPanel: Generation successful. Rows computed:", results?.length);
      
      if (!results || results.length === 0) {
        throw new Error("Calculation returned empty results. Check input ranges.");
      }

      // Set global context state
      setPvtData(results);
      
      toast({
        title: "PVT Table Generated",
        description: `Successfully computed ${results.length} pressure points.`,
        variant: "default",
        className: "bg-emerald-950 text-white border-emerald-800"
      });

    } catch (err) {
      console.error("PVTSetupPanel: Calculation error -", err);
      setError(err.message);
      toast({
        title: "Calculation Failed",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setIsCalculating(false);
    }
  };

  // Generate default PVT on first mount if empty
  useEffect(() => {
    if (!pvtData || pvtData.length === 0) {
      generatePVT();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 h-full">
      
      {/* LEFT COLUMN: Inputs & Controls */}
      <Card className="xl:col-span-4 bg-slate-900 border-slate-800 flex flex-col shadow-lg">
        <CardHeader className="p-4 border-b border-slate-800 bg-slate-900/80">
          <CardTitle className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Calculator className="w-4 h-4 text-blue-400" />
            PVT Correlation Engine
          </CardTitle>
        </CardHeader>
        
        <CardContent className="p-4 flex-1 overflow-y-auto space-y-6">
            
          {/* Fluid Properties */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase border-b border-slate-800 pb-1">Fluid Properties</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">Oil Gravity (°API)</Label>
                <Input 
                  type="number" 
                  step="0.1"
                  value={inputs.api} 
                  onChange={(e) => handleInputChange('api', e.target.value)}
                  className="h-9 text-sm bg-slate-950 border-slate-700 text-slate-200" 
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">Gas Gravity (SG)</Label>
                <Input 
                  type="number" 
                  step="0.01"
                  value={inputs.gasGravity} 
                  onChange={(e) => handleInputChange('gasGravity', e.target.value)}
                  className="h-9 text-sm bg-slate-950 border-slate-700 text-slate-200" 
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">Reservoir Temp (°F)</Label>
                <Input 
                  type="number" 
                  step="1"
                  value={inputs.temp} 
                  onChange={(e) => handleInputChange('temp', e.target.value)}
                  className="h-9 text-sm bg-slate-950 border-slate-700 text-slate-200" 
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">Bubble Point (psia)</Label>
                <Input 
                  type="number" 
                  step="10"
                  value={inputs.pb} 
                  onChange={(e) => handleInputChange('pb', e.target.value)}
                  className="h-9 text-sm bg-slate-950 border-slate-700 text-slate-200" 
                />
              </div>
            </div>
          </div>

          {/* Correlations Selection */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase border-b border-slate-800 pb-1">Correlations</h3>
            
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">Pb, Rs, Bo</Label>
                <Select 
                    value={inputs.correlations.pb_rs_bo} 
                    onValueChange={(v) => handleCorrelationChange('pb_rs_bo', v)}
                >
                  <SelectTrigger className="h-9 text-sm bg-slate-950 border-slate-700 text-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standing">Standing (1947)</SelectItem>
                    <SelectItem value="vasquez_beggs">Vasquez & Beggs (1980)</SelectItem>
                    <SelectItem value="glaso">Glaso (1980)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">Oil Viscosity</Label>
                <Select 
                    value={inputs.correlations.viscosity} 
                    onValueChange={(v) => handleCorrelationChange('viscosity', v)}
                >
                  <SelectTrigger className="h-9 text-sm bg-slate-950 border-slate-700 text-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beal_cook_spillman">Beal, Cook & Spillman</SelectItem>
                    <SelectItem value="beggs_robinson">Beggs & Robinson</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {error && (
            <Alert variant="destructive" className="bg-red-950/50 border-red-900 mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle className="text-xs font-bold">Calculation Error</AlertTitle>
              <AlertDescription className="text-[11px]">{error}</AlertDescription>
            </Alert>
          )}

        </CardContent>

        <CardFooter className="p-4 border-t border-slate-800 bg-slate-900/80">
          <Button 
            onClick={generatePVT} 
            disabled={isCalculating} 
            className="w-full bg-blue-600 hover:bg-blue-500 text-white shadow-md font-semibold transition-all duration-200"
          >
            {isCalculating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Computing Thermodynamics...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Recalculate PVT Table
              </>
            )}
          </Button>
        </CardFooter>
      </Card>

      {/* RIGHT COLUMN: Table & Plots */}
      <div className="xl:col-span-8 flex flex-col gap-4 min-h-[500px]">
        <Tabs defaultValue="plots" className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-xl shadow-lg overflow-hidden">
          <div className="px-4 border-b border-slate-800 bg-slate-950/50 pt-2">
            <TabsList className="bg-transparent p-0 w-auto justify-start">
              <TabsTrigger 
                value="plots" 
                className="rounded-t-md rounded-b-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-slate-900 data-[state=active]:text-blue-400 text-slate-400 text-xs px-6 py-2.5 transition-colors"
              >
                PVT Curves
              </TabsTrigger>
              <TabsTrigger 
                value="table" 
                className="rounded-t-md rounded-b-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-slate-900 data-[state=active]:text-blue-400 text-slate-400 text-xs px-6 py-2.5 transition-colors"
              >
                Data Table
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="plots" className="flex-1 m-0 p-4 min-h-0 bg-slate-900 outline-none">
            {isCalculating ? (
               <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
                 <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                 <span className="text-sm font-medium animate-pulse">Rendering PVT profiles...</span>
               </div>
            ) : (
               <PVTPlots />
            )}
          </TabsContent>

          <TabsContent value="table" className="flex-1 m-0 min-h-0 bg-slate-900 outline-none flex flex-col">
            <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                <div className="text-xs font-bold text-slate-300 uppercase flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                    Generated Properties
                </div>
                <div className="text-[10px] text-slate-500">
                    {pvtData?.length || 0} pressure points
                </div>
            </div>
            
            <ScrollArea className="flex-1 relative">
              {isCalculating ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 backdrop-blur-sm z-10 space-y-4">
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                    <span className="text-sm font-medium text-slate-300 animate-pulse">Computing thermodynamics...</span>
                </div>
              ) : pvtData && pvtData.length > 0 ? (
                <Table>
                  <TableHeader className="bg-slate-950 sticky top-0 z-10 shadow-sm">
                    <TableRow className="hover:bg-slate-950 border-b border-slate-800">
                      <TableHead className="text-xs h-9 text-slate-400 font-bold whitespace-nowrap">Pressure<br/><span className="text-[10px] font-normal text-slate-500">(psia)</span></TableHead>
                      <TableHead className="text-xs h-9 text-slate-400 font-bold whitespace-nowrap text-right">Rs<br/><span className="text-[10px] font-normal text-slate-500">(scf/stb)</span></TableHead>
                      <TableHead className="text-xs h-9 text-slate-400 font-bold whitespace-nowrap text-right">Bo<br/><span className="text-[10px] font-normal text-slate-500">(rb/stb)</span></TableHead>
                      <TableHead className="text-xs h-9 text-slate-400 font-bold whitespace-nowrap text-right">Bg<br/><span className="text-[10px] font-normal text-slate-500">(rb/scf)</span></TableHead>
                      <TableHead className="text-xs h-9 text-slate-400 font-bold whitespace-nowrap text-right">Oil Visc<br/><span className="text-[10px] font-normal text-slate-500">(cp)</span></TableHead>
                      <TableHead className="text-xs h-9 text-slate-400 font-bold whitespace-nowrap text-right pr-4">Gas Visc<br/><span className="text-[10px] font-normal text-slate-500">(cp)</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pvtData.map((row, i) => (
                      <TableRow key={i} className={`hover:bg-slate-800/80 border-b border-slate-800/50 transition-colors ${row.pressure === parseFloat(inputs.pb) ? 'bg-blue-900/20' : ''}`}>
                        <TableCell className="text-xs py-2 font-mono text-slate-300">
                            {row.pressure} {row.pressure === parseFloat(inputs.pb) && <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 uppercase tracking-wider">Pb</span>}
                        </TableCell>
                        <TableCell className="text-xs py-2 text-right font-mono text-blue-300">{row.Rs}</TableCell>
                        <TableCell className="text-xs py-2 text-right font-mono text-emerald-400">{row.Bo}</TableCell>
                        <TableCell className="text-xs py-2 text-right font-mono text-red-400">{row.Bg}</TableCell>
                        <TableCell className="text-xs py-2 text-right font-mono text-amber-400">{row.mu_o}</TableCell>
                        <TableCell className="text-xs py-2 text-right font-mono text-purple-400 pr-4">{row.mu_g}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="h-full min-h-[300px] flex items-center justify-center text-sm text-slate-500 p-8">
                  <div className="text-center space-y-2">
                      <AlertCircle className="w-8 h-8 mx-auto text-slate-600 opacity-50" />
                      <p>No PVT data generated yet.</p>
                      <p className="text-xs">Adjust parameters and click "Recalculate PVT Table".</p>
                  </div>
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default PVTSetupPanel;