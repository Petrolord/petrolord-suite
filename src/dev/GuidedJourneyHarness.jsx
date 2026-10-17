// /dev/guided-journey: the Guided Journey UI signed out, on an in-memory
// journey backend (e2e/guided-journey.spec.js). ?scenario= picks the person:
//   new-member     added 3 days ago, no disciplines chosen, no project
//   drilling       drilling engineer with a project, nothing started
//   refinery       refinery planner with a project, nothing started
//   geo-seismic    geoscientist whose first seismic volume has just arrived
//   quiet          drilling engineer who chose "I'll call you"
//   no-apps        facilities member whose organisation has no facilities apps
// Writes (guidance, disciplines, marks) change the in-memory state, so the UI
// reacts as it does against the database.
import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { JourneyProvider } from '@/contexts/JourneyContext';
import GuideCard from '@/components/journey/GuideCard';
import GuideButton from '@/components/journey/GuideDrawer';
import WhatNextDialog from '@/components/journey/WhatNextDialog';
import { DashboardScope } from '@/design/DashboardScope';
import { STARTER_PACKS } from '@/lib/journey/disciplines';

const DAY = 86400000;
const ago = (d) => new Date(Date.now() - d * DAY).toISOString();
const base = () => ({
  user: { display_name: 'Chidi', email: 'chidi@example.com', created_at: ago(300) },
  org: { id: 'org-h', name: 'Harness Energy', role: 'member', joined_at: ago(200), member_count: 6 },
  projects: { real: 1, shared_with_me: 0, current_id: 'p-h', current_is_default: false },
  work: {},
  journey: { guidance: 'guide', disciplines: [], disciplines_source: null, welcomed_orgs: [], dismissed: [], acknowledged: {}, last_greeted_at: ago(1) },
});

const SCENARIOS = {
  'new-member': (s) => { s.org.joined_at = ago(3); s.projects = { real: 0, shared_with_me: 0 }; s.user.created_at = ago(3); s.journey.last_greeted_at = null; },
  drilling: (s) => { s.journey.disciplines = ['drilling']; s.journey.disciplines_source = 'chosen'; },
  refinery: (s) => { s.journey.disciplines = ['midstream-downstream']; s.journey.disciplines_source = 'chosen'; },
  'geo-seismic': (s) => { s.journey.disciplines = ['geoscience']; s.journey.disciplines_source = 'chosen'; s.work = { seismolord: { any: true, in_project: true } }; },
  quiet: (s) => { s.journey.disciplines = ['drilling']; s.journey.disciplines_source = 'chosen'; s.journey.guidance = 'quiet'; },
  'no-apps': (s) => { s.journey.disciplines = ['facilities']; s.journey.disciplines_source = 'chosen'; },
};
// no-apps: neither the Facilities module nor any of its apps is licensed
const FACILITIES_APPS = new Set(STARTER_PACKS.facilities.map((st) => st.appId));
const ENTITLED = { 'no-apps': (appId, module) => module !== 'facilities' && !FACILITIES_APPS.has(appId) };

function memoryService(state) {
  let s = state;
  return {
    async fetchJourneyState() { return JSON.parse(JSON.stringify(s)); },
    async setJourney({ guidance, disciplines, source }) {
      if (guidance) s.journey.guidance = guidance;
      if (disciplines) { s.journey.disciplines = disciplines; s.journey.disciplines_source = source || 'chosen'; }
      return { ...s.journey };
    },
    async markJourney(kind, key) {
      const j = s.journey;
      if (kind === 'welcomed_org') j.welcomed_orgs = [...new Set([...j.welcomed_orgs, key])];
      if (kind === 'dismissed') j.dismissed = [...new Set([...j.dismissed, key])];
      if (kind === 'acknowledged') j.acknowledged = { ...j.acknowledged, [key]: new Date().toISOString() };
      if (kind === 'greeted') j.last_greeted_at = new Date().toISOString();
      s = { ...s, journey: j };
      return { ...j };
    },
  };
}

export default function GuidedJourneyHarness() {
  const [params] = useSearchParams();
  const scenario = params.get('scenario') || 'drilling';
  const service = useMemo(() => {
    const s = base();
    (SCENARIOS[scenario] || (() => {}))(s);
    return memoryService(s);
  }, [scenario]);
  const canOpen = ENTITLED[scenario] || (() => true);
  const entitlements = useMemo(() => ({ isAllowed: (id) => canOpen(id, null), isModuleActive: (m) => canOpen(null, m), loading: false }), [canOpen]);
  const auth = useMemo(() => ({ user: { id: 'harness' }, isImpersonating: false }), []);
  return (
    <DashboardScope>
      <JourneyProvider service={service} auth={auth} entitlements={entitlements} activityRunning={false}>
        <div className="min-h-screen" data-testid="journey-harness" data-scenario={scenario}>
          <div className="flex justify-end p-3"><div className="w-48"><GuideButton variant="sidebar" /></div></div>
          <GuideCard />
          <WhatNextDialog />
        </div>
      </JourneyProvider>
    </DashboardScope>
  );
}
