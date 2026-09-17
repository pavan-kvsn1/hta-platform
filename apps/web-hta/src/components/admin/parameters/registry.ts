/**
 * The register, as the page reads it.
 *
 * Two layers sit behind every row and the page has to keep them apart, because
 * a change to one is invisible to other labs and a change to the other is not.
 * This lab owns the name it uses, the units it offers, which one is picked
 * first, and whether the parameter appears at all. Everything else - the group,
 * what it measures, which variant, the older names it still answers to - is the
 * shared standard that every lab reads.
 */

/** One parameter, as GET /api/calibration-parameters hands it back. */
export interface Parameter {
  id: string
  /** The registry's name. Capabilities and certificates match on this. */
  standardName: string
  /** What this lab calls it. Defaults to the standard name. */
  customName: string
  category: string
  /** The physical quantity. Two parameters pair up only when this is identical. */
  measures: string
  /** Which sort of that quantity; "any" where it does not split. */
  kind: string
  /** What a form should offer: this lab's list where it set one, else the standard's. */
  units: string[]
  defaultUnit: string | null
  subtypes: string[]
  aliases: string[]
  source: string
  active: boolean

  /** The standard's own list, regardless of what this lab narrowed it to. */
  standardUnits: string[]
  standardDefaultUnit: string | null
  /** True where this lab has a list of its own rather than the standard's. */
  ownUnits: boolean

  /** Only present with ?withUsage=true. */
  instruments?: number
  unitUses?: Record<string, number>
}

/** What the editor holds while it is open. Null units means "the standard's". */
export interface Draft {
  customName: string
  units: string[] | null
  defaultUnit: string | null
  active: boolean
  /* the shared half */
  category: string
  measures: string
  kind: string
  anyKind: boolean
  subtypes: string[]
  aliases: string[]
}

export interface NewParameter {
  standardName: string
  category: string
  measures: string
  kind: string
  anyKind: boolean
  units: string[]
  defaultUnit: string | null
  subtypes: string[]
  aliases: string[]
}

export const blankNew = (): NewParameter => ({
  standardName: '',
  category: '',
  measures: '',
  kind: '',
  anyKind: true,
  units: [],
  defaultUnit: null,
  subtypes: [],
  aliases: [],
})

export const draftOf = (p: Parameter): Draft => ({
  customName: p.customName,
  units: p.ownUnits ? p.units : null,
  defaultUnit: p.ownUnits ? p.defaultUnit : null,
  active: p.active,
  category: p.category,
  measures: p.measures,
  kind: p.kind === 'any' ? '' : p.kind,
  anyKind: p.kind === 'any',
  subtypes: [...p.subtypes],
  aliases: [...p.aliases],
})

export const renamed = (p: Parameter) => p.customName !== p.standardName
export const unitsOf = (p: Parameter, d: Draft) => d.units ?? p.standardUnits
export const defaultOf = (p: Parameter, d: Draft) => d.defaultUnit ?? p.standardDefaultUnit
export const usesOf = (p: Parameter, unit: string) => p.unitUses?.[unit] ?? 0

/** The words already in the register, so a new row joins them rather than a synonym. */
export const groupsIn = (list: Parameter[]) =>
  [...new Set(list.map((p) => p.category))].sort((a, b) => a.localeCompare(b))
export const quantitiesIn = (list: Parameter[]) =>
  [...new Set(list.map((p) => p.measures))].sort()
export const variantsIn = (list: Parameter[]) =>
  [...new Set(list.map((p) => p.kind).filter((k) => k !== 'any'))].sort()

/** Whitespace and case are not what makes two units different. */
export const flat = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '')

/** Which half of the row a draft has touched; they save to different places. */
export function changedIn(p: Parameter, d: Draft) {
  const mine =
    d.customName !== p.customName ||
    d.active !== p.active ||
    JSON.stringify(d.units) !== JSON.stringify(p.ownUnits ? p.units : null) ||
    d.defaultUnit !== (p.ownUnits ? p.defaultUnit : null)

  const shared =
    d.category !== p.category ||
    d.measures.trim().toLowerCase() !== p.measures ||
    (d.anyKind ? 'any' : d.kind.trim().toLowerCase()) !== p.kind ||
    JSON.stringify(d.aliases) !== JSON.stringify(p.aliases) ||
    JSON.stringify(d.subtypes) !== JSON.stringify(p.subtypes)

  return { mine, shared, any: mine || shared }
}

/** Whether an edit moves what this parameter can be served by. */
export const pairingMoved = (p: Parameter, d: Draft) =>
  d.measures.trim().toLowerCase() !== p.measures ||
  (d.anyKind ? 'any' : d.kind.trim().toLowerCase()) !== p.kind
