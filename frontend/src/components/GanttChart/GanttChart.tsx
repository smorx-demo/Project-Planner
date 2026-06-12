import { Fragment, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { ChevronRight, ChevronDown, Plus, ChevronsUpDown } from 'lucide-react'
import type { ActivityWithStatus, Person, WBSColor, WBSRollup } from '../../types'
import { colToDate, TODAY_COL } from '../../store/projectStore'

// ── Layout constants ───────────────────────────────────────────────────────
const COL_W       = 14
const ROW_H       = 26
const SEP_H       = 3
const HDR_H       = 28
const HDR_H_DATE  = 76

const SN_W       = 32
const NAME_W     = 178
const BADGE_W    = 62
const PEOPLE_W   = 90
const FROZEN_W   = SN_W + NAME_W + BADGE_W + PEOPLE_W  // 362

// ── Status palette ─────────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = {
  DONE:     '#22c55e',
  ON_TRACK: '#3b82f6',
  SLOW:     '#f59e0b',
  DELAYED:  '#ef4444',
  PENDING:  '#94a3b8',
}
const STATUS_LIGHT: Record<string, string> = {
  DONE:     '#dcfce7',
  ON_TRACK: '#dbeafe',
  SLOW:     '#fef3c7',
  DELAYED:  '#fee2e2',
  PENDING:  '#f1f5f9',
}

const GROUP_COLOR: Record<string, string> = {
  Engineering: '#6366f1',
  Procurement: '#f59e0b',
  QC:          '#10b981',
  Production:  '#3b82f6',
  Welding:     '#f97316',
  Machining:   '#8b5cf6',
  Surface:     '#ec4899',
  Dispatch:    '#14b8a6',
}

function groupDot(group: string | null) {
  return GROUP_COLOR[group ?? ''] ?? '#94a3b8'
}

// ── WBS default colors (fallback) ──────────────────────────────────────────
const WBS_DEFAULT: Record<number, WBSColor> = {
  1: { level: 1, color_hex: '#1F4E79', background_hex: '#DEEAF1' },
  2: { level: 2, color_hex: '#375623', background_hex: '#E2EFDA' },
  3: { level: 3, color_hex: '#7F5200', background_hex: '#FFF2CC' },
  4: { level: 4, color_hex: '#833C00', background_hex: '#FCE4D6' },
  5: { level: 5, color_hex: '#3F3151', background_hex: '#EDEBF7' },
  6: { level: 6, color_hex: '#265B73', background_hex: '#DDEBF7' },
  7: { level: 7, color_hex: '#595959', background_hex: '#F2F2F2' },
  8: { level: 8, color_hex: '#000000', background_hex: '#FFFFFF' },
}

// ── Avatar helpers ─────────────────────────────────────────────────────────
const AVATAR_COLORS = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#ec4899','#14b8a6','#f97316']

function nameColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) { h = ((h << 5) - h) + name.charCodeAt(i); h |= 0 }
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

// ── Date helpers ───────────────────────────────────────────────────────────
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function getMonthGroups(minCol: number, maxCol: number) {
  const groups: { label: string; count: number }[] = []
  let cur = -1; let cnt = 0
  for (let c = minCol; c <= maxCol; c++) {
    const m = colToDate(c).getMonth()
    if (m !== cur) {
      if (cur >= 0) groups.push({ label: MONTHS[cur], count: cnt })
      cur = m; cnt = 1
    } else cnt++
  }
  if (cur >= 0) groups.push({ label: MONTHS[cur], count: cnt })
  return groups
}

// ── Avatars strip ──────────────────────────────────────────────────────────
function AvatarStrip({
  assignments, personsMap, max = 3,
}: {
  assignments: ActivityWithStatus['assignments']
  personsMap: Record<string, Person>
  max?: number
}) {
  const visible = assignments.slice(0, max)
  const extra   = assignments.length - max
  return (
    <div className="flex -space-x-1.5">
      {visible.map((a) => {
        const person = personsMap[a.person_id]
        const name   = person?.name ?? '?'
        const label  = initials(name)
        const color  = nameColor(name)
        const isLead = a.role === 'LEAD'
        return (
          <div
            key={a.id}
            title={`${name} (${a.role}${person ? ' · ' + person.department : ''})`}
            className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold
              border-2 border-white cursor-default select-none"
            style={{ backgroundColor: color, outline: isLead ? '2px solid #1d4ed8' : undefined }}
          >
            {label}
          </div>
        )
      })}
      {extra > 0 && (
        <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-600
          border-2 border-white font-medium">
          +{extra}
        </div>
      )}
    </div>
  )
}

// ── Status badge ───────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? '#94a3b8'
  const bg    = STATUS_LIGHT[status] ?? '#f1f5f9'
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none whitespace-nowrap"
      style={{ color, backgroundColor: bg }}
    >
      {status === 'ON_TRACK' ? 'ON TRACK' : status}
    </span>
  )
}

// ── Summary cards ──────────────────────────────────────────────────────────
function SummaryCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl px-4 py-3 min-w-[80px] text-center shadow-sm">
      <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-1">{label}</p>
      <p className="text-xl font-bold" style={{ color }}>{value}</p>
    </div>
  )
}

// ── Status priority for rollup ─────────────────────────────────────────────
const STATUS_P: Record<string, number> = { DELAYED: 5, SLOW: 4, ON_TRACK: 3, PENDING: 2, DONE: 1 }

// ── Main component ─────────────────────────────────────────────────────────
interface GanttChartProps {
  activities:    ActivityWithStatus[]
  personsMap:    Record<string, Person>
  projectName?:  string
  poNumber?:     string | null
  partNumber?:   string | null
  customerName?: string | null
  wbsColors?:    Record<number, WBSColor>
  onEditActivity:  (a: ActivityWithStatus) => void
  onAddChild?:     (parent: ActivityWithStatus) => void
}

export function GanttChart({
  activities,
  personsMap,
  projectName,
  poNumber,
  partNumber,
  customerName,
  wbsColors: wbsColorsProp,
  onEditActivity,
  onAddChild,
}: GanttChartProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const wbsColors = wbsColorsProp ?? WBS_DEFAULT

  // ── WBS hierarchy ─────────────────────────────────────────────────────────
  const childrenMap = useMemo(() => {
    const m: Record<string, ActivityWithStatus[]> = {}
    activities.forEach((a) => {
      if (a.parent_id) {
        if (!m[a.parent_id]) m[a.parent_id] = []
        m[a.parent_id].push(a)
      }
    })
    return m
  }, [activities])

  const hiddenIds = useMemo(() => {
    const hidden = new Set<string>()
    function markChildren(id: string) {
      for (const child of childrenMap[id] ?? []) {
        hidden.add(child.id)
        if (!collapsed.has(child.id)) markChildren(child.id)
      }
    }
    for (const id of collapsed) markChildren(id)
    return hidden
  }, [collapsed, childrenMap])

  const rollupMap = useMemo(() => {
    const m = new Map<string, WBSRollup>()
    const byId = Object.fromEntries(activities.map((a) => [a.id, a]))

    function leafDescendants(id: string): ActivityWithStatus[] {
      const kids = childrenMap[id] ?? []
      if (kids.length === 0) return byId[id] ? [byId[id]] : []
      return kids.flatMap((c) => leafDescendants(c.id))
    }

    for (const id of Object.keys(childrenMap)) {
      const leaves = leafDescendants(id)
      if (!leaves.length) continue
      const planStart = Math.min(...leaves.map((l) => l.plan_start_col))
      const planEnd   = Math.max(...leaves.map((l) => l.plan_end_col))
      const done      = leaves.filter((l) => l.computed_status === 'DONE').length
      const pct       = Math.round((done / leaves.length) * 100)
      const status    = leaves.reduce(
        (w: string, l) => (STATUS_P[l.computed_status] ?? 0) > (STATUS_P[w] ?? 0) ? l.computed_status : w,
        'PENDING',
      )
      m.set(id, { planStart, planEnd, overall_status: status, pct })
    }
    return m
  }, [activities, childrenMap])

  const visibleActivities = useMemo(
    () => activities.filter((a) => !hiddenIds.has(a.id)),
    [activities, hiddenIds],
  )

  const hasHierarchy = Object.keys(childrenMap).length > 0

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function collapseAll() {
    setCollapsed(new Set(Object.keys(childrenMap)))
  }

  function expandAll() {
    setCollapsed(new Set())
  }

  // ── Column range ──────────────────────────────────────────────────────────
  const minCol = useMemo(() => {
    if (!activities.length) return Math.max(0, TODAY_COL - 10)
    const earliest = Math.min(
      ...activities.map((a) => Math.min(a.plan_start_col, a.actual_start_col ?? a.plan_start_col))
    )
    return Math.max(0, earliest - 2)
  }, [activities])

  const maxCol = useMemo(() => {
    if (!activities.length) return TODAY_COL + 10
    return Math.max(
      TODAY_COL + 5,
      ...activities.map((a) => Math.max(a.plan_end_col, a.actual_end_col ?? 0, a.actual_start_col ?? 0))
    ) + 3
  }, [activities])

  const totalCols = maxCol - minCol + 1

  // ── Summary counts ─────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const c = { DONE: 0, ON_TRACK: 0, SLOW: 0, DELAYED: 0, PENDING: 0 }
    activities.forEach((a) => {
      if (childrenMap[a.id]?.length) return // skip summary rows from counts
      const s = a.computed_status as keyof typeof c
      if (s in c) c[s]++
    })
    return c
  }, [activities, childrenMap])

  const leafCount = activities.filter((a) => !childrenMap[a.id]?.length).length
  const pctDone   = leafCount ? Math.round((counts.DONE / leafCount) * 100) : 0

  const monthGroups = useMemo(() => getMonthGroups(minCol, maxCol), [minCol, maxCol])

  if (!activities.length) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        No activities to display.
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">

      {/* ── Project header ────────────────────────────────────────────── */}
      {projectName && (
        <div className="flex items-start gap-6 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{projectName}</h2>
            <div className="flex gap-4 mt-0.5 text-xs text-gray-500 flex-wrap">
              {customerName && <span>Customer: <strong className="text-gray-700">{customerName}</strong></span>}
              {poNumber     && <span>PO: <strong className="font-mono text-gray-700">{poNumber}</strong></span>}
              {partNumber   && <span>Part: <strong className="font-mono text-gray-700">{partNumber}</strong></span>}
            </div>
          </div>
        </div>
      )}

      {/* ── Summary cards ─────────────────────────────────────────────── */}
      <div className="flex gap-3 flex-wrap">
        <SummaryCard label="Total"    value={leafCount}       color="#374151" />
        <SummaryCard label="Done"     value={counts.DONE}     color={STATUS_COLOR.DONE} />
        <SummaryCard label="On Track" value={counts.ON_TRACK} color={STATUS_COLOR.ON_TRACK} />
        <SummaryCard label="Slow"     value={counts.SLOW}     color={STATUS_COLOR.SLOW} />
        <SummaryCard label="Delayed"  value={counts.DELAYED}  color={STATUS_COLOR.DELAYED} />
        <SummaryCard label="Pending"  value={counts.PENDING}  color={STATUS_COLOR.PENDING} />
        <div className="bg-white border border-gray-100 rounded-xl px-4 py-3 min-w-[120px] shadow-sm">
          <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-1">Progress</p>
          <p className="text-xl font-bold text-gray-800">{pctDone}%</p>
          <div className="mt-1.5 h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${pctDone}%` }} />
          </div>
        </div>
      </div>

      {/* ── WBS Toolbar ───────────────────────────────────────────────── */}
      {hasHierarchy && (
        <div className="flex items-center gap-2">
          <ChevronsUpDown size={13} className="text-gray-400" />
          <span className="text-[11px] text-gray-400 font-medium">WBS:</span>
          <button
            onClick={collapseAll}
            className="px-2 py-1 text-[11px] font-medium text-gray-600 bg-white border border-gray-200
              rounded-md hover:bg-gray-50 transition-colors"
          >
            Collapse All
          </button>
          <button
            onClick={expandAll}
            className="px-2 py-1 text-[11px] font-medium text-gray-600 bg-white border border-gray-200
              rounded-md hover:bg-gray-50 transition-colors"
          >
            Expand All
          </button>
          <span className="text-[11px] text-gray-400">
            {visibleActivities.length} of {activities.length} shown
          </span>
        </div>
      )}

      {/* ── Gantt table ───────────────────────────────────────────────── */}
      <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div ref={scrollRef} className="overflow-auto">
          <div className="relative" style={{ minWidth: FROZEN_W + totalCols * COL_W }}>

            {/* Today vertical line */}
            <div
              className="absolute top-0 bottom-0 pointer-events-none z-20"
              style={{
                left:  FROZEN_W + (TODAY_COL - minCol) * COL_W + COL_W / 2,
                width: '1.5px',
                backgroundColor: 'rgba(239,68,68,0.55)',
              }}
            />

            <table
              className="border-collapse"
              style={{ width: FROZEN_W + totalCols * COL_W, tableLayout: 'fixed' }}
            >
              <colgroup>
                <col style={{ width: SN_W }} />
                <col style={{ width: NAME_W }} />
                <col style={{ width: BADGE_W }} />
                <col style={{ width: PEOPLE_W }} />
                {Array.from({ length: totalCols }, (_, i) => (
                  <col key={i} style={{ width: COL_W }} />
                ))}
              </colgroup>

              <thead>
                {/* Row 1 — month labels */}
                <tr style={{ height: HDR_H }}>
                  <th
                    colSpan={4}
                    className="bg-gray-50 border-b border-r border-gray-200 text-xs font-semibold
                      text-gray-500 uppercase tracking-wide text-left px-3"
                    style={{ position: 'sticky', left: 0, zIndex: 5, width: FROZEN_W, minWidth: FROZEN_W }}
                  >
                    Activity
                  </th>
                  {monthGroups.map((g, i) => (
                    <th
                      key={i}
                      colSpan={g.count}
                      className="bg-gray-50 border-b border-r border-gray-200 text-xs font-semibold text-gray-600
                        text-center px-1"
                      style={{ height: HDR_H }}
                    >
                      {g.label}
                    </th>
                  ))}
                </tr>

                {/* Row 2 — dates */}
                <tr style={{ height: HDR_H_DATE }}>
                  <th className="bg-gray-50 border-b border-r border-gray-200 text-[10px] font-semibold
                    text-gray-400 text-center px-1"
                    style={{ position: 'sticky', left: 0, zIndex: 5, width: SN_W }}>
                    #
                  </th>
                  <th className="bg-gray-50 border-b border-r border-gray-200 text-[10px] font-semibold
                    text-gray-400 text-left px-2"
                    style={{ position: 'sticky', left: SN_W, zIndex: 5, width: NAME_W }}>
                    Name
                  </th>
                  <th className="bg-gray-50 border-b border-r border-gray-200 text-[10px] font-semibold
                    text-gray-400 text-center"
                    style={{ position: 'sticky', left: SN_W + NAME_W, zIndex: 5, width: BADGE_W }}>
                    Status
                  </th>
                  <th className="bg-gray-50 border-b border-r border-gray-200 text-[10px] font-semibold
                    text-gray-400 text-center"
                    style={{ position: 'sticky', left: SN_W + NAME_W + BADGE_W, zIndex: 5, width: PEOPLE_W }}>
                    People
                  </th>
                  {Array.from({ length: totalCols }, (_, i) => {
                    const col     = minCol + i
                    const isToday = col === TODAY_COL
                    const d       = colToDate(col)
                    return (
                      <th
                        key={col}
                        className={`border-b border-gray-200 font-medium text-center align-bottom
                          ${isToday ? 'bg-red-50 text-red-600 font-bold' : 'bg-gray-50 text-gray-500'}`}
                        style={{
                          height: HDR_H_DATE,
                          fontSize: '10px',
                          paddingBottom: 6,
                          borderRight: col % 5 === 0 ? '1px solid #e5e7eb' : undefined,
                        }}
                      >
                        <div style={{
                          writingMode: 'vertical-rl',
                          transform: 'rotate(180deg)',
                          whiteSpace: 'nowrap',
                          lineHeight: 1.1,
                        }}>
                          {format(d, 'dd MMM')}
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>

              <tbody>
                {visibleActivities.map((activity) => {
                  const wbsLevel   = activity.wbs_level ?? 1
                  const wbsEntry   = wbsColors[wbsLevel] ?? WBS_DEFAULT[wbsLevel] ?? WBS_DEFAULT[1]
                  const wbsBg      = wbsEntry.background_hex
                  const wbsClr     = wbsEntry.color_hex
                  const isSummary  = !!(childrenMap[activity.id]?.length) || activity.is_wbs_summary
                  const indentPx   = 6 + (wbsLevel - 1) * 14
                  const rollup     = rollupMap.get(activity.id)

                  const status = activity.computed_status
                  const color  = STATUS_COLOR[status] ?? '#94a3b8'

                  // Leaf plan/actual bar calculations
                  const ps = Math.max(activity.plan_start_col - minCol, 0)
                  const pe = Math.min(activity.plan_end_col   - minCol, totalCols - 1)
                  const as = activity.actual_start_col != null ? Math.max(activity.actual_start_col - minCol, 0) : null
                  const ae = activity.actual_end_col   != null ? Math.min(activity.actual_end_col - minCol, totalCols - 1)
                           : as != null                        ? Math.min(TODAY_COL - minCol, totalCols - 1)
                           : null

                  const planSpan      = Math.max(pe - ps, 1)
                  const beforePlan    = ps
                  const afterPlan     = Math.max(totalCols - pe - 1, 0)
                  const beforeActual  = as != null ? as : 0
                  const actualSpan    = (as != null && ae != null) ? Math.max(ae - as, 1) : 0
                  const afterActual   = (as != null && ae != null) ? Math.max(totalCols - ae - 1, 0) : totalCols

                  // Bar color for actual
                  const _lateStart = (activity.actual_start_col ?? 0) > (activity.plan_start_col + activity.plan_end_col) / 2
                  const _withinClr = _lateStart ? STATUS_COLOR.SLOW : STATUS_COLOR.ON_TRACK
                  let barBackground: string
                  if (status === 'DONE') {
                    barBackground = STATUS_COLOR.DONE
                  } else if (activity.actual_start_col != null) {
                    const _actEnd  = activity.actual_end_col ?? TODAY_COL
                    const _barW    = Math.max(_actEnd - activity.actual_start_col, 1)
                    const _within  = Math.max(0, Math.min(_actEnd, activity.plan_end_col) - activity.actual_start_col + 1)
                    const _pct     = Math.min(100, Math.round(_within / _barW * 100))
                    if (_pct >= 100)    barBackground = _withinClr
                    else if (_pct <= 0) barBackground = STATUS_COLOR.DELAYED
                    else                barBackground =
                      `linear-gradient(to right, ${_withinClr} ${_pct}%, ${STATUS_COLOR.DELAYED} ${_pct}%)`
                  } else {
                    barBackground = color
                  }

                  // Rollup bar columns
                  const rs = rollup ? Math.max(rollup.planStart - minCol, 0) : 0
                  const re = rollup ? Math.min(rollup.planEnd - minCol, totalCols - 1) : 0
                  const rollupSpan    = rollup ? Math.max(re - rs + 1, 1) : 0
                  const beforeRollup  = rs
                  const afterRollup   = rollup ? Math.max(totalCols - re - 1, 0) : totalCols

                  return (
                    <Fragment key={activity.id}>
                      {/* ── Plan row ──────────────────────────────────── */}
                      <tr style={{ height: ROW_H }} className="group bg-white">

                        {/* SN */}
                        <td
                          className="border-r border-gray-100 text-center text-xs text-gray-400 font-mono"
                          style={{ position: 'sticky', left: 0, zIndex: 3, width: SN_W, backgroundColor: wbsBg }}
                        >
                          {activity.sequence_no}
                        </td>

                        {/* Name */}
                        <td
                          className={`border-r border-gray-100 transition-all ${!isSummary ? 'cursor-pointer hover:brightness-95' : ''}`}
                          style={{ position: 'sticky', left: SN_W, zIndex: 3, width: NAME_W, backgroundColor: wbsBg }}
                          onClick={() => { if (!isSummary) onEditActivity(activity) }}
                          title={!isSummary ? 'Click to edit' : undefined}
                        >
                          <div className="flex items-center gap-1 min-w-0" style={{ paddingLeft: indentPx }}>
                            {/* Chevron / spacer */}
                            <button
                              style={{ width: 15, flexShrink: 0, visibility: isSummary ? 'visible' : 'hidden' }}
                              className="p-0.5 rounded hover:bg-black/10 text-gray-500 flex items-center justify-center"
                              onClick={(e) => { e.stopPropagation(); toggleCollapse(activity.id) }}
                              title={collapsed.has(activity.id) ? 'Expand' : 'Collapse'}
                            >
                              {collapsed.has(activity.id)
                                ? <ChevronRight size={11} />
                                : <ChevronDown size={11} />
                              }
                            </button>

                            {/* Color dot */}
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: isSummary ? wbsClr : groupDot(activity.group_type) }}
                            />

                            {/* Name text */}
                            <span
                              className={`text-xs truncate leading-tight ${isSummary ? 'font-bold' : 'font-medium'}`}
                              style={{ color: isSummary ? wbsClr : '#1f2937' }}
                            >
                              {activity.name}
                            </span>

                            {/* Add child button */}
                            {onAddChild && (
                              <button
                                className="ml-auto shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100
                                  hover:bg-black/10 text-gray-500 transition-opacity"
                                onClick={(e) => { e.stopPropagation(); onAddChild(activity) }}
                                title="Add child activity"
                              >
                                <Plus size={10} />
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Badge / WBS code */}
                        <td
                          className="border-r border-gray-100 text-center"
                          style={{ position: 'sticky', left: SN_W + NAME_W, zIndex: 3, width: BADGE_W, backgroundColor: wbsBg }}
                        >
                          {isSummary ? (
                            <span
                              className="text-[9px] font-semibold font-mono"
                              style={{ color: wbsClr }}
                            >
                              {activity.wbs_code ?? `L${wbsLevel}`}
                            </span>
                          ) : (
                            <span className="text-[9px] text-gray-400 font-medium uppercase tracking-wide">Plan</span>
                          )}
                        </td>

                        {/* People / Rollup pct */}
                        <td
                          className={`border-r border-gray-100 px-2 ${!isSummary ? 'cursor-pointer hover:brightness-95' : ''}`}
                          style={{ position: 'sticky', left: SN_W + NAME_W + BADGE_W, zIndex: 3, width: PEOPLE_W, backgroundColor: wbsBg }}
                          onClick={() => { if (!isSummary) onEditActivity(activity) }}
                          title={!isSummary ? 'Click to manage people' : undefined}
                        >
                          {isSummary ? (
                            rollup ? (
                              <span className="text-[9px] font-medium" style={{ color: wbsClr }}>
                                {rollup.pct}% done
                              </span>
                            ) : null
                          ) : (
                            <AvatarStrip assignments={activity.assignments} personsMap={personsMap} />
                          )}
                        </td>

                        {/* Bar cells */}
                        {isSummary ? (
                          rollup ? (
                            <>
                              {beforeRollup > 0 && <td colSpan={beforeRollup} style={{ padding: 0, height: ROW_H }} />}
                              <td
                                colSpan={rollupSpan}
                                style={{ padding: 0, height: ROW_H, position: 'relative' }}
                              >
                                <div style={{
                                  position: 'absolute',
                                  left: 1, right: 1, top: 4,
                                  height: 14, borderRadius: 3,
                                  backgroundColor: wbsClr,
                                  opacity: 0.72,
                                  display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                                  paddingRight: 4, overflow: 'hidden',
                                }}>
                                  {rollupSpan >= 6 && (
                                    <span className="text-white text-[9px] font-bold">{rollup.pct}%</span>
                                  )}
                                </div>
                              </td>
                              {afterRollup > 0 && <td colSpan={afterRollup} style={{ padding: 0, height: ROW_H }} />}
                            </>
                          ) : (
                            <td colSpan={totalCols} style={{ padding: 0, height: ROW_H }} />
                          )
                        ) : (
                          <>
                            {beforePlan > 0 && (
                              <td colSpan={beforePlan} style={{ padding: 0, height: ROW_H }} />
                            )}
                            <td
                              colSpan={planSpan}
                              style={{ padding: 0, height: ROW_H, position: 'relative' }}
                            >
                              <div style={{
                                position: 'absolute',
                                left: 1, right: 1, top: 4,
                                height: 13, borderRadius: 3,
                                backgroundColor: '#22c55e',
                                opacity: 0.35,
                              }} />
                            </td>
                            {afterPlan > 0 && (
                              <td colSpan={afterPlan} style={{ padding: 0, height: ROW_H }} />
                            )}
                          </>
                        )}
                      </tr>

                      {/* ── Actual row (leaf activities only) ─────────── */}
                      {!isSummary && (
                        <tr style={{ height: ROW_H }} className="bg-gray-50/60">
                          <td
                            className="border-r border-gray-100"
                            style={{ position: 'sticky', left: 0, zIndex: 3, width: SN_W, backgroundColor: wbsBg }}
                          />
                          <td
                            className="border-r border-gray-100"
                            style={{ position: 'sticky', left: SN_W, zIndex: 3, width: NAME_W, backgroundColor: wbsBg }}
                          />
                          <td
                            className="border-r border-gray-100 text-center px-1"
                            style={{ position: 'sticky', left: SN_W + NAME_W, zIndex: 3, width: BADGE_W, backgroundColor: wbsBg }}
                          >
                            <StatusBadge status={status} />
                          </td>
                          <td
                            className="border-r border-gray-100"
                            style={{ position: 'sticky', left: SN_W + NAME_W + BADGE_W, zIndex: 3, width: PEOPLE_W, backgroundColor: wbsBg }}
                          />

                          {as == null ? (
                            <td colSpan={totalCols} style={{ padding: 0, height: ROW_H }} />
                          ) : (
                            <>
                              {beforeActual > 0 && (
                                <td colSpan={beforeActual} style={{ padding: 0, height: ROW_H }} />
                              )}
                              <td
                                colSpan={actualSpan || 1}
                                style={{ padding: 0, height: ROW_H, position: 'relative', cursor: 'pointer' }}
                                onClick={() => onEditActivity(activity)}
                              >
                                <div
                                  title={`${status} · Click to edit`}
                                  style={{
                                    position: 'absolute',
                                    left: 1, right: 1, top: 3,
                                    height: 14, borderRadius: 3,
                                    background: barBackground,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    overflow: 'hidden',
                                  }}
                                >
                                  {actualSpan >= 4 && (
                                    <span className="text-white text-[9px] font-bold px-1 truncate">
                                      {status === 'ON_TRACK' ? 'OK' : status.slice(0, 3)}
                                    </span>
                                  )}
                                </div>
                              </td>
                              {afterActual > 0 && (
                                <td colSpan={afterActual} style={{ padding: 0, height: ROW_H }} />
                              )}
                            </>
                          )}
                        </tr>
                      )}

                      {/* ── Separator ─────────────────────────────────── */}
                      <tr style={{ height: SEP_H }}>
                        <td
                          colSpan={4 + totalCols}
                          style={{ height: SEP_H, padding: 0, backgroundColor: '#f3f4f6' }}
                        />
                      </tr>
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Legend ────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-4 px-4 py-3 border-t border-gray-100 bg-gray-50 flex-wrap">
          <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Status:</span>
          {Object.entries(STATUS_COLOR).map(([s, c]) => (
            <span key={s} className="flex items-center gap-1 text-xs text-gray-600">
              <span className="w-3 h-2.5 rounded-sm inline-block" style={{ backgroundColor: c }} />
              {s}
            </span>
          ))}
          <span className="ml-4 flex items-center gap-3 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <span className="w-3 h-2 rounded-sm inline-block" style={{ backgroundColor: '#22c55e', opacity: 0.35 }} />
              Planned
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-2 rounded-sm inline-block bg-gray-400" />
              Actual
            </span>
            <span className="flex items-center gap-1">
              <span className="w-0.5 h-3 rounded inline-block" style={{ backgroundColor: 'rgba(239,68,68,0.6)' }} />
              Today
            </span>
          </span>
        </div>
      </div>
    </div>
  )
}

