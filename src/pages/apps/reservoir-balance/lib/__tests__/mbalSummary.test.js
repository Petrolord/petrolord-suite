/**
 * Batch B: a one-page summary at the front of the Material Balance report,
 * for the manager or partner who reads one page (persona 3 of the U1 walks).
 * Read back from the PDF file: page 1 holds the summary, and every value on
 * it is one the later pages print in full.
 */
import { buildMbalPdf } from '@/utils/mbalReportExport';
import { readPdf, flat, chartLogo } from '@/lib/reportKit/testKit';
import { runSample, reportArgs, SAMPLE_CASE_IDS, AT } from './mbalTestKit';

const build = (state) => buildMbalPdf(reportArgs(state), { logo: chartLogo(), generatedAt: AT });

describe('the summary page', () => {
  const ahmed = runSample(SAMPLE_CASE_IDS.ahmed);
  const { doc, model } = build(ahmed);
  const pdf = readPdf(doc);
  const page1 = flat(pdf.pageText[0]);
  const rest = flat(pdf.pageText.slice(1).join(' '));

  test('page 1 is the identification and the summary; the full report starts on page 2', () => {
    expect(page1).toMatch(/Summary Item Value/);
    expect(page1).not.toMatch(/Headline results/);
    expect(flat(pdf.pageText[1])).toMatch(/^Headline results|Headline results/);
  });

  test('the answer, its backing, the other methods, the drive and the data, each as the later pages print it', () => {
    const ooip = model.crossCheck.find((c) => c.difference === 'headline').text;
    expect(page1).toContain(`Oil initially in place ${ooip} (Havlena-Odeh, F against Et (slope))`);
    expect(rest).toContain(ooip);
    expect(page1).toMatch(/How it is backed Benchmark verified engine path; r2 0\.\d{4} on 12 points/);
    expect(page1).toMatch(/Other methods F\/Et at the last timestep \(Campbell level\): [\d.,]+ MMSTB \([+-][\d.]+%\); Volumetric estimate: 270\.60 MMSTB \([+-][\d.]+%\)/);
    expect(page1).toMatch(/Drive at the last timestep depletion drive; largest index Depletion \(DDI\) 0\.\d{3}; aquifer none/);
    expect(page1).toMatch(/Data 13 timesteps, 2010-01-01 to 2022-01-01; 12 in the fit/);
    expect(page1).toMatch(/Injection None on the data table/);
    expect(page1).toMatch(/Flags 0 inputs outside a published range or the PVT table; 0 other engine warnings/);
  });

  test('a gas case with an excluded point and a pot aquifer says so on page 1', () => {
    const g = build(runSample(SAMPLE_CASE_IDS.pletcher));
    const p1 = flat(readPdf(g.doc).pageText[0]);
    expect(p1).toMatch(/Gas initially in place [\d.,]+ Bscf \(Pot aquifer plot \(intercept\)\)/);
    expect(p1).toMatch(/1 excluded by the analyst \(listed with the reasons\)/);
  });
});
