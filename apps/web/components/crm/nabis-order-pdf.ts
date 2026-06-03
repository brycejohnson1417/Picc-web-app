'use client';

export type NabisOrderPdfLine = {
  productName: string;
  detailLine?: string | null;
  unitPrice: number;
  quantity: number;
  total: number;
};

export type NabisOrderPdfOptions = {
  fileName: string;
  sellerName: string;
  itemCount: number;
  totalLineAmount: number;
  poSoNumber: string;
  salesRepName: string | null;
  lines: NabisOrderPdfLine[];
  subtotal: number;
  taxRate: number;
  taxTotal: number;
  creditMemo?: number;
  totalBalanceDue: number;
  paymentTerms: string;
  footerNote?: string | null;
};

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

export function formatInteger(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

export function formatDateTime(value: string | null) {
  if (!value) return 'Unavailable';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatDateOnly(value: string | null) {
  if (!value) return 'Unavailable';
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function sanitizeFileName(value: string) {
  return value
    .trim()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export async function downloadNabisOrderPdf(options: NabisOrderPdfOptions) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: [1000, 1428] });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageMargin = 26;
  const contentWidth = pageWidth - pageMargin * 2;
  const taxRateLabel = `${Math.round(options.taxRate * 100)}%`;

  function drawFrame() {
    doc.setFillColor(250, 250, 251);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(225, 228, 233);
    doc.roundedRect(pageMargin, 26, contentWidth, pageHeight - 52, 10, 10, 'FD');
  }

  function drawField(label: string, value: string, x: number, y: number, width: number) {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(218, 222, 226);
    doc.roundedRect(x, y, width, 42, 4, 4, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(120, 126, 134);
    doc.text(label.toUpperCase(), x + 10, y + 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(44, 50, 58);
    const lines = doc.splitTextToSize(value || 'Unavailable', width - 20);
    doc.text(lines.slice(0, 2), x + 10, y + 30);
  }

  function drawHeader() {
    drawFrame();

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(45, 48, 55);
    doc.text(options.sellerName, pageMargin + 32, 55);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(132, 138, 145);
    doc.text(`${formatInteger(options.itemCount)} items • ${formatCurrency(options.totalLineAmount)} total`, pageMargin + 32, 71);

    const fieldY = 94;
    const fieldGap = 18;
    const fieldWidth = (contentWidth - fieldGap) / 2;
    drawField('PO/SO number', options.poSoNumber, pageMargin + 18, fieldY, fieldWidth - 18);
    drawField('Sales rep', options.salesRepName || 'Unavailable', pageMargin + fieldWidth + fieldGap, fieldY, fieldWidth - 18);
  }

  let pageCounter = 0;
  drawHeader();

  autoTable(doc, {
    startY: 155,
    margin: { left: pageMargin + 18, right: pageMargin + 18, top: 155 },
    head: [['#', 'Product', 'Price', 'Qty', 'Total']],
    body: options.lines.map((line, index) => [
      formatInteger(index + 1),
      `${line.productName}${line.detailLine ? `\n${line.detailLine}` : ''}`,
      formatCurrency(line.unitPrice),
      formatInteger(line.quantity),
      formatCurrency(line.total),
    ]),
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 7.4,
      cellPadding: { top: 4, right: 5, bottom: 4, left: 5 },
      textColor: [45, 50, 56],
      lineColor: [231, 234, 239],
      lineWidth: 0.35,
      valign: 'middle',
      minCellHeight: 22,
    },
    headStyles: {
      fillColor: [250, 250, 251],
      textColor: [120, 126, 134],
      fontStyle: 'bold',
      halign: 'left',
    },
    alternateRowStyles: {
      fillColor: [253, 253, 254],
    },
    columnStyles: {
      0: { cellWidth: 30, halign: 'center', textColor: [112, 119, 127] },
      1: { cellWidth: contentWidth - 252, fontStyle: 'bold' },
      2: { cellWidth: 70, halign: 'right' },
      3: { cellWidth: 54, halign: 'right' },
      4: { cellWidth: 82, halign: 'right', fontStyle: 'bold' },
    },
    willDrawPage: () => {
      pageCounter += 1;
      if (pageCounter > 1) {
        drawHeader();
      }
    },
    didDrawPage: () => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(120, 126, 134);
      if (options.footerNote) {
        doc.text(options.footerNote, pageMargin + 18, pageHeight - 24);
      }
      doc.text(`Page ${doc.getNumberOfPages()}`, pageWidth - pageMargin - 18, pageHeight - 24, { align: 'right' });
    },
  });

  const lastTable = doc as unknown as { lastAutoTable?: { finalY?: number } };
  let bottomY = (lastTable.lastAutoTable?.finalY ?? 900) + 26;
  if (bottomY + 164 > pageHeight - 40) {
    doc.addPage([1000, 1428], 'portrait');
    drawHeader();
    bottomY = 155;
  }

  const notesX = pageMargin + 18;
  const notesW = contentWidth - 390;
  const notesH = 56;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(225, 228, 233);
  doc.roundedRect(notesX, bottomY, notesW, notesH, 6, 6, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(92, 98, 106);
  doc.text('Order notes', notesX + 12, bottomY + 18);

  const totalsX = notesX + notesW + 16;
  const totalsW = contentWidth - (totalsX - pageMargin);
  doc.roundedRect(totalsX, bottomY, totalsW, 140, 6, 6, 'FD');
  const totalRows: Array<[string, string]> = [
    [`Subtotal (${formatInteger(options.itemCount)} items)`, formatCurrency(options.subtotal)],
    ['Promos & discounts', '—'],
    [`Taxes (${taxRateLabel})`, formatCurrency(options.taxTotal)],
  ];
  if ((options.creditMemo ?? 0) > 0) {
    totalRows.push(['Credit memo', `-${formatCurrency(options.creditMemo ?? 0)}`]);
  }

  totalRows.forEach(([label, value], index) => {
    const y = bottomY + 18 + index * 20;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(55, 60, 66);
    doc.text(label, totalsX + 12, y);
    doc.text(value, totalsX + totalsW - 12, y, { align: 'right' });
  });

  const dividerY = bottomY + 20 + totalRows.length * 20;
  doc.setDrawColor(225, 228, 233);
  doc.line(totalsX + 12, dividerY, totalsX + totalsW - 12, dividerY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(28, 32, 36);
  doc.text('Total balance due', totalsX + 12, dividerY + 18);
  doc.text(formatCurrency(options.totalBalanceDue), totalsX + totalsW - 12, dividerY + 18, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(92, 98, 106);
  doc.text('Payment terms', totalsX + 12, bottomY + 122);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(45, 50, 56);
  doc.text(options.paymentTerms, totalsX + totalsW - 12, bottomY + 122, { align: 'right' });

  doc.save(options.fileName);
}
