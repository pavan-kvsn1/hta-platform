/**
 * The dropdown you can type into.
 *
 * Written after the first version shipped three faults nothing caught: a panel that
 * sized itself to its content instead of the field, a reset option that could be
 * filtered out of its own list, and no keyboard at all.
 *
 * The field and the search are one control: it reads as the chosen value until it is
 * typed into, and typing narrows the list below it.
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

const field = () => screen.getByRole('combobox')
const open = () => fireEvent.click(field())
const type = (value: string) => fireEvent.change(field(), { target: { value } })
const rows = () => screen.getAllByRole('option')

describe('opening it', () => {
  it('reads as the chosen value until it is opened', () => {
    renderIt({ value: 'rtd' })
    expect(field()).toHaveValue('Digital RTD Thermometer with Sensor')
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
  })

  it('opens the list on a click, with nothing else to find first', () => {
    renderIt({ value: 'rtd' })
    open()
    expect(rows()).toHaveLength(5)
  })

  it('opens on focus, so tabbing into it is enough', () => {
    renderIt()
    fireEvent.focus(field())
    expect(rows()).toHaveLength(5)
  })

  it('opens on arrow down from the closed field', () => {
    renderIt()
    fireEvent.keyDown(field(), { key: 'ArrowDown' })
    expect(rows()).toHaveLength(5)
  })
})

describe('narrowing it', () => {
  it('keeps only what matches, on a substring', () => {
    renderIt()
    open()
    type('rtd')
    // Two RTD rows, plus the pinned reset.
    expect(rows()).toHaveLength(3)
  })

  it('keeps the reset above the results rather than filtering it away', () => {
    // "Any description" is not a search result, and losing it leaves no way back.
    renderIt()
    open()
    type('thermocouple')
    expect(rows()[0]).toHaveTextContent('Any description')
    expect(rows()).toHaveLength(2)
  })

  it('matches without regard to case', () => {
    renderIt()
    open()
    type('DEW POINT')
    expect(rows()).toHaveLength(2)
  })

  it('says how much of the list it is holding back', () => {
    renderIt()
    open()
    type('rtd')
    expect(screen.getByText(/2 of 4 shown/)).toBeInTheDocument()
  })

  it('says so plainly when nothing matches', () => {
    renderIt()
    open()
    type('nothing like this')
    expect(screen.getByText('Nothing matches that.')).toBeInTheDocument()
    // The reset survives, so the field is not a dead end.
    expect(rows()).toHaveLength(1)
  })

  it('can be cleared without closing', () => {
    renderIt()
    open()
    type('rtd')
    fireEvent.click(screen.getByLabelText('Clear search'))
    expect(rows()).toHaveLength(5)
  })
})

describe('leaving without choosing', () => {
  it('puts the value back, so a half-typed search is not read as a selection', () => {
    const onChange = renderIt({ value: 'rtd' })
    open()
    type('dew')
    fireEvent.keyDown(field(), { key: 'Escape' })
    expect(field()).toHaveValue('Digital RTD Thermometer with Sensor')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('closes on escape', () => {
    renderIt()
    open()
    fireEvent.keyDown(field(), { key: 'Escape' })
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
  })
})

describe('choosing', () => {
  it('reports the value and closes', () => {
    const onChange = renderIt()
    open()
    fireEvent.click(screen.getByText('Dew Point Transmitter').closest('button')!)
    expect(onChange).toHaveBeenCalledWith('dew')
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
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
    fireEvent.keyDown(field(), { key: 'ArrowDown' })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('dew')
  })

  it('reaches the last option with End', () => {
    const onChange = renderIt()
    open()
    fireEvent.keyDown(field(), { key: 'End' })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('tc')
  })

  it('does not run off either end of the list', () => {
    const onChange = renderIt()
    open()
    for (let i = 0; i < 10; i += 1) fireEvent.keyDown(field(), { key: 'ArrowUp' })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('__any__')
  })

  it('starts from the top again when the search changes', () => {
    const onChange = renderIt()
    open()
    fireEvent.keyDown(field(), { key: 'End' })
    type('rtd')
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('__any__')
  })
})

describe('reading it', () => {
  it('emphasises the run that matched, so the row explains itself', () => {
    renderIt()
    open()
    type('Sensor')
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
    type('ametek')
    expect(rows()).toHaveLength(1)
    expect(within(rows()[0]).getByText(/Ametek/)).toBeInTheDocument()
  })
})
