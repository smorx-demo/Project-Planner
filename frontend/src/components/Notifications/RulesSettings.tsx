import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { notificationsApi } from '../../api/notifications'
import { projectsApi } from '../../api/projects'
import { Button } from '../UI/Button'
import type { NotificationType } from '../../types'

const TRIGGER_LABELS: Record<NotificationType, string> = {
  ACTIVITY_DELAYED:  'Activity Delayed',
  ACTIVITY_SLOW:     'Activity Slow',
  PERSON_OVERLOADED: 'Person Overloaded',
  PROJECT_BEHIND:    'Project Behind Schedule',
  DAILY_DIGEST:      'Daily Digest',
  CONFLICT_DETECTED: 'Conflict Detected',
}

const ALL_TRIGGERS = Object.entries(TRIGGER_LABELS) as [NotificationType, string][]
const ALL_CHANNELS = ['IN_APP', 'EMAIL', 'SMS'] as const

const CHANNEL_LABELS = { IN_APP: 'In-App', EMAIL: 'Email', SMS: 'SMS' }

const defaultForm = {
  trigger_type: 'ACTIVITY_DELAYED' as NotificationType,
  project_id: '',
  threshold_days: 0,
  channels: ['IN_APP'] as string[],
}

export function RulesSettings() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(defaultForm)

  const { data: rules = [] } = useQuery({
    queryKey: ['notif-rules'],
    queryFn: () => notificationsApi.listRules(),
  })

  const { data: projects = [] } = useQuery({
    queryKey: ['projects-list'],
    queryFn: () => projectsApi.list(),
  })

  const createMut = useMutation({
    mutationFn: () =>
      notificationsApi.createRule({
        trigger_type: form.trigger_type,
        project_id: form.project_id || undefined,
        threshold_days: form.threshold_days,
        channels: form.channels,
      }),
    onSuccess: () => {
      toast.success('Rule created')
      qc.invalidateQueries({ queryKey: ['notif-rules'] })
      setShowForm(false)
      setForm(defaultForm)
    },
    onError: () => toast.error('Failed to create rule'),
  })

  const toggleMut = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      notificationsApi.updateRule(id, { is_active: active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notif-rules'] }),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => notificationsApi.deleteRule(id),
    onSuccess: () => {
      toast.success('Rule deleted')
      qc.invalidateQueries({ queryKey: ['notif-rules'] })
    },
  })

  function toggleChannel(ch: string) {
    setForm((f) => ({
      ...f,
      channels: f.channels.includes(ch)
        ? f.channels.filter((c) => c !== ch)
        : [...f.channels, ch],
    }))
  }

  return (
    <div className="space-y-4">
      {/* Rules table */}
      {rules.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500">
                <th className="px-4 py-3">Trigger</th>
                <th className="px-4 py-3">Project</th>
                <th className="px-4 py-3">Threshold</th>
                <th className="px-4 py-3">Channels</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rules.map((r) => {
                const project = projects.find((p) => p.id === r.project_id)
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {TRIGGER_LABELS[r.trigger_type]}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {project ? project.name : 'All projects'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {r.threshold_days > 0 ? `≥ ${r.threshold_days}d` : 'Any'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {(r.channels || []).map((ch) => (
                          <span key={ch} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] rounded font-medium">
                            {CHANNEL_LABELS[ch as keyof typeof CHANNEL_LABELS] ?? ch}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleMut.mutate({ id: r.id, active: !r.is_active })}
                        className={`transition-colors ${r.is_active ? 'text-green-600' : 'text-gray-300'}`}
                      >
                        {r.is_active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => deleteMut.mutate(r.id)}
                        className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {rules.length === 0 && !showForm && (
        <p className="text-sm text-gray-400 text-center py-6">No alert rules configured yet.</p>
      )}

      {/* Add rule form */}
      {showForm ? (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <p className="text-sm font-semibold text-gray-700">New Alert Rule</p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Trigger</label>
              <select
                value={form.trigger_type}
                onChange={(e) => setForm((f) => ({ ...f, trigger_type: e.target.value as NotificationType }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {ALL_TRIGGERS.map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Project</label>
              <select
                value={form.project_id}
                onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Threshold — alert only when delayed by at least X days
            </label>
            <input
              type="number"
              min={0}
              value={form.threshold_days}
              onChange={(e) => setForm((f) => ({ ...f, threshold_days: Number(e.target.value) }))}
              className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Channels</label>
            <div className="flex gap-4">
              {ALL_CHANNELS.map((ch) => (
                <label key={ch} className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.channels.includes(ch)}
                    onChange={() => toggleChannel(ch)}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">
                    {CHANNEL_LABELS[ch]}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              loading={createMut.isPending}
              disabled={form.channels.length === 0}
              onClick={() => createMut.mutate()}
            >
              Save Rule
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => { setShowForm(false); setForm(defaultForm) }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => setShowForm(true)}>
          <Plus size={14} /> Add Rule
        </Button>
      )}
    </div>
  )
}
