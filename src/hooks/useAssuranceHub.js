import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { HUB_APP_KEYS } from '@/lib/assuranceHub';

/**
 * AS11 — the hub's one read path. It never writes.
 *
 * Replaces `useAssuranceAnalytics`, which read three of the nine apps
 * with no org filter (so a super admin's hub summed every organization)
 * and polled all three every thirty seconds whether anyone was looking
 * or not.
 *
 * Each app is fetched on its own and fails on its own. An app whose
 * migration is not applied yet reports UNAVAILABLE and the hub says so
 * for that app; it does not take the other eight down with it, and it
 * is never shown as zero. The queries are the ones each app's own hook
 * issues, scoped by `org_id` the same way, so the hub reads what the
 * app reads.
 */

export const APP_STATE = Object.freeze({
  OK: 'ok',
  UNAVAILABLE: 'unavailable',
  ERROR: 'error',
});

/** The codes a missing table or column comes back with. */
const MISSING_SCHEMA_CODES = new Set(['42P01', '42703', 'PGRST200', 'PGRST204', 'PGRST205']);

class SchemaMissing extends Error {}

const unwrap = (res) => {
  if (res.error) {
    if (MISSING_SCHEMA_CODES.has(res.error.code)) throw new SchemaMissing(res.error.message);
    throw new Error(res.error.message || 'Query failed');
  }
  return res.data || [];
};

const byOrg = async (table, orgId) =>
  unwrap(await supabase.from(table).select('*').eq('org_id', orgId));

/** Child rows by parent id, in chunks so a long id list stays under URL limits. */
const byParent = async (table, column, ids) => {
  if (!ids.length) return [];
  const CHUNK = 200;
  const out = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    out.push(...unwrap(await supabase.from(table).select('*').in(column, ids.slice(i, i + CHUNK))));
  }
  return out;
};

const ids = (rows) => rows.map((r) => r.id);

const FETCHERS = Object.freeze({
  risk: async (org) => ({ risks: await byOrg('risk_register', org) }),
  regulatory: async (org) => ({ obligations: await byOrg('regulatory_obligations', org) }),
  documents: async (org) => ({ documents: await byOrg('documents', org) }),
  peerReview: async (org) => {
    const reviews = await byOrg('peer_reviews', org);
    return { reviews, comments: await byParent('peer_review_comments', 'review_id', ids(reviews)) };
  },
  moc: async (org) => {
    const records = await byOrg('moc_records', org);
    return { records, actions: await byParent('moc_actions', 'moc_id', ids(records)) };
  },
  quality: async (org) => {
    const [plans, ncrs] = await Promise.all([byOrg('qa_plans', org), byOrg('qa_ncrs', org)]);
    const [checkpoints, capas] = await Promise.all([
      byParent('qa_checkpoints', 'plan_id', ids(plans)),
      byParent('qa_capas', 'ncr_id', ids(ncrs)),
    ]);
    return { plans, checkpoints, ncrs, capas };
  },
  iso: async (org) => {
    const [standards, clauses, audits, findings] = await Promise.all([
      byOrg('iso_standards', org), byOrg('iso_clauses', org),
      byOrg('iso_audits', org), byOrg('iso_findings', org),
    ]);
    const [auditClauses, actions] = await Promise.all([
      byParent('iso_audit_clauses', 'audit_id', ids(audits)),
      byParent('iso_actions', 'finding_id', ids(findings)),
    ]);
    return { standards, clauses, audits, findings, actions, auditClauses };
  },
  lessons: async (org) => {
    const lessons = await byOrg('lesson_records', org);
    return { lessons, applications: await byParent('lesson_applications', 'lesson_id', ids(lessons)) };
  },
  audits: async (org) => {
    const [programmes, templates, audits, findings] = await Promise.all([
      byOrg('audit_programmes', org), byOrg('audit_templates', org),
      byOrg('audit_records', org), byOrg('audit_findings', org),
    ]);
    const [responses, actions] = await Promise.all([
      byParent('audit_responses', 'audit_id', ids(audits)),
      byParent('audit_actions', 'finding_id', ids(findings)),
    ]);
    return { programmes, templates, audits, responses, findings, actions };
  },
});

/** Fetch one app, reporting its state rather than throwing. Exported for tests. */
export const fetchApp = async (key, orgId) => {
  try {
    return { state: APP_STATE.OK, rows: await FETCHERS[key](orgId), message: null };
  } catch (e) {
    if (e instanceof SchemaMissing) {
      return { state: APP_STATE.UNAVAILABLE, rows: null, message: e.message };
    }
    return { state: APP_STATE.ERROR, rows: null, message: e.message };
  }
};

export const HUB_FETCHER_KEYS = Object.freeze(Object.keys(FETCHERS));

export function useAssuranceHub() {
  const { organization } = useAuth();
  const orgId = organization?.id || null;

  const [data, setData] = useState({});
  const [states, setStates] = useState({});
  const [messages, setMessages] = useState({});
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const refresh = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const results = await Promise.all(HUB_APP_KEYS.map((k) => fetchApp(k, orgId)));
    const nextData = {};
    const nextStates = {};
    const nextMessages = {};
    HUB_APP_KEYS.forEach((k, i) => {
      nextData[k] = results[i].rows;
      nextStates[k] = results[i].state;
      nextMessages[k] = results[i].message;
    });
    setData(nextData);
    setStates(nextStates);
    setMessages(nextMessages);
    setLastUpdated(new Date());
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, states, messages, loading, refresh, lastUpdated, orgId };
}
