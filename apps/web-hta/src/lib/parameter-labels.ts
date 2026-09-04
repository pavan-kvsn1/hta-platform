/**
 * Naming a certificate's parameters so a reader can tell them apart.
 *
 * A certificate can calibrate the same parameter twice over different ranges -
 * certificate 5eed80c6 calibrates Temperature twice - so a bare list of names reads
 * "Temperature and Temperature" and identifies neither. The range is added only where
 * it is doing that work: on a certificate whose parameters have distinct names, adding
 * it to every one would be noise.
 */

export interface LabelledParameter {
  parameterName: string
  parameterUnit?: string
  rangeMin?: string
  rangeMax?: string
}

/** "A", "A and B", "A, B and C" - a bare join reads as canned. */
export function listOf(items: string[]): string {
  if (items.length < 3) return items.join(' and ')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/**
 * A name for each parameter, in the order given, unique within the certificate where
 * the range allows it.
 */
export function parameterLabels(parameters: LabelledParameter[]): string[] {
  const counts = new Map<string, number>()
  parameters.forEach((p) =>
    counts.set(p.parameterName, (counts.get(p.parameterName) ?? 0) + 1),
  )

  return parameters.map((p, i) => {
    const name = p.parameterName || `Parameter ${i + 1}`
    if (!p.parameterName || (counts.get(p.parameterName) ?? 0) < 2) return name
    return p.rangeMin && p.rangeMax
      ? `${name} (${p.rangeMin} to ${p.rangeMax}${p.parameterUnit ? ` ${p.parameterUnit}` : ''})`
      : name
  })
}

/** The label for one parameter, told apart from the others on the same certificate. */
export function parameterLabel(
  parameter: LabelledParameter,
  all: LabelledParameter[],
): string {
  const index = all.indexOf(parameter)
  const labels = parameterLabels(all)
  return index >= 0 ? labels[index] : parameter.parameterName
}
