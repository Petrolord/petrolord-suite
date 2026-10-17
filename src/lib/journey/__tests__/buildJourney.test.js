// Guided Journey rules (design 6.2), greeting (6.1) and disciplines (4).
// Negative controls carry the owner's rule: nobody is shown work outside
// their discipline, nothing they cannot open, and members get no admin steps.
import { buildJourney, baselineAcknowledgements, AFTER_FIRST } from '../buildJourney';
import { greeting, greetingName, partOfDay } from '../greeting';
import {
  DISCIPLINE_KEYS, STARTER_PACKS, starterSteps, inferDisciplines, appsOf,
} from '../disciplines';
import { SUITE_MODULES } from '../../../data/suiteCatalog';

const NOW = new Date('2026-10-20T09:30:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();
const all = () => true;
const none = () => false;
const onlyModules = (...mods) => (appId, module) => mods.includes(module);

function state(over = {}) {
  return {
    user: { display_name: 'Ayo', email: 'a@x.com', created_at: daysAgo(400) },
    org: { id: 'org-1', name: 'Lordsway Energy', role: 'member', joined_at: daysAgo(200), member_count: 6 },
    projects: { real: 1, shared_with_me: 0, current_id: 'p1', current_is_default: false },
    work: {},
    journey: { guidance: 'guide', disciplines: [], disciplines_source: null, welcomed_orgs: [], dismissed: [], acknowledged: {} },
    ...over,
    journey_: undefined,
  };
}
const withJourney = (j, over = {}) => { const s = state(over); s.journey = { ...s.journey, ...j }; return s; };
const ctx = (canOpen = all, moduleOpen = (m) => canOpen('x', m)) => ({ canOpen, moduleOpen, now: NOW });

describe('disciplines', () => {
  test('keys are the Suite modules plus management', () => {
    expect(DISCIPLINE_KEYS).toEqual([...SUITE_MODULES.map((m) => m.slug), 'management']);
  });
  test('every starter step names an app of its own module', () => {
    for (const [d, steps] of Object.entries(STARTER_PACKS)) {
      for (const s of steps) {
        expect(s.discipline).toBe(d);
        const mod = SUITE_MODULES.find((m) => m.slug === d);
        expect(mod.apps).toContain(s.app);
        expect(s.href.startsWith(`/dashboard/apps/${d}/`)).toBe(true);
      }
    }
  });
  test('starter steps skip apps the person cannot open', () => {
    const steps = starterSteps('geoscience', (appId) => appId !== 'seismolord');
    expect(steps[0].appId).toBe('well-data-manager');
  });
  test('inference: some modules open gives those; all or none gives nothing', () => {
    expect(inferDisciplines((m) => m === 'drilling')).toEqual(['drilling']);
    expect(inferDisciplines(() => true)).toEqual([]);
    expect(inferDisciplines(() => false)).toEqual([]);
  });
  test('apps of disciplines', () => {
    expect(appsOf(['drilling'])).toEqual(['well-planning', 'casing-tubing-design-pro', 'well-cost-time']);
  });
});

describe('buildJourney', () => {
  test('J1: a member added 3 days ago is welcomed, with team size and role', () => {
    const j = buildJourney(state({ org: { id: 'org-1', name: 'Lordsway Energy', role: 'member', joined_at: daysAgo(3), member_count: 6 } }), ctx());
    expect(j.stage).toBe('welcome');
    expect(j.headline).toBe('Welcome to Lordsway Energy.');
    expect(j.detail).toBe('You were added as a member, and your team has 6 people.');
  });
  test('J1 is not repeated once the welcome is seen, nor after 30 days', () => {
    const seen = withJourney({ welcomed_orgs: ['org-1'] }, { org: { id: 'org-1', name: 'L', role: 'member', joined_at: daysAgo(3), member_count: 6 } });
    expect(buildJourney(seen, ctx()).stage).not.toBe('welcome');
    const old = state({ org: { id: 'org-1', name: 'L', role: 'member', joined_at: daysAgo(31), member_count: 6 } });
    expect(buildJourney(old, ctx()).stage).not.toBe('welcome');
  });
  test('J2: no project; an admin is told to create one, a member to ask or create', () => {
    const none2 = { real: 0, shared_with_me: 0 };
    const admin = buildJourney(state({ projects: none2, org: { id: 'o', name: 'L', role: 'admin', joined_at: daysAgo(90), member_count: 4 } }), ctx());
    expect(admin.next.title).toBe('Create your first project');
    expect(admin.next.href).toBe('/dashboard/projects?new=1');
    const member = buildJourney(state({ projects: none2 }), ctx());
    expect(member.next.title).toMatch(/^Ask your admin/);
  });
  test('a project shared with me counts as having a project', () => {
    expect(buildJourney(withJourney({ disciplines: ['drilling'], disciplines_source: 'chosen' }, { projects: { real: 0, shared_with_me: 2 } }), ctx()).stage).toBe('start');
  });
  test('J3 drilling engineer: Well Design Studio first, and never seismic or logs', () => {
    const j = buildJourney(withJourney({ disciplines: ['drilling'], disciplines_source: 'chosen' }), ctx());
    expect(j.stage).toBe('start');
    expect(j.next.appId).toBe('well-planning');
    const shown = [j.next, ...j.also, ...j.path].map((s) => `${s.appId || ''} ${s.title}`).join(' | ');
    expect(shown).not.toMatch(/seismolord|well-data-manager|seismic|SEG-Y|LAS|logs/i);
  });
  test('J3 refinery planner: an assay first, nothing upstream', () => {
    const j = buildJourney(withJourney({ disciplines: ['midstream-downstream'], disciplines_source: 'chosen' }), ctx());
    expect(j.next.appId).toBe('crude-assay-blending-studio');
    for (const s of [j.next, ...j.also]) expect(s.discipline).toBe('midstream-downstream');
  });
  test('J3 geoscientist: seismic recommended, wells as an alternative', () => {
    const j = buildJourney(withJourney({ disciplines: ['geoscience'], disciplines_source: 'chosen' }), ctx());
    expect(j.next.appId).toBe('seismolord');
    expect(j.next.doImport).toBe(true);
    expect(j.also.map((s) => s.appId)).toContain('well-data-manager');
  });
  test('an unentitled app is never recommended; the next one in the pack takes its place', () => {
    const j = buildJourney(withJourney({ disciplines: ['drilling'], disciplines_source: 'chosen' }), ctx((appId) => appId !== 'well-planning'));
    expect(j.next.appId).toBe('casing-tubing-design-pro');
  });
  test('no app of the discipline: a member asks the admin, an admin is sent to choose apps', () => {
    const member = buildJourney(withJourney({ disciplines: ['facilities'], disciplines_source: 'chosen' }), ctx(none));
    expect(member.stage).toBe('no-apps');
    expect(member.next.title).toMatch(/no facilities engineering apps yet\. Ask your admin\./);
    expect(member.next.href).toBeNull();
    const admin = buildJourney(withJourney({ disciplines: ['facilities'], disciplines_source: 'chosen' }, { org: { id: 'o', name: 'L', role: 'owner', joined_at: daysAgo(90), member_count: 3 } }), ctx(none));
    expect(admin.next.href).toBe('/dashboard/modules');
  });
  test('a member never gets an admin step', () => {
    for (const projects of [{ real: 0, shared_with_me: 0 }, { real: 1, shared_with_me: 0 }]) {
      const j = buildJourney(withJourney({ disciplines: ['facilities'], disciplines_source: 'chosen' }, { projects, org: { id: 'o', name: 'L', role: 'member', joined_at: daysAgo(90), member_count: 1 } }), ctx(none));
      const keys = [j.next, ...j.also].filter(Boolean).map((s) => s.key);
      expect(keys).not.toContain('team:invite');
      expect(keys).not.toContain('apps:choose');
      expect([j.next, ...j.also].filter(Boolean).every((s) => s.href !== '/dashboard/modules')).toBe(true);
    }
  });
  test('started work in the project moves on (J6), and nothing is pushed', () => {
    const j = buildJourney(withJourney({ disciplines: ['drilling'], disciplines_source: 'chosen' }, { work: { 'well-planning': { any: true, in_project: true } } }), ctx());
    expect(j.stage).toBe('working');
    expect(j.next).toBeNull();
  });
  test('work elsewhere but not in this project still offers the start here', () => {
    const j = buildJourney(withJourney({ disciplines: ['drilling'], disciplines_source: 'chosen' }, { work: { 'well-planning': { any: true, in_project: false } } }), ctx());
    expect(j.stage).toBe('start');
  });
  test('J4: something running takes the card', () => {
    const j = buildJourney(withJourney({ disciplines: ['geoscience'], disciplines_source: 'chosen' }), { ...ctx(), activityRunning: true });
    expect(j.stage).toBe('running');
    expect(j.headline).toMatch(/under Activity/);
  });
  test('J5: first seismic gives the "what next" prompt once, only in guide mode, only for geoscience', () => {
    const s = withJourney({ disciplines: ['geoscience'], disciplines_source: 'chosen' }, { work: { seismolord: { any: true, in_project: true } } });
    expect(buildJourney(s, ctx()).prompts.map((p) => p.key)).toEqual(['after_first:seismic']);
    s.journey.acknowledged = { 'after_first:seismic': '2026-10-20' };
    expect(buildJourney(s, ctx()).prompts).toEqual([]);
    const quiet = withJourney({ guidance: 'quiet', disciplines: ['geoscience'], disciplines_source: 'chosen' }, { work: { seismolord: { any: true } } });
    expect(buildJourney(quiet, ctx()).prompts).toEqual([]);
    const drilling = withJourney({ disciplines: ['drilling'], disciplines_source: 'chosen' }, { work: { seismolord: { any: true } } });
    expect(buildJourney(drilling, ctx()).prompts).toEqual([]);
  });
  test('baseline: work that existed before the record is acknowledged up front', () => {
    expect(baselineAcknowledgements({ work: { seismolord: { any: true }, 'well-data-manager': { any: false } } })).toEqual(['after_first:seismic']);
    expect(AFTER_FIRST.every((p) => p.discipline === 'geoscience')).toBe(true);
  });
  test('no disciplines and everything open: ask, push nothing discipline-specific', () => {
    const j = buildJourney(state(), ctx());
    expect(j.stage).toBe('disciplines');
    expect(j.next.action).toBe('choose-disciplines');
    expect(j.askDisciplines).toBe(true);
  });
  test('skipped question: inferred from the open modules', () => {
    const j = buildJourney(state(), ctx(onlyModules('production'), (m) => m === 'production'));
    expect(j.disciplines).toEqual(['production']);
    expect(j.disciplinesSource).toBe('inferred');
    expect(j.next.appId).toBe('nodal-analysis-engine');
  });
  test('a dismissed step is not offered again', () => {
    const j = buildJourney(withJourney({ disciplines: ['drilling'], disciplines_source: 'chosen', dismissed: ['start:drilling:well-planning'] }), ctx());
    expect(j.next.appId).toBe('casing-tubing-design-pro');
  });
  test('quiet mode keeps the state (the drawer still answers)', () => {
    const j = buildJourney(withJourney({ guidance: 'quiet', disciplines: ['drilling'], disciplines_source: 'chosen' }), ctx());
    expect(j.guidance).toBe('quiet');
    expect(j.next.appId).toBe('well-planning');
  });
});

describe('greeting', () => {
  test('name: display name, else first word of full name, else email', () => {
    expect(greetingName({ display_name: 'Ayo', full_name: 'Ayodele Asaolu' })).toBe('Ayo');
    expect(greetingName({ full_name: '  Chidi Okafor ' })).toBe('Chidi');
    expect(greetingName({ email: 'uche.o@breezenergy.com' })).toBe('uche.o');
    expect(greetingName({})).toBe('there');
  });
  test('time of day in the person\'s own zone, around the hour boundaries', () => {
    expect(partOfDay(new Date('2026-10-20T10:59:00Z'), 'Africa/Lagos')).toBe('morning');     // 11:59
    expect(partOfDay(new Date('2026-10-20T11:00:00Z'), 'Africa/Lagos')).toBe('afternoon');   // 12:00
    expect(partOfDay(new Date('2026-10-20T15:59:00Z'), 'Africa/Lagos')).toBe('afternoon');   // 16:59
    expect(partOfDay(new Date('2026-10-20T16:00:00Z'), 'Africa/Lagos')).toBe('evening');     // 17:00
    expect(partOfDay(new Date('2026-10-20T03:59:00Z'), 'Africa/Lagos')).toBe('evening');     // 04:59
    expect(partOfDay(new Date('2026-10-20T04:00:00Z'), 'Africa/Lagos')).toBe('morning');     // 05:00
    expect(partOfDay(new Date('2026-10-20T10:00:00Z'), 'America/Houston')).toBe('morning');  // 05:00 CDT
  });
  test('first login, every day, and after a long absence', () => {
    const fresh = { display_name: 'Chidi', created_at: daysAgo(0) };
    expect(greeting({ user: fresh, now: NOW, timeZone: 'Africa/Lagos' }).line).toBe('Welcome to Petrolord, Chidi.');
    const old = { display_name: 'Ayo', created_at: daysAgo(400) };
    expect(greeting({ user: old, lastGreetedAt: daysAgo(1), now: NOW, timeZone: 'Africa/Lagos' }).line).toBe('Good morning, Ayo.');
    expect(greeting({ user: old, lastGreetedAt: daysAgo(15), now: NOW, timeZone: 'Africa/Lagos' }).line).toBe('Good morning, Ayo. Welcome back, it has been a while.');
    // an existing account never greeted before (the record is new) is simply greeted
    expect(greeting({ user: old, now: NOW, timeZone: 'Africa/Lagos' }).kind).toBe('day');
  });
});
