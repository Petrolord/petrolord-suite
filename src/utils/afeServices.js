import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';

// --- Partner Management Services ---

/**
 * Split a cost across joint-venture partners by working interest.
 *
 * The operator carries whatever the partners do not, so the operator share is
 * 100 percent less the sum of the partner interests.
 *
 * Economics E4 added `valid` and `note`. Partner interests are typed in one
 * at a time and nothing in the data model forces them to add up: a set
 * summing to more than 100 gives the operator a NEGATIVE share, and one
 * summing to less leaves the operator carrying a balance that may simply be a
 * partner nobody entered. Either way the allocation is still returned, so the
 * numbers are visible, but it is flagged rather than billed out quietly.
 *
 * @param {number} totalCost cost to allocate
 * @param {{working_interest: number}[]} partners
 */
export const calculatePartnerCosts = (totalCost, partners = []) => {
  const result = partners.map(p => ({
    ...p,
    shareAmount: totalCost * (Number(p.working_interest) || 0) / 100,
    billingStatus: 'Pending'
  }));

  const partnerTotal = partners.reduce((sum, p) => sum + (Number(p.working_interest) || 0), 0);
  const operatorShare = 100 - partnerTotal;
  const operatorAmount = totalCost * (operatorShare / 100);

  let note = null;
  if (operatorShare < 0) {
    note = `Partner working interests total ${partnerTotal.toFixed(2)} percent, which is more than the whole. The operator share below is negative; correct the interests before billing.`;
  }

  return {
    partnerAllocations: result,
    operatorShare,
    operatorAmount,
    partnerTotal,
    valid: operatorShare >= 0,
    note
  };
};

// --- Reporting Services ---

export const generateAFESummaryPDF = (afe, costItems, partners) => {
  const doc = new jsPDF();
  const currency = afe.currency || 'USD';

  // Header
  doc.setFontSize(18);
  doc.text(`AFE Summary Report: ${afe.afe_number}`, 14, 20);
  doc.setFontSize(11);
  doc.text(`Project: ${afe.afe_name}`, 14, 30);
  doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 36);
  doc.text(`Status: ${afe.status}`, 14, 42);

  // Financial Summary
  const totalBudget = costItems.reduce((sum, i) => sum + (i.budget || 0), 0);
  const totalActual = costItems.reduce((sum, i) => sum + (i.actual || 0), 0);
  const totalVariance = totalBudget - totalActual;

  doc.autoTable({
    startY: 50,
    head: [['Metric', 'Amount']],
    body: [
      ['Total Approved Budget', `${totalBudget.toLocaleString()} ${currency}`],
      ['Total Actual Cost', `${totalActual.toLocaleString()} ${currency}`],
      ['Variance', `${totalVariance.toLocaleString()} ${currency}`],
      ['% Spent', `${((totalActual / totalBudget) * 100).toFixed(2)}%`]
    ],
    theme: 'striped',
    headStyles: { fillColor: [22, 163, 74] }
  });

  // Cost Breakdown
  doc.text('Cost Breakdown by Category', 14, doc.lastAutoTable.finalY + 15);
  
  const cats = {};
  costItems.forEach(item => {
    const cat = item.category || 'General';
    if (!cats[cat]) cats[cat] = { budget: 0, actual: 0 };
    cats[cat].budget += item.budget || 0;
    cats[cat].actual += item.actual || 0;
  });

  const catData = Object.entries(cats).map(([k, v]) => [
    k, 
    v.budget.toLocaleString(), 
    v.actual.toLocaleString(), 
    (v.budget - v.actual).toLocaleString()
  ]);

  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 20,
    head: [['Category', 'Budget', 'Actual', 'Variance']],
    body: catData,
  });

  // Partner Section
  if (partners && partners.length > 0) {
    doc.text('Partner Allocations', 14, doc.lastAutoTable.finalY + 15);
    const { partnerAllocations, operatorAmount, operatorShare } = calculatePartnerCosts(totalActual, partners);
    
    const partnerRows = partnerAllocations.map(p => [
        p.name, 
        `${p.working_interest}%`, 
        `${p.shareAmount.toLocaleString()} ${currency}`
    ]);
    // Add Operator
    partnerRows.unshift(['Operator (Net)', `${operatorShare.toFixed(2)}%`, `${operatorAmount.toLocaleString()} ${currency}`]);

    doc.autoTable({
        startY: doc.lastAutoTable.finalY + 20,
        head: [['Partner', 'Working Interest', 'Share of Cost']],
        body: partnerRows
    });
  }

  doc.save(`AFE_Summary_${afe.afe_number}.pdf`);
};

export const generateBillingStatement = (afe, partner, amount, period) => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text('Joint Venture Billing Statement', 105, 20, null, null, 'center');
    
    doc.setFontSize(12);
    doc.text(`To: ${partner.name}`, 14, 40);
    doc.text(`AFE: ${afe.afe_number} - ${afe.afe_name}`, 14, 46);
    doc.text(`Period: ${period}`, 14, 52);
    
    doc.setLineWidth(0.5);
    doc.line(14, 56, 196, 56);

    doc.setFontSize(14);
    doc.text(`Amount Due: ${amount.toLocaleString()} ${afe.currency || 'USD'}`, 14, 70);
    
    doc.setFontSize(10);
    doc.text('Please remit payment within 30 days.', 14, 80);
    
    doc.save(`Billing_${partner.name}_${period}.pdf`);
};

// --- Excel Export ---
export const exportToExcel = (data, filename, sheetName = "Sheet1") => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${filename}.xlsx`);
};