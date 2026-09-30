// One line under a project app's unit-system selector (Suite unit
// profile): new projects start from the profile's system and saved
// projects keep their own, so say which case this view is in.
import React from 'react';
import { cn } from '@/lib/utils';
import { SYSTEM_WORDS } from '@/lib/units/useProfileSystem';

export default function ProjectUnitSystemNote({ system, profileSystem, className }) {
  if (!profileSystem) return null;
  const same = system === profileSystem;
  return (
    <p className={cn('text-[11px]', same ? 'text-pl-muted' : 'text-pl-warning-text', className)}
      data-testid="project-unit-system-note" data-state={same ? 'follows' : 'differs'}>
      {same
        ? 'Matches your Suite units. New projects start from them.'
        : `This view uses ${SYSTEM_WORDS[system] || system} units while your Suite units are ${SYSTEM_WORDS[profileSystem] || profileSystem}. Saved projects keep the units they were saved with.`}
    </p>
  );
}
