'use client';

import { FileDown, FileSpreadsheet, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Textarea } from '@/components/ui';
import { downloadNabisOrderPdf, formatCurrency, formatDateOnly, formatDateTime, formatInteger, sanitizeFileName } from '@/components/crm/nabis-order-pdf';

type ProposalLine = {
  skuCode: string | null;
  productName: string;
  brandName: string;
  unitDescription: string | null;
  inventoryClass: string | null;
  inventoryCategory: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  availableUnits: number;
  availableCases: number;
  casePackSize: number;
  warehouseCount: number;
  sourceWarehouseIds: string[];
  batchCount: number;
  batchCode: string | null;
  batchExpirationDate: string | null;
  batchLicenseNumber: string | null;
  latestInventoryAt: string | null;
  priceKey: string;
  price: {
    brand: string;
    size: string;
    weight: string;
    displayBrand: string;
    standardWholesale: number;
    preferredWholesale: number;
  };
  sourceKind: 'demand' | 'strategic-add';
  matchedHeadsetRows: string[];
};

type OverviewRow = {
  priceKey: string;
  displayBrand: string;
  productName: string;
  avgUnitsPerDay: number;
  unitsOnHandAtDelivery: number;
  orderAmount: number;
  totalUnitsSold: number;
  potentialLostProfit: number;
};

type BreakdownRow = {
  priceKey: string;
  brand: string;
  size: string;
  quantity: number;
  standardWholesale: number;
  currentPromoPrice: number | null;
  pppPrice: number;
  standardWholesaleTotal: number;
  currentPromoTotal: number;
  pppPricingTotal: number;
};

type ProposalResponse = {
  ok: true;
  accountId: string | null;
  storeName: string;
  storeAddress: string | null;
  primaryContactName: string | null;
  generatedAt: string;
  source: 'headset-report+nabis-api';
  warning: string | null;
  inputSummary: {
    format: 'json' | 'csv';
    rowCount: number;
    parsedRowCount: number;
    matchedRowCount: number;
    demandRowCount: number;
    strategicRowCount: number;
    unmatchedRowCount: number;
    unmatchedProducts: string[];
    omittedDemandFamilies: string[];
  };
  order: {
    orderType: 'Delivery to retailer';
    sellerName: string;
    poSoNumber: string;
    salesRepName: string | null;
    sourceWarehouseId: string | null;
    sourceWarehouseName: string | null;
    sourceWarehouseRegion: string | null;
    sourceWarehouseLabel: string | null;
    earliestDeliveryDate: string;
    licenseNumber: string | null;
    intakeContactName: string | null;
    paymentTerms: 'Net 30';
  };
  summary: {
    sourceRowCount: number;
    proposedLineCount: number;
    totalUnits: number;
    subtotal: number;
    taxRate: number;
    taxTotal: number;
    creditMemo: number;
    currentPromoTotal: number;
    preferredTotal: number;
    standardWholesaleTotal: number;
    totalBalanceDue: number;
    inventoryUpdatedAt: string | null;
    restockIntervalDays: number;
  };
  overviewRows: OverviewRow[];
  breakdownRows: BreakdownRow[];
  lines: ProposalLine[];
};

type Props = {
  accountId: string;
};

const PLACEHOLDER = `Paste a Headset JSON array or CSV export here.

Expected columns include fields like:
Store Name, Name, In Stock Avg Units per Day, Total Quantity on Hand,
Total Units Sold, Minimum Suggested Order, Est. Days Remaining, Last Sale`;

export function PreferredPartnerProposalPanel({ accountId }: Props) {
  const [rawReport, setRawReport] = useState('');
  const [result, setResult] = useState<ProposalResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generateProposal() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/accounts/${encodeURIComponent(accountId)}/preferred-partner-proposal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          rawReport,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'PPP proposal generation failed.');
      }
      setResult(payload as ProposalResponse);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'PPP proposal generation failed.');
    } finally {
      setLoading(false);
    }
  }

  async function downloadProposalPdf(proposal = result) {
    if (!proposal || proposal.lines.length === 0) return;
    await downloadNabisOrderPdf({
      fileName: `${sanitizeFileName(proposal.storeName)}-ppp-proposal.pdf`,
      sellerName: proposal.order.sellerName,
      itemCount: proposal.summary.proposedLineCount,
      totalLineAmount: proposal.summary.currentPromoTotal,
      poSoNumber: proposal.order.poSoNumber,
      salesRepName: proposal.order.salesRepName,
      lines: proposal.lines.map((line) => ({
        productName: line.productName,
        detailLine: [
          line.skuCode ? line.skuCode : null,
          line.batchCode ? `Batch ${line.batchCode}` : null,
          line.batchExpirationDate ? `Exp. ${formatDateOnly(line.batchExpirationDate)}` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        total: line.lineTotal,
      })),
      subtotal: proposal.summary.subtotal,
      taxRate: proposal.summary.taxRate,
      taxTotal: proposal.summary.taxTotal,
      creditMemo: proposal.summary.creditMemo,
      totalBalanceDue: proposal.summary.totalBalanceDue,
      paymentTerms: proposal.order.paymentTerms,
      footerNote: `PPP proposal generated ${formatDateTime(proposal.generatedAt)} from pasted Headset data and live Nabis inventory.`,
    });
  }

  async function downloadOverviewPdf(proposal = result) {
    if (!proposal || proposal.overviewRows.length === 0) return;
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
    const margin = 24;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(60, 60, 60);
    doc.text(`PICC Overview - ${proposal.storeName}`, margin, 24);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(110, 110, 110);
    doc.text(`Restock Interval ${proposal.summary.restockIntervalDays / 7} Week`, margin, 40);
    doc.text(`Generated ${formatDateTime(proposal.generatedAt)}`, doc.internal.pageSize.getWidth() - margin, 24, { align: 'right' });

    autoTable(doc, {
      startY: 52,
      margin: { left: margin, right: margin },
      head: [['Brand', 'Product Name', 'Avg Sales per Day', 'Units on Hand at Delivery', 'Order Amount', 'Units Sold', 'Potential Lost Profit']],
      body: proposal.overviewRows.map((row) => [
        row.displayBrand,
        row.productName,
        row.avgUnitsPerDay.toFixed(1),
        row.unitsOnHandAtDelivery.toFixed(1),
        row.orderAmount.toFixed(1),
        formatInteger(row.totalUnitsSold),
        formatCurrency(row.potentialLostProfit),
      ]),
      theme: 'plain',
      styles: {
        font: 'helvetica',
        fontSize: 8,
        cellPadding: { top: 4.5, right: 4, bottom: 4.5, left: 4 },
        textColor: [70, 70, 70],
        lineColor: [230, 235, 232],
        lineWidth: 0.25,
      },
      headStyles: {
        fillColor: [44, 91, 70],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 88, fontStyle: 'bold' },
        1: { cellWidth: 280 },
        2: { cellWidth: 74, halign: 'right' },
        3: { cellWidth: 94, halign: 'right' },
        4: { cellWidth: 74, halign: 'right' },
        5: { cellWidth: 60, halign: 'right' },
        6: { cellWidth: 88, halign: 'right' },
      },
    });

    doc.save(`${sanitizeFileName(proposal.storeName)}-ppp-overview.pdf`);
  }

  async function downloadDiscountPdf(proposal = result) {
    if (!proposal || proposal.breakdownRows.length === 0) return;
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
    const margin = 18;
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(65, 65, 65);
    doc.text('Discount Breakdown Summary', pageWidth / 2, 20, { align: 'center' });
    doc.setFontSize(8);
    doc.text(`${proposal.storeName} | ${proposal.order.poSoNumber} | Generated ${formatDateTime(proposal.generatedAt)}`, margin, 38);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text('Current Promo values are tax-inclusive line totals from the generated PPP proposal.', margin, 48);

    const body = proposal.breakdownRows.map((row) => [
      row.brand,
      row.size,
      formatInteger(row.quantity),
      formatCurrency(row.standardWholesale),
      row.currentPromoPrice != null ? formatCurrency(row.currentPromoPrice) : '-',
      formatCurrency(row.pppPrice),
      formatCurrency(row.standardWholesaleTotal),
      formatCurrency(row.currentPromoTotal),
      formatCurrency(row.pppPricingTotal),
    ]);
    body.push([
      'Proposal Total',
      '',
      '',
      '',
      '',
      '',
      formatCurrency(proposal.summary.standardWholesaleTotal),
      formatCurrency(proposal.summary.currentPromoTotal),
      formatCurrency(proposal.summary.preferredTotal),
    ]);

    autoTable(doc, {
      startY: 58,
      margin: { left: margin, right: margin },
      head: [[
        'Brand',
        'Size',
        'Quantity',
        'Standard Wholesale',
        'Current Promo Price',
        'PPP Price',
        'Standard Wholesale Total',
        'Current Promo Total',
        'PPP Pricing Total',
      ]],
      body,
      theme: 'plain',
      styles: {
        font: 'helvetica',
        fontSize: 7.4,
        cellPadding: { top: 4.5, right: 4, bottom: 4.5, left: 4 },
        textColor: [70, 70, 70],
        lineColor: [230, 235, 232],
        lineWidth: 0.25,
      },
      headStyles: {
        fillColor: [44, 91, 70],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
      },
      alternateRowStyles: {
        fillColor: [246, 247, 247],
      },
      didParseCell: (data) => {
        data.cell.styles.valign = 'middle';
        if (data.section === 'body' && data.column.index === 5) {
          data.cell.styles.fillColor = [0, 255, 0];
          data.cell.styles.textColor = [40, 55, 55];
        }
        if (data.section === 'body' && data.row.index === body.length - 1) {
          data.cell.styles.fillColor = [215, 229, 221];
          data.cell.styles.fontStyle = 'bold';
        }
      },
      columnStyles: {
        0: { cellWidth: 125, halign: 'left', fontStyle: 'bold' },
        1: { cellWidth: 48, halign: 'center', fontStyle: 'bold' },
        2: { cellWidth: 54, halign: 'center' },
        3: { cellWidth: 74, halign: 'right' },
        4: { cellWidth: 76, halign: 'right' },
        5: { cellWidth: 76, halign: 'right' },
        6: { cellWidth: 88, halign: 'right' },
        7: { cellWidth: 84, halign: 'right' },
        8: { cellWidth: 84, halign: 'right' },
      },
    });

    const finalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 360;
    const rowHeight = 22;
    const summaryLayout = {
      labelX: pageWidth - margin - 409,
      valueX: pageWidth - margin - 84,
      valueWidth: 84,
    };

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setDrawColor(215, 215, 215);
    doc.setTextColor(65, 65, 65);

    const bottomRows = [
      ['Amount Discounted From Current Promo Pricing (PPP Discount)', formatCurrency(proposal.summary.creditMemo)],
      ['Amount Discounted From Standard Wholesale Pricing', formatCurrency(proposal.summary.standardWholesaleTotal - proposal.summary.preferredTotal)],
    ];

    bottomRows.forEach(([label, value], index) => {
      const y = finalY + 18 + index * rowHeight;
      doc.setFillColor(255, 255, 255);
      doc.rect(summaryLayout.labelX, y, summaryLayout.valueX - summaryLayout.labelX, rowHeight, 'FD');
      doc.setFillColor(0, 255, 0);
      doc.rect(summaryLayout.valueX, y, summaryLayout.valueWidth, rowHeight, 'FD');
      doc.text(label, summaryLayout.valueX - 6, y + 14, { align: 'right' });
      doc.text(value, summaryLayout.valueX + summaryLayout.valueWidth - 6, y + 14, { align: 'right' });
    });

    doc.save(`${sanitizeFileName(proposal.storeName)}-ppp-discount-breakdown.pdf`);
  }

  async function downloadAll(proposal = result) {
    if (!proposal) return;
    await downloadProposalPdf(proposal);
    if (proposal.overviewRows.length > 0) {
      await downloadOverviewPdf(proposal);
    }
    if (proposal.breakdownRows.length > 0) {
      await downloadDiscountPdf(proposal);
    }
  }

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>PPP Proposal Generator</CardTitle>
            <CardDescription className="mt-2">
              Paste a Headset JSON or CSV export for a Preferred Partner account. The app will use that demand signal plus live Nabis inventory to draft the PPP
              proposal, overview, and discount breakdown outputs.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {result ? (
              <Button type="button" variant="secondary" onClick={() => downloadAll()}>
                <FileDown className="h-4 w-4" />
                Download All PDFs
              </Button>
            ) : null}
            <Button type="button" onClick={generateProposal} disabled={loading || !rawReport.trim()}>
              <Sparkles className="h-4 w-4" />
              {loading ? 'Generating...' : 'Generate PPP Outputs'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          value={rawReport}
          onChange={(event) => setRawReport(event.target.value)}
          className="min-h-[220px] font-mono text-sm"
          placeholder={PLACEHOLDER}
        />

        {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

        {result ? (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
              <SummaryMetric label="Parsed Rows" value={formatInteger(result.inputSummary.parsedRowCount)} />
              <SummaryMetric label="Demand Rows" value={formatInteger(result.inputSummary.demandRowCount)} />
              <SummaryMetric label="Strategic Rows" value={formatInteger(result.inputSummary.strategicRowCount)} />
              <SummaryMetric label="Proposal Lines" value={formatInteger(result.summary.proposedLineCount)} />
              <SummaryMetric label="Promo Total" value={formatCurrency(result.summary.currentPromoTotal)} />
              <SummaryMetric label="PPP Total" value={formatCurrency(result.summary.totalBalanceDue)} />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="success">Headset {result.inputSummary.format.toUpperCase()}</Badge>
              <Badge variant="success">Live Nabis Inventory</Badge>
              <Badge variant="secondary">{formatInteger(result.summary.totalUnits)} units</Badge>
              {result.warning ? <span className="text-amber-700">{result.warning}</span> : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => downloadProposalPdf()}>
                <FileDown className="h-4 w-4" />
                Proposal PDF
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => downloadOverviewPdf()} disabled={result.overviewRows.length === 0}>
                <FileSpreadsheet className="h-4 w-4" />
                Overview PDF
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => downloadDiscountPdf()} disabled={result.breakdownRows.length === 0}>
                <FileSpreadsheet className="h-4 w-4" />
                Discount PDF
              </Button>
            </div>

            <p className="text-xs text-slate-500">
              Delivery date: {formatDateOnly(result.order.earliestDeliveryDate)} · Source warehouse:{' '}
              {result.order.sourceWarehouseLabel || result.order.sourceWarehouseName || 'Unavailable'} · Tax: {formatCurrency(result.summary.taxTotal)} ·
              Credit memo: {formatCurrency(result.summary.creditMemo)} · Inventory updated: {formatDateTime(result.summary.inventoryUpdatedAt)}
            </p>

            {result.lines.length > 0 ? (
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full min-w-[980px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Family</th>
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2 text-right">Price</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Available</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {result.lines.map((line) => (
                      <tr key={`${line.skuCode ?? line.productName}-${line.priceKey}`}>
                        <td className="px-3 py-2 font-semibold">{line.price.displayBrand}</td>
                        <td className="px-3 py-2">
                          <p className="font-medium">{line.productName}</p>
                          <p className="text-xs text-slate-500">
                            {line.sourceKind === 'strategic-add' ? 'Strategic add' : 'Demand-backed'}
                            {line.skuCode ? ` · ${line.skuCode}` : ''}
                          </p>
                        </td>
                        <td className="px-3 py-2 text-right">{formatCurrency(line.unitPrice)}</td>
                        <td className="px-3 py-2 text-right">{formatInteger(line.quantity)}</td>
                        <td className="px-3 py-2 text-right">{formatInteger(line.availableUnits)}</td>
                        <td className="px-3 py-2 text-right font-semibold">{formatCurrency(line.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                No live Nabis SKUs matched the pasted Headset report closely enough to build a PPP proposal draft.
              </p>
            )}

            {result.breakdownRows.length > 0 ? (
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full min-w-[920px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Brand</th>
                      <th className="px-3 py-2">Size</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Current Promo</th>
                      <th className="px-3 py-2 text-right">PPP</th>
                      <th className="px-3 py-2 text-right">PPP Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {result.breakdownRows.map((row) => (
                      <tr key={row.priceKey}>
                        <td className="px-3 py-2 font-semibold">{row.brand}</td>
                        <td className="px-3 py-2">{row.size}</td>
                        <td className="px-3 py-2 text-right">{formatInteger(row.quantity)}</td>
                        <td className="px-3 py-2 text-right">{row.currentPromoPrice != null ? formatCurrency(row.currentPromoPrice) : '—'}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(row.pppPrice)}</td>
                        <td className="px-3 py-2 text-right font-semibold">{formatCurrency(row.pppPricingTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {result.inputSummary.unmatchedProducts.length > 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                <p className="font-semibold">Unmatched Headset rows</p>
                <p className="mt-1">{result.inputSummary.unmatchedProducts.join(' · ')}</p>
              </div>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-slate-50 px-3 py-3">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>
    </div>
  );
}
