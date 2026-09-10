'use client'

import { useMemo, useCallback, useEffect } from 'react'
import { Plus, Trash2, Link2, Camera } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useParameterStore } from '@/lib/stores/parameter-store'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  defaultKindFor,
  defaultUnitForParameter,
  findParameter,
  kindsFor,
  measurandsOf,
  standardFor,
  unitsForParameter,
} from '@/lib/parameter-mapping'
import { numberProblem, rangeProblem } from '@/lib/parameter-validation'
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
}

function ParameterCard({
  parameter,
  index,
  onUpdate,
  onRemove,
  canRemove,
  selectedMasterInstruments,
}: ParameterCardProps) {
  const updateField = (field: keyof Parameter, value: string | boolean) => {
    onUpdate({ ...parameter, [field]: value })
  }

  /**
   * What this lab calls each parameter, seeded from the master registry.
   *
   * PARAMETER_CONFIG stays as the fallback rather than being deleted: it is what the
   * form runs on before the list arrives, and if the list never arrives an engineer
   * can still fill in a certificate. Losing the dropdown is a nuisance; losing the
   * form is not something to risk on a fetch.
   */
  const { parameters: labParameters } = useParameterStore()

  /**
   * The parameter as three questions rather than one list of fifty-two.
   *
   * Twenty-five of those fifty-two are near-twins - Pressure against Gauge Pressure
   * against Vacuum, DC Voltage against AC Voltage - and choosing between them decides
   * which masters are offered. As a flat list that choice was something an engineer
   * fell into; asked in order it is something they answer.
   *
   * The kind is only asked where there is more than one, and the curve only where the
   * chosen kind records any - the same rule as the master declaration.
   */
  const measurands = useMemo(() => measurandsOf(labParameters), [labParameters])

  /** The parameter this certificate names, where the lab's list knows it. */
  const selected = useMemo(
    () => findParameter(parameter.parameterName, labParameters),
    [parameter.parameterName, labParameters],
  )

  const kinds = useMemo(
    () => (selected ? kindsFor(selected.measures, labParameters) : []),
    [selected, labParameters],
  )

  const curves = selected?.subtypes ?? []

  /**
   * The identity fields share the width between however many of them there are.
   *
   * Kind appears only for a measurand with siblings, and sensor type only where that
   * kind records curves, so the row is two fields wide, three, or four - and a fixed
   * three-column grid would leave a hole in two of those three cases.
   */
  const identityFieldCount = 2 + (kinds.length > 1 ? 1 : 0) + (curves.length > 0 ? 1 : 0)
  const identityColumns =
    identityFieldCount === 4
      ? 'md:grid-cols-4'
      : identityFieldCount === 3
        ? 'md:grid-cols-3'
        : 'md:grid-cols-2'

  const chooseMeasurand = (measures: string) => {
    const next = defaultKindFor(measures, labParameters)
    if (!next) return
    onUpdate({
      ...parameter,
      parameterName: next.customName,
      parameterUnit: next.defaultUnit ?? '',
      // The old curve belongs to the old parameter.
      parameterSubtype: undefined,
    })
  }

  const chooseKind = (kind: string) => {
    if (!selected) return
    const next = standardFor(selected.measures, kind, labParameters)
    if (!next) return
    onUpdate({
      ...parameter,
      parameterName: next.customName,
      // Keep the unit where the new kind still offers it - °C is °C whether the
      // sensor is an RTD or a thermocouple.
      parameterUnit: next.units.includes(parameter.parameterUnit)
        ? parameter.parameterUnit
        : (next.defaultUnit ?? ''),
      parameterSubtype: undefined,
    })
  }

  /**
   * The units on offer for the parameter as written on this certificate.
   *
   * Matched through the lab's name, the standard name or an alias, so a certificate
   * saved as "Voltage DC" still finds the units of "DC Voltage". Falls back to the old
   * hardcoded table, and then to the unit already saved - which matters for a
   * parameter nobody recognises: the engineer typed it once and should not have it
   * taken away.
   */
  const availableUnits = useMemo(
    () =>
      unitsForParameter(
        parameter.parameterName,
        parameter.parameterUnit,
        labParameters,
        PARAMETER_CONFIG,
      ),
    [parameter.parameterName, parameter.parameterUnit, labParameters],
  )

  // Handle parameter type change - also update unit to default
  const handleParameterTypeChange = (paramType: string) => {
    onUpdate({
      ...parameter,
      parameterName: paramType,
      parameterUnit: defaultUnitForParameter(paramType, labParameters, PARAMETER_CONFIG),
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

  // Shown under a field the certificate cannot compute with. Deliberately quiet -
  // one line, no icon: it is a typo to correct, not a failure to dwell on.
  const FieldProblem = ({ problem }: { problem: string | null }) =>
    problem ? <p className="text-[10px] text-red-500 font-medium">{problem}</p> : null

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
    // Whether it is a number at all comes first: "O" for zero reads as a value in the
    // operating range check, because parseFloat gives up on it silently.
    const minError =
      numberProblem(bin.binMin, 'range') ?? validateBinValue(bin.binMin, 'min').message
    const maxError =
      numberProblem(bin.binMax, 'range')
      ?? rangeProblem(bin.binMin, bin.binMax)
      ?? validateBinValue(bin.binMax, 'max').message

    return { minError, maxError }
  }

  // Get the linked master instrument info
  const linkedMasterInstrument = selectedMasterInstruments.find(
    mi => mi.masterInstrumentId === parameter.masterInstrumentId
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
          {/* Parameter Group (35%), Unit (20%), and Master Instrument Link (35%) */}
        <div className={cn('grid grid-cols-1 gap-4', identityColumns)}>
          <div>
            <Label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">
              Parameter Group <span className="text-red-500">*</span>
            </Label>
            {labParameters.length === 0 ? (
              // Before the lab's list arrives, the table the form shipped with. A slow
              // fetch must not cost an engineer the ability to fill in a certificate.
              <Select
                value={parameter.parameterName || '__select__'}
                onValueChange={(value) =>
                  value !== '__select__' && handleParameterTypeChange(value)
                }
              >
                <SelectTrigger className="w-full h-9 rounded-lg border-slate-300 bg-white">
                  <SelectValue placeholder="Select parameter type..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__select__" disabled>
                    Select parameter type...
                  </SelectItem>
                  {PARAMETER_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {PARAMETER_CONFIG[type].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <SearchableSelect
                value={selected?.measures ?? parameter.parameterName ?? ''}
                onChange={chooseMeasurand}
                placeholder="Select parameter..."
                className="h-9 rounded-lg"
                options={[
                  // A parameter written before this list existed, or since renamed
                  // away, is kept so the certificate still reads as it was written.
                  ...(parameter.parameterName && !selected
                    ? [
                        {
                          value: parameter.parameterName,
                          label: parameter.parameterName,
                          detail: 'not in this lab\u2019s list',
                          pinned: true,
                        },
                      ]
                    : []),
                  ...measurands.map((m) => ({
                    value: m.measures,
                    label: m.label,
                    detail: m.category,
                  })),
                ]}
              />
            )}
          </div>
          {/* Which parameter within the group, asked only where the group has more
              than one. Choosing between Pressure and Gauge Pressure decides which
              masters are offered, so it is asked rather than fallen into.

              The two fields are called Parameter Group and Parameter on screen; in the
              code the first is the measurand and the second its kind, which is what the
              standards table stores. */}
          {kinds.length > 1 && (
            <div>
              <Label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">
                Parameter <span className="text-red-500">*</span>
              </Label>
              <Select
                value={selected?.kind ?? '__select__'}
                onValueChange={(value) => value !== '__select__' && chooseKind(value)}
              >
                <SelectTrigger className="w-full h-9 rounded-lg border-slate-300 bg-white h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {kinds.map((k) => (
                    <SelectItem key={k.id} value={k.kind}>
                      {k.customName}
                      {k.kind === 'any' && (
                        <span className="text-slate-400"> &mdash; not specified</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* The curve, asked only where the chosen kind records any. */}
          {curves.length > 0 && (
            <div>
              <Label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">
                Sensor type
              </Label>
              <Select
                value={parameter.parameterSubtype || '__none__'}
                onValueChange={(value) =>
                  updateField('parameterSubtype', value === '__none__' ? '' : value)
                }
              >
                <SelectTrigger className="w-full h-9 rounded-lg border-slate-300 bg-white h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Not stated</SelectItem>
                  {curves.map((curve) => (
                    <SelectItem key={curve} value={curve}>
                      {curve}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">
              Unit <span className="text-red-500">*</span>
            </Label>
            <Select
              value={parameter.parameterUnit || '__select__'}
              onValueChange={(value) => value !== '__select__' && updateField('parameterUnit', value)}
              disabled={availableUnits.length === 0}
            >
              <SelectTrigger className="w-full h-9 rounded-lg border-slate-300 bg-white disabled:opacity-50">
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
                aria-invalid={numberProblem(parameter.rangeMin, 'range') !== null}
                placeholder="Min"
                className={cn(
                  'w-full rounded-lg text-xs py-2',
                  numberProblem(parameter.rangeMin, 'range') ? 'border-red-400' : 'border-slate-300',
                )}
              />
              <span className="text-slate-400 text-xs font-bold shrink-0">to</span>
              <Input
                type="text"
                value={parameter.rangeMax}
                onChange={(e) => updateField('rangeMax', e.target.value)}
                aria-invalid={
                  numberProblem(parameter.rangeMax, 'range') !== null ||
                  rangeProblem(parameter.rangeMin, parameter.rangeMax) !== null
                }
                placeholder="Max"
                className={cn(
                  'w-full rounded-lg text-xs py-2',
                  numberProblem(parameter.rangeMax, 'range') ||
                    rangeProblem(parameter.rangeMin, parameter.rangeMax)
                    ? 'border-red-400'
                    : 'border-slate-300',
                )}
              />
            </div>
            {/* One line for the pair: two complaints about one range is noise. */}
            <FieldProblem
              problem={
                numberProblem(parameter.rangeMin, 'range') ??
                numberProblem(parameter.rangeMax, 'range') ??
                rangeProblem(parameter.rangeMin, parameter.rangeMax)
              }
            />
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
                value={parameter.operatingRangeNotApplicable ? '' : parameter.operatingMin}
                onChange={(e) => updateField('operatingMin', e.target.value)}
                disabled={parameter.operatingRangeNotApplicable}
                placeholder={parameter.operatingRangeNotApplicable ? 'N/A' : 'Min'}
                className="w-full rounded-lg border-slate-300 text-xs py-2 disabled:bg-slate-50 disabled:text-slate-400"
              />
              <span className="text-slate-400 text-xs font-bold shrink-0">to</span>
              <Input
                type="text"
                value={parameter.operatingRangeNotApplicable ? '' : parameter.operatingMax}
                onChange={(e) => updateField('operatingMax', e.target.value)}
                disabled={parameter.operatingRangeNotApplicable}
                placeholder={parameter.operatingRangeNotApplicable ? 'N/A' : 'Max'}
                className="w-full rounded-lg border-slate-300 text-xs py-2 disabled:bg-slate-50 disabled:text-slate-400"
              />
            </div>
            <NotApplicable
              checked={parameter.operatingRangeNotApplicable ?? false}
              onChange={(v) => updateField('operatingRangeNotApplicable', v)}
            />
            {parameter.operatingRangeNotApplicable && (
              /* The rule this choice carries, said where the choice is made. The range
                 being calibrated stands in for the operating one, and a certificate
                 that covers a span nothing was read at says nothing about it. */
              <p className="text-[10px] text-slate-500">
                At least one calibration point must fall within{' '}
                <b className="text-slate-600">
                  {parameter.rangeMin || '—'} to {parameter.rangeMax || '—'} {displayUnit}
                </b>
                , the range being calibrated. Checked in Section 05.
              </p>
            )}
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
                <SelectTrigger className="w-full h-9 rounded-lg border-slate-300 bg-white text-xs">
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
                aria-invalid={numberProblem(parameter.accuracyValue, 'accuracy') !== null}
                className={cn(
                  'w-full rounded-lg text-xs py-2',
                  numberProblem(parameter.accuracyValue, 'accuracy')
                    ? 'border-red-400'
                    : 'border-slate-300',
                )}
              />
              <FieldProblem problem={numberProblem(parameter.accuracyValue, 'accuracy')} />
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
                aria-invalid={numberProblem(parameter.leastCountValue, 'least count') !== null}
                className={cn(
                  'w-full rounded-lg text-xs py-2',
                  numberProblem(parameter.leastCountValue, 'least count')
                    ? 'border-red-400'
                    : 'border-slate-300',
                )}
              />
              <FieldProblem problem={numberProblem(parameter.leastCountValue, 'least count')} />
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
                  <SelectTrigger className="w-full h-9 rounded-lg border-slate-300 bg-white">
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
                  <SelectTrigger className="w-full h-9 rounded-lg border-slate-300 bg-white text-xs">
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

            {/* Bins table
                Built like Section 05's results table, so the two read as one system:
                a real table rather than two grids that can drift apart, the field name
                over its unit, row numbers in tabular figures, and one rule between rows.

                What it does not borrow is that table's red row. There, red means a
                reading failed its accuracy limit - a verdict on measured data. Here
                nothing passes or fails; the bins are being declared. The only thing
                that can be wrong is an entry, and that is said on the field it is
                wrong on. */}
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-section-inner">
                    {/* One row, unit inline. Five short columns do not need the second
                        header row the results table uses for its field names. */}
                    <tr>
                      <th className="w-12 px-4 py-1.5 text-left text-xs font-semibold text-slate-700">
                        Sl.
                      </th>
                      {[
                        ['From', displayUnit],
                        ['To', displayUnit],
                        [
                          'Accuracy',
                          parameter.accuracyType === 'ABSOLUTE' ? `± ${displayUnit}` : '%',
                        ],
                        ['Decimal Points', displayUnit],
                      ].map(([heading, unit]) => (
                        <th
                          key={heading}
                          className="px-3 py-1.5 text-left text-xs font-semibold text-slate-700"
                        >
                          {heading}
                          {unit && <span className="font-normal text-slate-500"> ({unit})</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 bg-white">
                    {(parameter.bins || []).map((bin, binIndex) => {
                      const errors = getBinValidationErrors(bin)
                      return (
                        <tr key={bin.id} className="transition-colors hover:bg-slate-50/70">
                          <td className="px-4 py-2 align-top text-xs tabular-nums text-slate-400">
                            {String(binIndex + 1).padStart(2, '0')}
                          </td>
                          <td className="px-3 py-2 align-top">
                            <Input
                              type="text"
                              value={bin.binMin}
                              onChange={(e) => updateBin(binIndex, 'binMin', e.target.value)}
                              placeholder="Min"
                              aria-invalid={errors.minError !== null}
                              className={cn(
                                'h-8 rounded-lg py-1.5 text-xs tabular-nums',
                                errors.minError
                                  ? 'border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-200'
                                  : 'border-slate-200',
                              )}
                            />
                            {errors.minError && (
                              <p className="mt-1 text-[10px] font-medium text-red-600">
                                {errors.minError}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2 align-top">
                            <Input
                              type="text"
                              value={bin.binMax}
                              onChange={(e) => updateBin(binIndex, 'binMax', e.target.value)}
                              placeholder="Max"
                              aria-invalid={errors.maxError !== null}
                              className={cn(
                                'h-8 rounded-lg py-1.5 text-xs tabular-nums',
                                errors.maxError
                                  ? 'border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-200'
                                  : 'border-slate-200',
                              )}
                            />
                            {errors.maxError && (
                              <p className="mt-1 text-[10px] font-medium text-red-600">
                                {errors.maxError}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2 align-top">
                            <Input
                              type="text"
                              value={bin.accuracy}
                              onChange={(e) => updateBin(binIndex, 'accuracy', e.target.value)}
                              placeholder="e.g., 0.5"
                              className="h-8 rounded-lg border-slate-200 py-1.5 text-xs tabular-nums"
                            />
                          </td>
                          <td className="px-3 py-2 align-top">
                            <Input
                              type="text"
                              value={bin.leastCount}
                              onChange={(e) => updateBin(binIndex, 'leastCount', e.target.value)}
                              placeholder="e.g., 0.1"
                              className="h-8 rounded-lg border-slate-200 py-1.5 text-xs tabular-nums"
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
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
  accordionStatus?: 'default' | 'locked' | 'unlocked' | 'pending'
  hasFeedback?: boolean
}

/**
 * "Not applicable", for a field the unit under test genuinely does not have.
 *
 * A bare sensor has no serial number of its own; a fixture built in house has no
 * instrument id. Typing "Not Available" into the box - which the label used to ask for
 * - puts a sentence where a serial belongs and leaves the certificate unable to tell
 * an absent number from an unfinished form. This says which it is.
 */
function NotApplicable({
  checked,
  onChange,
  disabled,
  label = 'Not applicable',
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
}) {
  return (
    <label className="mt-1.5 flex cursor-pointer items-center gap-1.5">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-3.5 rounded border-slate-300 text-primary focus:ring-primary disabled:cursor-not-allowed"
      />
      <span className="text-[10px] font-medium text-slate-500">{label}</span>
    </label>
  )
}

export function UUCSection({ feedbackSlot, disabled, accordionStatus, hasFeedback }: UUCSectionProps = {}) {
  const { formData, setFormField, setParameter, addParameter, removeParameter, setParameterMasterInstrument, certificateId, saveDraft } = useCertificateStore()

  // The names this lab uses for what it calibrates. Asked for once; the store shares
  // one request between everything on the page that wants it.
  const loadParameters = useParameterStore((state) => state.load)
  useEffect(() => {
    void loadParameters()
  }, [loadParameters])

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
      accordionStatus={accordionStatus}
      hasFeedback={hasFeedback}
    >
      <div className="space-y-4 p-5 rounded-xl border border-slate-300 bg-section-inner">
        {/* UUC Details Card */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 space-y-6">
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
              className="w-full rounded-xl border-slate-300 h-9 text-xs px-3 focus:ring-primary focus:border-primary"
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
              className="w-full rounded-xl border-slate-300 h-9 text-xs px-3 focus:ring-primary focus:border-primary"
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
              className="w-full rounded-xl border-slate-300 h-9 text-xs px-3 focus:ring-primary focus:border-primary"
            />
          </div>
          <div>
            <Label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
              Serial Number <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              value={formData.uucSerialNumberNotApplicable ? '' : formData.uucSerialNumber}
              onChange={(e) => setFormField('uucSerialNumber', e.target.value)}
              disabled={disabled || formData.uucSerialNumberNotApplicable}
              placeholder={formData.uucSerialNumberNotApplicable ? 'Not Applicable' : 'e.g., 0010'}
              className="w-full rounded-xl border-slate-300 h-9 text-xs px-3 focus:ring-primary focus:border-primary disabled:bg-slate-50 disabled:text-slate-400"
            />
            <NotApplicable
              checked={formData.uucSerialNumberNotApplicable ?? false}
              disabled={disabled}
              onChange={(v) => setFormField('uucSerialNumberNotApplicable', v)}
            />
          </div>
          <div>
            <Label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
              Instrument ID <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              value={formData.uucInstrumentIdNotApplicable ? '' : formData.uucInstrumentId}
              onChange={(e) => setFormField('uucInstrumentId', e.target.value)}
              disabled={disabled || formData.uucInstrumentIdNotApplicable}
              placeholder={
                formData.uucInstrumentIdNotApplicable ? 'Not Applicable' : 'e.g., VRSF/ENG/HVC020-TRH'
              }
              className="w-full rounded-xl border-slate-300 h-9 text-xs px-3 focus:ring-primary focus:border-primary disabled:bg-slate-50 disabled:text-slate-400"
            />
            <NotApplicable
              checked={formData.uucInstrumentIdNotApplicable ?? false}
              disabled={disabled}
              onChange={(v) => setFormField('uucInstrumentIdNotApplicable', v)}
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
              className="w-full rounded-xl border-slate-300 h-9 text-xs px-3 focus:ring-primary focus:border-primary"
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
            className="w-full rounded-xl border-slate-300 h-9 text-xs px-3 focus:ring-primary focus:border-primary"
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
              />
            ))}
          </div>
        </div>
        </div>
      </div>
    </FormSection>
  )
}
