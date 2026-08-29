// Product Blending Optimizer (Midstream & Downstream DS2).
//
// The module's second app and the first consumer of the LP kernel built at
// DS0. Everything shown is derived from the pool and the specifications.
import React from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { ArrowLeft, FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioNotifications from '@/components/studio/StudioNotifications';
import { BlendOptimizerProvider, useBlendOptimizer } from '@/contexts/BlendOptimizerContext';
import PoolPanel from '@/components/blendoptimizer/PoolPanel';
import RecipeResults from '@/components/blendoptimizer/RecipeResults';
import BlendOptimizerHelpGuide from '@/components/blendoptimizer/BlendOptimizerHelpGuide';

const Workspace = () => {
  const { persistence, notifications, removeNotification } = useBlendOptimizer();

  return (
    <>
      <StudioNotifications notifications={notifications} onDismiss={removeNotification} />
      <div className="flex flex-col h-full bg-slate-950 text-white">
        <header className="flex-shrink-0 border-b border-slate-800 px-4 py-3">
          <Link to="/dashboard/midstream-downstream">
            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white pl-0 mb-2">
              <ArrowLeft className="w-4 h-4 mr-2" /> Midstream &amp; Downstream
            </Button>
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-r from-orange-500 to-amber-500 p-2 rounded-xl shadow-lg">
                <FlaskConical className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Product Blending Optimizer</h1>
                <p className="text-slate-400 text-xs">
                  The cheapest recipe that meets every specification, and what each specification is costing you.
                </p>
              </div>
            </div>
            <div className="flex items-end gap-3">
              <div className="w-52">
                <StudioProjectManager
                  label="Saved study"
                  projects={persistence.projects}
                  currentProjectId={persistence.currentProjectId}
                  onCreate={persistence.createProject}
                  onOpen={persistence.openProject}
                  onDelete={persistence.deleteProject}
                  confirmDeleteMessage="Delete this blend study and its saved inputs? This cannot be undone."
                />
              </div>
              <StudioAutoSave
                isSaving={persistence.isSaving}
                saveError={persistence.saveError}
                lastSaveTime={persistence.lastSaveTime}
                onSave={persistence.manualSave}
                disabled={!persistence.currentProjectId}
              />
              <BlendOptimizerHelpGuide />
            </div>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <aside className="w-full md:w-1/3 xl:w-1/4 border-r border-slate-800 bg-slate-900/40 p-4 overflow-y-auto">
            <PoolPanel />
          </aside>
          <main className="flex-1 p-4 overflow-y-auto">
            <RecipeResults />
          </main>
        </div>
      </div>
    </>
  );
};

const ProductBlendingOptimizer = () => (
  <>
    <Helmet>
      <title>Product Blending Optimizer - Petrolord Suite</title>
      <meta name="description" content="Least-cost fuel blend recipes under octane, RVP, sulfur and viscosity specifications, with quality giveaway and shadow prices." />
    </Helmet>
    <BlendOptimizerProvider>
      <Workspace />
    </BlendOptimizerProvider>
  </>
);

export default ProductBlendingOptimizer;
