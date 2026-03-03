'use client';

import {
  ColumnDef,
  SortingState,
  VisibilityState,
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Download, Filter, Settings2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Button, Input } from '@/components/ui';
import { toast } from 'sonner';

interface Props<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  title: string;
  searchPlaceholder?: string;
  onExportCsv?: () => void;
  mobileCardRenderer?: (row: TData) => ReactNode;
}

export function AdvancedDataTable<TData, TValue>({
  columns,
  data,
  title,
  searchPlaceholder = 'Search...',
  onExportCsv,
  mobileCardRenderer,
}: Props<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [globalFilter, setGlobalFilter] = useState('');

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: 'includesString',
  });

  const selectedCount = useMemo(() => Object.keys(rowSelection).length, [rowSelection]);

  const handleDefaultExport = () => {
    if (onExportCsv) {
      onExportCsv();
      return;
    }

    if (data.length === 0) {
      toast.error('No data to export');
      return;
    }

    // Basic CSV export logic
    const headers = columns
      .map((col) => (typeof col.header === 'string' ? col.header : col.id))
      .filter(Boolean)
      .join(',');

    const rows = data.map((row) => {
      return columns
        .map((col) => {
          let val: unknown = '';
          if ('accessorKey' in col && col.accessorKey) {
            // Support simple nested access (e.g. "user.name")
            const keys = (col.accessorKey as string).split('.');
            let current: unknown = row;
            for (const key of keys) {
              if (current && typeof current === 'object') {
                current = (current as Record<string, unknown>)[key];
              } else {
                current = undefined;
                break;
              }
            }
            val = current;
          } else if ('accessorFn' in col && typeof col.accessorFn === 'function') {
            val = col.accessorFn(row, 0);
          }
          return val !== undefined && val !== null ? `"${String(val).replace(/"/g, '""')}"` : '""';
        })
        .join(',');
    });

    const csvContent = [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${title.toLowerCase().replace(/\s+/g, '-')}-export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Export started');
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 rounded-xl border p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-h2 font-semibold">{title}</h2>
          <p className="text-sm text-slate-500">Sticky headers, saved views, and bulk actions for power users.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Input
            value={globalFilter}
            onChange={(event) => setGlobalFilter(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-11 w-full sm:w-[260px]"
          />
          <Button variant="secondary" className="h-11 min-w-[44px]" onClick={() => toast.info('Filters coming soon')}><Filter className="h-4 w-4" /> Filters</Button>
          <Button variant="secondary" className="h-11 min-w-[44px]" onClick={() => toast.info('Saved views coming soon')}><Settings2 className="h-4 w-4" /> Saved Views</Button>
          <Button variant="outline" className="h-11 min-w-[44px]" onClick={handleDefaultExport}><Download className="h-4 w-4" /> Export</Button>
        </div>
      </div>

      {selectedCount > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 sm:flex-row sm:items-center sm:justify-between">
          <span>{selectedCount} selected</span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" className="min-h-11" onClick={() => toast.info(`Tagging ${selectedCount} items`)}>Tag</Button>
            <Button size="sm" variant="secondary" className="min-h-11" onClick={() => toast.info(`Assigning ${selectedCount} items`)}>Assign</Button>
            <Button size="sm" variant="danger" className="min-h-11" onClick={() => toast.error(`Deleting ${selectedCount} items`)}>Delete</Button>
          </div>
        </div>
      )}

      <div className="space-y-2 md:hidden">
        {table.getRowModel().rows?.length ? (
          table.getRowModel().rows.map((row) => (
            <article key={row.id} className="space-y-2 rounded-xl border bg-white p-3 dark:bg-slate-950">
              {mobileCardRenderer ? (
                mobileCardRenderer(row.original)
              ) : (
                row.getVisibleCells().map((cell) => (
                  <div key={cell.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-slate-500">
                      {typeof cell.column.columnDef.header === 'string' ? cell.column.columnDef.header : String(cell.column.id)}
                    </span>
                    <span className="text-right">{flexRender(cell.column.columnDef.cell, cell.getContext())}</span>
                  </div>
                ))
              )}
            </article>
          ))
        ) : (
          <div className="rounded-xl border p-6 text-center text-slate-500">No results.</div>
        )}
      </div>

      <div className="hidden overflow-hidden rounded-xl border md:block">
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-900">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th key={header.id} className="whitespace-nowrap border-b px-3 py-2 text-left font-semibold">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row, idx) => (
                  <tr
                    key={row.id}
                    data-state={row.getIsSelected() && 'selected'}
                    className={idx % 2 === 0 ? 'bg-white dark:bg-slate-950' : 'bg-slate-50/50 dark:bg-slate-900/30'}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="border-b px-3 py-2 align-top">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={columns.length} className="h-28 text-center text-slate-500">
                    No results.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" className="min-h-11" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            Previous
          </Button>
          <Button variant="outline" size="sm" className="min-h-11" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
