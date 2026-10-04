/**
 * SCAL-U2-012: a one-page summary at the front of the SCAL report, for the
 * manager or partner who reads one page (persona 4 of the U1 walks). Read
 * back from the PDF: page 1 holds the identification and the summary, the
 * full report starts on page 2, and every value on page 1 is printed again
 * on the later pages.
 */
import { readPdf, flat } from '@/lib/reportKit/testKit';
import { identifiedFitted, openingInputs, reportOf, pdfOf } from './scalTestKit';

describe('the summary page', () => {
  const rep = reportOf(identifiedFitted());
  const built = pdfOf(rep);
  const pdf = readPdf(built.doc);
  const page1 = flat(pdf.pageText[0]);
  const rest = flat(pdf.pageText.slice(1).join(' '));

  it('page 1 is the identification and the summary; the headline results start on page 2', () => {
    expect(page1).toMatch(/Summary Item Value/);
    expect(page1).not.toMatch(/Headline results/);
    expect(flat(pdf.pageText[1])).toMatch(/Headline results/);
  });

  it('each line is one the later pages print in full', () => {
    const rows = Object.fromEntries(rep.model.summary.rows);
    expect(rows['Oil-water set']).toMatch(/^Swc 0\.18, Sor 0\.22, .*Fitted to the lab table of sample "Demo core A \(synthetic\)"/);
    expect(rows['Lab data']).toBe('2 core samples: 2 with an oil-water kr table, 1 with a gas-oil table, 2 with a Pc table; 2 stated as an analog');
    expect(rows['Leverett J']).toMatch(/Swirr 0\.12 \(entered\); averaged from 2 samples, refit r2 0\.\d{4}/);
    const pc = rep.model.headline.rows.find(([k]) => k === 'Pc at Sw = 0.5 (reservoir)')[1];
    expect(rows['At Sw = 0.5']).toContain(`Pc ${pc} psi`);
    expect(rest).toContain(pc);
    expect(rows['Free water level']).toBe('8,600.0 ft TVDSS');
    expect(rows.Flags).toMatch(/^\d+ flags? on the inputs, the samples and the fits$/);
    expect(page1).toContain('Where the curves go');
  });

  it('the opening workspace has a summary too, and says what is missing', () => {
    const rows = Object.fromEntries(reportOf(openingInputs()).model.summary.rows);
    expect(rows['Lab data']).toBe('No core sample: the curves and the J function were entered');
    expect(rows['Free water level']).toBe('Not entered');
  });
});
