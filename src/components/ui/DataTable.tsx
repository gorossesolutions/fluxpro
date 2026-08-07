import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowUp, ArrowDown, ArrowUpDown, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/cn'
import { EmptyState } from './EmptyState'
import { Skeleton } from './Skeleton'

interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[]
  data: T[]
  loading?: boolean
  /** A query error, if any. Rendered as a visible error state — a failed fetch must never be
   * indistinguishable from "no data yet" (this exact confusion cost real debugging time once
   * already: a missing migration made a list query fail, and with no error surfaced it looked
   * like newly-created rows were silently vanishing). */
  error?: unknown
  emptyTitle: string
  emptyDescription?: string
  emptyAction?: ReactNode
  /** Renders one row as a mobile card (spec §15.2: tables become cards under 640px). */
  renderMobileCard: (row: T) => ReactNode
  getRowRibbonClassName?: (row: T) => string
}

/**
 * Headless DataTable: full sortable table on tablet+ (frozen-first-column overflow left to
 * callers via sticky column classes), card list on mobile. Pagination/filtering are composed
 * externally with FilterBar/Pagination/SearchInput to keep this component focused.
 */
export function DataTable<T>({
  columns,
  data,
  loading,
  error,
  emptyTitle,
  emptyDescription,
  emptyAction,
  renderMobileCard,
  getRowRibbonClassName,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([])

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <EmptyState
        icon={<AlertTriangle className="h-8 w-8 text-overdue" />}
        title="Impossible de charger les données"
        description={error instanceof Error ? error.message : String(error)}
      />
    )
  }

  if (data.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
  }

  return (
    <>
      {/* Mobile: card list */}
      <ul className="flex flex-col gap-2 sm:hidden">
        {data.map((row, i) => (
          <li key={i}>{renderMobileCard(row)}</li>
        ))}
      </ul>

      {/* Tablet+: table */}
      <div className="hidden overflow-x-auto rounded-xl border border-border sm:block">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border bg-canvas">
                {headerGroup.headers.map((header) => {
                  const sortable = header.column.getCanSort()
                  const sortDir = header.column.getIsSorted()
                  return (
                    <th
                      key={header.id}
                      className="whitespace-nowrap px-4 py-3 text-left font-medium text-slate"
                    >
                      {header.isPlaceholder ? null : (
                        <button
                          type="button"
                          disabled={!sortable}
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn('flex items-center gap-1', sortable && 'cursor-pointer')}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sortable &&
                            (sortDir === 'asc' ? (
                              <ArrowUp className="h-3.5 w-3.5" />
                            ) : sortDir === 'desc' ? (
                              <ArrowDown className="h-3.5 w-3.5" />
                            ) : (
                              <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
                            ))}
                        </button>
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className={cn(
                  'ribbon-left border-b border-border last:border-0 hover:bg-canvas',
                  getRowRibbonClassName?.(row.original),
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 text-ink">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
