import React, { useState, useRef } from 'react';
    import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { Label } from '@/components/ui/label';
    import { Textarea } from '@/components/ui/textarea';
    import { UploadCloud, File as FileIcon, X } from 'lucide-react';
    import { useToast } from "@/components/ui/use-toast";

    const ApplicationForm = ({ isOpen, onClose, jobTitle }) => {
      const { toast } = useToast();
      const [formData, setFormData] = useState({
        fullName: '',
        email: '',
        phone: '',
      });
      const [coverLetter, setCoverLetter] = useState('');
      const [resume, setResume] = useState(null);
      const fileInputRef = useRef(null);

      const handleInputChange = (e) => {
        const { id, value } = e.target;
        setFormData((prev) => ({ ...prev, [id]: value }));
      };

      const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
          setResume(file);
        }
      };

      const handleDragOver = (e) => {
        e.preventDefault();
      };

      const handleDrop = (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) {
          setResume(file);
        }
      };
      
      const handleSubmit = (e) => {
        e.preventDefault();
        toast({
          title: "🚀 Application Submitted!",
          description: "Thank you for your interest. We will be in touch shortly.",
        });
        onClose();
        // Reset form
        setFormData({ fullName: '', email: '', phone: '' });
        setCoverLetter('');
        setResume(null);
      };

      return (
        <Dialog open={isOpen} onOpenChange={onClose}>
          <DialogContent className="sm:max-w-[625px]">
            <DialogHeader>
              <DialogTitle className="font-pl-display text-2xl font-semibold text-pl-text">Apply for {jobTitle || 'a Position'}</DialogTitle>
              <DialogDescription>
                Submit your application below. We're excited to learn more about you.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="fullName" className="text-right">
                    Full Name
                  </Label>
                  <Input id="fullName" value={formData.fullName} onChange={handleInputChange} className="col-span-3" required />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="email" className="text-right">
                    Email
                  </Label>
                  <Input id="email" type="email" value={formData.email} onChange={handleInputChange} className="col-span-3" required />
                </div>
                 <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="phone" className="text-right">
                    Phone
                  </Label>
                  <Input id="phone" type="tel" value={formData.phone} onChange={handleInputChange} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-start gap-4">
                    <Label htmlFor="resume" className="text-right pt-2">
                        Resume/CV
                    </Label>
                    <div className="col-span-3">
                        <div 
                            className="relative flex flex-col items-center justify-center w-full h-32 border-2 border-pl-border-strong border-dashed rounded-lg cursor-pointer bg-pl-surface hover:bg-pl-sunken transition-colors"
                            onDragOver={handleDragOver}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            {resume ? (
                                <div className="text-center">
                                    <FileIcon className="mx-auto h-8 w-8 text-pl-primary-text" />
                                    <p className="mt-2 text-sm text-pl-text">{resume.name}</p>
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setResume(null); }}
                                        className="absolute top-2 right-2 rounded-sm text-pl-muted hover:text-pl-text"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            ) : (
                                <div className="text-center">
                                    <UploadCloud className="mx-auto h-8 w-8 text-pl-muted" />
                                    <p className="mt-2 text-sm text-pl-muted">
                                        <span className="font-semibold text-pl-primary-text">Click to upload</span> or drag and drop
                                    </p>
                                    <p className="text-xs text-pl-muted">PDF, DOC, DOCX (MAX. 5MB)</p>
                                </div>
                            )}
                        </div>
                        <Input id="resume" type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".pdf,.doc,.docx" />
                    </div>
                </div>
                <div className="grid grid-cols-4 items-start gap-4">
                  <Label htmlFor="coverLetter" className="text-right pt-2">
                    Cover Letter
                  </Label>
                  <Textarea id="coverLetter" value={coverLetter} onChange={(e) => setCoverLetter(e.target.value)} placeholder="Tell us why you're a great fit..." className="col-span-3" rows={5} />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" className="font-semibold">
                  Submit Application
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      );
    };

    export default ApplicationForm;