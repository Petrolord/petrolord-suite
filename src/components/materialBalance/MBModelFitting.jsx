import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Activity, Save } from 'lucide-react';
import { useMaterialBalance } from '@/hooks/useMaterialBalance';
import { calculateDiagnosticDataFromSeries } from '@/utils/materialBalance/DiagnosticCalculator';
import { fitVolumetricModel, fitGasCapModel, fitWaterDriveModel } from '@/utils/materialBalance/MBModelFittingEngine';
import { useToast } from '@/components/ui/use-toast';

const MBModelFitting = () => {
  const { timeSeries, updateFittedModels } = useMaterialBalance();
  const [modelType, setModelType] = useState('volumetric');
  const [results, setResults] = useState(null);
  const { toast } = useToast();

  const runFitting = () => {
    if (!timeSeries || timeSeries.length < 3) {
      setResults({ error: "Not enough calculation points available. Ensure production and pressure data exist." });
      return;
    }

    // Convert timeSeries directly into diagnostic plottable points
    const diagnosticData = calculateDiagnosticDataFromSeries(timeSeries);

    let res;
    switch (modelType) {
      case 'volumetric':
        res = fitVolumetricModel(diagnosticData);
        break;
      case 'gascap':
        res = fitGasCapModel(diagnosticData);
        break;
      case 'water':
        res = fitWaterDriveModel(diagnosticData);
        break;
      default:
        res = fitVolumetricModel(diagnosticData);
    }
    
    setResults(res);

    if (res.error) {
      toast({ title: "Fitting Failed", description: "See diagnostics panel for details.", variant: "destructive" });
    } else {
      toast({ title: "Fitting Complete", description: `R²: ${res.R2.toFixed(4)}`, variant: "success" });
    }
  };

  const saveModel = () => {
    if (results && !results.error) {
      updateFittedModels(results.params);
      toast({ title: "Model Saved", description: "Parameters updated for forecasting." });
    }
  };

  const fmt = (num) => {
    if (num === undefined || num === null || isNaN(num)) return '-';
    if (Math.abs(num) > 1e6) return (num / 1e6).toFixed(2) + ' MM';
    if (Math.abs(num) > 1e3) return (num / 1e3).toFixed(2) + ' k';
    return num.toFixed(2);
  };

  return (
    <Card className="bg-slate-900 border-slate-800 h-full flex flex-col">
      <CardHeader className="p-3 border-b border-slate-800 bg-slate-900/50 flex flex-row justify-between items-center">
        <CardTitle className="text-xs font-bold text-slate-300 uppercase flex items-center gap-2">
          <Activity className="w-3 h-3 text-blue-400" /> Model Fitting
        </CardTitle>
        {results && !results.error && (
            <Badge variant="outline" className={`${results.R2 > 0.9 ? 'text-green-400 border-green-900' : 'text-yellow-400 border-yellow-900'}`}>
                R² {results.R2.toFixed(3)}
            </Badge>
        )}
      </CardHeader>
      <CardContent className="flex-1 p-3 space-y-4 overflow-y-auto">
        
        {/* Controls */}
        <div className="space-y-2">
          <label className="text-[10px] text-slate-500 font-semibold">MODEL TYPE</label>
          <Select value={modelType} onValueChange={setModelType}>
            <SelectTrigger className="h-8 text-xs bg-slate-950 border-slate-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="volumetric">Volumetric (Oil)</SelectItem>
              <SelectItem value="gascap">Gas Cap (Oil)</SelectItem>
              <SelectItem value="water">Water Drive (Pot Aquifer)</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={runFitting} className="w-full h-8 text-xs bg-blue-600 hover:bg-blue-500">
            Run Regression
          </Button>
        </div>

        {/* Results & Diagnostics (Task 7) */}
        {results && results.error ? (
          <div className="mb-diagnostic-error flex flex-col gap-2">
            <div className="flex items-center gap-1 font-bold">
              <AlertTriangle className="w-3 h-3" /> Calculation Failed
            </div>
            <span>{results.error}</span>
          </div>
        ) : results ? (
          <div className="space-y-4 animate-in fade-in">
            <div className="space-y-2">
                <label className="text-[10px] text-slate-500 font-semibold">PARAMETERS</label>
                <Table>
                    <TableBody>
                        <TableRow className="border-slate-800 hover:bg-transparent">
                            <TableCell className="py-1 text-[10px] text-slate-400">N (OOIP)</TableCell>
                            <TableCell className="py-1 text-[10px] font-mono text-right text-slate-200">{fmt(results.N)} STB</TableCell>
                        </TableRow>
                        {results.m !== undefined && (
                            <TableRow className="border-slate-800 hover:bg-transparent">
                                <TableCell className="py-1 text-[10px] text-slate-400">m (Ratio)</TableCell>
                                <TableCell className="py-1 text-[10px] font-mono text-right text-slate-200">{results.m.toFixed(3)}</TableCell>
                            </TableRow>
                        )}
                        {results.U !== undefined && (
                            <TableRow className="border-slate-800 hover:bg-transparent">
                                <TableCell className="py-1 text-[10px] text-slate-400">U (Aq. Const)</TableCell>
                                <TableCell className="py-1 text-[10px] font-mono text-right text-slate-200">{results.U.toFixed(2)}</TableCell>
                            </TableRow>
                        )}
                        <TableRow className="border-slate-800 hover:bg-transparent">
                            <TableCell className="py-1 text-[10px] text-slate-400">RMSE</TableCell>
                            <TableCell className="py-1 text-[10px] font-mono text-right text-slate-200">{results.RMSE.toFixed(4)}</TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </div>

            <Button onClick={saveModel} variant="secondary" className="w-full h-8 text-xs gap-2 border-slate-700">
                <Save className="w-3 h-3" /> Save Parameters
            </Button>
          </div>
        ) : (
            <div className="text-center py-8 text-slate-600 text-xs">
                Select a model and run regression to estimate parameters.
            </div>
        )}

      </CardContent>
    </Card>
  );
};

export default MBModelFitting;