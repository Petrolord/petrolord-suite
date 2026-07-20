import React from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import Header from '@/components/Header';
import HeroSection from '@/components/HeroSection';
import GetInstantQuoteSection from '@/components/GetInstantQuoteSection';
import ModulesShowcase from '@/components/home/ModulesShowcase';
import NextGenInfoCard from '@/components/home/NextGenInfoCard';
import Footer from '@/components/Footer';
import HSEInfoCard from '@/components/HSEInfoCard';

const stats = [
  {
    value: '60+',
    label: 'Engineering Applications',
    gradient: 'from-lime-400 to-green-400',
  },
  {
    value: '7',
    label: 'Discipline Modules',
    gradient: 'from-orange-400 to-amber-400',
  },
  {
    value: '1,000+',
    label: 'Engine Validation Checks Against Published References',
    gradient: 'from-green-400 to-lime-400',
  },
];

function Home() {
  return (
    <>
      <Helmet>
        <title>Petrolord Suite - The Digital OS for the Energy Enterprise</title>
        <meta name="description" content="The Digital Operating System for the Modern Energy Enterprise. Connecting subsurface intelligence, operational efficiency, and commercial strategy on a unified platform." />
      </Helmet>

      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-green-950 text-white">
        <Header />
        <HeroSection />
        <ModulesShowcase />
        <GetInstantQuoteSection />
        <HSEInfoCard />
        <NextGenInfoCard />

        <section className="py-20 px-6 bg-slate-900/50">
          <div className="container mx-auto max-w-6xl">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center"
            >
              {stats.map((stat) => (
                <div key={stat.label} className="space-y-4">
                  <div className={`text-5xl font-bold bg-gradient-to-r ${stat.gradient} bg-clip-text text-transparent`}>
                    {stat.value}
                  </div>
                  <p className="text-slate-300 text-lg">{stat.label}</p>
                </div>
              ))}
            </motion.div>
          </div>
        </section>

        <Footer />
      </div>
    </>
  );
}

export default Home;
