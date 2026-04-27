'use client'

import { useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FormSection } from './FormSection'
import { useCertificateStore } from '@/lib/stores/certificate-store'
import { cn } from '@/lib/utils'
import { CheckCircle, AlertTriangle } from 'lucide-react'

// Environmental condition requirements by category
const ENVIRONMENTAL_REQUIREMENTS: Record<string, {
  tempMargin: number
  tempReference: number
  rhMin: number
  rhMax: number
  rhDisplay: string
}> = {
  'Electro-Technical': {
    tempMargin: 4,
    tempReference: 23, // Standard lab temperature
    rhMin: 30,
    rhMax: 75,
    rhDisplay: '30 to 75',
  },
  'Thermal': {
    tempMargin: 4,
    tempReference: 23,
    rhMin: 30,
    rhMax: 75,
    rhDisplay: '30 to 75',
  },
  'Mechanical': {
    tempMargin: 1.5,
    tempReference: 23,
    rhMin: 30,
    rhMax: 75,
    rhDisplay: '30 to 75',
  },
  'Dimensions': {
    tempMargin: 2,
    tempReference: 20, // Standard for dimensional metrology
    rhMin: 40,
    rhMax: 60,
    rhDisplay: '50 ± 10',
  },
}

// Default requirements for categories not listed
const DEFAULT_REQUIREMENTS = {
  tempMargin: 4,
  tempReference: 23,
  rhMin: 30,
  rhMax: 75,
  rhDisplay: '30 to 75',
}

interface EnvironmentalSectionProps {
  feedbackSlot?: React.ReactNode
  disabled?: boolean
  accordionStatus?: 'default' | 'locked' | 'unlocked' | 'pending'
  hasFeedback?: boolean
}

export function EnvironmentalSection({ feedbackSlot, disabled, accordionStatus, hasFeedback }: EnvironmentalSectionProps = {}) {
  const { formData, setFormField } = useCertificateStore()

  // Get unique categories from selected master instruments
  const selectedCategories = useMemo(() => {
    const categories = new Set<string>()
    formData.masterInstruments.forEach(inst => {
      if (inst.category) {
        categories.add(inst.category)
      }
    })
    return Array.from(categories)
  }, [formData.masterInstruments])

  // Determine the most restrictive environmental requirements
  const requirements = useMemo(() => {
    if (selectedCategories.length === 0) {
      return DEFAULT_REQUIREMENTS
    }

    // Find the most restrictive requirements across all selected categories
    let mostRestrictiveTempMargin = Infinity
    let mostRestrictiveTempRef = 23
    let mostRestrictiveRhMin = 0
    let mostRestrictiveRhMax = 100
    let rhDisplay = ''
    let primaryCategory = ''

    selectedCategories.forEach(category => {
      const req = ENVIRONMENTAL_REQUIREMENTS[category] || DEFAULT_REQUIREMENTS

      // Most restrictive = smallest margin
      if (req.tempMargin < mostRestrictiveTempMargin) {
        mostRestrictiveTempMargin = req.tempMargin
        mostRestrictiveTempRef = req.tempReference
        primaryCategory = category
      }

      // Most restrictive humidity = narrowest range
      mostRestrictiveRhMin = Math.max(mostRestrictiveRhMin, req.rhMin)
      mostRestrictiveRhMax = Math.min(mostRestrictiveRhMax, req.rhMax)
    })

    // Get the display string from the most restrictive category
    const primaryReq = ENVIRONMENTAL_REQUIREMENTS[primaryCategory] || DEFAULT_REQUIREMENTS
    rhDisplay = primaryReq.rhDisplay

    // If combined range is from different categories, show calculated range
    if (selectedCategories.length > 1) {
      rhDisplay = `${mostRestrictiveRhMin} to ${mostRestrictiveRhMax}`
    }

    return {
      tempMargin: mostRestrictiveTempMargin === Infinity ? DEFAULT_REQUIREMENTS.tempMargin : mostRestrictiveTempMargin,
      tempReference: mostRestrictiveTempRef,
      rhMin: mostRestrictiveRhMin,
      rhMax: mostRestrictiveRhMax,
      rhDisplay,
    }
  }, [selectedCategories])

  // Validate temperature
  const tempValidation = useMemo(() => {
    const temp = parseFloat(formData.ambientTemperature)
    if (isNaN(temp) || !formData.ambientTemperature) {
      return { isValid: null, message: '' }
    }

    const minTemp = requirements.tempReference - requirements.tempMargin
    const maxTemp = requirements.tempReference + requirements.tempMargin
    const isValid = temp >= minTemp && temp <= maxTemp

    return {
      isValid,
      message: isValid
        ? 'Within acceptable range'
        : `Outside range (${minTemp}°C to ${maxTemp}°C)`,
    }
  }, [formData.ambientTemperature, requirements])

  // Validate humidity
  const rhValidation = useMemo(() => {
    const rh = parseFloat(formData.relativeHumidity)
    if (isNaN(rh) || !formData.relativeHumidity) {
      return { isValid: null, message: '' }
    }

    const isValid = rh >= requirements.rhMin && rh <= requirements.rhMax

    return {
      isValid,
      message: isValid
        ? 'Within acceptable range'
        : `Outside range (${requirements.rhMin}% to ${requirements.rhMax}%)`,
    }
  }, [formData.relativeHumidity, requirements])

  return (
    <FormSection
      id="environment"
      sectionNumber="Section 04"
      title="Environmental Conditions"
      feedbackSlot={feedbackSlot}
      disabled={disabled}
      accordionStatus={accordionStatus}
      hasFeedback={hasFeedback}
    >
      <div className="space-y-4 p-5 rounded-xl border border-slate-300 bg-section-inner">
        {/* Category-based requirements info */}
        {selectedCategories.length > 0 && (
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
            <p className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-2">
              Requirements based on selected instrument categories
            </p>
            <div className="flex flex-wrap gap-2">
              {selectedCategories.map(cat => (
                <span
                  key={cat}
                  className="px-2.5 py-1 bg-blue-100 text-blue-800 text-xs font-bold rounded-full"
                >
                  {cat}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Ambient Temperature */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200">
            <Label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              Ambient Temperature <span className="text-red-500">*</span>
            </Label>
            <div className="flex items-center gap-3 mb-3">
              <Input
                type="number"
                step="0.1"
                value={formData.ambientTemperature}
                onChange={(e) => setFormField('ambientTemperature', e.target.value)}
                placeholder={requirements.tempReference.toString()}
                className={cn(
                  "w-32 rounded-xl border-slate-300 h-12 px-4 focus:ring-primary focus:border-primary font-bold text-center",
                  tempValidation.isValid === false && "border-red-300 bg-red-50"
                )}
              />
              <span className="text-slate-500 font-bold">°C</span>
            </div>

            {/* Acceptable range display */}
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-slate-500">
                Acceptable: <span className="font-bold">{requirements.tempReference} ± {requirements.tempMargin}°C</span>
                <span className="text-slate-400 ml-1">
                  ({requirements.tempReference - requirements.tempMargin} to {requirements.tempReference + requirements.tempMargin}°C)
                </span>
              </p>
              {tempValidation.isValid !== null && (
                <div className={cn(
                  "flex items-center gap-1 text-[10px] font-bold",
                  tempValidation.isValid ? "text-green-600" : "text-red-600"
                )}>
                  {tempValidation.isValid ? (
                    <CheckCircle className="size-3.5" />
                  ) : (
                    <AlertTriangle className="size-3.5" />
                  )}
                  {tempValidation.isValid ? 'OK' : 'Out of range'}
                </div>
              )}
            </div>
          </div>

          {/* Relative Humidity */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200">
            <Label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              Relative Humidity <span className="text-red-500">*</span>
            </Label>
            <div className="flex items-center gap-3 mb-3">
              <Input
                type="number"
                step="0.1"
                value={formData.relativeHumidity}
                onChange={(e) => setFormField('relativeHumidity', e.target.value)}
                placeholder="50"
                className={cn(
                  "w-32 rounded-xl border-slate-300 h-12 px-4 focus:ring-primary focus:border-primary font-bold text-center",
                  rhValidation.isValid === false && "border-red-300 bg-red-50"
                )}
              />
              <span className="text-slate-500 font-bold">%RH</span>
            </div>

            {/* Acceptable range display */}
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-slate-500">
                Acceptable: <span className="font-bold">{requirements.rhDisplay} %RH</span>
              </p>
              {rhValidation.isValid !== null && (
                <div className={cn(
                  "flex items-center gap-1 text-[10px] font-bold",
                  rhValidation.isValid ? "text-green-600" : "text-red-600"
                )}>
                  {rhValidation.isValid ? (
                    <CheckCircle className="size-3.5" />
                  ) : (
                    <AlertTriangle className="size-3.5" />
                  )}
                  {rhValidation.isValid ? 'OK' : 'Out of range'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Warning if no instruments selected */}
        {selectedCategories.length === 0 && (
          <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-4 py-2 border border-amber-100">
            Select master instruments in Section 03 to see category-specific environmental requirements.
          </p>
        )}
      </div>
    </FormSection>
  )
}
