/**
 * The control that asks a column what step its figures move in.
 *
 * The pure rules are covered in field-resolution.test.ts. What is checked here is the
 * wiring: that unticking the box actually leaves the column unanswered rather than
 * quietly carrying the instrument's number across, and that what is typed is stored.
 */
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ColumnSetup } from '@/components/forms/ColumnSetup'
import type { ErrorConfig, FieldDefinition } from '@/lib/certificate/fields'

const FIELDS: FieldDefinition[] = [
  { id: 'm1', name: 'Master Reading', group: 'master', type: 'numeric', unit: 'degC', order: 0 },
  { id: 'u1', name: 'UUC Reading', group: 'uuc', type: 'numeric', unit: 'degC', order: 0 },
  { id: 'u2', name: 'Remarks', group: 'uuc', type: 'text', unit: '', order: 1 },
]

const ERROR_CONFIG: ErrorConfig = {
  masterFieldId: 'm1',
  uucFieldId: 'u1',
  formula: 'A-B',
  unit: 'degC',
}

async function openSetup(fields = FIELDS) {
  const user = userEvent.setup()
  const onChange = vi.fn()
  render(
    <ColumnSetup
      fields={fields}
      errorConfig={ERROR_CONFIG}
      parameterUnit="degC"
      onChange={onChange}
    />,
  )
  await user.click(screen.getByRole('button', { name: /Parameter Setup/ }))
  return { user, onChange }
}

afterEach(() => cleanup())

describe('which columns are asked', () => {
  it('asks every column that holds a figure, naming the instrument it would inherit from', async () => {
    await openSetup()
    expect(
      screen.getByRole('checkbox', { name: 'Master Reading uses the same least count as the master' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('checkbox', { name: 'UUC Reading uses the same least count as the UUC' }),
    ).toBeTruthy()
  })

  it('does not ask a text column, because words do not step', async () => {
    await openSetup()
    expect(screen.queryByRole('checkbox', { name: /^Remarks uses/ })).toBeNull()
  })

  it('starts ticked for a column declared before this was asked for', async () => {
    await openSetup()
    const box = screen.getByRole('checkbox', {
      name: 'UUC Reading uses the same least count as the UUC',
    }) as HTMLInputElement
    expect(box.checked).toBe(true)
    expect(screen.queryByRole('textbox', { name: 'Least count for UUC Reading' })).toBeNull()
  })
})

describe('unticking the box', () => {
  it('leaves the column unanswered rather than filling in a number nobody chose', async () => {
    const { user, onChange } = await openSetup()
    await user.click(
      screen.getByRole('checkbox', { name: 'UUC Reading uses the same least count as the UUC' }),
    )

    const [fields] = onChange.mock.calls.at(-1) as [FieldDefinition[], ErrorConfig]
    expect(fields.find((f) => f.id === 'u1')?.resolution).toEqual({
      source: 'custom',
      leastCount: '',
    })
  })
})

describe('a column that steps in a size of its own', () => {
  const withCustom = (leastCount: string): FieldDefinition[] =>
    FIELDS.map((f) => (f.id === 'u1' ? { ...f, resolution: { source: 'custom', leastCount } } : f))

  it('shows the step it was given, ready to edit', async () => {
    await openSetup(withCustom('0.025'))
    const input = screen.getByRole('textbox', {
      name: 'Least count for UUC Reading',
    }) as HTMLInputElement
    expect(input.value).toBe('0.025')
  })

  it('stores what is typed', async () => {
    const { user, onChange } = await openSetup(withCustom(''))
    await user.type(screen.getByRole('textbox', { name: 'Least count for UUC Reading' }), '5')

    const [fields] = onChange.mock.calls.at(-1) as [FieldDefinition[], ErrorConfig]
    expect(fields.find((f) => f.id === 'u1')?.resolution).toEqual({
      source: 'custom',
      leastCount: '5',
    })
  })

  it('ticking the box again puts it back on its instrument', async () => {
    const { user, onChange } = await openSetup(withCustom('0.025'))
    await user.click(
      screen.getByRole('checkbox', { name: 'UUC Reading uses the same least count as the UUC' }),
    )

    const [fields] = onChange.mock.calls.at(-1) as [FieldDefinition[], ErrorConfig]
    expect(fields.find((f) => f.id === 'u1')?.resolution).toEqual({ source: 'instrument' })
  })
})

describe('what blocks the parameter', () => {
  it('says the parameter cannot be saved, and names the column', async () => {
    await openSetup(
      FIELDS.map((f) =>
        f.id === 'u1' ? { ...f, resolution: { source: 'custom', leastCount: '' } } : f,
      ),
    )
    expect(screen.getByText(/cannot be saved until every column says/)).toBeTruthy()
    expect(screen.getByText(/^UUC Reading does not say what its least count is/)).toBeTruthy()
  })

  it('says nothing while every column has answered', async () => {
    await openSetup()
    expect(screen.queryByText(/cannot be saved until every column says/)).toBeNull()
  })
})
