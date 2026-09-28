// Signature and Certificate of Export lines shown after an export or a
// backup (Project Portability PP5). Pure presentation: the caller passes the
// requestSignature() result.

import React from 'react';
import { signingNote } from '@/lib/portability/signClient';
import { useThemeClass } from '@/design/themeClass';

// Design system (W0C): themed strings for tc(); outside an opted-in scope
// tc() returns the legacy string unchanged.
const THEMED_CLASSES = {
  'text-emerald-300/90': 'text-pl-success-text',
  'text-slate-400': 'text-pl-muted',
  'text-slate-300 space-y-0.5': 'text-pl-text space-y-0.5',
  'text-cyan-300 underline': 'text-pl-primary-text hover:text-pl-primary-text-hover underline',
};

export default function SigningSummary({ result, idSuffix = '' }) {
  const tc = useThemeClass(THEMED_CLASSES);
  if (!result) return null;
  const cert = result.signature ? result.certificate : null;
  return (
    <div className="space-y-1">
      <div className={tc(result.signature ? 'text-emerald-300/90' : 'text-slate-400')} data-testid={`pld-signing-note${idSuffix}`}>
        {signingNote(result)}
      </div>
      {cert ? (
        <div className="text-pl-text space-y-0.5">
          <div>
            Certificate of Export <span className="font-mono">{cert.certificate_no}</span>
            {cert.download_url ? (
              <>
                {' '}
                <a href={cert.download_url} target="_blank" rel="noreferrer" className="text-pl-primary-text hover:text-pl-primary-text-hover underline" data-testid={`pld-certificate-link${idSuffix}`}>Download certificate</a>
              </>
            ) : null}
          </div>
          {cert.verification_code ? (
            <div data-testid={`pld-verification-code${idSuffix}`}>
              Verification code <span className="font-mono">{cert.verification_code}</span>. Keep this code with the certificate; anyone can confirm the export at /legal/verify-export with the number and the code.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
