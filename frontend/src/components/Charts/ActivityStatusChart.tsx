import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, Label,
} from 'recharts'
import type { StatusCounts } from '../../types'

const SLICES = [
  { key: 'DONE',     name: 'Done',     color: '#94a3b8' },
  { key: 'ON_TRACK', name: 'On Track', color: '#22c55e' },
  { key: 'SLOW',     name: 'Slow',     color: '#f97316' },
  { key: 'DELAYED',  name: 'Delayed',  color: '#ef4444' },
  { key: 'PENDING',  name: 'Pending',  color: '#d1d5db' },
] as const

interface Props {
  counts: StatusCounts
  total:  number
}

export function ActivityStatusChart({ counts, total }: Props) {
  if (total === 0) return null

  const data = SLICES
    .map(s => ({ name: s.name, value: counts[s.key], color: s.color }))
    .filter(d => d.value > 0)

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-800 mb-1">Activity Status</h2>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="45%"
            innerRadius={58}
            outerRadius={95}
            paddingAngle={3}
          >
            <Label
              content={({ viewBox }: any) => {
                const { cx, cy } = viewBox ?? { cx: 0, cy: 0 }
                return (
                  <g>
                    <text
                      x={cx} y={cy - 6}
                      textAnchor="middle" dominantBaseline="central"
                      fontSize={26} fontWeight={700} fill="#111827"
                    >
                      {total}
                    </text>
                    <text
                      x={cx} y={cy + 14}
                      textAnchor="middle" dominantBaseline="central"
                      fontSize={10} fill="#9ca3af"
                    >
                      activities
                    </text>
                  </g>
                )
              }}
            />
            {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
          </Pie>
          <Tooltip
            formatter={(v, n) => [v, n]}
            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11 }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
