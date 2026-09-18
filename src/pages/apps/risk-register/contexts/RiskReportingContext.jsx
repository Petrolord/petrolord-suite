import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/hooks/use-toast';
import { exportReportData } from '../utils/reportExportUtils';
import {
  REPORT_TEMPLATES,
  processReport,
  reportConfigFromRow,
  storedConfig,
} from '../utils/reportConfig';

const RiskReportingContext = createContext();

/**
 * The one reporting state for the app. Outside the provider (the New,
 * Edit and Detail routes) it is undefined, and callers treat that as
 * "no report open". The shell used to import a second, standalone hook
 * of the same name whose closeReport acted on state nothing rendered.
 */
export const useRiskReporting = () => useContext(RiskReportingContext);

export const RiskReportingProvider = ({ children }) => {
  const { user, organization } = useAuth();
  const { toast } = useToast();

  const [risks, setRisks] = useState([]);
  const [savedReports, setSavedReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeReport, setActiveReport] = useState(null); // null = list view, object = viewer/builder
  const [builderMode, setBuilderMode] = useState(false); // true = building, false = viewing

  // AS13: an "Export History" list used to be seeded here with two
  // invented entries, "Q2 Board Pack" and "HSE Monthly Review", for every
  // organization. Exports are not recorded anywhere, so there is no
  // history to show and none is shown.
  const fetchData = useCallback(async () => {
    if (!organization?.id) return;
    setLoading(true);
    try {
      const { data: risksData, error: risksErr } = await supabase
        .from('risk_register')
        .select('*')
        .eq('org_id', organization.id);
      if (risksErr) throw risksErr;
      setRisks(risksData || []);

      const { data: reportsData, error: reportsErr } = await supabase
        .from('saved_reports')
        .select('*')
        .eq('org_id', organization.id)
        .order('created_at', { ascending: false });
      if (reportsErr) throw reportsErr;
      setSavedReports(reportsData || []);
    } catch (err) {
      toast({ variant: "destructive", title: "Error loading data", description: err.message });
    } finally {
      setLoading(false);
    }
  }, [organization?.id, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  /**
   * Insert or update, by whether the config carries a row id. Returns
   * the report as the builder and viewer use it (config plus row id), not
   * the database row: handing the row to the viewer is what made Save &
   * Generate show every risk with the default columns.
   */
  const saveReport = async (config) => {
    try {
      setLoading(true);
      const payload = {
        org_id: organization.id,
        name: config.name,
        type: config.type || 'custom',
        config: storedConfig(config),
        created_by: user.id
      };

      let data;
      if (config.id) {
        const res = await supabase.from('saved_reports').update(payload).eq('id', config.id).select().single();
        if (res.error) throw res.error;
        data = res.data;
        setSavedReports(prev => prev.map(r => r.id === data.id ? data : r));
        toast({ title: "Report updated", description: "Changes saved." });
      } else {
        const res = await supabase.from('saved_reports').insert([payload]).select().single();
        if (res.error) throw res.error;
        data = res.data;
        setSavedReports(prev => [data, ...prev]);
        toast({ title: "Report saved", description: "Added to My Saved Reports." });
      }
      return reportConfigFromRow(data);
    } catch (err) {
      toast({ variant: "destructive", title: "Save failed", description: err.message });
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
      toast({ title: "Report deleted", description: "Report has been removed." });
      if (activeReport?.id === id) closeReport();
    } catch (err) {
      toast({ variant: "destructive", title: "Delete failed", description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const duplicateReport = async (report) => {
    const config = reportConfigFromRow(report);
    await saveReport({ ...config, name: `${config.name} (Copy)`, id: null });
  };

  const exportReport = (data, columns, config, format) => {
    try {
      exportReportData(data, columns, config, format);
      if (format !== 'print') {
        toast({ title: "Exported", description: `Report exported as ${format.toUpperCase()}.` });
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Export failed", description: err.message });
    }
  };

  const getProcessedData = (config) => processReport(risks, config);

  return (
    <RiskReportingContext.Provider value={{
      risks,
      savedReports,
      loading,
      activeReport,
      builderMode,
      TEMPLATES: REPORT_TEMPLATES,
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
