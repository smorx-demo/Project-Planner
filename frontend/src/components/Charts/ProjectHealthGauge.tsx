import type { ActivityWithStatus } from '../../types'

// Semicircle gauge: left (score=0) → top (score=50) → right (score=100)
// Uses sweep=1 which in SVG goes left→top→right (clockwise through 270°)
const CX = 48, CY = 52, R = 40, SW = 11

function arcD(s1: number, s2: number, r = R): string {
  // s in [0,1]: 0=left(π), 1=right(2π), passes through top(1.5π)
  const t1 = Math.PI + s1 * Math.PI
  const t2 = Math.PI + s2 * Math.PI
  const x1 = CX + r * Math.cos(t1)
  const y1 = CY + r * Math.sin(t1)
  const x2 = CX + r * Math.cos(t2)
  const y2 = CY + r * Math.sin(t2)
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
}

function healthScore(activities: ActivityWithStatus[]): number {
  if (!activities.length) return 0
  const weights: Record<string, number> = {
    DONE: 100, ON_TRACK: 90, SLOW: 60, DELAYED: 20, PENDING: 50,
  }
  const sum = activities.reduce((acc, a) => acc + (weights[a.computed_status] ?? 50), 0)
  return Math.round(sum / activities.length)
}

function gaugeColor(score: number): string {
  if (score >= 71) return '#22c55e'
  if (score >= 41) return '#f97316'
  return '#ef4444'
}

interface Props {
  activities: ActivityWithStatus[]
}

export function ProjectHealthGauge({ activities }: Props) {
  if (!activities.length) return null

  const score = healthScore(activities)
  const frac  = score / 100

  // Needle tip coordinates
  const nt = Math.PI + frac * Math.PI
  const nx = (CX + (R - 6) * Math.cos(nt)).toFixed(2)
  const ny = (CY + (R - 6) * Math.sin(nt)).toFixed(2)

  const color = gaugeColor(score)

  return (
    <div className="flex flex-col items-center" title={`Project health: ${score}/100`}>
      <svg viewBox="0 0 96 58" width={88} style={{ overflow: 'visible' }}>
        {/* Background track */}
        <path d={arcD(0, 1)} fill="none" stroke="#e5e7eb" strokeWidth={SW} strokeLinecap="round" />

        {/* Colour zones */}
        <path d={arcD(0,    0.40)} fill="none" stroke="#ef4444" strokeWidth={SW} strokeLinecap="butt" opacity={0.35} />
        <path d={arcD(0.40, 0.70)} fill="none" stroke="#f97316" strokeWidth={SW} strokeLinecap="butt" opacity={0.35} />
        <path d={arcD(0.70, 1.00)} fill="none" stroke="#22c55e" strokeWidth={SW} strokeLinecap="butt" opacity={0.35} />

        {/* Score fill (from 0 to frac) */}
        <path d={arcD(0, frac)} fill="none" stroke={color} strokeWidth={SW} strokeLinecap="round"
              style={{ transition: 'all 0.6s ease' }} />

        {/* Needle */}
        <line x1={CX} y1={CY} x2={nx} y2={ny}
              stroke="#374151" strokeWidth={2} strokeLinecap="round"
              style={{ transition: 'all 0.6s ease' }} />
        <circle cx={CX} cy={CY} r={3} fill="#374151" />

        {/* Score text */}
        <text x={CX} y={CY - 13} textAnchor="middle" fontSize={13} fontWeight={700} fill={color}>
          {score}
        </text>
        <text x={CX} y={CY - 1} textAnchor="middle" fontSize={7} fill="#9ca3af">
          /100
        </text>
      </svg>
      <p className="text-[9px] text-gray-400 -mt-1 leading-none">Project health</p>
    </div>
  )
}
