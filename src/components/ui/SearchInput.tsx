import { Search } from 'lucide-react'
import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export function SearchInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate" />
      <input
        type="search"
        className={cn(
          'h-11 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-base text-ink',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue',
          className,
        )}
        {...props}
      />
    </div>
  )
}
