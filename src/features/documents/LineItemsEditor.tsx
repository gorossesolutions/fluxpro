import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { NumberInput } from '@/components/ui/NumberInput'
import { Button } from '@/components/ui/Button'
import { addMoney, mulMoney, toMinorUnits, fromMinorUnits } from '@/lib/money'

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
  return { title: '', description: '', quantity: '1', unit_price: '0.00' }
}

export function computeLineTotal(line: EditableLine): string {
  const qty = Number.parseFloat(line.quantity || '0')
  const unitPrice = toMinorUnits(line.unit_price || '0')
  return fromMinorUnits(mulMoney(unitPrice, qty))
}

export function computeSubtotal(lines: EditableLine[]): string {
  return fromMinorUnits(lines.reduce((sum, line) => addMoney(sum, toMinorUnits(computeLineTotal(line))), toMinorUnits('0')))
}

/** Repeatable line-item editor shared by invoices and quotes (spec §7, §8: "same engine").
 * Reorder via up/down buttons on all breakpoints — deliberately not drag-and-drop, which has
 * no reliable touch equivalent and this needs to work identically on mobile. */
export function LineItemsEditor({ lines, onChange, currency }: LineItemsEditorProps) {
  const updateLine = (index: number, patch: Partial<EditableLine>) => {
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  }

  // Quantité/Prix unitaire are re-typed from scratch far more often than fine-edited, so the
  // existing value clears itself on focus instead of making the user select-all/backspace it
  // first — restored on blur if they click away without typing a replacement.
  const handleNumberFocus = (e: React.FocusEvent<HTMLInputElement>, index: number, field: 'quantity' | 'unit_price') => {
    e.currentTarget.dataset.prevValue = lines[index]?.[field] ?? ''
    updateLine(index, { [field]: '' })
  }

  const handleNumberBlur = (e: React.FocusEvent<HTMLInputElement>, index: number, field: 'quantity' | 'unit_price', fallback: string) => {
    if ((lines[index]?.[field] ?? '').trim() === '') {
      updateLine(index, { [field]: e.currentTarget.dataset.prevValue || fallback })
    }
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
              <Input
                placeholder="Description (optionnel)"
                value={line.description}
                onChange={(e) => updateLine(index, { description: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor={`line-quantity-${index}`} className="mb-1 block text-xs text-slate">Quantité</label>
                  <NumberInput
                    id={`line-quantity-${index}`}
                    value={line.quantity}
                    onChange={(e) => updateLine(index, { quantity: e.target.value })}
                    onFocus={(e) => handleNumberFocus(e, index, 'quantity')}
                    onBlur={(e) => handleNumberBlur(e, index, 'quantity', '1')}
                  />
                </div>
                <div>
                  <label htmlFor={`line-unit-price-${index}`} className="mb-1 block text-xs text-slate">Prix unitaire</label>
                  <NumberInput
                    id={`line-unit-price-${index}`}
                    value={line.unit_price}
                    suffix={currency}
                    onChange={(e) => updateLine(index, { unit_price: e.target.value })}
                    onFocus={(e) => handleNumberFocus(e, index, 'unit_price')}
                    onBlur={(e) => handleNumberBlur(e, index, 'unit_price', '0.00')}
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
