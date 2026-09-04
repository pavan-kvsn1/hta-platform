/**
 * What quantity a unit measures.
 *
 * The cases are this lab's own registry: "Vacuum" recorded in bar and Pa, which a name
 * filter never showed for a Pressure parameter, and "Sound Pressure Level" recorded in
 * dB, which it always did.
 */
import { describe, it, expect } from 'vitest'
import { knownToDiffer, normaliseUnit, sameQuantity, unitFamily } from '@/lib/units'

describe('reducing a unit to something comparable', () => {
  it('ignores the ways the same unit gets written', () => {
    expect(normaliseUnit('°C')).toBe('c')
    expect(normaliseUnit(' bar g ')).toBe('barg')
    expect(normaliseUnit('m³/h')).toBe('m3/h')
    expect(normaliseUnit('µS/cm')).toBe('us/cm')
    expect(normaliseUnit('Ω')).toBe('ohm')
    expect(normaliseUnit('m/s²')).toBe('m/s2')
  })

  it('treats an absent unit as nothing rather than as a value', () => {
    expect(normaliseUnit(undefined)).toBe('')
    expect(normaliseUnit(null)).toBe('')
    expect(normaliseUnit('   ')).toBe('')
  })
})

describe('the quantity a unit measures', () => {
  it('recognises the ones this registry uses', () => {
    expect(unitFamily('Pa')).toBe('pressure')
    expect(unitFamily('bar')).toBe('pressure')
    expect(unitFamily('°C')).toBe('temperature')
    expect(unitFamily('L/min')).toBe('volumetric flow')
    expect(unitFamily('dB')).toBe('sound level')
    expect(unitFamily('%RH')).toBe('relative humidity')
  })

  it('admits when it does not recognise one', () => {
    expect(unitFamily('HD')).toBeNull()
    expect(unitFamily('%mc')).toBeNull()
    expect(unitFamily('')).toBeNull()
  })
})

describe('whether two units measure the same thing', () => {
  it('sees through the spelling', () => {
    expect(sameQuantity('°C', 'degC')).toBe(true)
    expect(sameQuantity('m³/h', 'm3/hr')).toBe(true)
  })

  it('joins the pressure units, which is what brings Vacuum into the list', () => {
    // "Vacuum" is recorded in bar and in Pa. It is a pressure instrument whatever it
    // is called.
    expect(sameQuantity('bar', 'Pa')).toBe(true)
    expect(sameQuantity('mbar', 'hPa')).toBe(true)
    expect(sameQuantity('bar g', 'Pa')).toBe(true)
  })

  it('keeps sound level out of it', () => {
    expect(sameQuantity('dB', 'Pa')).toBe(false)
  })

  it('keeps standard flow apart from actual flow', () => {
    // SLPM and Nm³/hr are referred to a stated temperature and pressure. Calling them
    // the same as L/min would assert conditions nobody recorded.
    expect(sameQuantity('SLPM', 'L/min')).toBe(false)
    expect(sameQuantity('Nm3/hr', 'm³/h')).toBe(false)
    expect(sameQuantity('SLPM', 'Nm3/hr')).toBe(true)
  })

  it('claims nothing when a unit is missing', () => {
    expect(sameQuantity(undefined, 'Pa')).toBe(false)
    expect(sameQuantity('Pa', '')).toBe(false)
  })

  it('accepts two unrecognised units only when they are written the same', () => {
    // An exact match is evidence. A shared ignorance is not.
    expect(sameQuantity('HD', 'HD')).toBe(true)
    expect(sameQuantity('HD', '%mc')).toBe(false)
  })
})

describe('overruling a name that matched', () => {
  it('says two recognised units are different quantities', () => {
    expect(knownToDiffer('dB', 'Pa')).toBe(true)
    expect(knownToDiffer('°C', 'bar')).toBe(true)
  })

  it('says nothing about units within one quantity', () => {
    expect(knownToDiffer('bar', 'Pa')).toBe(false)
  })

  it('says nothing where either unit is unrecognised', () => {
    // Silence, so the name is left to decide.
    expect(knownToDiffer('HD', 'Pa')).toBe(false)
    expect(knownToDiffer('', 'Pa')).toBe(false)
  })
})
