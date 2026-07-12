import React from 'react';
import { Helmet } from 'react-helmet';
import ViewerPanel from './components/ViewerPanel';

// Seismolord renders as a full-viewport workstation (ribbon / explorer
// tree / viewport windows / status bar — Petrel-style). ViewerPanel is
// the workspace controller and owns all state; this page only mounts it.
// The dashboard chrome hides its sidebar on /apps/ routes, so h-screen
// here fills the browser window exactly (no page scroll).
export default function Seismolord() {
  return (
    <>
      <Helmet>
        <title>Seismolord - Petrolord Suite</title>
        <meta
          name="description"
          content="Seismic interpretation: SEG-Y loading, inline/crossline/time-slice viewing, horizon and fault picking, surface gridding and export."
        />
      </Helmet>

      <div className="h-screen w-full overflow-hidden">
        <ViewerPanel />
      </div>
    </>
  );
}
