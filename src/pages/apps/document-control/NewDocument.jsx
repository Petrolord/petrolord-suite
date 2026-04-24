import React, { useState } from 'react';
import { DocControlShell } from './components/DocControlShell';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UploadCloud, CheckCircle2, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { DocumentControlService } from '@/services/DocumentControlService';

const NewDocument = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    title: '',
    category: '',
    department: '',
    confidentiality: 'Internal',
    description: ''
  });

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async (submit = false) => {
    if (!formData.title || !formData.category || !formData.department) {
      toast({ title: "Validation Error", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const docData = {
        ...formData,
        document_number: `${formData.department.substring(0,3).toUpperCase()}-${formData.category.substring(0,3).toUpperCase()}-${Math.floor(Math.random()*1000).toString().padStart(3, '0')}`,
        status: submit ? 'In Review' : 'Draft',
        current_revision: '01'
      };
      
      await DocumentControlService.saveDocument(docData);
      
      toast({ title: "Success", description: `Document ${submit ? 'submitted for review' : 'saved as draft'}.` });
      navigate('/dashboard/apps/assurance/document-control/library');
    } catch (err) {
      toast({ title: "Error", description: "Failed to save document.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DocControlShell>
      <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
        <div className="flex items-center justify-between border-b border-[#2D3748] pb-4">
           <div>
             <h2 className="text-2xl font-bold text-[#E2E8F0]">Register New Document</h2>
             <p className="text-sm text-[#A0AEC0] mt-1">Upload file and define document metadata.</p>
           </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <Card className="bg-[#232B3A] border-[#2D3748]">
              <CardHeader>
                <CardTitle className="text-lg text-[#E2E8F0]">Metadata</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-[#E2E8F0]">Document Title <span className="text-[#EF4444]">*</span></Label>
                  <Input 
                    placeholder="e.g., Emergency Response Plan" 
                    className="bg-[#1A1F2E] border-[#2D3748] text-[#E2E8F0] placeholder-[#A0AEC0]"
                    value={formData.title}
                    onChange={e => handleChange('title', e.target.value)}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[#E2E8F0]">Category <span className="text-[#EF4444]">*</span></Label>
                    <Select value={formData.category} onValueChange={v => handleChange('category', v)}>
                      <SelectTrigger className="bg-[#1A1F2E] border-[#2D3748] text-[#E2E8F0]">
                        <SelectValue placeholder="Select Category" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#232B3A] border-[#2D3748] text-[#E2E8F0]">
                        <SelectItem value="SOP">Standard Operating Procedure</SelectItem>
                        <SelectItem value="Policy">Policy</SelectItem>
                        <SelectItem value="Manual">Manual</SelectItem>
                        <SelectItem value="Drawing">Drawing</SelectItem>
                        <SelectItem value="Guideline">Guideline</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[#E2E8F0]">Department <span className="text-[#EF4444]">*</span></Label>
                    <Select value={formData.department} onValueChange={v => handleChange('department', v)}>
                      <SelectTrigger className="bg-[#1A1F2E] border-[#2D3748] text-[#E2E8F0]">
                        <SelectValue placeholder="Select Department" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#232B3A] border-[#2D3748] text-[#E2E8F0]">
                        <SelectItem value="HSE">HSE</SelectItem>
                        <SelectItem value="Operations">Operations</SelectItem>
                        <SelectItem value="Engineering">Engineering</SelectItem>
                        <SelectItem value="Finance">Finance</SelectItem>
                        <SelectItem value="HR">Human Resources</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-[#E2E8F0]">Description</Label>
                  <Textarea 
                    placeholder="Brief description of document purpose..." 
                    className="bg-[#1A1F2E] border-[#2D3748] text-[#E2E8F0] placeholder-[#A0AEC0] min-h-[100px]"
                    value={formData.description}
                    onChange={e => handleChange('description', e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#232B3A] border-[#2D3748]">
              <CardHeader>
                <CardTitle className="text-lg text-[#E2E8F0]">Primary File Upload</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="border-2 border-dashed border-[#2D3748] bg-[#1A1F2E]/50 rounded-lg p-10 text-center hover:bg-[#1A1F2E] transition-colors cursor-pointer">
                  <div className="bg-[#232B3A] w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 border border-[#2D3748]">
                    <UploadCloud className="w-6 h-6 text-[#3B82F6]" />
                  </div>
                  <p className="text-sm text-[#E2E8F0] font-medium mb-1">Click to upload or drag and drop</p>
                  <p className="text-xs text-[#A0AEC0]">PDF, DOCX, XLSX up to 50MB</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="bg-[#232B3A] border-[#2D3748]">
              <CardHeader>
                <CardTitle className="text-lg text-[#E2E8F0]">Security & Access</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                 <div className="space-y-2">
                    <Label className="text-[#E2E8F0]">Confidentiality Level</Label>
                    <Select value={formData.confidentiality} onValueChange={v => handleChange('confidentiality', v)}>
                      <SelectTrigger className="bg-[#1A1F2E] border-[#2D3748] text-[#E2E8F0]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#232B3A] border-[#2D3748] text-[#E2E8F0]">
                        <SelectItem value="Public">Public (Unrestricted)</SelectItem>
                        <SelectItem value="Internal">Internal Use Only</SelectItem>
                        <SelectItem value="Confidential">Confidential</SelectItem>
                        <SelectItem value="Restricted">Restricted (C-Level/Legal)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="bg-[#1A1F2E] p-3 rounded-lg border border-[#2D3748] flex gap-3 items-start">
                     <AlertCircle className="w-4 h-4 text-[#F59E0B] mt-0.5 shrink-0"/>
                     <p className="text-xs text-[#A0AEC0]">Selecting Confidential or Restricted will require explicit access grants for users outside the owning department.</p>
                  </div>
              </CardContent>
            </Card>

            <div className="flex flex-col gap-3">
               <Button className="w-full bg-[#3B82F6] text-white hover:bg-[#2563EB]" onClick={() => handleSave(true)} disabled={isSubmitting}>
                 <CheckCircle2 className="w-4 h-4 mr-2" /> Submit for Review
               </Button>
               <Button className="w-full bg-[#1A1F2E] text-[#E2E8F0] border border-[#2D3748] hover:bg-[#232B3A]" onClick={() => handleSave(false)} disabled={isSubmitting}>
                 Save as Draft
               </Button>
               <Button variant="ghost" className="w-full text-[#A0AEC0] hover:text-[#E2E8F0] hover:bg-[#1A1F2E]" onClick={() => navigate(-1)} disabled={isSubmitting}>
                 Cancel
               </Button>
            </div>
          </div>
        </div>

      </div>
    </DocControlShell>
  );
};

export default NewDocument;