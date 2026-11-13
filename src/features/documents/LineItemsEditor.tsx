import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { NumberInput } from '@/components/ui/NumberInput'
import { Button } from '@/components/ui/Button'
import { addMoney, mulMoney, toMinorUnits, fromMinorUnits, type MinorUnits } from '@/lib/money'
import { parseDecimal } from '@/lib/decimalInput'

// Kept well below what would make a single line item's PDF table row sprawl across pages —
// the description prints as its own block under the title (generateDocumentPdf.ts), which
// wraps and auto-grows the row safely, but an unbounded paste-in could still make one line
// item absurdly tall. Enforced both in the textarea (maxLength) and shown as a live counter.
export const LINE_DESCRIPTION_MAX_LENGTH = 500

export interface EditableLine {
  title: string
  description: string
  quantity: string
  unit_price: string
}

interface LineItemsEditorProps {
  lines: EditableLine[]
  onChange: (lines: EditableLine[]) => void
  currency: string
}

export function emptyLine(): EditableLine {
  return { title: '', description: '', quantity: '', unit_price: '' }
}

/* Render-time math must never throw: a stray letter in a price field used to reach
 * toMinorUnits() mid-render, throw, and take the whole invoice/quote editor down (losing
 * everything typed). parseDecimal() is total — anything unparseable counts as 0 until fixed. */
export function lineQuantity(line: EditableLine): number {
  return parseDecimal(line.quantity)
}

export function lineUnitPriceMinor(line: EditableLine): MinorUnits {
  return toMinorUnits(parseDecimal(line.unit_price))
}

export function computeLineTotalMinor(line: EditableLine): MinorUnits {
  return mulMoney(lineUnitPriceMinor(line), lineQuantity(line))
}

export function computeLineTotal(line: EditableLine): string {
  return fromMinorUnits(computeLineTotalMinor(line))
}

export function computeSubtotal(lines: EditableLine[]): string {
  return fromMinorUnits(lines.reduce((sum, line) => addMoney(sum, computeLineTotalMinor(line)), 0 as MinorUnits))
}

/** Repeatable line-item editor shared by invoices and quotes (spec §7, §8: "same engine").
 * Reorder via up/down buttons on all breakpoints — deliberately not drag-and-drop, which has
 * no reliable touch equivalent and this needs to work identically on mobile. */
export function LineItemsEditor({ lines, onChange, currency }: LineItemsEditorProps) {
  const updateLine = (index: number, patch: Partial<EditableLine>) => {
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  }

  const removeLine = (index: number) => {
    if (lines.length <= 1) return
    onChange(lines.filter((_, i) => i !== index))
  }

  const moveLine = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= lines.length) return
    const next = [...lines]
    ;[next[index], next[target]] = [next[target]!, next[index]!]
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-3">
      {lines.map((line, index) => (
        <div key={index} className="rounded-lg border border-border p-3">
          <div className="flex items-start gap-2">
            <div className="flex flex-1 flex-col gap-2">
              <Input
                placeholder="Titre de la prestation"
                value={line.title}
                onChange={(e) => updateLine(index, { title: e.target.value })}
              />
              <div>
                <Textarea
                  placeholder="Description (optionnel)"
                  rows={2}
                  maxLength={LINE_DESCRIPTION_MAX_LENGTH}
                  value={line.description}
                  onChange={(e) => updateLine(index, { description: e.target.value })}
                />
                <p className="mt-0.5 text-right text-xs text-slate/60">
                  {line.description.length}/{LINE_DESCRIPTION_MAX_LENGTH}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor={`line-quantity-${index}`} className="mb-1 block text-xs text-slate">Quantité</label>
                  <NumberInput
                    id={`line-quantity-${index}`}
                    value={line.quantity}
                    placeholder="1"
                    onChange={(e) => updateLine(index, { quantity: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor={`line-unit-price-${index}`} className="mb-1 block text-xs text-slate">Prix unitaire</label>
                  <NumberInput
                    id={`line-unit-price-${index}`}
                    value={line.unit_price}
                    placeholder="1000"
                    suffix={currency}
                    onChange={(e) => updateLine(index, { unit_price: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate">Total</span>
                <span className="tabular-nums font-medium text-ink">
                  {computeLineTotal(line)} {currency}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Button variant="ghost" size="sm" onClick={() => moveLine(index, -1)} disabled={index === 0} aria-label="Monter">
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => moveLine(index, 1)} disabled={index === lines.length - 1} aria-label="Descendre">
                <ChevronDown className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => removeLine(index)} disabled={lines.length <= 1} aria-label="Supprimer">
                <Trash2 className="h-4 w-4 text-overdue" />
              </Button>
            </div>
          </div>
        </div>
      ))}
      <Button variant="secondary" size="sm" onClick={() => onChange([...lines, emptyLine()])} className="self-start">
        <Plus className="h-4 w-4" />
        Ajouter une ligne
      </Button>
    </div>
  )
}
