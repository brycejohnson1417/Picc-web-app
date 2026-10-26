export type Source = Record<string, unknown>;
export function object(value: unknown): Source { return value && typeof value === 'object' && !Array.isArray(value) ? value as Source : {}; }
export function rows(value: unknown): Source[] { return Array.isArray(value) ? value.map(object) : []; }
export function str(value: unknown): string { return typeof value === 'string' ? value : ''; }
export function amount(value: unknown): number { const n = Number(value); return Number.isFinite(n) ? n : 0; }
export function dateKey(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return Number.isNaN(Date.parse(value)) ? null : value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b)-Date.parse(a))/86400000);
export function invoiceAging(invoice: Source, now: Date) {
  const balance = invoice.voided_datetime ? 0 : Math.max(0, amount(invoice.remaining_amount));
  const due = dateKey(invoice.due_datetime);
  return {balance, days: balance === 0 ? 0 : due ? Math.max(0,daysBetween(due,dateKey(now.toISOString())!)) : null};
}
export function paymentDays(invoices: Source[]): number | null {
  let weighted = 0, cashTotal = 0;
  for (const invoice of invoices) {
    const issued = dateKey(invoice.invoice_datetime);
    if (!issued || invoice.voided_datetime) continue;
    for (const payment of rows(invoice.payments)) {
      const paid = dateKey(payment.payment_datetime);
      if (!paid || payment.status === 'VOIDED' || payment.fully_paid_with_credits) continue;
      const cash = Math.max(0, amount(payment.amount)-rows(payment.credit_uses).reduce((sum,c)=>sum+amount(c.amount),0));
      cashTotal += cash;
      weighted += cash*Math.max(0,daysBetween(issued,paid));
    }
  }
  return cashTotal ? Math.round(weighted/cashTotal*10)/10 : null;
}
export function lineNet(item: Source) {
  return item.is_sample ? 0 : Math.max(0,amount(item.quantity)-amount(item.returned_quantity))*amount(item.price);
}
export function monthlySales(orders: Source[], month: string): number {
  return Math.round(orders.filter(o => ['DELIVERED','COMPLETED'].includes(str(o.status)) && !o.combined_order && dateKey(o.delivered_datetime)?.startsWith(month)).reduce((sum,o)=>sum+rows(o.items).reduce((total,i)=>total+lineNet(i),0),0)*100)/100;
}
export function licenseCandidates(company: Source, accounts: {id:string;licenseNumber:string;name?:string}[]) {
  const normalize = (s: string) => s.trim().toUpperCase();
  const licenses = new Set(rows(company.licenses).map(l=>normalize(str(l.license_number))).filter(Boolean));
  return accounts.filter(a=>licenses.has(normalize(a.licenseNumber))).map(a=>a.id);
}
export const REPORT_DEFINITIONS = 'Monthly sales = delivered/completed net merchandise by actual delivered date in America/New_York. Excludes samples and merged originals; returned quantities reduce the original delivery month. Excludes order-level charges, taxes and discounts. Open orders remain pipeline. Overdue days use remaining invoice balance and due date, with voided invoices excluded. Average payment days is cash-amount weighted from invoice date to active payment date, excluding credit portions; prepayments count as zero days. Source totals remain separate from Nabis.';
