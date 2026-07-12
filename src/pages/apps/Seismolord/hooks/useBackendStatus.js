// Edge-function connectivity indicator for the status bar (replaces the
// old full-width "Backend connectivity" card).

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

export default function useBackendStatus() {
  const [state, setState] = useState('checking'); // 'checking'|'ok'|'error'
  const [detail, setDetail] = useState(null);     // ping result or error text

  const check = useCallback(async () => {
    setState('checking');
    setDetail(null);
    try {
      const { data, error } = await supabase.functions.invoke('seismolord-engine', {
        body: { action: 'ping' },
      });
      if (error) throw error;
      setState(data?.status === 'ok' ? 'ok' : 'error');
      setDetail(JSON.stringify(data));
    } catch (e) {
      setState('error');
      setDetail(e.message || 'Backend check failed');
    }
  }, []);

  useEffect(() => { check(); }, [check]);

  return { state, detail, check };
}
