import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight, Layers, BarChart3, Anchor, Zap, Factory, Milestone } from 'lucide-react';

const modules = [
  {
    name: 'Geoscience & Subsurface',
    icon: Layers,
    color: 'from-cyan-400 to-blue-500',
    description: 'Interpret seismic in 2D and 3D, correlate wells, map surfaces, and build earth models on shared project data.',
    apps: ['Seismolord Interpretation', 'EarthModel Studio', 'Well Log Correlation', 'Pore Pressure Predictor'],
  },
  {
    name: 'Reservoir Engineering',
    icon: BarChart3,
    color: 'from-lime-400 to-green-500',
    description: 'Characterize fluids, run material balance and decline analysis, design waterfloods, and analyze well tests with engines validated against published references.',
    apps: ['Decline Curve Analysis', 'Material Balance Studio', 'Fluid Systems Studio', 'Waterflood Design Studio', 'Well Test Analysis Studio', 'SCAL Studio'],
  },
  {
    name: 'Production & Optimization',
    icon: Zap,
    color: 'from-yellow-400 to-amber-500',
    description: 'Model well performance from reservoir to surface, design artificial lift, and monitor flow assurance across your asset.',
    apps: ['Nodal Analysis Studio', 'Artificial Lift Designer', 'Flow Assurance Monitor'],
  },
  {
    name: 'Drilling & Completions',
    icon: Anchor,
    color: 'from-red-500 to-orange-500',
    description: 'Plan wells, design casing and tubing strings, and simulate hydraulics, torque and drag, and cementing operations.',
    apps: ['Well Planning', 'Casing & Tubing Design', 'Torque & Drag', 'Cementing Simulation'],
  },
  {
    name: 'Facilities Engineering',
    icon: Factory,
    color: 'from-blue-500 to-indigo-600',
    description: 'Size pipelines and relief systems, predict corrosion, and keep surface infrastructure safe and efficient.',
    apps: ['Pipeline Sizer', 'Relief & Blowdown Sizing', 'Corrosion Rate Predictor'],
  },
  {
    name: 'Economics & Project Management',
    icon: Milestone,
    color: 'from-purple-500 to-indigo-600',
    description: 'Evaluate project economics, manage AFEs and capital portfolios, and accelerate field development planning.',
    apps: ['Economic Planning Engine', 'Capital Portfolio Studio', 'AFE & Cost Control', 'FDP Accelerator'],
  },
];

const ModulesShowcase = () => {
  const navigate = useNavigate();

  return (
    <section className="py-20 px-6 bg-slate-950/40">
      <div className="container mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-3xl mx-auto mb-14"
        >
          <div className="inline-block px-3 py-1 mb-4 text-xs font-semibold tracking-wider text-lime-300 uppercase bg-lime-500/10 rounded-full border border-lime-500/20">
            The Platform
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 leading-tight">
            Every discipline. One suite.
          </h2>
          <p className="text-xl text-slate-300 font-light">
            Purpose-built applications for the full E&P workflow, from seismic to sales, sharing one project database.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {modules.map((module, index) => (
            <motion.div
              key={module.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.08 }}
              className="group flex flex-col rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-600 hover:shadow-2xl transition-all duration-300 p-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className={`p-3 rounded-lg bg-gradient-to-br ${module.color} text-slate-900 shadow-lg`}>
                  <module.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold text-white">{module.name}</h3>
              </div>

              <p className="text-sm text-slate-400 leading-relaxed mb-4">{module.description}</p>

              <div className="flex flex-wrap gap-2 mt-auto">
                {module.apps.map((app) => (
                  <span
                    key={app}
                    className="px-2.5 py-1 text-xs font-medium text-slate-300 bg-slate-800/80 border border-slate-700 rounded-full"
                  >
                    {app}
                  </span>
                ))}
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-12 text-center"
        >
          <Button
            size="lg"
            variant="outline"
            className="border-slate-600 text-white hover:bg-slate-800/50 px-8 py-6 rounded-lg text-lg font-semibold"
            onClick={() => navigate('/solutions')}
          >
            Explore All Solutions
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </motion.div>
      </div>
    </section>
  );
};

export default ModulesShowcase;
