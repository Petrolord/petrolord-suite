import React from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Layers3 } from 'lucide-react';

const Geoscience = () => {
  return (
    <>
      <Helmet>
        <title>Geoscience - Petrolord Suite</title>
        <meta name="description" content="Geoscience applications and workflows." />
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
          <div className="bg-gradient-to-r from-emerald-500 to-green-500 p-3 rounded-xl">
            <Layers3 className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-white">Geoscience</h1>
            <p className="text-lime-200 text-lg">Subsurface analysis and geological modeling</p>
          </div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-8">
          <p className="text-slate-400 text-center text-lg">
            Geoscience applications and workflows will be available here.
          </p>
        </div>
      </div>
    </>
  );
};

export default Geoscience;