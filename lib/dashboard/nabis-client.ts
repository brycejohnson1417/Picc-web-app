import type { DashboardDateRange, ProcessedNabisOrder, SerializedNabisOrder } from '@/lib/dashboard/nabis-types';

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getDefaultDateRange(): DashboardDateRange {
  const now = new Date();
  return {
    start: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
    end: formatDateInputValue(now),
  };
}

export function isDateRangeValid(range: DashboardDateRange) {
  return Boolean(range.start && range.end && range.start <= range.end);
}

export function parseLocalDate(dateString: string) {
  return new Date(`${dateString}T12:00:00`);
}

export function toDateKey(date: Date) {
  return formatDateInputValue(date);
}

export function formatTimestamp(timestamp: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

export function deserializeOrders(orders: SerializedNabisOrder[]): ProcessedNabisOrder[] {
  return orders.map((order) => ({
    ...order,
    createdDate: parseLocalDate(order.createdDate),
  }));
}
