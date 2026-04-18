import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

export function useAssuranceAnalytics() {
  const [data, setData] = useState({
    risks: { open: 0, critical: 0, mitigated: 0, recent: [], bySeverity: [] },
    docs: { pending: 0, approved: 0, total: 0, recent: [], byStatus: [] },
    reviews: { active: 0, overdue: 0, completed: 0, recent: [], byStage: [] },
    timeline: [],
    raw: { risks: [], docs: [], reviews: [] }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const processTimeline = (risks, docs, reviews) => {
    const monthsMap = {};
    
    // Helper to add counts to monthsMap
    const addCount = (items, key) => {
      items.forEach(item => {
        if (!item.created_at) return;
        const date = new Date(item.created_at);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const monthLabel = date.toLocaleString('default', { month: 'short', year: '2-digit' });
        
        if (!monthsMap[monthKey]) {
          monthsMap[monthKey] = { sortKey: monthKey, name: monthLabel, Risks: 0, Documents: 0, Reviews: 0 };
        }
        monthsMap[monthKey][key] += 1;
      });
    };

    addCount(risks, 'Risks');
    addCount(docs, 'Documents');
    addCount(reviews, 'Reviews');

    return Object.values(monthsMap)
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .slice(-6); // Last 6 months
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // RLS automatically filters by organization_id
      const [risksRes, docsRes, reviewsRes] = await Promise.all([
        supabase.from('risk_register').select('*').order('created_at', { ascending: false }).limit(1000),
        supabase.from('documents').select('*').order('created_at', { ascending: false }).limit(1000),
        supabase.from('peer_reviews').select('*').order('created_at', { ascending: false }).limit(1000)
      ]);

      if (risksRes.error) throw risksRes.error;
      if (docsRes.error) throw docsRes.error;
      if (reviewsRes.error) throw reviewsRes.error;

      // Process Risks
      const risks = risksRes.data || [];
      const getSeverity = (r) => r.rating || (r.risk_score >= 15 ? 'Critical' : r.risk_score >= 10 ? 'High' : r.risk_score >= 5 ? 'Medium' : 'Low');
      
      const severityCounts = risks.reduce((acc, r) => {
        const sev = getSeverity(r);
        acc[sev] = (acc[sev] || 0) + 1;
        return acc;
      }, {});

      const riskStats = {
        open: risks.filter(r => ['Open', 'Identified', 'In Progress'].includes(r.status)).length,
        critical: risks.filter(r => getSeverity(r) === 'Critical').length,
        mitigated: risks.filter(r => ['Mitigated', 'Closed', 'Resolved'].includes(r.status)).length,
        recent: risks.slice(0, 5),
        bySeverity: Object.entries(severityCounts).map(([name, value]) => ({ name, value }))
      };

      // Process Docs
      const docs = docsRes.data || [];
      const statusCounts = docs.reduce((acc, d) => {
        const status = d.status || 'Draft';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {});

      const docStats = {
        pending: docs.filter(d => ['Draft', 'In Review', 'Pending'].includes(d.status)).length,
        approved: docs.filter(d => ['Approved', 'Published', 'Active'].includes(d.status)).length,
        total: docs.length,
        recent: docs.slice(0, 5),
        byStatus: Object.entries(statusCounts).map(([name, value]) => ({ name, value }))
      };

      // Process Reviews
      const reviews = reviewsRes.data || [];
      const stageCounts = reviews.reduce((acc, r) => {
        const stage = r.stage || 'Draft';
        acc[stage] = (acc[stage] || 0) + 1;
        return acc;
      }, {});

      const reviewStats = {
        active: reviews.filter(r => r.stage !== 'Closed' && r.stage !== 'Approved').length,
        completed: reviews.filter(r => ['Closed', 'Approved'].includes(r.stage)).length,
        overdue: reviews.filter(r => r.due_date && new Date(r.due_date) < new Date() && !['Closed', 'Approved'].includes(r.stage)).length,
        recent: reviews.slice(0, 5),
        byStage: Object.entries(stageCounts).map(([name, value]) => ({ name, value }))
      };

      // Process Timeline
      const timeline = processTimeline(risks, docs, reviews);

      setData({
        risks: riskStats,
        docs: docStats,
        reviews: reviewStats,
        timeline,
        raw: { risks, docs, reviews }
      });
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error fetching assurance analytics:', err);
      setError(err.message || 'Failed to fetch analytics data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // 30s auto-refresh
    return () => clearInterval(interval);
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData, lastUpdated };
}