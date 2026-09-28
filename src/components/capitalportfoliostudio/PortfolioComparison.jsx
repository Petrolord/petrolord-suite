import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import { ChartPanel } from '@/components/ui/chart-panel';
import { signedTone } from '@/components/ui/numeric-table';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { motion } from 'framer-motion';

const formatCurrency = (value, unit = 'MM') => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value || 0) + (unit ? ` ${unit}` : '');

const PortfolioComparison = ({ isOpen, onClose, comparisonData }) => {
  if (!comparisonData || comparisonData.length === 0) {
    return null;
  }

  const chartData = comparisonData.map(item => ({
    name: item.name,
    EMV: item.totalNpv,
    CAPEX: item.totalCapex,
  }));

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Portfolio Scenario Comparison</DialogTitle>
          <DialogDescription>
            Side-by-side comparison of your optimized portfolio scenarios.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-grow mt-6 grid grid-cols-1 lg:grid-cols-2 gap-8 overflow-y-auto">
          <div className="lg:col-span-2">
            <ChartPanel title="Risked EMV vs. CAPEX">
                <ChartFrame height={300} exportFilename="portfolio-comparison">
                    <BarChart data={chartData} margin={{ top: 8, right: 24, left: 16, bottom: 8 }}>
                      <CartesianGrid {...GRID_STYLE} vertical={false} />
                      <XAxis dataKey="name" stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
                      <YAxis yAxisId="left" orientation="left" stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} tickFormatter={(val) => formatCurrency(val, '')} />
                      <YAxis yAxisId="right" orientation="right" stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} tickFormatter={(val) => formatCurrency(val, '')} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value, name) => [formatCurrency(value), name]} />
                      <Legend verticalAlign="top" wrapperStyle={{ fontSize: '12px' }} />
                      <Bar yAxisId="left" dataKey="EMV" fill="#059669" name="Risked EMV" />
                      <Bar yAxisId="right" dataKey="CAPEX" fill="#d97706" name="Total CAPEX" />
                    </BarChart>
                </ChartFrame>
            </ChartPanel>
          </div>
          <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {comparisonData.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="h-full flex flex-col">
                  <CardHeader>
                    <CardTitle className="text-lg">{item.name}</CardTitle>
                    <p className="text-sm text-pl-muted">CAPEX Limit: <span className="font-pl-mono tabular-nums">{formatCurrency(item.capex_limit)}</span></p>
                  </CardHeader>
                  <CardContent className="flex-grow space-y-3">
                    <div>
                      <p className="text-sm text-pl-muted">Optimal Risked EMV</p>
                      <p className={`text-2xl font-semibold font-pl-mono tabular-nums ${signedTone(item.totalNpv) || 'text-pl-text'}`}>{formatCurrency(item.totalNpv)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-pl-muted">Optimal Total CAPEX</p>
                      <p className="text-2xl font-semibold font-pl-mono tabular-nums text-pl-text">{formatCurrency(item.totalCapex)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-pl-muted">Funded Projects</p>
                      <p className="text-2xl font-semibold font-pl-mono tabular-nums text-pl-text">{item.optimalProjects.length}</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PortfolioComparison;