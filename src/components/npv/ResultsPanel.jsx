import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, FileText, Presentation, TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

import WaterfallChart from './charts/WaterfallChart';
import TornadoChart from './charts/TornadoChart';
import StackedCashflowChart from './charts/StackedCashflowChart';
import SpiderChart from './charts/SpiderChart';
import { HistogramChart, SCurveChart } from './charts/RiskCharts';
import { RiskCaseCards, riskCases } from './riskCases';
import MonteCarloSettings from './MonteCarloSettings';
import { useFullPrecision, FullPrecisionNote } from '@/components/fullprecision/FullPrecision';
import { formatFull } from '@/lib/fullPrecision';

const ResultsPanel = ({ results, onRerunRisk, riskRunning = false }) => {
  const { metrics, cashflow, sensitivity, risk, scenarios } = results;
  // W3 (D3): with Full precision on, every money figure (held in million USD)
  // prints at 4 decimals, costs as positive amounts; off, nothing changes.
  const { full } = useFullPrecision();

  const compactCurrency = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact' }).format(val);
  const formatCurrency = (val) => (full ? formatFull(val, 4) : compactCurrency(val));
  // cashflow rows hold million USD; the product text scales them to USD first
  const cfMoney = (mm, sign = '') => (full ? formatFull(mm, 4) : `${sign}${compactCurrency(mm * 1e6)}`);
  const mmUnit = full ? <span className="text-xs font-normal text-slate-500"> $MM</span> : null;
  // EC6-1: the screening engine reports no internal rate of return when
  // there is none to report (every period the same sign, several roots, or a
  // rate above the band it searches), where it used to return the 1000
  // percent clamp or a flat 0. A missing figure prints as what it is.
  const formatPct = (val) => (typeof val === 'number' && Number.isFinite(val) ? `${val.toFixed(1)}%` : 'n/a');
  const IRR_REASON = {
    'no-sign-change': 'no IRR: the cash flow never changes sign',
    'no-root': 'no IRR: the value is negative at every rate',
    'above-clamp': 'the IRR is above 1000 percent, beyond the range this engine searches',
    'multiple-roots': 'more than one rate zeroes this cash flow, so no single IRR describes it',
  };
  // above the band is a return only when NPV is positive at the discount rate
  const irrReasonFor = (m) => (m.irrStatus === 'above-clamp' && Number(m.npv) < 0
    ? 'no IRR: the only rate that zeroes the NPV is above 1000 percent, and the project loses value at the discount rate'
    : IRR_REASON[m.irrStatus]);

  // EC3-1 / EC3-2: payback is the first time the cumulative cash flow turns
  // non-negative. The engine now says what happened around that number, so
  // a project that never pays back no longer shows its project life, and a
  // payback of 0 beside a negative peak exposure explains itself.
  const formatYears = (val) => (typeof val === 'number' && Number.isFinite(val) ? val.toFixed(1) : 'n/a');
  const paybackNote = (m) => {
    switch (m.paybackStatus) {
      case 'not-recovered': return 'never pays back: the cumulative cash flow stays below zero';
      case 'no-investment': return 'nothing to pay back: the cumulative cash flow is never negative';
      case 'recrossed':
        return typeof m.paybackLast === 'number'
          ? `the cumulative cash flow goes back below zero afterwards and recovers for good at ${m.paybackLast.toFixed(1)} years`
          : 'the cumulative cash flow goes back below zero afterwards and never recovers';
      default: return null;
    }
  };

  // --- Export Functions ---
  const exportExcel = () => {
      const wb = XLSX.utils.book_new();
      
      // 1. Summary Sheet
      const summaryData = [
          ['Metric', 'Value'],
          ['NPV @ 10%', metrics.npv],
          ['IRR', metrics.irr === null ? (irrReasonFor(metrics) || 'not defined') : metrics.irr],
          ['Payback', metrics.payback === null ? (paybackNote(metrics) || 'not defined') : metrics.payback],
          ['Payback note', paybackNote(metrics) || ''],
          ['Max Exposure', metrics.maxExposure],
          ['Total Revenue', metrics.totalRevenue],
          ['Total CAPEX', metrics.totalCapex]
      ];
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, wsSummary, "Executive Summary");

      // 2. Cashflow Sheet
      const wsCashflow = XLSX.utils.json_to_sheet(cashflow);
      XLSX.utils.book_append_sheet(wb, wsCashflow, "Cashflow Model");

      // 3. Scenarios Sheet
      if(scenarios) {
           const scenData = [
               { Metric: 'NPV', Base: scenarios.Base.metrics.npv, Low: scenarios.Low.metrics.npv, High: scenarios.High.metrics.npv },
               { Metric: 'IRR', Base: scenarios.Base.metrics.irr, Low: scenarios.Low.metrics.irr, High: scenarios.High.metrics.irr }
           ];
           XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(scenData), "Scenario Analysis");
      }
      
      XLSX.writeFile(wb, "NPV_Scenario_Report_vFinal.xlsx");
  };

  const exportPDF = () => {
      const doc = new jsPDF();
      
      // Header
      doc.setFontSize(18);
      doc.text("Economic Evaluation Summary", 14, 20);
      doc.setFontSize(11);
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 28);

      // KPI Table
      doc.autoTable({
          head: [['Metric', 'Value', 'Unit']],
          body: [
              ['Net Present Value (NPV)', compactCurrency(metrics.npv), '$'],
              ['Internal Rate of Return (IRR)',
                metrics.irr === null ? (irrReasonFor(metrics) || 'not defined') : metrics.irr.toFixed(1),
                metrics.irr === null ? '' : '%'],
              ['Payback Period',
                metrics.payback === null ? (paybackNote(metrics) || 'not defined') : formatYears(metrics.payback),
                metrics.payback === null ? '' : 'Years'],
              ['Total CAPEX', compactCurrency(metrics.totalCapex), '$']
          ],
          startY: 35,
          theme: 'grid'
      });

      // Cashflow Table Snippet
      doc.text("Annual Cashflow (First 10 Years)", 14, doc.lastAutoTable.finalY + 15);
      doc.autoTable({
          head: [['Year', 'Revenue', 'CAPEX', 'OPEX', 'NCF']],
          body: cashflow.slice(0, 10).map(c => [c.year, c.grossRevenue.toFixed(1), c.capex.toFixed(1), c.opex.toFixed(1), c.ncf.toFixed(1)]),
          startY: doc.lastAutoTable.finalY + 20
      });
      
      // Footer
      doc.setFontSize(8);
      doc.text("Generated by Petrolord Suite - Confidential", 14, 290);

      doc.save("Economic_Summary_Report.pdf");
  };

  const getKPICardColor = (metric, value) => {
      if (metric === 'NPV') return value > 0 ? 'text-green-400' : 'text-red-400';
      // EC6-1: no rate is not a red rate; it is no rate.
      if (metric === 'IRR') {
        if (typeof value !== 'number' || !Number.isFinite(value)) return 'text-slate-400';
        return value > 15 ? 'text-green-400' : value > 10 ? 'text-amber-400' : 'text-red-400';
      }
      return 'text-white';
  };

  return (
    <div className="h-full flex flex-col space-y-4 animate-in fade-in duration-500">
        
        {/* Tabs Navigation */}
        <Tabs defaultValue="dashboard" className="flex-1 flex flex-col overflow-hidden">
            <div className="flex justify-between items-center flex-wrap gap-2">
                <TabsList className="bg-slate-900 border border-slate-800">
                    <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
                    <TabsTrigger value="cashflow">Cashflow</TabsTrigger>
                    <TabsTrigger value="scenarios">Scenarios</TabsTrigger>
                    <TabsTrigger value="sensitivity">Sensitivity</TabsTrigger>
                    <TabsTrigger value="risk">Risk</TabsTrigger>
                </TabsList>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={exportExcel} className="h-8 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800">
                        <FileText className="w-3 h-3 mr-2" /> Excel
                    </Button>
                    <Button variant="outline" size="sm" onClick={exportPDF} className="h-8 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800">
                        <Download className="w-3 h-3 mr-2" /> PDF
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800">
                        <Presentation className="w-3 h-3 mr-2" /> PPT
                    </Button>
                </div>
            </div>

            {/* 1. Dashboard Tab */}
            <TabsContent value="dashboard" className="flex-1 overflow-y-auto space-y-4 mt-4">
                <FullPrecisionNote />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card className="bg-slate-900 border-slate-800 p-4">
                        <p className="text-xs text-slate-500 uppercase font-semibold">Net Present Value</p>
                        <p className={`text-2xl font-bold ${getKPICardColor('NPV', metrics.npv)}`}>{formatCurrency(metrics.npv)}{mmUnit}</p>
                    </Card>
                    <Card className="bg-slate-900 border-slate-800 p-4">
                        <p className="text-xs text-slate-500 uppercase font-semibold">Internal Rate of Return</p>
                        <p className={`text-2xl font-bold ${getKPICardColor('IRR', metrics.irr)}`}>{formatPct(metrics.irr)}</p>
                        {metrics.irr === null && irrReasonFor(metrics) ? (
                          <p className="text-[11px] text-slate-500 mt-1">{irrReasonFor(metrics)}</p>
                        ) : null}
                    </Card>
                    <Card className="bg-slate-900 border-slate-800 p-4">
                        <p className="text-xs text-slate-500 uppercase font-semibold">Payback Period</p>
                        <p className={`text-2xl font-bold ${metrics.payback === null ? 'text-slate-400' : 'text-blue-400'}`} data-testid="npv-payback">
                          {metrics.payback === null ? 'n/a' : `${formatYears(metrics.payback)} Years`}
                        </p>
                        {paybackNote(metrics) ? (
                          <p className="text-[11px] text-slate-500 mt-1" data-testid="npv-payback-note">{paybackNote(metrics)}</p>
                        ) : null}
                    </Card>
                    <Card className="bg-slate-900 border-slate-800 p-4">
                        <p className="text-xs text-slate-500 uppercase font-semibold">Max Exposure</p>
                        <p className="text-2xl font-bold text-red-400">{formatCurrency(Math.abs(metrics.maxExposure))}{mmUnit}</p>
                    </Card>
                </div>
                <Card className="bg-slate-900 border-slate-800 flex-1 min-h-[400px]">
                    <CardHeader><CardTitle className="text-sm text-slate-300">Value Erosion Waterfall</CardTitle></CardHeader>
                    <CardContent>
                        <WaterfallChart metrics={metrics} />
                    </CardContent>
                </Card>
            </TabsContent>

            {/* 2. Cashflow Tab */}
            <TabsContent value="cashflow" className="flex-1 overflow-y-auto space-y-4 mt-4">
                <Card className="bg-slate-900 border-slate-800">
                    <CardHeader><CardTitle className="text-sm text-slate-300">Annual Cashflow Profile</CardTitle></CardHeader>
                    <CardContent>
                        <StackedCashflowChart data={cashflow} />
                    </CardContent>
                </Card>
                <Card className="bg-slate-900 border-slate-800 overflow-hidden">
                    {full && (
                      <p className="text-[11px] text-amber-300 px-4 pt-3" data-testid="npv-cashflow-full">
                        Million USD at 4 decimals. Royalty, OPEX, CAPEX and tax print as positive amounts.
                      </p>
                    )}
                    <Table>
                        <TableHeader>
                            <TableRow className="border-b-slate-800 bg-slate-950">
                                <TableHead className="text-slate-300">Year</TableHead>
                                <TableHead className="text-right text-emerald-400">Gross Rev</TableHead>
                                <TableHead className="text-right text-slate-400">Royalty</TableHead>
                                <TableHead className="text-right text-amber-400">OPEX</TableHead>
                                <TableHead className="text-right text-blue-400">CAPEX</TableHead>
                                <TableHead className="text-right text-red-400">Tax</TableHead>
                                <TableHead className="text-right font-bold text-white">NCF</TableHead>
                                <TableHead className="text-right text-slate-500">Cum. NCF</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {cashflow.map((row, i) => (
                                <TableRow key={i} className="border-b-slate-800 hover:bg-slate-800/50">
                                    <TableCell className="font-mono text-xs text-slate-400">{row.year}</TableCell>
                                    <TableCell className="font-mono text-xs text-right text-emerald-400">{cfMoney(row.grossRevenue)}</TableCell>
                                    <TableCell className="font-mono text-xs text-right text-slate-400">{cfMoney(row.royalty, '-')}</TableCell>
                                    <TableCell className="font-mono text-xs text-right text-amber-400">{cfMoney(row.opex, '-')}</TableCell>
                                    <TableCell className="font-mono text-xs text-right text-blue-400">{cfMoney(row.capex, '-')}</TableCell>
                                    <TableCell className="font-mono text-xs text-right text-red-400">{cfMoney(row.tax, '-')}</TableCell>
                                    <TableCell className={`font-mono text-xs text-right font-bold ${row.ncf >= 0 ? 'text-white' : 'text-red-400'}`}>{cfMoney(row.ncf)}</TableCell>
                                    <TableCell className="font-mono text-xs text-right text-slate-500">{cfMoney(row.cumulativeNCF)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Card>
            </TabsContent>

            {/* 3. Scenarios Tab */}
            <TabsContent value="scenarios" className="flex-1 overflow-y-auto space-y-4 mt-4">
                {scenarios && (
                    <div className="grid grid-cols-1 lg:grid-cols-1 gap-4">
                        <Card className="bg-slate-900 border-slate-800">
                            <CardHeader><CardTitle className="text-sm text-slate-300">Scenario Comparison Matrix</CardTitle></CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow className="border-b-slate-800">
                                            <TableHead className="text-slate-300">Metric</TableHead>
                                            <TableHead className="text-right text-slate-400">Low Case</TableHead>
                                            <TableHead className="text-right font-bold text-white bg-slate-800/50">Base Case</TableHead>
                                            <TableHead className="text-right text-slate-400">High Case</TableHead>
                                            <TableHead className="text-right text-slate-500">Delta (Base vs High)</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {[
                                            { label: 'NPV ($MM)', key: 'npv', format: (v) => formatCurrency(v) },
                                            { label: 'IRR (%)', key: 'irr', format: (v) => formatPct(v) },
                                            { label: 'Payback (Yrs)', key: 'payback', format: (v) => formatYears(v) },
                                            { label: 'Max Exposure ($MM)', key: 'maxExposure', format: (v) => formatCurrency(Math.abs(v)) }
                                        ].map(m => (
                                            <TableRow key={m.key} className="border-b-slate-800">
                                                <TableCell className="font-medium text-slate-300">{m.label}</TableCell>
                                                <TableCell className="text-right font-mono text-slate-400">{m.format(scenarios.Low.metrics[m.key])}</TableCell>
                                                <TableCell className="text-right font-mono font-bold text-white bg-slate-800/50">{m.format(scenarios.Base.metrics[m.key])}</TableCell>
                                                <TableCell className="text-right font-mono text-slate-400">{m.format(scenarios.High.metrics[m.key])}</TableCell>
                                                <TableCell className="text-right font-mono">
                                                    {(() => {
                                                        const high = scenarios.High.metrics[m.key];
                                                        const base = scenarios.Base.metrics[m.key];
                                                        // EC6-1: a difference needs two numbers.
                                                        if (typeof high !== 'number' || typeof base !== 'number') {
                                                          return <span className="text-slate-500">n/a</span>;
                                                        }
                                                        const diff = high - base;
                                                        const color = m.key === 'payback' || m.key === 'maxExposure' ? (diff < 0 ? 'text-green-400' : 'text-red-400') : (diff > 0 ? 'text-green-400' : 'text-red-400');
                                                        return <span className={color}>{diff > 0 ? '+' : ''}{m.key === 'irr' ? diff.toFixed(1)+'%' : m.key === 'payback' ? diff.toFixed(1) : formatCurrency(diff)}</span>;
                                                    })()}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                                <p className="text-[11px] text-slate-500 mt-3" data-testid="npv-scenario-definition">
                                    Low is 20 percent lower price and production with 20 percent higher capex and fixed opex; High is the mirror image.
                                    Variable operating cost moves with production, so a barrel not produced is a barrel not paid for.
                                    {['Low', 'Base', 'High'].some((k) => scenarios[k].metrics.paybackStatus === 'recrossed' || scenarios[k].metrics.paybackStatus === 'not-recovered')
                                      ? ' A payback of n/a means that case never pays back; see the Dashboard for why a payback can go back below zero.'
                                      : ''}
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </TabsContent>

            {/* 4. Sensitivity Tab */}
            <TabsContent value="sensitivity" className="flex-1 overflow-y-auto space-y-4 mt-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <Card className="bg-slate-900 border-slate-800">
                        <CardHeader><CardTitle className="text-sm text-slate-300">Tornado Chart (NPV Impact)</CardTitle></CardHeader>
                        <CardContent>
                            {sensitivity && <TornadoChart data={sensitivity.map(s => ({ name: s.name, low: s.lowParamNPV, high: s.highParamNPV, base: s.baseNPV }))} />}
                        </CardContent>
                    </Card>
                    <Card className="bg-slate-900 border-slate-800">
                        <CardHeader><CardTitle className="text-sm text-slate-300">Spider Plot</CardTitle></CardHeader>
                        <CardContent>
                            {sensitivity && <SpiderChart sensitivityData={sensitivity} />}
                        </CardContent>
                    </Card>
                </div>
                {full && sensitivity && (
                    <Card className="bg-slate-900 border-slate-800" data-testid="npv-sensitivity-table">
                        <CardHeader><CardTitle className="text-sm text-slate-300">Sensitivity sweep (NPV, million USD)</CardTitle></CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-b-slate-800">
                                        <TableHead className="text-slate-300">Variable</TableHead>
                                        <TableHead className="text-right text-slate-400">At 30 percent lower</TableHead>
                                        <TableHead className="text-right text-slate-400">Base</TableHead>
                                        <TableHead className="text-right text-slate-400">At 30 percent higher</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sensitivity.map((s) => (
                                        <TableRow key={s.name} className="border-b-slate-800">
                                            <TableCell className="text-slate-300">{s.name}</TableCell>
                                            <TableCell className="text-right font-mono text-slate-300">{formatFull(s.lowParamNPV, 4)}</TableCell>
                                            <TableCell className="text-right font-mono text-slate-300">{formatFull(s.baseNPV, 4)}</TableCell>
                                            <TableCell className="text-right font-mono text-slate-300">{formatFull(s.highParamNPV, 4)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                )}
            </TabsContent>

            {/* 5. Risk Tab */}
            <TabsContent value="risk" className="flex-1 overflow-y-auto space-y-4 mt-4">
                {full && <MonteCarloSettings risk={risk} onRun={onRerunRisk} running={riskRunning} />}
                <div className="grid grid-cols-4 gap-4 mb-2">
                    <Card className="bg-slate-900 border-slate-800 p-4 col-span-1">
                         <p className="text-xs text-slate-500 uppercase font-semibold">EMV (Expected Value)</p>
                         <p className="text-xl font-bold text-blue-400" data-testid="npv-risk-emv">{risk ? formatCurrency(risk.emv) : '-'}{risk ? mmUnit : null}</p>
                    </Card>
                    <div className="col-span-3">
                        <RiskCaseCards risk={risk} formatValue={formatCurrency} />
                        <p className="text-[11px] text-slate-400 mt-1" data-testid="npv-risk-sampling">
                            Each iteration draws one factor for price, one for reserves and one for capex, within plus or minus 20 percent, and applies it to every year:
                            reserves moves oil and gas volume and the variable operating cost with it, price moves oil and gas prices, capex moves every capex entry.
                        </p>
                    </div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                     <Card className="bg-slate-900 border-slate-800">
                        <CardHeader><CardTitle className="text-sm text-slate-300">NPV Distribution</CardTitle></CardHeader>
                        <CardContent>
                            {risk && (() => {
                              const [low, best, high] = riskCases(risk);
                              return <HistogramChart data={risk.histogram} lowCase={low.value} bestCase={best.value} highCase={high.value} />;
                            })()}
                        </CardContent>
                    </Card>
                    <Card className="bg-slate-900 border-slate-800">
                        <CardHeader><CardTitle className="text-sm text-slate-300">Cumulative Probability (S-Curve)</CardTitle></CardHeader>
                        <CardContent>
                            {risk && <SCurveChart data={risk.cdf} />}
                        </CardContent>
                    </Card>
                </div>
            </TabsContent>
        </Tabs>
    </div>
  );
};

export default ResultsPanel;