// What the dashboard shell adds for the Guided Journey (design 6.1, 6.3):
// the guide card on Suite pages, the floating Guide and Activity buttons
// inside full-screen apps, and the greeting once per session (marked so
// "welcome back after a while" stays right; a toast when the session starts
// inside an app, where the Dashboard header is not seen).
import React, { useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useJourney } from '@/contexts/JourneyContext';
import ActivityButton from '@/components/activity/ActivityButton';
import GuideCard from './GuideCard';
import GuideButton from './GuideDrawer';
import WhatNextDialog from './WhatNextDialog';

const GREETED = 'petrolord.greeted';

export default function JourneyShell({ inApp }) {
  const { greeting, state, mark } = useJourney();
  const { isImpersonating } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!greeting || !state || isImpersonating) return;
    let seen = false;
    try { seen = sessionStorage.getItem(GREETED) === '1'; sessionStorage.setItem(GREETED, '1'); } catch { /* private window */ }
    if (seen) return;
    if (inApp) toast({ title: greeting.line });
    mark('greeted', null).catch(() => {});
    // once per session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(greeting), Boolean(state)]);

  if (inApp) {
    return (
      <div className="fixed bottom-10 right-3 z-50 flex items-center gap-2" data-testid="floating-shell-buttons">
        <ActivityButton variant="floating" />
        <GuideButton variant="floating" />
        <WhatNextDialog />
      </div>
    );
  }
  return <><GuideCard /><WhatNextDialog /></>;
}
