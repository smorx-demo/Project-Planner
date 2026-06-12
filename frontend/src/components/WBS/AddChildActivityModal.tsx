import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { format } from 'date-fns'
import { wbsApi } from '../../api/wbs'
import { Button } from '../UI/Button'
import { colToDate, TODAY_COL } from '../../store/projectStore'
import type { ActivityWithStatus } from '../../types'

const EPOCH = new Date(2026, 2, 25)

function dateToCol(dateStr: string): number {
  const d = new Date(dateStr)
  return Math.max(0, Math.round((d.getTime() - EPOCH.getTime()) / (24 * 60 * 60 * 1000)))
}

function colToInputValue(col: number): string {
  return format(colToDate(col), 'yyyy-MM-dd')
}

const GROUP_OPTIONS = [
  'Engineering', 'Procurement', 'QC', 'Production',
  'Welding', 'Machining', 'Surface', 'Dispatch',
]

interface AddChildActivityModalProps {
  parent:    ActivityWithStatus
  projectId: string
  onClose:   () => void
  onCreated: (activity: ActivityWithStatus) => void
}

export function AddChildActivityModal({
  parent, projectId, onClose, onCreated,
}: AddChildActivityModalProps) {
  const queryClient = useQueryClient()

  const [form, setForm] = useState({
    name:            '',
    plan_start_date: colToInputValue(parent.plan_start_col),
    plan_end_date:   colToInputValue(parent.plan_end_col),
    group_type:      parent.group_type ?? '',
    is_wbs_summary:  false,
    remarks:         '',
    bac:             '',
    bac_unit:        'hours',
  })

  const planStartCol = form.plan_start_date ? dateToCol(form.plan_start_date) : 0
  const planEndCol   = form.plan_end_date   ? dateToCol(form.plan_end_date)   : 0

  const createMut = useMutation({
    mutationFn: () => wbsApi.createChild(parent.id, {
      name:           form.name.trim(),
      plan_start_col: planStartCol,
      plan_end_col:   planEndCol,
      group_type:     form.group_type || null,
      is_wbs_summary: form.is_wbs_summary,
      remarks:        form.remarks || null,
      bac:            form.bac !== '' ? parseFloat(form.bac) : null,
      bac_unit:       form.bac_unit,
    }),
    onSuccess: (created) => {
      toast.success('Child activity created')
      queryClient.invalidateQueries({ queryKey: ['activities', projectId] })
      onCreated(created)
      onClose()
    },
    onError: (e: Error) => toast.error(e.message ?? 'Failed to create child activity'),
  })

  const setField = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const canSubmit = form.name.trim().length > 0 && planStartCol <= planEndCol

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Add Child Activity</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Under: <span className="font-medium text-gray-600">{parent.name}</span>
              {parent.wbs_code && (
                <span className="ml-1.5 font-mono text-gray-400">{parent.wbs_code}</span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Activity Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="Enter activity name"
              autoFocus
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

          {/* Group type */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Group / Department</label>
            <select
              value={form.group_type}
              onChange={(e) => setField('group_type', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white
                focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">None</option>
              {GROUP_OPTIONS.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          {/* Is summary + BAC in a row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">BAC</label>
              <div className="flex gap-2">
                <input
                  type="number" min={0} step="any"
                  value={form.bac}
                  onChange={(e) => setField('bac', e.target.value)}
                  placeholder="optional"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm
                    focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <select
                  value={form.bac_unit}
                  onChange={(e) => setField('bac_unit', e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-2 text-xs bg-white
                    focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {['hours', 'INR', 'USD', 'Tonnes', 'm²'].map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.is_wbs_summary}
                  onChange={(e) => setField('is_wbs_summary', e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 accent-blue-600"
                />
                <span className="text-xs text-gray-600">Is summary row</span>
              </label>
              <p className="text-[10px] text-gray-400 mt-0.5">
                Summary rows show rollup bars and collapse/expand
              </p>
            </div>
          </div>

          {/* Remarks */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Remarks</label>
            <textarea
              rows={2}
              value={form.remarks}
              onChange={(e) => setField('remarks', e.target.value)}
              placeholder="Optional notes"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={createMut.isPending}
            disabled={!canSubmit}
            onClick={() => createMut.mutate()}
          >
            Create Child
          </Button>
        </div>
      </div>
    </div>
  )
}
