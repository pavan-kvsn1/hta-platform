'use client'

/**
 * The certificate, in the page.
 *
 * Opening a PDF in a new tab loses the instrument it belongs to, and the
 * certificate is read alongside the capability it covers rather than on its
 * own. The pager says "2 of 4" because the page count is stored: without it
 * the viewer could only say "page 2" and never how many there are.
 */

import { useState } from 'react'
import { Icon } from '../Icons'

export default function CertificateViewer({
  src,
  error,
  fileName,
  pageCount,
  isActive,
  backTo,
  onDownload,
  onClose,
}: {
  /** Null while the signed URL is being fetched. */
  src: string | null
  error: string | null
  fileName: string
  pageCount: number | null
  isActive: boolean
  backTo: string
  onDownload: () => void
  onClose: () => void
}) {
  const [page, setPage] = useState(1)
  const pages = pageCount ?? 1

  return (
    <div className="card viewer">
      <div className="vbar">
        <button type="button" className="link" onClick={onClose}>
          <Icon.left /> Back to {backTo}
        </button>
        <span className={'pill ' + (isActive ? 'good' : 'crit')}>{isActive ? 'ACTIVE' : 'ARCHIVED'}</span>
        <span className="nm">{fileName}</span>

        {pageCount ? (
          <span className="pager">
            <button
              type="button"
              className="iconbtn"
              aria-label="Previous page"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <Icon.left />
            </button>
            <span>
              {page} of {pages}
            </span>
            <button
              type="button"
              className="iconbtn"
              aria-label="Next page"
              disabled={page >= pages}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
            >
              <Icon.right />
            </button>
          </span>
        ) : null}

        <button type="button" className="link" onClick={onDownload}>
          Download
        </button>
        <button type="button" className="iconbtn" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>

      {/* `doc` swaps the pane from centring a message to letting the document fill it. */}
      <div className={'page' + (src && !error ? ' doc' : '')}>
        {error ? (
          <p className="paneempty" style={{ padding: 24 }}>
            {error}
          </p>
        ) : src ? (
          /* The page number goes to the viewer rather than being rendered here: the
             browser's own PDF viewer knows how to show a page and we do not. */
          <iframe key={page} src={`${src}#page=${page}&toolbar=1&navpanes=0`} title={fileName} />
        ) : (
          <p className="paneempty" style={{ padding: 24 }}>
            Opening {fileName}…
          </p>
        )}
      </div>
    </div>
  )
}
