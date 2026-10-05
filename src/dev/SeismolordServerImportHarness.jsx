// Dev-only page (/dev/seismolord-server-import; QI programme Q0): the real
// Seismolord import dialog and the Jobs dock against the REAL Supabase project,
// the qi-upload-url function and the seismic worker. Used to walk the server
// import end to end with the QA account (qa-seismic@petrolord.com). Signs in
// with email and password; nothing here bypasses RLS. Not in production
// builds (App.jsx mounts /dev routes only when import.meta.env.DEV).
import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import ImportPanel from '@/pages/apps/Seismolord/components/ImportPanel';
import ServerJobsPanel from '@/pages/apps/Seismolord/components/workspace/ServerJobsPanel';

export default function SeismolordServerImportHarness() {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [jobsKey, setJobsKey] = useState(0);
  const [opened, setOpened] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data?.user || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user || null));
    return () => sub?.subscription?.unsubscribe();
  }, []);

  if (!user) {
    return (
      <form
        className="max-w-sm mx-auto mt-16 space-y-3 p-6 rounded-lg border border-pl-border bg-pl-surface text-pl-text"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          const { error: err } = await supabase.auth.signInWithPassword({ email, password });
          if (err) setError(err.message);
        }}
      >
        <h1 className="text-lg font-semibold">Server import harness</h1>
        <label className="block text-sm">Email
          <input className="mt-1 w-full rounded border border-pl-border bg-pl-sunken px-2 py-1" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block text-sm">Password
          <input type="password" className="mt-1 w-full rounded border border-pl-border bg-pl-sunken px-2 py-1" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="text-sm text-pl-danger-text" role="alert">{error}</p>}
        <button type="submit" className="px-3 py-1.5 rounded bg-pl-primary text-pl-primary-fg">Sign in</button>
      </form>
    );
  }

  return (
    <div className="min-h-screen bg-pl-bg text-pl-text flex">
      <div className="flex-1 min-w-0 p-4 overflow-y-auto">
        <p className="text-xs text-pl-muted mb-2" data-testid="harness-user">Signed in as {user.email}</p>
        <ImportPanel
          onServerImportStarted={() => setJobsKey((k) => k + 1)}
          onIngested={() => setJobsKey((k) => k + 1)}
        />
        {opened && <p className="mt-2 text-sm" data-testid="harness-opened">Open requested for volume {opened}</p>}
      </div>
      <div className="w-80 shrink-0 border-l border-pl-border bg-pl-surface">
        <ServerJobsPanel visible refreshKey={jobsKey} onOpenVolume={setOpened} />
      </div>
    </div>
  );
}
