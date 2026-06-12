import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Legend,
} from 'recharts'
import { format } from 'date-fns'
import { TODAY_COL } from '../../store/projectStore'
import type { SCurvePoint } from '../../types'

interface Props {
  data: SCurvePoint[]
  totalBac: number
  bacUnit?: string
  height?: number
}

function formatAxisY(v: number, totalBac: number): string {
  if (totalBac >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (totalBac >= 1_000)     return `${(v / 1_000).toFixed(0)}k`
  return String(v)
}

export function SCurveChart({ data, totalBac, bacUnit = '', height = 320 }: Props) {
  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-gray-400
          border border-dashed border-gray-200 rounded-xl bg-gray-50"
        style={{ height }}
      >
        No S-curve data — set BAC on activities to generate the curve
      </div>
    )
  }

  // Find today's label for the reference line
  const todayLabel = (() => {
    const closest = data.reduce((best, d) =>
      Math.abs(d.col - TODAY_COL) < Math.abs(best.col - TODAY_COL) ? d : best
    )
    return closest.label
  })()

  // Tick every 6th data point to avoid crowding
  const tickSet = new Set(
    data.filter((_, i) => i === 0 || i === data.length - 1 || i % 6 === 0).map((d) => d.label)
  )

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 24, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />

        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: '#9ca3af' }}
          tickLine={false}
          axisLine={false}
          interval={0}
          tickFormatter={(v) => tickSet.has(v) ? v : ''}
        />
        <YAxis
          tickFormatter={(v) => formatAxisY(v, totalBac)}
          tick={{ fontSize: 10, fill: '#9ca3af' }}
          tickLine={false}
          axisLine={false}
          unit={bacUnit ? ` ${bacUnit}` : undefined}
        />

        <Tooltip
          contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb', padding: '8px 12px' }}
          formatter={(value, name) => {
            const unit  = bacUnit ? ` ${bacUnit}` : ''
            const label = name === 'planned_cumulative' ? 'Planned (BCWS)' : 'Actual (BCWP)'
            const num   = typeof value === 'number' ? value : 0
            return [`${num.toFixed(1)}${unit}`, label]
          }}
          labelFormatter={(label) => `Date: ${label}`}
        />

        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          formatter={(v) => {
            if (v === 'planned_cumulative') return 'Planned (BCWS)'
            if (v === 'actual_cumulative')  return 'Actual (BCWP)'
            return v
          }}
        />

        {/* Today marker */}
        <ReferenceLine
          x={todayLabel}
          stroke="#ef4444"
          strokeDasharray="4 2"
          strokeWidth={1.5}
          label={{ value: 'Today', position: 'insideTopRight', fontSize: 10, fill: '#ef4444', dy: -2 }}
        />

        {/* Planned area + line */}
        <Area
          type="monotone"
          dataKey="planned_cumulative"
          stroke="#378ADD"
          strokeWidth={2}
          fill="#378ADD"
          fillOpacity={0.12}
          dot={false}
          activeDot={{ r: 3, fill: '#378ADD' }}
        />

        {/* Actual area + line */}
        <Area
          type="monotone"
          dataKey="actual_cumulative"
          stroke="#22c55e"
          strokeWidth={2}
          fill="#22c55e"
          fillOpacity={0.12}
          dot={false}
          activeDot={{ r: 3, fill: '#22c55e' }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
