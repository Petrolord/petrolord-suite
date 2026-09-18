/**
 * AS13: the in-app help for the Assurance module, one guide per app and
 * one for the hub. Each guide was written against the code of its app
 * (not from memory, and not from the old guides), and corrected after the
 * AS13 repairs so every statement is true of the software it describes.
 * src/data/assuranceHelp/__tests__/assuranceHelp.test.js holds them to it.
 */
import hub from './hub';
import risk from './risk';
import regulatory from './regulatory';
import documents from './documents';
import peerReview from './peerReview';
import moc from './moc';
import quality from './quality';
import iso from './iso';
import lessons from './lessons';
import audits from './audits';

export const ASSURANCE_HELP = Object.freeze({
  hub, risk, regulatory, documents, peerReview, moc, quality, iso, lessons, audits,
});

export const ASSURANCE_HELP_KEYS = Object.freeze(Object.keys(ASSURANCE_HELP));
