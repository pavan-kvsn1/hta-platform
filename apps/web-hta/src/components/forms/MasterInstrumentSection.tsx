'use client'

// Section 03 - the master instruments a certificate was calibrated against.
//
// A master is added through a flow that asks what it is *for* before asking which one
// it is: the certificate's parameters come first, and only then the instrument list,
// which can then say "4.0 : 1" or "Range Exceeds" for the parameter in hand rather
// than listing every asset in the lab. Nothing is written to the certificate until the
// flow is committed, so an abandoned choice leaves nothing behind.
//
// A committed master shows as a card: what it is, which parameters it serves, and the
// declaration that says how it was used. The cascade that used to sit on every card
// belongs to the flow now - a card is a record, not a picker.

import { useEffect, useState, useMemo, useCallback } from 'react'
import { Plus, Trash2, CheckCircle, AlertTriangle, XCircle, ChevronRight, Clock, Wrench, Camera } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FormSection } from './FormSection'
import { ParameterCoverage } from '@/components/forms/ParameterCoverage'
import { useCertificateStore, SelectedMasterInstrument, Parameter } from '@/lib/stores/certificate-store'
import { ImageUploadGallery, GalleryImage } from './ImageUploadGallery'
import { useCertificateImages } from '@/lib/hooks/useCertificateImages'
import { useMasterInstrumentStore } from '@/lib/stores/master-instrument-store'
import { parameterIdFor } from '@/lib/master-entry/parameter-link'
import {
  InstrumentStatus,
  getDisplayValue,
  STATUS_CONFIG,
} from '@/lib/master/instruments'
import {
  DEFAULT_ACCURACY_RATIO,
  clipRequired,
  evaluateSuitability,
  requiredRanges,
  unitCanMeasure,
  unitCoversRange,
} from '@/lib/master/capability'
import type { RegistryUnit } from '@/lib/master/registry'
import { parameterLabel } from '@/lib/parameters/labels'
import { useParameterStore } from '@/lib/stores/parameter-store'
import { classificationOf } from '@/lib/parameters/mapping'
import { MasterCapabilityComparison } from '@/components/forms/MasterCapabilityComparison'
import { MasterCapabilityDeclaration } from '@/components/forms/MasterCapabilityDeclaration'
import {
  MasterAddFlow,
  sopReferencesFor,
  type FlowResult,
  type FlowSeed,
} from '@/components/forms/MasterAddFlow'
import { cn } from '@/lib/utils'

interface MasterInstrumentCardProps {
  instrument: SelectedMasterInstrument
  index: number
  onRemove: () => void
  /** Reopen the whole selection for this master - the instrument as well as how it
   *  was used, since the instrument is as much a part of the answer. */
  onEdit: () => void
  parameters: Parameter[]
  /** Every master entry on the certificate, so this one can tell which is its own. */
  siblings: SelectedMasterInstrument[]
  /** Master ids on this certificate, to tell a real assignment from a dangling one. */
  mastersOnCertificate: Set<number>
  onParameterUpdate: (paramIndex: number, parameter: Parameter) => void
  certificateId: string | null
  images: GalleryImage[]
  onImageUpload: (file: File) => Promise<void>
  onImageDelete: (imageId: string) => Promise<void>
  disabled?: boolean
}

function StatusBadge({ status, daysUntilExpiry }: { status: InstrumentStatus; daysUntilExpiry?: number }) {
  const config = STATUS_CONFIG[status]

  const getIcon = () => {
    switch (status) {
      case 'VALID':
        return <CheckCircle className="size-4" />
      case 'EXPIRING_SOON':
        return <Clock className="size-4" />
      case 'EXPIRED':
        return <XCircle className="size-4" />
      case 'UNDER_RECAL':
        return <Wrench className="size-4" />
      case 'SERVICE_PENDING':
        return <AlertTriangle className="size-4" />
    }
  }

  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider',
      config.color,
      config.bgColor
    )}>
      {getIcon()}
      {config.label}
      {status === 'EXPIRING_SOON' && daysUntilExpiry !== undefined && (
        <span>({daysUntilExpiry}d)</span>
      )}
    </span>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold text-slate-500 uppercase leading-4">{label}</p>
      <p className="font-semibold text-slate-800 leading-5 break-words">{value || '—'}</p>
    </div>
  )
}

// Exported for tests: the editing behaviour below is worth pinning on its own.
/**
 * One master, as a line.
 *
 * A settled master is not being worked on, and a card several hundred pixels tall for
 * each of them buried the one being worked on among the ones that were finished. The
 * line carries what is scanned - which instrument, how it was used, what it came to,
 * and whether its own calibration is running out - and everything else opens on it.
 */
function MasterRow({
  instrument,
  parameter,
  unit,
  threshold,
  open,
  onToggle,
  children,
}: {
  instrument: SelectedMasterInstrument
  parameter?: Parameter
  unit?: RegistryUnit
  threshold: number
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  const { instruments } = useMasterInstrumentStore()
  const listed = instruments.find((i) => i.id === instrument.masterInstrumentId) ?? null

  /** How it was used, in the words the declaration asked for. */
  /**
   * The declaration sits on the entry for masters chosen since a parameter could hold
   * several, and on the parameter for everything written before. Reading one of the
   * two leaves the row blank on half the certificates in the lab.
   */
  const profileId = instrument.masterProfileId ?? parameter?.masterProfileId
  const subtype = instrument.masterSubtype ?? parameter?.masterSubtype
  const profile = profileId
    ? (unit?.capability_profiles ?? []).find((c) => c.id === profileId)
    : undefined
  const usedAs = [profile?.component, profile?.role, subtype].filter(Boolean).join(' · ')

  /** The verdict, where there is one to give. */
  const ratio =
    parameter && unit && profile
      ? (evaluateSuitability(profile, clipRequired(
          requiredRanges(parameter),
          instrument.rangeFrom == null || instrument.rangeFrom === '' ? null : Number(instrument.rangeFrom),
          instrument.rangeTo == null || instrument.rangeTo === '' ? null : Number(instrument.rangeTo),
        ), { subtypeId: subtype ?? null }).worstRatio ?? null)
      : null

  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors"
      >
        <ChevronRight
          className={cn('size-3.5 shrink-0 text-slate-400 transition-transform', open && 'rotate-90')}
        />
        <span className="text-xs font-semibold text-slate-800 shrink-0 w-32 truncate">
          {instrument.assetNo || `#${instrument.masterInstrumentId}`}
        </span>
        <span className="text-xs text-slate-500 flex-1 min-w-0 truncate">
          {instrument.description || listed?.instrument_desc || ''}
        </span>
        {usedAs && (
          <span className="text-[11px] text-slate-400 shrink-0 capitalize hidden md:inline">
            {usedAs}
          </span>
        )}
        {ratio !== null && (
          <span
            className={cn(
              'shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold',
              ratio >= threshold
                ? 'bg-green-100 text-green-700'
                : ratio >= 1
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-red-100 text-red-700',
            )}
          >
            {ratio.toFixed(1)} : 1
          </span>
        )}
        {listed?.status === 'EXPIRING_SOON' && (
          <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
            <Clock className="size-2.5" />
            {listed.daysUntilExpiry}d
          </span>
        )}
        {listed?.status === 'EXPIRED' && (
          <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
            Expired
          </span>
        )}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}

export function MasterInstrumentCard({
  instrument,
  index,
  onRemove,
  onEdit,
  parameters,
  siblings,
  mastersOnCertificate,
  onParameterUpdate,
  certificateId,
  images,
  onImageUpload,
  onImageDelete,
  disabled = false,
}: MasterInstrumentCardProps) {
  const { instruments, getUnitForInstrument } = useMasterInstrumentStore()

  /**
   * What each name measures, read from the lab's own parameter list.
   *
   * The add flow judges a capability through this - it is how "RTD" is known to serve
   * a Temperature parameter - and this card has to reach the same verdict, or the
   * master declared on one screen is refused on the next.
   */
  const labParameters = useParameterStore((state) => state.parameters)
  const classify = useMemo(
    () => (name: string) => classificationOf(name, labParameters),
    [labParameters],
  )

  /** Open where there is something to see; a click away where there is not. */
  const [showPhotos, setShowPhotos] = useState(images.length > 0)

  const listed = useMemo(
    () => instruments.find((inst) => inst.id === instrument.masterInstrumentId) ?? null,
    [instruments, instrument.masterInstrumentId],
  )


  // The same instrument in the registry, addressed by the id the certificate already
  // holds. Every instrument now comes from the registry, so this resolves unless a
  // certificate references one that has since been removed from the master list.
  const registryUnit = useMemo(
    () =>
      instrument.masterInstrumentId
        ? getUnitForInstrument({
            id: instrument.masterInstrumentId,
            asset_no: instrument.assetNo,
          })
        : undefined,
    [getUnitForInstrument, instrument.masterInstrumentId, instrument.assetNo],
  )

  /**
   * The parameters worth listing against this master.
   *
   * Not every parameter on the certificate. A thermometer offered "Pressure - not
   * supported by this instrument", greyed out and unclickable, which is a row that
   * exists only to be refused. What belongs here is what this master serves, or could:
   * the ones already assigned to it, and the ones it records a capability for.
   *
   * A parameter assigned to it stays even where the capability no longer matches -
   * hiding an answer already given is how a certificate quietly loses one.
   */
  const relevant = useMemo(() => {
    const all = parameters.map((param, paramIdx) => ({ param, paramIdx }))
    // One entry, one parameter, decided in one place - so an entry whose link a save
    // dropped cannot fall back to claiming every parameter its instrument serves.
    const linked = parameterIdFor(instrument, siblings, parameters)
    const mine = linked ? all.filter(({ param }) => param.id === linked) : []
    // Once the master is against a parameter, that is the card's subject. The others
    // are not choices to be made here - the add flow asks which parameter a master is
    // for, and the declaration below is written for that one. Listing the rest put a
    // second parameter and a second SOP box under a declaration that was never about
    // it, which reads as one master serving several.
    if (mine.length > 0) return mine

    // Nothing assigned yet: offer what this master could serve, so the card is not a
    // dead end.
    return all.filter(({ param }) => {
      if (!param.parameterName || !registryUnit) return true
      return unitCanMeasure(registryUnit, param.parameterName, param.parameterUnit, classify)
    })
  }, [parameters, instrument, siblings, registryUnit, classify])

  const assigned = relevant.some(
    ({ param }) => param.masterInstrumentId === instrument.masterInstrumentId,
  )
  const setAside = parameters.length - relevant.length
  // availableSopReferences is not persisted, so a reloaded draft has none and the
  // dropdown rendered empty. The registry records procedures for all 209 units, so it
  // is the fallback when neither the saved master nor the loaded list carries them.
  const sops = instrument.availableSopReferences?.length
    ? instrument.availableSopReferences
    : sopReferencesFor(listed, registryUnit)

  /** The parameter this master is against, told apart from any namesake by its range. */
  const serves = useMemo(() => {
    const linked = parameterIdFor(instrument, siblings, parameters)
    const mine = linked ? parameters.find((p) => p.id === linked) : undefined
    return mine ? parameterLabel(mine, parameters) : ''
  }, [parameters, instrument, siblings])

  /**
   * No title bar.
   *
   * It read "Master Instrument 1 - Temperature (Absolute) (-10 to 40 C)", sitting
   * directly under a row naming the instrument and a heading naming the parameter.
   * Third time on one screen, and "Master Instrument 1" was never the useful half -
   * the asset number is, and that is on the row. Removing it takes the card's own
   * border with it: the row is the object now, and a box inside a box was the frame
   * around a frame.
   */
  return (
    <div className="pt-1">

      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 space-y-4">
        {/* An instrument expiring soon is worth a line. It is not worth colouring the
            asset number, the serial and the calibration date, which is what a warning
            box wrapped round all of them did - the facts took the tone of the alert,
            and the same facts changed colour depending on a date. */}
        {listed?.status === 'EXPIRING_SOON' && (
          <p className="flex items-start gap-2 text-xs text-amber-800">
            <AlertTriangle className="size-3.5 shrink-0 text-amber-600 mt-px" />
            <span>
              Expires in {listed.daysUntilExpiry} days. Check it outlasts this
              certificate&rsquo;s due date.
            </span>
          </p>
        )}
        {listed?.status === 'EXPIRED' && (
          <p className="flex items-start gap-2 text-xs text-red-800">
            <AlertTriangle className="size-3.5 shrink-0 text-red-600 mt-px" />
            <span>This instrument&rsquo;s calibration has expired.</span>
          </p>
        )}

        {/* The instrument, plainly. Its asset number and description are on the row
            above, so what is left is what the row has no space for. */}
        {/* Two columns, not four.
            At four the cells are about 200px each, which is under what "Delta Ohm Ind:
            HD 2107.1 / Sen: TP 472 I" and "Transcal, Bangalore - TSC/25-26/11942-3"
            need - so two of the four wrapped to a second line and two did not, and the
            block read as ragged. Two columns give every value a line of its own. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-xs items-start">
          <Info
            label="Make / Model"
            value={
              [instrument.make, instrument.model].filter(Boolean).join(' ') ||
              (listed ? getDisplayValue(listed.model) : '')
            }
          />
          <Info label="Serial No" value={instrument.serialNumber} />
          <Info label="Calibration Due" value={instrument.calibrationDueDate} />
          <Info
            label="Calibrated at"
            value={
              [instrument.calibratedAt, instrument.reportNo].filter(Boolean).join(' \u00b7 ')
            }
          />
          {/* Only where it says something. A master over the whole of a parameter is
              the ordinary case and needs no line; one over part of it is a fact about
              the calibration, and the certificate prints it too. */}
          {instrument.rangeFrom && instrument.rangeTo && (
            <Info
              label="Used over"
              value={`${instrument.rangeFrom} to ${instrument.rangeTo}`}
            />
          )}
        </div>

        {parameters.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="bg-slate-100 px-4 py-3 border-b border-slate-200">
              <p className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                Parameter &amp; SOP <span className="text-red-500">*</span>
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                {assigned ? (
                  <>
                    The parameter this master was used for. Edit above to declare it
                    against a different one, or add the master again for another.
                  </>
                ) : (
                  <>
                    Which parameter this master was used for.
                    {setAside > 0 && (
                      <>
                        {' '}
                        {setAside} other{setAside === 1 ? '' : 's'} on this certificate{' '}
                        {setAside === 1 ? 'measures' : 'measure'} something this
                        instrument does not record, and {setAside === 1 ? 'is' : 'are'}{' '}
                        not listed.
                      </>
                    )}
                  </>
                )}
              </p>
            </div>

            <div className="divide-y divide-slate-100">
              {relevant.map(({ param, paramIdx }) => {
                const isAssigned = param.masterInstrumentId === instrument.masterInstrumentId
                // "Assigned to another instrument" only holds when that other instrument
                // is actually on this certificate. A reference to a master that has since
                // been removed is a dangling one: it blocked the row from ever being
                // ticked, which left the section with no way to finish.
                const claimedByOther =
                  param.masterInstrumentId !== null
                  && param.masterInstrumentId !== instrument.masterInstrumentId
                const isAssignedToOther =
                  claimedByOther && mastersOnCertificate.has(param.masterInstrumentId!)
                const isDangling = claimedByOther && !isAssignedToOther

                // The same test the add flow makes. Without the unit and the lab's
                // classification this fell back to asking whether the capability's name
                // contains the parameter's - and "RTD" does not contain "temperature",
                // so 1018 was declared with a 6.7 : 1 ratio on one screen and marked
                // "Not supported by this instrument" on the next.
                const isCompatible =
                  !param.parameterName || !registryUnit
                    ? true
                    : unitCanMeasure(
                        registryUnit,
                        param.parameterName,
                        param.parameterUnit,
                        classify,
                      )

                const rangeMin = param.rangeMin ? parseFloat(param.rangeMin) : null
                const rangeMax = param.rangeMax ? parseFloat(param.rangeMax) : null
                const isRangeCovered =
                  rangeMin === null || rangeMax === null || !param.parameterName || !registryUnit
                    ? true
                    : unitCoversRange(
                        registryUnit,
                        param.parameterName,
                        rangeMin,
                        rangeMax,
                        param.parameterUnit,
                        classify,
                      )

                const rangeStr = param.rangeMin && param.rangeMax
                  ? `${param.rangeMin} to ${param.rangeMax} ${param.parameterUnit}`
                  : param.parameterUnit || 'Range not set'

                const isDisabled = isAssignedToOther || !isCompatible
                let statusMessage = ''
                // In the order of what is actually stopping the engineer. A stale
                // reference to a master that has been removed is worth saying, but it
                // is not why the row is greyed out - and said first it hid the reason
                // that was: the badge read "Incompatible" while the line beneath talked
                // about a master that is no longer here.
                if (isAssignedToOther) {
                  statusMessage = 'Assigned to another instrument'
                } else if (!isCompatible) {
                  statusMessage = 'Not supported by this instrument'
                } else if (isDangling) {
                  statusMessage = 'Was assigned to a master no longer on this certificate'
                }

                return (
                  <div
                    key={param.id}
                    className={cn('px-4 py-3', isDisabled && 'opacity-50 bg-slate-50')}
                  >
                    <div className="flex items-center gap-4">
                      {/* One parameter per master, as the add flow asks it. Ticks let a
                          master be spread over several, and the declaration underneath -
                          the capability, the curve, the procedure - is written once per
                          master, so the second parameter inherited the first's answers
                          without anyone saying they applied. */}
                      <input
                        type="radio"
                        name={`master-${index}-assignment`}
                        checked={isAssigned}
                        disabled={isDisabled || disabled}
                        onChange={() =>
                          onParameterUpdate(paramIdx, {
                            ...param,
                            masterInstrumentId: instrument.masterInstrumentId,
                          })
                        }
                        className="size-4 border-slate-300 text-primary focus:ring-primary disabled:cursor-not-allowed"
                      />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap empty:hidden">
                          {/* Not on the row this master is already on.
                              The masters are grouped under the parameter they serve, so
                              that name is the heading a few lines above - saying it
                              again here made the same words appear twice on one card.
                              The others keep theirs: they are the alternatives, and an
                              alternative with no name is not a choice.

                              Told apart from a namesake by its range, as the add flow
                              does. A certificate calibrating one instrument over two
                              spans has two parameters called Temperature, and their two
                              masters both said "Temperature" - so which master was for
                              which span could not be read anywhere. */}
                          {!isAssigned && (
                            <p className="text-xs font-semibold text-slate-800 truncate">
                              {parameterLabel(param, parameters) || `Parameter ${paramIdx + 1}`}
                            </p>
                          )}
                          {!isCompatible && !isAssignedToOther && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-700">
                              <AlertTriangle className="size-3" />
                              Incompatible
                            </span>
                          )}
                          {isCompatible && !isRangeCovered && !isAssignedToOther && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-orange-100 text-orange-700">
                              <AlertTriangle className="size-3" />
                              Range Exceeds
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 truncate">
                          {rangeStr}
                          {statusMessage && ` • ${statusMessage}`}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Label className="text-[10px] font-bold text-slate-500 uppercase whitespace-nowrap hidden sm:block">
                          SOP Ref <span className="text-red-500">*</span>
                        </Label>
                        {sops.length > 0 ? (
                          <Select
                            value={param.sopReference || ''}
                            onValueChange={(value) =>
                              onParameterUpdate(paramIdx, { ...param, sopReference: value })
                            }
                            disabled={!isAssigned || disabled}
                          >
                            <SelectTrigger className="w-48 h-8 text-xs rounded-lg border-slate-300 focus:ring-primary focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed">
                              <SelectValue placeholder="Select SOP..." />
                            </SelectTrigger>
                            <SelectContent>
                              {sops.map((sop) => (
                                <SelectItem key={sop} value={sop}>
                                  {sop}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            type="text"
                            value={param.sopReference || ''}
                            onChange={(e) =>
                              onParameterUpdate(paramIdx, {
                                ...param,
                                sopReference: e.target.value,
                              })
                            }
                            disabled={!isAssigned || disabled}
                            placeholder="e.g., NLAB/CAL/T01/R01"
                            className="w-44 h-8 text-xs rounded-lg border-slate-300 focus:ring-primary focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                        )}
                      </div>
                    </div>

                    {/* How this master was used, and what that gives against the
                        requirement. The declaration is asked only where it is still
                        missing - a master added through the flow arrives declared. */}
                    {isAssigned && registryUnit && (
                      <div className="ml-8">
                        {/* A master saved before the declaration existed has none;
                            it can be given one here without reopening the flow. */}
                        {!param.masterProfileId && (
                          <MasterCapabilityDeclaration
                            unit={registryUnit}
                            parameterName={param.parameterName}
                            parameterUnit={param.parameterUnit}
                            required={requiredRanges(param)}
                            profileId={param.masterProfileId}
                            subtype={param.masterSubtype}
                            disabled={disabled}
                            onChange={({ profileId, subtype }) =>
                              onParameterUpdate(paramIdx, {
                                ...param,
                                masterProfileId: profileId,
                                masterSubtype: subtype,
                              })
                            }
                          />
                        )}
                        <MasterCapabilityComparison
                          unit={registryUnit}
                          parameter={param}
                          onEdit={!disabled ? onEdit : undefined}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Photos are optional and rarely looked at, and the drop zone was the
            tallest thing on the card - a permanent empty rectangle under every master
            on every certificate. It says how many there are and opens when asked. */}
        <div className="pt-3 border-t border-slate-200 flex items-center gap-4 flex-wrap">
          <button
            type="button"
            onClick={() => setShowPhotos((open) => !open)}
            aria-expanded={showPhotos}
            className="flex items-center gap-2 text-xs text-slate-500 hover:text-primary transition-colors"
          >
            <Camera className="size-3.5" />
            <span>
              {images.length === 0
                ? 'No photos'
                : `${images.length} photo${images.length === 1 ? '' : 's'}`}
            </span>
            {!disabled && (
              <span className="text-primary font-semibold">
                {showPhotos ? 'Hide' : images.length ? 'Show' : 'Add'}
              </span>
            )}
          </button>

          {/* Beside the photos rather than up in a title bar: the three things that can
              be done to a master, on one line, at the bottom of what they act on. */}
          {!disabled && (
            <button
              type="button"
              onClick={onRemove}
              className="ml-auto flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-600 transition-colors"
            >
              <Trash2 className="size-3.5" />
              Remove this master
            </button>
          )}

          {showPhotos && (
            <div className="mt-3 w-full">
              <ImageUploadGallery
                certificateId={certificateId || 'pending'}
                imageType="MASTER_INSTRUMENT"
                masterInstrumentIndex={index}
                images={images}
                maxImages={5}
                onUpload={onImageUpload}
                onDelete={onImageDelete}
                disabled={disabled}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface MasterInstrumentSectionProps {
  feedbackSlot?: React.ReactNode
  disabled?: boolean
  accordionStatus?: 'default' | 'locked' | 'unlocked' | 'pending'
  hasFeedback?: boolean
}

export function MasterInstrumentSection({ feedbackSlot, disabled, accordionStatus, hasFeedback }: MasterInstrumentSectionProps = {}) {
  const {
    formData,
    certificateId,
    addMasterInstrument,
    removeMasterInstrument,
    setMasterInstrument,
    setParameter,
    saveDraft,
  } = useCertificateStore()
  const { instruments, isLoaded, loadInstruments, getStats, getUnitForInstrument } =
    useMasterInstrumentStore()

  const [flowOpen, setFlowOpen] = useState(false)
  /** The master being reopened, by its index in the certificate. */
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  const { uploadImageWithId, deleteImage, getMasterImages, refreshWithId } = useCertificateImages({
    certificateId,
  })

  const handleImageUpload = useCallback(
    (masterIndex: number) => async (file: File) => {
      let currentCertId = certificateId

      // If certificate hasn't been saved yet, save as draft first
      if (!currentCertId) {
        const result = await saveDraft()
        if (!result.success) {
          throw new Error(result.error || 'Failed to save draft before uploading image')
        }
        currentCertId = useCertificateStore.getState().certificateId
        if (!currentCertId) {
          throw new Error('Failed to get certificate ID after saving draft')
        }
      }

      await uploadImageWithId(currentCertId, file, {
        imageType: 'MASTER_INSTRUMENT',
        masterInstrumentIndex: masterIndex,
      })

      await refreshWithId(currentCertId)
    },
    [certificateId, saveDraft, uploadImageWithId, refreshWithId]
  )

  const handleImageDelete = useCallback(
    async (imageId: string) => {
      await deleteImage(imageId)
    },
    [deleteImage]
  )

  useEffect(() => {
    if (!isLoaded) {
      loadInstruments()
    }
  }, [isLoaded, loadInstruments])

  const stats = getStats()

  // A master with no instrument chosen is not a master yet - it is the blank row the
  // store starts with. It is reused by the next commit rather than shown as a card.
  const committed = formData.masterInstruments
    .map((m, index) => ({ m, index }))
    .filter(({ m }) => m.masterInstrumentId > 0)

  const mastersOnCertificate = new Set(committed.map(({ m }) => m.masterInstrumentId))

  // For naming a covered parameter's master, where two entries on one instrument name
  // the same asset anyway - which they do, it being the same instrument.
  const assetByInstrumentId = new Map(
    committed.map(({ m }) => [m.masterInstrumentId, m.assetNo || String(m.masterInstrumentId)]),
  )

  /**
   * The entry a parameter's master is, among those on the certificate.
   *
   * By the entry, not by the instrument. One thermometer can be the master for two
   * temperature spans and so appear twice; asking which instrument a parameter names
   * then matches both entries, and each one reads the other's parameter as its own.
   *
   * An entry that names no parameter - saved before entries did - still answers by
   * instrument, which is right for every certificate that uses one once.
   */
  const entryFor = (
    parameter: Parameter,
    among: { m: SelectedMasterInstrument; index: number }[],
  ) =>
    among.find(
      ({ m }) =>
        parameterIdFor(m, formData.masterInstruments, formData.parameters) === parameter.id,
    )

  const assetOf = (m: SelectedMasterInstrument) => m.assetNo || String(m.masterInstrumentId)

  /** Which parameters already have a master here, and the asset that serves them. */
  const coveredBy = new Map<string, string>()
  formData.parameters.forEach((p) => {
    // Every entry on this parameter, not the first of them: a parameter can have more
    // than one master, and naming one of two reads as though the other were not there.
    const serving = committed.filter(
      ({ m }) => parameterIdFor(m, formData.masterInstruments, formData.parameters) === p.id,
    )
    if (!serving.length) return
    coveredBy.set(p.id, serving.map(({ m }) => assetOf(m)).join(', '))
  })

  /**
   * Coverage as seen from inside the flow. The master being edited is left out, so its
   * own parameter is still on offer - otherwise reopening one would show the parameter
   * it serves as already taken, by itself.
   */
  const coveredByOther = (exceptIndex: number) => {
    const map = new Map<string, string>()
    const others = committed.filter(({ index }) => index !== exceptIndex)
    formData.parameters.forEach((p) => {
      const serving = others.filter(
        ({ m }) => parameterIdFor(m, formData.masterInstruments, formData.parameters) === p.id,
      )
      if (!serving.length) return
      map.set(p.id, serving.map(({ m }) => assetOf(m)).join(', '))
    })
    return map
  }

  /** The answers already given for one master, to reopen the flow on. */
  const seedFor = (index: number): FlowSeed | undefined => {
    const master = formData.masterInstruments[index]
    if (!master || master.masterInstrumentId <= 0) return undefined
    // The entry's own parameter, so reopening a thermometer used for two spans returns
    // to the span it was declared against rather than to whichever came first.
    const linked = parameterIdFor(master, formData.masterInstruments, formData.parameters)
    const mine = linked ? formData.parameters.filter((p) => p.id === linked) : []
    return {
      parameterIds: mine.map((p) => p.id),
      instrumentId: master.masterInstrumentId,
      rangeFrom: master.rangeFrom,
      rangeTo: master.rangeTo,
      declarations: Object.fromEntries(
        mine.map((p) => [
          p.id,
          {
            // The entry's own answers where it has them. A parameter with two masters
            // carries only the first one's, so the second would reopen on the first's
            // capability and quietly re-declare itself as that.
            profileId: master.masterProfileId ?? p.masterProfileId,
            subtype: master.masterSubtype ?? p.masterSubtype,
            sop: master.sopReference ?? p.sopReference ?? '',
            reason: master.masterAcceptanceReason ?? p.masterAcceptanceReason ?? '',
          },
        ]),
      ),
    }
  }

  const commit = (result: FlowResult) => {
    const inst = result.instrument
    // Which parameter this entry is for. Without it, two entries carrying the same
    // instrument - one thermometer used for two temperature spans - are indistinguish-
    // able, and the second span cannot be assigned at all.
    const forParameter =
      formData.parameters[result.assignments[0]?.parameterIndex ?? -1]?.id

    const selected: SelectedMasterInstrument = {
      id: `mi-${inst.id}-${Date.now()}`,
      parameterId: forParameter,
      masterInstrumentId: inst.id,
      category: inst.type,
      description: inst.instrument_desc,
      make: getDisplayValue(inst.make),
      model: getDisplayValue(inst.model),
      assetNo: inst.asset_no,
      serialNumber: getDisplayValue(inst.instrument_sl_no),
      calibratedAt: inst.calibrated_at,
      reportNo: inst.report_no,
      calibrationDueDate: inst.next_due_on,
      isExpired: false,
      isExpiringSoon: inst.status === 'EXPIRING_SOON',
      availableSopReferences: sopReferencesFor(inst, getUnitForInstrument(inst)),
      // The stretch this master was used over, and how it was used. Both belong to
      // the pairing rather than to the parameter, which has room for one master's
      // answers and so used to mean one master.
      rangeFrom: result.assignments[0]?.rangeFrom,
      rangeTo: result.assignments[0]?.rangeTo,
      masterProfileId: result.assignments[0]?.profileId,
      masterSubtype: result.assignments[0]?.subtype,
      masterAcceptanceReason: result.assignments[0]?.acceptanceReason || undefined,
      sopReference: result.assignments[0]?.sopReference,
    }

    // Editing writes back to the same master. Otherwise reuse the blank row the store
    // starts with rather than leaving it behind.
    let slot = editingIndex
    if (slot === null) {
      const blank = formData.masterInstruments.findIndex((m) => m.masterInstrumentId <= 0)
      slot = blank
      if (slot < 0) {
        addMasterInstrument()
        slot = useCertificateStore.getState().formData.masterInstruments.length - 1
      }
    }

    // A parameter this master used to serve and no longer does keeps a pointer to it
    // otherwise, which is how a certificate ends up naming a master that does not
    // claim it.
    //
    // Only where no other entry still serves it. A parameter can have several masters
    // now, so releasing it on the strength of one card letting go would strip the
    // parameter of a master that is still on the certificate.
    const previous = formData.masterInstruments[slot]
    const keeping = new Set(result.assignments.map((a) => a.parameterIndex))
    if (previous && previous.masterInstrumentId > 0) {
      formData.parameters.forEach((p, i) => {
        // Only what this entry was against. Matching on the instrument would let one
        // card release the parameter of another card holding the same instrument.
        const wasMine =
          parameterIdFor(previous, formData.masterInstruments, formData.parameters) === p.id
        if (!wasMine || keeping.has(i)) return
        // Another card still on this parameter keeps it. The parameter's own fields
        // mirror whichever master comes first, so they move to that one rather than
        // being emptied.
        const stillServed = formData.masterInstruments.find(
          (m, j) =>
            j !== slot &&
            m.masterInstrumentId > 0 &&
            parameterIdFor(m, formData.masterInstruments, formData.parameters) === p.id,
        )
        if (stillServed) {
          setParameter(i, {
            ...p,
            masterInstrumentId: stillServed.masterInstrumentId,
            masterProfileId: stillServed.masterProfileId,
            masterSubtype: stillServed.masterSubtype,
            masterAcceptanceReason: stillServed.masterAcceptanceReason,
            sopReference: stillServed.sopReference ?? '',
          })
          return
        }
        setParameter(i, {
          ...p,
          masterInstrumentId: null,
          masterProfileId: undefined,
          masterSubtype: undefined,
          masterAcceptanceReason: undefined,
          sopReference: '',
        })
      })
    }

    setMasterInstrument(slot, { ...selected, id: formData.masterInstruments[slot]?.id ?? selected.id })

    // One master can serve several parameters, each declared separately.
    result.assignments.forEach((assignment) => {
      const param =
        useCertificateStore.getState().formData.parameters[assignment.parameterIndex]
      if (!param) return

      /**
       * The parameter's own master fields mirror the first master on it, and only the
       * first.
       *
       * They are what certificates saved before a parameter could hold several carry,
       * and what everything not yet moved onto the entry still reads. A second master
       * writing over them would take the first one's declaration off the certificate
       * while leaving the first one's card on it.
       */
      const alreadyServed =
        param.masterInstrumentId !== null &&
        useCertificateStore
          .getState()
          .formData.masterInstruments.some(
            (m, j) =>
              j !== slot &&
              m.masterInstrumentId > 0 &&
              parameterIdFor(
                m,
                useCertificateStore.getState().formData.masterInstruments,
                useCertificateStore.getState().formData.parameters,
              ) === param.id,
          )
      if (alreadyServed) return

      setParameter(assignment.parameterIndex, {
        ...param,
        masterInstrumentId: inst.id,
        sopReference: assignment.sopReference,
        masterMapping: assignment.masterMapping,
        masterProfileId: assignment.profileId,
        masterSubtype: assignment.subtype,
        masterAcceptanceReason: assignment.acceptanceReason || undefined,
      })
    })

    setFlowOpen(false)
    setEditingIndex(null)
    // The flow is several screens tall and the card that replaces it is not, so
    // everything below jumps up by the difference while the scroll position stays
    // where it was - and the reader lands two sections further on, looking at
    // something they did not ask for. Put them back on what they just saved.
    setJustSaved(slot)
  }

  /**
   * The master just committed, so the page can be returned to it.
   *
   * Cleared once it has been scrolled to, or the card would fight the reader for the
   * scroll position on every later render.
   */
  const [justSaved, setJustSaved] = useState<number | null>(null)

  /** Which master is opened out. One at a time, by the entry's own id. */
  const [openRow, setOpenRow] = useState<string | null>(null)

  /**
   * Every master on one parameter, by the link each entry carries.
   *
   * A parameter can have several now, so this answers with all of them rather than
   * the first - which is what deciding coverage on `parameter.masterInstrumentId`
   * amounted to.
   */
  const servingParameter = (parameter: Parameter) =>
    committed.filter(
      ({ m }) =>
        parameterIdFor(m, formData.masterInstruments, formData.parameters) === parameter.id,
    )

  /** Whether every master on a parameter names the procedure it was used under. */
  const procedureFor = (
    parameter: Parameter,
    serving: { m: SelectedMasterInstrument }[],
  ) =>
    serving.length > 0 &&
    serving.every(({ m }) => (m.sopReference ?? parameter.sopReference ?? '').trim() !== '')


  useEffect(() => {
    if (justSaved === null) return
    const card = document.getElementById(`master-card-${justSaved}`)
    card?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setJustSaved(null)
  }, [justSaved])

  return (
    <FormSection
      id="master-inst"
      sectionNumber="Section 03"
      title="Master Instrument Details"
      feedbackSlot={feedbackSlot}
      disabled={disabled}
      accordionStatus={accordionStatus}
      hasFeedback={hasFeedback}
    >
      <div className="space-y-4 p-5 rounded-xl border border-slate-300 bg-section-inner">
        <div>
          <p className="text-xs text-slate-500">
            Select the standard instrument(s) used for this calibration.
          </p>
          {isLoaded && (
            <p className="text-xs text-slate-400 mt-1">
              {stats.total} instruments available
              {stats.expired > 0 && (
                <span className="text-red-500 ml-2">({stats.expired} expired)</span>
              )}
              {stats.expiringSoon > 0 && (
                <span className="text-amber-500 ml-2">({stats.expiringSoon} expiring soon)</span>
              )}
            </p>
          )}
        </div>

        {/* Which parameters still have no master, and which have one but no procedure
            to go with it. Said up here as well as on each heading below: the heading
            answers for the parameter you are looking at, and this answers for the
            section, which is the question asked at the point of submitting. */}
        <ParameterCoverage
          parameters={formData.parameters}
          assetByInstrumentId={assetByInstrumentId}
          mastersByParameterId={
            new Map(
              formData.parameters.map((p) => [
                p.id,
                servingParameter(p).map(({ m }) => m.assetNo || String(m.masterInstrumentId)),
              ]),
            )
          }
        />

        {/**
          * Grouped by parameter, because that is the question being asked.
          *
          * A card per master answered "what did we use", one master at a time, and left
          * "is this parameter covered, and by what" to be worked out by reading down the
          * page. Now that a parameter can have more than one master, that reading meant
          * holding two cards in your head at once.
          *
          * The parameter is the heading; its masters are rows beneath it. A settled one
          * is a line, and opens where it needs to be worked on.
          */}
        <div className="space-y-5">
          {formData.parameters.map((parameter, parameterIndex) => {
            const serving = servingParameter(parameter)
            // Told apart from a namesake by its range, as every other screen does.
            const label = parameterLabel(parameter, formData.parameters)
            const range =
              parameter.rangeMin && parameter.rangeMax
                ? `${parameter.rangeMin} to ${parameter.rangeMax}${parameter.parameterUnit ? ` ${parameter.parameterUnit}` : ''}`
                : parameter.parameterUnit || ''
            // parameterLabel appends the range in brackets where two parameters share a
            // name, which is exactly when there are two of them to tell apart. Saying it
            // again gives "Temperature (Absolute) (-10 to 40 °C)   -10 to 40 °C".
            const span = label.endsWith(`(${range})`) ? '' : range

            return (
              <div key={parameter.id}>
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <p className="text-xs font-bold text-slate-800">
                    {label}
                    {span && <span className="ml-2 font-normal text-slate-500">{span}</span>}
                  </p>
                  {/* A master is half the answer. The section also wants the procedure
                      each calibration was carried out under, and a heading that said
                      "covered" on the master alone reported a parameter as finished
                      while the field it still needed sat blank inside it. */}
                  {!serving.length ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                      <AlertTriangle className="size-3" />
                      no master
                    </span>
                  ) : !procedureFor(parameter, serving) ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                      <AlertTriangle className="size-3" />
                      needs a procedure
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700">
                      <CheckCircle className="size-3" />
                      {serving.length === 1 ? 'ready' : `ready \u00b7 ${serving.length} masters`}
                    </span>
                  )}
                </div>

                <div className="mt-1.5 rounded-xl border border-slate-200 bg-white overflow-hidden">
                  {serving.length === 0 ? (
                    <p className="px-3 py-2.5 text-xs text-slate-400">
                      Nothing assigned yet.
                    </p>
                  ) : (
                    serving.map(({ m, index }) =>
                      editingIndex === index ? (
                        <div key={m.id} className="p-3">
                          <MasterAddFlow
                            index={index + 1}
                            parameters={formData.parameters}
                            coveredBy={coveredByOther(index)}
                            instruments={instruments}
                            resolveUnit={getUnitForInstrument}
                            disabled={disabled}
                            seed={seedFor(index)}
                            onCancel={() => setEditingIndex(null)}
                            onAdd={commit}
                          />
                        </div>
                      ) : (
                        <div id={`master-card-${index}`} key={m.id}>
                          <MasterRow
                            instrument={m}
                            parameter={parameter}
                            unit={getUnitForInstrument({
                              id: m.masterInstrumentId,
                              asset_no: m.assetNo,
                            })}
                            threshold={DEFAULT_ACCURACY_RATIO}
                            open={openRow === m.id}
                            onToggle={() => setOpenRow(openRow === m.id ? null : m.id)}
                          >
                            <MasterInstrumentCard
                              instrument={m}
                              index={index}
                              onRemove={() => removeMasterInstrument(index)}
                              onEdit={() => {
                                setFlowOpen(false)
                                setEditingIndex(index)
                              }}
                              parameters={formData.parameters}
                              siblings={formData.masterInstruments}
                              mastersOnCertificate={mastersOnCertificate}
                              onParameterUpdate={setParameter}
                              certificateId={certificateId}
                              images={getMasterImages(index).map((img) => ({
                                id: img.id,
                                fileName: img.fileName,
                                thumbnailUrl: img.thumbnailUrl,
                                optimizedUrl: img.optimizedUrl,
                                originalUrl: img.originalUrl,
                                caption: img.caption,
                                isProcessing: img.isProcessing,
                              }))}
                              onImageUpload={handleImageUpload(index)}
                              onImageDelete={handleImageDelete}
                              disabled={disabled}
                            />
                          </MasterRow>
                        </div>
                      ),
                    )
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {editingIndex !== null ? null : flowOpen ? (
          <MasterAddFlow
            index={committed.length + 1}
            parameters={formData.parameters}
            coveredBy={coveredBy}
            instruments={instruments}
            resolveUnit={getUnitForInstrument}
            disabled={disabled}
            onCancel={() => setFlowOpen(false)}
            onAdd={commit}
          />
        ) : (
          <button
            type="button"
            onClick={() => setFlowOpen(true)}
            disabled={disabled}
            className="mt-5 w-full h-9 rounded-xl border-2 border-dashed border-slate-300 bg-white text-xs text-slate-500 hover:border-primary hover:text-primary transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <Plus className="size-4" />
            {committed.length === 0 ? 'Add Master Instrument' : 'Add Another Master Instrument'}
          </button>
        )}
      </div>
    </FormSection>
  )
}
