// Product Blending Optimizer (Midstream & Downstream DS2).
//
// The module's second app and the first consumer of the LP kernel built at
// DS0. Everything shown is derived from the pool and the specifications.
import React from 'react';
import { Helmet } from 'react-helmet';
import { FlaskConical } from 'lucide-react';
import { AppHeader } from '@/components/ui/app-shell';
import { ThemedApp } from '@/design/ThemeProvider';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioNotifications from '@/components/studio/StudioNotifications';
import { BlendOptimizerProvider, useBlendOptimizer } from '@/contexts/BlendOptimizerContext';
import { FullPrecisionProvider, FullPrecisionToggle } from '@/components/fullprecision/FullPrecision';
import PoolPanel from '@/components/blendoptimizer/PoolPanel';
import RecipeResults from '@/components/blendoptimizer/RecipeResults';
import BlendOptimizerHelpGuide from '@/components/blendoptimizer/BlendOptimizerHelpGuide';

const Workspace = () => {
  const { persistence, notifications, removeNotification } = useBlendOptimizer();

  return (
    <>
      <StudioNotifications notifications={notifications} onDismiss={removeNotification} />
      <AppHeader
        title="Product Blending Optimizer"
        eyebrow="Midstream & Downstream"
        subtitle="The cheapest recipe that meets every specification, and what each specification is costing you."
        icon={FlaskConical}
        backTo="/dashboard/midstream-downstream"
        backLabel="Midstream & Downstream"
        actions={(
          <>
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
            <FullPrecisionToggle app="product-blending-optimizer" />
            <BlendOptimizerHelpGuide />
          </>
        )}
      />

      <div className="flex flex-1 flex-col md:flex-row md:overflow-hidden">
        <aside className="w-full border-b border-pl-border bg-pl-surface p-4 md:w-1/3 md:overflow-y-auto md:border-b-0 md:border-r xl:w-1/4">
          <PoolPanel />
        </aside>
        <main className="min-w-0 flex-1 p-4 md:overflow-y-auto">
          <RecipeResults />
        </main>
      </div>
    </>
  );
};

// Design system rollout w5e: the page wraps itself in <ThemedApp>, so the
// classes below are theme roles; the recipe chart stays white (ChartFrame).
const ProductBlendingOptimizer = () => (
  <ThemedApp className="flex min-h-screen flex-col" data-testid="blend-theme-scope">
    <Helmet>
      <title>Product Blending Optimizer - Petrolord Suite</title>
      <meta name="description" content="Least-cost fuel blend recipes under octane, RVP, sulfur and viscosity specifications, with quality giveaway and shadow prices." />
    </Helmet>
    <BlendOptimizerProvider>
      <FullPrecisionProvider>
        <Workspace />
      </FullPrecisionProvider>
    </BlendOptimizerProvider>
  </ThemedApp>
);

export default ProductBlendingOptimizer;
