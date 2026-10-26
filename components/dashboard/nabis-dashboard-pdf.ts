import html2canvas from 'html2canvas-pro';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ProcessedNabisOrder } from '@/lib/dashboard/nabis-types';
import type { DashboardDateRange } from '@/lib/dashboard/nabis-types';
import { formatCurrency } from '@/lib/dashboard/nabis-client';

export async function downloadDashboardPdf({ tableData, dateRange, selectedRangeLabel }: {
  tableData: ProcessedNabisOrder[];
  dateRange: DashboardDateRange;
  selectedRangeLabel: string;
}) {
  await new Promise((resolve) => setTimeout(resolve, 600));

  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  let currentY = margin;

  const addSection = async (elementId: string) => {
    const element = document.getElementById(elementId);
    if (!element) return;

    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    const imgWidth = pageWidth - margin * 2;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    if (currentY + imgHeight > pageHeight - margin) {
      doc.addPage();
      currentY = margin;
    }
    // Tall tables and legends must continue on another page, not be clipped
    // outside the PDF page boundary.
    const pixelsPerMm = canvas.width / imgWidth;
    let sourceY = 0;
    while (sourceY < canvas.height) {
      const sliceHeight = Math.min(canvas.height - sourceY, Math.floor((pageHeight - margin - currentY) * pixelsPerMm));
      if (sliceHeight <= 0) {
        doc.addPage();
        currentY = margin;
        continue;
      }
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = sliceHeight;
      const context = slice.getContext('2d');
      if (!context) throw new Error('Unable to render the PDF section.');
      context.drawImage(canvas, 0, sourceY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
      const heightMm = sliceHeight / pixelsPerMm;
      doc.addImage(slice.toDataURL('image/jpeg', 0.95), 'JPEG', margin, currentY, imgWidth, heightMm);
      sourceY += sliceHeight;
      currentY += heightMm;
      if (sourceY < canvas.height) {
        doc.addPage();
        currentY = margin;
      }
    }
    currentY += 8;
  };

  doc.setFontSize(18);
  doc.setTextColor(30, 41, 59);
  doc.text('PICC Nabis Sales Dashboard', margin, currentY + 6);
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  const monthText = `Range: ${selectedRangeLabel}`;
  doc.text(monthText, pageWidth - margin - doc.getTextWidth(monthText), currentY + 6);
  currentY += 15;

  for (const sectionId of ['kpi-section', 'trend-chart-section', 'sales-trend-section', 'rep-revenue-chart', 'rep-month-metrics-card', 'market-share-card']) {
    await addSection(sectionId);
  }

  if (currentY > pageHeight - 40) {
    doc.addPage();
    currentY = margin;
  } else {
    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    doc.text(`Order Details (${selectedRangeLabel})`, margin, currentY);
    currentY += 5;
  }

  autoTable(doc, {
    startY: currentY,
    head: [['Date', 'Order #', 'Customer', 'Rep', 'Status', 'Total']],
    body: tableData.map((order) => [
      order.createdDate.toLocaleDateString(),
      order.orderNumber,
      order.customerName,
      order.salesRep,
      order.status,
      formatCurrency(order.total),
    ]),
    theme: 'striped',
    headStyles: { fillColor: [29, 78, 216] },
    styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
    margin: { left: margin, right: margin, bottom: margin },
  });

  doc.save(`Nabis_Sales_Report_${dateRange.start}_to_${dateRange.end}.pdf`);
}
