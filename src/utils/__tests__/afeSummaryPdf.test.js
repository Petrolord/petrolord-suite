/**
 * EC5-0: the AFE summary PDF bills from the AFE's saved partners.
 *
 * Before EC5-0 the report was fed two invented partners, and the partner
 * section called calculatePartnerCosts through a bare re-export that creates
 * no local binding, so it threw as soon as partners were passed. These check
 * what reaches the page: the saved partner rows, the operator carrying 100
 * percent with none, the engine note and no split when the set is invalid,
 * and variance as budget less the one EAC rule.
 */
jest.mock('jspdf', () => {
  const Doc = jest.fn().mockImplementation(() => {
    const calls = { text: [], tables: [], saveName: null };
    const doc = {
      lastAutoTable: { finalY: 40 },
      setFontSize() {}, setLineWidth() {}, line() {},
      text(t) { calls.text.push(Array.isArray(t) ? t.join(' ') : String(t)); },
      splitTextToSize(t) { return [t]; },
      autoTable(opts) {
        calls.tables.push({ head: opts.head[0], body: opts.body });
        this.lastAutoTable = { finalY: this.lastAutoTable.finalY + 30 };
      },
      save(name) { calls.saveName = name; },
      __calls: calls,
    };
    global.__lastAfeDoc = doc;
    return doc;
  });
  return { __esModule: true, default: Doc, jsPDF: Doc };
});
jest.mock('jspdf-autotable', () => ({}));

import { generateAFESummaryPDF } from '@/utils/afeServices';

const AFE = { afe_number: 'AFE-7', afe_name: 'Test well', status: 'Approved', currency: 'USD' };
const ITEMS = [
  { category: 'Drilling', budget: 1000, actual: 1300 },
  { category: 'Completion', budget: 500, actual: 100 },
];
const calls = () => global.__lastAfeDoc.__calls;
const partnerTable = () => calls().tables.find((t) => t.head[0] === 'Partner');

describe('generateAFESummaryPDF', () => {
  it('allocates the actual cost across the saved partners', () => {
    generateAFESummaryPDF(AFE, ITEMS, [{ name: 'Saved Partner Ltd', working_interest: 25 }]);
    const table = partnerTable();
    expect(table.body[0][0]).toBe('Operator (Net)');
    expect(table.body[0][1]).toBe('75.00%');
    expect(table.body[1][0]).toBe('Saved Partner Ltd');
    expect(table.body[1][2]).toBe(`${(350).toLocaleString()} USD`);
  });

  it('gives the operator 100 percent when no partners are saved', () => {
    generateAFESummaryPDF(AFE, ITEMS, []);
    expect(partnerTable().body).toEqual([['Operator (Net)', '100.00%', `${(1400).toLocaleString()} USD`]]);
    expect(calls().text.join('\n')).toMatch(/operator carries 100 percent/);
  });

  it('prints the engine note and no billing split when the set is invalid', () => {
    generateAFESummaryPDF(AFE, ITEMS, [{ name: 'Minus', working_interest: -10 }]);
    expect(partnerTable()).toBeUndefined();
    const text = calls().text.join('\n');
    expect(text).toMatch(/negative working interest/);
    expect(text).toMatch(/No billing split is shown/);
  });

  it('reports variance as budget less the EAC rule', () => {
    generateAFESummaryPDF(AFE, ITEMS, []);
    const summary = calls().tables[0].body;
    // EAC: Drilling max(1000, 1300) = 1300, Completion max(500, 100) = 500.
    expect(summary).toContainEqual(['Forecast at Completion (EAC)', `${(1800).toLocaleString()} USD`]);
    expect(summary).toContainEqual(['Variance (Budget less EAC)', `${(-300).toLocaleString()} USD`]);
    const cat = calls().tables[1];
    expect(cat.head).toEqual(['Category', 'Budget', 'Actual', 'EAC', 'Variance']);
    expect(cat.body[0]).toEqual(['Drilling', (1000).toLocaleString(), (1300).toLocaleString(), (1300).toLocaleString(), (-300).toLocaleString()]);
  });
});
