'use client';

import { FileDown, Package } from 'lucide-react';
import { useState } from 'react';
import { downloadNabisOrderPdf, formatCurrency, formatDateOnly, formatDateTime, formatInteger, sanitizeFileName } from '@/components/crm/nabis-order-pdf';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';

type ProposalLine = {
  skuCode: string | null;
  productName: string;
  brandName: string;
  unitDescription: string | null;
  inventoryClass: string | null;
  inventoryCategory: string | null;
  casePackSize: number;
  cases: number;
  units: number;
  unitPrice: number;
  caseTotal: number;
  availableUnits: number;
  availableCases: number;
  warehouseCount: number;
  sourceWarehouseIds: string[];
  batchCount: number;
  batchCode: string | null;
  batchExpirationDate: string | null;
  batchLicenseNumber: string | null;
  latestInventoryAt: string | null;
};

type ProposalOrder = {
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
};

type ProposalResponse = {
  ok: true;
  accountId: string | null;
  storeName: string;
  storeAddress: string | null;
  primaryContactName: string | null;
  generatedAt: string;
  source: 'nabis-api';
  nabisDraftOrderSupported: false;
  warning: string | null;
  order: ProposalOrder;
  summary: {
    sourceRowCount: number;
    eligibleProductCount: number;
    proposedLineCount: number;
    excludedNonProductRowCount: number;
    excludedInsufficientInventoryCount: number;
    totalCases: number;
    totalUnits: number;
    subtotal: number;
    taxRate: number;
    taxTotal: number;
    totalBalanceDue: number;
    inventoryUpdatedAt: string | null;
  };
  lines: ProposalLine[];
};

type Props = {
  accountId: string;
};

export function MockOrderProposalPanel({ accountId }: Props) {
  const [result, setResult] = useState<ProposalResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generateProposal() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/accounts/${encodeURIComponent(accountId)}/mock-order-proposal`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        cache: 'no-store',
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Mock-order proposal generation failed.');
      }

      const proposal = payload as ProposalResponse;
      setResult(proposal);
      if (proposal.lines.length > 0) {
        await downloadProposalPdf(proposal);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Mock-order proposal generation failed.');
    } finally {
      setLoading(false);
    }
  }

  async function downloadProposalPdf(proposal = result) {
    if (!proposal || proposal.lines.length === 0) return;
    await downloadNabisOrderPdf({
      fileName: `${sanitizeFileName(proposal.storeName)}-mock-order-proposal.pdf`,
      sellerName: proposal.order.sellerName,
      itemCount: proposal.summary.proposedLineCount,
      totalLineAmount: proposal.summary.totalBalanceDue,
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
        quantity: line.units,
        total: line.caseTotal,
      })),
      subtotal: proposal.summary.subtotal,
      taxRate: proposal.summary.taxRate,
      taxTotal: proposal.summary.taxTotal,
      totalBalanceDue: proposal.summary.totalBalanceDue,
      paymentTerms: 'COD',
      footerNote: `Lead-conversion mock order generated ${formatDateTime(proposal.generatedAt)}. This is literally one case of every in-stock cannabis SKU with enough live Nabis inventory.`,
    });
  }

  return (
    <Card>
      <CardHeader className="gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>Lead Mock Order</CardTitle>
          <CardDescription className="mt-2">
            Generates the literal lead-conversion mock order: one case of every in-stock cannabis SKU with enough live Nabis inventory. This is not a PPP
            proposal.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {result && result.lines.length > 0 ? (
            <Button type="button" variant="secondary" onClick={() => downloadProposalPdf()}>
              <FileDown className="h-4 w-4" />
              Download Again
            </Button>
          ) : null}
          <Button type="button" onClick={generateProposal} disabled={loading}>
            <Package className="h-4 w-4" />
            {loading ? 'Generating...' : 'Generate 1-Case Mock Order'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

        {result ? (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
              <SummaryMetric label="SKUs" value={formatInteger(result.summary.proposedLineCount)} />
              <SummaryMetric label="Cases" value={formatInteger(result.summary.totalCases)} />
              <SummaryMetric label="Units" value={formatInteger(result.summary.totalUnits)} />
              <SummaryMetric label="Subtotal" value={formatCurrency(result.summary.subtotal)} />
              <SummaryMetric label="Balance Due" value={formatCurrency(result.summary.totalBalanceDue)} />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="success">Live Nabis Inventory</Badge>
              <Badge variant="secondary">PDF only</Badge>
              {result.warning ? <span className="text-slate-600">{result.warning}</span> : null}
            </div>

            <p className="text-xs text-slate-500">
              Delivery date: {formatDateOnly(result.order.earliestDeliveryDate)} · Source warehouse:{' '}
              {result.order.sourceWarehouseLabel || result.order.sourceWarehouseName || 'Unavailable'} · Tax:{' '}
              {formatCurrency(result.summary.taxTotal)} · Inventory updated: {formatDateTime(result.summary.inventoryUpdatedAt)} · Excluded{' '}
              {result.summary.excludedNonProductRowCount} non-product rows and {result.summary.excludedInsufficientInventoryCount} SKUs without enough inventory
              for one full case.
            </p>

            {result.lines.length > 0 ? (
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full min-w-[920px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Brand</th>
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2 text-right">Case Pack</th>
                      <th className="px-3 py-2 text-right">Available</th>
                      <th className="px-3 py-2 text-right">Unit Price</th>
                      <th className="px-3 py-2 text-right">Case Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {result.lines.slice(0, 12).map((line) => (
                      <tr key={`${line.skuCode ?? line.productName}`}>
                        <td className="px-3 py-2 font-semibold">{line.brandName}</td>
                        <td className="px-3 py-2">
                          <p className="font-medium">{line.productName}</p>
                          {line.skuCode ? <p className="text-xs text-slate-500">{line.skuCode}</p> : null}
                        </td>
                        <td className="px-3 py-2 text-right">{formatInteger(line.casePackSize)}</td>
                        <td className="px-3 py-2 text-right">{formatInteger(line.availableUnits)}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(line.unitPrice)}</td>
                        <td className="px-3 py-2 text-right font-semibold">{formatCurrency(line.caseTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {result.lines.length > 12 ? (
                  <p className="border-t bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    Showing first 12 SKUs in-app. The downloaded PDF includes all {result.lines.length} SKUs.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                No products had enough available inventory for one full case.
              </p>
            )}
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
