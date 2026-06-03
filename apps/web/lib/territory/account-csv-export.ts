import type { TerritoryStorePin } from '@/lib/territory/types';

export type AccountCsvColumnKey =
  | 'name'
  | 'status'
  | 'pinKind'
  | 'repNames'
  | 'city'
  | 'state'
  | 'locationAddress'
  | 'phoneNumber'
  | 'email'
  | 'licenseNumber'
  | 'referralSource'
  | 'pppStatus'
  | 'headsetConnectionStatus'
  | 'isPreferredPartner'
  | 'vendorDayStatus'
  | 'followUpDate'
  | 'followUpNeeded'
  | 'followUpReason'
  | 'lastCheckIn'
  | 'lastSampleOrderDate'
  | 'lastSampleDeliveryDate'
  | 'lastOrderDate'
  | 'daysOverdue'
  | 'notes'
  | 'lat'
  | 'lng'
  | 'locationPrecision'
  | 'locationSource'
  | 'isApproximate'
  | 'notionPageId'
  | 'notionUrl'
  | 'lastEditedTime';

export interface AccountCsvColumn {
  key: AccountCsvColumnKey;
  label: string;
  defaultSelected: boolean;
  getValue: (store: TerritoryStorePin) => string | number | boolean | null | undefined;
}

export const ACCOUNT_CSV_COLUMNS: AccountCsvColumn[] = [
  { key: 'name', label: 'Account Name', defaultSelected: true, getValue: (store) => store.name },
  { key: 'status', label: 'Status', defaultSelected: true, getValue: (store) => store.status },
  { key: 'pinKind', label: 'Account Type', defaultSelected: true, getValue: (store) => store.pinKind },
  { key: 'repNames', label: 'Reps', defaultSelected: true, getValue: (store) => store.repNames.join('; ') },
  { key: 'city', label: 'City', defaultSelected: true, getValue: (store) => store.city },
  { key: 'state', label: 'State', defaultSelected: true, getValue: (store) => store.state },
  { key: 'locationAddress', label: 'Address', defaultSelected: true, getValue: (store) => store.locationAddress ?? store.locationLabel },
  { key: 'phoneNumber', label: 'Phone', defaultSelected: true, getValue: (store) => store.phoneNumber },
  { key: 'email', label: 'Email', defaultSelected: true, getValue: (store) => store.email },
  { key: 'licenseNumber', label: 'License Number', defaultSelected: true, getValue: (store) => store.licenseNumber },
  { key: 'referralSource', label: 'Referral Source', defaultSelected: true, getValue: (store) => store.referralSource },
  { key: 'pppStatus', label: 'PPP Status', defaultSelected: true, getValue: (store) => store.pppStatus },
  { key: 'headsetConnectionStatus', label: 'Headset Connection', defaultSelected: true, getValue: (store) => store.headsetConnectionStatus },
  { key: 'isPreferredPartner', label: 'Preferred Partner', defaultSelected: true, getValue: (store) => store.isPreferredPartner },
  { key: 'vendorDayStatus', label: 'Vendor Day Status', defaultSelected: true, getValue: (store) => store.vendorDayStatus },
  { key: 'followUpDate', label: 'Follow-up Date', defaultSelected: true, getValue: (store) => store.followUpDate },
  { key: 'followUpNeeded', label: 'Follow-up Needed', defaultSelected: true, getValue: (store) => store.followUpNeeded },
  { key: 'followUpReason', label: 'Follow-up Reason', defaultSelected: true, getValue: (store) => store.followUpReason },
  { key: 'lastCheckIn', label: 'Last Check-in', defaultSelected: true, getValue: (store) => store.lastCheckIn },
  { key: 'lastSampleOrderDate', label: 'Last Sample Order', defaultSelected: true, getValue: (store) => store.lastSampleOrderDate },
  { key: 'lastSampleDeliveryDate', label: 'Last Sample Delivery', defaultSelected: true, getValue: (store) => store.lastSampleDeliveryDate },
  { key: 'lastOrderDate', label: 'Last Order', defaultSelected: true, getValue: (store) => store.lastOrderDate },
  { key: 'daysOverdue', label: 'Days Overdue', defaultSelected: true, getValue: (store) => store.daysOverdue },
  { key: 'notes', label: 'Notes', defaultSelected: false, getValue: (store) => store.notes },
  { key: 'lat', label: 'Latitude', defaultSelected: false, getValue: (store) => store.lat },
  { key: 'lng', label: 'Longitude', defaultSelected: false, getValue: (store) => store.lng },
  { key: 'locationPrecision', label: 'Location Precision', defaultSelected: false, getValue: (store) => store.locationPrecision },
  { key: 'locationSource', label: 'Location Source', defaultSelected: false, getValue: (store) => store.locationSource },
  { key: 'isApproximate', label: 'Approximate Location', defaultSelected: false, getValue: (store) => store.isApproximate },
  { key: 'notionPageId', label: 'Notion Page ID', defaultSelected: false, getValue: (store) => store.notionPageId },
  { key: 'notionUrl', label: 'Notion URL', defaultSelected: false, getValue: (store) => notionPageUrl(store.notionPageId) },
  { key: 'lastEditedTime', label: 'Last Edited', defaultSelected: false, getValue: (store) => store.lastEditedTime },
];

const ACCOUNT_CSV_COLUMN_BY_KEY = new Map(ACCOUNT_CSV_COLUMNS.map((column) => [column.key, column]));

export function getDefaultAccountCsvColumnKeys() {
  return ACCOUNT_CSV_COLUMNS.filter((column) => column.defaultSelected).map((column) => column.key);
}

export function buildAccountCsv({ stores, columnKeys }: { stores: TerritoryStorePin[]; columnKeys: AccountCsvColumnKey[] }) {
  const columns = columnKeys.map((key) => ACCOUNT_CSV_COLUMN_BY_KEY.get(key)).filter((column): column is AccountCsvColumn => Boolean(column));
  const header = columns.map((column) => escapeCsvHeader(column.label)).join(',');
  const rows = stores.map((store) => columns.map((column) => escapeCsvCell(column.getValue(store))).join(','));
  return [header, ...rows].join('\n');
}

export function accountCsvExportFilename(generatedAt = new Date()) {
  const stamp = generatedAt.toISOString().slice(0, 16).replace(/[-:T]/g, '');
  return `picc-territory-accounts-${stamp}.csv`;
}

function notionPageUrl(pageId: string) {
  return `https://www.notion.so/${pageId.replace(/-/g, '')}`;
}

function escapeCsvCell(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  return `"${value.replace(/"/g, '""')}"`;
}

function escapeCsvHeader(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
