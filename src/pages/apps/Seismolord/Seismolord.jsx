import React from 'react';
import { Helmet } from 'react-helmet';
import { ThemedApp } from '@/design/ThemeProvider';
import ViewerPanel from './components/ViewerPanel';
import { SeismolordToneProvider, useSeismolordTone } from './toneExperiment';

// Seismolord renders as a full-viewport workstation (ribbon / explorer
// tree / viewport windows / status bar — Petrel-style). ViewerPanel is
// the workspace controller and owns all state; this page only mounts it.
// The dashboard chrome hides its sidebar on /apps/ routes, so h-screen
// here fills the browser window exactly (no page scroll).
// Design system pilot 4: the page opts in to the Petrolord theme (light by
// default, dark per user). Panels, trees, dialogs and tables follow it; the
// seismic, map and 3D canvases stay dark (data-canvas="dark").
// Grey tone experiment (owner, 2026-09-28): on staging and dev only, a shade
// picker in the ribbon switches the light theme between off-white and three
// light greys (toneExperiment.jsx). Production keeps off-white.
export default function Seismolord() {
  const toneState = useSeismolordTone();
  return (
    <>
      <Helmet>
        <title>Seismolord - Petrolord Suite</title>
        <meta
          name="description"
          content="Seismic interpretation: SEG-Y loading, inline/crossline/time-slice viewing, horizon and fault picking, surface gridding and export."
        />
      </Helmet>

      <SeismolordToneProvider value={toneState}>
        <ThemedApp className="h-screen w-full overflow-hidden" data-testid="seismolord-root" tone={toneState.tone || undefined}>
          <ViewerPanel />
        </ThemedApp>
      </SeismolordToneProvider>
    </>
  );
}
