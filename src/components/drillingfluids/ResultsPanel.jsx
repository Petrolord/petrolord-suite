
import React from 'react';
import { motion } from 'framer-motion';
import { Thermometer, Beaker, Zap, Droplets, Gem } from 'lucide-react';

const KPICard = ({ title, value, unit, icon }) => {
  return (
    <div className={`bg-white/5 p-4 rounded-lg flex items-start gap-4`}>
        <div className="p-2 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 rounded-lg">
            {icon}
        </div>
        <div>
            <p className="text-sm text-lime-300">{title}</p>
            <p className="text-2xl font-bold text-white">{value} <span className="text-lg text-lime-200">{unit}</span></p>
        </div>
    </div>
  );
};

const RheologyPlot = ({ data }) => {
  return <div className="w-full h-full flex items-center justify-center text-slate-400">Chart removed</div>;
};

const ResultsPanel = ({ results }) => {
  const {
    final_mud_weight_ppg,
    plastic_viscosity_cp,
    yield_point_lb_100ft2,
    gel_strength_10s_lb100,
    gel_strength_10m_lb100,
    breakdown,
    rheology_curve,
    total_additive_cost_usd,
    cost_per_barrel_usd
  } = results;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <KPICard title="Final Mud Weight" value={final_mud_weight_ppg.toFixed(2)} unit="ppg" icon={<Beaker className="w-6 h-6 text-cyan-300"/>} />
        <KPICard title="Plastic Viscosity" value={plastic_viscosity_cp.toFixed(1)} unit="cP" icon={<Droplets className="w-6 h-6 text-cyan-300"/>} />
        <KPICard title="Yield Point" value={yield_point_lb_100ft2.toFixed(1)} unit="lb/100ft²" icon={<Zap className="w-6 h-6 text-cyan-300"/>} />
        <KPICard title="Gel Strength (10s)" value={gel_strength_10s_lb100.toFixed(1)} unit="lb/100ft²" icon={<Thermometer className="w-6 h-6 text-cyan-300"/>}/>
        <KPICard title="Gel Strength (10m)" value={gel_strength_10m_lb100.toFixed(1)} unit="lb/100ft²" icon={<Thermometer className="w-6 h-6 text-cyan-300"/>}/>
        <KPICard title="Cost / bbl" value={`$${cost_per_barrel_usd.toFixed(2)}`} unit="" icon={<Gem className="w-6 h-6 text-cyan-300"/>}/>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
          <div className="xl:col-span-3 bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl p-4 min-h-[400px]">
             <h3 className="text-xl font-bold text-white mb-4">Rheology</h3>
             <RheologyPlot data={rheology_curve} />
          </div>
          <div className="xl:col-span-2 bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl p-6">
            <h3 className="text-xl font-bold text-white mb-4">Cost & Property Breakdown</h3>
            <p className="text-lime-300 text-sm mb-4">Total Additive Cost: <span className="text-white font-bold">${total_additive_cost_usd.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span></p>
            <div className="overflow-x-auto">
                <table id="breakdown-table" className="w-full text-left">
                    <thead>
                        <tr className="border-b border-white/20">
                            <th className="p-2 text-lime-300 text-sm">Additive</th>
                            <th className="p-2 text-lime-300 text-sm">Density</th>
                            <th className="p-2 text-lime-300 text-sm">PV</th>
                            <th className="p-2 text-lime-300 text-sm">YP</th>
                            <th className="p-2 text-lime-300 text-sm">Cost</th>
                        </tr>
                    </thead>
                    <tbody>
                        {breakdown.map((item, i) => (
                            <tr key={i} className="border-b border-white/10">
                                <td className="p-2 text-white">{item.additive}</td>
                                <td className="p-2 text-white">{item.density_contribution_ppg.toFixed(2)}</td>
                                <td className="p-2 text-white">{item.pv_contribution_cp.toFixed(2)}</td>
                                <td className="p-2 text-white">{item.yp_contribution_lb_100ft2.toFixed(2)}</td>
                                <td className="p-2 text-white">${item.cost_usd.toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
          </div>
      </div>
    </motion.div>
  );
};

export default ResultsPanel;
