import React from 'react';
import { motion } from 'framer-motion';
import { Droplets, TrendingUp, BarChart3, Target, Gauge, Activity } from 'lucide-react';

const KPIPanel = ({ kpis, lastUpdated }) => {
  const formatNumber = (num, decimals = 1) => {
    if (typeof num !== 'number' || isNaN(num)) return 'N/A';
    return num.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const kpiItems = [
    {
      title: 'Avg Water Cut',
      value: `${formatNumber(kpis.avg_water_cut_pct)}%`,
      icon: Droplets,
      color: 'from-cyan-500 to-blue-500'
    },
    {
      title: 'Avg VRR',
      value: formatNumber(kpis.vrr_avg, 2),
      icon: TrendingUp,
      color: 'from-green-500 to-emerald-500'
    },
    {
      title: 'Rolling VRR (end)',
      value: kpis.vrr_rolling ? formatNumber(kpis.vrr_rolling, 2) : 'N/A',
      icon: Activity,
      color: 'from-orange-500 to-amber-500'
    },
    {
      title: 'Total Injection',
      value: `${formatNumber(kpis.total_injected_bbl / 1e6, 2)} MMbbl`,
      icon: Target,
      color: 'from-purple-500 to-pink-500'
    },
    {
      title: 'Total Oil',
      value: `${formatNumber(kpis.total_oil_bbl / 1e6, 2)} MMSTB`,
      icon: BarChart3,
      color: 'from-lime-500 to-green-500'
    },
    {
      title: 'Total Water',
      value: `${formatNumber(kpis.total_water_bbl / 1e6, 2)} MMbbl`,
      icon: Gauge,
      color: 'from-blue-500 to-cyan-500'
    }
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">Key Performance Indicators</h2>
        {lastUpdated && (
          <div className="text-right">
            <p className="text-cyan-300 text-sm">Last Updated</p>
            <p className="text-white text-sm font-medium">
              {new Date(lastUpdated).toLocaleString()}
            </p>
          </div>
        )}
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpiItems.map((kpi, index) => (
          <motion.div
            key={kpi.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 * index }}
            className="bg-white/5 rounded-lg p-4 hover:bg-white/10 transition-all duration-300"
          >
            <div className={`bg-gradient-to-r ${kpi.color} p-2 rounded-lg w-min mb-3`}>
              <kpi.icon className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-1">{kpi.value}</h3>
            <p className="text-cyan-200 text-sm truncate">{kpi.title}</p>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};

export default KPIPanel;