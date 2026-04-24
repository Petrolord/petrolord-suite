import React from 'react';

const GettingStartedGuide = () => (
    <div className="space-y-6">
        <h1>Getting Started with ReservoirCalc Pro</h1>
        <p className="lead text-xl text-slate-300">
            Welcome to ReservoirCalc Pro, the premier deterministic volume computation tool in the PetroLord ecosystem.
        </p>

        <section>
            <h2>1. System Requirements</h2>
            <ul className="list-disc pl-6 space-y-2 text-slate-400">
                <li>Modern Web Browser (Chrome 90+, Firefox 88+, Safari 14+)</li>
                <li>Minimum Display Resolution: 1366x768</li>
                <li>Internet Connection for data synchronization</li>
            </ul>
        </section>

        <section>
            <h2>2. First-Time Setup</h2>
            <p className="text-slate-400">No installation is required. Simply log in to your PetroLord account and navigate to <strong>Apps &gt; ReservoirCalc Pro</strong>.</p>
            <div className="bg-slate-900 p-4 rounded-lg border border-slate-800 mt-4">
                <h3 className="text-white mb-2">Quick Start Tutorial</h3>
                <ol className="list-decimal pl-6 space-y-2 text-slate-400">
                    <li>Select your <strong>Unit System</strong> (Field or Metric) in the top-left panel.</li>
                    <li>Choose <strong>Simple</strong> input method for a quick look calculation.</li>
                    <li>Enter <strong>Area</strong> (acres/km²) and <strong>Thickness</strong> (ft/m).</li>
                    <li>Input basic <strong>Petrophysics</strong> (Porosity, Sw, NTG).</li>
                    <li>Click <strong>Calculate</strong> to see immediate STOOIP/GIIP results.</li>
                </ol>
            </div>
        </section>
    </div>
);

export default GettingStartedGuide;