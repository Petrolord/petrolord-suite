import React, { useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { getUserOrgRow } from '@/lib/orgContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, FileText, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Progress } from '@/components/ui/progress';
import { AccountScope, AccountPage, AccountHeader } from '@/components/account/accountChrome';

function BulkImportEmployeesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null); // pending, processing, completed, failed
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState(null);

  const handleFileChange = (e) => {
      setFile(e.target.files[0]);
      setResults(null);
      setJobStatus(null);
      setProgress(0);
  };

  const startImport = async () => {
      if (!file) return;
      setUploading(true);
      
      try {
          const text = await file.text();
          const orgUser = await getUserOrgRow(user.id);
          
          // Create Job Record first
          const { data: job, error: jobError } = await supabase.from('bulk_import_jobs').insert({
              organization_id: orgUser.organization_id,
              status: 'pending',
              total_rows: text.split('\n').length - 1, // rough estimate
              file_url: file.name, // storing name for now
              created_by: user.id
          }).select().single();

          if (jobError) throw jobError;
          setJobId(job.id);
          setJobStatus('processing');

          // Trigger Edge Function
          const { data: result, error: funcError } = await supabase.functions.invoke('bulk-import-employees', {
              body: {
                  organization_id: orgUser.organization_id,
                  csv_content: text,
                  job_id: job.id
              }
          });

          if (funcError) throw funcError;

          setResults(result);
          setJobStatus(result.failed > 0 ? 'completed_with_errors' : 'completed');
          setProgress(100);
          toast({ title: "Import Completed", description: `Processed ${result.processed} rows.` });

      } catch (e) {
          console.error(e);
          setJobStatus('failed');
          toast({ title: "Import Failed", description: e.message, variant: "destructive" });
      } finally {
          setUploading(false);
      }
  };

  const downloadTemplate = () => {
      const csvContent = "email,full_name,role,team\njohn@example.com,John Doe,member,Drilling\njane@example.com,Jane Smith,admin,Reservoir";
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = "employee_import_template.csv";
      a.click();
  };

  return (
    <AccountPage>
      <AccountHeader
        eyebrow="Administration"
        icon={Upload}
        title="Bulk Import Employees"
        description="Add multiple team members at once via CSV."
        actions={<Button variant="outline" onClick={downloadTemplate}><FileText className="w-4 h-4 mr-2"/> Download Template</Button>}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
            <CardHeader>
                <CardTitle>Upload CSV</CardTitle>
                <CardDescription>Select a .csv file containing employee details.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="border-2 border-dashed border-pl-border-strong rounded-lg p-8 flex flex-col items-center justify-center text-pl-muted bg-pl-sunken/40 hover:border-pl-primary hover:text-pl-text transition-colors cursor-pointer relative">
                    <input type="file" accept=".csv" onChange={handleFileChange} className="absolute inset-0 opacity-0 cursor-pointer" />
                    <Upload className="w-10 h-10 mb-2" aria-hidden="true" />
                    <p className="break-all text-center">{file ? file.name : "Click or drag file here"}</p>
                </div>
                <Button className="w-full" disabled={!file || uploading} onClick={startImport}>
                    {uploading ? <RefreshCw className="w-4 h-4 animate-spin mr-2"/> : "Start Import"}
                </Button>
            </CardContent>
        </Card>

        {jobStatus && (
            <Card>
                <CardHeader>
                    <CardTitle>Import Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm text-pl-text">
                            <span>Progress</span>
                            <span className="font-pl-mono tabular-nums">{progress}%</span>
                        </div>
                        <Progress value={progress} className="h-2" />
                    </div>

                    {results && (
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-pl-success-bg p-4 rounded border border-pl-success/40">
                                <p className="text-pl-success-text text-xs uppercase flex items-center gap-1"><CheckCircle className="w-3 h-3" aria-hidden="true"/> Success</p>
                                <p className="text-2xl font-bold font-pl-mono tabular-nums text-pl-success-text">{results.processed}</p>
                            </div>
                            <div className="bg-pl-danger-bg p-4 rounded border border-pl-danger/40">
                                <p className="text-pl-danger-text text-xs uppercase flex items-center gap-1"><AlertTriangle className="w-3 h-3" aria-hidden="true"/> Failed</p>
                                <p className="text-2xl font-bold font-pl-mono tabular-nums text-pl-danger-text">{results.failed}</p>
                            </div>
                        </div>
                    )}

                    {results?.errors?.length > 0 && (
                        <div className="bg-pl-sunken p-4 rounded border border-pl-border max-h-48 overflow-auto">
                            <p className="text-pl-danger-text text-sm font-bold mb-2">Errors:</p>
                            <ul className="text-xs text-pl-danger-text space-y-1">
                                {results.errors.map((err, i) => (
                                    <li key={i}>Row {err.row}: {err.error}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </CardContent>
            </Card>
        )}
      </div>
    </AccountPage>
  );
}

export default function BulkImportEmployees() {
  return (
    <AccountScope testId="bulk-import-theme-scope">
      <BulkImportEmployeesPage />
    </AccountScope>
  );
}
