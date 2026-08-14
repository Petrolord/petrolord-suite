import React, { useState, useMemo } from 'react';
import { usePetroleumEconomics } from '../contexts/PetroleumEconomicsContext';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Edit2, Save, Trash2, Printer, Copy } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const ReportingTab = () => {
  const { 
    activeScenario, 
    modelSettings, 
    priceAssumptions, 
    costData, 
    fiscalTerms, 
    productionData, 
    calculationResults, 
    scenarioNotes, 
    saveScenarioNote, 
    deleteScenarioNote,
    currentProject,
    currentModel
  } = usePetroleumEconomics();
  
  const { toast } = useToast();
  const [editingSection, setEditingSection] = useState(null);
  const [tempNotes, setTempNotes] = useState({});

  // Helper to format currency
  const fmt = (val, type = 'currency') => {
    if (val === undefined || val === null || isNaN(val)) return '-';
    if (type === 'currency') return new Intl.NumberFormat('en-US', { style: 'currency', currency: modelSettings.currency || 'USD', maximumFractionDigits: 0 }).format(val);
    if (type === 'percent') return (val).toFixed(1) + '%';
    if (type === 'number') return new Intl.NumberFormat('en-US').format(val);
    return val;
  };

  const getMM = (val) => (val || 0) / 1000000;

  // --- Derived Calculations ---
  const reportData = useMemo(() => {
    if (!activeScenario || !calculationResults) return null;

    // Totals
    const totalCapex = calculationResults.annualResults.reduce((acc, r) => acc + r.capex, 0);
    const totalOpex = calculationResults.annualResults.reduce((acc, r) => acc + r.opex, 0);
    // Abandonment usually last year capex or specifically flagged in inputs. Using costData directly for clarity.
    const abex = costData.capexProfile?.reduce((acc, r) => acc + (r.abandonment_capex || 0), 0) || 0;

    // Peak Rates
    let maxOilRate = 0;
    let maxRev = 0;
    productionData.forEach(r => {
        if ((r.oil_rate || 0) > maxOilRate) maxOilRate = r.oil_rate;
    });
    calculationResults.annualResults.forEach(r => {
        if (r.gross_revenue > maxRev) maxRev = r.gross_revenue;
    });

    // Schedule: Plateau
    // Simple plateau logic: Years where oil rate > 90% of maxOilRate
    const plateauThreshold = maxOilRate * 0.9;
    const plateauYears = productionData.filter(r => (r.oil_rate || 0) >= plateauThreshold).length;
    
    // Decline Rate: (Rate at end of plateau - Rate at end) / Years?
    // Or simple last year rate vs peak.
    // Let's use simple CAGR from Peak to End.
    const peakYearRow = productionData.find(r => (r.oil_rate || 0) === maxOilRate);
    const lastYearRow = productionData[productionData.length - 1];
    let declineRate = 0;
    if (peakYearRow && lastYearRow && lastYearRow.year > peakYearRow.year && maxOilRate > 0) {
        const years = lastYearRow.year - peakYearRow.year;
        // Annual effective decline
        declineRate = (1 - Math.pow(lastYearRow.oil_rate / maxOilRate, 1/years)) * 100;
    }

    return {
        assumptions: [
            { label: 'Oil Price (Base)', value: `$${priceAssumptions.oilPrice}/bbl` },
            { label: 'Gas Price (Base)', value: `$${priceAssumptions.gasPrice}/mcf` },
            { label: 'Escalation', value: fmt(priceAssumptions.escalation * 100, 'percent') },
            { label: 'Royalty Rate', value: fmt(fiscalTerms?.royalty_rate, 'percent') },
            { label: 'Corp Tax Rate', value: fmt(fiscalTerms?.tax_rate, 'percent') },
            { label: 'Discount Rate', value: fmt(modelSettings.discountRate * 100, 'percent') }
        ],
        schedule: [
            { label: 'Start Date', value: modelSettings.startYear },
            { label: 'Project Duration', value: `${modelSettings.endYear - modelSettings.startYear + 1} years` },
            { label: 'Plateau Duration', value: `${plateauYears} years` },
            { label: 'Est. Decline Rate', value: declineRate > 0 ? fmt(declineRate, 'percent') : 'N/A' }
        ],
        peakRates: [
            { label: 'Peak Oil Rate', value: `${fmt(maxOilRate, 'number')} bbl/d` }, // Assuming input is daily
            { label: 'Peak Revenue', value: `${fmt(getMM(maxRev), 'currency')} MM/yr` }
        ],
        totals: [
            { label: 'Total CAPEX', value: `${fmt(getMM(totalCapex), 'currency')} MM` },
            { label: 'Total OPEX', value: `${fmt(getMM(totalOpex), 'currency')} MM` },
            { label: 'Abandonment (ABEX)', value: `${fmt(getMM(abex), 'currency')} MM` }
        ],
        economics: [
            { label: 'NPV (10%)', value: `${fmt(calculationResults.metrics.npv, 'currency')} MM` }, 
            { label: 'IRR', value: fmt(calculationResults.metrics.irr, 'percent') },
            { label: 'DPI', value: calculationResults.metrics.dpi?.toFixed(2) + 'x' },
            { label: 'Payback', value: `${calculationResults.metrics.payback_year ? (calculationResults.metrics.payback_year - modelSettings.startYear).toFixed(1) : '-'} years` }
        ],
        breakevens: [
            { label: 'Breakeven Price', value: calculationResults.metrics.breakeven_price != null ? `$${calculationResults.metrics.breakeven_price.toFixed(2)}/boe` : 'N/A' },
            { label: 'Unit Tech Cost', value: `$${calculationResults.metrics.unit_technical_cost?.toFixed(2)}/boe` }
        ]
    };
  }, [activeScenario, calculationResults, productionData, costData, priceAssumptions, fiscalTerms, modelSettings]);

  // --- Handlers ---

  const handleEditNote = (section) => {
      setTempNotes(prev => ({ ...prev, [section]: scenarioNotes[section]?.notes_text || '' }));
      setEditingSection(section);
  };

  const handleSaveNote = async (section) => {
      const text = tempNotes[section];
      await saveScenarioNote(activeScenario.id, section, text);
      setEditingSection(null);
      toast({ title: 'Note Saved', description: 'Analysis commentary updated.' });
  };

  const handleDeleteNote = async (section) => {
      await deleteScenarioNote(activeScenario.id, section);
      setEditingSection(null);
      setTempNotes(prev => ({ ...prev, [section]: '' }));
      toast({ title: 'Note Deleted', description: 'Commentary removed.' });
  };

  const handleCopyToClipboard = () => {
      if (!reportData) return;
      
      let text = `FDP Economics Summary\nProject: ${currentProject?.name}\nScenario: ${activeScenario?.name}\nDate: ${format(new Date(), 'PPP')}\n\n`;
      
      const appendSection = (title, items, key) => {
          text += `--- ${title} ---\n`;
          items.forEach(item => {
              text += `${item.label}: ${item.value}\n`;
          });
          if (scenarioNotes[key]?.notes_text) {
              text += `Note: ${scenarioNotes[key].notes_text}\n`;
          }
          text += `\n`;
      };

      appendSection("Assumptions", reportData.assumptions, 'assumptions');
      appendSection("Schedule & Production", [...reportData.schedule, ...reportData.peakRates], 'schedule');
      appendSection("Costs & Totals", reportData.totals, 'totals');
      appendSection("Economic KPIs", reportData.economics, 'economics');
      appendSection("Breakeven Analysis", reportData.breakevens, 'breakevens');

      navigator.clipboard.writeText(text);
      toast({ title: "Copied", description: "Report text copied to clipboard." });
  };

  const handleGenerateReport = () => {
      if (!reportData) return;
      
      const doc = new jsPDF();
      
      // Title
      doc.setFontSize(22);
      doc.setTextColor(40);
      doc.text("FDP Economics Summary", 20, 20);
      
      doc.setFontSize(12);
      doc.text(`Project: ${currentProject?.name}`, 20, 30);
      doc.text(`Model: ${currentModel?.name}`, 20, 36);
      doc.text(`Scenario: ${activeScenario?.name}`, 20, 42);
      doc.text(`Date: ${format(new Date(), 'PPP')}`, 20, 48);
      
      let yPos = 60;

      const addSection = (title, items, key) => {
          if (yPos > 250) { doc.addPage(); yPos = 20; }
          
          // Section Header
          doc.setFillColor(240, 240, 245);
          doc.rect(20, yPos - 5, 170, 8, 'F');
          doc.setFontSize(12);
          doc.setFont(undefined, 'bold');
          doc.text(title, 22, yPos);
          yPos += 10;

          // Data Grid style using autoTable for layout
          const tableBody = [];
          for (let i = 0; i < items.length; i += 2) {
              const row = [];
              row.push(items[i].label, items[i].value);
              if (items[i+1]) {
                  row.push(items[i+1].label, items[i+1].value);
              } else {
                  row.push("", "");
              }
              tableBody.push(row);
          }

          doc.autoTable({
              startY: yPos,
              body: tableBody,
              theme: 'plain',
              styles: { fontSize: 10, cellPadding: 1 },
              columnStyles: { 
                  0: { fontStyle: 'bold', width: 40 },
                  1: { width: 45 },
                  2: { fontStyle: 'bold', width: 40 },
                  3: { width: 45 }
              },
              margin: { left: 20 }
          });
          
          yPos = doc.lastAutoTable.finalY + 5;

          // Notes
          const note = scenarioNotes[key]?.notes_text;
          if (note) {
              doc.setFont(undefined, 'italic');
              doc.setFontSize(9);
              doc.setTextColor(80);
              const splitNote = doc.splitTextToSize(`Note: ${note}`, 170);
              doc.text(splitNote, 20, yPos);
              yPos += (splitNote.length * 5) + 10;
              doc.setTextColor(0);
              doc.setFont(undefined, 'normal');
          } else {
              yPos += 5;
          }
      };

      addSection("Assumptions", reportData.assumptions, 'assumptions');
      addSection("Schedule & Production", [...reportData.schedule, ...reportData.peakRates], 'schedule');
      addSection("Costs & Totals", reportData.totals, 'totals');
      addSection("Economic KPIs", reportData.economics, 'economics');
      addSection("Breakeven Analysis", reportData.breakevens, 'breakevens');

      doc.save(`FDP_Summary_${activeScenario.name}.pdf`);
      toast({ title: "Report Generated", description: "PDF downloaded successfully." });
  };

  if (!activeScenario) return <div className="p-8 text-center text-slate-500">Please select a scenario to view reporting.</div>;
  if (!reportData) return <div className="p-8 text-center text-slate-500">Run the model to generate report data.</div>;

  return (
    <div className="flex flex-col h-full space-y-6 w-full pb-10">
        
        {/* Header Actions */}
        <div className="flex justify-between items-center bg-slate-900 p-4 rounded-lg border border-slate-800 shrink-0">
            <div>
                <h2 className="text-xl font-bold text-slate-100">FDP Economics Summary</h2>
                <p className="text-sm text-slate-400">Executive overview of key project metrics and assumptions.</p>
            </div>
            <div className="flex gap-2">
                <Button onClick={handleCopyToClipboard} variant="outline" className="border-slate-700 bg-slate-800 text-slate-300 hover:text-white">
                    <Copy className="w-4 h-4 mr-2" /> Copy Text
                </Button>
                <Button onClick={handleGenerateReport} className="bg-emerald-600 hover:bg-emerald-500 text-white">
                    <Printer className="w-4 h-4 mr-2" /> Generate Report PDF
                </Button>
            </div>
        </div>

        {/* Report Sections Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 overflow-y-auto">
            <ReportSection 
                title="Assumptions" 
                data={reportData.assumptions} 
                sectionKey="assumptions"
                note={scenarioNotes['assumptions']}
                isEditing={editingSection === 'assumptions'}
                tempNote={tempNotes['assumptions']}
                onEdit={() => handleEditNote('assumptions')}
                onSave={() => handleSaveNote('assumptions')}
                onDelete={() => handleDeleteNote('assumptions')}
                onNoteChange={(val) => setTempNotes(prev => ({ ...prev, assumptions: val }))}
                onCancel={() => setEditingSection(null)}
            />
            <ReportSection 
                title="Schedule & Peaks" 
                data={[...reportData.schedule, ...reportData.peakRates]} 
                sectionKey="schedule"
                note={scenarioNotes['schedule']}
                isEditing={editingSection === 'schedule'}
                tempNote={tempNotes['schedule']}
                onEdit={() => handleEditNote('schedule')}
                onSave={() => handleSaveNote('schedule')}
                onDelete={() => handleDeleteNote('schedule')}
                onNoteChange={(val) => setTempNotes(prev => ({ ...prev, schedule: val }))}
                onCancel={() => setEditingSection(null)}
            />
            <ReportSection 
                title="Project Totals" 
                data={reportData.totals} 
                sectionKey="totals"
                note={scenarioNotes['totals']}
                isEditing={editingSection === 'totals'}
                tempNote={tempNotes['totals']}
                onEdit={() => handleEditNote('totals')}
                onSave={() => handleSaveNote('totals')}
                onDelete={() => handleDeleteNote('totals')}
                onNoteChange={(val) => setTempNotes(prev => ({ ...prev, totals: val }))}
                onCancel={() => setEditingSection(null)}
            />
            <ReportSection 
                title="Economics & Breakevens" 
                data={[...reportData.economics, ...reportData.breakevens]} 
                sectionKey="economics"
                note={scenarioNotes['economics']}
                isEditing={editingSection === 'economics'}
                tempNote={tempNotes['economics']}
                onEdit={() => handleEditNote('economics')}
                onSave={() => handleSaveNote('economics')}
                onDelete={() => handleDeleteNote('economics')}
                onNoteChange={(val) => setTempNotes(prev => ({ ...prev, economics: val }))}
                onCancel={() => setEditingSection(null)}
            />
        </div>
    </div>
  );
};

const ReportSection = ({ title, data, note, isEditing, tempNote, onEdit, onSave, onDelete, onNoteChange, onCancel }) => {
    return (
        <Card className="bg-slate-900 border-slate-800 flex flex-col">
            <CardHeader className="pb-3 border-b border-slate-800 bg-slate-950/30">
                <CardTitle className="text-base text-slate-200">{title}</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 p-4 space-y-4">
                {/* Data Grid */}
                <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                    {data.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center text-sm border-b border-slate-800/50 pb-1 last:border-0">
                            <span className="text-slate-400">{item.label}</span>
                            <span className="font-mono font-medium text-slate-200">{item.value}</span>
                        </div>
                    ))}
                </div>

                {/* Narrative Notes Area */}
                <div className="mt-4 pt-4 border-t border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                        <Label className="text-xs font-semibold text-blue-400 uppercase tracking-wide">Narrative Notes</Label>
                        {!isEditing && (
                            <Button variant="ghost" size="sm" onClick={onEdit} className="h-6 w-6 p-0 hover:bg-slate-800 rounded-full">
                                <Edit2 className="w-3 h-3 text-slate-500 hover:text-white" />
                            </Button>
                        )}
                    </div>

                    {isEditing ? (
                        <div className="space-y-2 animate-in fade-in zoom-in-95 duration-200">
                            <Textarea 
                                value={tempNote} 
                                onChange={(e) => onNoteChange(e.target.value)} 
                                className="bg-slate-950 border-slate-700 min-h-[80px] text-sm"
                                placeholder="Add context regarding these figures..."
                            />
                            <div className="flex justify-end gap-2">
                                {note?.notes_text && (
                                    <Button variant="ghost" size="sm" onClick={onDelete} className="h-7 px-2 text-red-400 hover:text-red-300 hover:bg-red-950/20">
                                        <Trash2 className="w-3 h-3 mr-1" /> Delete
                                    </Button>
                                )}
                                <Button variant="ghost" size="sm" onClick={onCancel} className="h-7">Cancel</Button>
                                <Button size="sm" onClick={onSave} className="h-7 bg-blue-600 hover:bg-blue-500 text-white">
                                    <Save className="w-3 h-3 mr-1.5" /> Save
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="min-h-[40px] text-sm text-slate-400 italic bg-slate-950/30 p-3 rounded border border-slate-800/50">
                            {note?.notes_text ? (
                                <div>
                                    <p>{note.notes_text}</p>
                                    <div className="mt-2 text-[10px] text-slate-600 flex justify-end">
                                        Updated: {format(new Date(note.updated_at), 'MMM d, p')}
                                    </div>
                                </div>
                            ) : (
                                <span className="opacity-50">No notes added. Click edit to add commentary.</span>
                            )}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};

export default ReportingTab;