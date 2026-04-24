import React from 'react';
import { Helmet } from 'react-helmet';

const Geoscience = () => {
  return (
    <>
      <Helmet>
        <title>Geoscience Dashboard - Petrolord Suite</title>
        <meta name="description" content="Geoscience analytics and workflows dashboard" />
      </Helmet>
      <div className="flex flex-col h-full bg-slate-950 text-white p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight mb-2">
            Geoscience Dashboard
          </h1>
          <p className="text-slate-400 text-lg">
            Welcome to the Geoscience module. This is a placeholder component.
          </p>
        </div>
        
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-slate-200 mb-2">
              Component Under Development
            </h2>
            <p className="text-slate-400">
              This Geoscience dashboard component was created as a placeholder to resolve build issues. 
              It can be replaced with the actual implementation when requirements are defined.
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default Geoscience;