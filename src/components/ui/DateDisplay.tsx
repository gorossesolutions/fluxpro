import { formatDate } from '@/lib/format'

export function DateDisplay({ date }: { date: string | Date }) {
  return <time dateTime={typeof date === 'string' ? date : date.toISOString()}>{formatDate(date)}</time>
}
