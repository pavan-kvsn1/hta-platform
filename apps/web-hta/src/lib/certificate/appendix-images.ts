/**
 * Fetching the photographs the appendix prints, and inlining them.
 *
 * react-pdf renders synchronously, so nothing inside the document can await an image.
 * Everything is pulled and turned into a data URL first, here, and handed to the
 * component already resolved.
 *
 * The print variant is asked for rather than the viewing one. That copy is 1000px at
 * quality 80 - about 90KB against 500 - because the appendix draws each photograph in a
 * 245x155pt box and the 2000px copy is four times more image than that box can show. A
 * certificate carrying 30 photographs is the difference between roughly 3MB and 15MB.
 * The route falls back on its own when a print copy has not been made yet, so an
 * unprocessed photograph still prints, just heavier.
 */
import { apiFetch } from '@/lib/api-client'
import { parameterIdFor } from '@/lib/master-entry/parameter-link'

import {
  buildAppendixData,
  type AppendixData,
  type AppendixImageType,
  type AppendixParameter,
  type AppendixPhoto,
} from './appendix-data'

/** As the images route returns them. */
interface ListedImage {
  id: string
  imageType: AppendixImageType
  parameterIndex: number | null
  pointNumber: number | null
  masterInstrumentIndex: number | null
  fileName: string
}

/** What this needs off a parameter, which is a subset of the form's shape. */
interface FormParameter {
  id: string
  masterInstrumentId: number | null
  [key: string]: unknown
}

interface FormMaster {
  masterInstrumentId: number
  parameterId?: string
  masterLeastCount?: string
  [key: string]: unknown
}

/**
 * How many photographs to pull at once.
 *
 * Six rather than all of them: a certificate can carry thirty, each a round trip to
 * object storage through the API, and thirty at once buys nothing over a browser's own
 * connection limit while making a slow network look like a hung page.
 */
const CONCURRENCY = 6

async function inline(certificateId: string, image: ListedImage): Promise<string> {
  try {
    const res = await apiFetch(
      `/api/certificates/${certificateId}/images/${image.id}/file?variant=print`,
    )
    if (!res.ok) return ''
    const blob = await res.blob()
    return await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '')
      // A photograph that will not read is not a reason to lose the certificate; the
      // appendix prints a box saying so and keeps its figure number.
      reader.onerror = () => resolve('')
      reader.readAsDataURL(blob)
    })
  } catch {
    return ''
  }
}

/** Pull in small batches, keeping the listed order so figure numbers stay stable. */
async function inlineAll(certificateId: string, images: ListedImage[]): Promise<AppendixPhoto[]> {
  const out: AppendixPhoto[] = []
  for (let i = 0; i < images.length; i += CONCURRENCY) {
    const batch = images.slice(i, i + CONCURRENCY)
    const urls = await Promise.all(batch.map((image) => inline(certificateId, image)))
    batch.forEach((image, j) => {
      out.push({
        id: image.id,
        imageType: image.imageType,
        parameterIndex: image.parameterIndex,
        pointNumber: image.pointNumber,
        masterInstrumentIndex: image.masterInstrumentIndex,
        fileName: image.fileName,
        dataUrl: urls[j],
      })
    })
  }
  return out
}

/**
 * The appendix for a certificate, or null when there is nothing to print.
 *
 * Never throws. A certificate that cannot reach its photographs is still a certificate,
 * and losing the whole document because the appendix could not be built would be a poor
 * trade - so a failure here means the certificate prints as it did before.
 */
export async function loadAppendix(
  certificateId: string | null | undefined,
  parameters: FormParameter[],
  masterInstruments: FormMaster[],
): Promise<AppendixData | null> {
  if (!certificateId) return null

  try {
    const res = await apiFetch(`/api/certificates/${certificateId}/images`)
    if (!res.ok) return null
    const body = (await res.json()) as { images?: ListedImage[] }
    const images = body.images ?? []
    if (images.length === 0) return null

    const photos = await inlineAll(certificateId, images)

    /**
     * The master's least count, put on the parameter it was used for, so that
     * parameter's master columns round to the resolution the master actually reads to
     * rather than the unit's. parameterIdFor is the same link the rest of the
     * certificate uses, fallback and all.
     */
    const leastCountByParameter = new Map<string, string>()
    for (const entry of masterInstruments) {
      const parameterId = parameterIdFor(entry, masterInstruments, parameters)
      if (parameterId && entry.masterLeastCount) {
        leastCountByParameter.set(parameterId, entry.masterLeastCount)
      }
    }

    const appendixParameters: AppendixParameter[] = parameters.map((param) => ({
      ...(param as unknown as AppendixParameter),
      masterLeastCount: leastCountByParameter.get(param.id) ?? null,
    }))

    const appendix = buildAppendixData(appendixParameters, photos)

    /**
     * One line saying what the appendix came to.
     *
     * The appendix is absent whenever anything here fails, because a certificate is
     * worth more than its appendix - which means a missing appendix and a certificate
     * with no photographs look identical from the outside. This is the difference,
     * and it sits beside the passes pdf-two-pass already logs.
     */
    console.info(
      '[Appendix] %d photographs, %d loaded, %d tables, %d points, %d stranded',
      photos.length,
      photos.filter((p) => p.dataUrl).length,
      appendix.tables.length,
      appendix.tables.reduce((n, t) => n + t.points.length, 0),
      appendix.strandedCount,
    )

    return appendix
  } catch {
    return null
  }
}
