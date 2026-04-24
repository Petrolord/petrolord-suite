import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DocControlShell } from './components/DocControlShell';
import { DocumentControlService } from '@/services/DocumentControlService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Download, FileText, History, MessageSquare, Shield, Activity, Edit2 } from 'lucide-react';
import { StatusBadge, ConfidentialityBadge } from './components/StatusBadge';
import { useToast } from '@/hooks/use-toast';

const DocumentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const data = await DocumentControlService.getDocumentById(id);
      setDoc(data);
      setLoading(false);
    }
    load();
  }, [id]);

  const handleNotImplemented = () => {
    toast({ description: "🚧 This feature isn't implemented yet—but don't worry! You can request it in your next prompt! 🚀" });
  };

  if (loading) return <DocControlShell><div className="flex h-64 items-center justify-center text-[#A0AEC0]">Loading document...</div></DocControlShell>;
  if (!doc) return <DocControlShell><div className="flex h-64 items-center justify-center text-[#EF4444]">Document not found</div></DocControlShell>;

  return (
    <DocControlShell>
      <div className="space-y-6 animate-in fade-in duration-500 max-w-6xl mx-auto">
        {/* Header Strip */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-[#2D3748] pb-6">
          <div className="flex gap-4">
            <Button variant="ghost" size="icon" className="mt-1 text-[#A0AEC0] hover:text-[#E2E8F0] hover:bg-[#1A1F2E]" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="px-2 py-0.5 bg-[#1A1F2E] text-[#E2E8F0] rounded text-xs font-mono border border-[#2D3748]">{doc.document_number}</span>
                <span className="px-2 py-0.5 bg-[#1A1F2E] text-[#E2E8F0] rounded text-xs border border-[#2D3748]">Rev {doc.current_revision}</span>
                <StatusBadge status={doc.status} />
              </div>
              <h2 className="text-2xl font-bold text-[#E2E8F0] tracking-tight">{doc.title}</h2>
              <div className="flex items-center gap-4 mt-2 text-sm text-[#A0AEC0]">
                <span>{doc.department}</span> • <span>{doc.category}</span> • <span>Owner: {doc.owner}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="border-[#2D3748] bg-[#232B3A] text-[#E2E8F0] hover:bg-[#1A1F2E]" onClick={handleNotImplemented}>
              <Edit2 className="w-4 h-4 mr-2" /> Edit Metadata
            </Button>
            <Button className="bg-[#3B82F6] text-white hover:bg-[#2563EB]" onClick={handleNotImplemented}>
              <Download className="w-4 h-4 mr-2" /> Download Native
            </Button>
          </div>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="bg-transparent border-b border-[#2D3748] w-full justify-start rounded-none h-auto p-0 space-x-6">
            <TabsTrigger value="overview" className="relative rounded-none px-0 py-3 text-sm font-medium text-[#A0AEC0] data-[state=active]:text-[#3B82F6] data-[state=active]:bg-transparent data-[state=active]:shadow-none after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-[2px] after:bg-transparent data-[state=active]:after:bg-[#3B82F6]">
              <FileText className="w-4 h-4 mr-2"/> Overview
            </TabsTrigger>
            <TabsTrigger value="revisions" className="relative rounded-none px-0 py-3 text-sm font-medium text-[#A0AEC0] data-[state=active]:text-[#3B82F6] data-[state=active]:bg-transparent data-[state=active]:shadow-none after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-[2px] after:bg-transparent data-[state=active]:after:bg-[#3B82F6]">
              <History className="w-4 h-4 mr-2"/> Revisions
            </TabsTrigger>
            <TabsTrigger value="security" className="relative rounded-none px-0 py-3 text-sm font-medium text-[#A0AEC0] data-[state=active]:text-[#3B82F6] data-[state=active]:bg-transparent data-[state=active]:shadow-none after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-[2px] after:bg-transparent data-[state=active]:after:bg-[#3B82F6]">
              <Shield className="w-4 h-4 mr-2"/> Access & Security
            </TabsTrigger>
            <TabsTrigger value="activity" className="relative rounded-none px-0 py-3 text-sm font-medium text-[#A0AEC0] data-[state=active]:text-[#3B82F6] data-[state=active]:bg-transparent data-[state=active]:shadow-none after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-[2px] after:bg-transparent data-[state=active]:after:bg-[#3B82F6]">
              <Activity className="w-4 h-4 mr-2"/> Audit Log
            </TabsTrigger>
          </TabsList>

          <div className="mt-6">
            <TabsContent value="overview">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-6">
                  <Card className="bg-[#232B3A] border-[#2D3748]">
                    <CardHeader><CardTitle className="text-lg text-[#E2E8F0]">File Preview</CardTitle></CardHeader>
                    <CardContent>
                      <div className="aspect-video bg-[#1A1F2E] border border-[#2D3748] rounded-lg flex flex-col items-center justify-center text-[#A0AEC0]">
                        <FileText className="w-12 h-12 mb-3 opacity-50"/>
                        <p>Preview generation placeholder</p>
                        <Button variant="link" className="text-[#3B82F6] mt-2" onClick={handleNotImplemented}>Open in full viewer</Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
                <div className="space-y-6">
                  <Card className="bg-[#232B3A] border-[#2D3748]">
                    <CardHeader><CardTitle className="text-lg text-[#E2E8F0]">Properties</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <span className="block text-xs text-[#A0AEC0] mb-1">Confidentiality</span>
                        <ConfidentialityBadge level={doc.confidentiality} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <span className="block text-xs text-[#A0AEC0] mb-1">Issue Date</span>
                          <span className="text-sm text-[#E2E8F0]">{doc.issue_date ? new Date(doc.issue_date).toLocaleDateString() : 'Pending'}</span>
                        </div>
                        <div>
                          <span className="block text-xs text-[#A0AEC0] mb-1">Next Review</span>
                          <span className="text-sm text-[#E2E8F0]">{doc.next_review_date ? new Date(doc.next_review_date).toLocaleDateString() : 'N/A'}</span>
                        </div>
                      </div>
                      <div className="pt-4 border-t border-[#2D3748]">
                        <Button className="w-full bg-[#1A1F2E] text-[#E2E8F0] border border-[#2D3748] hover:bg-[#232B3A]" onClick={handleNotImplemented}>
                          <MessageSquare className="w-4 h-4 mr-2"/> Add Comment
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="revisions">
               <Card className="bg-[#232B3A] border-[#2D3748]">
                 <CardContent className="p-0">
                    <div className="p-8 text-center text-[#A0AEC0]">
                      <History className="w-10 h-10 mx-auto mb-3 opacity-20"/>
                      <p>Revision history grid would appear here.</p>
                      <Button variant="outline" className="mt-4 border-[#2D3748] bg-[#1A1F2E] text-[#E2E8F0] hover:bg-[#232B3A]" onClick={handleNotImplemented}>Upload New Revision</Button>
                    </div>
                 </CardContent>
               </Card>
            </TabsContent>

            <TabsContent value="security">
               <Card className="bg-[#232B3A] border-[#2D3748]">
                 <CardContent className="p-8 text-center text-[#A0AEC0]">
                    <Shield className="w-10 h-10 mx-auto mb-3 opacity-20"/>
                    <p>Access control lists and distribution matrix.</p>
                 </CardContent>
               </Card>
            </TabsContent>

            <TabsContent value="activity">
               <Card className="bg-[#232B3A] border-[#2D3748]">
                 <CardContent className="p-8 text-center text-[#A0AEC0]">
                    <Activity className="w-10 h-10 mx-auto mb-3 opacity-20"/>
                    <p>Comprehensive FDA 21 CFR Part 11 compliant audit trail.</p>
                 </CardContent>
               </Card>
            </TabsContent>

          </div>
        </Tabs>

      </div>
    </DocControlShell>
  );
};

export default DocumentDetail;