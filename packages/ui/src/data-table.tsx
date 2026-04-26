"use client";

import {
  type HTMLAttributes,
  type ThHTMLAttributes,
  type TdHTMLAttributes,
  forwardRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { cn } from "./cn";

/* ---- Primitive parts ---- */

export const Table = forwardRef<
  HTMLTableElement,
  HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="w-full overflow-x-auto">
    <table
      ref={ref}
      className={cn(
        "w-full border-collapse font-[var(--font-sans)] text-sm",
        className,
      )}
      {...props}
    />
  </div>
));
Table.displayName = "Table";

export const TableHeader = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn(
      "border-b-2 border-[var(--color-rule)]",
      className,
    )}
    {...props}
  />
));
TableHeader.displayName = "TableHeader";

export const TableBody = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&>tr:nth-child(even)]:bg-[var(--color-paper)]", className)}
    {...props}
  />
));
TableBody.displayName = "TableBody";

export const TableRow = forwardRef<
  HTMLTableRowElement,
  HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-b border-[var(--color-rule-faint)] transition-colors hover:bg-[var(--color-paper-warm)]",
      className,
    )}
    {...props}
  />
));
TableRow.displayName = "TableRow";

export const TableHead = forwardRef<
  HTMLTableCellElement,
  ThHTMLAttributes<HTMLTableCellElement> & { sortable?: boolean; sorted?: "asc" | "desc" | false }
>(({ className, sortable, sorted, children, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.05em] text-[var(--color-ink-muted)]",
      sortable && "cursor-pointer select-none hover:text-[var(--color-ink)]",
      className,
    )}
    {...props}
  >
    <span className="inline-flex items-center gap-1">
      {children}
      {sortable && sorted === "asc" && <span className="text-[10px]">{"▲"}</span>}
      {sortable && sorted === "desc" && <span className="text-[10px]">{"▼"}</span>}
      {sortable && !sorted && <span className="text-[10px] opacity-30">{"▲"}</span>}
    </span>
  </th>
));
TableHead.displayName = "TableHead";

export const TableCell = forwardRef<
  HTMLTableCellElement,
  TdHTMLAttributes<HTMLTableCellElement> & { mono?: boolean }
>(({ className, mono, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "px-3 py-2 text-[var(--color-ink-light)]",
      mono && "font-[var(--font-mono)] tabular-nums",
      className,
    )}
    {...props}
  />
));
TableCell.displayName = "TableCell";

/* ---- Convenience: full sortable DataTable ---- */

export interface DataTableColumn<T> {
  key: string;
  header: string;
  sortable?: boolean;
  mono?: boolean;
  render?: (row: T) => React.ReactNode;
}

export interface DataTableProps<T> extends HTMLAttributes<HTMLTableElement> {
  columns: DataTableColumn<T>[];
  data: T[];
  getRowKey: (row: T, index: number) => string;
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  getRowKey,
  className,
  ...props
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleSort = useCallback(
    (key: string) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
    },
    [sortKey],
  );

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null || bv == null) return 0;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  return (
    <Table className={className} {...props}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {columns.map((col) => (
            <TableHead
              key={col.key}
              sortable={col.sortable}
              sorted={sortKey === col.key ? sortDir : false}
              onClick={col.sortable ? () => handleSort(col.key) : undefined}
            >
              {col.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((row, i) => (
          <TableRow key={getRowKey(row, i)}>
            {columns.map((col) => (
              <TableCell key={col.key} mono={col.mono}>
                {col.render ? col.render(row) : String(row[col.key] ?? "")}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
