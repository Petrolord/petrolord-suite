import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import ApplicationsGrid from '@/components/ApplicationsGrid';
import { Input } from '@/components/ui/input';
import { Search, Droplet } from 'lucide-react';

const ReservoirEngineering = () => {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <>
      <Helmet>
        <title>Reservoir Engineering - Petrolord Suite</title>
        <meta name="description" content="Advanced reservoir engineering tools and applications for field development and management." />
      </Helmet>
      
      <div className="p-4 sm:p-8 max-w-[1920px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <div className="flex items-center space-x-4 mb-4">
            <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-3 rounded-xl shadow-lg shadow-blue-500/20">
              <Droplet className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">Reservoir Engineering</h1>
              <p className="text-blue-200 text-lg mt-1">Advanced tools for reservoir characterization, simulation, and optimization</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mb-8"
        >
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500 w-4 h-4" />
            <Input
              type="text"
              placeholder="Search reservoir applications..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <ApplicationsGrid moduleFilter="reservoir" searchQuery={searchTerm} />
        </motion.div>
      </div>
    </>
  );
};

export default ReservoirEngineering;