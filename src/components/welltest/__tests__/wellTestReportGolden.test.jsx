/**
 * Golden output of the Well Test Analysis report (Report Kit, Step 0 of the
 * Reservoir round, 2026-10-02). The fixtures were written from the report
 * as it stood in production (main 8234bdc8c, PR #852) BEFORE the report was
 * moved onto src/lib/reportKit (commit 48dd09670), and the report has to
 * keep reproducing them:
 *
 *   - the pdftotext output, line for line;
 *   - the page count;
 *   - every figure: its number, its page, whether it is plotted, the box of
 *     each panel and the number of points drawn per series;
 *   - the PDF itself, byte for byte once the creation date and the file id
 *     are blanked (a SHA-256 of the document).
 *
 * A deliberate change to the Well Test report regenerates them:
 *   UPDATE_REPORT_GOLDENS=1 npx jest src/components/welltest/__tests__/wellTestReportGolden.test.jsx --runInBand
 * and the diff of the .txt fixtures is then the review of that change.
 */
import '@testing-library/jest-dom';
import fs from 'fs';
import path from 'path';

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({ order: jest.fn().mockResolvedValue({ data: [], error: null }) })),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      delete: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) })),
    })),
  },
}));

import { buildWellTestPdf, collectReportArgs } from '@/utils/wellTestReportExport';
import { periodKey } from '@/utils/welltest/reportModel';
import wtGoldens from '@/utils/welltest/__tests__/goldens.json';
import { checkGolden } from '@/lib/reportKit/testKit';
import { mountStudio, chartLogo } from './reportTestKit';

const AT = new Date('2026-10-02T09:00:00Z');
const DIR = path.join(process.cwd(), 'src', 'components', 'welltest', '__tests__', '__fixtures__', 'reportGolden');
const UPDATE = process.env.UPDATE_REPORT_GOLDENS === '1';
const logo = chartLogo();

const identify = (c) => {
  c.setFieldName('Obodo');
  c.setAnalyst('A. Analyst');
  c.setIdentification({ licence: 'OML 143', zone: 'D-3 sand', testDateStart: '2026-09-14', testDateEnd: '2026-09-17', operation: 'dst', registryWellId: '', registryWellName: '' });
  c.setCompletion({ perfTopMd: '9850', perfBaseMd: '9880', payTopMd: '9850', perfTopTvd: '9601', perfBaseTvd: '9630', payTopTvd: '9601', tvdSource: 'Survey of registry well Obodo-7' });
};

// Each case drives the real provider to a state and returns nothing; the
// report is then built from that state with the function the Export button calls.
const CASES = {
  // the reviewer's case of tester round 2: identified, completed over part
  // of the pay, sources stated, the regression run
  'oil-buildup-reviewed': async (studio) => {
    await studio.act((c) => {
      identify(c);
      c.setReservoirField('sw', '0.22');
      c.setReservoirField('apiGravity', '34');
      c.setReservoirField('gor', '650');
      c.setReservoirField('solutionGasGravity', '0.72');
      c.setReservoirField('reservoirTempF', '212');
      c.setInputMetaField('mu', 'source', 'lab');
      c.setInputMetaField('mu', 'note', 'Bottomhole sample 2, OBM contamination 4 percent');
      c.setInputMetaField('B', 'source', 'correlation');
      c.setInputMetaField('B', 'correlation', 'Standing');
      c.setInputMetaField('h', 'source', 'offset');
      c.setInputMetaField('phi', 'source', 'assumed');
      c.setPeriodMetaField(periodKey(0), 'choke', '32');
      c.setPeriodMetaField(periodKey(0), 'recovered', '660');
      c.setNotes('Radial flow from 8 hr. Wellbore storage ends before 0.5 hr; the skin is positive and mostly mechanical.');
    });
    await studio.act((c) => c.runAutoFit());
  },
  // the sample as loaded: no model matched, nothing identified
  'oil-buildup-bare': async (studio) => {
    await studio.act((c) => {
      c.setCompletion({ perfTopMd: '', perfBaseMd: '', payTopMd: '', perfTopTvd: '', perfBaseTvd: '', payTopTvd: '', tvdSource: '' });
      c.setRateRows([]);
    });
  },
  // gas: pseudo-pressure, the correlations the engine names
  'gas-buildup': async (studio) => {
    await studio.act((c) => {
      identify(c);
      c.setReservoirField('fluid', 'gas');
      c.setReservoirField('ct', '');
      c.setReservoirField('q', '5000');
      c.setReservoirField('sw', '0.3');
    });
  },
  // a claimed linear-flow window brings the sqrt(t) plot in; an imported
  // temperature column adds the second overview panel; a manual match
  'oil-linear-temperature': async (studio) => {
    await studio.act((c) => {
      identify(c);
      c.setGaugeRows(c.gaugeRows.map((r, i) => ({ ...r, T: 211 + 0.02 * i })));
      c.setWindowField('sqrtMin', '0.02');
      c.setWindowField('sqrtMax', '0.5');
      c.setMatchField('k', '70');
    });
  },
  // the same in SI, so the converted units and values are pinned too
  'oil-linear-temperature-si': async (studio) => {
    await CASES['oil-linear-temperature'](studio);
    await studio.act((c) => c.setUnitSystem('si'));
  },
  // production data on the RTA tab: the RTA table and the two RTA panels
  'oil-rta': async (studio) => {
    await studio.act((c) => {
      c.setRtaRows(wtGoldens.fixtures.rtaOilDecline.rows.map((r) => ({ t: String(r.t), q: String(r.q), pwf: String(r.pwf) })));
      c.setMatchField('k', '85');
    });
  },
};

describe('Well Test report: golden output', () => {
  test.each(Object.keys(CASES))('%s reproduces its golden text, page count, figure point counts and bytes', async (name) => {
    const studio = mountStudio();
    await studio.act((c) => c.loadSampleTest());
    await CASES[name](studio);
    const built = buildWellTestPdf(collectReportArgs(studio.ctx), { logo, generatedAt: AT });
    studio.unmount();
    // line for line, page count, figure records, document bytes
    const { meta, golden } = checkGolden(built, { dir: DIR, name, update: UPDATE });
    expect(meta).toEqual(golden);
  }, 600000);

  test('the goldens cover the paths the report has', () => {
    const read = (n) => JSON.parse(fs.readFileSync(path.join(DIR, `${n}.json`), 'utf8'));
    const plotted = (n) => read(n).figures.filter((f) => f.plotted).map((f) => f.id);
    expect(plotted('oil-buildup-reviewed')).toEqual(['overview', 'loglog', 'semilog', 'history']);
    expect(plotted('oil-buildup-bare')).toEqual(['overview', 'loglog', 'semilog']);
    expect(plotted('oil-linear-temperature')).toEqual(['overview', 'loglog', 'semilog', 'sqrt', 'history']);
    expect(read('oil-linear-temperature').figures[0].panels).toHaveLength(2);
    expect(plotted('oil-rta')).toContain('rta');
    const gas = fs.readFileSync(path.join(DIR, 'gas-buildup.txt'), 'utf8');
    expect(gas).toMatch(/pseudo-pressure m\(p\)/);
    const si = fs.readFileSync(path.join(DIR, 'oil-linear-temperature-si.txt'), 'utf8');
    expect(si).toMatch(/Temperature \(degC\)/);
  });
});
