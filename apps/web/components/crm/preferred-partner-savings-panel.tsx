'use client';

import { Calculator, ChevronDown, ChevronUp, Clipboard, FileDown, History, Mail } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Textarea } from '@/components/ui';

type BreakdownRow = {
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

type SavingsOrder = {
  orderNumber: string;
  orderDate: string | null;
  paidTotal: number;
  currentPromoTotal: number;
  standardWholesaleTotal: number;
  preferredTotal: number;
  savings: number;
  standardWholesaleDiscount: number;
  lineCount: number;
  matchedLineCount: number;
  unmatchedLineCount: number;
  breakdownRows: BreakdownRow[];
};

type SavingsResponse = {
  ok: true;
  year: number | null;
  years: number[];
  periodLabel: string;
  calculationMode: 'year' | 'historical';
  storeName: string;
  primaryContactName: string | null;
  recipientEmail: string | null;
  subject: string;
  script: string;
  scriptHtml: string;
  source: 'nabis-api';
  warning: string | null;
  summary: {
    orderCount: number;
    totalPaid: number;
    totalCurrentPromo: number;
    totalStandardWholesale: number;
    totalPreferred: number;
    totalSavings: number;
    totalStandardWholesaleDiscount: number;
    matchedLineCount: number;
    unmatchedLineCount: number;
  };
  orders: SavingsOrder[];
};

type Props = {
  accountId: string;
  year: number;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return 'No date';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${value}T12:00:00`));
}

function sanitizeFileName(value: string) {
  return value
    .trim()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function formatBreakdownQuantity(value: number) {
  return Number.isInteger(value) ? value.toLocaleString('en-US') : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function PreferredPartnerSavingsPanel({ accountId, year }: Props) {
  const [result, setResult] = useState<SavingsResponse | null>(null);
  const [draft, setDraft] = useState('');
  const richPreviewRef = useRef<HTMLDivElement | null>(null);
  const [loadingScope, setLoadingScope] = useState<'year' | 'historical' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'plain' | 'rich' | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const emailHref = useMemo(() => {
    if (!result?.recipientEmail || !draft.trim()) {
      return null;
    }
    return `mailto:${result.recipientEmail}?subject=${encodeURIComponent(result.subject)}&body=${encodeURIComponent(draft)}`;
  }, [draft, result]);

  async function calculateSavings(scope: 'year' | 'historical') {
    setLoadingScope(scope);
    setError(null);
    setCopied(null);

    try {
      const searchParams = scope === 'historical' ? 'scope=historical' : `year=${year}`;
      const response = await fetch(`/api/accounts/${encodeURIComponent(accountId)}/preferred-partner-savings?${searchParams}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        cache: 'no-store',
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Preferred Partner savings calculation failed.');
      }
      setResult(payload as SavingsResponse);
      setDraft(payload.script);
      setCollapsed(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Preferred Partner savings calculation failed.');
      setCollapsed(false);
    } finally {
      setLoadingScope(null);
    }
  }

  async function copyDraft() {
    if (!draft.trim()) return;
    await navigator.clipboard.writeText(draft);
    setCopied('plain');
    window.setTimeout(() => setCopied(null), 1800);
  }

  async function copyRichDraft() {
    const html = richPreviewRef.current?.innerHTML || result?.scriptHtml;
    if (!html || !draft.trim()) return;

    if ('ClipboardItem' in window && navigator.clipboard.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([draft], { type: 'text/plain' }),
        }),
      ]);
    } else {
      await navigator.clipboard.writeText(draft);
    }

    setCopied('rich');
    window.setTimeout(() => setCopied(null), 1800);
  }

  function openEmail() {
    if (!emailHref) return;
    window.location.href = emailHref;
  }

  async function downloadPdf() {
    if (!result || result.orders.length === 0) return;

    const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
    const margin = 18;
    const tableHead = [
      [
        'Brand',
        'Size',
        'Quantity',
        'Standard Wholesale',
        'Nabis Promo Price',
        'PPP Price',
        'Standard Wholesale Total',
        'Nabis Promo Total',
        'PPP Pricing Total',
      ],
    ];

    result.orders.forEach((order, orderIndex) => {
      if (orderIndex > 0) {
        doc.addPage('letter', 'landscape');
      }
      const pageWidth = doc.internal.pageSize.getWidth();
      const summaryLayout = {
        labelX: pageWidth - margin - 409,
        valueX: pageWidth - margin - 84,
        valueWidth: 84,
      };

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(65, 65, 65);
      doc.text('Discount Breakdown Summary', pageWidth / 2, 20, { align: 'center' });
      doc.setFontSize(8);
      doc.text(`${result.storeName} | Order #${order.orderNumber} | Actual Invoice Total: ${formatCurrency(order.paidTotal)}`, margin, 38);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text('Nabis Promo values are tax-inclusive Nabis Marketplace item totals from each invoice date.', margin, 48);

      const body = order.breakdownRows.map((row) => {
        const hasQuantity = row.quantity > 0;
        return [
          row.brand,
          row.size,
          hasQuantity ? formatBreakdownQuantity(row.quantity) : '-',
          formatCurrency(row.standardWholesale),
          hasQuantity && row.currentPromoPrice != null ? formatCurrency(row.currentPromoPrice) : '-',
          formatCurrency(row.pppPrice),
          hasQuantity ? formatCurrency(row.standardWholesaleTotal) : '-',
          hasQuantity ? formatCurrency(row.currentPromoTotal) : '-',
          hasQuantity ? formatCurrency(row.pppPricingTotal) : '-',
        ];
      });

      body.push([
        'Proposal Total',
        '',
        '',
        '',
        '',
        '',
        formatCurrency(order.standardWholesaleTotal),
        formatCurrency(order.currentPromoTotal),
        formatCurrency(order.preferredTotal),
      ]);

      autoTable(doc, {
        startY: 58,
        margin: { left: margin, right: margin },
        head: tableHead,
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
          valign: 'middle',
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
        didDrawCell: (data) => {
          if (data.section !== 'body' || data.row.index !== 0) {
            return;
          }

          if (data.column.index === 4) {
            summaryLayout.labelX = data.cell.x;
          }

          if (data.column.index === 8) {
            summaryLayout.valueX = data.cell.x;
            summaryLayout.valueWidth = data.cell.width;
          }
        },
      });

      const finalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 360;
      const rowHeight = 22;

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.setDrawColor(215, 215, 215);
      doc.setTextColor(65, 65, 65);

      const bottomRows = [
        ['Amount Discounted From Nabis Promo Pricing (PPP Discount)', formatCurrency(order.savings)],
        ['Amount Discounted From Standard Wholesale Pricing', formatCurrency(order.standardWholesaleDiscount)],
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

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(110, 110, 110);
      doc.text(
        'Note: Estimates are based on live Nabis order detail and the PICC PPP price guide. Nabis Promo values are tax-inclusive item totals from each invoice date.',
        margin,
        doc.internal.pageSize.getHeight() - 14,
      );
    });

    doc.save(`${sanitizeFileName(result.storeName)}-${result.periodLabel}-ppp-discount-breakdown.pdf`);
  }

  const loading = loadingScope !== null;
  const periodLabel = result?.periodLabel ?? String(year);

  return (
    <Card>
      <CardHeader className="gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>Preferred Partner Discount</CardTitle>
          {result ? (
            <p className="mt-2 text-sm text-slate-500">
              {result.periodLabel} savings from Nabis API · {formatCurrency(result.summary.totalSavings)} missed savings
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(result || error) ? (
            <Button type="button" variant="secondary" onClick={() => setCollapsed((value) => !value)}>
              {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              {collapsed ? 'Show Details' : 'Collapse'}
            </Button>
          ) : null}
          <Button type="button" variant="secondary" onClick={() => calculateSavings('historical')} disabled={loading}>
            <History className="h-4 w-4" />
            {loadingScope === 'historical' ? 'Calculating...' : 'Calculate Historical PPP Savings'}
          </Button>
          <Button type="button" onClick={() => calculateSavings('year')} disabled={loading}>
            <Calculator className="h-4 w-4" />
            {loadingScope === 'year' ? 'Calculating...' : `Calculate ${year} PPP Savings`}
          </Button>
        </div>
      </CardHeader>
      {collapsed ? null : <CardContent className="space-y-4">
        {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

        {result ? (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <SummaryMetric label="Orders" value={String(result.summary.orderCount)} />
              <SummaryMetric label="Nabis Promo Total" value={formatCurrency(result.summary.totalCurrentPromo)} />
              <SummaryMetric label="PPP Price" value={formatCurrency(result.summary.totalPreferred)} />
              <SummaryMetric label="Missed Savings" value={formatCurrency(result.summary.totalSavings)} />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="success">Live Nabis</Badge>
              {result.warning ? <span className="text-amber-700">{result.warning}</span> : null}
            </div>

            {result.orders.length > 0 ? (
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full min-w-[920px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Order</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2 text-right">Invoice Total</th>
                      <th className="px-3 py-2 text-right">Nabis Promo Total</th>
                      <th className="px-3 py-2 text-right">PPP Price</th>
                      <th className="px-3 py-2 text-right">Promo Discount</th>
                      <th className="px-3 py-2 text-right">Standard Discount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {result.orders.map((order) => (
                      <tr key={`${order.orderNumber}-${order.orderDate ?? 'no-date'}`}>
                        <td className="px-3 py-2 font-semibold">#{order.orderNumber}</td>
                        <td className="px-3 py-2 text-slate-500">{formatDate(order.orderDate)}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(order.paidTotal)}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(order.currentPromoTotal)}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(order.preferredTotal)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-emerald-700">{formatCurrency(order.savings)}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(order.standardWholesaleDiscount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                No eligible invoiced orders came back for {periodLabel}.
              </p>
            )}

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-700">Email Script</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={downloadPdf} disabled={result.orders.length === 0}>
                    <FileDown className="h-4 w-4" />
                    Download PDF
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={copyRichDraft} disabled={!result.scriptHtml}>
                    <Clipboard className="h-4 w-4" />
                    {copied === 'rich' ? 'Copied Rich' : 'Copy Rich Email'}
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={copyDraft} disabled={!draft.trim()}>
                    <Clipboard className="h-4 w-4" />
                    {copied === 'plain' ? 'Copied Plain' : 'Copy Plain Text'}
                  </Button>
                  <Button type="button" size="sm" onClick={openEmail} disabled={!emailHref}>
                    <Mail className="h-4 w-4" />
                    Open Plain Email
                  </Button>
                </div>
              </div>
              <div
                ref={richPreviewRef}
                contentEditable
                suppressContentEditableWarning
                className="min-h-[420px] rounded-lg border bg-white p-4 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                dangerouslySetInnerHTML={{ __html: result.scriptHtml }}
              />
              <p className="text-xs text-slate-500">
                Use Copy Rich Email to preserve bold, italics, underline, font sizing, and green highlights when pasting into an email composer. Open Plain
                Email uses a mailto fallback and cannot preserve styling.
              </p>
              <Textarea value={draft} onChange={(event) => setDraft(event.target.value)} className="min-h-[420px] font-mono text-sm" />
              {!result.recipientEmail ? <p className="text-xs text-amber-700">No contact email is linked to this account.</p> : null}
            </div>
          </>
        ) : null}
      </CardContent>}
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
