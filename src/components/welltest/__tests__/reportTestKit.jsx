// Shared kit for the report tests (tester round 2): mounts the real studio
// provider, hands back its live context value, and reads a built PDF back
// with poppler. The PDF tests therefore run the same state the screen has.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { WellTestStudioProvider, useWellTestStudio } from '@/contexts/WellTestStudioContext';

// Mounted with createRoot, not Testing Library's render: the library unmounts
// everything it rendered after each test, and a studio shared by a describe
// block has to stay alive across its tests.
export function mountStudio() {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const ref = { current: null };
  const Probe = () => { ref.current = useWellTestStudio(); return null; };
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => { root.render(<WellTestStudioProvider><Probe /></WellTestStudioProvider>); });
  return {
    get ctx() { return ref.current; },
    act: async (fn) => { await act(async () => { await fn(ref.current); }); },
    unmount: () => { act(() => root.unmount()); host.remove(); },
  };
}

// Reading a PDF back is the shared Report Kit's test side now (it was taken
// from this file); the names this studio's tests import stay.
export { chartLogo, readPdf, pageInk } from '@/lib/reportKit/testKit';
