// The browser's connectivity as React state (replaces the retired mock
// useOfflineMode). navigator.onLine is a hint: a captive portal says
// online, and a failing fetch is the real signal; the sync engine treats
// both.
import { useEffect, useState } from 'react';

export function readOnline() { return typeof navigator === 'undefined' ? true : navigator.onLine !== false; }

export function useOnlineStatus() {
  const [online, setOnline] = useState(readOnline);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return online;
}
