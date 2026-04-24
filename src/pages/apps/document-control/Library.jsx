import React, { useState, useEffect } from 'react';
import { DocControlShell } from './components/DocControlShell';
import { DocumentControlService } from '@/services/DocumentControlService';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Filter, Download, Plus, MoreVertical, Eye } from 'lucide-react';
import { StatusBadge, ConfidentialityBadge } from './components/StatusBadge';
import { Link, useNavigate } from 'react-router-dom';

const Library = () => {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function load() {
      const data = await DocumentControlService.getDocuments();
      setDocuments(data);
      setLoading(false);
    }
    load();
  }, []);

  const filteredDocs = documents.filter(d => 
    d.title.toLowerCase().includes(search.toLowerCase()) || 
    d.document_number.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DocControlShell>
      <div className="space-y-4 animate-in fade-in duration-500">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A0AEC0]" />
            <Input 
              placeholder="Search by ID or Title..." 
              className="pl-9 bg-[#1A1F2E] border-[#2D3748] text-[#E2E8F0] placeholder-[#A0AEC0]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button variant="outline" className="border-[#2D3748] bg-[#232B3A] text-[#E2E8F0] hover:bg-[#1A1F2E]">
              <Filter className="w-4 h-4 mr-2" /> Filters
            </Button>
            <Button variant="outline" className="border-[#2D3748] bg-[#232B3A] text-[#E2E8F0] hover:bg-[#1A1F2E]">
              <Download className="w-4 h-4 mr-2" /> Export
            </Button>
            <Button onClick={() => navigate('/dashboard/apps/assurance/document-control/new')} className="bg-[#3B82F6] text-white hover:bg-[#2563EB]">
              <Plus className="w-4 h-4 mr-2" /> New Document
            </Button>
          </div>
        </div>

        <Card className="bg-[#232B3A] border-[#2D3748] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-[#1A1F2E] border-b border-[#2D3748] text-[#A0AEC0]">
                <tr>
                  <th className="p-4 font-medium">Doc Number</th>
                  <th className="p-4 font-medium">Title</th>
                  <th className="p-4 font-medium">Rev</th>
                  <th className="p-4 font-medium">Status</th>
                  <th className="p-4 font-medium">Category</th>
                  <th className="p-4 font-medium">Department</th>
                  <th className="p-4 font-medium">Confidentiality</th>
                  <th className="p-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2D3748]">
                {loading ? (
                  <tr><td colSpan="8" className="text-center p-8 text-[#A0AEC0]">Loading documents...</td></tr>
                ) : filteredDocs.length === 0 ? (
                  <tr><td colSpan="8" className="text-center p-8 text-[#A0AEC0]">No documents found matching your criteria.</td></tr>
                ) : (
                  filteredDocs.map((doc) => (
                    <tr key={doc.id} className="hover:bg-[#1A1F2E] cursor-pointer transition-colors" onClick={() => navigate(`/dashboard/apps/assurance/document-control/${doc.id}`)}>
                      <td className="p-4 font-mono text-[#3B82F6] font-medium">{doc.document_number}</td>
                      <td className="p-4 font-medium text-[#E2E8F0] max-w-[250px] truncate" title={doc.title}>{doc.title}</td>
                      <td className="p-4"><span className="bg-[#1A1F2E] border border-[#2D3748] text-[#E2E8F0] px-2 py-1 rounded text-xs">{doc.current_revision}</span></td>
                      <td className="p-4"><StatusBadge status={doc.status} /></td>
                      <td className="p-4 text-[#E2E8F0]">{doc.category}</td>
                      <td className="p-4 text-[#E2E8F0]">{doc.department}</td>
                      <td className="p-4"><ConfidentialityBadge level={doc.confidentiality} /></td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-2" onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-[#A0AEC0] hover:text-[#E2E8F0] hover:bg-[#232B3A]">
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-[#A0AEC0] hover:text-[#E2E8F0] hover:bg-[#232B3A]">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </DocControlShell>
  );
};

export default Library;