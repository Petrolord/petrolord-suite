import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { ChevronRight } from 'lucide-react';
import BookDemoModal from '@/components/BookDemoModal';

const HeroSection = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);

  const handleStartConfiguration = () => {
    console.log('HeroSection: Start Configuration clicked');
    if (user) {
      console.log('HeroSection: User logged in, navigating to /get-quote');
      navigate('/get-quote');
    } else {
      console.log('HeroSection: User not logged in, redirecting to /signup');
      navigate('/signup');
    }
  };

  const handleBookDemo = () => {
    console.log('HeroSection: Book Demo clicked, opening modal');
    setIsDemoModalOpen(true);
  };

  return (
    <section className="relative overflow-hidden bg-transparent">
      <div className="absolute inset-0 bg-grid-slate-800 [mask-image:linear-gradient(to_bottom,white_20%,transparent_75%)]"></div>
      <div className="relative container mx-auto px-6 py-20 text-center">
        <motion.div 
          initial={{ opacity: 0, y: 30 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.8 }} 
          className="max-w-4xl mx-auto"
        >
          <div className="flex justify-center mb-8">
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              transition={{ duration: 0.6, delay: 0.2 }} 
              className="relative"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-lime-500 to-orange-500 rounded-full blur-xl opacity-30 animate-pulse"></div>
              <div className="relative p-2">
                <img alt="Petrolord Logo" className="w-24 h-24 object-contain" src="https://horizons-cdn.hostinger.com/43fa5c4b-d185-4d6d-9ff4-a1d78861fb87/2e67bfd0151fc6ba8faf620cf9d545c4.png" />
              </div>
            </motion.div>
          </div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ duration: 0.6, delay: 0.3 }} 
            className="mb-6 flex flex-col md:flex-row items-center justify-center"
          >
             <img src="https://horizons-cdn.hostinger.com/43fa5c4b-d185-4d6d-9ff4-a1d78861fb87/fa5dc996dd152e5209a20a6e60cd68db.png" alt="Petrolord Suite" className="h-16 md:h-20 object-contain drop-shadow-lg" />
          </motion.div>

          <motion.p 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ duration: 0.6, delay: 0.4 }} 
            className="text-xl md:text-2xl text-slate-300 mb-10 leading-relaxed"
          >
            The Digital Operating System for the Modern Energy Enterprise.
            <br />
            <span className="text-orange-300 font-medium">Connecting subsurface intelligence, operational efficiency, and commercial strategy.</span>
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ duration: 0.6, delay: 0.5 }} 
            className="flex flex-wrap justify-center gap-4"
          >
            {user ? (
              <Button 
                size="lg" 
                className="bg-gradient-to-r from-lime-500 to-green-600 hover:from-lime-600 hover:to-green-700 text-white px-8 py-6 rounded-lg text-lg font-semibold shadow-xl hover:shadow-2xl transition-all duration-300" 
                onClick={() => navigate('/dashboard')}
              >
                Go to Dashboard
                <ChevronRight className="ml-2 w-5 h-5" />
              </Button> 
            ) : (
              <>
                <Button 
                  size="lg" 
                  className="bg-gradient-to-r from-lime-500 to-green-600 hover:from-lime-600 hover:to-green-700 text-white px-8 py-6 rounded-lg text-lg font-semibold shadow-xl hover:shadow-2xl transition-all duration-300" 
                  onClick={handleStartConfiguration}
                >
                  Start Configuration
                  <ChevronRight className="ml-2 w-5 h-5" />
                </Button>
                <Button 
                  size="lg" 
                  variant="outline" 
                  className="border-slate-600 text-white hover:bg-slate-800/50 px-8 py-6 rounded-lg text-lg font-semibold backdrop-blur-sm" 
                  onClick={handleBookDemo}
                >
                  Book Demo
                </Button>
              </>
            )}
          </motion.div>
        </motion.div>
      </div>

      <BookDemoModal 
        isOpen={isDemoModalOpen} 
        onClose={() => setIsDemoModalOpen(false)} 
      />
    </section>
  );
};

export default HeroSection;