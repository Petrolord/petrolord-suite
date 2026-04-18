import React, { useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, FileText, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Progress } from '@/components/ui/progress';

export default function BulkImportEmployees() {
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
          const { data: orgUser } = await supabase.from('organization_users').select('organization_id').eq('user_id', user.id).single();
          
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
    <div className="p-6 md:p-8 bg-slate-950 min-h-screen text-white space-y-6">
      <div className="flex justify-between items-center">
        <div>
            <h1 className="text-3xl font-bold flex items-center gap-2"><Upload className="w-8 h-8 text-green-400"/> Bulk Import Employees</h1>
            <p className="text-slate-400">Add multiple team members at once via CSV.</p>
        </div>
        <Button variant="outline" onClick={downloadTemplate}><FileText className="w-4 h-4 mr-2"/> Download Template</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
                <CardTitle>Upload CSV</CardTitle>
                <CardDescription>Select a .csv file containing employee details.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="border-2 border-dashed border-slate-700 rounded-lg p-8 flex flex-col items-center justify-center text-slate-400 hover:border-slate-500 hover:text-slate-300 transition-colors cursor-pointer relative">
                    <input type="file" accept=".csv" onChange={handleFileChange} className="absolute inset-0 opacity-0 cursor-pointer" />
                    <Upload className="w-10 h-10 mb-2" />
                    <p>{file ? file.name : "Click or drag file here"}</p>
                </div>
                <Button className="w-full bg-blue-600 text-white" disabled={!file || uploading} onClick={startImport}>
                    {uploading ? <RefreshCw className="w-4 h-4 animate-spin mr-2"/> : "Start Import"}
                </Button>
            </CardContent>
        </Card>

        {jobStatus && (
            <Card className="bg-slate-900 border-slate-800">
                <CardHeader>
                    <CardTitle>Import Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                            <span>Progress</span>
                            <span>{progress}%</span>
                        </div>
                        <Progress value={progress} className="h-2" />
                    </div>

                    {results && (
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-green-900/20 p-4 rounded border border-green-900/50">
                                <p className="text-green-400 text-xs uppercase">Success</p>
                                <p className="text-2xl font-bold text-green-300">{results.processed}</p>
                            </div>
                            <div className="bg-red-900/20 p-4 rounded border border-red-900/50">
                                <p className="text-red-400 text-xs uppercase">Failed</p>
                                <p className="text-2xl font-bold text-red-300">{results.failed}</p>
                            </div>
                        </div>
                    )}

                    {results?.errors?.length > 0 && (
                        <div className="bg-slate-950 p-4 rounded border border-slate-800 max-h-48 overflow-auto">
                            <p className="text-red-400 text-sm font-bold mb-2">Errors:</p>
                            <ul className="text-xs text-red-300 space-y-1">
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
    </div>
  );
}