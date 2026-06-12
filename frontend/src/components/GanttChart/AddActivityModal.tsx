import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { format } from 'date-fns'
import { activitiesApi } from '../../api/activities'
import { colToDate } from '../../store/projectStore'
import { Button } from '../UI/Button'
import { useAppSetting } from '../../hooks/useAppSetting'
import type { ActivityWithStatus } from '../../types'

// ── Date ↔ Column helpers ─────────────────────────────────────────────────

const EPOCH = new Date(2026, 2, 25) // March 25, 2026

function dateToCol(dateStr: string): number {
  const d = new Date(dateStr)
  const diffMs = d.getTime() - EPOCH.getTime()
  return Math.max(0, Math.round(diffMs / (24 * 60 * 60 * 1000)))
}

function colToInputValue(col: number): string {
  const d = colToDate(col)
  return format(d, 'yyyy-MM-dd')
}

// ── Props ─────────────────────────────────────────────────────────────────

interface Props {
  projectId:    string
  nextSequence: number
  onClose:      () => void
  onCreated:    (activity: ActivityWithStatus) => void
}

// ── Component ─────────────────────────────────────────────────────────────

export function AddActivityModal({ projectId, nextSequence, onClose, onCreated }: Props) {
  const queryClient = useQueryClient()
  const departments = useAppSetting('departments')

  const [form, setForm] = useState({
    name:             '',
    group_type:       '',
    plan_start_date:  colToInputValue(0),
    plan_end_date:    colToInputValue(10),
    actual_start_date:'',
    actual_end_date:  '',
    remarks:          '',
  })

  const set = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }))

  // Derived col preview labels
  const planStartCol = dateToCol(form.plan_start_date)
  const planEndCol   = dateToCol(form.plan_end_date)

  const createMut = useMutation({
    mutationFn: () =>
      activitiesApi.create({
        project_id:    projectId,
        sequence_no:   nextSequence,
        name:          form.name.trim(),
        group_type:    form.group_type.trim() || null,
        plan_start_col: planStartCol,
        plan_end_col:   planEndCol,
        actual_start_col: form.actual_start_date ? dateToCol(form.actual_start_date) : null,
        actual_end_col:   form.actual_end_date   ? dateToCol(form.actual_end_date)   : null,
        remarks:          form.remarks.trim() || null,
      }),
    onSuccess: (activity) => {
      queryClient.invalidateQueries({ queryKey: ['activities', projectId] })
      toast.success('Activity added')
      onCreated(activity)
      onClose()
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to add activity'),
  })

  const valid = form.name.trim() && planStartCol <= planEndCol

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Add Activity</h2>
              <p className="text-xs text-gray-400 mt-0.5">Sequence #{nextSequence}</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">

            {/* Name */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Activity Name <span className="text-red-500">*</span>
              </label>
              <input
                autoFocus
                type="text"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="e.g. Raw Material Procurement"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                  focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Group */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Department / Group</label>
              <select
                value={form.group_type}
                onChange={(e) => set('group_type', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                  focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">— Select —</option>
                {departments.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>

            {/* Planned dates */}
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2">Planned Dates <span className="text-red-500">*</span></p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={form.plan_start_date}
                    onChange={(e) => set('plan_start_date', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">Col {planStartCol}</p>
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">End Date</label>
                  <input
                    type="date"
                    value={form.plan_end_date}
                    onChange={(e) => set('plan_end_date', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">Col {planEndCol}</p>
                </div>
              </div>
              {planStartCol > planEndCol && (
                <p className="text-xs text-red-500 mt-1">End date must be after start date.</p>
              )}
            </div>

            {/* Actual dates */}
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2">
                Actual Dates
                <span className="ml-1 text-[11px] font-normal text-gray-400">(optional — fill in as work progresses)</span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Actual Start</label>
                  <input
                    type="date"
                    value={form.actual_start_date}
                    onChange={(e) => set('actual_start_date', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Actual End</label>
                  <input
                    type="date"
                    value={form.actual_end_date}
                    onChange={(e) => set('actual_end_date', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Remarks */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Remarks</label>
              <input
                type="text"
                value={form.remarks}
                onChange={(e) => set('remarks', e.target.value)}
                placeholder="Any notes..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                  focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <Button
              loading={createMut.isPending}
              disabled={!valid}
              onClick={() => createMut.mutate()}
            >
              Add Activity
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
