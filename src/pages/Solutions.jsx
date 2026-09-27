import React from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ChevronRight, Layers, BarChart3, Anchor, Zap, Factory, Milestone, ShieldCheck, Container, ShieldHalf, Filter } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { SUITE_MODULES, suiteStats } from '@/data/suiteCatalog';

// Names, descriptions and app lists come from src/data/suiteCatalog.js, the
// same list the homepage reads; only the look of each module lives here.
const LOOK = {
  geoscience: { icon: Layers, color: 'from-cyan-400 to-blue-500' },
  reservoir: { icon: BarChart3, color: 'from-lime-400 to-green-500' },
  drilling: { icon: Anchor, color: 'from-red-500 to-orange-500' },
  production: { icon: Zap, color: 'from-yellow-400 to-amber-500' },
  facilities: { icon: Factory, color: 'from-blue-500 to-indigo-600' },
  'process-safety': { icon: ShieldHalf, color: 'from-red-400 to-amber-500' },
  'midstream-downstream': { icon: Container, color: 'from-orange-400 to-amber-500' },
  economics: { icon: Milestone, color: 'from-purple-500 to-indigo-600' },
  assurance: { icon: ShieldCheck, color: 'from-emerald-400 to-teal-500' },
  'data-ai': { icon: Filter, color: 'from-sky-400 to-indigo-500' },
};

const solutionCategories = SUITE_MODULES.map((m) => ({
  ...m,
  ...LOOK[m.slug],
  path: `/dashboard/${m.slug}`,
  count: m.apps.length,
}));

const stats = suiteStats();

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
        <meta name="description" content={`${stats.modulesWord} modules and ${stats.apps} live engineering applications covering the energy value chain on one platform.`} />
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
              {stats.modulesWord} modules. One workflow.
            </h1>
            <p className="text-xl text-slate-300 font-light">
              {stats.apps} live applications covering the value chain from seismic to sales, sharing one project database.
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
                    {user ? `Open ${category.short}` : 'Get Started'}
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
