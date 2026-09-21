/**
 * AS9 — the module's standing rule, as a test, for Lessons Learned.
 *
 * Assurance-ROADMAP.md §6: "No fail-open fallbacks, anywhere."
 *
 * The whole app was src/utils/lessons-learned/mockData.js: five
 * invented lessons and
 *
 *   export const METRICS = { total: 156, draft: 12, underReview: 24,
 *     published: 110, archived: 10, pendingAction: 5,
 *     highReusability: 89 };
 *
 * rendered as seven dashboard tiles, two of them with trend badges
 * reading "+12% MoM" over nothing. NewLesson.jsx had no state at all
 * and toasted "Lesson draft has been saved successfully". The register
 * answered Filters, Export, Capture Lesson and every row menu with
 * "🚧 This feature isn't implemented yet—but don't worry! You can
 * request it in your next prompt! 🚀". And LessonDetail.jsx fell back
 * to MOCK_LESSONS[0] when the id did not match, so asking for a lesson
 * you do not have showed you a different lesson.
 */
import fs from 'fs';
import path from 'path';

const APP = path.resolve(__dirname, '..');
const ROOT = path.resolve(__dirname, '../../../../../..');

const walk = (dir, out = []) => {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__') return;
      walk(full, out);
    } else if (/\.(js|jsx)$/.test(e.name)) {
      out.push(full);
    }
  });
  return out;
};

const files = walk(APP);
const rel = (f) => path.relative(ROOT, f);
const read = (f) => fs.readFileSync(f, 'utf8');
const code = (f) => read(f)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const PAGES = ['Dashboard.jsx', 'Register.jsx', 'NewLesson.jsx', 'LessonDetail.jsx',
  'Search.jsx', 'Reports.jsx'];

describe('no invented data in Lessons Learned', () => {
  it('scans the whole app tree, or it proves nothing', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it('the mock data and the shared components built on it are gone', () => {
    expect(fs.existsSync(path.join(ROOT, 'src/utils/lessons-learned/mockData.js'))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, 'src/components/lessons-learned/SharedComponents.jsx')))
      .toBe(false);
  });

  it('nothing in the app imports a mock or a data file', () => {
    const offenders = files.filter((f) =>
      /from\s+['"]@?\/?[\w./@-]*(data\/|mockData|components\/lessons-learned)/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no file declares mock rows or a METRICS literal', () => {
    const offenders = files.filter((f) =>
      /\b(MOCK_[A-Z_]+|METRICS|mockData|SAMPLE_[A-Z_]+|DEMO_[A-Z_]+)\b/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('NO HARDCODED LESSON NUMBER APPEARS ANYWHERE', () => {
    const offenders = files.filter((f) => /['"`]LL-\d{3,}|LL-20\d\d-\d/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no tile carries a trend it cannot compute', () => {
    // "+12% MoM" and "+5% MoM" were props on two dashboard tiles.
    const offenders = files.filter((f) => /MoM|trend=|% MoM/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('the detail page does not fall back to another lesson', () => {
    const detail = code(path.join(APP, 'LessonDetail.jsx'));
    expect(detail).toMatch(/const \{ lessonId \} = useParams\(\)/);
    expect(detail).not.toMatch(/\|\|\s*MOCK|fallback for demo|\|\|\s*lessons\[0\]/);
    expect(code(path.join(APP, 'LessonsLearnedPageShell.jsx'))).toMatch(/path=":lessonId"/);
  });

  it('every page queries through the hook', () => {
    PAGES.forEach((page) => {
      expect(read(path.join(APP, page))).toMatch(/useLessonsLearned/);
    });
  });

  it('the capture form is a controlled form that writes', () => {
    // Not one of its six fields carried a value or an onChange, and
    // there was no useState in the file.
    const form = read(path.join(APP, 'NewLesson.jsx'));
    expect(form).toMatch(/useState/);
    expect(form).toMatch(/value=\{form\./);
    expect(form).toMatch(/onChange=\{set\(/);
    expect(form).toMatch(/createLesson/);
  });

  it('nothing fakes a delay to look like a save', () => {
    const offenders = files.filter((f) => /setTimeout\([^)]*,\s*\d{3,}\s*\)/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no chart or table is drawn from a hardcoded array', () => {
    const offenders = files.filter((f) => {
      const src = code(f);
      return /(?:const|let)\s+\w*[Dd]ata\s*=\s*\[\s*\{\s*(?:name|id):\s*['"]/.test(src)
        || /(?:const|let)\s+(trendData|categoryData|rootCauseData)\s*=\s*\[\s*\{/.test(src);
    });
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no count is a literal standing in for a query', () => {
    const offenders = files.filter((f) =>
      /\b(value|count|total|published|lessons):\s*\d+\s*[,}]/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('NOTHING NAMES THE PROMPT BUILDER TO A CUSTOMER', () => {
    // "🚧 This feature isn't implemented yet—but don't worry! You can
    // request it in your next prompt! 🚀" was on every control of the
    // register, the reports page and the detail page.
    const offenders = files.filter((f) =>
      /next prompt|isn.t implemented yet|not implemented yet|Action triggered|🚧/i.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('there is no reusability rating anywhere', () => {
    // ReusabilityBadge painted High / Medium / Low from a data file.
    const offenders = files.filter((f) => /[Rr]eusability/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('every export is built from rows the hook fetched', () => {
    expect(read(path.join(APP, 'Register.jsx'))).toMatch(/exportToCSV\(filtered\.map/);
    const reports = read(path.join(APP, 'Reports.jsx'));
    expect(reports).toMatch(/exportToCSV\(lessons\.map/);
    expect(reports).toMatch(/exportToCSV\(unapplied\.map/);
    expect(reports).toMatch(/exportToCSV\(applications\.map/);
  });

  it('nothing exports to PDF from this app any more', () => {
    const offenders = files.filter((f) => /exportToPDF|exportToExcel|printElement/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('a failed load is surfaced on every page', () => {
    const hook = read(path.join(APP, 'hooks/useLessonsLearned.js'));
    expect(hook).toMatch(/setError\(/);
    PAGES.forEach((page) => expect(read(path.join(APP, page))).toMatch(/ErrorState/));
  });

  it('every write path reports its failure to the user', () => {
    ['NewLesson.jsx', 'LessonDetail.jsx', 'Register.jsx'].forEach((page) => {
      const src = read(path.join(APP, page));
      expect(`${page} reports write failures: ${/setFailure\(result\.error\)/.test(src)}`)
        .toBe(`${page} reports write failures: true`);
    });
  });

  it('reads are scoped to the organization in code, not only by RLS', () => {
    const hook = read(path.join(APP, 'hooks/useLessonsLearned.js'));
    expect(hook).toMatch(/useAuth/);
    expect(hook).toMatch(/\.eq\('org_id', orgId\)/);
  });

  /* The gates. */

  it('validation goes through the independence gate', () => {
    expect(read(path.join(APP, 'hooks/useLessonsLearned.js'))).toMatch(/canValidate/);
    expect(read(path.join(APP, 'LessonDetail.jsx'))).toMatch(/canValidate/);
  });

  it('every status move goes through the gate', () => {
    expect(read(path.join(APP, 'hooks/useLessonsLearned.js'))).toMatch(/canAdvanceLesson/);
    expect(read(path.join(APP, 'LessonDetail.jsx'))).toMatch(/canAdvanceLesson/);
  });

  it('recording an application goes through the gate', () => {
    expect(read(path.join(APP, 'hooks/useLessonsLearned.js'))).toMatch(/canRecordApplication/);
  });

  it('the push into the risk register and into MOC is a real write', () => {
    const hook = read(path.join(APP, 'hooks/useLessonsLearned.js'));
    expect(hook).toMatch(/from\('risk_register'\)[\s\S]{0,200}\.insert\(/);
    expect(hook).toMatch(/from\('moc_records'\)[\s\S]{0,200}\.insert\(/);
    // And it reuses the modules that know those tables, rather than
    // restating their writable columns here.
    expect(hook).toMatch(/buildRiskWrite/);
    expect(hook).toMatch(/buildMocWrite/);
    const detail = read(path.join(APP, 'LessonDetail.jsx'));
    expect(detail).toMatch(/raiseRiskFromLesson/);
    expect(detail).toMatch(/raiseMocFromLesson/);
  });

  it('every write method the hook exports has a caller in the app', () => {
    // The AS7 lesson, which named four orphans on its first run in AS8.
    const hook = read(path.join(APP, 'hooks/useLessonsLearned.js'));
    const returned = hook.slice(hook.lastIndexOf('return {'));
    const methods = [...returned.matchAll(/^\s{4}(\w+),$/gm)].map((m) => m[1])
      .filter((m) => /^(create|update|delete|record|raise|validate|advance)/.test(m));
    expect(methods.length).toBeGreaterThan(6);
    const pages = files.filter((f) => !/hooks\//.test(f)).map((f) => read(f)).join('\n');
    const orphans = methods.filter((m) => !new RegExp(`\\b${m}\\b`).test(pages));
    expect(orphans).toEqual([]);
  });

  it('charts follow the Suite standard: white surface and the watermark', () => {
    ['Dashboard.jsx', 'Reports.jsx'].forEach((page) => {
      const src = read(path.join(APP, page));
      expect(src).toMatch(/chartTheme/);
      expect(src).toMatch(/ChartLogo/);
      expect(src).not.toMatch(/hsl\(var\(--primary\)\)['"]\s*\}?\s*\/>/);
    });
  });

  it('the vocabulary lives in one module', () => {
    const offenders = files.filter((f) =>
      /const\s+(LESSON_STATUSES|TARGET_TYPES|SOURCE_TYPES|APPLICABILITY_SCOPES)\s*=/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  /* AS13: the defect classes the help-guide review found, held shut. */

  it('no page compares a date-only string with new Date() (the due-today off-by-one)', () => {
    const offenders = files.filter((f) => /new Date\([^)]*(due|_date|_at)\)\s*[<>]/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('every status button the page offers has the field its gate needs', () => {
    // Superseded needs superseded_by; AS9 offered the button with no field.
    const detail = code(path.join(APP, 'LessonDetail.jsx'));
    expect(detail).toMatch(/advanceLesson\(lesson, 'Superseded', superseding\)/);
    expect(detail).toMatch(/successorCandidates\(lesson, lessons\)/);
    expect(detail).toMatch(/advanceLesson\(lesson, 'Archived', archiving\)/);
  });

  it('the author is written by name as well as by id, and a typed author is not the user', () => {
    const hook = code(path.join(APP, 'hooks/useLessonsLearned.js'));
    expect(hook).toMatch(/buildLessonWrite\(withAuthor\(form/);
    expect(hook).not.toMatch(/author_id: row\.author_id \|\| user\?\.id/);
    expect(code(path.join(APP, 'NewLesson.jsx'))).toMatch(/PersonField/);
  });

  it('a count is labelled for what it counts', () => {
    const reports = code(path.join(APP, 'Reports.jsx'));
    expect(reports).toMatch(/label="Applications recorded" value=\{summary\.applications\}/);
  });

  it('no delete bypasses the archive rule', () => {
    expect(code(path.join(APP, 'hooks/useLessonsLearned.js')))
      .toMatch(/canDeleteLesson\(lesson, applicationsFor\(id\)\)/);
    expect(code(path.join(APP, 'Register.jsx'))).toMatch(/ConfirmDialog/);
  });

  it('an edit after validation goes back for validation, and a published lesson is not rewritten', () => {
    const hook = code(path.join(APP, 'hooks/useLessonsLearned.js'));
    expect(hook).toMatch(/canEditLesson\(lesson\)/);
    expect(hook).toMatch(/editedLesson\(lesson, edits\)/);
    expect(code(path.join(APP, 'LessonDetail.jsx'))).not.toMatch(/updateLesson/);
  });

  it('the shell has a menu below 1024 px as well as the side menu', () => {
    const shell = code(path.join(APP, 'components/LessonsShell.jsx'));
    expect(shell).toMatch(/hidden lg:flex/);
    expect(shell).toMatch(/<CompactNav items=\{navItems\} \/>/);
  });
});
