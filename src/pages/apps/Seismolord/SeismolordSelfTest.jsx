import React, { useEffect, useRef, useState } from 'react';
import { runViewerSelfTest } from './viewer/selfTest';

// Dev-only harness route (/dev/seismolord-selftest, registered only when
// import.meta.env.DEV): runs the deterministic viewer self-test so the
// Playwright suite can assert render correctness and record performance
// without needing an authenticated session or storage data.
export default function SeismolordSelfTest() {
  const canvasRef = useRef(null);
  const [status, setStatus] = useState('running');
  const [result, setResult] = useState(null);

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const r = await runViewerSelfTest(canvasRef.current);
        if (disposed) return;
        setResult(r);
        setStatus('done');
      } catch (e) {
        if (disposed) return;
        setResult({ error: e.message });
        setStatus('error');
      }
    })();
    return () => { disposed = true; };
  }, []);

  return (
    <div style={{ background: '#0b1220', minHeight: '100vh', color: '#cbd5e1', padding: 16 }}>
      <h1 style={{ fontSize: 18, marginBottom: 8 }}>Seismolord viewer self-test</h1>
      <canvas ref={canvasRef} width="400" height="400" style={{ border: '1px solid #334155' }} />
      <pre
        data-testid="selftest-result"
        data-selftest-status={status}
        style={{ fontSize: 11, whiteSpace: 'pre-wrap', marginTop: 12 }}
      >
        {result ? JSON.stringify(result, null, 2) : 'running…'}
      </pre>
    </div>
  );
}
