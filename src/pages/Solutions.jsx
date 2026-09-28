import React from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ChevronRight, Layers, BarChart3, Anchor, Zap, Factory, Milestone, ShieldCheck, Container, ShieldHalf, Filter } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { PublicPage } from '@/components/public/PublicPage';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { SUITE_MODULES, suiteStats } from '@/data/suiteCatalog';

// Names, descriptions and app lists come from src/data/suiteCatalog.js, the
// same list the homepage reads; only the icon of each module lives here
// (batch 7C: the per-module colours went, colour is for status only).
const LOOK = {
  geoscience: { icon: Layers },
  reservoir: { icon: BarChart3 },
  drilling: { icon: Anchor },
  production: { icon: Zap },
  facilities: { icon: Factory },
  'process-safety': { icon: ShieldHalf },
  'midstream-downstream': { icon: Container },
  economics: { icon: Milestone },
  assurance: { icon: ShieldCheck },
  'data-ai': { icon: Filter },
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
      <PublicPage testId="solutions-theme-scope" header={<Header />}>

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center my-12 max-w-3xl mx-auto"
          >
            <div className="inline-block px-3 py-1 mb-4 text-xs font-semibold tracking-[0.16em] text-pl-accent-text uppercase bg-pl-accent/10 rounded-full border border-pl-accent/40">
              Solutions
            </div>
            <h1 className="font-pl-display text-4xl md:text-6xl font-semibold text-pl-text mb-4 leading-tight">
              {stats.modulesWord} modules. One workflow.
            </h1>
            <p className="text-xl text-pl-muted">
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
                  <div className="relative inline-block p-6 bg-pl-surface border border-pl-border rounded-2xl shadow-pl-sm">
                    <category.icon className="h-24 w-24 text-pl-primary-text" aria-hidden="true" />
                  </div>
                </div>
                <div className="md:col-span-3">
                  <h2 className="font-pl-display text-4xl font-semibold text-pl-text mb-2">{category.name}</h2>
                  <p className="text-sm text-pl-accent-text font-medium mb-4">{category.count} apps live</p>
                  <p className="text-pl-text text-lg mb-6 leading-relaxed">{category.description}</p>
                  <div className="flex flex-wrap gap-2 mb-6">
                    {category.apps.map((app) => (
                      <span key={app} className="bg-pl-sunken text-pl-text text-xs font-medium px-2.5 py-1 rounded-full">{app}</span>
                    ))}
                  </div>
                  <Button
                    onClick={() => explore(category)}
                    className="font-semibold"
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
      </PublicPage>
    </>
  );
};

export default Solutions;
