/**
 * Report Kit: the report builder. The reviewer-signable report the Well
 * Test Analysis Studio prints (tester rounds of PR #810 and PR #852), as a
 * set of blocks any Suite app can stack:
 *
 *   const r = createReport({ title: 'Decline Curve Report', appName: 'Petrolord DCA Studio' });
 *   r.header({ identification: [['Well', 'W-7'], ['Field', 'Obodo']], displayUnits: 'Oilfield' });
 *   r.table('Headline results', ['Quantity', 'Value'], rows, { note: '...' });
 *   r.inputsTable(inputRows, { note: '...' });
 *   r.figures([{ id: 'rate', title: 'Rate history', caption: '...', panels: [{ height: 80, spec }] },
 *              { id: 'pz', title: 'p/z plot', statement: 'Does not apply: the fluid is oil.' }]);
 *   const { doc, figures, pages } = r.finish({ footer: 'Decline Curve Report, Well W-7' });
 *
 * jsPDF with jspdf-autotable for the tables, the stack every Suite PDF
 * export already uses. Pure formatting: a report hands in numbers already
 * computed and rows already built; nothing is calculated here. Every string
 * goes through the Latin-1 filter of ./text.js.
 */
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { textFilter } from './text.js';
import { timestampUtc } from './format.js';
import { NAVY, SLATE, PAGE } from './theme.js';
import { createLayout } from './layout.js';
import { drawPlot } from './plot.js';
import { drawBars } from './bars.js';

/** The head of the inputs table. */
export const INPUTS_HEAD = Object.freeze(['Input', 'Value', 'Unit', 'Source and quality']);
const INPUTS_COLUMNS = Object.freeze({ 0: { cellWidth: 56 }, 1: { cellWidth: 28 }, 2: { cellWidth: 22 } });

const isBlank = (v) => v == null || v === '' || (typeof v === 'number' && !Number.isFinite(v));

/**
 * The cells of the header block: the identification pairs, then the display
 * units and the time the report was generated.
 * @param {{identification?: Array<[string, string]>, displayUnits?: string, generatedAt?: Date}} a
 * @returns {Array<[string, string]>}
 */
export function headerPairs({ identification = [], displayUnits, generatedAt } = {}) {
  const cells = identification.map(([label, value]) => [label, isBlank(value) ? EMPTY_VALUE : value]);
  if (displayUnits) cells.push(['Display units', displayUnits]);
  if (generatedAt) cells.push(['Generated', timestampUtc(generatedAt)]);
  return cells;
}

/**
 * Label and value pairs laid two to a row: [label, value, label, value].
 * An odd pair leaves the right half of the last row empty.
 */
export function pairRows(pairs, text = textFilter(false)) {
  const rows = [];
  for (let i = 0; i < pairs.length; i += 2) {
    rows.push([...pairs[i], ...(pairs[i + 1] || ['', ''])].map(text));
  }
  return rows;
}

/**
 * Body rows of the inputs table from { label, value, unit, source } rows.
 * A missing value prints as EMPTY_VALUE; a dimensionless input keeps an
 * empty unit cell. `source` is the finished wording (see
 * lib/inputProvenance sourceText) with the quality note already in it.
 */
export const inputsBody = (rows) => (rows || []).map((r) => [
  r.label, isBlank(r.value) ? EMPTY_VALUE : r.value, r.unit == null ? '' : r.unit, isBlank(r.source) ? EMPTY_VALUE : r.source,
]);

/**
 * @param {{title: string, appName?: string, reportName?: string,
 *   logo?: ?{dataUrl: string, w: number, h: number}, strictText?: boolean,
 *   page?: {top?: number, bottom?: number, left?: number, right?: number}}} options
 *   `logo` is the Petrolord chart mark for the plots (lib/pdfBrand
 *   loadPetrolordLogo); without it each plot carries the word instead.
 *   `strictText` makes a character outside Latin-1 an error instead of a "?".
 */
export function createReport({ title, appName = '', reportName, logo = null, strictText = false, page } = {}) {
  const doc = new jsPDF();
  const text = textFilter(strictText);
  const layout = createLayout(doc, page);
  const LEFT = layout.left;
  const RIGHT = layout.right;
  const WIDTH = layout.width;
  const drawn = [];
  let figureCount = 0;

  const ensure = (height) => layout.ensure(height);

  /** A section heading at the cursor; `need` is the height that must fit under it on this page. */
  const heading = (value, need = 24) => {
    ensure(need);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(...NAVY);
    doc.text(text(value), LEFT, layout.y);
  };

  /** Wrapped body text at the cursor; the cursor moves below it. */
  const paragraph = (value, { size = 8, color = SLATE, gap = 3 } = {}) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text(value), WIDTH);
    const lineH = size * 0.42;
    ensure(lines.length * lineH + gap);
    doc.text(lines, LEFT, layout.y);
    layout.y += lines.length * lineH + gap;
  };

  /**
   * The header block: title, application name, the identification grid (two
   * label and value pairs to a row), and a rule under it. Pass
   * `identification` (with `displayUnits` and `generatedAt`) or ready `rows`.
   */
  const header = ({ identification, displayUnits, generatedAt = new Date(), rows } = {}) => {
    doc.setFontSize(18);
    doc.setTextColor(...NAVY);
    doc.text(text(title), LEFT, layout.y);
    layout.y += 5;
    doc.setFontSize(9);
    doc.setTextColor(...SLATE);
    doc.text(text(appName), LEFT, layout.y);
    layout.y += 3;
    const body = rows || pairRows(headerPairs({ identification, displayUnits, generatedAt }), text);
    const half = WIDTH / 2;
    doc.autoTable({
      startY: layout.y,
      body,
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 1, textColor: SLATE },
      columnStyles: {
        0: { fontStyle: 'bold', textColor: NAVY, cellWidth: 30 },
        1: { cellWidth: half - 30 },
        2: { fontStyle: 'bold', textColor: NAVY, cellWidth: 30 },
        3: { cellWidth: half - 30 },
      },
      margin: { left: LEFT, right: LEFT },
    });
    layout.y = doc.lastAutoTable.finalY + 2;
    doc.setDrawColor(...SLATE);
    doc.line(LEFT, layout.y, RIGHT, layout.y);
    layout.y += 6;
  };

  /**
   * A titled table: navy header row, grid borders, an optional note line
   * under it. It breaks across pages on its own and repeats the header row
   * on each page; a table that fits on one page is kept on one page with
   * its title and note. A blank cell prints as EMPTY_VALUE unless
   * `emptyValue` says otherwise (null leaves blanks blank). A table with no
   * rows is not printed; the return value says whether it was.
   */
  // fontSize: added in the VRR round (a ledger of ten numeric columns on a portrait page); default unchanged
  const table = (tableTitle, head, body, { columnStyles, note, emptyValue = EMPTY_VALUE, fontSize = 8 } = {}) => {
    if (!body || !body.length) return false;
    const cell = (v) => text(emptyValue != null && isBlank(v) ? emptyValue : v);
    // keep a table with its heading and note on one page when it can fit on one
    const need = 12 + (body.length + 1) * 7.3 + (note ? 10 : 0);
    heading(tableTitle, need <= layout.pageHeight() ? need : 24);
    doc.autoTable({
      startY: layout.y + 2,
      head: [head.map(text)],
      body: body.map((row) => row.map(cell)),
      theme: 'grid',
      styles: { fontSize, overflow: 'linebreak' },
      headStyles: { fillColor: NAVY },
      columnStyles,
      margin: { left: LEFT, right: LEFT },
    });
    layout.y = doc.lastAutoTable.finalY + (note ? 4 : 8);
    if (note) { paragraph(note, { gap: 5 }); }
    return true;
  };

  /**
   * The inputs table: every input with its value, its unit, and where it
   * came from with the quality note ("Value / Unit / Source and quality").
   * @param {Array<{label: string, value: string, unit?: string, source: string}>} rows
   */
  const inputsTable = (rows, { title: tableTitle = 'Inputs', note, columnStyles = INPUTS_COLUMNS } = {}) => (
    table(tableTitle, INPUTS_HEAD, inputsBody(rows), { columnStyles, note, emptyValue: null })
  );

  /**
   * A heading with a paragraph under it: interpretation notes, or the one
   * sentence that stands in for a table that has nothing to show.
   */
  const section = (sectionTitle, value, { need = 14, lead = 5, size = 8, color = SLATE, gap = 6 } = {}) => {
    heading(sectionTitle, need);
    layout.y += lead;
    paragraph(value, { size, color, gap });
  };

  /**
   * "Limits of this analysis" (reviewer lens RL9): what the method assumes
   * and does not cover, the published range of each correlation used, and
   * every input that sits outside one. `flags` are sentences; with none the
   * block says so, so a reader never wonders whether the check was run.
   * @param {{assumptions?: string[], ranges?: {head: string[], body: Array<string[]>, note?: string,
   *   columnStyles?: object}, flags?: string[], noFlagsText?: string, title?: string}} a
   */
  // flagsTitle: added in the SCAL round (its flags are pedigree and fit warnings, not only ranges); default unchanged
  // rangesTitle: added in the Recovery Factor round (its table holds the domain each method needs, not published data ranges); default unchanged
  const limits = ({ assumptions = [], ranges = null, flags = [], noFlagsText = 'No input is outside a published range.', title: blockTitle = 'Limits of this analysis', flagsTitle = 'Inputs outside a published range', rangesTitle = 'Published ranges of the methods used' } = {}) => {
    heading(blockTitle, 22);
    layout.y += 5;
    for (const line of assumptions) paragraph(`- ${line}`, { gap: 1.5 });
    layout.y += 3;
    if (ranges?.body?.length) {
      table(rangesTitle, ranges.head, ranges.body, { columnStyles: ranges.columnStyles, note: ranges.note });
    }
    heading(flagsTitle, 14);
    layout.y += 5;
    if (flags.length) for (const line of flags) paragraph(`- ${line}`, { gap: 1.5 });
    else paragraph(noFlagsText, { gap: 1.5 });
    layout.y += 5;
  };

  /** Start the plots on a new page under their own heading. */
  const startFigures = (sectionTitle = 'Plots') => {
    layout.newPage();
    heading(sectionTitle, 12);
    layout.y += 6;
  };

  /**
   * One numbered figure. With `panels` it is a title, the plots stacked
   * under it and a caption, kept together on one page. Without panels it is
   * the title and one line saying why the plot does not apply
   * (`statement`), so a reader never wonders whether a figure went missing.
   * @param {{id?: string, number?: number, title: string, caption?: string,
   *   panels?: Array<{height: number, spec: object, kind?: 'bars'}>, statement?: string}} fig
   * @returns {{id: string, number: number, title: string, page: number, plotted: boolean,
   *   panels: Array<{box: object, drawn: Object<string, number>, total: number}>}}
   */
  const figure = (fig) => {
    figureCount += 1;
    const number = fig.number ?? figureCount;
    const figTitle = `Figure ${number}. ${fig.title}`;
    const record = { id: fig.id ?? `figure-${number}`, number };
    if (!fig.panels?.length) {
      ensure(16);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(...NAVY);
      doc.text(text(figTitle), LEFT, layout.y);
      layout.y += 4.5;
      paragraph(fig.statement || 'Not plotted.', { gap: 6 });
      const out = { ...record, page: doc.getNumberOfPages(), plotted: false, panels: [] };
      drawn.push(out);
      return out;
    }
    doc.setFontSize(8);
    const captionLines = doc.splitTextToSize(text(fig.caption || ''), WIDTH);
    const total = fig.panels.reduce((sum, p) => sum + p.height + 3, 0) + 6 + captionLines.length * 3.4 + 6;
    // keep with next: the title, every panel and the caption share a page
    ensure(total);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...NAVY);
    doc.text(text(figTitle), LEFT, layout.y);
    layout.y += 3;
    const panels = [];
    for (const panel of fig.panels) {
      const box = { x: LEFT, y: layout.y, w: WIDTH, h: panel.height };
      // a panel is a line or scatter plot unless it asks for bars (./bars.js)
      const draw = panel.kind === 'bars' ? drawBars : drawPlot;
      panels.push({ box, ...draw(doc, box, { ...panel.spec, logo }) });
      layout.y += panel.height + 3;
    }
    layout.y += 1;
    paragraph(fig.caption || '', { gap: 7 });
    const out = { ...record, page: doc.getNumberOfPages(), plotted: true, panels };
    drawn.push(out);
    return out;
  };

  /** The plots section: a new page, the heading, then each figure in order. */
  const figures = (list, { title: sectionTitle = 'Plots' } = {}) => {
    if (!list?.length) return [];
    startFigures(sectionTitle);
    return list.map(figure);
  };

  /**
   * Print the footer on every page (the report name on the left, "Page n of
   * m" on the right) and hand the document back with what was drawn.
   * @returns {{doc: object, figures: Array, pages: number}}
   */
  const finish = ({ footer = reportName || title } = {}) => {
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i += 1) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...SLATE);
      doc.text(text(footer), LEFT, PAGE.footerY);
      doc.text(`Page ${i} of ${pages}`, RIGHT, PAGE.footerY, { align: 'right' });
    }
    return { doc, figures: drawn, pages };
  };

  return {
    doc, layout, text,
    header, heading, paragraph, table, inputsTable, section, limits, startFigures, figure, figures, finish,
  };
}
