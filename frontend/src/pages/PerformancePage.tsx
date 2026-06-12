import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams, Link } from 'react-router-dom'
import {
  Trophy, TrendingUp, TrendingDown, Minus, Users, BarChart2,
  CheckCircle2, Clock, AlertTriangle, XCircle,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { performanceApi } from '../api/performance'
import { personsApi } from '../api/persons'
import { ScoreGauge } from '../components/Performance/ScoreGauge'
import { TrendChart } from '../components/Performance/TrendChart'
import type { LeaderboardEntry, PersonPerformance } from '../types'

type Tab = 'person' | 'department' | 'leaderboard'

function scoreColor(score: number): string {
  if (score >= 70) return '#22c55e'
  if (score >= 40) return '#f97316'
  return '#ef4444'
}

function ScoreChangeBadge({ change }: { change: number }) {
  if (Math.abs(change) < 0.1) return <span className="text-gray-400 text-xs flex items-center gap-0.5"><Minus size={12} /> —</span>
  if (change > 0) return <span className="text-green-600 text-xs flex items-center gap-0.5"><TrendingUp size={12} />+{change.toFixed(1)}</span>
  return <span className="text-red-500 text-xs flex items-center gap-0.5"><TrendingDown size={12} />{change.toFixed(1)}</span>
}

function RankBadge({ rank }: { rank: number }) {
  const styles: Record<number, string> = {
    1: 'bg-yellow-100 border-yellow-400 text-yellow-700',
    2: 'bg-gray-100 border-gray-400 text-gray-600',
    3: 'bg-orange-100 border-orange-400 text-orange-700',
  }
  const cls = styles[rank] ?? 'bg-blue-50 border-blue-200 text-blue-700'
  return (
    <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold text-sm ${cls}`}>
      {rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : rank}
    </div>
  )
}

function MetricCard({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Person view ──────────────────────────────────────────────────────────────
function PersonView({ initialPersonId }: { initialPersonId?: string }) {
  const [personId, setPersonId] = useState(initialPersonId ?? '')

  const { data: persons } = useQuery({
    queryKey: ['persons-list'],
    queryFn: () => personsApi.list(),
  })

  const { data: perf, isLoading } = useQuery({
    queryKey: ['perf-person', personId],
    queryFn: () => performanceApi.getPerson(personId),
    enabled: !!personId,
  })

  const { data: history } = useQuery({
    queryKey: ['perf-history', personId],
    queryFn: () => performanceApi.getPersonHistory(personId, 90),
    enabled: !!personId,
  })

  return (
    <div className="space-y-6">
      {/* Selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Person</label>
        <select
          value={personId}
          onChange={(e) => setPersonId(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select a person…</option>
          {persons?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.department}
            </option>
          ))}
        </select>
      </div>

      {isLoading && (
        <div className="text-center py-16 text-gray-400">Loading…</div>
      )}

      {perf && (
        <>
          {/* Profile + Gauge */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6 flex flex-col md:flex-row gap-6">
            <div className="flex-1">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center text-xl font-bold text-blue-700">
                  {perf.person_name.charAt(0)}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{perf.person_name}</h2>
                  <p className="text-sm text-gray-500">{perf.role} · {perf.department}</p>
                  <p className="text-xs text-gray-400 mt-0.5">ID: {perf.employee_id}</p>
                  <div className="flex gap-1.5 flex-wrap mt-2">
                    {perf.skills.map((s) => (
                      <span key={s} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full">{s}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
                <MetricCard label="On-Time Rate" value={`${perf.on_time_rate.toFixed(1)}%`} />
                <MetricCard label="Avg Delay" value={`${perf.avg_delay_days.toFixed(1)}d`} />
                <MetricCard label="vs Last Week" value={<ScoreChangeBadge change={perf.score_change_vs_last_week} />} />
                <MetricCard label="Total Tasks" value={perf.total_tasks} />
                <MetricCard label="Completed" value={perf.completed_tasks} />
                <MetricCard label="Delayed" value={perf.delayed_tasks} />
              </div>
              {/* On-time bar */}
              <div className="mt-4">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>On-Time Completion</span>
                  <span>{perf.on_time_rate.toFixed(1)}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${perf.on_time_rate}%`, backgroundColor: scoreColor(perf.on_time_rate) }}
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-col items-center justify-center gap-1 min-w-[200px]">
              <p className="text-xs text-gray-500 font-medium">Performance Score</p>
              <ScoreGauge score={perf.performance_score} size="lg" />
            </div>
          </div>

          {/* Trend chart */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">90-Day Trend</h3>
            <TrendChart data={history ?? []} height={220} />
          </div>

          {/* Task table */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">Assigned Activities</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500">Activity</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500">Status</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {perf.activities.map((a) => (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{a.name}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={a.computed_status} />
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{a.remarks ?? '—'}</td>
                    </tr>
                  ))}
                  {perf.activities.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-gray-400">No activities assigned</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!personId && (
        <div className="text-center py-20 text-gray-400">
          <Users size={40} className="mx-auto mb-3 opacity-30" />
          <p>Select a person to view their performance</p>
        </div>
      )}
    </div>
  )
}

// ─── Department view ──────────────────────────────────────────────────────────
function DepartmentView() {
  const [dept, setDept] = useState('')

  const { data: persons } = useQuery({
    queryKey: ['persons-list'],
    queryFn: () => personsApi.list(),
  })

  const departments = [...new Set(persons?.map((p) => p.department) ?? [])]

  const { data: deptPerf, isLoading } = useQuery({
    queryKey: ['perf-dept', dept],
    queryFn: () => performanceApi.getDepartment(dept),
    enabled: !!dept,
  })

  const barData = deptPerf?.persons.map((p) => ({
    name: p.person_name.split(' ')[0],
    score: p.performance_score,
  })) ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Department</label>
        <select
          value={dept}
          onChange={(e) => setDept(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select a department…</option>
          {departments.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      {isLoading && <div className="text-center py-16 text-gray-400">Loading…</div>}

      {deptPerf && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <MetricCard label="Avg Score" value={deptPerf.avg_score.toFixed(1)} />
            <MetricCard label="Avg On-Time" value={`${deptPerf.avg_on_time_rate.toFixed(1)}%`} />
            <MetricCard label="Members" value={deptPerf.total_persons} />
          </div>

          {barData.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Score by Person</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={barData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => [typeof v === 'number' ? v.toFixed(1) : String(v), 'Score']} />
                  <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                    {barData.map((entry, i) => (
                      <Cell key={i} fill={scoreColor(entry.score)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {deptPerf.persons.map((p) => (
              <Link
                key={p.person_id}
                to={`/performance?tab=person&person_id=${p.person_id}`}
                className="bg-white rounded-xl border border-gray-100 p-4 hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center font-bold text-sm text-blue-700">
                    {p.person_name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{p.person_name}</p>
                    <p className="text-xs text-gray-400">{p.role}</p>
                  </div>
                  <ScoreGauge score={p.performance_score} size="sm" showLabel={false} />
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{p.completed_tasks}/{p.total_tasks} done</span>
                  <span className="font-semibold" style={{ color: scoreColor(p.performance_score) }}>
                    {p.performance_score.toFixed(0)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {!dept && (
        <div className="text-center py-20 text-gray-400">
          <BarChart2 size={40} className="mx-auto mb-3 opacity-30" />
          <p>Select a department to view performance</p>
        </div>
      )}
    </div>
  )
}

// ─── Leaderboard view ─────────────────────────────────────────────────────────
function LeaderboardView() {
  const [dept, setDept] = useState('')

  const { data: persons } = useQuery({
    queryKey: ['persons-list'],
    queryFn: () => personsApi.list(),
  })

  const departments = [...new Set(persons?.map((p) => p.department) ?? [])]

  const { data: entries, isLoading } = useQuery({
    queryKey: ['perf-leaderboard', dept],
    queryFn: () => performanceApi.getLeaderboard(dept || undefined, 10),
  })

  const rankBorder: Record<number, string> = {
    1: 'border-yellow-400 shadow-yellow-100',
    2: 'border-gray-300 shadow-gray-100',
    3: 'border-orange-400 shadow-orange-100',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Filter by dept</label>
        <select
          value={dept}
          onChange={(e) => setDept(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      {isLoading && <div className="text-center py-16 text-gray-400">Loading…</div>}

      <div className="space-y-3">
        {entries?.map((entry) => (
          <Link
            key={entry.person_id}
            to={`/performance?tab=person&person_id=${entry.person_id}`}
            className={`flex items-center gap-4 bg-white rounded-xl border-2 p-4 shadow-sm hover:shadow-md transition-all ${rankBorder[entry.rank] ?? 'border-gray-100 shadow-gray-50'}`}
          >
            <RankBadge rank={entry.rank} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-gray-900">{entry.person_name}</p>
                <ScoreChangeBadge change={entry.score_change_vs_last_week} />
              </div>
              <p className="text-xs text-gray-500">{entry.role} · {entry.department}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold" style={{ color: scoreColor(entry.performance_score) }}>
                {entry.performance_score.toFixed(0)}
              </p>
              <p className="text-xs text-gray-400">{entry.on_time_rate.toFixed(0)}% on-time</p>
            </div>
            <ScoreGauge score={entry.performance_score} size="sm" showLabel={false} />
          </Link>
        ))}
        {entries?.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <Trophy size={40} className="mx-auto mb-3 opacity-30" />
            <p>No data yet</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Status badge helper ──────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: React.ReactNode }> = {
    DONE:     { cls: 'bg-green-100 text-green-700',  icon: <CheckCircle2 size={11} /> },
    ON_TRACK: { cls: 'bg-blue-100 text-blue-700',    icon: <Clock size={11} /> },
    SLOW:     { cls: 'bg-orange-100 text-orange-700',icon: <AlertTriangle size={11} /> },
    DELAYED:  { cls: 'bg-red-100 text-red-700',      icon: <XCircle size={11} /> },
    PENDING:  { cls: 'bg-gray-100 text-gray-600',    icon: <Clock size={11} /> },
  }
  const { cls, icon } = map[status] ?? map.PENDING
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {icon}{status}
    </span>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export function PerformancePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = (searchParams.get('tab') as Tab) ?? 'leaderboard'
  const personId = searchParams.get('person_id') ?? undefined

  function setTab(t: Tab) {
    setSearchParams((prev) => {
      prev.set('tab', t)
      if (t !== 'person') prev.delete('person_id')
      return prev
    })
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'leaderboard', label: 'Leaderboard', icon: <Trophy size={15} /> },
    { id: 'person',      label: 'Person',      icon: <Users size={15} /> },
    { id: 'department',  label: 'Department',  icon: <BarChart2 size={15} /> },
  ]

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Performance Analytics</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track individual and team performance across projects</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 mb-6 w-fit">
          {tabs.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {icon}{label}
            </button>
          ))}
        </div>

        {tab === 'leaderboard' && <LeaderboardView />}
        {tab === 'person' && <PersonView initialPersonId={personId} />}
        {tab === 'department' && <DepartmentView />}
      </div>
    </div>
  )
}
