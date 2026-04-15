'use client'

import { useMemo, useCallback } from 'react'
import { Plus, Trash2, Link2, Camera } from 'lucide-react'
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
import { useCertificateStore, Parameter, ParameterBin, SelectedMasterInstrument, AccuracyType, ACCURACY_TYPE_CONFIG } from '@/lib/stores/certificate-store'
import { ImageUploadGallery, GalleryImage } from './ImageUploadGallery'
import { useCertificateImages } from '@/lib/hooks/useCertificateImages'

// Parameter types with their associated measurement units
const PARAMETER_CONFIG: Record<string, { label: string; units: string[]; defaultUnit: string }> = {
  'Temperature': {
    label: 'Temperature',
    units: ['°C', '°F', 'K'],
    defaultUnit: '°C',
  },
  'Humidity': {
    label: 'Humidity',
    units: ['%RH'],
    defaultUnit: '%RH',
  },
  'Pressure': {
    label: 'Pressure',
    units: ['Pa', 'kPa', 'MPa', 'bar', 'mbar', 'psi', 'mmHg', 'inH2O', 'mmWC'],
    defaultUnit: 'bar',
  },
  'Voltage DC': {
    label: 'Voltage (DC)',
    units: ['µV', 'mV', 'V', 'kV'],
    defaultUnit: 'V',
  },
  'Voltage AC': {
    label: 'Voltage (AC)',
    units: ['µV', 'mV', 'V', 'kV'],
    defaultUnit: 'V',
  },
  'Current DC': {
    label: 'Current (DC)',
    units: ['µA', 'mA', 'A'],
    defaultUnit: 'mA',
  },
  'Current AC': {
    label: 'Current (AC)',
    units: ['µA', 'mA', 'A'],
    defaultUnit: 'mA',
  },
  'Resistance': {
    label: 'Resistance',
    units: ['mΩ', 'Ω', 'kΩ', 'MΩ', 'GΩ'],
    defaultUnit: 'Ω',
  },
  'Frequency': {
    label: 'Frequency',
    units: ['Hz', 'kHz', 'MHz', 'GHz'],
    defaultUnit: 'Hz',
  },
  'Time': {
    label: 'Time',
    units: ['µs', 'ms', 's', 'min', 'hr'],
    defaultUnit: 's',
  },
  'Mass': {
    label: 'Mass',
    units: ['mg', 'g', 'kg'],
    defaultUnit: 'kg',
  },
  'Force': {
    label: 'Force',
    units: ['N', 'kN', 'kgf', 'lbf'],
    defaultUnit: 'N',
  },
  'Torque': {
    label: 'Torque',
    units: ['N·m', 'kgf·m', 'lbf·ft', 'lbf·in'],
    defaultUnit: 'N·m',
  },
  'Length': {
    label: 'Length',
    units: ['µm', 'mm', 'cm', 'm', 'in', 'ft'],
    defaultUnit: 'mm',
  },
  'Flow': {
    label: 'Flow',
    units: ['L/min', 'L/hr', 'm³/h', 'GPM', 'CFM'],
    defaultUnit: 'L/min',
  },
  'Speed': {
    label: 'Speed',
    units: ['RPM', 'm/s', 'km/h', 'ft/min'],
    defaultUnit: 'RPM',
  },
  'Sound Level': {
    label: 'Sound Level',
    units: ['dB', 'dB(A)', 'dB(C)'],
    defaultUnit: 'dB(A)',
  },
  'Vibration': {
    label: 'Vibration',
    units: ['mm/s', 'm/s²', 'g'],
    defaultUnit: 'mm/s',
  },
  'Conductivity': {
    label: 'Conductivity',
    units: ['µS/cm', 'mS/cm', 'S/m'],
    defaultUnit: 'µS/cm',
  },
  'Lux': {
    label: 'Illuminance (Lux)',
    units: ['lux', 'fc'],
    defaultUnit: 'lux',
  },
  'pH': {
    label: 'pH',
    units: ['pH'],
    defaultUnit: 'pH',
  },
  'Capacitance': {
    label: 'Capacitance',
    units: ['pF', 'nF', 'µF', 'mF'],
    defaultUnit: 'µF',
  },
  'Inductance': {
    label: 'Inductance',
    units: ['µH', 'mH', 'H'],
    defaultUnit: 'mH',
  },
}

const PARAMETER_TYPES = Object.keys(PARAMETER_CONFIG)

interface ParameterCardProps {
  parameter: Parameter
  index: number
  onUpdate: (parameter: Parameter) => void
  onRemove: () => void
  canRemove: boolean
  selectedMasterInstruments: SelectedMasterInstrument[]
  onMasterInstrumentChange: (masterInstrumentId: number | null) => void
}

function ParameterCard({
  parameter,
  index,
  onUpdate,
  onRemove,
  canRemove,
  selectedMasterInstruments,
  onMasterInstrumentChange,
}: ParameterCardProps) {
  const updateField = (field: keyof Parameter, value: string | boolean) => {
    onUpdate({ ...parameter, [field]: value })
  }

  // Get available units based on selected parameter type
  const availableUnits = useMemo(() => {
    const config = PARAMETER_CONFIG[parameter.parameterName]
    return config?.units || []
  }, [parameter.parameterName])

  // Handle parameter type change - also update unit to default
  const handleParameterTypeChange = (paramType: string) => {
    const config = PARAMETER_CONFIG[paramType]
    onUpdate({
      ...parameter,
      parameterName: paramType,
      parameterUnit: config?.defaultUnit || '',
    })
  }

  // Handle binning toggle
  const handleBinningToggle = (enabled: boolean) => {
    if (enabled) {
      // Initialize with 2 bins by default
      const generateId = () => Math.random().toString(36).substring(2, 9)
      onUpdate({
        ...parameter,
        requiresBinning: true,
        bins: [
          { id: generateId(), binMin: '', binMax: '', leastCount: '', accuracy: '' },
          { id: generateId(), binMin: '', binMax: '', leastCount: '', accuracy: '' },
        ],
      })
    } else {
      onUpdate({
        ...parameter,
        requiresBinning: false,
        bins: [],
      })
    }
  }

  // Handle bin count change
  const handleBinCountChange = (count: number) => {
    const generateId = () => Math.random().toString(36).substring(2, 9)
    const currentBins = parameter.bins || []

    if (count > currentBins.length) {
      // Add more bins
      const newBins = [...currentBins]
      for (let i = currentBins.length; i < count; i++) {
        newBins.push({ id: generateId(), binMin: '', binMax: '', leastCount: '', accuracy: '' })
      }
      onUpdate({ ...parameter, bins: newBins })
    } else if (count < currentBins.length && count >= 1) {
      // Remove bins from the end
      onUpdate({ ...parameter, bins: currentBins.slice(0, count) })
    }
  }

  // Handle bin field update
  const updateBin = (binIndex: number, field: keyof ParameterBin, value: string) => {
    const newBins = [...(parameter.bins || [])]
    newBins[binIndex] = { ...newBins[binIndex], [field]: value }
    onUpdate({ ...parameter, bins: newBins })
  }

  // Validate if a bin value is within operating range
  const validateBinValue = (value: string, _type: 'min' | 'max'): { isValid: boolean; message: string | null } => {
    if (!value) return { isValid: true, message: null }

    const numValue = parseFloat(value)
    if (isNaN(numValue)) return { isValid: true, message: null }

    const opMin = parseFloat(parameter.operatingMin)
    const opMax = parseFloat(parameter.operatingMax)

    // If operating range is not defined, skip validation
    if (isNaN(opMin) && isNaN(opMax)) return { isValid: true, message: null }

    if (!isNaN(opMin) && numValue < opMin) {
      return { isValid: false, message: `Below operating min (${parameter.operatingMin})` }
    }

    if (!isNaN(opMax) && numValue > opMax) {
      return { isValid: false, message: `Exceeds operating max (${parameter.operatingMax})` }
    }

    return { isValid: true, message: null }
  }

  // Check if bins have any validation errors
  const getBinValidationErrors = (bin: ParameterBin): { minError: string | null; maxError: string | null } => {
    const minValidation = validateBinValue(bin.binMin, 'min')
    const maxValidation = validateBinValue(bin.binMax, 'max')

    // Also check if binMin > binMax
    const binMin = parseFloat(bin.binMin)
    const binMax = parseFloat(bin.binMax)

    let maxError = maxValidation.message
    if (!isNaN(binMin) && !isNaN(binMax) && binMin > binMax) {
      maxError = 'Max must be greater than Min'
    }

    return {
      minError: minValidation.message,
      maxError: maxError
    }
  }

  // Get the linked master instrument info
  const linkedMasterInstrument = selectedMasterInstruments.find(
    mi => mi.masterInstrumentId === parameter.masterInstrumentId
  )

  // Filter to only show master instruments that have been properly selected (have a masterInstrumentId > 0)
  const availableMasterInstruments = selectedMasterInstruments.filter(
    mi => mi.masterInstrumentId > 0
  )

  // Get the display unit (parameterUnit is the single source of truth)
  const displayUnit = parameter.parameterUnit || ''

  return (
    <div className="bg-section-inner rounded-xl p-5 border border-slate-300">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-xs font-extrabold text-slate-900">
            Parameter {index + 1}: {parameter.parameterName || 'Untitled'}
          </span>
          {displayUnit && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
              {displayUnit}
            </span>
          )}
          {linkedMasterInstrument && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary">
              <Link2 className="size-3" />
              {linkedMasterInstrument.assetNo}
            </span>
          )}
          {parameter.requiresBinning && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700">
              {parameter.bins?.length || 0} Bins
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Requires Binning Toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={parameter.requiresBinning}
              onChange={(e) => handleBinningToggle(e.target.checked)}
              className="w-4 h-4 rounded border-slate-200 text-primary focus:ring-primary"
            />
            <span className="text-[10px] font-bold text-slate-500 uppercase">Requires Binning</span>
          </label>
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="text-red-500 hover:text-red-700 transition-colors"
            >
              <Trash2 className="size-5" />
            </button>
          )}
        </div>
      </div>

      {/* Fields wrapped in white card */}
      <div className="bg-white rounded-xl p-4 border border-slate-200">
        <div className="grid grid-cols-1 gap-6">
          {/* Parameter Type (35%), Unit (20%), and Master Instrument Link (35%) */}
        <div className="grid grid-cols-1 md:grid-cols-[7fr_4fr_7fr] gap-4">
          <div>
            <Label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">
              Parameter Type <span className="text-red-500">*</span>
            </Label>
            <Select
              value={parameter.parameterName || '__select__'}
              onValueChange={(value) => value !== '__select__' && handleParameterTypeChange(value)}
            >
              <SelectTrigger className="rounded-lg border-slate-300 bg-white">
                <SelectValue placeholder="Select parameter type..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__select__" disabled>Select parameter type...</SelectItem>
                {PARAMETER_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {PARAMETER_CONFIG[type].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">
              Unit <span className="text-red-500">*</span>
            </Label>
            <Select
              value={parameter.parameterUnit || '__select__'}
              onValueChange={(value) => value !== '__select__' && updateField('parameterUnit', value)}
              disabled={availableUnits.length === 0}
            >
              <SelectTrigger className="rounded-lg border-slate-300 bg-white disabled:opacity-50">
                <SelectValue placeholder={availableUnits.length === 0 ? "Select parameter first" : "Select unit..."} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__select__" disabled>Select unit...</SelectItem>
                {availableUnits.map((unit) => (
                  <SelectItem key={unit} value={unit}>
                    {unit}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">
              Linked Master Instrument
            </Label>
            <Select
              value={parameter.masterInstrumentId?.toString() || '__none__'}
              onValueChange={(value) => onMasterInstrumentChange(value === '__none__' ? null : parseInt(value, 10))}
            >
              <SelectTrigger className="rounded-lg border-slate-300 bg-white">
                <SelectValue placeholder={
                  availableMasterInstruments.length === 0
                    ? "Select in Section 03 first"
                    : "Select master instrument..."
                } />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {availableMasterInstruments.map((mi) => (
                  <SelectItem key={mi.id} value={mi.masterInstrumentId.toString()}>
                    {mi.assetNo} - {mi.description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Range and Operating Range - Always shown */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Range */}
          <div className="space-y-2">
            <Label className="text-[10px] font-bold text-slate-400 uppercase">
              Range {displayUnit && <span className="text-slate-500">({displayUnit})</span>}
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="text"
                value={parameter.rangeMin}
                onChange={(e) => updateField('rangeMin', e.target.value)}
                placeholder="Min"
                className="w-full rounded-lg border-slate-300 text-xs py-2"
              />
              <span className="text-slate-400 text-xs font-bold shrink-0">to</span>
              <Input
                type="text"
                value={parameter.rangeMax}
                onChange={(e) => updateField('rangeMax', e.target.value)}
                placeholder="Max"
                className="w-full rounded-lg border-slate-300 text-xs py-2"
              />
            </div>
          </div>

          {/* Operating Range */}
          <div className="space-y-2">
            <Label className="text-[10px] font-bold text-slate-400 uppercase">
              Operating Range {displayUnit && <span className="text-slate-500">({displayUnit})</span>}
              {parameter.requiresBinning && <span className="text-blue-500 ml-1">(divided into bins below)</span>}
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="text"
                value={parameter.operatingMin}
                onChange={(e) => updateField('operatingMin', e.target.value)}
                placeholder="Min"
                className="w-full rounded-lg border-slate-300 text-xs py-2"
              />
              <span className="text-slate-400 text-xs font-bold shrink-0">to</span>
              <Input
                type="text"
                value={parameter.operatingMax}
                onChange={(e) => updateField('operatingMax', e.target.value)}
                placeholder="Max"
                className="w-full rounded-lg border-slate-300 text-xs py-2"
              />
            </div>
          </div>
        </div>

        {/* Non-binned: Accuracy Type, Accuracy Value, Least Count */}
        {!parameter.requiresBinning && (
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-[1fr_1fr_1fr] gap-4">
            {/* Accuracy Type */}
            <div className="space-y-2">
              <Label className="text-[10px] font-bold text-slate-400 uppercase">
                Accuracy Type
              </Label>
              <Select
                value={parameter.accuracyType}
                onValueChange={(value) => updateField('accuracyType', value as AccuracyType)}
              >
                <SelectTrigger className="w-full rounded-lg border-slate-300 bg-white text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ACCURACY_TYPE_CONFIG) as AccuracyType[]).map((type) => (
                    <SelectItem key={type} value={type}>
                      <div className="flex flex-col">
                        <span>{ACCURACY_TYPE_CONFIG[type].label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[9px] text-slate-400">
                {ACCURACY_TYPE_CONFIG[parameter.accuracyType]?.description}
              </p>
            </div>

            {/* Accuracy Value */}
            <div className="space-y-2">
              <Label className="text-[10px] font-bold text-slate-400 uppercase">
                Accuracy {parameter.accuracyType === 'ABSOLUTE' && displayUnit ? (
                  <span className="text-slate-500">(± {displayUnit})</span>
                ) : parameter.accuracyType !== 'ABSOLUTE' ? (
                  <span className="text-slate-500">(%)</span>
                ) : null}
              </Label>
              <Input
                type="text"
                value={parameter.accuracyValue}
                onChange={(e) => updateField('accuracyValue', e.target.value)}
                placeholder={parameter.accuracyType === 'ABSOLUTE' ? 'e.g., 0.5' : 'e.g., 1.0'}
                className="w-full rounded-lg border-slate-300 text-xs py-2"
              />
            </div>

            {/* Least Count */}
            <div className="space-y-2">
              <Label className="text-[10px] font-bold text-slate-400 uppercase">
                Decimal Points {displayUnit && <span className="text-slate-500">({displayUnit})</span>}
              </Label>
              <Input
                type="text"
                value={parameter.leastCountValue}
                onChange={(e) => updateField('leastCountValue', e.target.value)}
                placeholder="e.g., 0.1"
                className="w-full rounded-lg border-slate-300 text-xs py-2"
              />
            </div>
          </div>
        )}

        {/* Binned: Number of bins selector, accuracy type, and bins table */}
        {parameter.requiresBinning && (
          <div className="space-y-4">
            {/* Number of bins and Accuracy Type selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Number of bins */}
              <div className="space-y-2">
                <Label className="text-[10px] font-bold text-slate-400 uppercase">
                  Number of Bins
                </Label>
                <Select
                  value={String(parameter.bins?.length || 2)}
                  onValueChange={(value) => handleBinCountChange(parseInt(value, 10))}
                >
                  <SelectTrigger className="w-full rounded-lg border-slate-300 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                      <SelectItem key={num} value={String(num)}>
                        {num}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Accuracy Type */}
              <div className="space-y-2">
                <Label className="text-[10px] font-bold text-slate-400 uppercase">
                  Accuracy Type
                </Label>
                <Select
                  value={parameter.accuracyType}
                  onValueChange={(value) => updateField('accuracyType', value as AccuracyType)}
                >
                  <SelectTrigger className="w-full rounded-lg border-slate-300 bg-white text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ACCURACY_TYPE_CONFIG) as AccuracyType[]).map((type) => (
                      <SelectItem key={type} value={type}>
                        {ACCURACY_TYPE_CONFIG[type].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[9px] text-slate-400">
                  {ACCURACY_TYPE_CONFIG[parameter.accuracyType]?.description}
                </p>
              </div>

              {/* Empty spacer for alignment */}
              <div></div>
            </div>

            {/* Operating range reminder */}
            {(parameter.operatingMin || parameter.operatingMax) && (
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs">
                <span className="text-blue-700 font-medium">
                  Operating Range: {parameter.operatingMin || '—'} to {parameter.operatingMax || '—'} {displayUnit}
                </span>
                <span className="text-blue-500">— All bin ranges must be within this range</span>
              </div>
            )}

            {/* Bins table */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[auto_1fr_1fr_1fr_1fr] gap-2 bg-slate-100 px-3 py-2 text-[10px] font-bold text-slate-500 uppercase">
                <div className="w-12">Bin</div>
                <div>From {displayUnit && `(${displayUnit})`}</div>
                <div>To {displayUnit && `(${displayUnit})`}</div>
                <div>Accuracy {parameter.accuracyType === 'ABSOLUTE' && displayUnit ? `(± ${displayUnit})` : '(%)'}</div>
                <div>Decimal Points {displayUnit && `(${displayUnit})`}</div>
              </div>
              {/* Table rows */}
              {(parameter.bins || []).map((bin, binIndex) => {
                const errors = getBinValidationErrors(bin)
                return (
                  <div
                    key={bin.id}
                    className="grid grid-cols-[auto_1fr_1fr_1fr_1fr] gap-2 px-3 py-2 border-t border-slate-100 items-start"
                  >
                    <div className="w-12 text-xs font-bold text-slate-600 pt-2">#{binIndex + 1}</div>
                    <div className="space-y-1">
                      <Input
                        type="text"
                        value={bin.binMin}
                        onChange={(e) => updateBin(binIndex, 'binMin', e.target.value)}
                        placeholder="Min"
                        className={`rounded-lg text-xs py-1.5 h-8 ${
                          errors.minError
                            ? 'border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-200'
                            : 'border-slate-200'
                        }`}
                      />
                      {errors.minError && (
                        <p className="text-[9px] text-red-500 font-medium">{errors.minError}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Input
                        type="text"
                        value={bin.binMax}
                        onChange={(e) => updateBin(binIndex, 'binMax', e.target.value)}
                        placeholder="Max"
                        className={`rounded-lg text-xs py-1.5 h-8 ${
                          errors.maxError
                            ? 'border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-200'
                            : 'border-slate-200'
                        }`}
                      />
                      {errors.maxError && (
                        <p className="text-[9px] text-red-500 font-medium">{errors.maxError}</p>
                      )}
                    </div>
                    <Input
                      type="text"
                      value={bin.accuracy}
                      onChange={(e) => updateBin(binIndex, 'accuracy', e.target.value)}
                      placeholder="e.g., ±0.5"
                      className="rounded-lg border-slate-300 text-xs py-1.5 h-8"
                    />
                    <Input
                      type="text"
                      value={bin.leastCount}
                      onChange={(e) => updateBin(binIndex, 'leastCount', e.target.value)}
                      placeholder="e.g., 0.1"
                      className="rounded-lg border-slate-300 text-xs py-1.5 h-8"
                    />
                  </div>
                )
              })}
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}

interface UUCSectionProps {
  feedbackSlot?: React.ReactNode
  disabled?: boolean
}

export function UUCSection({ feedbackSlot, disabled }: UUCSectionProps = {}) {
  const { formData, setFormField, setParameter, addParameter, removeParameter, setParameterMasterInstrument, certificateId, saveDraft } = useCertificateStore()

  // Image management hook
  const {
    getUucImages,
    uploadImageWithId,
    deleteImage,
    refreshWithId,
  } = useCertificateImages({ certificateId })

  // Get UUC images as gallery format
  const uucImages: GalleryImage[] = useMemo(() => {
    return getUucImages().map((img) => ({
      id: img.id,
      fileName: img.fileName,
      thumbnailUrl: img.thumbnailUrl,
      optimizedUrl: img.optimizedUrl,
      originalUrl: img.originalUrl,
      caption: img.caption,
      isProcessing: !img.thumbnailUrl && !img.optimizedUrl,
    }))
  }, [getUucImages])

  // Handle UUC image upload - auto-save as draft if needed
  const handleUucImageUpload = useCallback(async (file: File) => {
    let currentCertId = certificateId

    // If certificate hasn't been saved yet, save as draft first
    if (!currentCertId) {
      const result = await saveDraft()
      if (!result.success) {
        throw new Error(result.error || 'Failed to save draft before uploading image')
      }
      // Get the new certificateId from the store
      currentCertId = useCertificateStore.getState().certificateId
      if (!currentCertId) {
        throw new Error('Failed to get certificate ID after saving draft')
      }
    }

    // Upload using the explicit certificate ID
    await uploadImageWithId(currentCertId, file, { imageType: 'UUC' })

    // Refresh images list with the explicit ID
    await refreshWithId(currentCertId)
  }, [certificateId, saveDraft, uploadImageWithId, refreshWithId])

  // Handle UUC image delete
  const handleUucImageDelete = useCallback(async (imageId: string) => {
    await deleteImage(imageId)
  }, [deleteImage])

  return (
    <FormSection
      id="uuc-details"
      sectionNumber="Section 02"
      title="Unit Under Calibration (UUC) Details"
      feedbackSlot={feedbackSlot}
      disabled={disabled}
    >
      <div className="space-y-4 p-5 rounded-xl border border-slate-300 bg-section-inner">
        {/* UUC Details Card */}
        <div className="bg-white rounded-xl p-5 border border-slate-200">
          {/* UUC Basic Info Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
              Description of UUC <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              value={formData.uucDescription}
              onChange={(e) => setFormField('uucDescription', e.target.value)}
              placeholder="e.g., Temp/Humidity Sensor"
              className="w-full rounded-xl border-slate-300 h-12 px-4 focus:ring-primary focus:border-primary font-medium"
            />
          </div>
          <div>
            <Label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
              Make <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              value={formData.uucMake}
              onChange={(e) => setFormField('uucMake', e.target.value)}
              placeholder="e.g., Dwyer"
              className="w-full rounded-xl border-slate-300 h-12 px-4 focus:ring-primary focus:border-primary font-medium"
            />
          </div>
          <div>
            <Label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
              Model <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              value={formData.uucModel}
              onChange={(e) => setFormField('uucModel', e.target.value)}
              placeholder="e.g., RHP-2011"
              className="w-full rounded-xl border-slate-300 h-12 px-4 focus:ring-primary focus:border-primary font-medium"
            />
          </div>
          <div>
            <Label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
              Serial Number <span className="text-red-500">*</span> <span className="normal-case font-normal text-slate-400">(If not found, enter "Not Available")</span>
            </Label>
            <Input
              type="text"
              value={formData.uucSerialNumber}
              onChange={(e) => setFormField('uucSerialNumber', e.target.value)}
              placeholder="e.g., 0010"
              className="w-full rounded-xl border-slate-300 h-12 px-4 focus:ring-primary focus:border-primary font-medium"
            />
          </div>
          <div>
            <Label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
              Instrument ID <span className="text-red-500">*</span> <span className="normal-case font-normal text-slate-400">(If not found, enter "Not Available")</span>
            </Label>
            <Input
              type="text"
              value={formData.uucInstrumentId}
              onChange={(e) => setFormField('uucInstrumentId', e.target.value)}
              placeholder="e.g., VRSF/ENG/HVC020-TRH"
              className="w-full rounded-xl border-slate-300 h-12 px-4 focus:ring-primary focus:border-primary font-medium"
            />
          </div>
          <div>
            <Label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
              Location Name
            </Label>
            <Input
              type="text"
              value={formData.uucLocationName}
              onChange={(e) => setFormField('uucLocationName', e.target.value)}
              placeholder="e.g., Return Air Duct"
              className="w-full rounded-xl border-slate-300 h-12 px-4 focus:ring-primary focus:border-primary font-medium"
            />
          </div>
        </div>

        {/* Machine Name - Full Width */}
        <div>
          <Label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
            Machine Name / Equipment No.
          </Label>
          <Input
            type="text"
            value={formData.uucMachineName}
            onChange={(e) => setFormField('uucMachineName', e.target.value)}
            placeholder="e.g., AHU-30, VRSF-GF-AHU-030"
            className="w-full rounded-xl border-slate-300 h-12 px-4 focus:ring-primary focus:border-primary font-medium"
          />
        </div>

        {/* UUC Device Photos */}
        <div className="pt-6 border-t border-slate-100">
          <div className="flex items-center gap-2 mb-4">
            <Camera className="size-5 text-slate-500" />
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest">
              UUC Device Photos
            </h3>
            <span className="text-xs text-slate-400">(Optional - max 10 photos)</span>
          </div>
          <ImageUploadGallery
            certificateId={certificateId || 'pending'}
            imageType="UUC"
            images={uucImages}
            maxImages={10}
            onUpload={handleUucImageUpload}
            onDelete={handleUucImageDelete}
            disabled={disabled}
          />
        </div>

        {/* Parameters Section */}
        <div className="pt-6 border-t border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest">
              Parameters
            </h3>
            <button
              type="button"
              onClick={addParameter}
              className="text-primary text-xs font-bold flex items-center gap-1 hover:underline"
            >
              <Plus className="size-4" /> Add Parameter
            </button>
          </div>

          <div className="space-y-6">
            {formData.parameters.map((parameter, index) => (
              <ParameterCard
                key={parameter.id}
                parameter={parameter}
                index={index}
                onUpdate={(p) => setParameter(index, p)}
                onRemove={() => removeParameter(index)}
                canRemove={formData.parameters.length > 1}
                selectedMasterInstruments={formData.masterInstruments}
                onMasterInstrumentChange={(id) => setParameterMasterInstrument(index, id)}
              />
            ))}
          </div>
        </div>
        </div>
      </div>
    </FormSection>
  )
}
