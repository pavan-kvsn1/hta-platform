/**
 * Which parameter a master entry on a certificate was declared for.
 *
 * A parameter names an instrument, and one instrument can be the master for two
 * parameters - the same thermometer used over two temperature spans appears on the
 * certificate twice. Asking "which parameter names this instrument" then answers with
 * both, and each entry claims the other's.
 *
 * So an entry records its parameter. That link cannot be leaned on alone: the API
 * rewrites the parameter rows on every save, so their ids change and the link travels
 * as a position - and any save that fails to carry it back leaves the entry with
 * nothing. It has already happened.
 *
 * Hence the fallback, which is deterministic rather than approximate: among the entries
 * holding the same instrument, the first takes the first parameter naming it, the second
 * the second. Order is the only thing both sides can agree on without an id, and it
 * gives every entry exactly one parameter instead of all of them.
 */

export interface LinkableEntry {
  masterInstrumentId: number
  parameterId?: string
}

export interface LinkableParameter {
  id: string
  masterInstrumentId: number | null
}

export function parameterIdFor<E extends LinkableEntry, P extends LinkableParameter>(
  entry: E,
  entries: E[],
  parameters: P[],
): string | null {
  if (entry.parameterId && parameters.some((p) => p.id === entry.parameterId)) {
    return entry.parameterId
  }

  const sameInstrument = entries.filter(
    (e) => e.masterInstrumentId === entry.masterInstrumentId,
  )
  const position = sameInstrument.indexOf(entry)
  if (position < 0) return null

  // Parameters already spoken for by an entry that named one outright are not on
  // offer: an entry with a link keeps it, and the rest divide what is left in order.
  const claimed = new Set(
    entries
      .filter((e) => e !== entry && e.parameterId)
      .map((e) => e.parameterId as string),
  )
  const unclaimed = parameters.filter(
    (p) => p.masterInstrumentId === entry.masterInstrumentId && !claimed.has(p.id),
  )

  // Position among the entries without a link of their own, so the two counts line up.
  const rank = sameInstrument.filter((e) => !e.parameterId).indexOf(entry)
  return unclaimed[rank >= 0 ? rank : position]?.id ?? null
}
