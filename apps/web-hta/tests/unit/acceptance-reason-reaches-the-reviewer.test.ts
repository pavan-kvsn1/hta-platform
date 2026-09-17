/**
 * The one judgement on a certificate, reaching the person whose job it is to weigh it.
 *
 * When a master's accuracy ratio falls below the lab's threshold - or when there is
 * nothing to rate the master by at all - the engineer is stopped and asked to write
 * why it was used anyway. That sentence was saved and then read by nobody: not the
 * reviewer, not the authorising admin, not the certificate. The engineer was being
 * asked to justify something to an audience that could not see the justification.
 */
import { describe, expect, it } from 'vitest'

import { withAcceptanceReasons } from '@/components/certificate/acceptance-reasons'

const master = (over: Record<string, unknown> = {}) => ({
  id: 'mi-1',
  parameterId: 'p1',
  masterInstrumentId: 717,
  masterAcceptanceReason: null as string | null,
  ...over,
})

describe('finding why a master was accepted', () => {
  it('takes the reason written against the pairing', () => {
    const [entry] = withAcceptanceReasons(
      [master({ masterAcceptanceReason: 'Certificate states 0.01 °C resolution.' })],
      [],
    )
    expect(entry.masterAcceptanceReason).toBe('Certificate states 0.01 °C resolution.')
  })

  it('falls back to the parameter, for a certificate written before the pairing held it', () => {
    /**
     * It used to live on the parameter, because a parameter had one master and so one
     * set of answers about it. There is no migration that could move those: the
     * parameter's single field cannot say which of two masters it was about.
     */
    const [entry] = withAcceptanceReasons(
      [master()],
      [{ id: 'p1', parameterName: 'Temperature', masterAcceptanceReason: 'Please approve' }],
    )
    expect(entry.masterAcceptanceReason).toBe('Please approve')
    expect(entry.parameterName).toBe('Temperature')
  })

  it('prefers the pairing where both carry one', () => {
    // The pairing is the newer and more precise of the two: it knows which master.
    const [entry] = withAcceptanceReasons(
      [master({ masterAcceptanceReason: 'On the pairing' })],
      [{ id: 'p1', masterAcceptanceReason: 'On the parameter' }],
    )
    expect(entry.masterAcceptanceReason).toBe('On the pairing')
  })

  it('matches by instrument where the entry names no parameter', () => {
    // Entries written before they recorded which parameter they served.
    const [entry] = withAcceptanceReasons(
      [master({ parameterId: null })],
      [{ id: 'p1', masterInstrumentId: 717, masterAcceptanceReason: 'Approved on its own cert' }],
    )
    expect(entry.masterAcceptanceReason).toBe('Approved on its own cert')
  })

  it('finds nothing for the masters that never needed one', () => {
    // Which is nearly all of them, and an empty reason shows nothing at all.
    const [entry] = withAcceptanceReasons([master()], [{ id: 'p1' }])
    expect(entry.masterAcceptanceReason).toBeNull()
  })

  it('treats a reason of only spaces as no reason', () => {
    const [entry] = withAcceptanceReasons([master({ masterAcceptanceReason: '   ' })], [])
    expect(entry.masterAcceptanceReason).toBeNull()
  })

  it('leaves every other field on the entry alone', () => {
    const [entry] = withAcceptanceReasons([master({ id: 'mi-9', description: 'RTD' })], [])
    expect(entry).toMatchObject({ id: 'mi-9', description: 'RTD', masterInstrumentId: 717 })
  })
})
