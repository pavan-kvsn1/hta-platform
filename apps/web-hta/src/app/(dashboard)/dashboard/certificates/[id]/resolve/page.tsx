'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Loader2,
  ChevronDown,
  ChevronUp,
  Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Result {
  point_number: number
  standard_reading: string | null
  before_adjustment: string | null
  after_adjustment: string | null
  error_observed: number | null
  is_out_of_limit: number | null
  // Server uses camelCase
  pointNumber?: number
  standardReading?: string | null
  beforeAdjustment?: string | null
  afterAdjustment?: string | null
  errorObserved?: number | null
  isOutOfLimit?: boolean | number | null
}

interface Parameter {
  id?: string
  sort_order?: number
  sortOrder?: number
  parameter_name?: string
  parameterName?: string
  parameter_unit?: string
  parameterUnit?: string
  range_min?: string | null
  rangeMin?: string | null
  range_max?: string | null
  rangeMax?: string | null
  least_count_value?: string | null
  leastCountValue?: string | null
  master_instrument_id?: string | null
  masterInstrumentId?: string | null
  results?: Result[]
}

interface DraftData {
  id?: string
  certificate_number?: string
  certificateNumber?: string
  customer_name?: string
  customerName?: string
  customer_address?: string
  customerAddress?: string
  customer_contact_name?: string
  customerContactName?: string
  customer_contact_email?: string
  customerContactEmail?: string
  uuc_description?: string
  uucDescription?: string
  uuc_make?: string
  uucMake?: string
  uuc_model?: string
  uucModel?: string
  uuc_serial_number?: string
  uucSerialNumber?: string
  uuc_location_name?: string
  uucLocationName?: string
  date_of_calibration?: string
  dateOfCalibration?: string
  calibration_due_date?: string
  calibrationDueDate?: string
  ambient_temperature?: string
  ambientTemperature?: string
  relative_humidity?: string
  relativeHumidity?: string
  srf_number?: string
  srfNumber?: string
  status_notes?: string
  statusNotes?: string
  calibration_status?: unknown
  calibrationStatus?: unknown
  sticker_old_removed?: string
  stickerOldRemoved?: string
  sticker_new_affixed?: string
  stickerNewAffixed?: string
  selected_conclusion_statements?: unknown
  selectedConclusionStatements?: unknown
  additional_conclusion_statement?: string
  additionalConclusionStatement?: string
  parameters?: Parameter[]
  updated_at?: string
  updatedAt?: string
}

// Normalize field access: local uses snake_case, server uses camelCase
function f(obj: Record<string, unknown>, snakeKey: string, camelKey: string): string {
  return String(obj[snakeKey] ?? obj[camelKey] ?? '')
}

function fResult(r: Result, snakeKey: keyof Result, camelKey: keyof Result): string {
  return String((r as unknown as Record<string, unknown>)[snakeKey] ?? (r as unknown as Record<string, unknown>)[camelKey] ?? '')
}

// ─── Section config ──────────────────────────────────────────────────────────

interface FieldDef {
  label: string
  localKey: string
  serverKey: string
}

const CUSTOMER_FIELDS: FieldDef[] = [
  { label: 'Customer Name', localKey: 'customer_name', serverKey: 'customerName' },
  { label: 'Address', localKey: 'customer_address', serverKey: 'customerAddress' },
  { label: 'Contact Name', localKey: 'customer_contact_name', serverKey: 'customerContactName' },
  { label: 'Contact Email', localKey: 'customer_contact_email', serverKey: 'customerContactEmail' },
]

const UUC_FIELDS: FieldDef[] = [
  { label: 'Description', localKey: 'uuc_description', serverKey: 'uucDescription' },
  { label: 'Make', localKey: 'uuc_make', serverKey: 'uucMake' },
  { label: 'Model', localKey: 'uuc_model', serverKey: 'uucModel' },
  { label: 'Serial Number', localKey: 'uuc_serial_number', serverKey: 'uucSerialNumber' },
  { label: 'Location', localKey: 'uuc_location_name', serverKey: 'uucLocationName' },
]

const CAL_FIELDS: FieldDef[] = [
  { label: 'Date of Calibration', localKey: 'date_of_calibration', serverKey: 'dateOfCalibration' },
  { label: 'Due Date', localKey: 'calibration_due_date', serverKey: 'calibrationDueDate' },
  { label: 'SRF Number', localKey: 'srf_number', serverKey: 'srfNumber' },
  { label: 'Ambient Temp', localKey: 'ambient_temperature', serverKey: 'ambientTemperature' },
  { label: 'Humidity', localKey: 'relative_humidity', serverKey: 'relativeHumidity' },
]

const REMARK_FIELDS: FieldDef[] = [
  { label: 'Status Notes', localKey: 'status_notes', serverKey: 'statusNotes' },
  { label: 'Sticker Old Removed', localKey: 'sticker_old_removed', serverKey: 'stickerOldRemoved' },
  { label: 'Sticker New Affixed', localKey: 'sticker_new_affixed', serverKey: 'stickerNewAffixed' },
  { label: 'Additional Conclusion', localKey: 'additional_conclusion_statement', serverKey: 'additionalConclusionStatement' },
]

// ─── Component ───────────────────────────────────────────────────────────────

type PickSide = 'local' | 'server' | null

export default function ConflictResolvePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [local, setLocal] = useState<DraftData | null>(null)
  const [server, setServer] = useState<DraftData | null>(null)

  // Track picks: key = "section:fieldLabel" or "param:idx:pointNumber", value = 'local' | 'server'
  const [picks, setPicks] = useState<Record<string, PickSide>>({})
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})

  const electronAPI = typeof window !== 'undefined'
    ? (window as unknown as { electronAPI?: { getConflict: (id: string) => Promise<{ local: DraftData; server: DraftData } | null>; resolveConflict: (id: string, data: unknown) => Promise<{ success: boolean; error?: string }> } }).electronAPI
    : undefined

  useEffect(() => {
    if (!electronAPI?.getConflict) {
      setError('Conflict resolution is only available in the desktop app')
      setLoading(false)
      return
    }

    electronAPI.getConflict(id).then(result => {
      if (!result) {
        setError('No conflict found for this draft')
      } else {
        setLocal(result.local)
        setServer(result.server)
        // Expand all sections by default
        setExpandedSections({ customer: true, uuc: true, calibration: true, remarks: true })
        // Also expand all parameter sections
        const localParams = result.local.parameters || []
        const serverParams = result.server?.parameters || []
        const maxLen = Math.max(localParams.length, serverParams.length)
        for (let i = 0; i < maxLen; i++) {
          setExpandedSections(prev => ({ ...prev, [`param-${i}`]: true }))
        }
      }
      setLoading(false)
    }).catch(() => {
      setError('Failed to load conflict data')
      setLoading(false)
    })
  }, [id, electronAPI])

  const pick = useCallback((key: string, side: PickSide) => {
    setPicks(prev => ({ ...prev, [key]: side }))
  }, [])

  const selectAllInSection = useCallback((sectionPrefix: string, side: PickSide, keys: string[]) => {
    setPicks(prev => {
      const next = { ...prev }
      keys.forEach(k => { next[k] = side })
      return next
    })
  }, [])

  const selectAll = useCallback((side: PickSide) => {
    setPicks(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(k => { next[k] = side })
      // Also pick all diff keys we know about
      if (local && server) {
        const allKeys = getAllDiffKeys(local, server)
        allKeys.forEach(k => { next[k] = side })
      }
      return next
    })
  }, [local, server])

  // Count diffs and resolved
  const getAllDiffKeys = useCallback((loc: DraftData, srv: DraftData): string[] => {
    const keys: string[] = []
    const allFieldSections = [
      { prefix: 'customer', fields: CUSTOMER_FIELDS },
      { prefix: 'uuc', fields: UUC_FIELDS },
      { prefix: 'calibration', fields: CAL_FIELDS },
      { prefix: 'remarks', fields: REMARK_FIELDS },
    ]
    for (const { prefix, fields } of allFieldSections) {
      for (const field of fields) {
        const lv = f(loc as unknown as Record<string, unknown>, field.localKey, field.serverKey)
        const sv = f(srv as unknown as Record<string, unknown>, field.localKey, field.serverKey)
        if (lv !== sv) keys.push(`${prefix}:${field.label}`)
      }
    }
    // Parameters
    const localParams = loc.parameters || []
    const serverParams = srv.parameters || []
    const maxLen = Math.max(localParams.length, serverParams.length)
    for (let i = 0; i < maxLen; i++) {
      const lp = localParams[i]
      const sp = serverParams[i]
      if (!lp || !sp) continue
      const lr = lp.results || []
      const sr = sp.results || []
      const maxPts = Math.max(lr.length, sr.length)
      for (let j = 0; j < maxPts; j++) {
        const lRes = lr[j]
        const sRes = sr[j]
        if (!lRes && sRes) { keys.push(`param:${i}:${j}:new`); continue }
        if (lRes && !sRes) { keys.push(`param:${i}:${j}:removed`); continue }
        if (!lRes || !sRes) continue
        const lReading = fResult(lRes, 'before_adjustment', 'beforeAdjustment')
        const sReading = fResult(sRes, 'before_adjustment', 'beforeAdjustment')
        const lError = fResult(lRes, 'error_observed', 'errorObserved')
        const sError = fResult(sRes, 'error_observed', 'errorObserved')
        if (lReading !== sReading || lError !== sError) {
          keys.push(`param:${i}:${j}`)
        }
      }
    }
    return keys
  }, [])

  const diffKeys = local && server ? getAllDiffKeys(local, server) : []
  const resolvedCount = diffKeys.filter(k => picks[k] != null).length
  const totalConflicts = diffKeys.length
  const allResolved = resolvedCount === totalConflicts && totalConflicts > 0

  // Register all diff keys on load
  useEffect(() => {
    if (local && server) {
      const keys = getAllDiffKeys(local, server)
      setPicks(prev => {
        const next = { ...prev }
        keys.forEach(k => { if (!(k in next)) next[k] = null })
        return next
      })
    }
  }, [local, server, getAllDiffKeys])

  const handleResolve = useCallback(async () => {
    if (!local || !server || !electronAPI?.resolveConflict || !allResolved) return
    setSaving(true)

    // Build resolved data by picking local or server value for each field
    const resolved: Record<string, unknown> = {}

    // Field sections
    for (const { fields } of [
      { fields: CUSTOMER_FIELDS },
      { fields: UUC_FIELDS },
      { fields: CAL_FIELDS },
      { fields: REMARK_FIELDS },
    ]) {
      for (const field of fields) {
        const key = Object.keys(picks).find(k => k.endsWith(`:${field.label}`))
        const side = key ? picks[key] : 'local'
        const src = side === 'server' ? server : local
        // Use camelCase key for the resolved output (server format)
        resolved[field.serverKey] = f(src as unknown as Record<string, unknown>, field.localKey, field.serverKey)
      }
    }

    // Also carry over non-diffed fields from local
    const carryOver = [
      'customerAccountId', 'customer_account_id',
      'uucInstrumentId', 'uuc_instrument_id',
      'uucMachineName', 'uuc_machine_name',
      'calibrationTenure', 'calibration_tenure',
      'dueDateAdjustment', 'due_date_adjustment',
      'dueDateNotApplicable', 'due_date_not_applicable',
      'srfDate', 'srf_date',
      'certificateNumber', 'certificate_number',
      'calibrationStatus', 'calibration_status',
      'selectedConclusionStatements', 'selected_conclusion_statements',
    ]
    for (let i = 0; i < carryOver.length; i += 2) {
      const camelKey = carryOver[i]
      const snakeKey = carryOver[i + 1]
      if (!(camelKey in resolved)) {
        resolved[camelKey] = (local as Record<string, unknown>)[snakeKey] ?? (local as Record<string, unknown>)[camelKey]
      }
    }

    // Parameters — for each param, build resolved results
    const localParams = local.parameters || []
    const serverParams = server.parameters || []
    const maxLen = Math.max(localParams.length, serverParams.length)
    const resolvedParams: unknown[] = []

    for (let i = 0; i < maxLen; i++) {
      const lp = localParams[i]
      const sp = serverParams[i]
      const baseParam = lp || sp
      if (!baseParam) continue

      const lr = lp?.results || []
      const sr = sp?.results || []
      const maxPts = Math.max(lr.length, sr.length)
      const resolvedResults: unknown[] = []

      for (let j = 0; j < maxPts; j++) {
        const pickKey = `param:${i}:${j}`
        const side = picks[pickKey] || picks[`${pickKey}:new`] || picks[`${pickKey}:removed`] || 'local'
        const srcResult = side === 'server' ? (sr[j] || lr[j]) : (lr[j] || sr[j])
        if (!srcResult) continue

        resolvedResults.push({
          pointNumber: Number(fResult(srcResult, 'point_number', 'pointNumber')),
          standardReading: fResult(srcResult, 'standard_reading', 'standardReading') || null,
          beforeAdjustment: fResult(srcResult, 'before_adjustment', 'beforeAdjustment') || null,
          afterAdjustment: fResult(srcResult, 'after_adjustment', 'afterAdjustment') || null,
          errorObserved: srcResult.error_observed ?? srcResult.errorObserved ?? null,
          isOutOfLimit: !!(srcResult.is_out_of_limit || srcResult.isOutOfLimit),
        })
      }

      resolvedParams.push({
        sortOrder: Number((baseParam as Record<string, unknown>).sort_order ?? (baseParam as Record<string, unknown>).sortOrder ?? i),
        parameterName: String((baseParam as Record<string, unknown>).parameter_name ?? (baseParam as Record<string, unknown>).parameterName ?? ''),
        parameterUnit: String((baseParam as Record<string, unknown>).parameter_unit ?? (baseParam as Record<string, unknown>).parameterUnit ?? ''),
        rangeMin: (baseParam as Record<string, unknown>).range_min ?? (baseParam as Record<string, unknown>).rangeMin ?? null,
        rangeMax: (baseParam as Record<string, unknown>).range_max ?? (baseParam as Record<string, unknown>).rangeMax ?? null,
        leastCountValue: (baseParam as Record<string, unknown>).least_count_value ?? (baseParam as Record<string, unknown>).leastCountValue ?? null,
        masterInstrumentId: (baseParam as Record<string, unknown>).master_instrument_id ?? (baseParam as Record<string, unknown>).masterInstrumentId ?? null,
        results: resolvedResults,
      })
    }

    resolved.parameters = resolvedParams

    try {
      const result = await electronAPI.resolveConflict(id, resolved)
      if (result.success) {
        router.push('/dashboard')
      } else {
        setError(result.error || 'Failed to resolve conflict')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }, [local, server, picks, allResolved, electronAPI, id, router])

  const toggleSection = useCallback((key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }))
  }, [])

  if (loading) {
    return (
      <div className="h-full overflow-auto bg-[#f1f5f9] flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-[#94a3b8]" />
      </div>
    )
  }

  if (error || !local || !server) {
    return (
      <div className="h-full overflow-auto bg-[#f1f5f9] flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-[#64748b]">{error || 'No data'}</p>
          <Link href="/dashboard" className="text-sm text-[#2563eb] underline mt-2 inline-block">Back to dashboard</Link>
        </div>
      </div>
    )
  }

  const certNumber = f(local as unknown as Record<string, unknown>, 'certificate_number', 'certificateNumber')

  return (
    <div className="h-full flex flex-col bg-[#f1f5f9]">
      {/* Header */}
      <div className="bg-white border-b border-[#e2e8f0] px-6 py-3 flex items-center gap-3">
        <Link href="/dashboard" className="w-9 h-9 rounded-lg border border-[#e2e8f0] flex items-center justify-center text-[#64748b] hover:bg-[#f8fafc]">
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="text-xl font-extrabold tracking-tight text-[#0f172a]">{certNumber || 'Certificate'}</h1>
        <span className="bg-purple-50 text-purple-700 text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border border-purple-200">
          Sync Conflict
        </span>
      </div>

      {/* Toolbar */}
      <div className="bg-white border-b border-[#e2e8f0] px-6 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs text-[#64748b]">Quick select:</span>
          <button onClick={() => selectAll('local')} className="px-3 py-1 text-xs font-semibold border border-blue-200 rounded-md text-blue-600 hover:bg-blue-50">
            Use All Local
          </button>
          <button onClick={() => selectAll('server')} className="px-3 py-1 text-xs font-semibold border border-purple-200 rounded-md text-purple-600 hover:bg-purple-50">
            Use All Server
          </button>
        </div>
        <span className="text-xs text-[#64748b]">{resolvedCount} of {totalConflicts} resolved</span>
      </div>

      {/* Version info */}
      <div className="px-6 pt-4 pb-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wide">Your Version (Local)</div>
            <div className="text-[11px] text-[#64748b] mt-0.5">Last edited on this device</div>
          </div>
          <div className="px-3 py-2 bg-purple-50 border border-purple-200 rounded-lg">
            <div className="text-[10px] font-bold text-purple-600 uppercase tracking-wide">Server Version</div>
            <div className="text-[11px] text-[#64748b] mt-0.5">Modified on server</div>
          </div>
        </div>
      </div>

      {/* Scrollable sections */}
      <div className="flex-1 overflow-auto px-6 py-3 space-y-2.5">
        {/* Field sections */}
        {[
          { id: 'customer', label: 'Customer Details', num: '1', fields: CUSTOMER_FIELDS },
          { id: 'uuc', label: 'UUC Details', num: '2', fields: UUC_FIELDS },
          { id: 'calibration', label: 'Calibration Details & Environment', num: '3', fields: CAL_FIELDS },
        ].map(section => (
          <FieldSection
            key={section.id}
            sectionId={section.id}
            label={section.label}
            sectionNum={section.num}
            fields={section.fields}
            local={local as unknown as Record<string, unknown>}
            server={server as unknown as Record<string, unknown>}
            picks={picks}
            onPick={pick}
            onSelectAll={selectAllInSection}
            expanded={expandedSections[section.id] ?? false}
            onToggle={() => toggleSection(section.id)}
          />
        ))}

        {/* Parameter sections */}
        {(() => {
          const localParams = local.parameters || []
          const serverParams = server.parameters || []
          const maxLen = Math.max(localParams.length, serverParams.length)
          const sections: React.ReactNode[] = []
          for (let i = 0; i < maxLen; i++) {
            sections.push(
              <ParameterSection
                key={`param-${i}`}
                index={i}
                sectionNum={String(4 + i)}
                localParam={localParams[i] || null}
                serverParam={serverParams[i] || null}
                picks={picks}
                onPick={pick}
                onSelectAll={selectAllInSection}
                expanded={expandedSections[`param-${i}`] ?? false}
                onToggle={() => toggleSection(`param-${i}`)}
              />
            )
          }
          return sections
        })()}

        {/* Remarks section */}
        <FieldSection
          sectionId="remarks"
          label="Remarks & Conclusion"
          sectionNum={String(4 + Math.max((local.parameters || []).length, (server.parameters || []).length))}
          fields={REMARK_FIELDS}
          local={local as unknown as Record<string, unknown>}
          server={server as unknown as Record<string, unknown>}
          picks={picks}
          onPick={pick}
          onSelectAll={selectAllInSection}
          expanded={expandedSections['remarks'] ?? false}
          onToggle={() => toggleSection('remarks')}
        />
      </div>

      {/* Sticky footer */}
      <div className="bg-white border-t border-[#e2e8f0] px-6 py-3 flex items-center justify-between">
        <div className="text-xs text-[#64748b]">
          <strong className="text-[#0f172a]">{resolvedCount} of {totalConflicts}</strong> conflicts resolved
          {allResolved && <span className="text-green-600 font-semibold ml-2">Ready to save!</span>}
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard">
            <button className="px-4 py-2 text-xs font-semibold border border-[#e2e8f0] rounded-lg bg-white text-[#0f172a] hover:bg-[#f8fafc]">
              Cancel
            </button>
          </Link>
          <button
            onClick={handleResolve}
            disabled={!allResolved || saving}
            className={cn(
              'px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-1.5',
              allResolved
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-[#e2e8f0] text-[#94a3b8] cursor-not-allowed'
            )}
          >
            {saving ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
            Resolve & Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Field Section (Customer, UUC, Calibration, Remarks) ─────────────────────

function FieldSection({
  sectionId, label, sectionNum, fields,
  local, server, picks, onPick, onSelectAll,
  expanded, onToggle,
}: {
  sectionId: string
  label: string
  sectionNum: string
  fields: FieldDef[]
  local: Record<string, unknown>
  server: Record<string, unknown>
  picks: Record<string, PickSide>
  onPick: (key: string, side: PickSide) => void
  onSelectAll: (prefix: string, side: PickSide, keys: string[]) => void
  expanded: boolean
  onToggle: () => void
}) {
  const diffFields = fields.filter(fd => f(local, fd.localKey, fd.serverKey) !== f(server, fd.localKey, fd.serverKey))
  const diffKeys = diffFields.map(fd => `${sectionId}:${fd.label}`)
  const resolvedInSection = diffKeys.filter(k => picks[k] != null).length
  const noDiffs = diffFields.length === 0

  return (
    <div className={cn('bg-white border border-[#e2e8f0] rounded-[14px] overflow-hidden', noDiffs && 'opacity-60')}>
      <button onClick={onToggle} className="w-full flex items-center px-5 py-3.5 bg-[#f8fafc] border-b border-[#e2e8f0] text-left">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#94a3b8] bg-[#f1f5f9] px-2 py-0.5 rounded mr-3">&sect;{sectionNum}</span>
        <span className="text-[15px] font-bold text-[#0f172a] flex-1">{label}</span>
        {noDiffs ? (
          <span className="text-[10px] text-[#94a3b8] mr-2">No conflicts</span>
        ) : (
          <>
            <span className="text-[10px] font-semibold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full mr-2">{diffFields.length} conflict{diffFields.length > 1 ? 's' : ''}</span>
            <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', resolvedInSection === diffFields.length ? 'bg-green-100 text-green-700' : 'bg-amber-50 text-amber-700')}>
              {resolvedInSection}/{diffFields.length}
            </span>
          </>
        )}
        {expanded ? <ChevronUp className="size-4 text-[#94a3b8] ml-2" /> : <ChevronDown className="size-4 text-[#94a3b8] ml-2" />}
      </button>
      {expanded && (
        <div className="p-4">
          {!noDiffs && (
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] text-[#94a3b8] font-semibold">This section:</span>
              <button onClick={() => onSelectAll(sectionId, 'local', diffKeys)} className="px-2 py-0.5 text-[10px] font-semibold border border-blue-200 rounded text-blue-600 hover:bg-blue-50">All local</button>
              <button onClick={() => onSelectAll(sectionId, 'server', diffKeys)} className="px-2 py-0.5 text-[10px] font-semibold border border-purple-200 rounded text-purple-600 hover:bg-purple-50">All server</button>
            </div>
          )}
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b-2 border-[#e2e8f0]">
                <th className="text-left px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-[#94a3b8] bg-[#f8fafc]">Field</th>
                <th className="text-left px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-blue-600 bg-blue-50">Local</th>
                <th className="text-left px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-purple-600 bg-purple-50">Server</th>
                <th className="text-center px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-[#94a3b8] bg-[#f8fafc] w-24">Use</th>
              </tr>
            </thead>
            <tbody>
              {fields.map(fd => {
                const lv = f(local, fd.localKey, fd.serverKey)
                const sv = f(server, fd.localKey, fd.serverKey)
                const isDiff = lv !== sv
                const pickKey = `${sectionId}:${fd.label}`
                const picked = picks[pickKey]

                return (
                  <tr key={fd.label} className={cn('border-b border-[#f1f5f9]', isDiff && 'bg-amber-50/50')}>
                    <td className={cn('px-2 py-2', isDiff ? 'font-semibold text-[#0f172a]' : 'text-[#94a3b8]')}>{fd.label}</td>
                    <td className={cn('px-2 py-2', isDiff ? 'font-semibold' : 'text-[#94a3b8]', picked === 'local' && 'bg-blue-100 rounded')}>{lv || '-'}</td>
                    <td className={cn('px-2 py-2', isDiff ? 'font-semibold' : 'text-[#94a3b8]', picked === 'server' && 'bg-purple-100 rounded')}>{sv || '-'}</td>
                    <td className="px-2 py-2 text-center">
                      {isDiff ? (
                        <PickToggle picked={picked} onPick={(side) => onPick(pickKey, side)} />
                      ) : (
                        <span className="text-[11px] text-[#94a3b8]">&mdash;</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Parameter Section ───────────────────────────────────────────────────────

function ParameterSection({
  index, sectionNum, localParam, serverParam,
  picks, onPick, onSelectAll,
  expanded, onToggle,
}: {
  index: number
  sectionNum: string
  localParam: Parameter | null
  serverParam: Parameter | null
  picks: Record<string, PickSide>
  onPick: (key: string, side: PickSide) => void
  onSelectAll: (prefix: string, side: PickSide, keys: string[]) => void
  expanded: boolean
  onToggle: () => void
}) {
  const param = localParam || serverParam
  if (!param) return null

  const name = String((param as Record<string, unknown>).parameter_name ?? (param as Record<string, unknown>).parameterName ?? `Parameter ${index + 1}`)
  const unit = String((param as Record<string, unknown>).parameter_unit ?? (param as Record<string, unknown>).parameterUnit ?? '')

  const lr = localParam?.results || []
  const sr = serverParam?.results || []
  const maxPts = Math.max(lr.length, sr.length)

  // Find diffs
  const diffPtKeys: string[] = []
  for (let j = 0; j < maxPts; j++) {
    const lRes = lr[j]
    const sRes = sr[j]
    if (!lRes || !sRes) { diffPtKeys.push(`param:${index}:${j}:${!lRes ? 'new' : 'removed'}`); continue }
    const lReading = fResult(lRes, 'before_adjustment', 'beforeAdjustment')
    const sReading = fResult(sRes, 'before_adjustment', 'beforeAdjustment')
    const lError = fResult(lRes, 'error_observed', 'errorObserved')
    const sError = fResult(sRes, 'error_observed', 'errorObserved')
    if (lReading !== sReading || lError !== sError) {
      diffPtKeys.push(`param:${index}:${j}`)
    }
  }

  const resolvedInParam = diffPtKeys.filter(k => picks[k] != null).length
  const noDiffs = diffPtKeys.length === 0

  return (
    <div className={cn('bg-white border border-[#e2e8f0] rounded-[14px] overflow-hidden', noDiffs && 'opacity-60')}>
      <button onClick={onToggle} className="w-full flex items-center px-5 py-3.5 bg-[#f8fafc] border-b border-[#e2e8f0] text-left">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#94a3b8] bg-[#f1f5f9] px-2 py-0.5 rounded mr-3">&sect;{sectionNum}</span>
        <span className="text-[15px] font-bold text-[#0f172a] flex-1">
          {name} <span className="font-normal text-[#94a3b8] text-[13px]">({unit})</span>
        </span>
        {noDiffs ? (
          <span className="text-[10px] text-[#94a3b8] mr-2">No conflicts</span>
        ) : (
          <>
            <span className="text-[10px] font-semibold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full mr-2">{diffPtKeys.length} conflict{diffPtKeys.length > 1 ? 's' : ''}</span>
            <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', resolvedInParam === diffPtKeys.length ? 'bg-green-100 text-green-700' : 'bg-amber-50 text-amber-700')}>
              {resolvedInParam}/{diffPtKeys.length}
            </span>
          </>
        )}
        {expanded ? <ChevronUp className="size-4 text-[#94a3b8] ml-2" /> : <ChevronDown className="size-4 text-[#94a3b8] ml-2" />}
      </button>
      {expanded && (
        <div className="p-4">
          {!noDiffs && (
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] text-[#94a3b8] font-semibold">This parameter:</span>
              <button onClick={() => onSelectAll(`param-${index}`, 'local', diffPtKeys)} className="px-2 py-0.5 text-[10px] font-semibold border border-blue-200 rounded text-blue-600 hover:bg-blue-50">All local</button>
              <button onClick={() => onSelectAll(`param-${index}`, 'server', diffPtKeys)} className="px-2 py-0.5 text-[10px] font-semibold border border-purple-200 rounded text-purple-600 hover:bg-purple-50">All server</button>
            </div>
          )}
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b-2 border-[#e2e8f0]">
                <th className="text-left px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-[#94a3b8] bg-[#f8fafc] w-10">Pt</th>
                <th className="text-left px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-[#94a3b8] bg-[#f8fafc]">Std</th>
                <th className="text-left px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-blue-600 bg-blue-50">UUC (L)</th>
                <th className="text-left px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-blue-600 bg-blue-50">Err (L)</th>
                <th className="text-left px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-purple-600 bg-purple-50">UUC (S)</th>
                <th className="text-left px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-purple-600 bg-purple-50">Err (S)</th>
                <th className="text-center px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-[#94a3b8] bg-[#f8fafc] w-24">Use</th>
                <th className="text-left px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-[#94a3b8] bg-[#f8fafc] w-12">OOL</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: maxPts }, (_, j) => {
                const lRes = lr[j]
                const sRes = sr[j]
                const lReading = lRes ? fResult(lRes, 'before_adjustment', 'beforeAdjustment') : ''
                const sReading = sRes ? fResult(sRes, 'before_adjustment', 'beforeAdjustment') : ''
                const lError = lRes ? fResult(lRes, 'error_observed', 'errorObserved') : ''
                const sError = sRes ? fResult(sRes, 'error_observed', 'errorObserved') : ''
                const lStd = lRes ? fResult(lRes, 'standard_reading', 'standardReading') : ''
                const sStd = sRes ? fResult(sRes, 'standard_reading', 'standardReading') : ''
                const isDiff = lReading !== sReading || lError !== sError

                const pickKey = isDiff ? `param:${index}:${j}` : ''
                const picked = pickKey ? picks[pickKey] : null
                const ptNum = lRes
                  ? fResult(lRes, 'point_number', 'pointNumber')
                  : sRes ? fResult(sRes, 'point_number', 'pointNumber') : String(j + 1)

                const lOol = lRes ? (lRes.is_out_of_limit || lRes.isOutOfLimit) : false
                const sOol = sRes ? (sRes.is_out_of_limit || sRes.isOutOfLimit) : false

                return (
                  <tr key={j} className={cn('border-b border-[#f1f5f9]', isDiff && 'bg-amber-50/50')}>
                    <td className={cn('px-2 py-2', isDiff ? 'font-bold' : 'text-[#94a3b8]')}>{ptNum}</td>
                    <td className={cn('px-2 py-2', !isDiff && 'text-[#94a3b8]')}>{lStd || sStd}</td>
                    <td className={cn('px-2 py-2', isDiff && 'font-semibold', picked === 'local' && 'bg-blue-100 rounded')}>{lReading || '-'}</td>
                    <td className={cn('px-2 py-2', isDiff && 'font-semibold', picked === 'local' && 'bg-blue-100 rounded')}>{lError || '-'}</td>
                    <td className={cn('px-2 py-2', isDiff && 'font-semibold', picked === 'server' && 'bg-purple-100 rounded')}>{sReading || '-'}</td>
                    <td className={cn('px-2 py-2', isDiff && 'font-semibold', picked === 'server' && 'bg-purple-100 rounded')}>{sError || '-'}</td>
                    <td className="px-2 py-2 text-center">
                      {isDiff ? (
                        <PickToggle picked={picked} onPick={(side) => onPick(pickKey, side)} />
                      ) : (
                        <span className="text-[11px] text-[#94a3b8]">&mdash;</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {(lOol || sOol) ? (
                        <span className="text-[10px] font-bold text-red-600">OOL</span>
                      ) : isDiff ? (
                        <span className="text-[10px] font-bold text-green-600">OK</span>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── L/S Toggle ──────────────────────────────────────────────────────────────

function PickToggle({ picked, onPick }: { picked: PickSide; onPick: (side: PickSide) => void }) {
  return (
    <div className="inline-flex border border-[#e2e8f0] rounded-md overflow-hidden">
      <button
        onClick={() => onPick('local')}
        className={cn(
          'px-2.5 py-0.5 text-[10px] font-semibold uppercase transition-colors border-r border-[#e2e8f0]',
          picked === 'local' ? 'bg-blue-600 text-white' : 'bg-white text-[#64748b] hover:bg-[#f8fafc]'
        )}
      >
        L
      </button>
      <button
        onClick={() => onPick('server')}
        className={cn(
          'px-2.5 py-0.5 text-[10px] font-semibold uppercase transition-colors',
          picked === 'server' ? 'bg-purple-600 text-white' : 'bg-white text-[#64748b] hover:bg-[#f8fafc]'
        )}
      >
        S
      </button>
    </div>
  )
}
