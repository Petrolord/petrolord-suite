import React, { useState } from 'react';
import { 
  Waves, 
  UploadCloud, 
  Activity, 
  FileCheck, 
  Database, 
  HardDrive, 
  MonitorPlay,
  Search,
  Plus,
  Filter,
  MoreVertical,
  CheckCircle2,
  Clock,
  AlertCircle,
  Play,
  FileBox
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/use-toast';

// --- Sub-components for each module ---

const SurveyManager = () => (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-lg font-medium">Survey Manager</h3>
        <p className="text-sm text-slate-400">Manage your seismic surveys and metadata.</p>
      </div>
      <Button onClick={() => toast({ title: "🚧 Feature not implemented yet" })}>
        <Plus className="h-4 w-4 mr-2" /> New Survey
      </Button>
    </div>
    
    <div className="flex items-center space-x-2">
      <div className="relative flex-1">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
        <Input placeholder="Search surveys..." className="pl-8 bg-slate-900 border-slate-800" />
      </div>
      <Button variant="outline" size="icon" className="border-slate-800 bg-slate-900">
        <Filter className="h-4 w-4" />
      </Button>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <Card key={i} className="bg-slate-900 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-medium">Gulf of Mexico 3D - Block {i}</CardTitle>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-slate-400 space-y-2">
              <div className="flex justify-between">
                <span>Domain:</span> <span className="text-slate-200">Time</span>
              </div>
              <div className="flex justify-between">
                <span>Type:</span> <span className="text-slate-200">3D Pre-Stack</span>
              </div>
              <div className="flex justify-between">
                <span>Size:</span> <span className="text-slate-200">{150 * i} GB</span>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Badge variant="outline" className="bg-blue-900/20 text-blue-400 border-blue-800">Processed</Badge>
              <Badge variant="outline" className="bg-emerald-900/20 text-emerald-400 border-emerald-800">QC Passed</Badge>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  </div>
);

const SegyUpload = () => (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-lg font-medium">SEG-Y Upload</h3>
        <p className="text-sm text-slate-400">Upload and validate raw SEG-Y files for processing.</p>
      </div>
    </div>

    <Card className="bg-slate-900 border-slate-800 border-dashed border-2">
      <CardContent className="flex flex-col items-center justify-center h-64 space-y-4 text-center">
        <div className="h-16 w-16 bg-blue-900/20 text-blue-400 rounded-full flex items-center justify-center">
          <UploadCloud className="h-8 w-8" />
        </div>
        <div>
          <h4 className="text-base font-medium text-slate-200">Drag & Drop SEG-Y Files</h4>
          <p className="text-sm text-slate-400 mt-1">or click to browse from your computer</p>
        </div>
        <Button onClick={() => toast({ title: "🚧 Upload not implemented yet" })}>
          Select Files
        </Button>
      </CardContent>
    </Card>

    <div className="space-y-2">
      <h4 className="text-sm font-medium text-slate-300">Recent Uploads</h4>
      {[
        { name: 'Oseberg_3D_final_migration.sgy', status: 'Completed', size: '42.5 GB' },
        { name: 'Gullfaks_2D_line_01.sgy', status: 'Processing', size: '1.2 GB' }
      ].map((file, i) => (
        <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-900/50">
          <div className="flex items-center space-x-3">
            <FileBox className="h-5 w-5 text-blue-400" />
            <div>
              <p className="text-sm font-medium text-slate-200">{file.name}</p>
              <p className="text-xs text-slate-400">{file.size}</p>
            </div>
          </div>
          <Badge variant={file.status === 'Completed' ? 'default' : 'secondary'}>
            {file.status}
          </Badge>
        </div>
      ))}
    </div>
  </div>
);

const JobMonitoring = () => (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-lg font-medium">Job Monitoring</h3>
        <p className="text-sm text-slate-400">Track SEG-Y conversion and processing jobs.</p>
      </div>
      <Button variant="outline" onClick={() => toast({ title: "🚧 Feature not implemented yet" })}>
        Refresh Status
      </Button>
    </div>

    <Card className="bg-slate-900 border-slate-800">
      <CardContent className="p-0">
        <div className="divide-y divide-slate-800">
          {[
            { id: 'JOB-9021', type: 'Zarr Conversion', target: 'Gullfaks_2D_line_01.sgy', status: 'running', progress: 45 },
            { id: 'JOB-9020', type: 'Header Inspection', target: 'Oseberg_3D_final.sgy', status: 'completed', progress: 100 },
            { id: 'JOB-9019', type: 'Pyramid Generation', target: 'Oseberg_3D_final.sgy', status: 'failed', progress: 82 }
          ].map((job, i) => (
            <div key={i} className="p-4 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="h-10 w-10 rounded-full bg-slate-800 flex items-center justify-center">
                  {job.status === 'running' && <Activity className="h-5 w-5 text-blue-400 animate-pulse" />}
                  {job.status === 'completed' && <CheckCircle2 className="h-5 w-5 text-emerald-400" />}
                  {job.status === 'failed' && <AlertCircle className="h-5 w-5 text-red-400" />}
                </div>
                <div>
                  <h4 className="text-sm font-medium text-slate-200">{job.type}</h4>
                  <p className="text-xs text-slate-400">{job.target} • {job.id}</p>
                </div>
              </div>
              <div className="flex items-center space-x-4 min-w-[200px]">
                <div className="flex-1">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">Progress</span>
                    <span className="text-slate-200">{job.progress}%</span>
                  </div>
                  <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${
                        job.status === 'running' ? 'bg-blue-500' : 
                        job.status === 'completed' ? 'bg-emerald-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => toast({ title: "🚧 View Logs not implemented" })}>
                  <MoreVertical className="h-4 w-4 text-slate-400" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  </div>
);

const QCReportViewer = () => (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-lg font-medium">QC Reports</h3>
        <p className="text-sm text-slate-400">View quality control reports from SEG-Y inspections.</p>
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="bg-slate-900 border-slate-800 col-span-1">
        <CardHeader>
          <CardTitle className="text-base">Recent Reports</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-800">
            {['Oseberg_3D_final.sgy', 'Gullfaks_2D_line_01.sgy', 'Troll_3D_raw.sgy'].map((name, i) => (
              <div key={i} className="p-3 hover:bg-slate-800/50 cursor-pointer transition-colors" onClick={() => toast({ title: "🚧 Report loading not implemented" })}>
                <p className="text-sm font-medium text-slate-200 truncate">{name}</p>
                <div className="flex items-center mt-1 space-x-2">
                  <Clock className="h-3 w-3 text-slate-500" />
                  <span className="text-xs text-slate-500">2 hours ago</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      
      <Card className="bg-slate-900 border-slate-800 col-span-2">
        <CardHeader>
          <CardTitle className="text-base">QC Summary: Oseberg_3D_final.sgy</CardTitle>
          <CardDescription>Geometry and Header Analysis</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-slate-800/50 p-4 rounded-lg">
              <p className="text-xs text-slate-400 uppercase">Traces</p>
              <p className="text-2xl font-semibold text-slate-200 mt-1">1,245,000</p>
            </div>
            <div className="bg-slate-800/50 p-4 rounded-lg">
              <p className="text-xs text-slate-400 uppercase">Sample Rate</p>
              <p className="text-2xl font-semibold text-slate-200 mt-1">4 ms</p>
            </div>
            <div className="bg-slate-800/50 p-4 rounded-lg">
              <p className="text-xs text-slate-400 uppercase">Inline Range</p>
              <p className="text-xl font-medium text-slate-200 mt-1">1000 - 2500</p>
            </div>
            <div className="bg-slate-800/50 p-4 rounded-lg">
              <p className="text-xs text-slate-400 uppercase">Crossline Range</p>
              <p className="text-xl font-medium text-slate-200 mt-1">1000 - 3200</p>
            </div>
          </div>
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-slate-300">Validation Checks</h4>
            <div className="flex items-center text-sm text-emerald-400">
              <CheckCircle2 className="h-4 w-4 mr-2" /> EBCDIC Header Parsed Successfully
            </div>
            <div className="flex items-center text-sm text-emerald-400">
              <CheckCircle2 className="h-4 w-4 mr-2" /> Binary Header Validated
            </div>
            <div className="flex items-center text-sm text-amber-400">
              <AlertCircle className="h-4 w-4 mr-2" /> 12 Traces flagged with zero amplitude
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
);

const VolumeRegistry = () => (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-lg font-medium">Volume Registry</h3>
        <p className="text-sm text-slate-400">Manage converted Zarr volumes ready for interpretation.</p>
      </div>
    </div>

    <Card className="bg-slate-900 border-slate-800">
      <div className="p-4 overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-400 uppercase bg-slate-800/50">
            <tr>
              <th className="px-4 py-3 rounded-tl-lg">Volume Name</th>
              <th className="px-4 py-3">Survey</th>
              <th className="px-4 py-3">Format</th>
              <th className="px-4 py-3">Dimensions</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 rounded-tr-lg">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {[
              { name: 'Oseberg_3D_final.zarr', survey: 'Oseberg 3D', format: 'Zarr (Chunked)', dims: '1501 x 2201 x 1250', status: 'Ready' },
              { name: 'Troll_3D_raw.zarr', survey: 'Troll 3D', format: 'Zarr (Chunked)', dims: '800 x 1200 x 750', status: 'Ready' }
            ].map((vol, i) => (
              <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-3 font-medium text-slate-200">{vol.name}</td>
                <td className="px-4 py-3 text-slate-400">{vol.survey}</td>
                <td className="px-4 py-3 text-slate-400">{vol.format}</td>
                <td className="px-4 py-3 text-slate-400">{vol.dims}</td>
                <td className="px-4 py-3">
                  <Badge className="bg-emerald-900/20 text-emerald-400 border-emerald-800">
                    {vol.status}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <Button variant="ghost" size="sm" onClick={() => toast({ title: "🚧 Feature not implemented yet" })}>
                    <Play className="h-4 w-4 mr-2" /> Load
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  </div>
);

const StorageAssets = () => (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-lg font-medium">Storage Assets</h3>
        <p className="text-sm text-slate-400">Direct view into underlying cloud storage buckets.</p>
      </div>
      <Button variant="outline" onClick={() => toast({ title: "🚧 Feature not implemented yet" })}>
        Sync Storage
      </Button>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card className="bg-slate-900 border-slate-800 md:col-span-1">
        <CardHeader>
          <CardTitle className="text-sm">Buckets</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-800">
            {['seismic-raw-segy', 'seismic-zarr-volumes', 'seismic-derivatives'].map((b, i) => (
              <div key={i} className="p-3 flex items-center space-x-2 hover:bg-slate-800/50 cursor-pointer text-sm">
                <HardDrive className="h-4 w-4 text-slate-400" />
                <span className="text-slate-300">{b}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      
      <Card className="bg-slate-900 border-slate-800 md:col-span-3 min-h-[400px]">
        <CardHeader className="border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2 text-sm text-slate-400">
            <HardDrive className="h-4 w-4" />
            <span>seismic-zarr-volumes / Oseberg_3D_final.zarr / 0 / 0 /</span>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="flex flex-col items-center p-4 border border-slate-800 rounded-lg hover:bg-slate-800/30 cursor-pointer" onClick={() => toast({ title: "🚧 Object details not implemented" })}>
                <FileBox className="h-8 w-8 text-blue-500 mb-2" />
                <span className="text-xs text-slate-300 truncate w-full text-center">chunk_{i}.gz</span>
                <span className="text-[10px] text-slate-500">2.4 MB</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
);

const PreviewViewer = () => (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-lg font-medium">Quick Preview</h3>
        <p className="text-sm text-slate-400">Rapid 2D slice visualization of generated pyramids.</p>
      </div>
      <div className="flex items-center space-x-2">
        <Input type="number" placeholder="Inline" defaultValue="1500" className="w-24 bg-slate-900 border-slate-800" />
        <Button onClick={() => toast({ title: "🚧 Rendering slice..." })}>Render</Button>
      </div>
    </div>

    <Card className="bg-slate-900 border-slate-800 overflow-hidden">
      <div className="h-[500px] w-full bg-slate-950 flex flex-col items-center justify-center relative">
        {/* Placeholder for actual seismic rendering canvas */}
        <div className="absolute inset-0 opacity-20 bg-[url('https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center grayscale" style={{ backgroundBlendMode: 'luminosity' }}></div>
        <div className="relative z-10 text-center space-y-4">
          <MonitorPlay className="h-12 w-12 text-slate-600 mx-auto" />
          <p className="text-slate-400 font-medium">Interactive WebGL / Canvas Viewer</p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">This area will display rapid 2D slices (Inline, Crossline, Z-slice) directly from the optimized Zarr pyramid storage.</p>
        </div>
      </div>
    </Card>
  </div>
);


export default function SeismicInterpretationPro() {
  const [activeTab, setActiveTab] = useState('surveys');

  const navigation = [
    { id: 'surveys', label: 'Survey Manager', icon: Waves },
    { id: 'upload', label: 'SEG-Y Upload', icon: UploadCloud },
    { id: 'jobs', label: 'Job Monitoring', icon: Activity },
    { id: 'qc', label: 'QC Reports', icon: FileCheck },
    { id: 'volumes', label: 'Volume Registry', icon: Database },
    { id: 'storage', label: 'Storage Assets', icon: HardDrive },
    { id: 'preview', label: 'Preview Viewer', icon: MonitorPlay },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'surveys': return <SurveyManager />;
      case 'upload': return <SegyUpload />;
      case 'jobs': return <JobMonitoring />;
      case 'qc': return <QCReportViewer />;
      case 'volumes': return <VolumeRegistry />;
      case 'storage': return <StorageAssets />;
      case 'preview': return <PreviewViewer />;
      default: return <SurveyManager />;
    }
  };

  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-200">
      {/* Header */}
      <header className="flex h-14 items-center justify-between border-b border-slate-800 bg-slate-900/50 px-6">
        <div className="flex items-center space-x-3">
          <div className="rounded-md bg-blue-600 p-1.5">
            <Waves className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-xl font-semibold text-slate-100">Seismic Interpretation Pro</h1>
        </div>
        <div className="flex items-center space-x-4 text-sm">
          <Badge variant="outline" className="bg-emerald-900/20 text-emerald-400 border-emerald-800">
            System Online
          </Badge>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 border-r border-slate-800 bg-slate-900/30 flex flex-col">
          <ScrollArea className="flex-1 py-4">
            <nav className="space-y-1 px-3">
              {navigation.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center space-x-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      isActive 
                        ? 'bg-blue-600/10 text-blue-400' 
                        : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${isActive ? 'text-blue-400' : 'text-slate-500'}`} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </ScrollArea>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto bg-slate-950 p-6">
          <div className="max-w-6xl mx-auto">
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
}