// Signature and Certificate of Export lines shown after an export or a
// backup (Project Portability PP5). Pure presentation: the caller passes the
// requestSignature() result.

import React from 'react';
import { signingNote } from '@/lib/portability/signClient';

export default function SigningSummary({ result, idSuffix = '' }) {
  if (!result) return null;
  const cert = result.signature ? result.certificate : null;
  return (
    <div className="space-y-1">
      <div className={result.signature ? 'text-emerald-300/90' : 'text-slate-400'} data-testid={`pld-signing-note${idSuffix}`}>
        {signingNote(result)}
      </div>
      {cert ? (
        <div className="text-slate-300 space-y-0.5">
          <div>
            Certificate of Export <span className="font-mono">{cert.certificate_no}</span>
            {cert.download_url ? (
              <>
                {' '}
                <a href={cert.download_url} target="_blank" rel="noreferrer" className="text-cyan-300 underline" data-testid={`pld-certificate-link${idSuffix}`}>Download certificate</a>
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
