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
import { Plus, Trash2, CheckCircle, AlertTriangle, XCircle, Clock, Wrench, Camera } from 'lucide-react'
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
import { useCertificateStore, SelectedMasterInstrument, Parameter } from '@/lib/stores/certificate-store'
import { ImageUploadGallery, GalleryImage } from './ImageUploadGallery'
import { useCertificateImages } from '@/lib/hooks/useCertificateImages'
import { useMasterInstrumentStore } from '@/lib/stores/master-instrument-store'
import {
  InstrumentStatus,
  getDisplayValue,
  STATUS_CONFIG,
} from '@/lib/master-instruments'
import { requiredRanges, unitCanMeasure, unitCoversRange } from '@/lib/master-instrument-capability'
import { MasterCapabilityComparison } from '@/components/forms/MasterCapabilityComparison'
import { MasterCapabilityDeclaration } from '@/components/forms/MasterCapabilityDeclaration'
import {
  MasterAddFlow,
  sopReferencesFor,
  type FlowResult,
  type FlowSeed,
} from '@/components/forms/MasterAddFlow'
import { ParameterCoverage } from '@/components/forms/ParameterCoverage'
import { cn } from '@/lib/utils'

interface MasterInstrumentCardProps {
  instrument: SelectedMasterInstrument
  index: number
  onRemove: () => void
  /** Reopen the whole selection for this master - the instrument as well as how it
   *  was used, since the instrument is as much a part of the answer. */
  onEdit: () => void
  parameters: Parameter[]
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
    <div>
      <p className="text-[10px] font-bold text-slate-500 uppercase">{label}</p>
      <p className="font-semibold text-slate-800">{value || '—'}</p>
    </div>
  )
}

// Exported for tests: the editing behaviour below is worth pinning on its own.
export function MasterInstrumentCard({
  instrument,
  index,
  onRemove,
  onEdit,
  parameters,
  mastersOnCertificate,
  onParameterUpdate,
  certificateId,
  images,
  onImageUpload,
  onImageDelete,
  disabled = false,
}: MasterInstrumentCardProps) {
  const { instruments, getUnitForInstrument } = useMasterInstrumentStore()

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

  // availableSopReferences is not persisted, so a reloaded draft has none and the
  // dropdown rendered empty. The registry records procedures for all 209 units, so it
  // is the fallback when neither the saved master nor the loaded list carries them.
  const sops = instrument.availableSopReferences?.length
    ? instrument.availableSopReferences
    : sopReferencesFor(listed, registryUnit)

  return (
    <div className="bg-section-inner rounded-xl p-5 border border-slate-300">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
          Master Instrument {index + 1}
        </span>
        {!disabled && (
          <button
            type="button"
            onClick={onRemove}
            title="Remove"
            className="text-red-500 hover:text-red-700 transition-colors"
          >
            <Trash2 className="size-5" />
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl p-4 border border-slate-200">
        <div
          className={cn(
            'rounded-xl p-4 border flex items-start gap-4 mb-4',
            listed?.status === 'EXPIRING_SOON'
              ? 'bg-amber-50 border-amber-200'
              : 'bg-green-50 border-green-100',
          )}
        >
          {listed?.status === 'EXPIRING_SOON' ? (
            <AlertTriangle className="size-5 text-amber-600 mt-0.5 flex-shrink-0" />
          ) : (
            <CheckCircle className="size-5 text-green-600 mt-0.5 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <p
                className={cn(
                  'text-xs font-extrabold uppercase tracking-wider',
                  listed?.status === 'EXPIRING_SOON' ? 'text-amber-700' : 'text-green-700',
                )}
              >
                Instrument Selected
              </p>
              {listed?.status && (
                <StatusBadge status={listed.status} daysUntilExpiry={listed.daysUntilExpiry} />
              )}
            </div>

            {listed?.status === 'EXPIRING_SOON' && (
              <p className="text-xs text-amber-800 font-semibold mb-2">
                Warning: This instrument expires in {listed.daysUntilExpiry} days. Consider
                using a different instrument if the certificate due date extends beyond.
              </p>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <Info label="Asset No" value={instrument.assetNo} />
              <Info
                label="Make / Model"
                value={
                  [instrument.make, instrument.model].filter(Boolean).join(' ') ||
                  (listed ? getDisplayValue(listed.model) : '')
                }
              />
              <Info label="Serial No" value={instrument.serialNumber} />
              <Info label="Calibration Due" value={instrument.calibrationDueDate} />
            </div>

            <div className="mt-3 pt-3 border-t border-slate-200">
              <p className="text-xs text-slate-500">
                <span className="font-semibold">Calibrated at:</span> {instrument.calibratedAt}
                {instrument.reportNo && (
                  <>
                    {' '}&middot;{' '}
                    <span className="font-semibold">Report:</span> {instrument.reportNo}
                  </>
                )}
              </p>
            </div>
          </div>
        </div>

        {parameters.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="bg-slate-100 px-4 py-3 border-b border-slate-200">
              <p className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                Parameter &amp; SOP Assignment <span className="text-red-500">*</span>
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                The parameter this master was added for, and any other it also serves.
              </p>
            </div>

            <div className="divide-y divide-slate-100">
              {parameters.map((param, paramIdx) => {
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

                const isCompatible =
                  !param.parameterName || !registryUnit
                    ? true
                    : unitCanMeasure(registryUnit, param.parameterName)

                const rangeMin = param.rangeMin ? parseFloat(param.rangeMin) : null
                const rangeMax = param.rangeMax ? parseFloat(param.rangeMax) : null
                const isRangeCovered =
                  rangeMin === null || rangeMax === null || !param.parameterName || !registryUnit
                    ? true
                    : unitCoversRange(registryUnit, param.parameterName, rangeMin, rangeMax)

                const rangeStr = param.rangeMin && param.rangeMax
                  ? `${param.rangeMin} to ${param.rangeMax} ${param.parameterUnit}`
                  : param.parameterUnit || 'Range not set'

                const isDisabled = isAssignedToOther || !isCompatible
                let statusMessage = ''
                if (isAssignedToOther) {
                  statusMessage = 'Assigned to another instrument'
                } else if (isDangling) {
                  statusMessage = 'Was assigned to a master no longer on this certificate'
                } else if (!isCompatible) {
                  statusMessage = 'Not supported by this instrument'
                }

                return (
                  <div
                    key={param.id}
                    className={cn('px-4 py-3', isDisabled && 'opacity-50 bg-slate-50')}
                  >
                    <div className="flex items-center gap-4">
                      <input
                        type="checkbox"
                        checked={isAssigned}
                        disabled={isDisabled || disabled}
                        onChange={(e) => {
                          onParameterUpdate(paramIdx, {
                            ...param,
                            masterInstrumentId: e.target.checked
                              ? instrument.masterInstrumentId
                              : null,
                            sopReference: e.target.checked ? param.sopReference : '',
                            masterProfileId: e.target.checked ? param.masterProfileId : undefined,
                            masterSubtype: e.target.checked ? param.masterSubtype : undefined,
                          })
                        }}
                        className="size-4 rounded border-slate-300 text-primary focus:ring-primary disabled:cursor-not-allowed"
                      />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs font-semibold text-slate-800 truncate">
                            {param.parameterName || `Parameter ${paramIdx + 1}`}
                          </p>
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

        <div className="mt-4 pt-4 border-t border-slate-200">
          <div className="flex items-center gap-2 mb-4">
            <Camera className="size-5 text-slate-500" />
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Instrument Photos
            </h4>
            <span className="text-xs text-slate-400">(Optional - max 5 photos)</span>
          </div>
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

  const assetByInstrumentId = new Map(
    committed.map(({ m }) => [m.masterInstrumentId, m.assetNo || String(m.masterInstrumentId)]),
  )
  const mastersOnCertificate = new Set(committed.map(({ m }) => m.masterInstrumentId))

  /** Which parameters already have a master here, and the asset that serves them. */
  const coveredBy = new Map<string, string>()
  formData.parameters.forEach((p) => {
    if (p.masterInstrumentId !== null && assetByInstrumentId.has(p.masterInstrumentId)) {
      coveredBy.set(p.id, assetByInstrumentId.get(p.masterInstrumentId)!)
    }
  })

  /**
   * Coverage as seen from inside the flow. The master being edited is left out, so its
   * own parameters are still on offer - otherwise reopening one would show every
   * parameter it serves as already taken, by itself.
   */
  const coveredByOther = (exceptIndex: number) => {
    const map = new Map<string, string>()
    const others = committed.filter(({ index }) => index !== exceptIndex)
    const assets = new Map(others.map(({ m }) => [m.masterInstrumentId, m.assetNo || String(m.masterInstrumentId)]))
    formData.parameters.forEach((p) => {
      if (p.masterInstrumentId !== null && assets.has(p.masterInstrumentId)) {
        map.set(p.id, assets.get(p.masterInstrumentId)!)
      }
    })
    return map
  }

  /** The answers already given for one master, to reopen the flow on. */
  const seedFor = (index: number): FlowSeed | undefined => {
    const master = formData.masterInstruments[index]
    if (!master || master.masterInstrumentId <= 0) return undefined
    const mine = formData.parameters.filter(
      (p) => p.masterInstrumentId === master.masterInstrumentId,
    )
    return {
      parameterIds: mine.map((p) => p.id),
      instrumentId: master.masterInstrumentId,
      declarations: Object.fromEntries(
        mine.map((p) => [
          p.id,
          {
            profileId: p.masterProfileId,
            subtype: p.masterSubtype,
            sop: p.sopReference || '',
            reason: p.masterAcceptanceReason || '',
          },
        ]),
      ),
    }
  }

  const commit = (result: FlowResult) => {
    const inst = result.instrument
    const selected: SelectedMasterInstrument = {
      id: `mi-${inst.id}-${Date.now()}`,
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
    const previous = formData.masterInstruments[slot]
    const keeping = new Set(result.assignments.map((a) => a.parameterIndex))
    if (previous && previous.masterInstrumentId > 0) {
      formData.parameters.forEach((p, i) => {
        if (p.masterInstrumentId !== previous.masterInstrumentId || keeping.has(i)) return
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
      setParameter(assignment.parameterIndex, {
        ...param,
        masterInstrumentId: inst.id,
        sopReference: assignment.sopReference,
        masterProfileId: assignment.profileId,
        masterSubtype: assignment.subtype,
        masterAcceptanceReason: assignment.acceptanceReason || undefined,
      })
    })

    setFlowOpen(false)
    setEditingIndex(null)
  }

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

        {/* Which parameters still have no master. Nothing said so before, and a
            parameter can be missed without anything on screen noticing. */}
        <ParameterCoverage
          parameters={formData.parameters}
          assetByInstrumentId={assetByInstrumentId}
        />

        <div className="space-y-5">
          {committed.map(({ m, index }) =>
            editingIndex === index ? (
              <MasterAddFlow
                key={m.id}
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
            ) : (
            <MasterInstrumentCard
              key={m.id}
              instrument={m}
              index={index}
              onRemove={() => removeMasterInstrument(index)}
              onEdit={() => {
                setFlowOpen(false)
                setEditingIndex(index)
              }}
              parameters={formData.parameters}
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
            ),
          )}
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
            className="mt-5 w-full h-12 rounded-xl border-2 border-dashed border-slate-300 bg-white text-xs font-semibold text-slate-500 hover:border-primary hover:text-primary transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <Plus className="size-4" />
            {committed.length === 0 ? 'Add Master Instrument' : 'Add Another Master Instrument'}
          </button>
        )}
      </div>
    </FormSection>
  )
}
