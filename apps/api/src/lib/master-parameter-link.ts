/**
 * Which parameter a master entry was declared against.
 *
 * The link travels between client and server as a position, and every save deletes
 * and recreates the Parameter rows - so an entry saved before the link existed, or
 * one whose position went stale, arrives naming nothing. Left at null it stays null,
 * and the certificate quietly loses which of two thermometers was for which span.
 *
 * So a missing link is resolved the way the client resolves it: the Nth entry holding
 * an instrument takes the Nth parameter that names that instrument and no other entry
 * has claimed. One entry, one parameter, on both sides of the wire.
 */
export interface LinkableEntry {
  /** The wire carries this as a number, older payloads as a string. */
  masterInstrumentId?: string | number | null
  parameterIndex?: number | null
}

export interface LinkableParameter {
  masterInstrumentId?: string | number | null
}

/** Compared as text, since the two sides of the same id do not agree on its type. */
const sameMaster = (a: LinkableEntry['masterInstrumentId'], b: LinkableParameter['masterInstrumentId']) =>
  a !== undefined && a !== null && b !== undefined && b !== null && String(a) === String(b)

/**
 * The index into `parameters` for each entry in `entries`, or -1 where there is none.
 * Returned as one array so the claims of earlier entries are visible to later ones.
 */
export function resolveParameterIndexes(
  entries: LinkableEntry[],
  parameters: LinkableParameter[],
): number[] {
  const resolved = entries.map((entry) => {
    const named = entry.parameterIndex
    return named !== undefined && named !== null && named >= 0 && named < parameters.length
      ? named
      : -1
  })

  const claimed = new Set(resolved.filter((index) => index >= 0))

  entries.forEach((entry, position) => {
    if (resolved[position] >= 0) return
    if (entry.masterInstrumentId === undefined || entry.masterInstrumentId === null) return

    // Where this entry sits among the unlinked entries holding the same instrument.
    const rank = entries.filter(
      (other, i) =>
        i < position &&
        resolved[i] < 0 &&
        sameMaster(entry.masterInstrumentId, other.masterInstrumentId),
    ).length

    const free = parameters
      .map((param, index) => ({ param, index }))
      .filter(
        ({ param, index }) =>
          !claimed.has(index) && sameMaster(entry.masterInstrumentId, param.masterInstrumentId),
      )

    const match = free[rank]
    if (match) {
      resolved[position] = match.index
      claimed.add(match.index)
    }
  })

  return resolved
}
