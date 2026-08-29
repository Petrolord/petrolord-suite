/**
 * Technical Report Autopilot DOCX export (rebuild, 2026-08-29).
 *
 * The old export asked a report service for a download link into itself. That
 * service no longer exists, so the document is built in the browser from the
 * sections on screen. A .docx is a zip of OOXML parts, and a malformed part
 * produces a file Word refuses to open with no useful message, so the parts
 * are checked here rather than discovered by a user.
 */
import JSZip from 'jszip';
import {
  buildDocumentXml, buildDocxBlob, docxFileName, esc,
} from '@/utils/reportAutopilotDocx';

const REPORT = {
  title: 'Alpha Prospect Drilling Review',
  meta: ['Field: West Delta', 'Well: A-21'],
  sections: [
    { title: 'Executive Summary', content: 'The well reached TD.\n\nNo lost time injuries occurred.' },
    { title: 'Lessons Learned', content: 'The 8.5 inch section underperformed offset wells.' },
  ],
  footNote: 'Drafted with Petrolord.',
};

describe('buildDocumentXml', () => {
  it('opens with a single document root and closes it', () => {
    const xml = buildDocumentXml(REPORT);
    expect(xml.startsWith('<?xml version="1.0"')).toBe(true);
    expect((xml.match(/<w:document /g) || []).length).toBe(1);
    expect(xml.endsWith('</w:document>')).toBe(true);
  });

  it('carries the title, the meta lines and every section heading', () => {
    const xml = buildDocumentXml(REPORT);
    expect(xml).toContain('Alpha Prospect Drilling Review');
    expect(xml).toContain('Field: West Delta');
    expect(xml).toContain('Executive Summary');
    expect(xml).toContain('Lessons Learned');
  });

  it('splits a section into one paragraph per block of text', () => {
    // Two blocks in the first section, one in the second, plus title, two meta
    // lines, two headings, and the spacer and note at the end.
    const xml = buildDocumentXml(REPORT);
    const paragraphs = (xml.match(/<w:p>/g) || []).length;
    expect(paragraphs).toBe(1 + 2 + (1 + 2) + (1 + 1) + 2);
  });

  it('styles headings so Word can build a table of contents from them', () => {
    const xml = buildDocumentXml(REPORT);
    expect((xml.match(/w:val="Heading1"/g) || []).length).toBe(2);
    expect(xml).toContain('w:val="Title"');
  });

  it('escapes characters that would otherwise break the XML', () => {
    const xml = buildDocumentXml({
      title: 'Well A & B <draft>',
      sections: [{ title: 'Notes', content: 'Rate > 1000 bopd & rising' }],
    });
    expect(xml).toContain('Well A &amp; B &lt;draft&gt;');
    expect(xml).toContain('Rate &gt; 1000 bopd &amp; rising');
    // The escaped text must not reintroduce a raw angle bracket anywhere.
    expect(xml).not.toContain('<draft>');
  });

  it('survives a report with nothing in it rather than emitting broken XML', () => {
    const xml = buildDocumentXml({});
    expect(xml).toContain('Technical Report');
    expect(xml.endsWith('</w:document>')).toBe(true);
  });

  it('drops blank paragraphs from a section rather than padding the document', () => {
    const xml = buildDocumentXml({ title: 'T', sections: [{ title: 'S', content: 'one\n\n\n\ntwo\n   \n' }] });
    expect(xml).toContain('one');
    expect(xml).toContain('two');
    // Title, heading, and exactly the two real paragraphs.
    expect((xml.match(/<w:p>/g) || []).length).toBe(4);
  });
});

describe('esc', () => {
  it('handles null and undefined without printing them into the document', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });
});

describe('buildDocxBlob', () => {
  it('produces a zip carrying every part Word needs to open the file', async () => {
    const blob = await buildDocxBlob(REPORT);
    const zip = await JSZip.loadAsync(blob);
    for (const part of [
      '[Content_Types].xml',
      '_rels/.rels',
      'word/document.xml',
      'word/styles.xml',
      'word/_rels/document.xml.rels',
    ]) {
      expect(zip.file(part)).toBeTruthy();
    }
  });

  it('writes the report content into word/document.xml', async () => {
    const blob = await buildDocxBlob(REPORT);
    const zip = await JSZip.loadAsync(blob);
    const xml = await zip.file('word/document.xml').async('string');
    expect(xml).toContain('Alpha Prospect Drilling Review');
    expect(xml).toContain('No lost time injuries occurred.');
  });

  it('declares the document part as a WordprocessingML document', async () => {
    const blob = await buildDocxBlob(REPORT);
    const zip = await JSZip.loadAsync(blob);
    const types = await zip.file('[Content_Types].xml').async('string');
    expect(types).toContain('wordprocessingml.document.main+xml');
  });
});

describe('docxFileName', () => {
  it('slugs the title and dates the file', () => {
    const name = docxFileName('Alpha Prospect: Drilling Review');
    expect(name).toMatch(/^alpha-prospect-drilling-review-\d{4}-\d{2}-\d{2}\.docx$/);
  });

  it('falls back to a usable name when the title is empty', () => {
    expect(docxFileName('')).toMatch(/^technical-report-\d{4}-\d{2}-\d{2}\.docx$/);
    expect(docxFileName('!!!')).toMatch(/^technical-report-/);
  });

  it('keeps the name short enough for any filesystem', () => {
    expect(docxFileName('x'.repeat(500)).length).toBeLessThan(90);
  });
});
