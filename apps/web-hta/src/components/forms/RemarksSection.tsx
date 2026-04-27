'use client'

import { Info } from 'lucide-react'
import { Textarea as _Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { FormSection } from './FormSection'
import { useCertificateStore } from '@/lib/stores/certificate-store'
import { cn } from '@/lib/utils'

export const CALIBRATION_STATUS_OPTIONS = [
  { id: 'satisfied', label: 'Satisfied - Results within accuracy limits' },
  { id: 'dissatisfied', label: 'Dissatisfied - Results NOT within accuracy limits' },
  { id: 'not_working', label: 'Not Working - Device non-functional' },
  { id: 'out_of_accuracy', label: '(*) Indicated calibration points are out of accuracy' },
  { id: 'physical_damage', label: 'Not working due to physical damage' },
  { id: 'circuitry_problem', label: 'Not working due to internal circuitry problem' },
]

const STICKER_OPTIONS = [
  { value: 'yes', label: 'Yes', colorClass: 'sticker-label-yes' },
  { value: 'no', label: 'No', colorClass: 'sticker-label-no' },
] as const

interface RemarksSectionProps {
  feedbackSlot?: React.ReactNode
  disabled?: boolean
  accordionStatus?: 'default' | 'locked' | 'unlocked' | 'pending'
  hasFeedback?: boolean
}

export function RemarksSection({ feedbackSlot, disabled, accordionStatus, hasFeedback }: RemarksSectionProps = {}) {
  const { formData, setFormField, toggleCalibrationStatus } = useCertificateStore()

  // Calculate out of limit count from all parameters
  const outOfLimitCount = formData.parameters.reduce((acc, param) => {
    return acc + param.results.filter((r) => r.isOutOfLimit).length
  }, 0)

  const totalPoints = formData.parameters.reduce((acc, param) => {
    return acc + param.results.length
  }, 0)

  // Generate system recommendation
  const getRecommendation = () => {
    if (outOfLimitCount === 0 && totalPoints > 0) {
      return {
        text: 'All points within accuracy limits.',
        suggestion: 'Suggested: Satisfied',
      }
    } else if (outOfLimitCount > 0) {
      return {
        text: `${outOfLimitCount} out of ${totalPoints} points exceeded accuracy limits.`,
        suggestion: 'Suggested: Dissatisfied + (*) Indicated cal. points out of acc.',
      }
    }
    return null
  }

  const recommendation = getRecommendation()

  return (
    <FormSection
      id="remarks"
      sectionNumber="Section 06"
      title="Remarks & Status"
      feedbackSlot={feedbackSlot}
      disabled={disabled}
      accordionStatus={accordionStatus}
      hasFeedback={hasFeedback}
    >
      <div className="space-y-4 p-5 rounded-xl border border-slate-300 bg-section-inner">
        {/* System Recommendation */}
        {recommendation && (
          <div className="bg-blue-50 rounded-2xl p-6 border border-blue-100 flex items-start gap-4">
            <Info className="size-5 text-blue-600 mt-0.5" />
            <div>
              <p className="text-[10px] font-extrabold text-blue-700 uppercase tracking-widest">
                System Recommendation
              </p>
              <p className="text-sm font-bold text-slate-800 mt-1">{recommendation.text}</p>
              <p className="text-xs text-blue-600 font-semibold mt-0.5">
                {recommendation.suggestion}
              </p>
            </div>
          </div>
        )}

        {/* Calibration Status */}
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <Label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-4">
            Calibration Status (check all that apply)
          </Label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {CALIBRATION_STATUS_OPTIONS.map((option) => {
              const isChecked = formData.calibrationStatus.includes(option.id)
              return (
                <label
                  key={option.id}
                  className={cn(
                    'flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all',
                    isChecked
                      ? 'border-primary/20 bg-primary/5'
                      : 'border-slate-300 bg-slate-50 hover:bg-slate-100'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleCalibrationStatus(option.id)}
                    className="rounded border-slate-300 text-primary focus:ring-primary size-4"
                  />
                  <span
                    className={cn(
                      'text-sm font-semibold',
                      isChecked ? 'text-primary font-bold' : 'text-slate-700'
                    )}
                  >
                    {option.label}
                  </span>
                </label>
              )
            })}
          </div>
        </div>

        {/* Sticker Status */}
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <Label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-4">
            Sticker Status (internal tracking)
          </Label>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Removed Older Sticker */}
            <div className="space-y-4">
              <p className="text-xs font-bold text-slate-600">Removed Older Sticker:</p>
              <div className="flex gap-2">
                {STICKER_OPTIONS.map((option) => (
                  <label key={option.value} className="flex-1 cursor-pointer">
                    <input
                      type="radio"
                      name="stickerOldRemoved"
                      value={option.value}
                      checked={formData.stickerOldRemoved === option.value}
                      onChange={() => setFormField('stickerOldRemoved', option.value)}
                      className="sr-only sticker-radio-btn"
                    />
                    <div
                      className={cn(
                        'py-3 px-4 rounded-xl border-2 bg-white text-center font-bold text-sm transition-all shadow-sm',
                        formData.stickerOldRemoved === option.value
                          ? option.value === 'yes'
                            ? 'border-green-500 bg-green-100 text-green-700'
                            : option.value === 'no'
                            ? 'border-red-500 bg-red-100 text-red-700'
                            : 'border-slate-300 bg-slate-200 text-slate-700'
                          : 'border-slate-300'
                      )}
                    >
                      {option.label}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Affixed New Sticker */}
            <div className="space-y-4">
              <p className="text-xs font-bold text-slate-600">Affixed New Sticker:</p>
              <div className="flex gap-2">
                {STICKER_OPTIONS.map((option) => (
                  <label key={option.value} className="flex-1 cursor-pointer">
                    <input
                      type="radio"
                      name="stickerNewAffixed"
                      value={option.value}
                      checked={formData.stickerNewAffixed === option.value}
                      onChange={() => setFormField('stickerNewAffixed', option.value)}
                      className="sr-only sticker-radio-btn"
                    />
                    <div
                      className={cn(
                        'py-3 px-4 rounded-xl border-2 bg-white text-center font-bold text-sm transition-all shadow-sm',
                        formData.stickerNewAffixed === option.value
                          ? option.value === 'yes'
                            ? 'border-green-500 bg-green-100 text-green-700'
                            : option.value === 'no'
                            ? 'border-red-500 bg-red-100 text-red-700'
                            : 'border-slate-300 bg-slate-200 text-slate-700'
                          : 'border-slate-300'
                      )}
                    >
                      {option.label}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

      </div>
    </FormSection>
  )
}
