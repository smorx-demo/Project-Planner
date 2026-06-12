import { useState, useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X, UserPlus, Trash2, AlertTriangle } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { format } from 'date-fns'
import { activitiesApi } from '../../api/activities'
import { assignmentsApi } from '../../api/assignments'
import { personsApi } from '../../api/persons'
import { evmApi } from '../../api/evm'
import { Button } from '../UI/Button'
import { colToDate, TODAY_COL, computeStatus } from '../../store/projectStore'
import type {
  ActivityWithStatus, Person, Assignment,
  ActivityStatusOverride, AssignmentRole, UpdateActivityEVMPayload,
} from '../../types'

// ── Date ↔ Column helpers ─────────────────────────────────────────────────

const EPOCH = new Date(2026, 2, 25)

function dateToCol(dateStr: string): number {
  const d = new Date(dateStr)
  const diffMs = d.getTime() - EPOCH.getTime()
  return Math.max(0, Math.round(diffMs / (24 * 60 * 60 * 1000)))
}

function colToInputValue(col: number): string {
  return format(colToDate(col), 'yyyy-MM-dd')
}

// ── Static data ───────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: ActivityStatusOverride | ''; label: string }[] = [
  { value: '',         label: 'Auto (calculated)' },
  { value: 'DONE',     label: 'Done' },
  { value: 'ON_TRACK', label: 'On Track' },
  { value: 'SLOW',     label: 'Slow' },
  { value: 'DELAYED',  label: 'Delayed' },
  { value: 'PENDING',  label: 'Pending' },
]

const STATUS_COLOR: Record<string, string> = {
  DONE:     '#22c55e',
  ON_TRACK: '#3b82f6',
  SLOW:     '#f59e0b',
  DELAYED:  '#ef4444',
  PENDING:  '#94a3b8',
}

const AVATAR_COLORS = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#ec4899','#14b8a6','#f97316']
function nameColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) { h = ((h << 5) - h) + name.charCodeAt(i); h |= 0 }
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}
function initials(name: string) {
  const p = name.trim().split(/\s+/)
  return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase()
}

// ── Props ──────────────────────────────────────────────────────────────────
interface EditActivityModalProps {
  activity:           ActivityWithStatus | null
  persons:            Person[]
  projectId:          string
  onClose:            () => void
  onSaved:            (updated: ActivityWithStatus) => void
  onAssignmentChange: () => void
}

// ── Component ──────────────────────────────────────────────────────────────
export function EditActivityModal({
  activity, persons, projectId, onClose, onSaved, onAssignmentChange,
}: EditActivityModalProps) {
  const [tab, setTab] = useState<'schedule' | 'people' | 'evm'>('schedule')

  const [form, setForm] = useState({
    name:               '',
    group_type:         null as string | null,
    plan_start_date:    colToInputValue(0),
    plan_end_date:      colToInputValue(10),
    actual_start_date:  '',
    actual_end_date:    '',
    status_override:    null as ActivityStatusOverride | null,
    remarks:            null as string | null,
    wbs_code:           null as string | null,
    is_wbs_summary:     false,
  })

  const [evmForm, setEvmForm] = useState({
    bac:         '' as string,
    bac_unit:    'hours',
    actual_pct:  '' as string,
    actual_cost: '' as string,
  })

  const [addPersonId, setAddPersonId]     = useState('')
  const [addRole, setAddRole]             = useState<AssignmentRole>('MEMBER')
  const [conflictWarning, setConflict]    = useState<string | null>(null)
  const [preAddConflict, setPreAddConflict] = useState<{ message: string } | null>(null)
  const [showAvailable, setShowAvail]     = useState(false)
  const [availablePersons, setAvailable]  = useState<Person[] | null>(null)

  // EVM data for this activity
  const { data: activityEVM, refetch: refetchEVM } = useQuery({
    queryKey: ['activityEVM', activity?.id],
    queryFn:  () => evmApi.getActivityEVM(activity!.id),
    enabled:  !!activity?.id && tab === 'evm',
    staleTime: 30_000,
  })

  // Sync form when activity changes
  useEffect(() => {
    if (!activity) return
    setForm({
      name:              activity.name,
      group_type:        activity.group_type,
      plan_start_date:   colToInputValue(activity.plan_start_col),
      plan_end_date:     colToInputValue(activity.plan_end_col),
      actual_start_date: activity.actual_start_col != null ? colToInputValue(activity.actual_start_col) : '',
      actual_end_date:   activity.actual_end_col   != null ? colToInputValue(activity.actual_end_col)   : '',
      status_override:   activity.status_override,
      remarks:           activity.remarks,
      wbs_code:          activity.wbs_code,
      is_wbs_summary:    activity.is_wbs_summary ?? false,
    })
    setTab('schedule')
    setConflict(null)
    setPreAddConflict(null)
    setAvailable(null)
    setShowAvail(false)
  }, [activity?.id])

  // Sync EVM form when EVM data loads
  useEffect(() => {
    if (!activityEVM) return
    setEvmForm({
      bac:         activityEVM.bac != null ? String(activityEVM.bac) : '',
      bac_unit:    activityEVM.bac_unit ?? 'hours',
      actual_pct:  activityEVM.actual_pct != null ? String((activityEVM.actual_pct * 100).toFixed(0)) : '',
      actual_cost: activityEVM.actual_cost != null ? String(activityEVM.actual_cost) : '',
    })
  }, [activityEVM?.activity_id])

  // Live EVM computation (updates as user types)
  const liveEVM = useMemo(() => {
    const bac = parseFloat(evmForm.bac) || 0
    const pct = parseFloat(evmForm.actual_pct) || 0
    const ac  = parseFloat(evmForm.actual_cost) || 0
    const plannedPct = activityEVM?.planned_pct ?? 0

    const pv  = bac * plannedPct
    const ev  = bac * pct / 100
    const spi = pv > 0 ? ev / pv : null
    const cpi = ac > 0 ? ev / ac : null
    const eac = cpi != null && cpi > 0 ? bac / cpi : bac || null
    return { pv, ev, spi, cpi, eac }
  }, [evmForm, activityEVM?.planned_pct])

  // Derive col values from date strings
  const planStartCol   = form.plan_start_date   ? dateToCol(form.plan_start_date)   : 0
  const planEndCol     = form.plan_end_date      ? dateToCol(form.plan_end_date)     : 0
  const actualStartCol = form.actual_start_date  ? dateToCol(form.actual_start_date) : null
  const actualEndCol   = form.actual_end_date    ? dateToCol(form.actual_end_date)   : null

  // Live computed status preview
  const liveStatus = useMemo(() => {
    if (!activity) return 'PENDING'
    return computeStatus({
      ...activity,
      status_override:  form.status_override ?? null,
      actual_start_col: actualStartCol,
      actual_end_col:   actualEndCol,
      plan_start_col:   planStartCol,
      plan_end_col:     planEndCol,
    })
  }, [form, activity])

  const queryClient = useQueryClient()

  const updateMut = useMutation({
    mutationFn: () => activitiesApi.update(activity!.id, {
      name:             form.name,
      group_type:       form.group_type,
      plan_start_col:   planStartCol,
      plan_end_col:     planEndCol,
      actual_start_col: actualStartCol,
      actual_end_col:   actualEndCol,
      status_override:  form.status_override,
      remarks:          form.remarks,
      wbs_code:         form.wbs_code || null,
      is_wbs_summary:   form.is_wbs_summary,
    }),
    onSuccess: (updated) => {
      toast.success('Activity updated')
      onSaved(updated)
      onClose()
    },
    onError: (e: any) => toast.error(e?.message ?? 'Update failed'),
  })

  const evmMut = useMutation({
    mutationFn: () => {
      const payload: UpdateActivityEVMPayload = {
        bac:        evmForm.bac !== ''         ? parseFloat(evmForm.bac)         : null,
        bac_unit:   evmForm.bac_unit,
        actual_pct: evmForm.actual_pct !== ''  ? parseFloat(evmForm.actual_pct) / 100 : null,
        actual_cost: evmForm.actual_cost !== '' ? parseFloat(evmForm.actual_cost) : null,
      }
      return evmApi.updateActivityEVM(activity!.id, payload)
    },
    onSuccess: () => {
      toast.success('EVM data saved')
      refetchEVM()
      queryClient.invalidateQueries({ queryKey: ['projectEVM'] })
      queryClient.invalidateQueries({ queryKey: ['pms'] })
    },
    onError: (e: any) => toast.error(e?.message ?? 'EVM save failed'),
  })

  const addMut = useMutation({
    mutationFn: () =>
      assignmentsApi.create({
        activity_id: activity!.id,
        person_id:   addPersonId,
        role:        addRole,
      }),
    onSuccess: (result) => {
      if (result.conflict_warning) setConflict(result.conflict_warning)
      else setConflict(null)
      toast.success('Person assigned')
      onAssignmentChange()
      setAddPersonId('')
    },
    onError: (e: any) => toast.error(e?.message ?? 'Assignment failed'),
  })

  const removeMut = useMutation({
    mutationFn: (id: string) => assignmentsApi.delete(id),
    onSuccess: () => { toast.success('Removed'); onAssignmentChange() },
    onError: (e: any) => toast.error(e?.message ?? 'Remove failed'),
  })

  const roleMut = useMutation({
    mutationFn: ({ id, role }: { id: string; role: AssignmentRole }) =>
      assignmentsApi.updateRole(id, role),
    onSuccess: () => onAssignmentChange(),
  })

  const handleShowAvailable = async () => {
    try {
      const avail = await personsApi.available(
        planStartCol ?? undefined,
        planEndCol   ?? undefined,
        projectId,
      )
      setAvailable(avail)
      setShowAvail(true)
    } catch { toast.error('Could not fetch available persons') }
  }

  const handlePersonSelect = async (personId: string) => {
    setAddPersonId(personId)
    setPreAddConflict(null)
    if (!personId || !activity) return
    try {
      const conflict = await personsApi.checkConflict(personId, activity.id)
      if (conflict) setPreAddConflict({ message: conflict.message })
    } catch { /* conflict check is best-effort */ }
  }

  const handleAddPerson = () => {
    setPreAddConflict(null)
    addMut.mutate()
  }

  if (!activity) return null

  const assignedIds = new Set(activity.assignments.map((a) => a.person_id))
  const personPool  = (showAvailable && availablePersons ? availablePersons : persons)
    .filter((p) => !assignedIds.has(p.id))

  const setField = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[490px] bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Edit Activity</h2>
            <p className="text-xs text-gray-400 truncate max-w-xs">{activity.name}</p>
          </div>
          <button onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-6">
          {(['schedule', 'people', 'evm'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors
                ${tab === t ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {t === 'evm' ? 'EVM' : t}
              {t === 'people' && activity.assignments.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 bg-blue-100 text-blue-600 text-[10px] rounded-full font-semibold">
                  {activity.assignments.length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4">

          {/* ── Schedule tab ──────────────────────────────────────── */}
          {tab === 'schedule' && (
            <div className="space-y-4">

              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Activity Name</label>
                <input
                  type="text" value={form.name ?? ''}
                  onChange={(e) => setField('name', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                    focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Planned dates */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">
                  Planned Dates <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">Start Date</label>
                    <input
                      type="date"
                      value={form.plan_start_date}
                      onChange={(e) => setField('plan_start_date', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                        focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">End Date</label>
                    <input
                      type="date"
                      value={form.plan_end_date}
                      onChange={(e) => setField('plan_end_date', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                        focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                {planStartCol > planEndCol && (
                  <p className="text-xs text-red-500 mt-1">End date must be after start date.</p>
                )}
              </div>

              {/* Actual dates */}
              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">
                  Actual Dates
                  <span className="ml-1 text-[11px] font-normal text-gray-400">(fill in as work progresses)</span>
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">Actual Start</label>
                    <input
                      type="date"
                      value={form.actual_start_date}
                      onChange={(e) => setField('actual_start_date', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                        focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">Actual End</label>
                    <input
                      type="date"
                      value={form.actual_end_date}
                      onChange={(e) => setField('actual_end_date', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                        focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-[10px] text-gray-400 mt-0.5">Leave blank if still in progress</p>
                  </div>
                </div>
              </div>

              {/* Status override */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Status Override</label>
                <select
                  value={form.status_override ?? ''}
                  onChange={(e) => setField('status_override', (e.target.value || null) as ActivityStatusOverride | null)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                    focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Remarks</label>
                <textarea
                  rows={3} value={form.remarks ?? ''}
                  onChange={(e) => setField('remarks', e.target.value || null)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                    focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* WBS Hierarchy */}
              <div className="border-t border-gray-100 pt-3 space-y-3">
                <p className="text-[10px] uppercase font-semibold text-gray-400 tracking-wider">WBS Hierarchy</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">WBS Code</label>
                    <input
                      type="text"
                      value={form.wbs_code ?? ''}
                      onChange={(e) => setField('wbs_code', e.target.value || null)}
                      placeholder="e.g. 1.2.3"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono
                        focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">WBS Level</label>
                    <div className="px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-500 border border-gray-200">
                      {form.wbs_code
                        ? `Level ${(form.wbs_code.split('.').length)}`
                        : activity.wbs_level ? `Level ${activity.wbs_level}` : '—'
                      }
                    </div>
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.is_wbs_summary}
                    onChange={(e) => setField('is_wbs_summary', e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 accent-blue-600"
                  />
                  <span className="text-xs text-gray-600">Is WBS summary row</span>
                  <span className="text-[10px] text-gray-400">
                    (shows rollup bar, collapsible)
                  </span>
                </label>
              </div>

              {/* Live computed status */}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs text-gray-500">Computed status:</span>
                <span
                  className="px-2 py-0.5 rounded-full text-xs font-semibold text-white"
                  style={{ backgroundColor: STATUS_COLOR[liveStatus] ?? '#94a3b8' }}
                >
                  {liveStatus}
                </span>
              </div>
            </div>
          )}

          {/* ── People tab ──────────────────────────────────────── */}
          {tab === 'people' && (
            <div className="space-y-4">

              {/* Conflict warning */}
              {conflictWarning && (
                <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                  <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">{conflictWarning}</p>
                </div>
              )}

              {/* Available toggle */}
              <button
                onClick={handleShowAvailable}
                className="text-xs text-blue-600 hover:underline font-medium"
              >
                {showAvailable ? 'Show all persons' : 'Show available persons for this date range'}
              </button>
              {showAvailable && (
                <button onClick={() => { setShowAvail(false); setAvailable(null) }}
                  className="ml-2 text-xs text-gray-400 hover:underline">Reset</button>
              )}

              {/* Add person */}
              <div className="space-y-2">
                <div className="flex gap-2">
                  <select
                    value={addPersonId}
                    onChange={(e) => handlePersonSelect(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select person...</option>
                    {personPool.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.role} · {p.department}
                      </option>
                    ))}
                  </select>
                  <select
                    value={addRole}
                    onChange={(e) => setAddRole(e.target.value as AssignmentRole)}
                    className="border border-gray-300 rounded-lg px-2 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="MEMBER">Member</option>
                    <option value="LEAD">Lead</option>
                  </select>
                  {!preAddConflict && (
                    <Button
                      size="sm" onClick={handleAddPerson}
                      disabled={!addPersonId}
                      loading={addMut.isPending}
                    >
                      <UserPlus size={14} />
                    </Button>
                  )}
                </div>

                {/* Pre-add conflict warning */}
                {preAddConflict && (
                  <div className="px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-start gap-2 mb-2">
                      <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-700">
                        <span className="font-semibold">Scheduling conflict:</span> {preAddConflict.message}.
                        {' '}There is an overlap. Add anyway?
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setPreAddConflict(null); setAddPersonId('') }}
                        className="flex-1 px-2 py-1 text-xs font-medium text-gray-600
                          border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleAddPerson}
                        disabled={addMut.isPending}
                        className="flex-1 px-2 py-1 text-xs font-medium text-amber-700
                          border border-amber-300 bg-amber-100 rounded-lg hover:bg-amber-200"
                      >
                        Add anyway
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Current assignments */}
              {activity.assignments.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No one assigned yet.</p>
              ) : (
                <div className="space-y-2">
                  {activity.assignments.map((a: Assignment) => {
                    const person = persons.find((p) => p.id === a.person_id)
                    const name   = person?.name ?? '—'
                    return (
                      <div key={a.id}
                        className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                          style={{ backgroundColor: nameColor(name) }}
                        >
                          {initials(name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-800 truncate">{name}</p>
                          <p className="text-[10px] text-gray-400 truncate">
                            {person?.role} · {person?.department}
                          </p>
                        </div>
                        <select
                          value={a.role}
                          onChange={(e) => roleMut.mutate({ id: a.id, role: e.target.value as AssignmentRole })}
                          className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white
                            focus:outline-none focus:ring-1 focus:ring-blue-400"
                        >
                          <option value="MEMBER">Member</option>
                          <option value="LEAD">Lead</option>
                        </select>
                        <button
                          onClick={() => removeMut.mutate(a.id)}
                          className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── EVM tab ────────────────────────────────────────── */}
          {tab === 'evm' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-400">
                Set the Budget at Completion (BAC) and track actual progress.
                SPI/CPI will be computed automatically.
              </p>

              {/* BAC */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    BAC — Budget at Completion
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={evmForm.bac}
                    onChange={(e) => setEvmForm((f) => ({ ...f, bac: e.target.value }))}
                    placeholder="e.g. 100"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Unit</label>
                  <select
                    value={evmForm.bac_unit}
                    onChange={(e) => setEvmForm((f) => ({ ...f, bac_unit: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    {['Hours', 'INR', 'USD', 'Tonnes', 'm²'].map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Actual % complete */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Actual % Complete (0–100)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={evmForm.actual_pct || '0'}
                    onChange={(e) => setEvmForm((f) => ({ ...f, actual_pct: e.target.value }))}
                    className="flex-1 accent-blue-600"
                  />
                  <div className="relative w-20">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={evmForm.actual_pct}
                      onChange={(e) => setEvmForm((f) => ({ ...f, actual_pct: e.target.value }))}
                      placeholder="0"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                        focus:outline-none focus:ring-2 focus:ring-blue-500 pr-7"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                  </div>
                </div>
              </div>

              {/* Actual cost */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Actual Cost (AC) — leave blank if unknown
                </label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={evmForm.actual_cost}
                  onChange={(e) => setEvmForm((f) => ({ ...f, actual_cost: e.target.value }))}
                  placeholder={`in ${evmForm.bac_unit}`}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                    focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Live EVM preview (updates as you type) */}
              <div className="border-t border-gray-100 pt-3 space-y-2">
                <p className="text-[10px] uppercase font-semibold text-gray-400 tracking-wider">Live Preview</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-blue-50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-gray-400">PV (BCWS)</p>
                    <p className="text-sm font-bold text-blue-700">{liveEVM.pv.toFixed(1)}</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-gray-400">EV (BCWP)</p>
                    <p className="text-sm font-bold text-green-700">{liveEVM.ev.toFixed(1)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'SPI', val: liveEVM.spi },
                    { label: 'CPI', val: liveEVM.cpi },
                    { label: 'EAC', val: liveEVM.eac },
                  ].map(({ label, val }) => {
                    const isIndex = label === 'SPI' || label === 'CPI'
                    const color = isIndex && val != null
                      ? (val >= 1 ? 'text-green-600' : val >= 0.8 ? 'text-amber-600' : 'text-red-600')
                      : 'text-gray-700'
                    return (
                      <div key={label} className="bg-gray-50 rounded-lg p-2 text-center">
                        <p className="text-[10px] text-gray-400">{label}</p>
                        <p className={`text-sm font-semibold ${color}`}>
                          {val != null ? val.toFixed(isIndex ? 2 : 1) : '—'}
                        </p>
                      </div>
                    )
                  })}
                </div>
                {activityEVM?.planned_pct != null && (
                  <p className="text-[10px] text-gray-400 text-center">
                    Planned % today: {(activityEVM.planned_pct * 100).toFixed(0)}%
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          {tab === 'schedule' && (
            <Button
              loading={updateMut.isPending}
              disabled={!form.name.trim() || planStartCol > planEndCol}
              onClick={() => updateMut.mutate()}
            >
              Save Changes
            </Button>
          )}
          {tab === 'people' && (
            <Button variant="secondary" onClick={onClose}>Close</Button>
          )}
          {tab === 'evm' && (
            <Button
              loading={evmMut.isPending}
              onClick={() => evmMut.mutate()}
            >
              Save EVM
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
