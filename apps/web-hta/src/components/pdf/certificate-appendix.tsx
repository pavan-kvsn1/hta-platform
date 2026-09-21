/**
 * The certificate's appendix.
 *
 * Appendix A is the unit and the master instruments - photographs belonging to no
 * particular reading. Appendix B is one section per results table: the table's columns
 * stated once with their type and rule, then each photographed point with its own
 * figures and the photographs taken of it, so a reader goes photograph → reading →
 * arithmetic → error without turning a page.
 *
 * Nothing is decided here. What to print is worked out by buildAppendixData, which is
 * pure and tested; this draws it. Photographs arrive already resolved to data URLs,
 * because react-pdf renders synchronously in Node and in the browser and can await
 * nothing.
 */
import React from 'react'
import { Image, StyleSheet, Text, View } from '@react-pdf/renderer'

import type { AppendixData, AppendixPhoto, AppendixTable } from '@/lib/certificate/appendix-data'

import { HAIRLINE, INK, SLATE } from './brand'

const CONTENT_W = 515
const PHOTO_W = 245
const PHOTO_H = 155
const GUTTER = CONTENT_W - PHOTO_W * 2 // 25pt, so a pair sits flush to both margins

/** Column, Type, Unit, How it is worked out. */
const DEF_COLS = [140, 70, 40, CONTENT_W - 140 - 70 - 40]
/** Column, This point. */
const VAL_COLS = [140, CONTENT_W - 140]

const styles = StyleSheet.create({
  section: { marginTop: 8 },

  /** The band the certificate already uses for its own sections. */
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 0.5,
    borderBottomColor: '#000',
    backgroundColor: '#EEF2F7',
    minHeight: 16,
    marginBottom: 8,
  },
  bannerCell: { width: '100%', paddingTop: 5, paddingBottom: 1, paddingHorizontal: 3, justifyContent: 'center' },
  bannerText: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', letterSpacing: 0.3, color: INK },

  headingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 8 },
  heading: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', letterSpacing: 0.4, color: INK },
  headingAside: { fontSize: 7, color: SLATE },
  coverage: { fontSize: 7, color: SLATE, marginTop: 2, marginBottom: 6 },

  table: { borderWidth: 1, borderColor: '#000', marginBottom: 8 },
  headRow: { flexDirection: 'row', backgroundColor: '#EEF2F7', borderBottomWidth: 0.5, borderBottomColor: '#000' },
  row: { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: '#000' },
  rowFirst: { flexDirection: 'row' },
  cell: { paddingVertical: 3.5, paddingHorizontal: 5, borderRightWidth: 0.5, borderRightColor: '#000' },
  cellLast: { paddingVertical: 3.5, paddingHorizontal: 5 },
  headText: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: INK },
  cellText: { fontSize: 7.5, color: INK },

  pointRule: { height: 0.5, backgroundColor: HAIRLINE, marginTop: 6 },
  pointLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: INK, marginTop: 5, marginBottom: 4 },

  photoRow: { flexDirection: 'row', marginTop: 4, marginBottom: 8 },
  photoCell: { width: PHOTO_W },
  photoGap: { width: GUTTER },
  photoFrame: {
    width: PHOTO_W,
    height: PHOTO_H,
    borderWidth: 0.5,
    borderColor: HAIRLINE,
    // The photograph keeps its own shape inside the box rather than being cropped: a
    // portrait shot of a nameplate loses its top otherwise.
    objectFit: 'contain',
  },
  photoAbsent: {
    width: PHOTO_W,
    height: PHOTO_H,
    borderWidth: 0.5,
    borderColor: HAIRLINE,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  photoAbsentText: { fontSize: 7, color: SLATE, textAlign: 'center' },
  caption: { fontSize: 7, color: INK, marginTop: 3 },
  captionFile: { fontSize: 6, color: SLATE, marginTop: 1 },

  note: { fontSize: 7, color: SLATE, marginTop: 6, fontStyle: 'italic' },
})

// ---------------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------------

function Banner({ children }: { children: string }) {
  return (
    <View style={styles.bannerRow}>
      <View style={styles.bannerCell}>
        <Text style={styles.bannerText}>{children}</Text>
      </View>
    </View>
  )
}

function Table({ widths, head, rows }: { widths: number[]; head: string[]; rows: string[][] }) {
  return (
    <View style={styles.table}>
      <View style={styles.headRow}>
        {head.map((label, i) => (
          <View key={label} style={[i === head.length - 1 ? styles.cellLast : styles.cell, { width: widths[i] }]}>
            <Text style={styles.headText}>{label}</Text>
          </View>
        ))}
      </View>
      {rows.map((cells, r) => (
        <View key={r} style={r === 0 ? styles.rowFirst : styles.row}>
          {cells.map((cell, i) => (
            <View key={i} style={[i === cells.length - 1 ? styles.cellLast : styles.cell, { width: widths[i] }]}>
              <Text style={styles.cellText}>{cell}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  )
}

function Photo({ photo, figure, label }: { photo: AppendixPhoto; figure: number; label: string }) {
  return (
    <View style={styles.photoCell}>
      {photo.dataUrl ? (
        <Image style={styles.photoFrame} src={photo.dataUrl} />
      ) : (
        /* Said out loud rather than skipped. A figure number with nothing against it
           reads as a printing fault; this reads as what happened. */
        <View style={styles.photoAbsent}>
          <Text style={styles.photoAbsentText}>This photograph could not be loaded.</Text>
        </View>
      )}
      <Text style={styles.caption}>
        Fig. {figure} — {label}
      </Text>
      <Text style={styles.captionFile}>{photo.fileName}</Text>
    </View>
  )
}

function Absent({ what }: { what: string }) {
  return (
    <View style={styles.photoCell}>
      <View style={styles.photoAbsent}>
        <Text style={styles.photoAbsentText}>No photograph of the {what} was taken at this point.</Text>
      </View>
    </View>
  )
}

/** Photographs two to a row, which is what 245pt inside 515pt of content means. */
function PhotoPairs({
  photos,
  figures,
  labelOf,
}: {
  photos: AppendixPhoto[]
  figures: Record<string, number>
  labelOf: (photo: AppendixPhoto) => string
}) {
  const pairs: AppendixPhoto[][] = []
  for (let i = 0; i < photos.length; i += 2) pairs.push(photos.slice(i, i + 2))

  return (
    <>
      {pairs.map((pair, i) => (
        <View key={i} style={styles.photoRow} wrap={false}>
          <Photo photo={pair[0]} figure={figures[pair[0].id] ?? 0} label={labelOf(pair[0])} />
          {pair[1] ? (
            <>
              <View style={styles.photoGap} />
              <Photo photo={pair[1]} figure={figures[pair[1].id] ?? 0} label={labelOf(pair[1])} />
            </>
          ) : null}
        </View>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------------
// Appendix B, one section per results table
// ---------------------------------------------------------------------------------

function ReadingsTable({ table, figures }: { table: AppendixTable; figures: Record<string, number> }) {
  return (
    <View>
      <View style={styles.headingRow}>
        <Text style={styles.heading}>{table.heading}</Text>
        {table.position ? <Text style={styles.headingAside}>{table.position}</Text> : null}
      </View>
      <Text style={styles.coverage}>{table.coverage}</Text>

      <Table
        widths={DEF_COLS}
        head={['Column', 'Type', 'Unit', 'How it is worked out']}
        rows={table.columns.map((c) => [c.name, c.kind, c.unit, c.rule])}
      />

      {table.points.map((point) => (
        /* A point and its photographs stay together: the figures are the reason the
           photographs are worth looking at. */
        <View key={point.pointNumber} wrap={false}>
          <View style={styles.pointRule} />
          <Text style={styles.pointLabel}>Point {point.pointNumber}</Text>
          <Table
            widths={VAL_COLS}
            head={['Column', 'This point']}
            rows={point.values.map((v) => [v.name, v.value])}
          />
          <View style={styles.photoRow}>
            {point.masterPhoto ? (
              <Photo
                photo={point.masterPhoto}
                figure={figures[point.masterPhoto.id] ?? 0}
                label="Master instrument"
              />
            ) : (
              <Absent what="master instrument" />
            )}
            <View style={styles.photoGap} />
            {point.uucPhoto ? (
              <Photo
                photo={point.uucPhoto}
                figure={figures[point.uucPhoto.id] ?? 0}
                label="Unit under calibration"
              />
            ) : (
              <Absent what="unit" />
            )}
          </View>
        </View>
      ))}
    </View>
  )
}

// ---------------------------------------------------------------------------------
// The appendix
// ---------------------------------------------------------------------------------

export function CertificateAppendix({ appendix }: { appendix: AppendixData }) {
  const { unitPhotos, masterPhotos, masters, tables, strandedCount, figures } = appendix

  const hasA = unitPhotos.length > 0 || masterPhotos.length > 0
  const hasB = tables.length > 0
  if (!hasA && !hasB) return null

  return (
    <>
      {hasA && (
        <View style={styles.section} break>
          <Banner>APPENDIX A : UNIT AND MASTER INSTRUMENTS</Banner>

          {unitPhotos.length > 0 && (
            <>
              <View style={styles.headingRow}>
                <Text style={styles.heading}>A.1   UNIT UNDER CALIBRATION</Text>
              </View>
              <View style={{ marginTop: 4 }}>
                <PhotoPairs photos={unitPhotos} figures={figures} labelOf={() => 'Unit under calibration'} />
              </View>
            </>
          )}

          {masterPhotos.length > 0 && (
            <>
              <View style={styles.headingRow}>
                <Text style={styles.heading}>A.2   MASTER INSTRUMENTS</Text>
              </View>
              <View style={{ marginTop: 4 }}>
                {/* Which instrument, not just that it is one: a certificate can carry
                    several, and the photograph is there to identify this one. */}
                <PhotoPairs
                  photos={masterPhotos}
                  figures={figures}
                  labelOf={(p) => masters[p.masterInstrumentIndex ?? 0]?.label ?? 'Master instrument'}
                />
              </View>
            </>
          )}
        </View>
      )}

      {hasB && (
        <View style={styles.section} break>
          <Banner>APPENDIX B : READINGS</Banner>
          {tables.map((table, i) => (
            <ReadingsTable key={i} table={table} figures={figures} />
          ))}
          {strandedCount > 0 && (
            /* Not hidden. A reader counting figures should be able to see that
               photographs exist which no longer belong to any reading. */
            <Text style={styles.note}>
              {strandedCount} photograph{strandedCount === 1 ? '' : 's'} on file no longer
              correspond{strandedCount === 1 ? 's' : ''} to a reading on this certificate and{' '}
              {strandedCount === 1 ? 'is' : 'are'} not shown.
            </Text>
          )}
        </View>
      )}
    </>
  )
}

export default CertificateAppendix
