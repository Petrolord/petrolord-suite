// Guided Journey rules engine (docs/scope/GuidedJourney-DESIGN.md, 6.2). Pure:
// the journey state from suite_journey_state plus what the client knows
// (entitlements, Activity) in; what to show out. Nothing outside the person's
// disciplines is ever proposed (owner rule 2026-10-17), and nothing they
// cannot open.

import { DISCIPLINE_KEYS, starterSteps, inferDisciplines, disciplineLabel } from './disciplines';

export const JUST_ADDED_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;
const ADMIN_ROLES = new Set(['owner', 'admin', 'org_admin', 'super_admin']);

/** "What next" prompts (stage 2 ships the geoscience pair; others come with stage 3). */
const A = '/dashboard/apps/geoscience';
export const AFTER_FIRST = Object.freeze([
  {
    key: 'after_first:seismic',
    discipline: 'geoscience',
    appId: 'seismolord',
    title: 'Your first seismic volume is in. What would you like to do next?',
    options: [
      { key: 'open', title: 'Open it and look at an inline', detail: 'Start here then shows what the volume holds and the usual next steps.', appId: 'seismolord', module: 'geoscience', href: `${A}/seismolord?panel=start`, recommended: true },
      { key: 'wells', title: 'Load wells to tie', detail: 'LAS files and well headers, so the seismic can be tied to the wells.', appId: 'well-data-manager', module: 'geoscience', href: `${A}/well-data-manager?do=import`, unlessWork: 'well-data-manager' },
      { key: 'outline', title: 'Check the survey outline and geometry', appId: 'seismolord', module: 'geoscience', href: `${A}/seismolord?panel=start` },
      { key: 'learn', title: 'Read the 5-minute Seismolord guide', appId: 'seismolord', module: 'geoscience', href: `${A}/seismolord/help` },
    ],
  },
  {
    key: 'after_first:wells',
    discipline: 'geoscience',
    appId: 'well-data-manager',
    title: 'Your first wells are in. What would you like to do next?',
    options: [
      { key: 'qc', title: 'Check the logs', detail: 'Curves, units and depth ranges, in Well Data Manager.', appId: 'well-data-manager', module: 'geoscience', href: `${A}/well-data-manager`, recommended: true },
      { key: 'correlate', title: 'Correlate the wells', appId: 'well-correlation', module: 'geoscience', href: `${A}/well-correlation` },
      { key: 'petro', title: 'Interpret the logs', appId: 'petrophysics-studio', module: 'geoscience', href: `${A}/petrophysics-studio` },
      { key: 'seismic', title: 'Show them on seismic', appId: 'seismolord', module: 'geoscience', href: `${A}/seismolord`, ifWork: 'seismolord' },
    ],
  },
]);

const projectsStep = (isAdminOrSolo) => ({
  key: 'project:create',
  title: isAdminOrSolo ? 'Create your first project' : 'Ask your admin to add you to a project, or create your own',
  detail: 'A project keeps your data, studies and settings together, and can be shared with your team.',
  href: '/dashboard/projects?new=1',
});
const disciplineStep = {
  key: 'disciplines:choose',
  title: 'Tell us what you work on',
  detail: 'Petrolord then points you to the apps of your discipline, and nothing else.',
  action: 'choose-disciplines',
};
const inviteStep = { key: 'team:invite', title: 'Invite your team', href: '/dashboard/employees?invite=1' };
const appsStep = { key: 'apps:choose', title: 'Choose your apps', href: '/dashboard/modules' };

/**
 * @param {Object} state suite_journey_state() result
 * @param {Object} ctx
 * @param {(appId: string, module: ?string) => boolean} ctx.canOpen
 * @param {(module: string) => boolean} ctx.moduleOpen
 * @param {boolean} [ctx.activityRunning] something is running (Activity)
 * @param {Date} [ctx.now]
 */
export function buildJourney(state, { canOpen, moduleOpen, activityRunning = false, now = new Date() } = {}) {
  const j = state?.journey || {};
  const guidance = j.guidance === 'quiet' ? 'quiet' : 'guide';
  const dismissed = new Set(j.dismissed || []);
  const acknowledged = j.acknowledged || {};
  const org = state?.org || null;
  const role = String(org?.role || '').toLowerCase();
  const isAdmin = ADMIN_ROLES.has(role);
  const solo = !org || (org.member_count ?? 1) <= 1;
  const work = state?.work || {};

  // disciplines: chosen, else inferred from what the person can open
  const chosen = (j.disciplines || []).filter((d) => DISCIPLINE_KEYS.includes(d));
  const disciplines = chosen.length ? chosen : inferDisciplines(moduleOpen || (() => false));
  const disciplinesSource = chosen.length ? (j.disciplines_source || 'chosen') : (disciplines.length ? 'inferred' : null);
  const askDisciplines = !j.disciplines_source;

  const started = (appId) => {
    const w = work[appId];
    if (!w) return false;
    return w.in_project == null ? Boolean(w.any) : Boolean(w.in_project);
  };

  // per discipline: its openable starter steps and whether any has work
  const perDiscipline = disciplines.map((d) => {
    const steps = starterSteps(d, canOpen || (() => false));
    return { discipline: d, label: disciplineLabel(d), steps, started: steps.some((s) => started(s.appId)), noApps: steps.length === 0 && d !== 'management' };
  });

  const projectsReal = state?.projects?.real ?? 0;
  const projectsShared = state?.projects?.shared_with_me ?? 0;
  const hasProject = projectsReal + projectsShared > 0;
  const projectStep = { ...projectsStep(isAdmin || solo), done: hasProject };

  // the full path, for the drawer
  const path = [projectStep];
  for (const p of perDiscipline) {
    if (p.noApps) path.push({ key: `noapps:${p.discipline}`, title: noAppsTitle(p, isAdmin), href: isAdmin ? appsStep.href : null, discipline: p.discipline, done: false });
    else if (p.steps[0]) path.push({ ...p.steps[0], done: p.started });
  }
  if (!disciplines.length) path.push({ ...disciplineStep, done: false });

  const visible = (s) => s && !dismissed.has(s.key);
  const alsoFrom = (list, n = 3) => list.filter(visible).slice(0, n);

  // "what next" prompts: first work in a discipline, not yet answered
  const prompts = AFTER_FIRST
    .filter((p) => disciplines.includes(p.discipline) && Boolean(work[p.appId]?.any) && !acknowledged[p.key])
    .map((p) => ({
      ...p,
      options: p.options.filter((o) => (canOpen || (() => false))(o.appId, o.module)
        && (!o.ifWork || Boolean(work[o.ifWork]?.any)) && (!o.unlessWork || !work[o.unlessWork]?.any)),
    }))
    .filter((p) => p.options.length > 0);

  const base = { guidance, disciplines, disciplinesSource, askDisciplines, path, prompts: guidance === 'guide' ? prompts : [] };

  // J1: just added to an organisation, welcome not yet seen
  const joined = org?.joined_at ? new Date(org.joined_at).getTime() : null;
  const justAdded = org && joined != null && now.getTime() - joined < JUST_ADDED_DAYS * DAY
    && !(j.welcomed_orgs || []).includes(org.id);

  if (justAdded) {
    const firstStart = perDiscipline.find((p) => p.steps.length)?.steps[0] || null;
    return {
      ...base,
      stage: 'welcome',
      headline: `Welcome to ${org.name || 'your organisation'}.`,
      detail: `${role === 'owner' ? 'You are its owner' : `You were added as ${articleRole(role)}`}${solo ? '' : `, and your team has ${org.member_count} people`}.`,
      next: !hasProject ? projectStep : firstStart || (askDisciplines ? disciplineStep : null),
      also: alsoFrom([firstStart && !hasProject ? firstStart : null, isAdmin && solo ? inviteStep : null].filter(Boolean)),
      welcomeSteps: [projectStep, firstStart ? { ...firstStart, done: started(firstStart.appId) } : null].filter(Boolean),
    };
  }

  // J2: no project of my own or shared with me
  if (!hasProject) {
    return { ...base, stage: 'project', headline: projectStep.title, next: projectStep, also: alsoFrom([isAdmin && solo ? inviteStep : null].filter(Boolean)) };
  }

  // J4: something running (Activity) takes the card while it runs
  if (activityRunning) {
    return { ...base, stage: 'running', headline: 'Your work is being prepared. You can keep working; it is under Activity.', next: null, also: [] };
  }

  // J3: nothing started in the person's disciplines
  if (!disciplines.length) {
    return { ...base, stage: 'disciplines', headline: disciplineStep.title, next: disciplineStep, also: [] };
  }
  const notStarted = perDiscipline.filter((p) => !p.started);
  if (notStarted.length === perDiscipline.length) {
    const withApps = notStarted.filter((p) => p.steps.length);
    if (!withApps.length) {
      const p = notStarted.find((x) => x.noApps);
      if (p) {
        const s = { key: `noapps:${p.discipline}`, title: noAppsTitle(p, isAdmin), href: isAdmin ? appsStep.href : null };
        return { ...base, stage: 'no-apps', headline: s.title, next: visible(s) ? s : null, also: [] };
      }
      return { ...base, stage: 'working', headline: null, next: null, also: [] };
    }
    const first = withApps[0].steps.find(visible);
    const rest = [...withApps[0].steps.filter((s) => s !== first), ...withApps.slice(1).map((p) => p.steps[0])];
    return { ...base, stage: 'start', headline: first?.title || null, next: first || null, also: alsoFrom(rest) };
  }

  // J5 is the prompts list; J6: working, nothing pushed
  return { ...base, stage: 'working', headline: null, next: null, also: [] };
}

function articleRole(role) {
  const r = role || 'member';
  const word = r === 'org_admin' ? 'admin' : r === 'super_admin' ? 'administrator' : r;
  return `${/^[aeiou]/.test(word) ? 'an' : 'a'} ${word}`;
}

function noAppsTitle(p, isAdmin) {
  return isAdmin
    ? `Your organisation has no ${p.label.toLowerCase()} apps yet. Choose apps to add them.`
    : `Your organisation has no ${p.label.toLowerCase()} apps yet. Ask your admin.`;
}

/** Prompt keys for work that already existed before the journey record (so nobody is asked "what next" about old work). */
export const baselineAcknowledgements = (state) => AFTER_FIRST.filter((p) => Boolean(state?.work?.[p.appId]?.any)).map((p) => p.key);
