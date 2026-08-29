import React from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ChevronRight, Layers, BarChart3, Anchor, Zap, Factory, Milestone, ShieldCheck } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useAuth } from '@/contexts/SupabaseAuthContext';

// Categories, names, and app pills mirror the homepage ModulesShowcase and
// the live master_apps catalog (Active tiles only, checked 2026-08-05).
// Update the three together.
const solutionCategories = [
  {
    name: 'Geoscience & Subsurface',
    icon: Layers,
    color: 'from-cyan-400 to-blue-500',
    path: '/dashboard/geoscience',
    count: 10,
    description: 'Interpret seismic in 2D and 3D with Seismolord, manage well data and logs, correlate wells, grid and map surfaces, predict pore pressure, and build earth models. Every app reads and publishes to shared well and surface registries, so an interpretation made in one tool is instantly available in the next.',
    apps: ['Seismolord', 'Well Data Manager', 'Petrophysics Studio', 'Well Correlation', 'Mapping & Surface Studio', 'Pore Pressure Studio', 'Rock Physics Studio', 'Earth Modeling'],
  },
  {
    name: 'Reservoir Engineering',
    icon: BarChart3,
    color: 'from-lime-400 to-green-500',
    path: '/dashboard/reservoir',
    count: 11,
    description: 'Work fluids, material balance, decline analysis, SCAL, waterflood design and surveillance, and well test analysis in dedicated studios. The engines behind them are validated against published references before release, and the validation suites run on every change.',
    apps: ['Decline Curve Analysis', 'Material Balance Studio', 'Fluid Systems Studio', 'SCAL Studio', 'Waterflood Design Studio', 'Well Test Analysis Studio', 'Forecast Scenario Hub', 'EOR Screening'],
  },
  {
    name: 'Production & Optimization',
    icon: Zap,
    color: 'from-yellow-400 to-amber-500',
    path: '/dashboard/production',
    count: 7,
    description: 'Model well performance from reservoir to surface with the Nodal Analysis Studio, design artificial lift, watch flow assurance risks, and keep an eye on daily performance with the surveillance dashboard.',
    apps: ['Nodal Analysis Studio', 'Artificial Lift Designer', 'Flow Assurance Monitor', 'Production Surveillance Dashboard', 'Wellbore Flow Simulator'],
  },
  {
    name: 'Drilling & Completions',
    icon: Anchor,
    color: 'from-red-500 to-orange-500',
    path: '/dashboard/drilling',
    count: 11,
    description: 'Plan wells, design casing, tubing and completion strings, and prove hydraulics, torque and drag, well control margins, cementing, wellbore stability, perforating, sand control, stimulation and well integrity through abandonment before committing capital to the hole.',
    apps: ['Well Design Studio', 'Casing & Tubing Design Studio', 'Drilling Fluids & Hydraulics Studio', 'Torque & Drag Studio', 'Well Control Studio', 'Cementing Studio', 'Geomechanics Studio', 'Completion Design Studio', 'Perforation & Sand Control Designer', 'Stimulation Designer'],
  },
  {
    name: 'Facilities Engineering',
    icon: Factory,
    color: 'from-blue-500 to-indigo-600',
    path: '/dashboard/facilities',
    count: 7,
    description: 'Size lines, separators, slug catchers, and relief and blowdown systems, design gas treating and heat exchange, map facility layouts, and predict corrosion so surface infrastructure stays safe and efficient.',
    apps: ['Facility Network Hydraulics', 'Separator & Slug Catcher Designer', 'Relief & Blowdown Sizer', 'Gas Treating & Dehydration', 'Heat Exchanger Sizer', 'Corrosion Rate Predictor'],
  },
  {
    name: 'Economics & Project Management',
    icon: Milestone,
    color: 'from-purple-500 to-indigo-600',
    path: '/dashboard/economics',
    count: 11,
    description: 'Evaluate projects under real fiscal regimes with the Petroleum Economics Studio, manage AFEs and capital portfolios, run breakeven and value-of-information analysis, and accelerate field development planning.',
    apps: ['Petroleum Economics Studio', 'Fiscal Regime Designer', 'Capital Portfolio Studio', 'AFE Cost Control Manager', 'FDP Accelerator', 'NPV Scenario Builder'],
  },
  {
    name: 'Assurance & Risk',
    icon: ShieldCheck,
    color: 'from-emerald-400 to-teal-500',
    path: '/dashboard/assurance',
    count: 14,
    description: 'Quantify uncertainty and manage risk across the portfolio: prospect ranking, exploration risk, Monte Carlo and decision tree analysis, plus compliance registers and audit trails that keep decisions defensible.',
    apps: ['Risk Register', 'Risk Heatmap', 'Monte Carlo Analyzer', 'Decision Tree Analyzer', 'Exploration Risk Analyzer', 'Prospect Ranking Tool', 'Audit Trail Manager'],
  },
];

const Solutions = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const explore = (category) => {
    if (user) navigate(category.path);
    else navigate('/signup');
  };

  return (
    <>
      <Helmet>
        <title>Solutions - Petrolord</title>
        <meta name="description" content="Seven discipline modules and more than 70 live engineering applications covering the full E&P workflow on one platform." />
      </Helmet>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-green-950 text-slate-200">
        <Header />

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center my-12 max-w-3xl mx-auto"
          >
            <div className="inline-block px-3 py-1 mb-4 text-xs font-semibold tracking-wider text-lime-300 uppercase bg-lime-500/10 rounded-full border border-lime-500/20">
              Solutions
            </div>
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-4 leading-tight">
              Eight modules. One workflow.
            </h1>
            <p className="text-xl text-slate-300 font-light">
              More than 70 live applications covering the E&P workflow from seismic to sales, sharing one project database.
            </p>
          </motion.div>

          <div className="space-y-16 my-20">
            {solutionCategories.map((category, index) => (
              <motion.div
                key={category.name}
                initial={{ opacity: 0, x: index % 2 === 0 ? -50 : 50 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: 0.1 }}
                className="grid md:grid-cols-5 gap-8 items-center"
              >
                <div className={`md:col-span-2 ${index % 2 !== 0 ? 'md:order-last' : ''}`}>
                  <div className="relative inline-block p-6 bg-slate-800/50 border border-slate-700 rounded-2xl">
                    <div className={`absolute -inset-px bg-gradient-to-r ${category.color} rounded-2xl blur-lg opacity-20`}></div>
                    <category.icon className="h-24 w-24 text-lime-300" />
                  </div>
                </div>
                <div className="md:col-span-3">
                  <h2 className={`text-4xl font-bold mb-2 bg-gradient-to-r ${category.color} bg-clip-text text-transparent`}>{category.name}</h2>
                  <p className="text-sm text-slate-500 mb-4">{category.count} apps live</p>
                  <p className="text-slate-300 text-lg mb-6 leading-relaxed">{category.description}</p>
                  <div className="flex flex-wrap gap-2 mb-6">
                    {category.apps.map((app) => (
                      <span key={app} className="bg-slate-700 text-slate-300 text-xs font-medium px-2.5 py-1 rounded-full">{app}</span>
                    ))}
                  </div>
                  <Button
                    onClick={() => explore(category)}
                    className={`bg-gradient-to-r ${category.color} text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-300`}
                  >
                    {user ? `Open ${category.name.split(' ')[0]}` : 'Get Started'}
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <Footer />
      </div>
    </>
  );
};

export default Solutions;
