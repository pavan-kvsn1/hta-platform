import { z } from 'zod'

/**
 * A least count as it arrives from a form, and as the column now holds it.
 *
 * The column is DECIMAL, so Prisma throws on anything that is not a quantity. That
 * throw reaches the engineer as a failed save with a database error in it, which says
 * nothing about which field was wrong. This turns the same refusal into a sentence
 * naming the problem, before the write is attempted.
 *
 * The form posts text, and three kinds of text mean "not recorded": nothing at all, a
 * blank box, and "NA", which is what was typed on five parameters before the box could
 * refuse it. All three become null, because null is what the column now uses to say the
 * same thing.
 */
export const leastCountInput = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((value, ctx) => {
    if (value === null || value === undefined) return null

    const text = String(value).trim()
    if (text === '' || text.toUpperCase() === 'NA') return null

    if (!/^[0-9]*\.?[0-9]+$/.test(text)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `"${text}" is not a least count. A least count is the size of one division - a single number such as 0.05, 0.025 or 5.`,
      })
      return z.NEVER
    }

    const parsed = Number(text)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `A least count is the size of one division, so it has to be greater than nought. "${text}" is not.`,
      })
      return z.NEVER
    }

    // Kept as the text that was typed rather than the parsed number: Prisma takes a
    // string for a Decimal column without going through a float on the way, and a float
    // is where 0.1 stops being exactly 0.1.
    return text
  })
