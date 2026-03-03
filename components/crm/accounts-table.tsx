'use client';
import type { ColumnDef } from '@tanstack/react-table';
import { AdvancedDataTable } from '@/components/crm/advanced-data-table';
import { Badge } from '@/components/ui';
import { currency, number } from '@/lib/utils';

export type AccountTableRow = {
  id: string;
  name: string;
  licenseNumber: string;
  status: 'ACTIVE' | 'INACTIVE';
  city: string;
  state: string;
  contactsCount: number;
  openValue: number;
  daysOverdue: number;
  lastUpdated: string;
};

const columns: ColumnDef<AccountTableRow>[] = [
  {
    accessorKey: 'name',
    header: 'Dispensary',
    cell: ({ row }) => (
      <div>
        <span className="font-semibold text-primary">{row.original.name}</span>
        <p className="text-xs text-slate-500">{row.original.licenseNumber}</p>
      </div>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => <Badge variant={row.original.status === 'ACTIVE' ? 'success' : 'secondary'}>{row.original.status}</Badge>,
  },
  {
    accessorKey: 'city',
    header: 'City',
    cell: ({ row }) => `${row.original.city}, ${row.original.state}`,
  },
  {
    accessorKey: 'contactsCount',
    header: 'Contacts',
    cell: ({ row }) => number(row.original.contactsCount),
  },
  {
    accessorKey: 'openValue',
    header: 'Open Opp Value',
    cell: ({ row }) => currency(row.original.openValue),
  },
  {
    accessorKey: 'daysOverdue',
    header: 'Days Overdue',
    cell: ({ row }) => <span className={row.original.daysOverdue > 0 ? 'text-red-600 font-semibold' : ''}>{number(row.original.daysOverdue)}</span>,
  },
  {
    accessorKey: 'lastUpdated',
    header: 'Last Updated',
  },
];

export function AccountsTable({ rows }: { rows: AccountTableRow[] }) {
  return (
    <AdvancedDataTable
      title="Dispensary Master List"
      columns={columns}
      data={rows}
      searchPlaceholder="Search dispensary or license..."
      mobileCardRenderer={(row) => (
        <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-primary">{row.name}</p>
              <p className="text-xs text-slate-500">{row.licenseNumber}</p>
            </div>
            <Badge variant={row.status === 'ACTIVE' ? 'success' : 'secondary'}>{row.status}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <p className="text-slate-600">City: {row.city}, {row.state}</p>
            <p className="text-slate-600">Contacts: {number(row.contactsCount)}</p>
            <p className="text-slate-600">Open Value: {currency(row.openValue)}</p>
            <p className={row.daysOverdue > 0 ? 'font-semibold text-red-600' : 'text-slate-600'}>
              Overdue: {number(row.daysOverdue)}
            </p>
          </div>
        </>
      )}
    />
  );
}
