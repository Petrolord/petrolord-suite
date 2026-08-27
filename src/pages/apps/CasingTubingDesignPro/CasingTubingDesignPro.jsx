import React, { useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { CasingTubingDesignProvider } from './contexts/CasingTubingDesignContext';
import { makeWpBackend } from './services/wpBackend';
import TopBanner from './components/TopBanner';
import LeftPanel from './components/LeftPanel';
import RightPanel from './components/RightPanel';
import CenterContent from './components/CenterContent';
import BottomStrip from './components/BottomStrip';
import HelpPanel from './components/help/HelpPanel';
import KeyboardShortcuts from './components/common/KeyboardShortcuts';

// Casing & Tubing Design Studio (Drilling D6): API 5C3 tubular design on
// the wp spine — validated Barlow/5C3 ratings, canonical load cases, and
// the Lubinski tubing-packer force system. Engines are oracle-gated in
// @petrolord/engines; the injected backend keeps the /dev harness pure.
export const CasingTubingDesignProContent = () => {
  return (
    <div className="flex flex-col h-screen w-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      <KeyboardShortcuts />
      <TopBanner />
      <div className="flex flex-1 overflow-hidden">
        <LeftPanel />
        <div className="flex flex-1 flex-col overflow-hidden relative">
          <div className="flex flex-1 overflow-hidden">
            <CenterContent />
            <RightPanel />
          </div>
          <BottomStrip />
        </div>
      </div>
      <HelpPanel />
    </div>
  );
};

const CasingTubingDesignPro = () => {
  const { user } = useAuth();
  const backend = useMemo(() => makeWpBackend({ userId: user?.id }), [user?.id]);
  return (
    <CasingTubingDesignProvider backend={backend}>
      <Helmet>
        <title>Casing & Tubing Design Studio | Petrolord</title>
        <meta
          name="description"
          content="API 5C3 casing and tubing design on your planned trajectories: validated burst, collapse and triaxial ratings, canonical load cases, and tubing-packer force analysis."
        />
      </Helmet>
      <CasingTubingDesignProContent />
    </CasingTubingDesignProvider>
  );
};

export default CasingTubingDesignPro;
