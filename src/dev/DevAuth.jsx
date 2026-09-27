// Dev-only: presents DEV_USER as the signed-in user to apps that read
// useAuth().user, on top of the real auth context (senior testing harnesses).
import React, { useContext, useMemo } from 'react';
import { AuthContext } from '@/contexts/SupabaseAuthContext';
import { DEV_USER } from './InMemorySupabase';

export default function DevAuth({ children, user = DEV_USER, organization }) {
  const real = useContext(AuthContext) || {};
  // organization is optional: org-scoped apps (Assurance) need one to save.
  const value = useMemo(() => ({
    ...real, user, session: { user, access_token: 'dev' }, loading: false,
    ...(organization ? { organization } : {}),
  }), [real, user, organization]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
