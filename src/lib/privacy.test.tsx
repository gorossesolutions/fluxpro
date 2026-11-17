import { describe, expect, it, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { CurrencyDisplay } from '@/components/ui/CurrencyDisplay'
import { formatMoneyMasked, MASKED_DIGITS } from './format'
import { setAmountsVisible } from './privacy'
import { toMinorUnits } from './money'

describe('formatMoneyMasked', () => {
  it('keeps the currency placement but never the digits', () => {
    expect(formatMoneyMasked('MUR')).toBe(`Rs ${MASKED_DIGITS}`)
    expect(formatMoneyMasked('EUR')).toBe(`${MASKED_DIGITS} €`)
  })
})

describe('CurrencyDisplay privacy mode', () => {
  beforeEach(() => {
    sessionStorage.clear()
    act(() => setAmountsVisible(false))
  })

  it('is masked by default and does not leak the amount', () => {
    render(<CurrencyDisplay amount={toMinorUnits('123456.78')} currency="EUR" />)
    expect(screen.getByLabelText('Montant masqué')).toHaveTextContent(MASKED_DIGITS)
    expect(document.body.textContent).not.toMatch(/123/)
  })

  it('reveals the amount for the session once toggled, and hides it again', () => {
    render(<CurrencyDisplay amount={toMinorUnits('1234.5')} currency="EUR" />)
    act(() => setAmountsVisible(true))
    expect(document.body.textContent).toMatch(/1\s234,50\s€/)
    expect(sessionStorage.getItem('fluxpro.amountsVisible')).toBe('1')
    act(() => setAmountsVisible(false))
    expect(document.body.textContent).toContain(MASKED_DIGITS)
    expect(sessionStorage.getItem('fluxpro.amountsVisible')).toBeNull()
  })
})
