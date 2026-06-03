'use client';

import { useMemo, useState } from 'react';
import { Copy, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui';
import {
  buildMicrobarSampleEmailDraft,
  MICROBAR_SAMPLE_UNITS,
  selectLatestNabisOrderForEmail,
} from '@/lib/nabis/microbar-sample-email';

export type MicrobarSampleEmailOrder = {
  orderNumber: string | null;
  createdDate: string | null;
  deliveryDate?: string | null;
  status?: string | null;
  total?: number | null;
};

export function MicrobarSampleEmailPanel({ storeName, orders }: { storeName: string; orders: MicrobarSampleEmailOrder[] }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const latestOrder = useMemo(() => selectLatestNabisOrderForEmail(orders), [orders]);
  const draft = latestOrder?.orderNumber
    ? buildMicrobarSampleEmailDraft({
        storeName,
        orderNumber: latestOrder.orderNumber,
      })
    : null;

  function handlePreviewAndOpenDraft() {
    if (!draft) {
      toast.error('No cached Nabis order found for this account.');
      return;
    }

    setPreviewOpen(true);
    window.location.href = draft.mailtoHref;
    toast.success('Opening Nabis email draft.');
  }

  async function handleCopyEmail() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(`${draft.subject}\n\n${draft.body}`);
      toast.success('Microbar sample email copied.');
    } catch {
      toast.error('Unable to copy Microbar sample email.');
    }
  }

  return (
    <div className="rounded-2xl border border-[#d6dae2] bg-white px-4 py-4 shadow-[0_12px_26px_rgba(24,33,45,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-wide text-[#6a7583]">Microbar Nabis Samples</p>
          <h3 className="mt-1 text-[18px] font-semibold text-[#1d1f23]">Draft sample-add email from latest order</h3>
          <p className="mt-1 text-[14px] leading-5 text-[#5c6674]">
            Uses the newest cached Nabis order for this account and opens a ready-to-send email to helpny@nabis.com.
          </p>
        </div>
        <Mail className="mt-1 h-5 w-5 shrink-0 text-[#3559a9]" />
      </div>

      <div className="mt-4 rounded-xl border border-[#dbe2ee] bg-[#f7f9fc] px-3 py-3">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-[#6a7583]">Latest Nabis Order</p>
        {latestOrder ? (
          <>
            <p className="mt-1 text-[18px] font-semibold text-[#1d1f23]">Order {latestOrder.orderNumber}</p>
            <p className="mt-1 text-[13px] text-[#5c6674]">
              {formatDateLabel(latestOrder.createdDate, 'No order date')}
              {latestOrder.status ? ` · ${latestOrder.status}` : ''}
              {typeof latestOrder.total === 'number' ? ` · ${formatCurrency(latestOrder.total)}` : ''}
            </p>
          </>
        ) : (
          <p className="mt-1 text-[15px] font-medium text-[#8a5b05]">No cached Nabis order found for this account.</p>
        )}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Button type="button" className="h-11 bg-[#cd3814] text-white hover:bg-[#b52f10]" onClick={handlePreviewAndOpenDraft} disabled={!draft}>
          <Mail className="h-4 w-4" />
          Preview & Open Email Draft
        </Button>
        <Button type="button" variant="secondary" className="h-11" onClick={handleCopyEmail} disabled={!draft}>
          <Copy className="h-4 w-4" />
          Copy Email
        </Button>
      </div>

      {draft ? (
        <div className="mt-4 rounded-xl border border-[#dbe2ee] bg-[#fbfcfe] px-3 py-3">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-[#6a7583]">Subject</p>
          <p className="mt-1 text-[14px] font-semibold leading-5 text-[#1d1f23]">{draft.subject}</p>
          <div className="mt-3 rounded-lg border border-[#e1e6ef] bg-white px-3 py-3">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-[#6a7583]">Included Samples</p>
            <ul className="mt-2 space-y-1 text-[13px] leading-5 text-[#38404d]">
              {MICROBAR_SAMPLE_UNITS.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          {previewOpen ? (
            <pre className="mt-3 max-h-[260px] overflow-auto whitespace-pre-wrap rounded-lg border border-[#cfe6d5] bg-[#f1fbf4] p-3 text-[12px] leading-5 text-[#24324f]">
              {draft.body}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function formatDateLabel(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  const date = /^\d{4}-\d{2}-\d{2}/.test(value) ? new Date(`${value.slice(0, 10)}T12:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString();
}

function formatCurrency(value: number | null | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}
