import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';

// Helper to format currency
const formatCurrency = (value) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
};

// Main generator function
export const generateQuotePDF = async (quote, organization, config) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  
  // --- Branding / Header (Text Based) ---
  // Gold color for brand
  doc.setTextColor(212, 175, 55); 
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("LORDSWAY ENERGY TECHNOLOGIES", 14, 20);
  
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.setFont("helvetica", "normal");
  doc.text("Advanced Energy Solutions & Software", 14, 26);
  doc.text("Lagos, Nigeria | www.petrolord.com", 14, 31);

  // Divider Line
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(0.5);
  doc.line(14, 36, pageWidth - 14, 36);

  // --- Quote Details ---
  doc.setTextColor(0);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("PRO FORMA INVOICE / QUOTE", pageWidth - 14, 25, { align: "right" });
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Ref: ${quote.id}`, pageWidth - 14, 32, { align: "right" });
  doc.text(`Date: ${new Date(quote.date).toLocaleDateString()}`, pageWidth - 14, 37, { align: "right" });
  doc.text(`Valid Until: ${new Date(quote.expiryDate).toLocaleDateString()}`, pageWidth - 14, 42, { align: "right" });

  // --- Bill To ---
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Bill To:", 14, 50);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(organization.name || "Valued Client", 14, 56);
  doc.text(organization.contact_email || "", 14, 61);
  if(organization.address) doc.text(organization.address, 14, 66);

  // --- Items Table ---
  const tableRows = quote.config.calculated.breakdown.map(item => [
    item.item,
    item.type === 'discount' ? 'Discount' : 'License/Svc',
    formatCurrency(item.price || 0),
    formatCurrency(item.cost)
  ]);

  // Totals Row
  tableRows.push([
    { content: 'Subtotal (Monthly)', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold' } },
    formatCurrency(quote.config.calculated.monthlyNet)
  ]);
  
  const billingTerm = quote.billing_term === 'annual' ? '12 Months' : '1 Month';
  tableRows.push([
    { content: `Billing Term (${billingTerm})`, colSpan: 3, styles: { halign: 'right' } },
    ''
  ]);

  tableRows.push([
    { content: 'VAT (7.5%)', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold' } },
    formatCurrency(quote.config.calculated.vatAmount)
  ]);

  tableRows.push([
    { content: 'Total Due', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold', textColor: [212, 175, 55] } },
    { content: formatCurrency(quote.total_amount), styles: { fontStyle: 'bold', textColor: [212, 175, 55] } }
  ]);

  autoTable(doc, {
    startY: 75,
    head: [['Description', 'Type', 'Unit Price', 'Amount']],
    body: tableRows,
    theme: 'grid',
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 'auto' },
      3: { halign: 'right' },
      2: { halign: 'right' }
    }
  });

  // --- Payment Info ---
  let finalY = doc.lastAutoTable.finalY + 15;
  
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Payment Instructions", 14, finalY);
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  finalY += 7;
  doc.text("Please make payments to the following account:", 14, finalY);
  finalY += 6;
  doc.text("Bank: Providus Bank", 14, finalY);
  finalY += 5;
  doc.text("Account Name: Lordsway Energy Tech Ltd", 14, finalY);
  finalY += 5;
  doc.text("Account Number: 1305745085", 14, finalY);
  
  finalY += 10;
  if(quote.paystack_link) {
      doc.setTextColor(0, 0, 255);
      doc.textWithLink("Click here to pay online via Paystack", 14, finalY, { url: quote.paystack_link });
      doc.setTextColor(0);
  } else {
      doc.text("Online payment link available in your dashboard.", 14, finalY);
  }

  // --- Terms ---
  finalY += 15;
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text("Terms & Conditions:", 14, finalY);
  doc.text("1. All prices are in USD unless otherwise stated.", 14, finalY + 4);
  doc.text("2. Payment is due upon receipt of invoice.", 14, finalY + 8);
  doc.text("3. This quote is valid for 30 days from the date of issue.", 14, finalY + 12);
  
  return doc;
};