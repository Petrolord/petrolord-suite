import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
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
      <DialogContent className="max-w-6xl h-[90vh] bg-slate-900 border-slate-700 text-white flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-3xl font-bold text-white">Portfolio Scenario Comparison</DialogTitle>
          <DialogDescription className="text-slate-400">
            Side-by-side comparison of your optimized portfolio scenarios.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-grow mt-6 grid grid-cols-1 lg:grid-cols-2 gap-8 overflow-y-auto">
          <div className="lg:col-span-2">
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-xl text-amber-300">Risked EMV vs. CAPEX</CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ width: '100%', height: 300 }}>
                  <ResponsiveContainer>
                    <BarChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
                      <XAxis dataKey="name" tick={{ fill: '#cbd5e1' }} />
                      <YAxis yAxisId="left" orientation="left" stroke="#a3e635" tick={{ fill: '#cbd5e1' }} tickFormatter={(val) => formatCurrency(val, '')} />
                      <YAxis yAxisId="right" orientation="right" stroke="#facc15" tick={{ fill: '#cbd5e1' }} tickFormatter={(val) => formatCurrency(val, '')} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'rgba(30, 41, 59, 0.8)',
                          borderColor: '#475569',
                          color: '#f8fafc',
                        }}
                        formatter={(value, name) => [formatCurrency(value), name]}
                      />
                      <Legend wrapperStyle={{ color: '#f8fafc' }} />
                      <Bar yAxisId="left" dataKey="EMV" fill="#a3e635" name="Risked EMV" />
                      <Bar yAxisId="right" dataKey="CAPEX" fill="#facc15" name="Total CAPEX" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {comparisonData.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="bg-white/5 border-white/10 h-full flex flex-col">
                  <CardHeader>
                    <CardTitle className="text-lg text-blue-300">{item.name}</CardTitle>
                    <p className="text-sm text-slate-400">CAPEX Limit: {formatCurrency(item.capex_limit)}</p>
                  </CardHeader>
                  <CardContent className="flex-grow space-y-3">
                    <div>
                      <p className="text-sm text-slate-400">Optimal Risked EMV</p>
                      <p className="text-2xl font-bold text-lime-400">{formatCurrency(item.totalNpv)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-400">Optimal Total CAPEX</p>
                      <p className="text-2xl font-bold text-amber-400">{formatCurrency(item.totalCapex)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-400">Funded Projects</p>
                      <p className="text-2xl font-bold text-white">{item.optimalProjects.length}</p>
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