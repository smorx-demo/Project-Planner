import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Plus, Trash2, AlertTriangle, Calendar, ExternalLink, Sparkles, RotateCcw } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { format } from 'date-fns'
import { Link } from 'react-router-dom'
import { personsApi } from '../../api/persons'
import { aiApi } from '../../api/ai'
import { colToDate, TODAY_COL } from '../../store/projectStore'
import { Button } from '../UI/Button'
import { ScoreGauge } from '../Performance/ScoreGauge'
import type { ActivityWithStatus, ConflictItem } from '../../types'

// ── Avatar helpers ────────────────────────────────────────────────────────
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

// ── Status colours ────────────────────────────────────────────────────────
const STATUS_BG: Record<string, string> = {
  DONE: '#4472C4', ON_TRACK: '#70AD47', SLOW: '#FFC000', DELAYED: '#FF0000', PENDING: '#9CA3AF',
}
const STATUS_LABEL: Record<string, string> = {
  DONE: 'Done', ON_TRACK: 'On Track', SLOW: 'Slow', DELAYED: 'Delayed', PENDING: 'Pending',
}

// ── Mini Gantt ─────────────────────────────────────────────────────────────
function MiniGantt({ activities }: { activities: ActivityWithStatus[] }) {
  if (activities.length === 0) {
    return <p className="text-xs text-gray-400 text-center py-6">No activities to display.</p>
  }

  const allCols: number[] = activities.flatMap((a) =>
    [a.plan_start_col, a.plan_end_col, a.actual_start_col, a.actual_end_col].filter(
      (c): c is number => c != null
    )
  )
  allCols.push(TODAY_COL)
  const minCol = Math.min(...allCols) - 2
  const maxCol = Math.max(...allCols) + 2
  const range = maxCol - minCol || 1

  const left = (col: number) => `${Math.max(0, ((col - minCol) / range) * 100)}%`
  const width = (s: number, e: number) => `${Math.max(0.5, ((e - s) / range) * 100)}%`
  const todayLeft = left(TODAY_COL)

  return (
    <div className="space-y-2 mt-2">
      {/* Date axis labels */}
      <div className="relative ml-28 h-4 text-[10px] text-gray-400">
        {[minCol, Math.round((minCol + maxCol) / 2), maxCol].map((col) => (
          <span
            key={col}
            className="absolute -translate-x-1/2"
            style={{ left: left(col) }}
          >
            {format(colToDate(col), 'dd MMM')}
          </span>
        ))}
      </div>

      {activities.map((act) => {
        const color = STATUS_BG[act.computed_status] ?? '#9CA3AF'
        const actEnd = act.actual_end_col ?? TODAY_COL
        const hasConflict = act.computed_status === 'DELAYED' || act.computed_status === 'SLOW'

        return (
          <div key={act.id} className="flex items-center gap-2 group">
            <div
              className={`w-28 shrink-0 text-xs text-right pr-2 truncate ${
                hasConflict ? 'text-red-600 font-medium' : 'text-gray-600'
              }`}
              title={act.name}
            >
              {act.name}
            </div>
            <div className="flex-1 relative" style={{ height: 22 }}>
              {/* Plan bar */}
              <div
                className="absolute top-0 h-2.5 rounded-sm opacity-75"
                style={{
                  backgroundColor: '#1F4E79',
                  left: left(act.plan_start_col),
                  width: width(act.plan_start_col, act.plan_end_col),
                }}
              />
              {/* Actual bar */}
              {act.actual_start_col != null && (
                <div
                  className="absolute bottom-0 h-2.5 rounded-sm"
                  style={{
                    backgroundColor: color,
                    left: left(act.actual_start_col),
                    width: width(act.actual_start_col, actEnd),
                  }}
                />
              )}
              {/* Today line */}
              <div
                className="absolute top-0 bottom-0 w-px bg-red-400 opacity-70"
                style={{ left: todayLeft }}
              />
            </div>
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: color }}
              title={STATUS_LABEL[act.computed_status]}
            />
          </div>
        )
      })}

      <div className="mt-2 flex items-center gap-3 text-[10px] text-gray-400 ml-28">
        <span className="flex items-center gap-1">
          <span className="w-4 h-1.5 rounded-sm inline-block bg-[#1F4E79] opacity-75" /> Plan
        </span>
        <span className="flex items-center gap-1">
          <span className="w-4 h-1.5 rounded-sm inline-block bg-green-500" /> Actual
        </span>
        <span className="flex items-center gap-1">
          <span className="w-px h-3 inline-block bg-red-400" /> Today
        </span>
      </div>
    </div>
  )
}

// ── ConflictList ──────────────────────────────────────────────────────────
function ConflictList({ conflicts }: { conflicts: ConflictItem[] }) {
  if (conflicts.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-green-600 py-2">
        <span className="w-2 h-2 rounded-full bg-green-500" />
        No scheduling conflicts
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {conflicts.map((c, i) => (
        <div key={i} className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertTriangle size={13} className="text-red-500 shrink-0 mt-0.5" />
          <div className="text-xs text-red-700">
            <span className="font-medium">{c.activity_a.name}</span>
            <span className="text-red-500"> overlaps with </span>
            <span className="font-medium">{c.activity_b.name}</span>
            <span className="text-red-400 ml-1">
              ({format(colToDate(c.overlap_start), 'dd MMM')}–{format(colToDate(c.overlap_end), 'dd MMM')})
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
interface PersonDetailDrawerProps {
  personId: string | null
  projectId?: string
  onClose: () => void
}

export function PersonDetailDrawer({ personId, projectId, onClose }: PersonDetailDrawerProps) {
  const [tab, setTab] = useState<'overview' | 'schedule' | 'leave' | 'ai'>('overview')
  const [insightText, setInsightText] = useState<string | null>(null)
  const [insightLoading, setInsightLoading] = useState(false)
  const [insightError, setInsightError] = useState<string | null>(null)
  const [leaveForm, setLeaveForm] = useState({ start_col: '', end_col: '', reason: '' })
  const queryClient = useQueryClient()

  const { data: workload, isLoading } = useQuery({
    queryKey: ['person-workload', personId, projectId],
    queryFn: () => personsApi.getWorkload(personId!, projectId),
    enabled: !!personId,
  })

  const addLeaveMut = useMutation({
    mutationFn: () =>
      personsApi.addLeave(personId!, {
        start_col: Number(leaveForm.start_col),
        end_col: Number(leaveForm.end_col),
        reason: leaveForm.reason,
      }),
    onSuccess: () => {
      toast.success('Leave added')
      setLeaveForm({ start_col: '', end_col: '', reason: '' })
      queryClient.invalidateQueries({ queryKey: ['person-workload', personId] })
      queryClient.invalidateQueries({ queryKey: ['persons'] })
    },
    onError: () => toast.error('Failed to add leave'),
  })

  const deleteLeaveMut = useMutation({
    mutationFn: (idx: number) => personsApi.deleteLeave(personId!, idx),
    onSuccess: () => {
      toast.success('Leave removed')
      queryClient.invalidateQueries({ queryKey: ['person-workload', personId] })
      queryClient.invalidateQueries({ queryKey: ['persons'] })
    },
    onError: () => toast.error('Failed to remove leave'),
  })

  if (!personId) return null

  const person = workload?.person
  const avatarColor = person ? nameColor(person.name) : '#94a3b8'

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-[380px] bg-white shadow-2xl z-50 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          {person ? (
            <>
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                style={{ backgroundColor: avatarColor }}
              >
                {initials(person.name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-900 truncate">{person.name}</p>
                <p className="text-xs text-gray-500 truncate">{person.role} · {person.department}</p>
              </div>
            </>
          ) : (
            <div className="flex-1">
              {isLoading && <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />}
            </div>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-5">
          {(['overview', 'schedule', 'leave', 'ai'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2.5 text-xs font-medium capitalize border-b-2 transition-colors
                ${tab === t ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {t === 'ai' ? <Sparkles size={11} className="inline mb-0.5" /> : t}
              {t === 'leave' && person && person.leave_schedule.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded-full">
                  {person.leave_schedule.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-5 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : !workload ? null : (
            <>
              {/* ── Overview ─────────────────────────────────────── */}
              {tab === 'overview' && (
                <div className="p-5 space-y-5">
                  {/* Metrics */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Score', value: `${person!.performance_score.toFixed(0)}%`, color: 'text-green-600' },
                      { label: 'On-time', value: `${person!.on_time_rate.toFixed(0)}%`, color: 'text-blue-600' },
                      { label: 'Avg delay', value: `${person!.avg_delay_days.toFixed(1)}d`, color: 'text-amber-600' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="bg-gray-50 rounded-xl p-3 text-center">
                        <p className={`text-base font-bold ${color}`}>{value}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Utilisation bar */}
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-500">Utilisation ({workload.active_now}/{person!.max_concurrent_tasks} active)</span>
                      <span className="font-semibold text-gray-700">{workload.utilization_pct}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          workload.utilization_pct >= 100 ? 'bg-red-500' :
                          workload.utilization_pct >= 75  ? 'bg-amber-400' : 'bg-green-500'
                        }`}
                        style={{ width: `${Math.min(workload.utilization_pct, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Skills */}
                  {person!.skills.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-2">Skills</p>
                      <div className="flex flex-wrap gap-1.5">
                        {person!.skills.map((s) => (
                          <span key={s} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[11px] rounded-full border border-blue-100">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Performance mini-section */}
                  <div className="border border-gray-100 rounded-xl p-3 bg-gray-50">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-gray-500">Performance</p>
                      <Link
                        to={`/performance?tab=person&person_id=${personId}`}
                        className="flex items-center gap-1 text-[11px] text-blue-600 hover:underline"
                      >
                        View full <ExternalLink size={10} />
                      </Link>
                    </div>
                    <div className="flex items-center gap-3">
                      <ScoreGauge score={person!.performance_score} size="sm" showLabel={false} />
                      <div className="space-y-1 text-xs">
                        <div className="flex gap-3">
                          <span className="text-gray-500">Score</span>
                          <span className="font-semibold text-gray-800">{person!.performance_score.toFixed(0)}</span>
                        </div>
                        <div className="flex gap-3">
                          <span className="text-gray-500">On-time</span>
                          <span className="font-semibold text-gray-800">{person!.on_time_rate.toFixed(0)}%</span>
                        </div>
                        <div className="flex gap-3">
                          <span className="text-gray-500">Avg delay</span>
                          <span className="font-semibold text-gray-800">{person!.avg_delay_days.toFixed(1)}d</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Conflicts */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">Scheduling Conflicts</p>
                    <ConflictList conflicts={workload.conflicts} />
                  </div>

                  {/* Assigned activities */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">
                      Assigned Activities ({workload.total_activities})
                    </p>
                    {workload.assigned_activities.length === 0 ? (
                      <p className="text-xs text-gray-400">None assigned.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {workload.assigned_activities.map((act) => (
                          <div key={act.id} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
                            <div
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: STATUS_BG[act.computed_status] ?? '#9CA3AF' }}
                            />
                            <p className="text-xs text-gray-800 flex-1 truncate">{act.name}</p>
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded-full text-white font-medium"
                              style={{ backgroundColor: STATUS_BG[act.computed_status] ?? '#9CA3AF' }}
                            >
                              {STATUS_LABEL[act.computed_status] ?? act.computed_status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Schedule ─────────────────────────────────────── */}
              {tab === 'schedule' && (
                <div className="p-5">
                  <MiniGantt activities={workload.assigned_activities} />
                </div>
              )}

              {/* ── Leave ───────────────────────────────────────── */}
              {tab === 'leave' && (
                <div className="p-5 space-y-4">
                  {/* Existing leave entries */}
                  {person!.leave_schedule.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">No leave scheduled.</p>
                  ) : (
                    <div className="space-y-2">
                      {person!.leave_schedule.map((entry, idx) => (
                        <div key={idx} className="flex items-start gap-3 px-3 py-2.5 bg-amber-50 border border-amber-100 rounded-lg">
                          <Calendar size={13} className="text-amber-500 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-800">
                              {format(colToDate(entry.start_col), 'dd MMM')}
                              {' – '}
                              {format(colToDate(entry.end_col), 'dd MMM')}
                            </p>
                            {entry.reason && (
                              <p className="text-[11px] text-gray-500 mt-0.5 truncate">{entry.reason}</p>
                            )}
                          </div>
                          <button
                            onClick={() => deleteLeaveMut.mutate(idx)}
                            disabled={deleteLeaveMut.isPending}
                            className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 shrink-0"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add leave form */}
                  <div className="border border-gray-200 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-semibold text-gray-700">Add Leave</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1">Start Col</label>
                        <input
                          type="number" min={0}
                          value={leaveForm.start_col}
                          onChange={(e) => setLeaveForm((f) => ({ ...f, start_col: e.target.value }))}
                          placeholder="e.g. 20"
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs
                            focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {leaveForm.start_col && (
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {format(colToDate(Number(leaveForm.start_col)), 'dd MMM yyyy')}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1">End Col</label>
                        <input
                          type="number" min={0}
                          value={leaveForm.end_col}
                          onChange={(e) => setLeaveForm((f) => ({ ...f, end_col: e.target.value }))}
                          placeholder="e.g. 25"
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs
                            focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {leaveForm.end_col && (
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {format(colToDate(Number(leaveForm.end_col)), 'dd MMM yyyy')}
                          </p>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-1">Reason</label>
                      <input
                        type="text"
                        value={leaveForm.reason}
                        onChange={(e) => setLeaveForm((f) => ({ ...f, reason: e.target.value }))}
                        placeholder="Annual leave, training..."
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs
                          focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <Button
                      size="sm"
                      className="w-full"
                      loading={addLeaveMut.isPending}
                      disabled={!leaveForm.start_col || !leaveForm.end_col}
                      onClick={() => addLeaveMut.mutate()}
                    >
                      <Plus size={13} /> Add Leave
                    </Button>
                  </div>
                </div>
              )}

              {/* ── AI Insight ───────────────────────────────────── */}
              {tab === 'ai' && (
                <div className="p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center">
                      <Sparkles size={12} className="text-purple-600" />
                    </div>
                    <p className="text-xs font-semibold text-gray-700">AI Insights</p>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Get AI-powered insights about {person?.name.split(' ')[0]}'s performance and workload.
                  </p>

                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { label: 'Performance summary', type: 'performance_summary' },
                      { label: 'Coaching tips', type: 'coaching_tips' },
                      { label: 'Workload assessment', type: 'workload_assessment' },
                    ].map(({ label, type }) => (
                      <button
                        key={type}
                        disabled={insightLoading}
                        onClick={async () => {
                          setInsightText(null)
                          setInsightError(null)
                          setInsightLoading(true)
                          try {
                            const res = await aiApi.personInsight(personId!, type)
                            setInsightText(res.insight)
                          } catch (err) {
                            setInsightError((err as Error).message || 'Failed to load insight')
                          } finally {
                            setInsightLoading(false)
                          }
                        }}
                        className="flex items-center gap-2 px-3 py-2.5 text-xs text-left
                          bg-purple-50 hover:bg-purple-100 border border-purple-100
                          text-purple-700 rounded-xl transition-colors disabled:opacity-50"
                      >
                        <Sparkles size={11} className="shrink-0" />
                        {label}
                      </button>
                    ))}
                  </div>

                  {insightLoading && (
                    <div className="flex items-center gap-2 py-3">
                      <div className="flex gap-1">
                        {[0, 1, 2].map((i) => (
                          <div
                            key={i}
                            className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce"
                            style={{ animationDelay: `${i * 0.15}s` }}
                          />
                        ))}
                      </div>
                      <span className="text-[11px] text-gray-400">Thinking...</span>
                    </div>
                  )}

                  {insightError && (
                    <div className="flex items-start gap-2 p-3 bg-red-50 rounded-xl border border-red-100">
                      <p className="text-xs text-red-600 flex-1">{insightError}</p>
                      <button
                        onClick={() => setInsightError(null)}
                        className="shrink-0 p-0.5 hover:bg-red-100 rounded text-red-400"
                      >
                        <RotateCcw size={11} />
                      </button>
                    </div>
                  )}

                  {insightText && (
                    <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                      <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">
                        {insightText}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
