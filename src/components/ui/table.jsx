import * as React from "react"

import { cn } from "@/lib/utils"
import { useDsTheme } from "@/design/themeContext"

// Design system: the legacy classes already read the shadcn variables, which
// an opted-in scope re-points; the extra THEMED classes add the header well,
// row hover and label style. Outside a scope the output is unchanged.
const THEMED = {
  header: "bg-pl-sunken",
  row: "border-pl-border hover:bg-pl-sunken/60 data-[state=selected]:bg-pl-sunken",
  head: "h-10 text-xs font-semibold uppercase tracking-wide text-pl-muted",
  cell: "text-pl-text",
}

const Table = React.forwardRef(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-auto">
    <table
      ref={ref}
      className={cn("w-full caption-bottom text-sm", className)}
      {...props} />
  </div>
))
Table.displayName = "Table"

const TableHeader = React.forwardRef(({ className, ...props }, ref) => {
  const ds = useDsTheme()
  return <thead ref={ref} className={cn("[&_tr]:border-b", ds && THEMED.header, className)} {...props} />
})
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props} />
))
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)}
    {...props} />
))
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef(({ className, ...props }, ref) => {
  const ds = useDsTheme()
  return (
    <tr
      ref={ref}
      className={cn(
        "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
        ds && THEMED.row,
        className
      )}
      {...props} />
  )
})
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef(({ className, ...props }, ref) => {
  const ds = useDsTheme()
  return (
    <th
      ref={ref}
      className={cn(
        "h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
        ds && THEMED.head,
        className
      )}
      {...props} />
  )
})
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef(({ className, ...props }, ref) => {
  const ds = useDsTheme()
  return (
    <td
      ref={ref}
      className={cn("p-4 align-middle [&:has([role=checkbox])]:pr-0", ds && THEMED.cell, className)}
      {...props} />
  )
})
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props} />
))
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}