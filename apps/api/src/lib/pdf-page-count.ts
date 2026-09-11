/**
 * How many pages a PDF has, read straight from its bytes.
 *
 * The certificate viewer needs it to say "2 of 4". Pulling in a full PDF library to
 * learn one number would be a heavy dependency for the job, and the number is written
 * in the file in two places that are easy to read.
 *
 * Preferred: the page tree root carries `/Type /Pages` and `/Count n`, where n is the
 * total. Nested page tree nodes carry their own smaller counts, so the largest wins.
 *
 * Fallback: count the `/Type /Page` objects. This is what most naive counters do alone,
 * and it is the less reliable of the two - a file whose objects live inside compressed
 * object streams hides them - so it is only used when no `/Count` was found.
 *
 * Returns null rather than a guess when neither works. A viewer that says "page 2" is
 * honest; one that says "2 of 1" is not.
 */

/** Strip the compressed streams, so bytes inside them cannot look like page objects. */
function withoutStreams(text: string): string {
  return text.replace(/stream[\r\n]+[\s\S]*?endstream/g, 'stream endstream')
}

export function pdfPageCount(buffer: Buffer): number | null {
  // latin1 keeps one byte as one character, so offsets and matches stay honest on the
  // binary sections. utf8 would replace invalid sequences and shift everything.
  const raw = buffer.toString('latin1')
  if (!raw.startsWith('%PDF-')) return null

  const text = withoutStreams(raw)

  let best = 0
  // /Type /Pages ... /Count 4   - the two can appear in either order in the dictionary.
  const dicts = text.match(/<<[^<>]*\/Type\s*\/Pages[^<>]*>>/g) ?? []
  for (const d of dicts) {
    const m = /\/Count\s+(\d+)/.exec(d)
    if (m) best = Math.max(best, Number(m[1]))
  }
  if (best > 0) return best

  // Fall back to counting the page objects themselves. The negative lookahead keeps
  // /Pages from being counted as a /Page.
  const pages = text.match(/\/Type\s*\/Page(?![sA-Za-z])/g)
  if (pages && pages.length > 0) return pages.length

  return null
}
