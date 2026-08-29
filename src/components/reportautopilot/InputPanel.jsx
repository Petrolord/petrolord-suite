import React, { useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import CollapsibleSection from './CollapsibleSection';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Settings, Bot, FileUp, ListChecks, PlusCircle, MinusCircle, FileText, SlidersHorizontal, Loader2 } from 'lucide-react';

// Attachments are read in the browser and travel with the brief, so they are
// bounded here rather than at the edge.
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
const MAX_ATTACHMENT_CHARS = 20000;

const InputPanel = ({ onGenerate, loading, templates, formState, setFormState }) => {
  const [currentSections, setCurrentSections] = useState([]);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const { toast } = useToast();

  useEffect(() => {
    if (templates && templates.types && templates.types.length > 0 && formState.report_type_id) {
      const selectedTemplate = templates.types.find(t => t.id === formState.report_type_id);
      if (selectedTemplate && templates.sections) {
        setCurrentSections(templates.sections[formState.report_type_id] || []);
      }
    } else if (templates && templates.types && templates.types.length > 0 && !formState.report_type_id) {
      const defaultTemplate = templates.types[0];
      setFormState(prev => ({ ...prev, report_type_id: defaultTemplate.id }));
      if (templates.sections) {
        const defaultSections = templates.sections[defaultTemplate.id] || [];
        const allSectionIds = defaultSections.map(s => s.id);
        setCurrentSections(defaultSections);
        setFormState(prev => ({ ...prev, selected_sections: allSectionIds, gpt4_sections: [] }));
      }
    }
  }, [templates, formState.report_type_id, setFormState]);

  const handleInputChange = (field, value) => {
    setFormState(prev => ({ ...prev, [field]: value }));
  };

  const handleTemplateChange = (templateId) => {
    const selectedTemplate = templates.types.find(t => t.id === templateId);
    if (selectedTemplate && templates.sections) {
      handleInputChange('report_type_id', templateId);
      const newSections = templates.sections[templateId] || [];
      setCurrentSections(newSections);
      const allSectionIds = newSections.map(s => s.id);
      handleInputChange('selected_sections', allSectionIds);
      handleInputChange('gpt4_sections', []);
    }
  };

  const handleKpiChange = (index, field, value) => {
    const newKpis = [...formState.kpis];
    newKpis[index][field] = value;
    handleInputChange('kpis', newKpis);
  };

  const addKpi = () => handleInputChange('kpis', [...(formState.kpis || []), { key: '', value: '' }]);
  const removeKpi = (index) => handleInputChange('kpis', (formState.kpis || []).filter((_, i) => i !== index));

  const handleSectionToggle = (sectionId, checked) => {
    const newSections = checked 
      ? [...formState.selected_sections, sectionId]
      : formState.selected_sections.filter(id => id !== sectionId);
    handleInputChange('selected_sections', newSections);
  };
  
  const handleGpt4Toggle = (sectionId, checked) => {
    const newGpt4Sections = checked
      ? [...formState.gpt4_sections, sectionId]
      : formState.gpt4_sections.filter(id => id !== sectionId);
    handleInputChange('gpt4_sections', newGpt4Sections);
  };

  /**
   * Attach text-bearing files as context for the report (rebuild 2026-08-29).
   *
   * These used to be posted to a report service that no longer exists, which
   * returned a file id the app then carried around; nothing was ever read.
   * Text and CSV files are now read in the browser and their contents travel
   * with the brief, so an attachment actually reaches the writer.
   *
   * Anything the browser cannot read as text is refused by name rather than
   * accepted and silently ignored, which is what "uploaded" used to mean.
   */
  const onDrop = async (acceptedFiles) => {
    const attachments = [...(formState.attachments || [])];
    const accepted = [...uploadedFiles];
    const refused = [];

    for (const file of acceptedFiles) {
      const readable = /\.(txt|csv|tsv|md|json|log)$/i.test(file.name)
        || file.type.startsWith('text/');
      if (!readable) { refused.push(file.name); continue; }
      if (file.size > MAX_ATTACHMENT_BYTES) { refused.push(`${file.name} (too large)`); continue; }
      try {
        const text = await file.text();
        attachments.push({ name: file.name, text: text.slice(0, MAX_ATTACHMENT_CHARS) });
        accepted.push(file);
      } catch (err) {
        refused.push(file.name);
      }
    }

    setFormState(prev => ({ ...prev, attachments }));
    setUploadedFiles(accepted);
    if (accepted.length > uploadedFiles.length) {
      toast({ title: 'Attached', description: `${accepted.length - uploadedFiles.length} file(s) will be given to the writer as data.` });
    }
    if (refused.length > 0) {
      toast({
        variant: 'destructive',
        title: 'Not attached',
        description: `${refused.join(', ')}. Text and CSV can be read here; PDFs and spreadsheets cannot yet, so paste the figures into the notes instead.`,
      });
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  const handleSubmit = (e) => {
    e.preventDefault();
    onGenerate(formState);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 h-full flex flex-col">
      <div className="flex-grow space-y-4 pr-2 overflow-y-auto">
        <h2 className="text-2xl font-bold text-white mb-2">Report Autopilot Setup</h2>
        
        <CollapsibleSection title="Report Type" icon={<FileText />} defaultOpen>
          <div className="space-y-4">
            <label htmlFor="report_template">Select Report Template</label>
            <Select onValueChange={handleTemplateChange} value={formState.report_type_id} disabled={!templates?.types?.length}>
              <SelectTrigger id="report_template" className="w-full bg-slate-800 border-slate-600">
                <SelectValue placeholder="Select a report type..." />
              </SelectTrigger>
              <SelectContent>
                {templates?.types?.map(template => (
                  <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Project Metadata" icon={<Settings />} defaultOpen>
          <div className="grid grid-cols-2 gap-4">
            <div><label htmlFor="project_name">Project Name</label><Input id="project_name" value={formState.project_name} onChange={e => handleInputChange('project_name', e.target.value)} /></div>
            <div><label htmlFor="field_name">Field</label><Input id="field_name" value={formState.field_name} onChange={e => handleInputChange('field_name', e.target.value)} /></div>
            <div><label htmlFor="well_name">Well</label><Input id="well_name" value={formState.well_name} onChange={e => handleInputChange('well_name', e.target.value)} /></div>
            <div><label htmlFor="author">Author</label><Input id="author" value={formState.author} onChange={e => handleInputChange('author', e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div><label htmlFor="date_start">Date Start</label><Input id="date_start" type="date" value={formState.date_start} onChange={e => handleInputChange('date_start', e.target.value)} /></div>
            <div><label htmlFor="date_end">Date End</label><Input id="date_end" type="date" value={formState.date_end} onChange={e => handleInputChange('date_end', e.target.value)} /></div>
          </div>
          <div className="mt-4"><label htmlFor="objectives">Objectives</label><Textarea id="objectives" value={formState.objectives} onChange={e => handleInputChange('objectives', e.target.value)} /></div>
          <div className="mt-4">
            <label>KPIs</label>
            {(formState.kpis || []).map((kpi, index) => (
              <div key={index} className="flex items-center gap-2 mb-2">
                <Input placeholder="Key" value={kpi.key} onChange={e => handleKpiChange(index, 'key', e.target.value)} />
                <Input placeholder="Value" value={kpi.value} onChange={e => handleKpiChange(index, 'value', e.target.value)} />
                <Button type="button" variant="ghost" size="icon" onClick={() => removeKpi(index)}><MinusCircle className="h-5 w-5 text-red-400" /></Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addKpi} className="w-full mt-1 border-lime-400 text-lime-400"><PlusCircle className="h-4 w-4 mr-2" />Add KPI</Button>
          </div>
          <div className="mt-4"><label htmlFor="notes">Notes</label><Textarea id="notes" value={formState.notes} onChange={e => handleInputChange('notes', e.target.value)} placeholder="Additional context or notes for the AI..." /></div>
        </CollapsibleSection>

        <CollapsibleSection title="Supporting Documents" icon={<FileUp />}>
          <div {...getRootProps()} className="p-6 border-2 border-dashed border-slate-600 rounded-lg text-center cursor-pointer hover:border-lime-400 transition-colors">
            <input {...getInputProps()} />
            {isDragActive ? <p>Drop the files here ...</p> : <p>Drag 'n' drop files here, or click to select</p>}
          </div>
          <ul className="mt-2 text-sm text-slate-300">
            {uploadedFiles.map(file => <li key={file.path}>{file.path} - {(file.size / 1024).toFixed(2)} KB</li>)}
          </ul>
        </CollapsibleSection>

        <CollapsibleSection title="Report Sections" icon={<ListChecks />}>
          <div className="space-y-2">
            {currentSections.map((section) => (
              <div key={section.id} className="flex items-center space-x-2">
                <Checkbox id={`section-${section.id}`} checked={formState.selected_sections.includes(section.id)} onCheckedChange={(checked) => handleSectionToggle(section.id, checked)} />
                <label htmlFor={`section-${section.id}`} className="text-sm font-medium leading-none">{section.name}</label>
              </div>
            ))}
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Advanced Options" icon={<SlidersHorizontal />}>
          <div className="space-y-4">
            <div>
              <label>Detail Level</label>
              <RadioGroup value={formState.detail_level} onValueChange={val => handleInputChange('detail_level', val)} className="flex gap-4 mt-2">
                <div className="flex items-center space-x-2"><RadioGroupItem value="brief" id="r1" /><label htmlFor="r1">Brief</label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="standard" id="r2" /><label htmlFor="r2">Standard</label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="detailed" id="r3" /><label htmlFor="r3">Detailed</label></div>
              </RadioGroup>
            </div>
            <div>
              <label htmlFor="max_pages">Max Pages</label>
              <Input id="max_pages" type="number" value={formState.max_pages} onChange={e => handleInputChange('max_pages', Number(e.target.value))} />
            </div>
            <div>
              <label>Upgrade Sections to GPT-4</label>
              <div className="flex flex-wrap gap-2 mt-2">
                 {currentSections.map((section) => (
                   <div key={`gpt4-${section.id}`} className="flex items-center space-x-2 bg-slate-700 px-3 py-1 rounded-full">
                     <Checkbox id={`gpt4-${section.id}`} checked={formState.gpt4_sections.includes(section.id)} onCheckedChange={(checked) => handleGpt4Toggle(section.id, checked)} />
                     <label htmlFor={`gpt4-${section.id}`} className="text-sm font-medium">{section.name}</label>
                   </div>
                 ))}
              </div>
            </div>
          </div>
        </CollapsibleSection>
      </div>

      <div className="pt-4 border-t border-slate-700">
        <Button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-semibold py-3 text-lg">
          {loading ? <Loader2 className="animate-spin h-5 w-5 mr-2" /> : <Bot className="w-5 h-5 mr-2" />}
          Generate Report
        </Button>
      </div>
    </form>
  );
};

export default InputPanel;