/**
 * AS4 — the module's standing rule, as a test, for the app it was
 * written about.
 *
 * Assurance-ROADMAP.md §6: "No fail-open fallbacks, anywhere. An empty
 * result is an empty result... a wave is not done while a MOCK_
 * constant is reachable from a render path." That rule exists because
 * of `DocumentControlService`, which the AS0 audit quoted:
 *
 *   if (total === 0) throw new Error("Empty DB");   // empty is failure
 *   ...
 *   } catch (e) { return MOCK_DOCUMENTS; }          // shown invented rows
 *
 * The five invented documents were attributed to Sarah Jenkins, Mike
 * Ross, Dr. Alan Grant, Jessica Pearson and Louis Litt — names from
 * Jurassic Park and Suits — and presented to any organization with an
 * empty library as its own controlled documents.
 *
 * Four of the service's eight methods never queried anything at all,
 * and `saveDocument()` returned `{ success: true }` on failure.
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

describe('no invented data in Document Control', () => {
  it('scans the whole app tree, or it proves nothing', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it('the fail-open service is gone', () => {
    expect(fs.existsSync(path.join(ROOT, 'src/services/DocumentControlService.js'))).toBe(false);
    const offenders = files.filter((f) => /DocumentControlService/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no file declares mock or sample rows', () => {
    const offenders = files.filter((f) =>
      /\b(MOCK_[A-Z_]+|mockData|mockReports|SAMPLE_[A-Z_]+|DEMO_[A-Z_]+)\b/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no file treats an empty result as a failure', () => {
    // `if (error || !data || data.length === 0) throw` is the exact line
    // that made an empty library indistinguishable from a broken one.
    const offenders = files.filter((f) => {
      const src = code(f);
      return /length\s*===\s*0\s*\)\s*throw/.test(src)
        || /!data\s*\|\|\s*data\.length\s*===\s*0/.test(src);
    });
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no file falls back to invented rows in a catch', () => {
    const offenders = files.filter((f) =>
      /catch\s*\([^)]*\)\s*\{\s*return\s+(MOCK|mock|local)/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no write path reports success when it failed', () => {
    // saveDocument's catch returned { success: true, ... } // Mock success
    const offenders = files.filter((f) => {
      const src = code(f);
      return /catch[\s\S]{0,200}?success:\s*true/.test(src);
    });
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no invented person appears anywhere', () => {
    const offenders = files.filter((f) =>
      /Sarah Jenkins|Mike Ross|Alan Grant|Jessica Pearson|Louis Litt/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('nothing in the app answers a click with a "not implemented" toast', () => {
    const offenders = files.filter((f) =>
      /isn.t implemented yet|not implemented yet|not fully implemented|🚧/i.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no count is a literal standing in for a query', () => {
    // `overdue: 1 // Mock overdue` sat on the SUCCESS path, so the one
    // number this app exists to produce was hardcoded even when the
    // database answered.
    const offenders = files.filter((f) =>
      /\b(overdue|totalDocs|inReview|approved)\s*:\s*\d+/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no chart is drawn from a hardcoded array of counts', () => {
    const offenders = files.filter((f) =>
      /(?:const|let)\s+\w*[Dd]ata\s*=\s*\[\s*\{\s*name:\s*['"][^'"]+['"]\s*,\s*(?:count|value)\s*:\s*\d/.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('every icon a page renders is imported', () => {
    // Reports.jsx used `icon: FileListIcon` and never imported it, so
    // the component threw a ReferenceError on render and the Reports
    // tab was a blank error boundary for as long as it shipped.
    files.filter((f) => /\.jsx$/.test(f)).forEach((f) => {
      const src = read(f);
      const imported = new Set();
      const importRe = /import\s*\{([^}]+)\}\s*from\s*['"][^'"]+['"]/g;
      let m = importRe.exec(src);
      while (m) {
        m[1].split(',').forEach((n) => imported.add(n.trim().split(/\s+as\s+/).pop().trim()));
        m = importRe.exec(src);
      }
      const defaultRe = /import\s+(\w+)[\s,]/g;
      let d = defaultRe.exec(src);
      while (d) { imported.add(d[1]); d = defaultRe.exec(src); }

      const used = new Set();
      const iconRe = /\bicon:\s*([A-Z]\w+)/g;
      let u = iconRe.exec(code(f));
      while (u) { used.add(u[1]); u = iconRe.exec(code(f)); }

      used.forEach((name) => {
        expect(`${rel(f)}: ${name} imported? ${imported.has(name)}`)
          .toBe(`${rel(f)}: ${name} imported? true`);
      });
    });
  });

  it('no regulatory claim is attached to a report that does not exist', () => {
    // "Full FDA CFR 21 Part 11 style audit extract" described one of
    // four cards whose button toasted "not implemented yet".
    const offenders = files.filter((f) => /CFR 21|Part 11/i.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('the upload control is a real input, not a styled div', () => {
    // The old box advertised "PDF, DOCX, XLSX up to 50MB" and had no
    // input element, no onChange and no drop handler behind it.
    const form = read(path.join(APP, 'NewDocument.jsx'));
    expect(form).toMatch(/<input[^>]*type="file"/);
    expect(form).toMatch(/onDrop=/);
    expect(form).toMatch(/validateFile/);
  });

  it('a failed load is surfaced on every page', () => {
    const hook = read(path.join(APP, 'hooks/useDocumentControl.js'));
    expect(hook).toMatch(/setError\(/);
    ['Dashboard.jsx', 'Library.jsx', 'Reports.jsx', 'ApprovalQueue.jsx', 'DocumentDetail.jsx', 'NewDocument.jsx']
      .forEach((page) => expect(read(path.join(APP, page))).toMatch(/ErrorState/));
  });

  it('every write path reports its failure to the user', () => {
    // Either a destructive toast or a rendered failure panel. What is
    // not acceptable is the old shape: a success toast on the happy
    // path and silence on the sad one.
    ['NewDocument.jsx', 'DocumentDetail.jsx', 'ApprovalQueue.jsx'].forEach((page) => {
      const src = read(path.join(APP, page));
      const reports = /variant: 'destructive'/.test(src)
        || /setFailure\(result\.error\)/.test(src);
      expect(`${page} reports write failures: ${reports}`)
        .toBe(`${page} reports write failures: true`);
    });
  });

  it('a partial success is reported as one, not as a success', () => {
    // A document written but a file not stored must not toast "saved".
    const hook = read(path.join(APP, 'hooks/useDocumentControl.js'));
    expect(hook).toMatch(/warning/);
    expect(read(path.join(APP, 'DocumentDetail.jsx'))).toMatch(/result\.warning/);
    expect(read(path.join(APP, 'NewDocument.jsx'))).toMatch(/result\.warning/);
  });

  it('reads are scoped to the organization in code, not only by RLS', () => {
    // getDocuments() selected from `documents` with no org filter at
    // all, so the app never knew whose library it was showing.
    const hook = read(path.join(APP, 'hooks/useDocumentControl.js'));
    expect(hook).toMatch(/useAuth/);
    expect(hook).toMatch(/\.eq\('org_id', orgId\)/);
  });

  it('the app uses UI tokens, not a hand-painted dark theme', () => {
    // Every colour in all six pages was a hardcoded hex, so the app
    // ignored the user's theme entirely.
    const offenders = files.filter((f) => /#(0F1419|232B3A|2D3748|E2E8F0|A0AEC0|1A1F2E)\b/i.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('charts follow the Suite standard: white surface and the watermark', () => {
    ['Dashboard.jsx', 'Reports.jsx'].forEach((page) => {
      const src = read(path.join(APP, page));
      expect(src).toMatch(/chartTheme/);
      expect(src).toMatch(/ChartLogo/);
    });
  });
});
