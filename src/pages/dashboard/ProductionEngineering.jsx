import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import ApplicationsGrid from '@/components/ApplicationsGrid';
import { Input } from '@/components/ui/input';
import { Search, Zap } from 'lucide-react';

const ProductionEngineering = () => {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <>
      <Helmet>
        <title>Production Engineering - Petrolord Suite</title>
        <meta name="description" content="Comprehensive production engineering applications for well performance optimization and operations." />
      </Helmet>
      
      <div className="p-4 sm:p-8 max-w-[1920px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <div className="flex items-center space-x-4 mb-4">
            <div className="bg-gradient-to-r from-orange-500 to-yellow-500 p-3 rounded-xl shadow-lg shadow-orange-500/20">
              <Zap className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">Production Engineering</h1>
              <p className="text-orange-200 text-lg mt-1">Advanced tools for well performance analysis, optimization, and operations</p>
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
              placeholder="Search production applications..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <ApplicationsGrid moduleFilter="production" searchQuery={searchTerm} />
        </motion.div>
      </div>
    </>
  );
};

export default ProductionEngineering;