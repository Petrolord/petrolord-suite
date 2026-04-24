import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Layers, AppWindow, FileText, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const GetInstantQuoteSection = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleGetQuote = () => {
    console.log('GetInstantQuoteSection: Get Instant Quote clicked');
    if (user) {
      console.log('GetInstantQuoteSection: User logged in, navigating to /get-quote');
      navigate('/get-quote');
    } else {
      console.log('GetInstantQuoteSection: User not logged in, redirecting to /signup');
      navigate('/signup');
    }
  };

  const steps = [
    { 
      id: 1, 
      title: 'Select Modules', 
      icon: Layers, 
      desc: 'Choose from our comprehensive suite of domains including Geoscience, Drilling, and Production.' 
    },
    { 
      id: 2, 
      title: 'Choose Apps', 
      icon: AppWindow, 
      desc: 'Pick specific specialized applications tailored to your operational needs.' 
    },
    { 
      id: 3, 
      title: 'Get Quote', 
      icon: FileText, 
      desc: 'Receive an instant, transparent pricing breakdown including VAT and services.' 
    },
  ];

  return (
    <section className="relative py-24 bg-gradient-to-b from-slate-900 to-slate-950 overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden opacity-20 pointer-events-none">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-lime-500/30 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-0 w-64 h-64 bg-yellow-500/20 rounded-full blur-3xl"></div>
      </div>

      <div className="container mx-auto px-6 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          
          {/* Content Side */}
          <motion.div 
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="space-y-8"
          >
            <div>
              <div className="inline-block px-3 py-1 mb-4 text-xs font-semibold tracking-wider text-[#FCD34D] uppercase bg-yellow-500/10 rounded-full border border-yellow-500/20">
                Transparent Pricing
              </div>
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 leading-tight">
                Get <span className="text-[#FCD34D]">Instant Quote</span>
              </h2>
              <p className="text-xl text-slate-300 font-light">
                Configure your Suite in minutes and see pricing instantly.
              </p>
            </div>

            <p className="text-slate-400 leading-relaxed max-w-lg">
              Select your modules, choose your apps, and get an instant quote with transparent pricing including VAT and all services. Streamline your procurement process today.
            </p>

            {/* Steps */}
            <div className="grid gap-5">
              {steps.map((step) => (
                <div key={step.id} className="flex items-start gap-4 p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 hover:bg-slate-800 hover:border-lime-500/30 transition-all duration-300">
                  <div className="flex-shrink-0 p-3 rounded-lg bg-slate-900 text-[#FCD34D] shadow-md border border-slate-800">
                    <step.icon size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white flex items-center gap-3">
                      {step.title}
                      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-700 text-[10px] text-slate-300 font-mono border border-slate-600">
                        {step.id}
                      </span>
                    </h3>
                    <p className="text-sm text-slate-400 mt-1 leading-snug">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="pt-4"
            >
              <Button 
                onClick={handleGetQuote}
                className="bg-[#FCD34D] hover:bg-yellow-500 text-slate-900 font-bold text-lg px-8 py-6 rounded-lg shadow-[0_4px_20px_rgba(252,211,77,0.2)] hover:shadow-[0_4px_30px_rgba(252,211,77,0.4)] transition-all w-full md:w-auto flex items-center justify-center gap-3"
              >
                Get Instant Quote <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </motion.div>
          </motion.div>

          {/* Image Side */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative hidden lg:block"
          >
            <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-slate-700/50 group">
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/20 to-transparent z-10 pointer-events-none"></div>
              
              <img 
                src="https://images.unsplash.com/photo-1692075764727-9aed95d2570c" 
                alt="Energy Industry Configuration" 
                className="w-full h-[700px] object-cover object-center transform group-hover:scale-105 transition-transform duration-1000 ease-out"
              />
              
              {/* Floating Badge */}
              <div className="absolute bottom-10 left-10 right-10 z-20">
                <div className="bg-slate-900/80 backdrop-blur-xl p-6 rounded-xl border border-slate-600/50 shadow-2xl">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-green-500/20 rounded-full text-green-400 border border-green-500/30">
                      <CheckCircle2 size={28} />
                    </div>
                    <div>
                      <h4 className="text-white font-bold text-lg">Transparent Pricing</h4>
                      <p className="text-sm text-slate-400">Real-time calculation engine active</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-slate-400 uppercase font-semibold tracking-wider">
                      <span>Configuration Status</span>
                      <span className="text-[#FCD34D]">Ready</span>
                    </div>
                    <div className="h-2 w-full bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-lime-500 to-[#FCD34D] w-full animate-pulse shadow-[0_0_10px_rgba(132,204,22,0.5)]"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Decorative dots grid */}
            <div className="absolute -bottom-8 -right-8 w-32 h-32 opacity-30 z-0 bg-[radial-gradient(#FCD34D_1px,transparent_1px)] [background-size:16px_16px]"></div>
          </motion.div>

        </div>
      </div>
    </section>
  );
};

export default GetInstantQuoteSection;