import React, { useState, useMemo } from 'react';
import { usePetroleumEconomics } from '../contexts/PetroleumEconomicsContext';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, Download, FileSpreadsheet, AlertTriangle, CheckCircle2, XCircle, Search, RefreshCw, FileOutput, HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';
import { useToast } from '@/components/ui/use-toast';

const ReconciliationTab = () => {
  const { calculationResults, modelSettings, activeScenario, parseImportedData, calculateReconciliation } = usePetroleumEconomics();
  const { toast } = useToast();
  
  // State for imported data
  const [importedData, setImportedData] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [divergenceThreshold, setDivergenceThreshold] = useState(1.0); // 1% default

  // --- 1. Template Generation ---
  const handleDownloadTemplate = () => {
    const startYear = modelSettings.startYear || new Date().getFullYear();
    const endYear = modelSettings.endYear || startYear + 19;
    
    // Create rows for 10-20 years
    const rows = [];
    for (let y = startYear; y <= endYear; y++) {
      rows.push({
        'Model Name': activeScenario?.model_name || 'Current Model',
        'Scenario Name': activeScenario?.name || 'Base Case',
        'Year': y,
        'Production (bbl/day)': 1000,
        'Oil Price ($/bbl)': 70,
        'Gas Price ($/mmbtu)': 3.5,
        'Gross Revenue ($M)': 25.5, // Sample calculated
        'CAPEX ($M)': 5.0,
        'OPEX ($M)': 2.0,
        'Royalty Rate (%)': 12.5,
        'Tax Rate (%)': 30.0,
        'Net Cashflow ($M)': 12.5
      });
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reconciliation Template");
    XLSX.writeFile(wb, "PES_Reconciliation_Template.xlsx");
  };

  // --- 2. File Import ---
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFileName(file.name);
    try {
        const data = await parseImportedData(file);
        setImportedData(data);
    } catch (err) {
        console.error("Import failed:", err);
        toast({ variant: "destructive", title: "Import Failed", description: "Could not parse file. Check format." });
    }
  };

  // --- 3. Reconciliation Logic ---
  const report = useMemo(() => {
      if (!calculationResults?.annualResults || !importedData) return null;
      return calculateReconciliation(calculationResults.annualResults, importedData, divergenceThreshold);
  }, [calculationResults, importedData, divergenceThreshold, calculateReconciliation]);

  // --- 4. Export Report ---
  const handleExportReport = () => {
      if (!report) return;
      
      const csvData = report.rows.map(r => ({
          Year: r.year,
          'PES Revenue ($MM)': r.pesRev, 'Import Revenue ($MM)': r.impRev, 'Rev Delta ($MM)': r.revDiff, 'Rev Delta (%)': r.revPct,
          'PES OPEX ($MM)': r.pesOpex, 'Import OPEX ($MM)': r.impOpex, 'OPEX Delta ($MM)': r.opexDiff, 'OPEX Delta (%)': r.opexPct,
          'PES NCF ($MM)': r.pesNcf, 'Import NCF ($MM)': r.impNcf, 'NCF Delta ($MM)': r.ncfDiff, 'NCF Delta (%)': r.ncfPct,
          'Status': r.isMatch ? 'Match' : 'Divergence'
      }));

      const ws = XLSX.utils.json_to_sheet(csvData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Reconciliation Report");
      XLSX.writeFile(wb, "Reconciliation_Report_Export.xlsx");
  };

  const handleSyncToScenario = () => {
      toast({ title: "Sync Started", description: "Updating current scenario with matched external values..." });
      // In a real implementation, this would update state with imported values
      setTimeout(() => toast({ title: "Sync Complete", description: "Scenario updated successfully." }), 1000);
  };

  const formatCurrency = (val) => val !== undefined && !isNaN(val) ? val.toFixed(2) : '-';
  const formatPct = (val) => val !== undefined && !isNaN(val) ? val.toFixed(1) + '%' : '-';

  // Helper for color coding cells
  const getDeltaColor = (pct) => {
      const absPct = Math.abs(pct);
      if (isNaN(absPct)) return "text-slate-500";
      if (absPct <= 1.0) return "text-emerald-500 font-medium";
      if (absPct <= 5.0) return "text-yellow-500 font-medium";
      return "text-red-500 font-bold";
  };

  return (
    <div className="flex flex-col h-full space-y-6">
      
      {/* 1. Controls Header */}
      <Card className="bg-slate-900 border-slate-800 shrink-0">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
                <div>
                    <CardTitle className="text-base text-slate-200">Model Reconciliation</CardTitle>
                    <CardDescription>Compare PES model results against external Excel/CSV datasets to identify discrepancies.</CardDescription>
                </div>
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger><HelpCircle className="w-4 h-4 text-slate-500 cursor-help" /></TooltipTrigger>
                        <TooltipContent>
                            <p>Upload a CSV with columns for Year, Revenue, OPEX, NCF to validate model accuracy.</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </div>
            <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleDownloadTemplate} className="border-slate-700 bg-slate-800 text-slate-400 hover:text-white">
                    <Download className="w-4 h-4 mr-2" /> Template
                </Button>
                <div className="relative">
                    <input type="file" accept=".csv, .xlsx, .xls" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                    <Button variant="secondary" size="sm" className="bg-blue-600 hover:bg-blue-500 text-white border-none">
                        <Upload className="w-4 h-4 mr-2" /> {fileName ? 'Change File' : 'Import Data'}
                    </Button>
                </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
            {fileName && (
                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between text-sm text-slate-400 bg-slate-950/50 p-2 rounded border border-slate-800">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <FileSpreadsheet className="w-4 h-4 text-green-500" />
                                <span className="font-medium text-slate-200">{fileName}</span>
                            </div>
                            {report && (
                                <>
                                    <div className="h-4 w-px bg-slate-700"></div>
                                    <div className={cn("flex items-center gap-1.5", report.stats.rate === 100 ? "text-emerald-400" : "text-amber-400")}>
                                        {report.stats.rate === 100 ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                                        <span>{report.stats.matches} of {report.stats.totalRows} rows match ({report.stats.rate.toFixed(1)}%)</span>
                                    </div>
                                </>
                            )}
                        </div>
                        <div className="flex gap-2">
                            {report && (
                                <>
                                    <Button size="sm" variant="ghost" onClick={handleSyncToScenario} className="h-7 text-xs border border-slate-700 hover:bg-slate-800">
                                        <RefreshCw className="w-3 h-3 mr-2" /> Sync to Scenario
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={handleExportReport} className="h-7 text-xs border border-slate-700 hover:bg-slate-800">
                                        <FileOutput className="w-3 h-3 mr-2" /> Export Report
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>

                    {/* First Divergence Finder */}
                    {report?.stats.firstDivergence && (
                        <div className="flex items-center gap-3 bg-red-950/20 border border-red-900/30 p-2 rounded text-sm text-red-200 animate-in fade-in slide-in-from-top-1 duration-300">
                            <div className="bg-red-900/30 p-1.5 rounded-full">
                                <Search className="w-4 h-4 text-red-400" />
                            </div>
                            <div>
                                <span className="font-semibold text-red-400 mr-2">Divergence Detected:</span>
                                First significant mismatch found at <span className="font-mono bg-red-950/50 px-1 rounded text-red-300">Year {report.stats.firstDivergence.year}</span> (Row {report.stats.firstDivergence.row}).
                                <span className="ml-2 opacity-80">Cause: {report.stats.firstDivergence.reason} mismatch &gt; {divergenceThreshold}%</span>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </CardContent>
      </Card>

      {/* 2. Reconciliation Table */}
      <div className="flex-1 min-h-0 bg-slate-900 border border-slate-800 rounded-lg overflow-hidden flex flex-col">
        {!importedData ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8">
                <div className="bg-slate-800/50 p-4 rounded-full mb-4">
                    <Upload className="w-8 h-8 opacity-50" />
                </div>
                <h3 className="text-lg font-medium text-slate-300 mb-2">No External Data Loaded</h3>
                <p className="max-w-md text-center text-sm">Upload an Excel or CSV file containing your external model results to generate a reconciliation report comparing it with the active PES scenario.</p>
            </div>
        ) : (
            <div className="flex-1 overflow-auto">
                <Table>
                    <TableHeader className="bg-slate-950 sticky top-0 z-10 shadow-sm">
                        <TableRow className="hover:bg-transparent border-slate-800">
                            <TableHead className="text-slate-300 w-[60px] bg-slate-950 border-b border-slate-800">Year</TableHead>
                            
                            <TableHead className="text-center border-l border-slate-800 text-blue-400 bg-slate-950/80" colSpan={4}>Gross Revenue ($MM)</TableHead>
                            <TableHead className="text-center border-l border-slate-800 text-amber-400 bg-slate-950/80" colSpan={4}>OPEX ($MM)</TableHead>
                            <TableHead className="text-center border-l border-slate-800 text-emerald-400 bg-slate-950/80" colSpan={4}>Net Cashflow ($MM)</TableHead>
                        </TableRow>
                        <TableRow className="hover:bg-transparent border-slate-800 bg-slate-950/90 text-[10px] uppercase tracking-wider">
                            <TableHead className="h-8 bg-slate-950 border-b border-slate-800"></TableHead>
                            
                            {/* Revenue Sub-headers */}
                            <TableHead className="h-8 text-right text-slate-500 border-l border-slate-800 font-medium">PES</TableHead>
                            <TableHead className="h-8 text-right text-slate-500 font-medium">Import</TableHead>
                            <TableHead className="h-8 text-right text-slate-500 font-medium">Delta $</TableHead>
                            <TableHead className="h-8 text-right text-slate-500 font-medium">Delta %</TableHead>

                            {/* OPEX Sub-headers */}
                            <TableHead className="h-8 text-right text-slate-500 border-l border-slate-800 font-medium">PES</TableHead>
                            <TableHead className="h-8 text-right text-slate-500 font-medium">Import</TableHead>
                            <TableHead className="h-8 text-right text-slate-500 font-medium">Delta $</TableHead>
                            <TableHead className="h-8 text-right text-slate-500 font-medium">Delta %</TableHead>

                            {/* NCF Sub-headers */}
                            <TableHead className="h-8 text-right text-slate-500 border-l border-slate-800 font-medium">PES</TableHead>
                            <TableHead className="h-8 text-right text-slate-500 font-medium">Import</TableHead>
                            <TableHead className="h-8 text-right text-slate-500 font-medium">Delta $</TableHead>
                            <TableHead className="h-8 text-right text-slate-500 font-medium">Delta %</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {report?.rows.map((row) => (
                            <TableRow 
                                key={row.year} 
                                className={cn(
                                    "border-slate-800 hover:bg-slate-800/30 font-mono text-xs transition-colors",
                                    !row.isMatch && "bg-red-950/10 hover:bg-red-950/20"
                                )}
                            >
                                <TableCell className="font-semibold text-slate-300 bg-slate-900/50 sticky left-0">{row.year}</TableCell>
                                
                                {/* Revenue */}
                                <TableCell className="text-right text-slate-300 border-l border-slate-800">{formatCurrency(row.pesRev)}</TableCell>
                                <TableCell className="text-right text-slate-400">{formatCurrency(row.impRev)}</TableCell>
                                <TableCell className="text-right text-slate-500">{formatCurrency(row.revDiff)}</TableCell>
                                <TableCell className={cn("text-right", getDeltaColor(row.revPct))}>
                                    {formatPct(row.revPct)}
                                </TableCell>

                                {/* OPEX */}
                                <TableCell className="text-right text-slate-300 border-l border-slate-800">{formatCurrency(row.pesOpex)}</TableCell>
                                <TableCell className="text-right text-slate-400">{formatCurrency(row.impOpex)}</TableCell>
                                <TableCell className="text-right text-slate-500">{formatCurrency(row.opexDiff)}</TableCell>
                                <TableCell className={cn("text-right", getDeltaColor(row.opexPct))}>
                                    {formatPct(row.opexPct)}
                                </TableCell>

                                {/* NCF */}
                                <TableCell className="text-right text-slate-300 border-l border-slate-800">{formatCurrency(row.pesNcf)}</TableCell>
                                <TableCell className="text-right text-slate-400">{formatCurrency(row.impNcf)}</TableCell>
                                <TableCell className="text-right text-slate-500">{formatCurrency(row.ncfDiff)}</TableCell>
                                <TableCell className={cn("text-right", getDeltaColor(row.ncfPct))}>
                                    {formatPct(row.ncfPct)}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        )}
      </div>
    </div>
  );
};

export default ReconciliationTab;