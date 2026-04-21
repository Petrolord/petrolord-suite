import React from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Database } from 'lucide-react';

const ReservoirEngineering = () => {
  return (
    <>
      <Helmet>
        <title>Reservoir Engineering - Petrolord Suite</title>
        <meta name="description" content="Reservoir engineering applications and analysis." />
      </Helmet>
      <div className="p-4 sm:p-8 bg-slate-900 text-white min-h-screen">
        <div className="flex items-center space-x-4 mb-8">
          <Link to="/dashboard">
            <Button variant="outline" size="sm" className="border-lime-400/50 text-lime-300 hover:bg-lime-500/20">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
        </div>
        <div className="flex items-center space-x-4 mb-8">
          <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-3 rounded-xl">
            <Database className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-white">Reservoir Engineering</h1>
            <p className="text-lime-200 text-lg">Reservoir analysis and modeling tools</p>
          </div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-8">
          <p className="text-slate-400 text-center text-lg">
            Reservoir engineering applications and tools will be available here.
          </p>
        </div>
      </div>
    </>
  );
};

export default ReservoirEngineering;