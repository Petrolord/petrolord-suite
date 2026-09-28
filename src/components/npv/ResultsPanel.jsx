import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartPanel } from '@/components/ui/chart-panel';
import { NumericTable, NumTh, NumRow, RowLabel, NumCell } from '@/components/ui/numeric-table';
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

// The engine's maxExposure is the lowest cumulative cash flow. Exposure is
// how far below zero that goes, and zero when the cumulative never dips:
// the absolute value showed a positive first-year cumulative ($17MM) as
// exposure beside "the cumulative cash flow is never negative" (NPV-T1-001).
export const exposureOf = (metrics) => Math.max(0, -(Number(metrics?.maxExposure) || 0));

const ResultsPanel = ({ results, onRerunRisk, riskRunning = false }) => {
  const { metrics, cashflow, sensitivity, risk, scenarios } = results;
  // W3 (D3): with Full precision on, every money figure (held in million USD)
  // prints at 4 decimals, costs as positive amounts; off, nothing changes.
  const { full } = useFullPrecision();

  const compactCurrency = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact' }).format(val);
  const formatCurrency = (val) => (full ? formatFull(val, 4) : compactCurrency(val));
  // cashflow rows hold million USD; the product text scales them to USD first
  const cfMoney = (mm, sign = '') => (full ? formatFull(mm, 4) : `${sign}${compactCurrency(mm * 1e6)}`);
  const mmUnit = <span className="text-xs font-normal font-pl-sans text-pl-muted"> $MM</span>;
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
          ['Max Exposure ($MM)', exposureOf(metrics)],
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

  // Design system (rollout 2E): colour is for status only. A negative NPV
  // prints in danger text beside its minus sign; the other KPI values are
  // plain text, since a hurdle colour with no word would be the only signal.
  const npvTone = (value) => (typeof value === 'number' && value < 0 ? 'text-pl-danger-text' : 'text-pl-text');
  const kpiCard = 'bg-pl-surface border border-pl-border rounded-lg p-4 shadow-pl-sm';
  const kpiLabel = 'text-xs text-pl-muted uppercase font-semibold tracking-wide';
  const kpiValue = 'text-2xl font-semibold font-pl-mono tabular-nums';
  const kpiNote = 'text-[11px] text-pl-muted mt-1';
  // costs print with a leading minus in the product view and as positive
  // amounts at full precision, so the tone follows the sign on screen
  const costValue = (v) => (full ? v : -v);

  return (
    <div className="lg:h-full flex flex-col space-y-4 animate-in fade-in duration-500">
        
        {/* Tabs Navigation */}
        <Tabs defaultValue="dashboard" className="flex-1 flex flex-col lg:overflow-hidden">
            <div className="flex justify-between items-center flex-wrap gap-2">
                <TabsList className="max-w-full overflow-x-auto justify-start">
                    <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
                    <TabsTrigger value="cashflow">Cashflow</TabsTrigger>
                    <TabsTrigger value="scenarios">Scenarios</TabsTrigger>
                    <TabsTrigger value="sensitivity">Sensitivity</TabsTrigger>
                    <TabsTrigger value="risk">Risk</TabsTrigger>
                </TabsList>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={exportExcel} className="h-8">
                        <FileText className="w-3 h-3 mr-2" /> Excel
                    </Button>
                    <Button variant="outline" size="sm" onClick={exportPDF} className="h-8">
                        <Download className="w-3 h-3 mr-2" /> PDF
                    </Button>
                    <Button variant="outline" size="sm" className="h-8">
                        <Presentation className="w-3 h-3 mr-2" /> PPT
                    </Button>
                </div>
            </div>

            {/* 1. Dashboard Tab */}
            <TabsContent value="dashboard" className="flex-1 lg:overflow-y-auto space-y-4 mt-4">
                <FullPrecisionNote />
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    <div className={kpiCard}>
                        <p className={kpiLabel}>Net Present Value</p>
                        <p className={`${kpiValue} ${npvTone(metrics.npv)}`}>{formatCurrency(metrics.npv)}{mmUnit}</p>
                    </div>
                    <div className={kpiCard}>
                        <p className={kpiLabel}>Internal Rate of Return</p>
                        <p className={`${kpiValue} ${typeof metrics.irr === 'number' && Number.isFinite(metrics.irr) ? 'text-pl-text' : 'text-pl-muted'}`}>{formatPct(metrics.irr)}</p>
                        {metrics.irr === null && irrReasonFor(metrics) ? (
                          <p className={kpiNote}>{irrReasonFor(metrics)}</p>
                        ) : null}
                    </div>
                    <div className={kpiCard}>
                        <p className={kpiLabel}>Payback Period</p>
                        <p className={`${kpiValue} ${metrics.payback === null ? 'text-pl-muted' : 'text-pl-text'}`} data-testid="npv-payback">
                          {metrics.payback === null ? 'n/a' : `${formatYears(metrics.payback)} Years`}
                        </p>
                        {paybackNote(metrics) ? (
                          <p className={kpiNote} data-testid="npv-payback-note">{paybackNote(metrics)}</p>
                        ) : null}
                    </div>
                    <div className={kpiCard}>
                        <p className={kpiLabel}>Max Exposure</p>
                        <p className={`${kpiValue} text-pl-text`}>{formatCurrency(exposureOf(metrics))}{mmUnit}</p>
                    </div>
                </div>
                <ChartPanel title="Value Erosion Waterfall" className="min-h-[400px]">
                    <WaterfallChart metrics={metrics} />
                </ChartPanel>
            </TabsContent>

            {/* 2. Cashflow Tab */}
            <TabsContent value="cashflow" className="flex-1 lg:overflow-y-auto space-y-4 mt-4">
                <ChartPanel title="Annual Cashflow Profile">
                    <StackedCashflowChart data={cashflow} />
                </ChartPanel>
                {full && (
                  <p className="text-[11px] text-pl-warning-text px-1" data-testid="npv-cashflow-full">
                    Million USD at 4 decimals. Royalty, OPEX, CAPEX and tax print as positive amounts.
                  </p>
                )}
                <NumericTable title="Annual cash flow" data-testid="npv-cashflow-table">
                    <thead>
                        <tr>
                            <NumTh sticky>Year</NumTh>
                            <NumTh numeric>Gross Rev</NumTh>
                            <NumTh numeric>Royalty</NumTh>
                            <NumTh numeric>OPEX</NumTh>
                            <NumTh numeric>CAPEX</NumTh>
                            <NumTh numeric>Tax</NumTh>
                            <NumTh numeric>NCF</NumTh>
                            <NumTh numeric>Cum. NCF</NumTh>
                        </tr>
                    </thead>
                    <tbody>
                        {cashflow.map((row, i) => (
                            <NumRow key={i}>
                                <RowLabel className="font-pl-mono tabular-nums">{row.year}</RowLabel>
                                <NumCell value={row.grossRevenue}>{cfMoney(row.grossRevenue)}</NumCell>
                                <NumCell value={costValue(row.royalty)}>{cfMoney(row.royalty, '-')}</NumCell>
                                <NumCell value={costValue(row.opex)}>{cfMoney(row.opex, '-')}</NumCell>
                                <NumCell value={costValue(row.capex)}>{cfMoney(row.capex, '-')}</NumCell>
                                <NumCell value={costValue(row.tax)}>{cfMoney(row.tax, '-')}</NumCell>
                                <NumCell value={row.ncf} className="font-semibold">{cfMoney(row.ncf)}</NumCell>
                                <NumCell
                                  value={row.cumulativeNCF}
                                  tone={row.cumulativeNCF >= 0 ? 'text-pl-success-text' : 'text-pl-danger-text'}
                                >
                                  {cfMoney(row.cumulativeNCF)}
                                </NumCell>
                            </NumRow>
                        ))}
                    </tbody>
                </NumericTable>
            </TabsContent>
            {/* 3. Scenarios Tab */}
            <TabsContent value="scenarios" className="flex-1 lg:overflow-y-auto space-y-4 mt-4">
                {scenarios && (
                    <div className="space-y-3">
                        <NumericTable title="Scenario Comparison Matrix">
                            <thead>
                                <tr>
                                    <NumTh sticky>Metric</NumTh>
                                    <NumTh numeric>Low Case</NumTh>
                                    <NumTh numeric className="text-pl-text">Base Case</NumTh>
                                    <NumTh numeric>High Case</NumTh>
                                    <NumTh numeric>Delta (Base vs High)</NumTh>
                                </tr>
                            </thead>
                            <tbody>
                                {[
                                    { label: 'NPV ($MM)', key: 'npv', format: (v) => formatCurrency(v) },
                                    { label: 'IRR (%)', key: 'irr', format: (v) => formatPct(v) },
                                    { label: 'Payback (Yrs)', key: 'payback', format: (v) => formatYears(v) },
                                    { label: 'Max Exposure ($MM)', key: 'maxExposure', format: (v) => formatCurrency(Math.max(0, -v)) }
                                ].map(m => {
                                    // only the NPV row is a signed money figure; exposure prints as a positive amount
                                    const signed = m.key === 'npv';
                                    return (
                                    <NumRow key={m.key}>
                                        <RowLabel>{m.label}</RowLabel>
                                        <NumCell value={scenarios.Low.metrics[m.key]} signed={signed}>{m.format(scenarios.Low.metrics[m.key])}</NumCell>
                                        <NumCell value={scenarios.Base.metrics[m.key]} signed={signed} className="font-semibold bg-pl-sunken/60">{m.format(scenarios.Base.metrics[m.key])}</NumCell>
                                        <NumCell value={scenarios.High.metrics[m.key]} signed={signed}>{m.format(scenarios.High.metrics[m.key])}</NumCell>
                                        {(() => {
                                            const high = scenarios.High.metrics[m.key];
                                            const base = scenarios.Base.metrics[m.key];
                                            // EC6-1: a difference needs two numbers.
                                            if (typeof high !== 'number' || typeof base !== 'number') {
                                              return <NumCell signed={false} tone="text-pl-muted">n/a</NumCell>;
                                            }
                                            const diff = high - base;
                                            // the sign carries the meaning, so a better case reads success and a worse one danger
                                            const better = m.key === 'payback' || m.key === 'maxExposure' ? diff < 0 : diff > 0;
                                            const color = better ? 'text-pl-success-text' : 'text-pl-danger-text';
                                            return <NumCell value={diff} tone={color}>{diff > 0 ? '+' : ''}{m.key === 'irr' ? diff.toFixed(1)+'%' : m.key === 'payback' ? diff.toFixed(1) : formatCurrency(diff)}</NumCell>;
                                        })()}
                                    </NumRow>
                                    );
                                })}
                            </tbody>
                        </NumericTable>
                        <p className="text-[11px] text-pl-muted px-1" data-testid="npv-scenario-definition">
                            Low is 20 percent lower price and production with 20 percent higher capex and fixed opex; High is the mirror image.
                            Variable operating cost moves with production, so a barrel not produced is a barrel not paid for.
                            {['Low', 'Base', 'High'].some((k) => scenarios[k].metrics.paybackStatus === 'recrossed' || scenarios[k].metrics.paybackStatus === 'not-recovered')
                              ? ' A payback of n/a means that case never pays back; see the Dashboard for why a payback can go back below zero.'
                              : ''}
                        </p>
                    </div>
                )}
            </TabsContent>

            {/* 4. Sensitivity Tab */}
            <TabsContent value="sensitivity" className="flex-1 lg:overflow-y-auto space-y-4 mt-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <ChartPanel title="Tornado Chart (NPV Impact)">
                        {sensitivity && <TornadoChart data={sensitivity.map(s => ({ name: s.name, low: s.lowParamNPV, high: s.highParamNPV, base: s.baseNPV }))} />}
                    </ChartPanel>
                    <ChartPanel title="Spider Plot">
                        {sensitivity && <SpiderChart sensitivityData={sensitivity} />}
                    </ChartPanel>
                </div>
                {full && sensitivity && (
                    <NumericTable title="Sensitivity sweep (NPV, million USD)" data-testid="npv-sensitivity-table">
                        <thead>
                            <tr>
                                <NumTh sticky>Variable</NumTh>
                                <NumTh numeric>At 30 percent lower</NumTh>
                                <NumTh numeric>Base</NumTh>
                                <NumTh numeric>At 30 percent higher</NumTh>
                            </tr>
                        </thead>
                        <tbody>
                            {sensitivity.map((s) => (
                                <NumRow key={s.name}>
                                    <RowLabel>{s.name}</RowLabel>
                                    <NumCell value={s.lowParamNPV}>{formatFull(s.lowParamNPV, 4)}</NumCell>
                                    <NumCell value={s.baseNPV}>{formatFull(s.baseNPV, 4)}</NumCell>
                                    <NumCell value={s.highParamNPV}>{formatFull(s.highParamNPV, 4)}</NumCell>
                                </NumRow>
                            ))}
                        </tbody>
                    </NumericTable>
                )}
            </TabsContent>

            {/* 5. Risk Tab */}
            <TabsContent value="risk" className="flex-1 lg:overflow-y-auto space-y-4 mt-4">
                {full && <MonteCarloSettings risk={risk} onRun={onRerunRisk} running={riskRunning} />}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-2">
                    <div className={`${kpiCard} md:col-span-1`}>
                         <p className={kpiLabel}>EMV (Expected Value)</p>
                         <p className={`text-xl font-semibold font-pl-mono tabular-nums ${risk ? npvTone(risk.emv) : 'text-pl-text'}`} data-testid="npv-risk-emv">{risk ? formatCurrency(risk.emv) : '-'}{risk ? mmUnit : null}</p>
                    </div>
                    <div className="md:col-span-3">
                        <RiskCaseCards risk={risk} formatValue={formatCurrency} unit="$MM" />
                        <p className="text-[11px] text-pl-muted mt-1" data-testid="npv-risk-sampling">
                            Each iteration draws one factor for price, one for reserves and one for capex, within plus or minus 20 percent, and applies it to every year:
                            reserves moves oil and gas volume and the variable operating cost with it, price moves oil and gas prices, capex moves every capex entry.
                        </p>
                    </div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <ChartPanel title="NPV Distribution">
                        {risk && (() => {
                          const [low, best, high] = riskCases(risk);
                          return <HistogramChart data={risk.histogram} lowCase={low.value} bestCase={best.value} highCase={high.value} />;
                        })()}
                    </ChartPanel>
                    <ChartPanel title="Cumulative Probability (S-Curve)">
                        {risk && <SCurveChart data={risk.cdf} />}
                    </ChartPanel>
                </div>
            </TabsContent>
        </Tabs>
    </div>
  );
};

export default ResultsPanel;