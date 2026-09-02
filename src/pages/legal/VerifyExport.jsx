// Public verification of a Certificate of Export (Project Portability PP5),
// a sibling of VerifyDeletion: the certificate number and verification
// code go to the pld-sign edge function, which returns the recorded facts.

import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { BadgeCheck, ShieldX, Loader2, ArrowLeft, Download } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const Row = ({ label, value, mono }) => (
  <div className="flex justify-between gap-4 py-1.5 border-b border-slate-800 last:border-0">
    <span className="text-slate-400">{label}</span>
    <span className={`text-right ${mono ? 'font-mono text-xs break-all' : ''}`}>{value ?? 'none'}</span>
  </div>
);

export default function VerifyExport() {
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
      <div className="min-h-screen bg-slate-900 text-slate-200 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto space-y-6">
          <Button asChild variant="outline" className="border-slate-700 text-slate-200">
            <Link to="/"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Home</Link>
          </Button>
          <Card className="bg-slate-950 border-slate-800">
            <CardHeader>
              <CardTitle className="text-lime-300">Verify a Certificate of Export</CardTitle>
              <CardDescription className="text-slate-400">
                A Certificate of Export is issued when a Petrolord Project Package is signed at export. Enter its number and the verification code issued with it to confirm the recorded facts.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={verify} className="space-y-3">
                <Input value={certificateNo} onChange={(e) => setCertificateNo(e.target.value)} placeholder="PLD-EX-2026-XXXXXXXX" className="font-mono bg-slate-900 border-slate-700" data-testid="verify-export-no" />
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="verification code" className="font-mono bg-slate-900 border-slate-700" data-testid="verify-export-code" />
                <Button type="submit" disabled={busy || !certificateNo || !code} className="bg-lime-500 text-slate-900 hover:bg-lime-400" data-testid="verify-export-run">
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Verify
                </Button>
              </form>
              {error ? <p className="mt-3 text-sm text-red-400" data-testid="verify-export-error">{error}</p> : null}
            </CardContent>
          </Card>

          {result && !result.valid ? (
            <Card className="bg-slate-950 border-red-900/60" data-testid="verify-export-invalid">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-400"><ShieldX className="h-5 w-5" /> Not verified</CardTitle>
                <CardDescription className="text-slate-400">No certificate matches that number and code. Check both and try again.</CardDescription>
              </CardHeader>
            </Card>
          ) : null}

          {c ? (
            <Card className="bg-slate-950 border-green-900/60" data-testid="verify-export-valid">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-400"><BadgeCheck className="h-5 w-5" /> Verified</CardTitle>
                <CardDescription className="text-slate-400">Petrolord recorded this export with the facts below.</CardDescription>
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
                  <Button asChild variant="outline" className="mt-4 border-slate-700">
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
