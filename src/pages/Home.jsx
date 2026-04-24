import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { useToast } from '@/components/ui/use-toast';
import Header from '@/components/Header';
import HeroSection from '@/components/HeroSection';
import GetInstantQuoteSection from '@/components/GetInstantQuoteSection';
import ApplicationsGrid from '@/components/ApplicationsGrid';
import Footer from '@/components/Footer';
import HSEInfoCard from '@/components/HSEInfoCard';

function Home() {
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleAppClick = (categoryPath) => {
    navigate(categoryPath);
  };

  const handleContactClick = () => {
    toast({
      title: "🚧 Feature Coming Soon!",
      description: "Contact sales isn't implemented yet—but don't worry! You can request it in your next prompt! 🚀",
      duration: 4000,
    });
  };

  const handleTermsClick = () => {
    toast({
      title: "🚧 Feature Coming Soon!",
      description: "Terms of Service page isn't implemented yet—but don't worry! You can request it in your next prompt! 🚀",
      duration: 4000,
    });
  };

  const handlePrivacyClick = () => {
    toast({
      title: "🚧 Feature Coming Soon!",
      description: "Privacy Policy page isn't implemented yet—but don't worry! You can request it in your next prompt! 🚀",
      duration: 4000,
    });
  };

  return (
    <>
      <Helmet>
        <title>Petrolord Suite - The Digital OS for the Energy Enterprise</title>
        <meta name="description" content="The Digital Operating System for the Modern Energy Enterprise. Connecting subsurface intelligence, operational efficiency, and commercial strategy on a unified platform." />
      </Helmet>
      
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-green-950 text-white">
        <Header />
        <HeroSection handleContactClick={handleContactClick} />
        <GetInstantQuoteSection />
        <ApplicationsGrid />
        <HSEInfoCard />
        
        <section className="py-20 px-6 bg-slate-900/50">
          <div className="container mx-auto max-w-6xl">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center"
            >
              <div className="space-y-4">
                <div className="text-5xl font-bold bg-gradient-to-r from-lime-400 to-green-400 bg-clip-text text-transparent">
                  70+
                </div>
                <p className="text-slate-300 text-lg">Applications</p>
              </div>
              <div className="space-y-4">
                <div className="text-5xl font-bold bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">
                  50+
                </div>
                <p className="text-slate-300 text-lg">Global Companies</p>
              </div>
              <div className="space-y-4">
                <div className="text-5xl font-bold bg-gradient-to-r from-green-400 to-lime-400 bg-clip-text text-transparent">
                  99.9%
                </div>
                <p className="text-slate-300 text-lg">Uptime Reliability</p>
              </div>
            </motion.div>
          </div>
        </section>

        <Footer 
          handleAppClick={handleAppClick}
          handleContactClick={handleContactClick}
          handleTermsClick={handleTermsClick}
          handlePrivacyClick={handlePrivacyClick}
        />
      </div>
    </>
  );
}

export default Home;