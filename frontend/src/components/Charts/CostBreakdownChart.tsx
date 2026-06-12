import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

interface CostRow {
  group: string
  pv:    number
  ev:    number
}

interface Props {
  data: CostRow[]
}

function fmtVal(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}k`
  return v.toFixed(0)
}

export function CostBreakdownChart({ data }: Props) {
  if (data.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-sm font-semibold text-gray-800">Cost by Group (PV vs EV)</h2>
        <span className="text-[10px] text-gray-400">mixed units — see activity BAC</span>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 20, bottom: 4, left: 8 }}
          barCategoryGap="30%"
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
          <XAxis
            type="number"
            tickFormatter={fmtVal}
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="group"
            width={82}
            tick={{ fontSize: 10, fill: '#6b7280' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            formatter={(v, name) => [
              fmtVal(typeof v === 'number' ? v : 0),
              name === 'pv' ? 'Planned (PV)' : 'Earned (EV)',
            ]}
            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11 }}
            formatter={(v) => v === 'pv' ? 'Planned (PV)' : 'Earned (EV)'}
          />
          <Bar dataKey="pv" name="pv" fill="#378ADD" radius={[0, 3, 3, 0]} barSize={9} />
          <Bar dataKey="ev" name="ev" fill="#22c55e" radius={[0, 3, 3, 0]} barSize={9} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
