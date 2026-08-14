import React from 'react';
import { usePetroleumEconomics } from '../contexts/PetroleumEconomicsContext';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileSpreadsheet, Download, Table, FileText, Layers, AlertCircle, FileJson, FileCode } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { useToast } from '@/components/ui/use-toast';
import { format } from 'date-fns';

const ExportTab = () => {
  const { 
    currentProject, 
    currentModel, 
    activeScenario, 
    modelSettings, 
    productionData, 
    costData, 
    fiscalTerms, 
    calculationResults, 
    scenarios, 
    assumptions, 
    priceAssumptions 
  } = usePetroleumEconomics();
  
  const { toast } = useToast();

  const getFilenameBase = () => {
      const modelName = currentModel?.name?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'model';
      const scenarioName = activeScenario?.name?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'scenario';
      const dateStr = format(new Date(), 'yyyyMMdd');
      return `${modelName}_${scenarioName}_${dateStr}`;
  };

  const handleExportExcel = () => {
    if (!activeScenario || !calculationResults) {
        toast({ variant: 'destructive', title: 'Export Failed', description: 'No active scenario results to export. Please calculate the model first.' });
        return;
    }

    try {
        const wb = XLSX.utils.book_new();
        const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss');
        const filename = `${getFilenameBase()}.xlsx`;

        // --- Helper Styles ---
        const currencyFmt = '"$"#,##0.00';
        const percentFmt = '0.00%';
        
        const setColWidths = (ws, widths) => {
            ws['!cols'] = widths.map(w => ({ wch: w }));
        };

        // --- 1. Dashboard Sheet ---
        const metrics = calculationResults.metrics || {};
        const dashboardData = [
            ['Report Generated', timestamp],
            ['Project', currentProject?.name || 'N/A'],
            ['Model', currentModel?.name],
            ['Active Scenario', activeScenario?.name],
            ['Status', activeScenario?.status],
            [],
            ['KEY METRICS', 'Value', 'Unit'],
            ['NPV', metrics.npv, '$'],
            ['IRR', metrics.irr ? metrics.irr / 100 : 0, '%'], 
            ['DPI', metrics.dpi, 'ratio'],
            ['Payback Year', metrics.payback_year, 'Year'],
            ['Unit Tech Cost', metrics.unit_technical_cost, '$/boe'],
            ['Breakeven Price', metrics.breakeven_price ?? 'N/A', '$/boe'],
            [],
            ['CHARTS DATA SOURCE', '', ''],
            ['Year', 'Oil Rate', 'Gas Rate', 'Net Cashflow', 'Cum Cashflow']
        ];

        // Append chart data
        calculationResults.annualResults.forEach(r => {
            const prod = productionData.find(p => p.year === r.year) || {};
            dashboardData.push([
                r.year, 
                prod.oil_rate || 0, 
                prod.gas_rate || 0, 
                r.net_cashflow, 
                r.cumulative_cashflow
            ]);
        });

        const wsDashboard = XLSX.utils.aoa_to_sheet(dashboardData);
        setColWidths(wsDashboard, [25, 15, 10, 15, 15]);
        // Apply number formats manually where needed (simplified loop)
        Object.keys(wsDashboard).forEach(cell => {
            if(cell.startsWith('B') && parseInt(cell.substring(1)) === 9) wsDashboard[cell].z = percentFmt; // IRR
            if(cell.startsWith('B') && parseInt(cell.substring(1)) === 8) wsDashboard[cell].z = currencyFmt; // NPV
        });
        XLSX.utils.book_append_sheet(wb, wsDashboard, "Dashboard");


        // --- 2. Setup Sheet ---
        const setupData = [
            ['MODEL SETTINGS'],
            ['Start Year', modelSettings.startYear],
            ['End Year', modelSettings.endYear],
            ['Discount Rate', modelSettings.discountRate],
            ['Currency', modelSettings.currency],
            ['Inflation Enabled', modelSettings.inflationEnabled],
            ['Inflation Rate', modelSettings.inflationRate || 0],
            [],
            ['ASSUMPTIONS'],
            ['Working Interest', assumptions.workingInterest / 100],
            ['Net Revenue Interest', assumptions.netRevenueInterest / 100],
            ['Tax Rate', assumptions.taxRate / 100],
            ['Royalty Rate', assumptions.royaltyRate / 100],
            ['Uptime', assumptions.uptime / 100],
            [],
            ['PRICE ASSUMPTIONS'],
            ['Oil Price (Base)', priceAssumptions.oilPrice],
            ['Gas Price (Base)', priceAssumptions.gasPrice],
            ['Escalation', priceAssumptions.escalation],
            ['Price Deck Type', modelSettings.priceDeckType]
        ];
        const wsSetup = XLSX.utils.aoa_to_sheet(setupData);
        setColWidths(wsSetup, [25, 15]);
        XLSX.utils.book_append_sheet(wb, wsSetup, "Setup");


        // --- 3. Production Sheet ---
        const prodHeaders = ['Year', 'Oil Rate', 'Gas Rate', 'Condensate Rate', 'Notes'];
        const prodRows = [prodHeaders];
        productionData.forEach(row => {
            prodRows.push([
                row.year,
                row.oil_rate,
                row.gas_rate,
                row.condensate_rate,
                row.notes
            ]);
        });
        const wsProd = XLSX.utils.aoa_to_sheet(prodRows);
        setColWidths(wsProd, [10, 15, 15, 15, 40]);
        XLSX.utils.book_append_sheet(wb, wsProd, "Production");


        // --- 4. Costs Sheet ---
        const costHeaders = ['Year', 'Drilling CAPEX', 'Facilities CAPEX', 'Abandonment CAPEX', 'Fixed OPEX', 'Var Oil OPEX', 'Var Gas OPEX'];
        const costRows = [costHeaders];
        
        // Merge capex and opex by year
        const allYears = Array.from(new Set([
            ...(costData.capexProfile?.map(c => c.year) || []), 
            ...(costData.opexProfile?.map(c => c.year) || [])
        ])).sort((a,b) => a-b);

        allYears.forEach(y => {
            const c = costData.capexProfile?.find(i => i.year === y) || {};
            const o = costData.opexProfile?.find(i => i.year === y) || {};
            costRows.push([
                y,
                c.drilling_capex || 0,
                c.facilities_capex || 0,
                c.abandonment_capex || 0,
                o.fixed_opex || 0,
                o.variable_oil || 0,
                o.variable_gas || 0
            ]);
        });
        const wsCosts = XLSX.utils.aoa_to_sheet(costRows);
        setColWidths(wsCosts, [10, 18, 18, 18, 18, 18, 18]);
        XLSX.utils.book_append_sheet(wb, wsCosts, "Costs");


        // --- 5. Fiscal Sheet ---
        const fiscalData = [
            ['FISCAL TERMS CONFIGURATION'],
            ['Regime Type', fiscalTerms?.template_type || 'Generic'],
            [],
            ['Parameter', 'Value'],
            ...Object.entries(fiscalTerms || {})
                .filter(([k]) => k !== 'id' && k !== 'scenario_id' && k !== 'created_at')
                .map(([k, v]) => [k, v])
        ];
        const wsFiscal = XLSX.utils.aoa_to_sheet(fiscalData);
        setColWidths(wsFiscal, [25, 20]);
        XLSX.utils.book_append_sheet(wb, wsFiscal, "Fiscal");


        // --- 6. Cashflow Sheet ---
        const cfHeaders = [
            'Year', 'Gross Revenue', 'Royalties', 'OPEX', 'CAPEX', 
            'Recoverable Cost', 'Profit Share', 'Taxable Income', 
            'Tax', 'Govt Take', 'Net Cashflow', 'Cumulative Cashflow'
        ];
        const cfRows = [cfHeaders];
        calculationResults.annualResults.forEach(r => {
            cfRows.push([
                r.year, r.gross_revenue, r.royalties, r.opex, r.capex,
                r.recoverable_cost, r.profit_share, r.taxable_income,
                r.tax, r.govt_take, r.net_cashflow, r.cumulative_cashflow
            ]);
        });
        const wsCashflow = XLSX.utils.aoa_to_sheet(cfRows);
        setColWidths(wsCashflow, [10, 18, 15, 15, 15, 18, 15, 18, 15, 15, 18, 20]);
        XLSX.utils.book_append_sheet(wb, wsCashflow, "Cashflow");


        // --- 7. Scenarios Sheet ---
        const scenHeaders = ['Scenario Name', 'Status', 'NPV', 'IRR', 'DPI', 'Payback', 'Created At'];
        const scenRows = [scenHeaders];
        scenarios.forEach(s => {
            scenRows.push([
                s.name,
                s.status,
                s.metrics?.npv,
                s.metrics?.irr ? s.metrics.irr / 100 : 0,
                s.metrics?.dpi,
                s.metrics?.payback_year,
                format(new Date(s.created_at), 'yyyy-MM-dd HH:mm')
            ]);
        });
        const wsScenarios = XLSX.utils.aoa_to_sheet(scenRows);
        setColWidths(wsScenarios, [25, 15, 15, 10, 10, 10, 20]);
        XLSX.utils.book_append_sheet(wb, wsScenarios, "Scenarios");


        // --- Write File ---
        XLSX.writeFile(wb, filename);
        toast({ title: 'Export Successful', description: `Downloaded ${filename}` });

    } catch (err) {
        console.error("Export Error:", err);
        toast({ variant: 'destructive', title: 'Export Error', description: 'Could not generate Excel file.' });
    }
  };

  const handleExportJSON = () => {
      if (!activeScenario || !calculationResults) {
          toast({ variant: 'destructive', title: 'Export Failed', description: 'No active scenario results to export.' });
          return;
      }

      try {
          const exportObject = {
              metadata: {
                  project: currentProject?.name,
                  model: currentModel?.name,
                  scenario: activeScenario?.name,
                  exportedAt: new Date().toISOString(),
                  version: "1.0"
              },
              settings: modelSettings,
              assumptions: {
                  general: assumptions,
                  prices: priceAssumptions,
                  fiscal: fiscalTerms
              },
              inputs: {
                  production: productionData,
                  costs: costData,
              },
              results: {
                  metrics: calculationResults.metrics,
                  cashflow: calculationResults.annualResults
              },
              comparison: {
                  scenarios: scenarios.map(s => ({
                      id: s.id,
                      name: s.name,
                      status: s.status,
                      metrics: s.metrics
                  }))
              }
          };

          const jsonString = JSON.stringify(exportObject, null, 2);
          const blob = new Blob([jsonString], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${getFilenameBase()}.json`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);

          toast({ title: 'JSON Exported', description: 'Data exported successfully.' });
      } catch (err) {
          console.error("JSON Export Error:", err);
          toast({ variant: 'destructive', title: 'Export Error', description: 'Could not generate JSON file.' });
      }
  };

  const handleExportPDF = async () => {
      if (!activeScenario || !calculationResults) {
          toast({ variant: 'destructive', title: 'Export Failed', description: 'No active scenario results to export.' });
          return;
      }

      try {
          const doc = new jsPDF();
          const pageWidth = doc.internal.pageSize.getWidth();
          const margin = 20;
          let yPos = 20;

          // --- Cover Page ---
          doc.setFontSize(24);
          doc.setTextColor(0, 51, 102);
          doc.text("Petroleum Economic Evaluation", pageWidth / 2, 80, { align: 'center' });
          
          doc.setFontSize(16);
          doc.setTextColor(100);
          doc.text(`Project: ${currentProject?.name || 'Untitled Project'}`, pageWidth / 2, 100, { align: 'center' });
          doc.text(`Model: ${currentModel?.name || 'Untitled Model'}`, pageWidth / 2, 110, { align: 'center' });
          doc.text(`Scenario: ${activeScenario?.name}`, pageWidth / 2, 120, { align: 'center' });
          
          doc.setFontSize(12);
          doc.text(`Date: ${format(new Date(), 'PPP')}`, pageWidth / 2, 140, { align: 'center' });
          
          doc.addPage();
          yPos = 20;

          // --- Executive Summary ---
          doc.setFontSize(18);
          doc.setTextColor(0);
          doc.text("Executive Summary", margin, yPos);
          yPos += 15;

          const metrics = calculationResults.metrics || {};
          const kpiData = [
              ['NPV (10%)', `$${(metrics.npv || 0).toLocaleString()}`],
              ['IRR', `${(metrics.irr || 0).toFixed(1)}%`],
              ['DPI', (metrics.dpi || 0).toFixed(2) + 'x'],
              ['Payback', `${metrics.payback_year || 'N/A'}`],
              ['Unit Tech Cost', `$${(metrics.unit_technical_cost || 0).toFixed(2)}/boe`]
          ];

          doc.autoTable({
              startY: yPos,
              head: [['Metric', 'Value']],
              body: kpiData,
              theme: 'striped',
              headStyles: { fillColor: [41, 128, 185] },
              styles: { fontSize: 12 },
              margin: { left: margin, right: margin }
          });
          yPos = doc.lastAutoTable.finalY + 20;

          doc.setFontSize(14);
          doc.text("Key Assumptions", margin, yPos);
          yPos += 10;
          doc.setFontSize(10);
          doc.text(`• Oil Price: $${priceAssumptions.oilPrice}/bbl`, margin, yPos);
          yPos += 6;
          doc.text(`• Gas Price: $${priceAssumptions.gasPrice}/mcf`, margin, yPos);
          yPos += 6;
          doc.text(`• Discount Rate: ${(modelSettings.discountRate * 100).toFixed(1)}%`, margin, yPos);
          yPos += 6;
          doc.text(`• Start Year: ${modelSettings.startYear}`, margin, yPos);
          yPos += 20;

          // --- Cashflow Table ---
          doc.setFontSize(16);
          doc.text("Annual Cashflow Summary", margin, yPos);
          yPos += 10;

          const cfColumns = ['Year', 'Revenue', 'OPEX', 'CAPEX', 'Govt Take', 'Net Cashflow'];
          const cfData = calculationResults.annualResults.map(r => [
              r.year,
              Math.round(r.gross_revenue).toLocaleString(),
              Math.round(r.opex).toLocaleString(),
              Math.round(r.capex).toLocaleString(),
              Math.round(r.govt_take).toLocaleString(),
              Math.round(r.net_cashflow).toLocaleString()
          ]);

          doc.autoTable({
              startY: yPos,
              head: [cfColumns],
              body: cfData,
              theme: 'grid',
              headStyles: { fillColor: [52, 73, 94] },
              styles: { fontSize: 8, cellPadding: 2 },
              margin: { left: margin, right: margin }
          });

          // Add Footer Page Numbers
          const pageCount = doc.internal.getNumberOfPages();
          for(let i = 1; i <= pageCount; i++) {
              doc.setPage(i);
              doc.setFontSize(8);
              doc.setTextColor(150);
              doc.text(`Page ${i} of ${pageCount}`, pageWidth - 30, doc.internal.pageSize.getHeight() - 10);
          }

          doc.save(`${getFilenameBase()}.pdf`);
          toast({ title: 'PDF Exported', description: 'Report generated successfully.' });

      } catch (err) {
          console.error("PDF Export Error:", err);
          toast({ variant: 'destructive', title: 'Export Error', description: 'Could not generate PDF report.' });
      }
  };

  return (
    <div className="flex items-center justify-center h-full p-8 bg-slate-950">
        <Card className="w-full max-w-4xl bg-slate-900 border-slate-800 shadow-2xl">
            <CardHeader className="border-b border-slate-800 pb-6">
                <div className="flex items-center gap-4">
                    <div className="p-4 bg-gradient-to-br from-blue-900/40 to-slate-900 rounded-xl border border-blue-500/20">
                        <Download className="w-10 h-10 text-blue-400" />
                    </div>
                    <div>
                        <CardTitle className="text-2xl text-slate-100 font-bold">Export Center</CardTitle>
                        <CardDescription className="text-slate-400 text-base">Generate reports and data packages for external use.</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Excel Card */}
                    <div className="group relative bg-slate-950 rounded-xl border border-slate-800 hover:border-emerald-500/50 transition-all duration-300 p-6 flex flex-col gap-4">
                        <div className="p-3 bg-emerald-950/30 w-fit rounded-lg border border-emerald-900/50 group-hover:bg-emerald-900/30 transition-colors">
                            <FileSpreadsheet className="w-8 h-8 text-emerald-500" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-slate-200">Excel Workbook</h3>
                            <p className="text-sm text-slate-500 mt-1">Comprehensive .xlsx file with dedicated sheets for Inputs, Cashflows, and Scenarios.</p>
                        </div>
                        <div className="mt-auto pt-4">
                            <Button 
                                onClick={handleExportExcel} 
                                className="w-full bg-slate-800 hover:bg-emerald-600 hover:text-white text-slate-300 border border-slate-700 transition-all"
                                disabled={!activeScenario}
                            >
                                <Download className="w-4 h-4 mr-2" /> Download Excel
                            </Button>
                        </div>
                    </div>

                    {/* PDF Card */}
                    <div className="group relative bg-slate-950 rounded-xl border border-slate-800 hover:border-red-500/50 transition-all duration-300 p-6 flex flex-col gap-4">
                        <div className="p-3 bg-red-950/30 w-fit rounded-lg border border-red-900/50 group-hover:bg-red-900/30 transition-colors">
                            <FileText className="w-8 h-8 text-red-500" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-slate-200">PDF Report</h3>
                            <p className="text-sm text-slate-500 mt-1">Professional formatted report with executive summary, key charts, and tables.</p>
                        </div>
                        <div className="mt-auto pt-4">
                            <Button 
                                onClick={handleExportPDF} 
                                className="w-full bg-slate-800 hover:bg-red-600 hover:text-white text-slate-300 border border-slate-700 transition-all"
                                disabled={!activeScenario}
                            >
                                <Download className="w-4 h-4 mr-2" /> Download PDF
                            </Button>
                        </div>
                    </div>

                    {/* JSON Card */}
                    <div className="group relative bg-slate-950 rounded-xl border border-slate-800 hover:border-blue-500/50 transition-all duration-300 p-6 flex flex-col gap-4">
                        <div className="p-3 bg-blue-950/30 w-fit rounded-lg border border-blue-900/50 group-hover:bg-blue-900/30 transition-colors">
                            <FileCode className="w-8 h-8 text-blue-500" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-slate-200">JSON Data</h3>
                            <p className="text-sm text-slate-500 mt-1">Raw structured data for integration with other applications or archival.</p>
                        </div>
                        <div className="mt-auto pt-4">
                            <Button 
                                onClick={handleExportJSON} 
                                className="w-full bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-300 border border-slate-700 transition-all"
                                disabled={!activeScenario}
                            >
                                <Download className="w-4 h-4 mr-2" /> Download JSON
                            </Button>
                        </div>
                    </div>
                </div>

                {!activeScenario && (
                    <div className="flex items-center justify-center p-4 bg-amber-950/20 border border-amber-900/50 rounded-lg text-amber-400 gap-2">
                        <AlertCircle className="w-5 h-5" />
                        <span>Please load and calculate a scenario to enable export options.</span>
                    </div>
                )}

                <div className="bg-slate-950 rounded-lg border border-slate-800 p-5">
                    <h4 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                        <Layers className="w-4 h-4" /> Included in Export
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-slate-400">
                        <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>Model Setup</div>
                        <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>Assumptions</div>
                        <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>Production Profile</div>
                        <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>Cost Schedule</div>
                        <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>Fiscal Terms</div>
                        <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>Cashflow Waterfall</div>
                        <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>Scenario Compare</div>
                        <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>Key KPI Metrics</div>
                    </div>
                </div>

            </CardContent>
        </Card>
    </div>
  );
};

export default ExportTab;