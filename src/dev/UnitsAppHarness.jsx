// Dev-only harness (/dev/units-app/<app>?preset=metric|oilfield&user=<preset>):
// an app's own harness under a fixed Suite unit profile, so a unit walk can
// check that the app opens in the profile's units, that its toggle is a
// session override with the "differs" note, and that saved projects keep
// theirs. Never in production builds.
import React, { lazy, Suspense, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { StaticUnitProfileProvider } from '@/lib/units/UnitProfileContext';
import { makeProfile } from '@/lib/units/presets';

const APPS = {
  wdm: lazy(() => import('@/pages/apps/WellDataManager/WellDataManagerHarness')),
  pp: lazy(() => import('@/pages/apps/PorePressureStudio/PorePressureStudioHarness')),
  rp: lazy(() => import('@/pages/apps/RockPhysicsStudio/RockPhysicsStudioHarness')),
  wc: lazy(() => import('@/pages/apps/WellCorrelation/WellCorrelationHarness')),
};

export default function UnitsAppHarness() {
  const { app = 'wdm' } = useParams();
  const [params] = useSearchParams();
  const preset = params.get('preset') || 'metric';
  const mine = params.get('user');
  const layers = useMemo(() => ({
    organization: makeProfile(preset === 'oilfield' ? 'oilfield' : 'metric'),
    user: mine ? makeProfile(mine === 'oilfield' ? 'oilfield' : 'metric') : null,
    tableAvailable: true,
  }), [preset, mine]);
  const App = APPS[app] || APPS.wdm;
  return (
    <StaticUnitProfileProvider layers={layers}>
      <Suspense fallback={<div className="p-6">Loading...</div>}>
        <App />
      </Suspense>
    </StaticUnitProfileProvider>
  );
}
