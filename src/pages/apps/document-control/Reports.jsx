import React from 'react';
import { DocControlShell } from './components/DocControlShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, BarChart2, PieChart, TrendingUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const Reports = () => {
  const { toast } = useToast();

  const handleNotImplemented = () => {
    toast({ description: "🚧 This feature isn't implemented yet—but don't worry! You can request it in your next prompt! 🚀" });
  };

  const reports = [
    { title: "Master Document Register (MDR)", desc: "Complete export of all documents with current metadata.", icon: FileListIcon },
    { title: "Review Status Aging", desc: "Analysis of documents stuck in review workflows by duration.", icon: TrendingUp },
    { title: "Departmental Compliance", desc: "Breakdown of published vs draft documents per department.", icon: PieChart },
    { title: "Document Activity History", desc: "Full FDA CFR 21 Part 11 style audit extract.", icon: BarChart2 }
  ];

  return (
    <DocControlShell>
      <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">
        <div className="flex items-center justify-between border-b border-[#2D3748] pb-4">
           <div>
             <h2 className="text-2xl font-bold text-[#E2E8F0]">Reporting Engine</h2>
             <p className="text-sm text-[#A0AEC0] mt-1">Generate and export system-wide document control reports.</p>
           </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {reports.map((r, i) => (
            <Card key={i} className="bg-[#232B3A] border-[#2D3748] hover:border-[#3B82F6] transition-colors">
              <CardHeader className="pb-2 flex flex-row justify-between items-start">
                 <div className="p-3 bg-[#1A1F2E] border border-[#2D3748] rounded-lg">
                   <r.icon className="w-5 h-5 text-[#3B82F6]"/>
                 </div>
              </CardHeader>
              <CardContent>
                <CardTitle className="text-lg mb-2 text-[#E2E8F0]">{r.title}</CardTitle>
                <p className="text-sm text-[#A0AEC0] mb-6">{r.desc}</p>
                <div className="flex gap-3">
                  <Button variant="outline" className="border-[#2D3748] bg-[#1A1F2E] text-[#E2E8F0] hover:bg-[#232B3A] flex-1" onClick={handleNotImplemented}>
                    View Online
                  </Button>
                  <Button className="bg-[#3B82F6] hover:bg-[#2563EB] text-white flex-1" onClick={handleNotImplemented}>
                    <Download className="w-4 h-4 mr-2"/> Export CSV
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DocControlShell>
  );
};

const FileListIcon = (props) => (
  <svg 
    {...props} 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
    <polyline points="14 2 14 8 20 8"></polyline>
    <line x1="16" y1="13" x2="8" y2="13"></line>
    <line x1="16" y1="17" x2="8" y2="17"></line>
    <polyline points="10 9 9 9 8 9"></polyline>
  </svg>
);

export default Reports;