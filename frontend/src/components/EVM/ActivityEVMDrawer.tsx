import { useState, useEffect, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Loader2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { evmApi } from '../../api/evm'
import type { ActivityEVM } from '../../types'

const BAC_UNITS = ['Hours', 'INR', 'USD', 'Tonnes', 'm²']

function IndexBadge({ label, value }: { label: string; value: number | null }) {
  if (value == null) return (
    <div className="text-center">
      <p className="text-[10px] text-gray-400">{label}</p>
      <p className="text-base font-bold text-gray-400">—</p>
    </div>
  )
  const color = value >= 1 ? 'text-green-600' : value >= 0.8 ? 'text-amber-600' : 'text-red-600'
  const bg    = value >= 1 ? 'bg-green-50'  : value >= 0.8 ? 'bg-amber-50'  : 'bg-red-50'
  return (
    <div className={`${bg} rounded-lg py-2 px-3 text-center`}>
      <p className="text-[10px] text-gray-500 mb-0.5">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value.toFixed(2)}</p>
    </div>
  )
}

interface Props {
  activity: ActivityEVM
  onClose: () => void
  onSaved: () => void
}

export function ActivityEVMDrawer({ activity, onClose, onSaved }: Props) {
  const queryClient = useQueryClient()

  const [form, setForm] = useState({
    bac:         activity.bac != null ? String(activity.bac) : '',
    bac_unit:    activity.bac_unit ?? 'Hours',
    actual_pct:  activity.actual_pct != null ? String((activity.actual_pct * 100).toFixed(0)) : '',
    actual_cost: activity.actual_cost != null ? String(activity.actual_cost) : '',
  })

  useEffect(() => {
    setForm({
      bac:         activity.bac != null ? String(activity.bac) : '',
      bac_unit:    activity.bac_unit ?? 'Hours',
      actual_pct:  activity.actual_pct != null ? String((activity.actual_pct * 100).toFixed(0)) : '',
      actual_cost: activity.actual_cost != null ? String(activity.actual_cost) : '',
    })
  }, [activity.activity_id])

  // Live EVM preview
  const live = useMemo(() => {
    const bac  = parseFloat(form.bac)  || 0
    const pct  = parseFloat(form.actual_pct)  || 0
    const ac   = parseFloat(form.actual_cost) || 0
    const plannedPct = activity.planned_pct ?? 0  // server-computed from plan dates

    const pv = bac * plannedPct
    const ev = bac * pct / 100
    const spi = pv > 0 ? ev / pv : null
    const cpi = ac > 0 ? ev / ac : null
    const eac = cpi != null && cpi > 0 ? bac / cpi : bac > 0 ? bac : null

    return { pv, ev, spi, cpi, eac }
  }, [form, activity.planned_pct])

  const mut = useMutation({
    mutationFn: () =>
      evmApi.updateActivityEVM(activity.activity_id, {
        bac:         form.bac !== ''         ? parseFloat(form.bac)         : null,
        bac_unit:    form.bac_unit.toLowerCase(),
        actual_pct:  form.actual_pct !== ''  ? parseFloat(form.actual_pct) / 100 : null,
        actual_cost: form.actual_cost !== '' ? parseFloat(form.actual_cost) : null,
      }),
    onSuccess: () => {
      toast.success('EVM saved')
      queryClient.invalidateQueries({ queryKey: ['projectEVM'] })
      queryClient.invalidateQueries({ queryKey: ['activityEVM', activity.activity_id] })
      queryClient.invalidateQueries({ queryKey: ['pms'] })
      onSaved()
      onClose()
    },
    onError: (e: Error) => toast.error(e.message || 'Save failed'),
  })

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-80 bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">EVM — {activity.activity_name}</p>
            <p className="text-xs text-gray-400 mt-0.5">Budget & progress tracking</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 shrink-0">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* BAC */}
          <div className="grid grid-cols-5 gap-2">
            <div className="col-span-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                BAC — Budget at Completion
              </label>
              <input
                type="number"
                min={0}
                step="any"
                value={form.bac}
                onChange={(e) => setForm((f) => ({ ...f, bac: e.target.value }))}
                placeholder="e.g. 100"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                  focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Unit</label>
              <select
                value={form.bac_unit}
                onChange={(e) => setForm((f) => ({ ...f, bac_unit: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                  focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {BAC_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          {/* Actual % complete */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">
              Actual % Complete
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={form.actual_pct || '0'}
                onChange={(e) => setForm((f) => ({ ...f, actual_pct: e.target.value }))}
                className="flex-1 accent-blue-600"
              />
              <div className="relative w-16 shrink-0">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={form.actual_pct}
                  onChange={(e) => setForm((f) => ({ ...f, actual_pct: e.target.value }))}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm
                    focus:outline-none focus:ring-2 focus:ring-blue-500 pr-6"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
              </div>
            </div>
          </div>

          {/* Actual cost */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Actual Cost / Hours (AC)
              <span className="ml-1 text-gray-400 font-normal">— leave blank if unknown</span>
            </label>
            <input
              type="number"
              min={0}
              step="any"
              value={form.actual_cost}
              onChange={(e) => setForm((f) => ({ ...f, actual_cost: e.target.value }))}
              placeholder={`in ${form.bac_unit}`}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Live preview */}
          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">Live Preview</p>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-blue-50 rounded-lg p-2.5 text-center">
                <p className="text-[10px] text-gray-400">PV (BCWS)</p>
                <p className="text-base font-bold text-blue-700">
                  {live.pv.toFixed(1)} <span className="text-xs font-normal">{form.bac_unit}</span>
                </p>
              </div>
              <div className="bg-green-50 rounded-lg p-2.5 text-center">
                <p className="text-[10px] text-gray-400">EV (BCWP)</p>
                <p className="text-base font-bold text-green-700">
                  {live.ev.toFixed(1)} <span className="text-xs font-normal">{form.bac_unit}</span>
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <IndexBadge label="SPI" value={live.spi} />
              <IndexBadge label="CPI" value={live.cpi} />
              <div className="bg-gray-50 rounded-lg py-2 px-3 text-center">
                <p className="text-[10px] text-gray-400 mb-0.5">EAC</p>
                <p className="text-base font-bold text-gray-700">
                  {live.eac != null ? live.eac.toFixed(1) : '—'}
                </p>
              </div>
            </div>
            {activity.planned_pct != null && (
              <p className="text-[10px] text-gray-400 mt-2 text-center">
                Planned % today: {(activity.planned_pct * 100).toFixed(0)}%
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 shrink-0">
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm text-gray-600 border border-gray-200
                rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => mut.mutate()}
              disabled={mut.isPending}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600
                rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50
                flex items-center justify-center gap-2"
            >
              {mut.isPending && <Loader2 size={13} className="animate-spin" />}
              Save EVM
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
