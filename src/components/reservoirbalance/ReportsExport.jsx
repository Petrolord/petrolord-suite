import React from 'react';
    import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
    import { Button } from '@/components/ui/button';
    import { useToast } from '@/components/ui/use-toast';
    import { FileDown, Send } from 'lucide-react';
    import Papa from 'papaparse';
    import jsPDF from 'jspdf';
    import 'jspdf-autotable';
    import { supabase } from '@/lib/customSupabaseClient';
    import { useNavigate } from 'react-router-dom';

    const ReportsExport = ({
      projectName,
      productionData,
      pressureData,
      pvtData,
      mbalResults,
      aquiferResults,
      forecastResults,
    }) => {
      const { toast } = useToast();
      const navigate = useNavigate();

      const handleExportCSV = () => {
        if (!forecastResults || !forecastResults.chartData) {
          toast({
            title: 'No Data to Export',
            description: 'Please run a forecast before exporting to CSV.',
            variant: 'destructive',
          });
          return;
        }

        const csvData = forecastResults.chartData.map(d => ({
            Date: d.date,
            'History (bbl/d)': d.history || '',
            'P10 Forecast (bbl/d)': d.p10 || '',
            'P50 Forecast (bbl/d)': d.p50 || '',
            'P90 Forecast (bbl/d)': d.p90 || '',
        }));

        try {
            const csv = Papa.unparse(csvData);
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.setAttribute('download', `${projectName || 'export'}_forecast.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            toast({ title: 'CSV Exported', description: 'Forecast data has been downloaded.' });
        } catch(err) {
            toast({ title: 'Export Failed', description: 'Could not generate CSV file.', variant: 'destructive' });
        }
      };

      const handleGeneratePDF = () => {
        if (!mbalResults || !forecastResults) {
            toast({
              title: 'No Data to Export',
              description: 'Please run Material Balance and Forecast before generating a report.',
              variant: 'destructive',
            });
            return;
        }
        const doc = new jsPDF();

        doc.setFontSize(18);
        doc.setTextColor(34, 197, 94);
        doc.text(`Reservoir Surveillance Report: ${projectName}`, 14, 22);

        doc.setFontSize(11);
        doc.setTextColor(40);
        doc.text(`Report generated on: ${new Date().toLocaleDateString()}`, 14, 30);
        
        let y = 40;

        const addSection = (title, data) => {
            if (y > 250) {
                doc.addPage();
                y = 20;
            }
            doc.setFontSize(14);
            doc.setTextColor(34, 197, 94);
            doc.text(title, 14, y);
            y += 7;
            doc.autoTable({
                body: data.map(row => [row[0], String(row[1])]),
                startY: y,
                theme: 'grid',
                styles: { fontSize: 10 },
                headStyles: { fillColor: [30, 41, 59] },
            });
            y = doc.autoTable.previous.finalY + 10;
        };
        
        const mbalData = [
            ['OOIP (stb)', mbalResults?.ooip ? mbalResults.ooip.toLocaleString(undefined, { maximumFractionDigits: 0 }) : 'N/A'],
            ['Gas Cap (m)', mbalResults?.m ? mbalResults.m.toFixed(2) : 'N/A'],
            ['Depletion Drive Index (%)', mbalResults?.driveIndices?.DDI ? (mbalResults.driveIndices.DDI * 100).toFixed(1) : 'N/A'],
            ['Gas Cap Drive Index (%)', mbalResults?.driveIndices?.GDI ? (mbalResults.driveIndices.GDI * 100).toFixed(1) : 'N/A'],
            ['Water Drive Index (%)', mbalResults?.driveIndices?.WDI ? (mbalResults.driveIndices.WDI * 100).toFixed(1) : 'N/A'],
        ];
        addSection('Material Balance Results', mbalData);

        if(aquiferResults) {
            const aquiferData = [
                ['Model', aquiferResults.modelType],
                ['Cumulative Influx (bbl)', aquiferResults.cumulativeWe ? aquiferResults.cumulativeWe.toLocaleString(undefined, {maximumFractionDigits: 0}) : 'N/A'],
            ];
            addSection('Aquifer Model Results', aquiferData);
        }
        
        const forecastData = [
            ['P50 EUR (bbl)', forecastResults.p50.eur ? forecastResults.p50.eur.toLocaleString(undefined, {maximumFractionDigits: 0}) : 'N/A'],
            ['P50 Remaining (bbl)', forecastResults.p50.remaining ? forecastResults.p50.remaining.toLocaleString(undefined, {maximumFractionDigits: 0}) : 'N/A'],
            ['P50 Time to Limit (years)', forecastResults.p50.timeToLimit ? forecastResults.p50.timeToLimit.toFixed(1) : 'N/A'],
            ['P10 EUR (bbl)', forecastResults.p10.eur ? forecastResults.p10.eur.toLocaleString(undefined, {maximumFractionDigits: 0}) : 'N/A'],
            ['P90 EUR (bbl)', forecastResults.p90.eur ? forecastResults.p90.eur.toLocaleString(undefined, {maximumFractionDigits: 0}) : 'N/A'],
        ];
        addSection('Production Forecast Summary', forecastData);
        
        doc.save(`${projectName || 'report'}.pdf`);
        toast({ title: 'PDF Report Generated', description: 'Summary report has been downloaded.' });
      };

      const handlePushToEPE = async () => {
        if (!forecastResults) {
            toast({ title: 'No Forecast Data', description: 'Please run a forecast first.', variant: 'destructive' });
            return;
        }
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            toast({ title: 'Not Authenticated', description: 'Please log in.', variant: 'destructive' });
            return;
        }

        const caseName = `${projectName} - MBAL Forecast`;
        const { data: caseData, error: caseError } = await supabase
            .from('epe_cases')
            .insert({ user_id: user.id, case_name: caseName, description: 'Generated from Material Balance Studio' })
            .select()
            .single();

        if (caseError) {
            toast({ title: 'Failed to create EPE case', description: caseError.message, variant: 'destructive' });
            return;
        }

        const productionDataForEPE = forecastResults.chartData
            .filter(d => d.p50)
            .map(d => ({ date: d.date, oil: d.p50 }));

        const { error: prodError } = await supabase
            .from('epe_production_volumes')
            .insert({
                case_id: caseData.id,
                user_id: user.id,
                data: productionDataForEPE,
                file_name: 'mbal_forecast.json'
            });

        if (prodError) {
            toast({ title: 'Failed to push production data', description: prodError.message, variant: 'destructive' });
        } else {
            toast({
                title: 'Pushed to EPE Cloud!',
                description: `Case '${caseName}' created.`,
                action: <Button onClick={() => navigate(`/dashboard/apps/economic-project-management/epe/cases/${caseData.id}`)}>View Case</Button>,
            });
        }
      };

      return (
        <div className="space-y-6">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-lime-300">Reports & Export</CardTitle>
              <CardDescription>Generate comprehensive reports and export data for other applications.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-slate-300">Generate PDF summary reports, export raw data tables, or push results directly to other Petrolord apps.</p>
              <div className="flex flex-wrap gap-4">
                <Button onClick={handleGeneratePDF} variant="outline">
                  <FileDown className="w-4 h-4 mr-2" />
                  Generate PDF Report
                </Button>
                <Button onClick={handleExportCSV} variant="outline">
                  <FileDown className="w-4 h-4 mr-2" />
                  Export Data as CSV
                </Button>
                <Button onClick={handlePushToEPE} className="bg-gradient-to-r from-purple-500 to-indigo-500">
                  <Send className="w-4 h-4 mr-2" />
                  Push to EPE Cloud
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    };

    export default ReportsExport;