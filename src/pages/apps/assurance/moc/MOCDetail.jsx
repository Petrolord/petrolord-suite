import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MOCPageShell } from './components/MOCPageShell';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { exportToCSV, exportToExcel, exportToPDF } from '@/utils/exportUtils';
import { 
  FileText, 
  Edit, 
  ShieldAlert, 
  CheckCircle, 
  Clock, 
  Users, 
  Activity, 
  Paperclip, 
  MessageSquare, 
  Plus, 
  CheckSquare,
  Printer,
  Download
} from 'lucide-react';

export default function MOCDetail() {
  const { id = 'MOC-2026-089' } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');

  const moc = {
    id: id,
    title: 'Upgrade Compressor C-101 Controls',
    stage: 'Review',
    type: 'Permanent',
    category: 'Facility / Hardware',
    risk: 'Medium',
    owner: 'James Smith',
    created: '2026-03-25',
    description: 'Upgrade the existing pneumatic control logic to electronic DCS integration for better reliability and monitoring.',
    justification: 'Current pneumatic systems are obsolete and causing unscheduled downtime. ROI calculated at 8 months due to reduced flaring.',
    facility: 'Platform Alpha',
    targetDate: '2026-05-15'
  };

  const handleExport = (type) => {
    const filename = `MOC-${moc.id}-${new Date().toISOString().split('T')[0]}`;
    // Export standard MOC array
    const exportData = [{
      ID: moc.id,
      Title: moc.title,
      Stage: moc.stage,
      Type: moc.type,
      Category: moc.category,
      Risk: moc.risk,
      Owner: moc.owner,
      Created: moc.created,
      TargetDate: moc.targetDate,
      Description: moc.description,
      Justification: moc.justification,
      Facility: moc.facility
    }];

    let success = false;
    if (type === 'csv') success = exportToCSV(exportData, filename);
    if (type === 'excel') success = exportToExcel(exportData, filename);
    if (type === 'pdf') success = exportToPDF(`MOC Detail: ${moc.id}`, exportData, filename);

    if (success) {
      toast({ title: 'Export Successful', description: `${filename}.${type} downloaded.` });
    } else {
      toast({ title: 'Export Failed', description: 'Failed to prepare MOC export.', variant: 'destructive' });
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const InfoItem = ({ label, value }) => (
    <div>
      <p className="text-xs text-[hsl(var(--muted-foreground))] mb-1">{label}</p>
      <p className="text-sm font-medium text-[hsl(var(--foreground))]">{value || '-'}</p>
    </div>
  );

  return (
    <MOCPageShell title={`${moc.id}: ${moc.title}`} description="MOC Details and Workflow">
      <div className="flex flex-col h-full space-y-6 pb-20 md:pb-0 animate-in fade-in duration-300 print-only" id="moc-printable-area">
        
        {/* Header Summary Card */}
        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-6 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-[hsl(var(--warning))] no-print"></div>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border border-[hsl(var(--warning))]/20">
                  {moc.stage} Stage
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] border border-[hsl(var(--border))]">
                  {moc.type}
                </span>
              </div>
              <h2 className="text-2xl font-bold text-[hsl(var(--foreground))]">{moc.title}</h2>
            </div>
            <div className="flex gap-2 no-print">
              <Button variant="outline" size="icon" className="bg-transparent border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary))]" onClick={handlePrint}>
                <Printer className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="bg-transparent border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary))]">
                    <Download className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-[hsl(var(--card))] border-[hsl(var(--border))] text-[hsl(var(--foreground))]">
                  <DropdownMenuItem onClick={() => handleExport('csv')}>Export as CSV</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport('excel')}>Export as Excel</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport('pdf')}>Export as PDF</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="outline" size="sm" className="bg-transparent border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary))] hidden sm:flex">
                <Edit className="w-4 h-4 mr-2" /> Edit
              </Button>
              <Button size="sm" className="btn-primary shadow-md shadow-[hsl(var(--primary))]/20" onClick={() => toast({description: "Moving to next stage..."})}>
                Submit for Approval
              </Button>
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6 pt-4 border-t border-[hsl(var(--border))]">
             <InfoItem label="Change Category" value={moc.category} />
             <InfoItem label="Facility/Asset" value={moc.facility} />
             <InfoItem label="Change Owner" value={moc.owner} />
             <InfoItem label="Target Date" value={moc.targetDate} />
             <div>
                <p className="text-xs text-[hsl(var(--muted-foreground))] mb-1">Risk Level</p>
                <span className="text-sm font-bold text-[hsl(var(--warning))] flex items-center">
                  <ShieldAlert className="w-4 h-4 mr-1" /> {moc.risk}
                </span>
             </div>
          </div>
        </div>

        {/* Tabbed Interface */}
        <div className="flex-1 flex flex-col min-h-0 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl shadow-sm overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col h-full">
            <div className="border-b border-[hsl(var(--border))] px-2 bg-[hsl(var(--secondary-background))]/50 overflow-x-auto hide-scrollbar no-print">
              <TabsList className="bg-transparent h-12 p-0 space-x-6 w-max">
                <TabsTrigger value="overview" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[hsl(var(--primary))] rounded-none h-full px-2 text-[hsl(var(--muted-foreground))] data-[state=active]:text-[hsl(var(--foreground))]">Overview</TabsTrigger>
                <TabsTrigger value="impacts" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[hsl(var(--primary))] rounded-none h-full px-2 text-[hsl(var(--muted-foreground))] data-[state=active]:text-[hsl(var(--foreground))]">Impacts & Risk</TabsTrigger>
                <TabsTrigger value="workflow" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[hsl(var(--primary))] rounded-none h-full px-2 text-[hsl(var(--muted-foreground))] data-[state=active]:text-[hsl(var(--foreground))]">Reviews & Approvals</TabsTrigger>
                <TabsTrigger value="actions" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[hsl(var(--primary))] rounded-none h-full px-2 text-[hsl(var(--muted-foreground))] data-[state=active]:text-[hsl(var(--foreground))]">Action Tracker (3)</TabsTrigger>
                <TabsTrigger value="documents" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[hsl(var(--primary))] rounded-none h-full px-2 text-[hsl(var(--muted-foreground))] data-[state=active]:text-[hsl(var(--foreground))]">Documents (2)</TabsTrigger>
              </TabsList>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 print-only">
              {/* Force all tabs to display in print mode using CSS classes */}
              <div className={activeTab === 'overview' ? 'block' : 'hidden print:block mb-8'}>
                <h3 className="text-xl font-bold mb-4 hidden print:block border-b border-[hsl(var(--border))] pb-2">Overview</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-sm font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-2">Current Situation</h3>
                      <p className="text-sm text-[hsl(var(--foreground))] leading-relaxed p-4 bg-[hsl(var(--secondary))] rounded-lg border border-[hsl(var(--border))]">
                        Pneumatic controllers on C-101 are 15 years old, prone to failure, and require manual daily adjustments. No remote monitoring is available.
                      </p>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-2">Proposed Change</h3>
                      <p className="text-sm text-[hsl(var(--foreground))] leading-relaxed p-4 bg-[hsl(var(--secondary))] rounded-lg border border-[hsl(var(--border))]">
                        {moc.description}
                      </p>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-2">Justification</h3>
                      <p className="text-sm text-[hsl(var(--foreground))] leading-relaxed p-4 bg-[hsl(var(--secondary))] rounded-lg border border-[hsl(var(--border))]">
                        {moc.justification}
                      </p>
                    </div>
                  </div>
                  <div>
                    <Card className="bg-[hsl(var(--secondary-background))] border-[hsl(var(--border))]">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center text-[hsl(var(--muted-foreground))]"><Activity className="w-4 h-4 mr-2" /> Recent Activity</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex gap-3 relative before:absolute before:left-2 before:top-6 before:bottom-[-16px] before:w-px before:bg-[hsl(var(--border))]">
                           <div className="w-4 h-4 rounded-full bg-[hsl(var(--primary))] flex-shrink-0 z-10 mt-1 ring-4 ring-[hsl(var(--card))]"></div>
                           <div>
                             <p className="text-sm font-medium text-[hsl(var(--foreground))]">Moved to Review Stage</p>
                             <p className="text-xs text-[hsl(var(--muted-foreground))]">By J. Smith • Today, 10:45 AM</p>
                           </div>
                        </div>
                        <div className="flex gap-3 relative before:absolute before:left-2 before:top-6 before:bottom-[-16px] before:w-px before:bg-[hsl(var(--border))]">
                           <div className="w-4 h-4 rounded-full bg-[hsl(var(--secondary))] border-2 border-[hsl(var(--border))] flex-shrink-0 z-10 mt-1 ring-4 ring-[hsl(var(--card))]"></div>
                           <div>
                             <p className="text-sm font-medium text-[hsl(var(--foreground))]">Document Attached: P&ID_Rev2.pdf</p>
                             <p className="text-xs text-[hsl(var(--muted-foreground))]">By J. Smith • Yesterday, 14:20 PM</p>
                           </div>
                        </div>
                        <div className="flex gap-3 relative">
                           <div className="w-4 h-4 rounded-full bg-[hsl(var(--secondary))] border-2 border-[hsl(var(--border))] flex-shrink-0 z-10 mt-1 ring-4 ring-[hsl(var(--card))]"></div>
                           <div>
                             <p className="text-sm font-medium text-[hsl(var(--foreground))]">MOC Created</p>
                             <p className="text-xs text-[hsl(var(--muted-foreground))]">By J. Smith • 2026-03-25</p>
                           </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>

              <div className={activeTab === 'impacts' ? 'block' : 'hidden print:block mb-8'}>
                 <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">Impact Assessment</h3>
                    <Button size="sm" variant="outline" className="border-[hsl(var(--border))] bg-transparent no-print"><Plus className="w-4 h-4 mr-2"/> Add Impact</Button>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))]">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-sm font-bold text-[hsl(var(--foreground))]">HSE Impact</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]">Low Risk</span>
                      </div>
                      <p className="text-xs text-[hsl(var(--muted-foreground))] mb-3">Hot work required during installation. Isolation and lock-out/tag-out procedures required.</p>
                      <p className="text-xs font-medium text-[hsl(var(--primary))]">Mitigation: Ensure permit to work system is strictly followed. Gas testing prior to work.</p>
                    </div>
                    <div className="p-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))]">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-sm font-bold text-[hsl(var(--foreground))]">Production Impact</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]">Medium Risk</span>
                      </div>
                      <p className="text-xs text-[hsl(var(--muted-foreground))] mb-3">Requires 12-hour shut-in of Train 1 for tie-in.</p>
                      <p className="text-xs font-medium text-[hsl(var(--primary))]">Mitigation: Schedule during planned maintenance window on May 15th.</p>
                    </div>
                 </div>
              </div>

              <div className={activeTab === 'workflow' ? 'block' : 'hidden print:block mb-8'}>
                 <h3 className="text-lg font-semibold text-[hsl(var(--foreground))] mb-4">Technical Reviews</h3>
                 <div className="data-grid-container mb-8 border border-[hsl(var(--border))] rounded-lg overflow-hidden">
                   <table className="data-grid-table w-full text-sm text-left">
                     <thead>
                       <tr className="bg-[hsl(var(--secondary))]">
                         <th className="data-grid-th p-3 font-semibold">Discipline</th>
                         <th className="data-grid-th p-3 font-semibold">Reviewer</th>
                         <th className="data-grid-th p-3 font-semibold">Status</th>
                         <th className="data-grid-th p-3 font-semibold">Date</th>
                         <th className="data-grid-th p-3 font-semibold w-24 no-print"></th>
                       </tr>
                     </thead>
                     <tbody>
                       <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]">
                         <td className="data-grid-td p-3">Process Engineering</td>
                         <td className="data-grid-td p-3">S. Miller</td>
                         <td className="data-grid-td p-3"><span className="text-xs text-[hsl(var(--success))] font-medium"><CheckCircle className="w-3 h-3 inline mr-1"/> Endorsed</span></td>
                         <td className="data-grid-td p-3 text-[hsl(var(--muted-foreground))] text-xs">Today</td>
                         <td className="data-grid-td p-3 no-print"><Button variant="ghost" size="sm" className="h-6 text-xs">View</Button></td>
                       </tr>
                       <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]">
                         <td className="data-grid-td p-3">Instrumentation</td>
                         <td className="data-grid-td p-3">D. Roberts</td>
                         <td className="data-grid-td p-3"><span className="text-xs text-[hsl(var(--warning))] font-medium"><Clock className="w-3 h-3 inline mr-1"/> Pending</span></td>
                         <td className="data-grid-td p-3 text-[hsl(var(--muted-foreground))] text-xs">-</td>
                         <td className="data-grid-td p-3 no-print"><Button variant="ghost" size="sm" className="h-6 text-xs">Remind</Button></td>
                       </tr>
                     </tbody>
                   </table>
                 </div>
              </div>

              <div className={activeTab === 'actions' ? 'block' : 'hidden print:block mb-8'}>
                 <h3 className="text-xl font-bold mb-4 hidden print:block border-b border-[hsl(var(--border))] pb-2">Action Tracker</h3>
                 <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-[hsl(var(--border))] rounded-xl">
                   <CheckSquare className="w-12 h-12 text-[hsl(var(--muted-foreground))] mb-4 opacity-50" />
                   <p className="text-[hsl(var(--foreground))] font-medium">Action Tracker</p>
                   <p className="text-[hsl(var(--muted-foreground))] text-sm mb-4">Manage pre and post implementation tasks.</p>
                   <Button className="bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--border))] no-print"><Plus className="w-4 h-4 mr-2"/> Add Action Item</Button>
                 </div>
              </div>

              <div className={activeTab === 'documents' ? 'block' : 'hidden print:block mb-8'}>
                <h3 className="text-xl font-bold mb-4 hidden print:block border-b border-[hsl(var(--border))] pb-2">Documents & Evidence</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] flex items-start gap-3 hover:border-[hsl(var(--primary))] transition-colors cursor-pointer">
                    <div className="p-2 bg-[hsl(var(--primary))]/10 rounded text-[hsl(var(--primary))]">
                      <FileText className="w-6 h-6" />
                    </div>
                    <div className="overflow-hidden">
                      <p className="text-sm font-medium text-[hsl(var(--foreground))] truncate">PID_Markup_v2.pdf</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">2.4 MB • Uploaded Yesterday</p>
                    </div>
                  </div>
                  <div className="p-4 rounded-lg border border-dashed border-[hsl(var(--border))] bg-transparent flex flex-col items-center justify-center text-center hover:bg-[hsl(var(--secondary))]/50 transition-colors cursor-pointer text-[hsl(var(--muted-foreground))] min-h-[80px] no-print" onClick={() => toast({description:"Upload dialog..."})}>
                    <Plus className="w-5 h-5 mb-1" />
                    <span className="text-xs font-medium">Upload Document</span>
                  </div>
                </div>
              </div>

            </div>
          </Tabs>
        </div>

      </div>
    </MOCPageShell>
  );
}