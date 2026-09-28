// Public verification of a Certificate of Export (Project Portability PP5),
// a sibling of VerifyDeletion: the certificate number and verification
// code go to the pld-sign edge function, which returns the recorded facts.

import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { PublicPage } from '@/components/public/PublicPage';
import { Link } from 'react-router-dom';
import { BadgeCheck, ShieldX, Loader2, ArrowLeft, Download } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const Row = ({ label, value, mono }) => (
  <div className="flex justify-between gap-4 py-1.5 border-b border-pl-border last:border-0">
    <span className="text-pl-muted">{label}</span>
    <span className={`text-right ${mono ? 'font-pl-mono text-xs break-all' : ''}`}>{value ?? 'none'}</span>
  </div>
);

function VerifyExport() {
  const [certificateNo, setCertificateNo] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const verify = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null); setResult(null);
    try {
      const { data, error: err } = await supabase.functions.invoke('pld-sign', {
        body: { action: 'verify_certificate', certificate_no: certificateNo.trim(), verification_code: code.trim(), download: true },
      });
      if (err) throw err;
      setResult(data);
    } catch (err) {
      setError(err?.message || 'The verification service did not respond.');
    } finally {
      setBusy(false);
    }
  };

  const c = result?.certificate;
  return (
    <>
      <Helmet>
        <title>Verify a Certificate of Export - Petrolord</title>
        <meta name="description" content="Confirm a Petrolord Certificate of Export by its number and verification code." />
      </Helmet>
      <div className="py-10 px-4 sm:px-6 sm:py-12 lg:px-8">
        <div className="max-w-2xl mx-auto space-y-6">
          <Button asChild variant="outline">
            <Link to="/"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Home</Link>
          </Button>
          <Card className="bg-pl-raised">
            <CardHeader>
              <CardTitle className="font-pl-display text-3xl font-semibold text-pl-text">Verify a Certificate of Export</CardTitle>
              <CardDescription className="text-pl-muted">
                A Certificate of Export is issued when a Petrolord Project Package is signed at export. Enter its number and the verification code issued with it to confirm the recorded facts.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={verify} className="space-y-3">
                <Input value={certificateNo} onChange={(e) => setCertificateNo(e.target.value)} placeholder="PLD-EX-2026-XXXXXXXX" className="font-pl-mono" data-testid="verify-export-no" />
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="verification code" className="font-pl-mono" data-testid="verify-export-code" />
                <Button type="submit" disabled={busy || !certificateNo || !code} data-testid="verify-export-run">
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Verify
                </Button>
              </form>
              {error ? <p className="mt-3 text-sm text-pl-danger-text" data-testid="verify-export-error">{error}</p> : null}
            </CardContent>
          </Card>

          {result && !result.valid ? (
            <Card className="bg-pl-danger-bg border-pl-danger/40" data-testid="verify-export-invalid">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-pl-danger-text"><ShieldX className="h-5 w-5" /> Not verified</CardTitle>
                <CardDescription className="text-pl-muted">No certificate matches that number and code. Check both and try again.</CardDescription>
              </CardHeader>
            </Card>
          ) : null}

          {c ? (
            <Card className="bg-pl-success-bg border-pl-success/40" data-testid="verify-export-valid">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-pl-success-text"><BadgeCheck className="h-5 w-5" /> Verified</CardTitle>
                <CardDescription className="text-pl-muted">Petrolord recorded this export with the facts below.</CardDescription>
              </CardHeader>
              <CardContent className="text-sm">
                <Row label="Certificate" value={c.certificate_no} mono />
                <Row label="Package" value={c.package_name || '(unnamed)'} />
                <Row label="Package id" value={c.package_id} mono />
                <Row label="Exported at (UTC)" value={c.exported_at} />
                <Row label="Exported by" value={c.exporter_email || '(account)'} />
                <Row label="Organization" value={c.organization_name || 'private account'} />
                <Row label="Platform build" value={c.platform_sha || 'unknown'} />
                <Row label="Manifest SHA-256" value={c.manifest_digest} mono />
                <Row label="Signing key" value={c.signature_key_id || 'unsigned'} />
                <Row label="Rows" value={String(c.rows_total)} />
                <Row label="Binary files" value={String(c.blobs)} />
                <Row label="Parts" value={String(c.parts)} />
                {result.download_url ? (
                  <Button asChild variant="outline" className="mt-4">
                    <a href={result.download_url} target="_blank" rel="noreferrer"><Download className="mr-2 h-4 w-4" /> Download the certificate PDF</a>
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

// Batch 7C: the page wraps itself in the public frame (light, brand bar).
const VerifyExportPage = () => (
  <PublicPage testId="verify-export-theme-scope">
    <VerifyExport />
  </PublicPage>
);

export default VerifyExportPage;
