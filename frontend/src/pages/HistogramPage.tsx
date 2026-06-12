import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { ArrowLeft, Download, ChevronDown } from 'lucide-react'
import { format, startOfWeek } from 'date-fns'
import { projectsApi } from '../api/projects'
import { activitiesApi } from '../api/activities'
import { personsApi } from '../api/persons'
import { colToDate } from '../store/projectStore'
import { TableSkeleton } from '../components/UI/Skeleton'
import type { ActivityWithStatus, Person } from '../types'

// ── Constants ────────────────────────────────────────────────────────────────

type ViewMode   = 'headcount' | 'hours' | 'cost'
type PeriodMode = 'weekly' | 'monthly'

const DEPT_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#14b8a6',
  '#6366f1', '#a78bfa', '#fb7185', '#34d399', '#fbbf24',
]

// ── Period helpers ────────────────────────────────────────────────────────────

interface PeriodInfo { key: string; start: Date; end: Date }

function getAllPeriods(
  activities: ActivityWithStatus[],
  mode: PeriodMode,
): PeriodInfo[] {
  if (!activities.length) return []
  const starts = activities.map(a => colToDate(a.plan_start_col).getTime())
  const ends   = activities.map(a => colToDate(a.plan_end_col).getTime())
  const minMs  = Math.min(...starts)
  const maxMs  = Math.max(...ends)
  const minDate = new Date(minMs)
  const maxDate = new Date(maxMs)

  const periods: PeriodInfo[] = []

  if (mode === 'monthly') {
    const cur = new Date(minDate.getFullYear(), minDate.getMonth(), 1)
    while (cur <= maxDate) {
      const start = new Date(cur)
      const end   = new Date(cur.getFullYear(), cur.getMonth() + 1, 0)
      periods.push({ key: format(start, 'MMM yy'), start, end })
      cur.setMonth(cur.getMonth() + 1)
    }
  } else {
    // Weekly — start from Monday of minDate's week
    const cur = startOfWeek(minDate, { weekStartsOn: 1 })
    while (cur <= maxDate) {
      const start = new Date(cur)
      const end   = new Date(cur)
      end.setDate(end.getDate() + 6)
      periods.push({ key: format(start, 'dd MMM'), start, end })
      cur.setDate(cur.getDate() + 7)
    }
  }
  return periods
}

// ── Chart data computation ────────────────────────────────────────────────────

interface Bucket { persons: Set<string>; hours: number; cost: number }

function buildHistogram(
  activities:  ActivityWithStatus[],
  personsMap:  Record<string, Person>,
  periodMode:  PeriodMode,
  viewMode:    ViewMode,
  selectedDepts: string[],
): { data: Record<string, string | number>[]; allDepts: string[] } {
  // All departments from assigned persons
  const deptSet = new Set<string>()
  activities.forEach(a =>
    a.assignments.forEach(asgn => {
      const p = personsMap[asgn.person_id]
      if (p) deptSet.add(p.department)
    })
  )
  const allDepts = [...deptSet].sort()

  const periods = getAllPeriods(activities, periodMode)
  if (!periods.length) return { data: [], allDepts }

  // Init buckets
  const buckets: Record<string, Record<string, Bucket>> = {}
  periods.forEach(({ key }) => {
    buckets[key] = {}
    allDepts.forEach(d => { buckets[key][d] = { persons: new Set(), hours: 0, cost: 0 } })
  })

  activities.forEach(act => {
    const actStart   = colToDate(act.plan_start_col)
    const actEnd     = colToDate(act.plan_end_col)
    const actDurDays = Math.max(1, Math.round((actEnd.getTime() - actStart.getTime()) / 86_400_000) + 1)
    const nAssigned  = act.assignments.length || 1

    periods.forEach(({ key, start: pStart, end: pEnd }) => {
      if (actEnd < pStart || actStart > pEnd) return

      const oStart  = actStart > pStart ? actStart : pStart
      const oEnd    = actEnd   < pEnd   ? actEnd   : pEnd
      const oDays   = Math.max(1, Math.round((oEnd.getTime() - oStart.getTime()) / 86_400_000) + 1)

      act.assignments.forEach(asgn => {
        const person = personsMap[asgn.person_id]
        if (!person) return
        const dept   = person.department
        const bucket = buckets[key]?.[dept]
        if (!bucket) return
        bucket.persons.add(person.id)
        bucket.hours += oDays * 8
        if (act.bac != null) {
          bucket.cost += (act.bac / actDurDays) * oDays / nAssigned
        }
      })
    })
  })

  const activeDepts = allDepts.filter(d => selectedDepts.includes(d))

  const data = periods.map(({ key }) => {
    const row: Record<string, string | number> = { period: key }
    activeDepts.forEach(d => {
      const b = buckets[key]?.[d]
      if (!b) { row[d] = 0; return }
      if (viewMode === 'headcount') row[d] = b.persons.size
      else if (viewMode === 'hours') row[d] = Math.round(b.hours)
      else row[d] = Math.round(b.cost * 10) / 10
    })
    return row
  })

  return { data, allDepts }
}

// ── CSV export ────────────────────────────────────────────────────────────────

function exportCSV(
  data:      Record<string, string | number>[],
  depts:     string[],
  projectName: string,
  viewMode:  ViewMode,
) {
  const header = ['Period', ...depts].join(',')
  const rows   = data.map(row =>
    [row.period, ...depts.map(d => String(row[d] ?? 0))].join(',')
  )
  const csv  = [header, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `histogram_${projectName}_${viewMode}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Department multi-select ───────────────────────────────────────────────────

function DeptFilter({
  allDepts,
  selected,
  onChange,
}: {
  allDepts:  string[]
  selected:  string[]
  onChange:  (next: string[]) => void
}) {
  const [open, setOpen] = useState(false)

  function toggle(d: string) {
    onChange(selected.includes(d) ? selected.filter(x => x !== d) : [...selected, d])
  }

  const label = selected.length === allDepts.length
    ? 'All departments'
    : `${selected.length} of ${allDepts.length} departments`

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs
          text-gray-700 bg-white hover:bg-gray-50 transition-colors"
      >
        {label} <ChevronDown size={12} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-gray-200
            rounded-xl shadow-lg py-1.5 min-w-[180px] max-h-64 overflow-y-auto">
            <button
              onClick={() => onChange(allDepts)}
              className="w-full text-left px-3 py-1 text-xs text-blue-600 hover:bg-gray-50"
            >
              Select all
            </button>
            <button
              onClick={() => onChange([])}
              className="w-full text-left px-3 py-1 text-xs text-gray-500 hover:bg-gray-50"
            >
              Clear all
            </button>
            <div className="border-t border-gray-100 my-1" />
            {allDepts.map(d => (
              <label key={d} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(d)}
                  onChange={() => toggle(d)}
                  className="w-3 h-3 accent-blue-600"
                />
                <span className="text-xs text-gray-700">{d}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Radio group helper ────────────────────────────────────────────────────────

function RadioGroup<T extends string>({
  label, options, value, onChange,
}: {
  label:    string
  options:  { value: T; label: string }[]
  value:    T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 shrink-0">{label}:</span>
      <div className="flex gap-1">
        {options.map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              value === opt.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function HistogramPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate      = useNavigate()

  const [viewMode,   setViewMode]   = useState<ViewMode>('headcount')
  const [periodMode, setPeriodMode] = useState<PeriodMode>('weekly')
  const [selectedDepts, setSelectedDepts] = useState<string[]>([])
  const [deptsInitialized, setDeptsInitialized] = useState(false)

  const { data: project, isLoading: projLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn:  () => projectsApi.get(projectId!),
    enabled:  !!projectId,
  })

  const { data: activities = [], isLoading: actLoading } = useQuery({
    queryKey: ['activities', projectId],
    queryFn:  () => activitiesApi.listByProject(projectId!),
    enabled:  !!projectId,
  })

  const { data: persons = [] } = useQuery({
    queryKey: ['persons'],
    queryFn:  () => personsApi.list(),
    staleTime: 5 * 60_000,
  })

  const personsMap = useMemo(() => {
    const m: Record<string, Person> = {}
    persons.forEach(p => { m[p.id] = p })
    return m
  }, [persons])

  const { data: chartData, allDepts } = useMemo(() => {
    const result = buildHistogram(activities, personsMap, periodMode, viewMode, selectedDepts)
    // auto-initialize selection once allDepts is known
    if (!deptsInitialized && result.allDepts.length > 0) {
      setSelectedDepts(result.allDepts)
      setDeptsInitialized(true)
    }
    return result
  }, [activities, personsMap, periodMode, viewMode, selectedDepts, deptsInitialized])

  const activeDepts = allDepts.filter(d => selectedDepts.includes(d))

  const yAxisLabel = viewMode === 'headcount' ? 'Persons'
    : viewMode === 'hours' ? 'Hours'
    : 'BAC units'

  const isLoading = projLoading || actLoading

  const tickInterval = chartData.length > 20
    ? Math.ceil(chartData.length / 20)
    : 0

  function handleExport() {
    exportCSV(chartData, activeDepts, project?.name ?? 'project', viewMode)
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <TableSkeleton rows={6} cols={8} />
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 max-w-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 shrink-0"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-gray-900">Resource Histogram</h1>
          {project && (
            <p className="text-xs text-gray-500 mt-0.5">{project.name}</p>
          )}
        </div>
        <button
          onClick={handleExport}
          disabled={!chartData.length}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700
            bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40
            transition-colors shrink-0"
        >
          <Download size={13} /> Export CSV
        </button>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-xl border border-gray-100 px-5 py-3.5 shadow-sm mb-4
                      flex flex-wrap items-center gap-4">
        <RadioGroup
          label="View by"
          value={viewMode}
          onChange={v => setViewMode(v)}
          options={[
            { value: 'headcount', label: 'Headcount' },
            { value: 'hours',     label: 'Hours'     },
            { value: 'cost',      label: 'Cost'      },
          ]}
        />
        <RadioGroup
          label="Period"
          value={periodMode}
          onChange={v => setPeriodMode(v)}
          options={[
            { value: 'weekly',  label: 'Weekly'  },
            { value: 'monthly', label: 'Monthly' },
          ]}
        />
        {allDepts.length > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 shrink-0">Filter:</span>
            <DeptFilter
              allDepts={allDepts}
              selected={selectedDepts}
              onChange={setSelectedDepts}
            />
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
        {chartData.length === 0 || activeDepts.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-sm text-gray-400">
            {activities.length === 0
              ? 'No activities in this project yet.'
              : activeDepts.length === 0
                ? 'Select at least one department to display.'
                : 'No resource assignments found. Assign persons to activities to see the histogram.'
            }
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={380}>
              <BarChart
                data={chartData}
                margin={{ top: 8, right: 16, bottom: 56, left: 8 }}
                barCategoryGap="18%"
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: 10, fill: '#6b7280' }}
                  tickLine={false}
                  axisLine={false}
                  angle={-45}
                  textAnchor="end"
                  interval={tickInterval}
                  height={60}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  tickLine={false}
                  axisLine={false}
                  label={{
                    value: yAxisLabel,
                    angle: -90,
                    position: 'insideLeft',
                    offset: 10,
                    style: { fontSize: 10, fill: '#9ca3af' },
                  }}
                />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
                  formatter={(v, name) => {
                    const n = typeof v === 'number' ? v : 0
                    const label = viewMode === 'headcount' ? `${n} persons`
                      : viewMode === 'hours' ? `${n} h`
                      : n.toFixed(1)
                    return [label, name]
                  }}
                />
                <Legend
                  iconType="square"
                  iconSize={9}
                  wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
                />
                {activeDepts.map((dept, i) => (
                  <Bar
                    key={dept}
                    dataKey={dept}
                    stackId="stack"
                    fill={DEPT_COLORS[allDepts.indexOf(dept) % DEPT_COLORS.length]}
                    maxBarSize={40}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>

            <p className="text-[10px] text-gray-400 mt-2 text-center">
              {periodMode === 'weekly' ? 'Each bar = 1 calendar week.' : 'Each bar = 1 calendar month.'}
              {' '}
              {viewMode === 'headcount' && 'Height = unique persons assigned to overlapping activities.'}
              {viewMode === 'hours'     && 'Height = estimated person-hours (overlap days × 8h/day).'}
              {viewMode === 'cost'      && 'Height = proportional BAC allocated to this period. Only activities with BAC set are included.'}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
