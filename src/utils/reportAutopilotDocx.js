// DOCX export for the Technical Report Autopilot (rebuild, 2026-08-29).
//
// The old export called a report service on a Heroku host that no longer
// exists, and handed the user a download link into it. A .docx is a zip of
// OOXML parts, and the Suite already ships JSZip, so the document is built in
// the browser: no round trip, no server to go missing, and the file is
// assembled from exactly the sections on screen.
//
// This writes the minimum valid WordprocessingML that Word, LibreOffice and
// Google Docs all open: the content types map, the two relationship parts,
// and the document body. Styling is deliberately plain, because a report a
// user is going to edit should arrive as clean structure rather than as
// something they have to strip.

import JSZip from 'jszip';

/** XML-escape text destined for an OOXML run. */
export const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

// Heading1 and Title are declared so Word's navigation pane and table of
// contents pick the sections up, which is what makes the file editable rather
// than merely readable.
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:styleId="Normal" w:default="1"><w:name w:val="Normal"/><w:rPr><w:sz w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="48"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="120"/></w:pPr><w:rPr><w:color w:val="555555"/><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/><w:spacing w:before="360" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
</w:styles>`;

const para = (text, style) => {
  const pPr = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
  // xml:space preserve keeps intentional leading spaces in quoted material.
  return `<w:p>${pPr}<w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
};

/**
 * Build the document body from the report.
 *
 * Exported separately from the zipping so it can be tested without unpacking
 * an archive.
 */
export const buildDocumentXml = ({ title, meta = [], sections = [], footNote }) => {
  const parts = [];
  parts.push(para(title || 'Technical Report', 'Title'));
  meta.filter(Boolean).forEach((line) => parts.push(para(line, 'Subtitle')));

  sections.forEach((section) => {
    parts.push(para(section.title || 'Section', 'Heading1'));
    String(section.content || '')
      .split(/\n+/)
      .map((p) => p.trim())
      .filter(Boolean)
      .forEach((p) => parts.push(para(p)));
  });

  if (footNote) {
    parts.push(para(''));
    parts.push(para(footNote, 'Subtitle'));
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${parts.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`;
};

/** Assemble the .docx and return it as a Blob. */
export const buildDocxBlob = async (report) => {
  const zip = new JSZip();
  // The mimetype-style ordering does not matter for OOXML, but the parts do.
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.folder('_rels').file('.rels', ROOT_RELS);
  const word = zip.folder('word');
  word.file('document.xml', buildDocumentXml(report));
  word.file('styles.xml', STYLES);
  word.folder('_rels').file('document.xml.rels', DOC_RELS);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
};

/** A safe, recognisable file name from the report title. */
export const docxFileName = (title) => {
  const base = String(title || 'technical-report')
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 60) || 'technical-report';
  return `${base}-${new Date().toISOString().slice(0, 10)}.docx`;
};
