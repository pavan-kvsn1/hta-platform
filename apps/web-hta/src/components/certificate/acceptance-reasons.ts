/**
 * Why a master the app could not vouch for was used anyway, found wherever it is kept.
 *
 * The engineer writes this when a master's accuracy ratio falls below the lab's
 * threshold, or when there is nothing to rate the master by at all - a class accuracy,
 * or a band with no figures recorded. It is the one thing on a certificate that is a
 * judgement rather than a measurement, and it is written for the reviewer.
 *
 * It lives in two places for a reason that is only historical. It used to sit on the
 * parameter, because a parameter had one master and so one set of answers about it. A
 * parameter can have several now, so it belongs to the pairing and is written on the
 * join row. Certificates written before that carry it on the parameter, and there is
 * no migration that could move them: the parameter's single field cannot say which of
 * two masters it was about.
 *
 * So both are read, the pairing first.
 */

interface WithReason {
  id: string
  parameterId?: string | null
  masterInstrumentId?: string | number | null
  masterAcceptanceReason?: string | null
  parameterName?: string | null
}

interface ParameterWithReason {
  id?: string | null
  parameterName?: string | null
  masterInstrumentId?: string | number | null
  masterAcceptanceReason?: string | null
}

const clean = (value: string | null | undefined) => {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? null : trimmed
}

/**
 * Fill in each master's acceptance reason, and the parameter it was written about.
 *
 * Matched on the parameter the entry names; failing that, on the instrument, which is
 * how entries written before they named a parameter still resolve. An entry that
 * matches nothing is returned as it came - an empty reason shows nothing at all, which
 * is the right answer for the masters that never needed one.
 */
export function withAcceptanceReasons<T extends WithReason>(
  masterInstruments: T[],
  parameters: ParameterWithReason[] = [],
): T[] {
  return masterInstruments.map((entry) => {
    const byParameter = entry.parameterId
      ? parameters.find((p) => p.id === entry.parameterId)
      : undefined
    const byInstrument =
      !byParameter && entry.masterInstrumentId != null
        ? parameters.find(
            (p) =>
              p.masterInstrumentId != null &&
              String(p.masterInstrumentId) === String(entry.masterInstrumentId),
          )
        : undefined
    const served = byParameter ?? byInstrument

    return {
      ...entry,
      masterAcceptanceReason:
        clean(entry.masterAcceptanceReason) ?? clean(served?.masterAcceptanceReason),
      parameterName: entry.parameterName ?? served?.parameterName ?? null,
    }
  })
}
