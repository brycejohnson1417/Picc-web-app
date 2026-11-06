'use client';

import { AccountSignals } from './account-signals';
import { ChevronDown, ExternalLink, Plus } from 'lucide-react';
import { buildStoreOpportunities, type StoreSalesContext } from '@/lib/proposals/store-opportunities';

function dateLabel(value: string | null | undefined) {
  if (!value) return '';
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function StoreSalesContextPanel({ context, onSelectProduct }: { context: StoreSalesContext; onSelectProduct: (productId: string) => void }) {
  const { suggestions, purchased } = buildStoreOpportunities(context);
  const payment = context.payment;
  const hasPayment = Boolean(payment?.creditStatus || typeof payment?.paymentDaysAvg === 'number' || payment?.overdueOrders);
  if (!context.signals && !hasPayment && !suggestions.length && !purchased.length) return null;
  return (
    <>
      {context.signals ? <AccountSignals data={context.signals} /> : null}
      {hasPayment ? (
        <details className="group border-b border-[#e5e6e1] px-5 py-3">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
            <div>
              <p className="text-xs font-semibold text-[#74766f]">Payment <span className="ml-2 text-[#252724]">{payment?.creditStatus}</span></p>
              {typeof payment?.paymentDaysAvg === 'number' ? <p className="mt-1 text-[11px] tabular-nums text-[#74766f]">Average {Math.abs(payment.paymentDaysAvg).toLocaleString()} days {payment.paymentDaysAvg < 0 ? 'before' : 'after'} due</p> : null}
              {typeof payment?.overdueOrders === 'number' && payment.overdueOrders > 0 ? <p className="mt-1 text-[11px] font-medium text-[#a7321b]">{payment.overdueOrders} overdue {payment.overdueOrders === 1 ? 'order' : 'orders'}</p> : null}
            </div>
            <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8a8d84] transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-2 space-y-1 border-t border-[#eeefea] pt-2 text-[11px] leading-relaxed text-[#74766f]">
            {payment?.ruleInEffect ? <p>Rule: {payment.ruleInEffect}</p> : null}
            {payment?.overdueOrderNumbers ? <p>Overdue: {payment.overdueOrderNumbers}</p> : null}
            {payment?.sourceErrors?.length ? <p className="text-[#a7321b]">Source fields need review: {payment.sourceErrors.join(', ')}</p> : null}
            {payment?.sourceUrl ? <a href={payment.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">{payment.source || 'Payment source'} · {dateLabel(payment.sourceAsOf)}<ExternalLink className="h-3 w-3" /></a> : <p>{payment?.source}</p>}
          </div>
        </details>
      ) : null}
      {suggestions.length ? (
        <section className="border-b border-[#e5e6e1] px-5 py-3" aria-label="Products to promote">
          <h3 className="text-xs font-semibold text-[#74766f]">Promote</h3>
          <div className="mt-1 divide-y divide-[#eeefea]">
            {suggestions.map(({ product }) => {
              const parts = product.name.split('|').map(part => part.trim());
              const label = parts.length > 1 ? `${product.family ?? product.brand} · ${parts.at(-1)}` : product.name;
              return (
                <div key={product.productId} className="flex items-center gap-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p title={product.name} className="text-xs font-medium leading-relaxed text-[#252724]">{label}</p>
                    <p className="mt-1 text-[10px] tabular-nums text-[#8a8d84]">{product.sku ? `${product.sku} · ` : ''}Warehouse: {Math.floor((product.availableUnits ?? 0) / product.unitsPerCase).toLocaleString()} cases</p>
                    {product.requiresConfirmation ? <p className="mt-0.5 text-[10px] text-[#947132]">Confirmation required</p> : null}
                  </div>
                  <button type="button" aria-label={`Propose ${product.name}`} onClick={() => onSelectProduct(product.productId)} className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md border border-[#dedfd8] bg-[#fdfdfb] px-2 text-[11px] font-medium text-[#4e5849] hover:bg-[#f2f3ee] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#a7321b]"><Plus className="h-3 w-3" />Propose</button>
                </div>
              );
            })}
          </div>
          <details className="group">
            <summary className="flex min-h-7 cursor-pointer list-none items-center gap-1 text-[10px] text-[#8a8d84] [&::-webkit-details-marker]:hidden">Order evidence<ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" /></summary>
            <div className="space-y-1 pb-1 text-[11px] leading-relaxed text-[#74766f]">
              {suggestions.map(row => <p key={row.product.productId}>{row.product.sku || row.product.name}: {row.evidence === 'previously-ordered' ? `ordered ${dateLabel(row.lastOrderDate)}` : row.evidence === 'not-ordered-in-period' ? `no commercial Distru order, ${dateLabel(context.coverageStart)}–${dateLabel(context.coverageEnd)}` : 'available in current warehouse catalog'}</p>)}
              {purchased.slice(0, 4).map(row => <p key={row.family}>{row.family} · last order {dateLabel(row.lastOrderDate)}</p>)}
              <p>Distru coverage only. Pending proposals and samples excluded.</p>
            </div>
          </details>
        </section>
      ) : purchased.length ? (
        <details className="group border-b border-[#e5e6e1] px-5 py-3">
          <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-semibold text-[#74766f] [&::-webkit-details-marker]:hidden">Recent products<ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" /></summary>
          <div className="mt-2 space-y-1 text-xs text-[#74766f]">{purchased.slice(0, 4).map(row => <p key={row.family}>{row.family} · {dateLabel(row.lastOrderDate)}</p>)}</div>
        </details>
      ) : null}
    </>
  );
}
