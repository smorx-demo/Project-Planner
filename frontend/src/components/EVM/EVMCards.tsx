import type { ProjectEVM } from '../../types'

type Color = 'green' | 'blue' | 'amber' | 'red' | 'gray'

const COLOR_MAP: Record<Color, { bg: string; text: string; sub: string }> = {
  green: { bg: 'bg-green-50',  text: 'text-green-700',  sub: 'text-green-500'  },
  blue:  { bg: 'bg-blue-50',   text: 'text-blue-700',   sub: 'text-blue-400'   },
  amber: { bg: 'bg-amber-50',  text: 'text-amber-700',  sub: 'text-amber-500'  },
  red:   { bg: 'bg-red-50',    text: 'text-red-700',    sub: 'text-red-400'    },
  gray:  { bg: 'bg-gray-50',   text: 'text-gray-700',   sub: 'text-gray-400'   },
}

function MetricCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color: Color
}) {
  const c = COLOR_MAP[color]
  return (
    <div className={`${c.bg} rounded-xl p-4`}>
      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${c.text}`}>{value}</p>
      {sub && <p className={`text-xs mt-0.5 ${c.sub}`}>{sub}</p>}
    </div>
  )
}

function indexColor(val: number | null): Color {
  if (val == null) return 'gray'
  return val >= 1 ? 'green' : val >= 0.9 ? 'amber' : 'red'
}

function fmtNum(n: number | null, unit = ''): string {
  if (n == null) return '—'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  let formatted: string
  if (abs >= 1_000_000) formatted = `${sign}${(abs / 1_000_000).toFixed(2)}M`
  else if (abs >= 1_000) formatted = `${sign}${(abs / 1_000).toFixed(1)}k`
  else formatted = `${sign}${abs.toFixed(1)}`
  return unit ? `${formatted} ${unit}` : formatted
}

function fmtIndex(n: number | null): string {
  return n == null ? '—' : n.toFixed(2)
}

interface Props {
  evm: ProjectEVM
  unit?: string
}

export function EVMCards({ evm, unit = '' }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <MetricCard
        label="SPI  (>1 = on schedule)"
        value={fmtIndex(evm.spi)}
        sub={evm.spi != null ? (evm.spi >= 1 ? 'On / Ahead schedule' : 'Behind schedule') : undefined}
        color={indexColor(evm.spi)}
      />
      <MetricCard
        label="CPI  (>1 = under budget)"
        value={fmtIndex(evm.cpi)}
        sub={evm.cpi != null ? (evm.cpi >= 1 ? 'Under budget' : 'Over budget') : undefined}
        color={indexColor(evm.cpi)}
      />
      <MetricCard
        label="Planned value (BCWS)"
        value={fmtNum(evm.total_pv, unit)}
        color="blue"
      />
      <MetricCard
        label="Earned value (BCWP)"
        value={fmtNum(evm.total_ev, unit)}
        color={evm.total_ev != null && evm.total_pv != null
          ? (evm.total_ev >= evm.total_pv ? 'green' : 'amber')
          : 'gray'}
      />
      <MetricCard
        label="Actual cost (ACWP)"
        value={fmtNum(evm.total_ac, unit)}
        color="gray"
      />
      <MetricCard
        label="Forecast total cost"
        value={fmtNum(evm.eac, unit)}
        sub={evm.total_bac ? `BAC ${fmtNum(evm.total_bac, unit)}` : 'EAC'}
        color={evm.eac != null && evm.total_bac != null
          ? (evm.eac <= evm.total_bac ? 'green' : 'red')
          : 'blue'}
      />
    </div>
  )
}
