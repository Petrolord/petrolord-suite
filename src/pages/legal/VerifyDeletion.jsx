import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, BadgeCheck, Download, Loader2, ShieldX } from 'lucide-react';

// Public verifier for Certificates of Data Deletion. Anyone holding a
// certificate number and its verification code can confirm the attested
// facts directly against the platform's deletion records.
export default function VerifyDeletion() {
  const [certNo, setCertNo] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);   // { valid, certificate?, download_url?, error? }

  const verify = async () => {
    setBusy(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('org-offboard', {
        body: {
          action: 'verify_certificate',
          certificate_no: certNo,
          verification_code: code,
          download: true,
        },
      });
      if (data) setResult(data);
      else setResult({ valid: false, error: error?.message || 'Verification failed. Try again.' });
    } catch (e) {
      setResult({ valid: false, error: e.message });
    } finally {
      setBusy(false);
    }
  };

  const cert = result?.certificate;

  return (
    <>
      <Helmet>
        <title>Verify a Deletion Certificate - Petrolord</title>
        <meta name="description" content="Verify a Petrolord Certificate of Data Deletion against the platform's deletion records." />
      </Helmet>
      <div className="min-h-screen bg-slate-900 text-slate-200 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto space-y-6">
          <Button asChild variant="outline" className="bg-slate-800 border-slate-700 hover:bg-slate-700">
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Home
            </Link>
          </Button>

          <Card className="bg-slate-800/50 border-slate-700 shadow-lg">
            <CardHeader>
              <CardTitle className="text-2xl font-bold text-lime-300">Verify a Certificate of Data Deletion</CardTitle>
              <CardDescription className="text-slate-400">
                Enter the certificate number and verification code printed on the certificate.
                The check reads the deletion record directly from our systems, so a successful
                result confirms the certificate independently of the document itself.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm text-slate-300 mb-1">Certificate number</label>
                <Input
                  value={certNo}
                  onChange={(e) => setCertNo(e.target.value)}
                  placeholder="PLD-DC-2026-XXXXXXXX"
                  className="bg-slate-950 border-slate-700 font-mono"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">Verification code</label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="00000000-0000-0000-0000-000000000000"
                  className="bg-slate-950 border-slate-700 font-mono"
                />
              </div>
              <Button
                onClick={verify}
                disabled={busy || !certNo.trim() || !code.trim()}
                className="bg-lime-600 hover:bg-lime-700 text-white"
              >
                {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <BadgeCheck className="w-4 h-4 mr-2" />}
                Verify
              </Button>
            </CardContent>
          </Card>

          {result && (result.valid ? (
            <Card className="bg-slate-800/50 border-green-800 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl text-green-400">
                  <BadgeCheck className="w-6 h-6" /> Certificate verified
                </CardTitle>
                <CardDescription className="text-slate-400">
                  The following facts are confirmed against Petrolord&apos;s deletion records.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Certificate number" value={cert.certificate_no} mono />
                <Row label="Organization" value={cert.organization_name} />
                <Row label="Closure requested on" value={(cert.requested_at || '').slice(0, 10)} />
                <Row label="Deletion completed on" value={(cert.purged_at || '').slice(0, 10)} />
                <Row label="Database records deleted" value={String(cert.summary.totalRows)} />
                <Row label="Stored files removed" value={String(cert.summary.objectsRemoved)} />
                <Row label="Member accounts deleted" value={String(cert.summary.accountsDeleted)} />
                <Row label="Records detached, not deleted" value={String(cert.summary.rowsUnshared)} />
                {result.download_url && (
                  <div className="pt-3">
                    <Button asChild variant="outline" className="border-slate-600 text-slate-200 hover:bg-slate-800">
                      <a href={result.download_url} target="_blank" rel="noopener noreferrer">
                        <Download className="w-4 h-4 mr-2" /> Download certificate PDF
                      </a>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-slate-800/50 border-red-900 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl text-red-400">
                  <ShieldX className="w-6 h-6" /> Not verified
                </CardTitle>
                <CardDescription className="text-slate-400">
                  {result.error || 'No deletion record matches that certificate number and verification code.'}
                  {' '}Check both values for typos. If you believe this is wrong, contact support@petrolord.com.
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}

function Row({ label, value, mono = false }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-700/60 pb-1">
      <span className="text-slate-400">{label}</span>
      <span className={`text-slate-100 text-right ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
