'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect, useCallback } from 'react'
import { FlaskConical, Factory, Calendar, AlertTriangle, CheckCircle2, Loader2, FileText, UserCheck } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DatePicker } from '@/components/ui/date-picker'
import { FormSection } from './FormSection'
import { ReviewerSelect } from './ReviewerSelect'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DATE_FORMATS,
  DEFAULT_DATE_FORMAT,
  formatCertificateDate,
} from '@/lib/certificate-date-format'
import { CustomerAutocomplete } from './CustomerAutocomplete'
import { useCertificateStore } from '@/lib/stores/certificate-store'
import { cn } from '@/lib/utils'
import { formatCalibrationHours, formatCalibrationTimeRange } from '@/lib/utils/calibration-time'

/**
 * How long a calibration holds.
 *
 * Four fixed buttons - 3, 6, 9, 12 months - could not say eighteen months or two
 * years, both of which this lab issues. A count and a unit can say all of them, and
 * "not applicable" belongs in the same list because it is the same question answered
 * with "it does not expire".
 *
 * Stored in months whatever is chosen, so the due date stays one sum and every
 * certificate already written still adds up.
 */
const TENURE_COUNTS = Array.from({ length: 12 }, (_, i) => i + 1)
const NOT_APPLICABLE = 'na'

const monthsFor = (count: number, unit: 'months' | 'years') =>
  unit === 'years' ? count * 12 : count

const countFor = (months: number, unit: 'months' | 'years') =>
  unit === 'years' ? Math.max(1, Math.round(months / 12)) : Math.max(1, months)

interface SummarySectionProps {
  isNewCertificate?: boolean
  certificateId?: string
  reviewerName?: string | null
  feedbackSlot?: React.ReactNode
  disabled?: boolean
  accordionStatus?: 'default' | 'locked' | 'unlocked' | 'pending'
  hasFeedback?: boolean
}

export function SummarySection({ isNewCertificate = true, certificateId, reviewerName, feedbackSlot, disabled, accordionStatus, hasFeedback }: SummarySectionProps) {
  const { formData, setFormField } = useCertificateStore()
  const [isCheckingNumber, setIsCheckingNumber] = useState(false)
  const [numberExists, setNumberExists] = useState<boolean | null>(null)
  const [lastCheckedNumber, setLastCheckedNumber] = useState('')

  // Debounced certificate number check
  const checkCertificateNumber = useCallback(async (number: string) => {
    if (!number || number.length < 3) {
      setNumberExists(null)
      return
    }

    setIsCheckingNumber(true)
    try {
      const params = new URLSearchParams({ number })
      if (certificateId) {
        params.append('excludeId', certificateId)
      }

      const response = await apiFetch(`/api/certificates/check-number?${params}`)
      if (response.ok) {
        const data = await response.json()
        setNumberExists(data.exists)
        setLastCheckedNumber(number)
      }
    } catch (error) {
      console.error('Error checking certificate number:', error)
    } finally {
      setIsCheckingNumber(false)
    }
  }, [certificateId])

  // Debounce effect for certificate number validation
  useEffect(() => {
    if (!isNewCertificate) return

    const certNumber = formData.certificateNumber
    if (certNumber === lastCheckedNumber) return

    const timer = setTimeout(() => {
      checkCertificateNumber(certNumber)
    }, 500) // 500ms debounce

    return () => clearTimeout(timer)
  }, [formData.certificateNumber, isNewCertificate, checkCertificateNumber, lastCheckedNumber])

  // Get today's date in YYYY-MM-DD format for min date validation
  const _today = new Date().toISOString().split('T')[0]

  // Format the due date for display
  const formatDate = (dateString: string) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }

  return (
    <FormSection
      id="summary"
      sectionNumber="Section 01"
      title="Summary Information"
      feedbackSlot={feedbackSlot}
      disabled={disabled}
      accordionStatus={accordionStatus}
      hasFeedback={hasFeedback}
    >
      <div className="space-y-4 p-5 rounded-xl border border-slate-300 bg-section-inner">
        {isNewCertificate ? (
          <>
            {/* Certificate Number - Editable */}
            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <Label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                Certificate Number <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <FileText className="size-5" />
                </div>
                <Input
                  type="text"
                  value={formData.certificateNumber}
                  onChange={(e) => setFormField('certificateNumber', e.target.value)}
                  placeholder="e.g., HTA/12345/24/01"
                  className={cn(
                    "w-full rounded-xl border-slate-300 h-9 pl-12 pr-12 focus:ring-primary focus:border-primary text-xs md:text-xs",
                    numberExists === true && "border-amber-500 focus:border-amber-500 focus:ring-amber-500 font-semibold text-xs md:text-xs",
                    numberExists === false && formData.certificateNumber.length >= 3 && "border-green-500 focus:border-green-500 focus:ring-green-500"
                  )}
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  {isCheckingNumber && (
                    <Loader2 className="size-5 text-slate-400 animate-spin" />
                  )}
                  {!isCheckingNumber && numberExists === true && (
                    <AlertTriangle className="size-5 text-amber-500" />
                  )}
                  {!isCheckingNumber && numberExists === false && formData.certificateNumber.length >= 3 && (
                    <CheckCircle2 className="size-5 text-green-500" />
                  )}
                </div>
              </div>
              {numberExists === true && (
                <div className="mt-2 flex items-center gap-2 text-amber-600">
                  <AlertTriangle className="size-4" />
                  <span className="text-xs font-semibold">
                    This certificate number already exists. Please use a different number.
                  </span>
                </div>
              )}
              {numberExists === false && formData.certificateNumber.length >= 3 && (
                <p className="mt-2 text-xs text-green-600 font-semibold">
                  Certificate number is available
                </p>
              )}
              <p className="mt-2 text-[10px] text-slate-400">
                Format: HTA/XXXXX/YY/ZZ (e.g., HTA/12345/24/01)
              </p>
            </div>

            {/* Reviewer Selection - Editable */}
            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <Label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                Assign Reviewer <span className="text-red-500">*</span>
              </Label>
              <ReviewerSelect
                value={formData.reviewerId}
                onChange={(reviewerId) => setFormField('reviewerId', reviewerId)}
                className="w-full"
              />
            </div>

            {/* Calibrated At - Editable */}
            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <Label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                Calibrated At <span className="text-red-500">*</span>
              </Label>
              <div className="flex flex-wrap gap-4">
                <label className="relative flex-1 min-w-[200px] cursor-pointer">
                  <input
                    type="radio"
                    name="calibratedAt"
                    value="LAB"
                    checked={formData.calibratedAt === 'LAB'}
                    onChange={() => setFormField('calibratedAt', 'LAB')}
                    className="peer sr-only"
                  />
                  <div className={cn(
                    // Icon and label on one line. Stacked and centred, the pair stood
                    // as tall as three form fields for what is one either/or.
                    "px-4 py-3 rounded-xl border-2 bg-white transition-all",
                    "flex items-center justify-center gap-2",
                    formData.calibratedAt === 'LAB'
                      ? "border-primary bg-primary/5"
                      : "border-slate-300"
                  )}>
                    <FlaskConical className={cn(
                      "size-5 shrink-0",
                      formData.calibratedAt === 'LAB' ? "text-primary" : "text-slate-400"
                    )} />
                    <span className={cn(
                      "font-bold",
                      formData.calibratedAt === 'LAB' ? "text-primary" : "text-slate-700"
                    )}>
                      In-House Laboratory
                    </span>
                  </div>
                </label>

                <label className="relative flex-1 min-w-[200px] cursor-pointer">
                  <input
                    type="radio"
                    name="calibratedAt"
                    value="SITE"
                    checked={formData.calibratedAt === 'SITE'}
                    onChange={() => setFormField('calibratedAt', 'SITE')}
                    className="peer sr-only"
                  />
                  <div className={cn(
                    "px-4 py-3 rounded-xl border-2 bg-white transition-all",
                    "flex items-center justify-center gap-2",
                    formData.calibratedAt === 'SITE'
                      ? "border-primary bg-primary/5"
                      : "border-slate-300"
                  )}>
                    <Factory className={cn(
                      "size-5 shrink-0",
                      formData.calibratedAt === 'SITE' ? "text-primary" : "text-slate-400"
                    )} />
                    <span className={cn(
                      "font-bold",
                      formData.calibratedAt === 'SITE' ? "text-primary" : "text-slate-700"
                    )}>
                      On-Site Location
                    </span>
                  </div>
                </label>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Locked Certificate Info - Compact Card */}
            <div className="bg-slate-100 rounded-2xl p-5 border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Certificate Details</h3>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-slate-200 text-slate-600 rounded-full text-[10px] font-medium">
                  <CheckCircle2 className="size-3" />
                  Locked
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white rounded-xl p-3 border border-slate-200">
                  <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">Certificate No.</p>
                  <p className="font-bold text-slate-900 text-sm">{formData.certificateNumber}</p>
                </div>
                <div className="bg-white rounded-xl p-3 border border-slate-200">
                  <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">Calibrated At</p>
                  <div className="flex items-center gap-1.5">
                    {formData.calibratedAt === 'LAB' ? (
                      <FlaskConical className="size-3.5 text-primary" />
                    ) : (
                      <Factory className="size-3.5 text-primary" />
                    )}
                    <p className="font-bold text-slate-900 text-sm">
                      {formData.calibratedAt === 'LAB' ? 'Lab' : 'On-Site'}
                    </p>
                  </div>
                </div>
                <div className="bg-white rounded-xl p-3 border border-slate-200">
                  <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">Cal. Date</p>
                  <p className="font-bold text-slate-900 text-sm">{formatDate(formData.dateOfCalibration)}</p>
                </div>
                <div className="bg-white rounded-xl p-3 border border-slate-200">
                  <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">Cal. Time</p>
                  <p className="font-bold text-slate-900 text-sm">
                    {formatCalibrationTimeRange(formData.calibrationStartTime, formData.calibrationEndTime)}
                  </p>
                </div>
                <div className="bg-white rounded-xl p-3 border border-purple-200">
                  <p className="text-[10px] font-medium text-purple-500 uppercase tracking-wider mb-1">Reviewer</p>
                  <div className="flex items-center gap-1.5">
                    <UserCheck className="size-3.5 text-purple-600" />
                    <p className="font-bold text-slate-900 text-sm truncate">{reviewerName || 'N/A'}</p>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* SRF Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <Label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              SRF Number <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              value={formData.srfNumber}
              onChange={(e) => setFormField('srfNumber', e.target.value)}
              placeholder="Enter SRF Number"
              className="w-full rounded-xl border-slate-300 h-9 px-3 focus:ring-primary focus:border-primary text-xs md:text-xs"
            />
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <Label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              SRF Date <span className="text-red-500">*</span>
            </Label>
            <DatePicker
              value={formData.srfDate}
              onChange={(val) => setFormField('srfDate', val)}
              placeholder="Select SRF date"
              className="w-full rounded-xl border-slate-300 h-9 px-3 text-xs"
            />
          </div>
        </div>

        {/* Date and Tenure Row
            Five cards on a draft, two once the dates are settled - the date and time
            cards only appear while a certificate can still be dated. */}
        <div
          className={cn(
            'grid gap-4',
            isNewCertificate ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-5' : 'grid-cols-1 md:grid-cols-2',
          )}
        >
          {/* Date of Calibration - Only editable for DRAFT */}
          {isNewCertificate && (
            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <Label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                Date of Calibration <span className="text-red-500">*</span>
              </Label>
              <DatePicker
                value={formData.dateOfCalibration}
                onChange={(val) => setFormField('dateOfCalibration', val)}
                placeholder="Select calibration date"
                className="w-full rounded-xl border-slate-300 h-9 text-xs px-3"
              />
            </div>
          )}

          {isNewCertificate && (
            <>
              <div className="bg-white rounded-xl p-4 border border-slate-200">
                <Label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                  Calibration Start Time
                </Label>
                <Input
                  type="time"
                  value={formData.calibrationStartTime}
                  onChange={(e) => setFormField('calibrationStartTime', e.target.value)}
                  className="w-full rounded-xl border-slate-300 h-9 px-3 focus:ring-primary focus:border-primary text-xs md:text-xs"
                />
              </div>
              <div className="bg-white rounded-xl p-4 border border-slate-200">
                <Label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                  Calibration End Time
                </Label>
                <Input
                  type="time"
                  value={formData.calibrationEndTime}
                  onChange={(e) => setFormField('calibrationEndTime', e.target.value)}
                  className="w-full rounded-xl border-slate-300 h-9 px-3 focus:ring-primary focus:border-primary text-xs md:text-xs"
                />
                <p className="mt-2 text-[10px] text-slate-400 font-bold uppercase">
                  Hours: {formatCalibrationHours(formData.calibrationStartTime, formData.calibrationEndTime)}
                </p>
              </div>
            </>
          )}

          {/* Calibration Tenure */}
          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <Label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              Calibration Tenure
            </Label>
            <div className="flex gap-2">
              <Select
                value={
                  formData.dueDateNotApplicable
                    ? NOT_APPLICABLE
                    : String(countFor(formData.calibrationTenure, formData.calibrationTenureUnit))
                }
                onValueChange={(value) => {
                  // "Not applicable" here is the same fact the due date panel used to
                  // ask separately: this certificate does not expire. One control, so
                  // the two can never disagree.
                  if (value === NOT_APPLICABLE) {
                    setFormField('dueDateNotApplicable', true)
                    return
                  }
                  setFormField('dueDateNotApplicable', false)
                  setFormField(
                    'calibrationTenure',
                    monthsFor(Number(value), formData.calibrationTenureUnit),
                  )
                }}
              >
                <SelectTrigger className="w-24 rounded-xl border-slate-300 h-9 px-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TENURE_COUNTS.map((count) => (
                    <SelectItem key={count} value={String(count)}>
                      {count}
                    </SelectItem>
                  ))}
                  <SelectItem value={NOT_APPLICABLE}>N/A</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={formData.calibrationTenureUnit}
                disabled={formData.dueDateNotApplicable}
                onValueChange={(value) => {
                  const unit = value === 'years' ? 'years' : 'months'
                  // The count on screen stays put and the months behind it follow, so
                  // switching to years turns 12 into a year rather than into a month.
                  const count = countFor(formData.calibrationTenure, formData.calibrationTenureUnit)
                  setFormField('calibrationTenureUnit', unit)
                  setFormField('calibrationTenure', monthsFor(count, unit))
                }}
              >
                <SelectTrigger className="flex-1 rounded-xl border-slate-300 h-9 px-3 disabled:bg-slate-50 disabled:text-slate-400">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="months">Months</SelectItem>
                  <SelectItem value="years">Years</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="mt-2 text-[10px] text-slate-400 font-bold uppercase">
              {formData.dueDateNotApplicable ? 'Not Applicable' : 'Default: 12 Months'}
            </p>
          </div>

          {/* How the due date is written on the certificate.
              02/09/2026 is September here and February in Boston, and a certificate
              that leaves the lab has to be read the way its reader reads.

              A card among the others rather than a control tucked into the due date
              panel: it is a choice the engineer makes about this certificate, and it
              reads as one when it is labelled like every choice beside it. The caption
              shows the result, where tenure's shows its default. */}
          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <Label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              Due Date Format
            </Label>
            <Select
              value={formData.calibrationDueDateFormat || DEFAULT_DATE_FORMAT}
              disabled={formData.dueDateNotApplicable}
              onValueChange={(value) => setFormField('calibrationDueDateFormat', value)}
            >
              <SelectTrigger className="w-full rounded-xl border-slate-300 h-9 px-3 disabled:bg-slate-50 disabled:text-slate-400">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_FORMATS.map((format) => (
                  <SelectItem key={format} value={format}>
                    {format}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-2 text-[10px] text-slate-400 font-bold uppercase">
              {formData.dueDateNotApplicable
                ? 'No due date'
                : formData.calibrationDueDate
                  ? `On PDF: ${formatCertificateDate(
                      formData.calibrationDueDate,
                      formData.calibrationDueDateFormat || DEFAULT_DATE_FORMAT,
                    )}`
                  : 'Set a calibration date first'}
            </p>
          </div>
        </div>

        {/* Calculated Due Date */}
        <div className={cn(
          "rounded-2xl p-6 border",
          formData.dueDateNotApplicable
            ? "bg-slate-100 border-slate-200"
            : "bg-primary/5 border-primary/10"
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className={cn(
                "size-14 rounded-xl flex items-center justify-center",
                formData.dueDateNotApplicable
                  ? "bg-slate-200 text-slate-500"
                  : "bg-primary/10 text-primary"
              )}>
                <Calendar className="size-8" />
              </div>
              <div>
                <p className={cn(
                  "text-[10px] font-extrabold uppercase tracking-widest",
                  formData.dueDateNotApplicable ? "text-slate-500" : "text-primary"
                )}>
                  Recommended Cal Due Date
                </p>
                <p className={cn(
                  "text-xl font-extrabold",
                  formData.dueDateNotApplicable ? "text-slate-500" : "text-slate-900"
                )}>
                  {formData.dueDateNotApplicable ? 'Not Applicable' : formatDate(formData.calibrationDueDate)}
                </p>
                {!formData.dueDateNotApplicable && (
                  <p className="text-xs text-slate-500">
                    Based on calibration date + tenure
                    {formData.dueDateAdjustment < 0 && (
                      <span className="text-amber-600 font-semibold ml-1">
                        ({formData.dueDateAdjustment} days)
                      </span>
                    )}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-4">
              {/* Whether the certificate expires is asked once, in the tenure card,
                  where the question is "how long does this hold". A checkbox here as
                  well was a second control for one fact, and two controls for one fact
                  are two chances to disagree. */}
              {/* Adjust Due Date - Only shown when not "Not Applicable" */}
              {!formData.dueDateNotApplicable && (
                <div className="flex flex-col items-end gap-2">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Adjust Due Date
                  </p>
                  <div className="flex gap-1">
                    {([-3, -2, -1, 0] as const).map((days) => (
                      <button
                        key={days}
                        type="button"
                        onClick={() => setFormField('dueDateAdjustment', days)}
                        className={cn(
                          "w-10 h-8 rounded-lg text-xs font-bold transition-all border",
                          formData.dueDateAdjustment === days
                            ? "bg-primary text-white border-primary"
                            : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50"
                        )}
                      >
                        {days === 0 ? '0' : days}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Customer Information */}
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <CustomerAutocomplete
            value={formData.customerName}
            address={formData.customerAddress}
            contactName={formData.customerContactName}
            contactEmail={formData.customerContactEmail}
            onCustomerSelect={(customer) => {
              setFormField('customerName', customer.name)
              setFormField('customerAddress', customer.address)
              setFormField('customerAccountId', customer.id)
            }}
            onNameChange={(name) => setFormField('customerName', name)}
            onAddressChange={(address) => setFormField('customerAddress', address)}
            onContactNameChange={(name) => setFormField('customerContactName', name)}
            onContactEmailChange={(email) => setFormField('customerContactEmail', email)}
          />
        </div>
      </div>
    </FormSection>
  )
}
