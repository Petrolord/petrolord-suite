import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import Sidebar from '@/components/earthmodel/Sidebar';
import MainViewport from '@/components/earthmodel/MainViewport';
import { Toaster } from '@/components/ui/toaster';
import '@/styles/earthmodel-phase2.css';
import '@/styles/earthmodel-help.css';
import { HelpProvider } from '@/context/HelpContext';
import { TrainingProvider } from '@/context/TrainingContext';
import { SettingsProvider } from '@/context/SettingsContext';
import { NotificationProvider } from '@/context/NotificationContext';
import HelpCenter from '@/components/earthmodel/help/HelpCenter';
import TrainingHub from '@/components/earthmodel/training/TrainingHub';
import SettingsPanel from '@/components/earthmodel/settings/SettingsPanel';
import { useApplicationMode } from '@/hooks/useApplicationMode';
import EarthModelProHeader from '@/components/earthmodel/EarthModelProHeader';
import WellSecurityGuard from '@/components/earthmodel/wells/WellSecurityGuard';

const EarthModelPro = () => {
  const [activeModule, setActiveModule] = useState('hub');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const { setApplicationMode, exitApplicationMode } = useApplicationMode();

  // Ensure Application Mode is active when this component mounts
  useEffect(() => {
    setApplicationMode({
      id: 'earth-model-pro',
      name: 'EarthModel Pro',
      hideSidebar: true
    });

    // Cleanup on unmount
    return () => {
      exitApplicationMode();
    };
  }, [setApplicationMode, exitApplicationMode]);

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  return (
    <>
      <Helmet>
        <title>EarthModel Pro - Advanced Geoscience Modeling</title>
        <meta name="description" content="Professional 3D geological modeling, facies simulation, and uncertainty analysis." />
      </Helmet>
      
      <HelpProvider>
        <TrainingProvider>
          <SettingsProvider>
            <NotificationProvider>
                <div className="flex h-screen w-full overflow-hidden bg-slate-950 earthmodel-pro-container text-slate-100 flex-col">
                  
                  <EarthModelProHeader 
                    activeModule={activeModule} 
                    toggleSidebar={toggleSidebar}
                    activeProject={{ name: 'Project Alpha' }} // Placeholder for now
                  />

                  <div className="flex-1 flex overflow-hidden relative">
                    {isSidebarOpen && (
                      <Sidebar activeModule={activeModule} setActiveModule={setActiveModule} />
                    )}
                    
                    <main className="flex-1 relative flex flex-col min-w-0 overflow-hidden bg-slate-900">
                      <WellSecurityGuard>
                        <MainViewport activeModule={activeModule} />
                      </WellSecurityGuard>
                    </main>
                  </div>
                  
                  {/* Global Overlays */}
                  <HelpCenter />
                  <TrainingHub />
                  <SettingsPanel />
                </div>
            </NotificationProvider>
          </SettingsProvider>
        </TrainingProvider>
      </HelpProvider>
      <Toaster />
    </>
  );
};

export default EarthModelPro;