/**
 * The dropdown you can type into.
 *
 * Written after the first version shipped three faults nothing caught: a panel that
 * sized itself to its content instead of the field, a reset option that could be
 * filtered out of its own list, and no keyboard at all.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { SearchableSelect } from '@/components/ui/searchable-select'

const OPTIONS = [
  { value: '__any__', label: 'Any description', pinned: true },
  { value: 'dew', label: 'Dew Point Transmitter' },
  { value: 'rtd4', label: 'Digital RTD Thermometer with PT 100 Sensor (4 Wire)' },
  { value: 'rtd', label: 'Digital RTD Thermometer with Sensor' },
  { value: 'tc', label: 'Digital Thermocouple thermometer with k type sensor' },
]

function renderIt(over: Record<string, unknown> = {}) {
  const onChange = vi.fn()
  render(
    <SearchableSelect value="__any__" options={OPTIONS} onChange={onChange} {...over} />,
  )
  return onChange
}

const open = () => fireEvent.click(screen.getByRole('combobox'))
const search = () => screen.getByLabelText('Search')
const rows = () => screen.getAllByRole('option')

describe('opening it', () => {
  it('shows the field, then the list, then the search', () => {
    renderIt({ value: 'rtd' })
    expect(screen.getByRole('combobox')).toHaveTextContent('Digital RTD Thermometer with Sensor')
    open()
    expect(search()).toBeInTheDocument()
    expect(rows()).toHaveLength(5)
  })

  it('puts the caret in the search, so typing narrows straight away', () => {
    renderIt()
    open()
    expect(search()).toHaveFocus()
  })
})

describe('narrowing it', () => {
  it('keeps only what matches, on a substring', () => {
    renderIt()
    open()
    fireEvent.change(search(), { target: { value: 'rtd' } })
    // Two RTD rows, plus the pinned reset.
    expect(rows()).toHaveLength(3)
  })

  it('keeps the reset above the results rather than filtering it away', () => {
    // "Any description" is not a search result, and losing it leaves no way back.
    renderIt()
    open()
    fireEvent.change(search(), { target: { value: 'thermocouple' } })
    expect(rows()[0]).toHaveTextContent('Any description')
    expect(rows()).toHaveLength(2)
  })

  it('matches without regard to case', () => {
    renderIt()
    open()
    fireEvent.change(search(), { target: { value: 'DEW POINT' } })
    expect(rows()).toHaveLength(2)
  })

  it('says how much of the list it is holding back', () => {
    renderIt()
    open()
    fireEvent.change(search(), { target: { value: 'rtd' } })
    expect(screen.getByText(/2 of 4 shown/)).toBeInTheDocument()
  })

  it('says so plainly when nothing matches', () => {
    renderIt()
    open()
    fireEvent.change(search(), { target: { value: 'nothing like this' } })
    expect(screen.getByText('Nothing matches that.')).toBeInTheDocument()
    // The reset survives, so the field is not a dead end.
    expect(rows()).toHaveLength(1)
  })

  it('can be cleared without closing', () => {
    renderIt()
    open()
    fireEvent.change(search(), { target: { value: 'rtd' } })
    fireEvent.click(screen.getByLabelText('Clear search'))
    expect(rows()).toHaveLength(5)
  })
})

describe('choosing', () => {
  it('reports the value and closes', () => {
    const onChange = renderIt()
    open()
    fireEvent.click(screen.getByText('Dew Point Transmitter').closest('button')!)
    expect(onChange).toHaveBeenCalledWith('dew')
    expect(screen.queryByLabelText('Search')).not.toBeInTheDocument()
  })

  it('marks what is already chosen', () => {
    renderIt({ value: 'rtd' })
    open()
    const chosen = rows().find((r) => r.textContent?.includes('with Sensor'))!
    expect(chosen).toHaveAttribute('aria-selected', 'true')
  })

  it('works from the keyboard, without reaching for the mouse', () => {
    const onChange = renderIt()
    open()
    fireEvent.keyDown(search(), { key: 'ArrowDown' })
    fireEvent.keyDown(search(), { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('dew')
  })

  it('reaches the last option with End', () => {
    const onChange = renderIt()
    open()
    fireEvent.keyDown(search(), { key: 'End' })
    fireEvent.keyDown(search(), { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('tc')
  })

  it('does not run off either end of the list', () => {
    const onChange = renderIt()
    open()
    for (let i = 0; i < 10; i += 1) fireEvent.keyDown(search(), { key: 'ArrowUp' })
    fireEvent.keyDown(search(), { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('__any__')
  })

  it('starts from the top again when the search changes', () => {
    const onChange = renderIt()
    open()
    fireEvent.keyDown(search(), { key: 'End' })
    fireEvent.change(search(), { target: { value: 'rtd' } })
    fireEvent.keyDown(search(), { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('__any__')
  })
})

describe('reading it', () => {
  it('emphasises the run that matched, so the row explains itself', () => {
    renderIt()
    open()
    fireEvent.change(search(), { target: { value: 'Sensor' } })
    const marks = screen.getAllByText('Sensor', { selector: 'mark' })
    expect(marks.length).toBeGreaterThan(0)
  })

  it('shows the detail line under the label, and searches it too', () => {
    renderIt({
      options: [
        { value: 'a', label: '600 HTAIPL/L', detail: 'Fluke 1524' },
        { value: 'b', label: '742 HTAIPL/L', detail: 'Ametek RTC-159' },
      ],
      value: 'a',
    })
    open()
    fireEvent.change(search(), { target: { value: 'ametek' } })
    expect(rows()).toHaveLength(1)
    expect(within(rows()[0]).getByText(/Ametek/)).toBeInTheDocument()
  })
})
