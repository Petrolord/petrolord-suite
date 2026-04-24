import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/hooks/use-toast';
import { exportReportData } from '../utils/reportExportUtils';

const RiskReportingContext = createContext();

export const useRiskReporting = () => useContext(RiskReportingContext);

export const RiskReportingProvider = ({ children }) => {
  const { user, organization } = useAuth();
  const { toast } = useToast();

  const [risks, setRisks] = useState([]);
  const [savedReports, setSavedReports] = useState([]);
  const [reportHistory, setReportHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeReport, setActiveReport] = useState(null); // null = list view, object = viewer/builder
  const [builderMode, setBuilderMode] = useState(false); // true = building, false = viewing

  // Initial Data Fetch
  const fetchData = useCallback(async () => {
    if (!organization?.id) return;
    setLoading(true);
    try {
      // Fetch Risks
      const { data: risksData, error: risksErr } = await supabase
        .from('risk_register')
        .select('*')
        .eq('org_id', organization.id);
      if (risksErr) throw risksErr;
      setRisks(risksData || []);

      // Fetch Saved Reports
      const { data: reportsData, error: reportsErr } = await supabase
        .from('saved_reports')
        .select('*')
        .eq('org_id', organization.id)
        .order('created_at', { ascending: false });
      if (reportsErr) throw reportsErr;
      setSavedReports(reportsData || []);

      // Mock Report History (could be a real table later)
      setReportHistory([
        { id: 'h1', name: 'Q2 Board Pack', date: new Date(Date.now() - 86400000 * 5).toISOString(), format: 'PDF', status: 'Generated' },
        { id: 'h2', name: 'HSE Monthly Review', date: new Date(Date.now() - 86400000 * 12).toISOString(), format: 'Excel', status: 'Generated' }
      ]);

    } catch (err) {
      console.error("Error fetching reporting data:", err);
      toast({ variant: "destructive", title: "Error loading data", description: err.message });
    } finally {
      setLoading(false);
    }
  }, [organization?.id, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Actions
  const openReportViewer = (config) => {
    setActiveReport(config);
    setBuilderMode(false);
  };

  const openReportBuilder = (config = null) => {
    setActiveReport(config || {
      name: 'New Custom Report',
      description: '',
      type: 'table',
      columns: ['risk_id', 'title', 'status', 'risk_score'],
      filters: [],
      grouping: null
    });
    setBuilderMode(true);
  };

  const closeReport = () => {
    setActiveReport(null);
    setBuilderMode(false);
  };

  const saveReport = async (config) => {
    try {
      setLoading(true);
      const payload = {
        org_id: organization.id,
        name: config.name,
        type: config.type || 'custom',
        config: config,
        created_by: user.id
      };

      let result;
      if (config.id) {
        // Update
        const { data, error } = await supabase.from('saved_reports').update(payload).eq('id', config.id).select().single();
        if (error) throw error;
        result = data;
        setSavedReports(prev => prev.map(r => r.id === data.id ? data : r));
        toast({ title: "Report Updated", description: "Changes saved successfully." });
      } else {
        // Insert
        const { data, error } = await supabase.from('saved_reports').insert([payload]).select().single();
        if (error) throw error;
        result = data;
        setSavedReports([data, ...savedReports]);
        toast({ title: "Report Saved", description: "New report added to your library." });
      }
      return result;
    } catch (err) {
      toast({ variant: "destructive", title: "Save Failed", description: err.message });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const deleteReport = async (id) => {
    try {
      setLoading(true);
      const { error } = await supabase.from('saved_reports').delete().eq('id', id);
      if (error) throw error;
      setSavedReports(prev => prev.filter(r => r.id !== id));
      toast({ title: "Report Deleted", description: "Report has been removed." });
      if (activeReport?.id === id) closeReport();
    } catch (err) {
      toast({ variant: "destructive", title: "Delete Failed", description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const duplicateReport = async (report) => {
    const duplicatedConfig = { ...report.config, name: `${report.name} (Copy)`, id: null };
    await saveReport(duplicatedConfig);
  };

  const exportReport = (data, columns, config, format) => {
    try {
      exportReportData(data, columns, config, format);
      toast({ title: "Export Successful", description: `Report exported as ${format.toUpperCase()}` });
      
      // Add to mock history
      setReportHistory(prev => [{
        id: `h${Date.now()}`,
        name: config.name,
        date: new Date().toISOString(),
        format: format.toUpperCase(),
        status: 'Generated'
      }, ...prev]);

    } catch (err) {
      toast({ variant: "destructive", title: "Export Failed", description: err.message });
    }
  };

  // Helper to process data based on config
  const getProcessedData = (config) => {
    if (!config) return [];
    let processed = [...risks];

    // Apply filters
    if (config.filters && config.filters.length > 0) {
      processed = processed.filter(risk => {
        return config.filters.every(f => {
          const val = risk[f.field];
          if (!val) return false;
          switch (f.operator) {
            case 'equals': return String(val).toLowerCase() === String(f.value).toLowerCase();
            case 'contains': return String(val).toLowerCase().includes(String(f.value).toLowerCase());
            case 'greater_than': return Number(val) > Number(f.value);
            case 'less_than': return Number(val) < Number(f.value);
            default: return true;
          }
        });
      });
    }

    // Apply sorting
    if (config.sortField) {
      processed.sort((a, b) => {
        const aVal = a[config.sortField];
        const bVal = b[config.sortField];
        if (aVal < bVal) return config.sortDir === 'asc' ? -1 : 1;
        if (aVal > bVal) return config.sortDir === 'asc' ? 1 : -1;
        return 0;
      });
    } else {
      // Default sort by score descending
      processed.sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0));
    }

    return processed;
  };

  // Pre-defined Templates
  const TEMPLATES = [
    { id: 't1', name: 'Executive Summary', icon: 'PieChart', desc: 'High-level overview of critical risks.', config: { name: 'Executive Summary', columns: ['risk_id', 'title', 'category', 'status', 'risk_score'], filters: [{ field: 'risk_score', operator: 'greater_than', value: 9 }] } },
    { id: 't2', name: 'Departmental Breakdown', icon: 'BarChart2', desc: 'Risk distribution across departments.', config: { name: 'Departmental Breakdown', columns: ['category', 'title', 'risk_score'], grouping: 'category' } },
    { id: 't3', name: 'Mitigation Progress', icon: 'FileText', desc: 'Status of active mitigation plans.', config: { name: 'Mitigation Progress', columns: ['risk_id', 'title', 'mitigation_summary', 'status'], filters: [{ field: 'status', operator: 'equals', value: 'Open' }] } },
    { id: 't4', name: 'HSE Incident Risks', icon: 'ShieldAlert', desc: 'Risks categorized under HSE.', config: { name: 'HSE Risks', columns: ['risk_id', 'title', 'likelihood', 'impact', 'risk_score'], filters: [{ field: 'category', operator: 'contains', value: 'HSE' }] } },
    { id: 't5', name: 'All Open Risks', icon: 'List', desc: 'Complete list of currently open risks.', config: { name: 'All Open Risks', columns: ['risk_id', 'title', 'category', 'owner_id', 'status'], filters: [{ field: 'status', operator: 'equals', value: 'Open' }] } },
    { id: 't6', name: 'Recently Closed', icon: 'CheckCircle', desc: 'Risks mitigated or closed recently.', config: { name: 'Closed Risks', columns: ['risk_id', 'title', 'mitigation_summary', 'updated_at'], filters: [{ field: 'status', operator: 'equals', value: 'Closed' }] } },
    { id: 't7', name: 'Financial Exposure', icon: 'DollarSign', desc: 'Risks impacting financial stability.', config: { name: 'Financial Risks', columns: ['risk_id', 'title', 'consequences', 'risk_score'], filters: [{ field: 'category', operator: 'contains', value: 'Financial' }] } },
    { id: 't8', name: 'Critical Watchlist', icon: 'AlertOctagon', desc: 'Risks with maximum score (15+).', config: { name: 'Critical Watchlist', columns: ['risk_id', 'title', 'category', 'root_cause', 'risk_score'], filters: [{ field: 'risk_score', operator: 'greater_than', value: 14 }] } },
    { id: 't9', name: 'Supply Chain Risks', icon: 'Truck', desc: 'Logistics and supply constraints.', config: { name: 'Supply Chain Risks', columns: ['risk_id', 'title', 'status', 'mitigation_summary'], filters: [{ field: 'category', operator: 'contains', value: 'Supply' }] } },
    { id: 't10', name: 'Quarterly Audit', icon: 'ClipboardList', desc: 'Full export for audit purposes.', config: { name: 'Quarterly Audit', columns: ['risk_id', 'title', 'category', 'likelihood', 'impact', 'risk_score', 'status', 'mitigation_summary'] } },
    { id: 't11', name: 'Owner Allocation', icon: 'Users', desc: 'Risks grouped by assigned owner.', config: { name: 'Owner Allocation', columns: ['owner_id', 'risk_id', 'title', 'status'], grouping: 'owner_id' } },
    { id: 't12', name: 'Drilling Hazards', icon: 'Target', desc: 'Specific subsurface/drilling risks.', config: { name: 'Drilling Hazards', columns: ['risk_id', 'title', 'root_cause', 'risk_score'], filters: [{ field: 'category', operator: 'contains', value: 'Drilling' }] } },
  ];

  return (
    <RiskReportingContext.Provider value={{
      risks,
      savedReports,
      reportHistory,
      loading,
      activeReport,
      builderMode,
      TEMPLATES,
      openReportViewer,
      openReportBuilder,
      closeReport,
      saveReport,
      deleteReport,
      duplicateReport,
      exportReport,
      getProcessedData,
      setLoading
    }}>
      {children}
    </RiskReportingContext.Provider>
  );
};