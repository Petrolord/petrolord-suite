import React from 'react';
import { motion } from 'framer-motion';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { Droplets, TrendingUp, BarChart3, Target, Gauge, Activity } from 'lucide-react';

// WF-U1 (PL3): totals in the display units when the studio hands `u`
// (src/utils/waterflooddesign/units.js); oilfield millions otherwise.
const bigVolume = (u, kind, v) => {
  if (!u || u.system === 'oilfield') return { value: v / 1e6, unit: kind === 'oilVolume' ? 'MMSTB' : 'MMbbl' };
  return { value: u.show(kind, v) / 1e3, unit: `10^3 ${u.label(kind)}` };
};

const KPIPanel = ({ kpis, lastUpdated, u = null }) => {
  const formatNumber = (num, decimals = 1) => {
    if (typeof num !== 'number' || isNaN(num)) return EMPTY_VALUE;
    return num.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const kpiItems = [
    {
      title: 'Water cut (volume-weighted)',
      value: `${formatNumber(kpis.avg_water_cut_pct)}%`,
      icon: Droplets
    },
    {
      title: 'Cumulative VRR',
      value: formatNumber(kpis.vrr_avg, 2),
      icon: TrendingUp
    },
    {
      title: 'Rolling VRR (last window)',
      value: kpis.vrr_rolling ? formatNumber(kpis.vrr_rolling, 2) : EMPTY_VALUE,
      icon: Activity
    },
    {
      title: 'Water injected',
      ...(() => { const b = bigVolume(u, 'waterVolume', kpis.total_injected_bbl); return { value: `${formatNumber(b.value, 3)} ${b.unit}` }; })(),
      icon: Target
    },
    {
      title: 'Oil produced',
      ...(() => { const b = bigVolume(u, 'oilVolume', kpis.total_oil_bbl); return { value: `${formatNumber(b.value, 3)} ${b.unit}` }; })(),
      icon: BarChart3
    },
    {
      title: 'Water produced',
      ...(() => { const b = bigVolume(u, 'waterVolume', kpis.total_water_bbl); return { value: `${formatNumber(b.value, 3)} ${b.unit}` }; })(),
      icon: Gauge
    }
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="bg-pl-surface border border-pl-border rounded-xl p-6 shadow-pl-sm"
    >
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-pl-text">Key Performance Indicators</h2>
        {lastUpdated && (
          <div className="text-right">
            <p className="text-pl-muted text-sm">Last Updated</p>
            <p className="text-pl-text text-sm font-medium">
              {new Date(lastUpdated).toLocaleString()}
            </p>
          </div>
        )}
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 2xl:grid-cols-6 gap-4">
        {kpiItems.map((kpi, index) => (
          <motion.div
            key={kpi.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 * index }}
            className="bg-pl-sunken rounded-lg p-4 transition-colors"
          >
            <kpi.icon className="w-5 h-5 text-pl-muted mb-3" aria-hidden="true" />
            <h3 className="text-lg font-semibold font-pl-mono tabular-nums text-pl-text mb-1">{kpi.value}</h3>
            <p className="text-pl-muted text-sm leading-snug">{kpi.title}</p>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};

export default KPIPanel;