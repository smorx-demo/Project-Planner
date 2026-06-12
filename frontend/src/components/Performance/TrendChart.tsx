import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Legend,
} from 'recharts'
import type { PerformanceSnapshot } from '../../types'

interface TrendChartProps {
  data: PerformanceSnapshot[]
  height?: number
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export function TrendChart({ data, height = 240 }: TrendChartProps) {
  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-gray-400 text-sm border border-dashed border-gray-200 rounded-lg"
        style={{ height }}
      >
        No history data yet
      </div>
    )
  }

  const chartData = data.map((s) => ({
    date: formatDate(s.snapshot_date),
    score: s.score,
    on_time_rate: s.on_time_rate,
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
          formatter={(value, name) => [
            typeof value === 'number' ? `${value.toFixed(1)}` : String(value),
            name === 'score' ? 'Performance Score' : 'On-Time Rate',
          ]}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          formatter={(value) =>
            value === 'score' ? 'Performance Score' : 'On-Time Rate'
          }
        />
        <ReferenceLine y={70} stroke="#f97316" strokeDasharray="4 2" label={{ value: '70', position: 'right', fontSize: 10, fill: '#f97316' }} />
        <Line
          type="monotone"
          dataKey="score"
          stroke="#22c55e"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey="on_time_rate"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={false}
          strokeDasharray="5 3"
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
