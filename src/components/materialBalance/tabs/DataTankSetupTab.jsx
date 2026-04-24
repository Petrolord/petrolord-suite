import React from 'react';
import TankSetupForm from '../TankSetupForm';
import ContactSetupPanel from '../ContactSetupPanel';
import PVTSetupPanel from '../PVTSetupPanel';

const DataTankSetupTab = () => {
  return (
    <div className="p-4 h-full overflow-y-auto space-y-6">
      
      {/* Top Section: Basic Metadata and measured contacts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="col-span-1 lg:col-span-5 flex flex-col h-full min-h-[400px]">
          <TankSetupForm />
        </div>
        <div className="col-span-1 lg:col-span-7 flex flex-col h-full min-h-[400px]">
          <ContactSetupPanel />
        </div>
      </div>

      {/* Main Section: The comprehensive PVT panel */}
      <div className="w-full border-t border-slate-800 pt-6">
        <h2 className="text-lg font-bold text-white mb-4">PVT Modeling Engine</h2>
        <div className="min-h-[600px]">
            <PVTSetupPanel />
        </div>
      </div>

    </div>
  );
};

export default DataTankSetupTab;