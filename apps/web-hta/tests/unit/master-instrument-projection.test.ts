/**
 * Parity between the registry projection and the old master list.
 *
 * The point of these is that switching a consumer's data source from
 * master-instruments.json to the registry changes nothing it can observe. Run against
 * all 209 real instruments, because a fixture proves nothing about the shipped data.
 */
import { describe, it, expect } from 'vitest'
import {
  LEGACY_ONLY_FIELDS,
  isoToLegacyDate,
  projectLegacyInstrument,
} from '@/lib/master/projection'
import registryData from '@/data/master-instrument-registry.json'
import legacyList from '@/data/master-instruments.json'
import type { MasterInstrumentRegistry } from '@/lib/master/registry'
import { getSimpleValue } from '@/lib/master/instruments'

const registry = registryData as unknown as MasterInstrumentRegistry
const legacy = legacyList as unknown as Record<string, unknown>[]

const projected = registry.assets.flatMap((asset) =>
  asset.units.map((unit) => projectLegacyInstrument(asset, unit)),
)
const byId = new Map(projected.map((p) => [p.id, p]))

/** '' and null and undefined all mean "not recorded" and must not count as a difference. */
const blank = (value: unknown) => value === '' || value === null || value === undefined

function differences(field: string, compare: (a: unknown, b: unknown) => boolean) {
  return legacy.filter((row) => {
    const mine = byId.get(row.id as number) as unknown as Record<string, unknown>
    const a = row[field]
    const b = mine[field]
    if (blank(a) && blank(b)) return false
    return !compare(a, b)
  })
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const sameText = (a: unknown, b: unknown) => String(a ?? '').trim() === String(b ?? '').trim()

/**
 * Composites are written two ways in the old file - sometimes {ind, sen}, sometimes the
 * joined string - so compare the two halves rather than the container.
 */
function sameComposite(a: unknown, b: unknown) {
  const halves = (value: unknown): string => {
    if (value && typeof value === 'object') {
      const { ind, sen } = value as { ind?: string; sen?: string }
      return `${ind ?? ''}|${sen ?? ''}`
    }
    const text = String(value ?? '').trim()
    // 'NA' is an absent value written longhand; the registry writes it as empty.
    if (text === '' || text.toUpperCase() === 'NA') return ''
    const match = /ind\s*[:.]?\s*(.+?)\s*sen\s*[:.]?\s*(.+)$/i.exec(text)
    return match ? `${match[1]}|${match[2]}` : text
  }
  const normalize = (value: string) =>
    value.replace(/[\s&,;/]+/g, ' ').replace(/ \|/g, '|').replace(/\| /g, '|').trim()
  return normalize(halves(a)) === normalize(halves(b))
}

/**
 * Five instruments carry a month-only due date in the old file - "Jan-2027" - which the
 * registry records as the first of that month. That is invented precision, kept because
 * the earliest day in the month is the conservative reading: an instrument reads as due
 * sooner rather than later. Listed rather than skipped, so the exception stays visible.
 */
const MONTH_ONLY_DUE_DATES = [205, 206, 207, 208, 209]

/**
 * Three units the standardizer could not match to a master-list row. Their identity has
 * since been backfilled, but the registry keeps the fuller description it read from the
 * calibration certificate over the master list's shorter one.
 */
const CERTIFICATE_DESCRIPTIONS = [91, 92, 128]

/**
 * One instrument whose make the old file records as a single unsplit string. The
 * registry splits it into its two halves, which is a correction rather than a loss:
 * getSimpleValue hands a consumer the whole string otherwise, where it wants the
 * indicator's make.
 */
const SPLIT_COMPOSITES = [53]

/**
 * Instruments whose old SOP reference was not a reference.
 *
 * The master list's SOP REFERENCE column holds the words "AS A SOURCE" for these ten -
 * dry blocks, a surface plate, a current coil, a signal generator, a humidity chamber,
 * optical parallels. It says how the instrument is used, not under which procedure it
 * was calibrated, and the old list carried it through as though an engineer could cite
 * it on a certificate. The registry records no reference for them instead.
 */
const SOP_WAS_A_ROLE = [14, 35, 39, 103, 111, 205, 206, 207, 208, 209]

/**
 * The rows the old list crammed together, and what they became.
 *
 * Keyed by the id the old row kept, holding the ids the rest of its assets were
 * given. Both are weight sets - one serial number, several weights, one asset
 * tag each - which is why the old file had them on a single line and why the
 * registry should not.
 */
const SPLIT_APART: Record<number, number[]> = {
  190: [212], // "907,908 HTAIPL/L"     -> 907 stays 190, 908 becomes 212
  191: [210, 211], // "904,905,906 HTAIPL/L" -> 904 stays 191, 905 and 906 become 210 and 211
}
const SPLIT_OFF = Object.values(SPLIT_APART).flat()

describe('the projection reproduces the old list', () => {
  it('covers every instrument, and splits only the rows that held more than one', () => {
    // Every old row still resolves to a unit, so nothing was lost.
    for (const row of legacy) expect(byId.has(row.id as number)).toBe(true)

    // And the only units the old list does not account for are the ones it hid.
    const legacyIds = new Set(legacy.map((row) => row.id as number))
    const surplus = projected.map((p) => p.id).filter((id) => !legacyIds.has(id))
    expect(surplus.sort((a, b) => a - b)).toEqual([...SPLIT_OFF].sort((a, b) => a - b))

    expect(projected).toHaveLength(legacy.length + SPLIT_OFF.length)
    expect(byId.size).toBe(projected.length)
  })

  it('gives each asset in a run-together row a unit of its own', () => {
    for (const [keptId, alsoIds] of Object.entries(SPLIT_APART)) {
      const row = legacy.find((r) => r.id === Number(keptId)) as Record<string, unknown>
      const assets = String(row.asset_no).split(',').map((s) => s.trim())

      // One unit per asset number the old row listed, the first keeping its id.
      expect(alsoIds).toHaveLength(assets.length - 1)

      const units = [Number(keptId), ...alsoIds].map((id) => byId.get(id)!)
      expect(units.every(Boolean)).toBe(true)

      // The suffix is on the last of them only - "904,905,906 HTAIPL/L" is three
      // assets in one lab's numbering, not three unrelated strings.
      const suffix = assets[assets.length - 1].replace(/^\S+\s*/, '')
      const expected = assets.map((a) =>
        a.includes(' ') ? a : `${a} ${suffix}`,
      )
      expect(units.map((u) => String(u.asset_no))).toEqual(expected)

      // Same instrument, so the serial is shared - which is what made them one
      // row in the first place.
      const serials = new Set(units.map((u) => String(u.instrument_sl_no)))
      expect(serials.size).toBe(1)
    }
  })

  it.each([
    [
      'instrument_desc',
      sameText,
      CERTIFICATE_DESCRIPTIONS,
    ],
    // The two run-together rows are covered by their own test above; here they
    // are expected to differ, because the projection keeps only the first asset.
    [
      'asset_no',
      (a: unknown, b: unknown) => String(a).replace(/\s+/g, '') === String(b).replace(/\s+/g, ''),
      Object.keys(SPLIT_APART).map(Number),
    ],
    ['type', sameText],
    ['usage', sameText],
    ['calibrated_at', sameText],
    ['report_no', sameText],
    ['sop_references', same, SOP_WAS_A_ROLE],
  ])('matches %s', (field, compare, allowed = [] as number[]) => {
    const differing = differences(field as string, compare as (a: unknown, b: unknown) => boolean)
    expect(differing.map((r) => r.id)).toEqual(allowed)
  })

  it.each([
    ['make', SPLIT_COMPOSITES],
    ['model', []],
    ['instrument_sl_no', []],
  ])('matches %s, including the composite ind/sen split', (field, allowed) => {
    // Report the values, not just the id: a bare list of ids says nothing about
    // whether the registry is wrong or merely different.
    const differing = differences(field as string, sameComposite).map((row) => row.id)
    expect(differing).toEqual(allowed)
  })

  it('splits a composite the old file left joined', () => {
    // Instrument 53 records its make as one string, "Ind: Delta Ohm Sen: Emko", so
    // getSimpleValue hands a consumer the whole thing where it wants the indicator.
    // The registry splits it, which is the difference the case above allows for.
    const registryValue = byId.get(53)!.make
    expect(registryValue).toEqual({ ind: 'Delta Ohm', sen: 'Emko' })
    expect(getSimpleValue(registryValue)).toBe('Delta Ohm')
    const legacyValue = legacy.find((row) => row.id === 53)!.make as string
    expect(getSimpleValue(legacyValue)).toBe('Ind: Delta Ohm Sen: Emko')
  })

  it('leaves no separator on a split composite', () => {
    // "Ind: 5250062 & Sen: 25005083" split to an indicator of "5250062 &" - a serial
    // number with a stray ampersand does not match the instrument it identifies.
    const dirty = projected.filter((instrument) =>
      [instrument.make, instrument.model, instrument.instrument_sl_no].some(
        (value) =>
          value &&
          typeof value === 'object' &&
          Object.values(value).some((half) => typeof half === 'string' && /[&,;/]\s*$/.test(half)),
      ),
    )
    expect(dirty.map((d) => d.id)).toEqual([])
  })

  it('matches next_due_on once the date format is accounted for', () => {
    expect(differences('next_due_on', sameText).map((r) => r.id)).toEqual(
      MONTH_ONLY_DUE_DATES,
    )
  })

  it('reads a month-only due date as the first of that month', () => {
    for (const id of MONTH_ONLY_DUE_DATES) {
      // Conservative: due sooner rather than later, since the day is not recorded.
      expect(byId.get(id)!.next_due_on).toMatch(/^1\/1\/|^12\/1\//)
    }
  })

  it('formats dates without shifting them across a timezone', () => {
    // Date.parse on an ISO date gives UTC midnight, which renders as the day before
    // anywhere west of Greenwich - and a due date off by a day changes whether an
    // instrument reads as expired.
    expect(isoToLegacyDate('2026-01-30')).toBe('1/30/2026')
    expect(isoToLegacyDate('2026-11-21')).toBe('11/21/2026')
    expect(isoToLegacyDate('2026-01-01')).toBe('1/1/2026')
    expect(isoToLegacyDate(null)).toBe('')
    expect(isoToLegacyDate('not a date')).toBe('')
  })
})

describe('what the projection deliberately does not carry', () => {
  it('omits the fields the capability profile replaced', () => {
    const sample = projected[0] as unknown as Record<string, unknown>
    for (const field of LEGACY_ONLY_FIELDS) {
      expect(sample[field]).toBeUndefined()
    }
  })

  it('omits remarks, which nothing populates', () => {
    // 0 of 209 rows carry one, so projecting it would be inventing a field.
    expect(legacy.filter((row) => !blank(row.remarks))).toHaveLength(0)
  })

  it('has no more legacy-only fields than the migration has left', () => {
    // A ratchet: this list may shrink as consumers move to capability_profiles, and
    // must never grow. Growing means new code was written against the old model.
    expect(LEGACY_ONLY_FIELDS.length).toBeLessThanOrEqual(3)
  })
})
