interface ScoreGaugeProps {
  score: number
  size?: 'sm' | 'lg'
  showLabel?: boolean
}

const RADIUS = 80
const CIRCUMFERENCE = Math.PI * RADIUS  // half-circle arc length ≈ 251.3

function scoreColor(score: number): string {
  if (score >= 70) return '#22c55e'
  if (score >= 40) return '#f97316'
  return '#ef4444'
}

function scoreLabel(score: number): string {
  if (score >= 70) return 'Good'
  if (score >= 40) return 'Fair'
  return 'Poor'
}

export function ScoreGauge({ score, size = 'lg', showLabel = true }: ScoreGaugeProps) {
  const clampedScore = Math.max(0, Math.min(100, score))
  const offset = CIRCUMFERENCE * (1 - clampedScore / 100)
  const color = scoreColor(clampedScore)

  const viewBoxSize = size === 'sm' ? 100 : 200
  const cx = viewBoxSize / 2
  const cy = size === 'sm' ? 55 : 110
  const r = size === 'sm' ? 40 : RADIUS
  const strokeWidth = size === 'sm' ? 8 : 14
  const circ = Math.PI * r

  const smOffset = circ * (1 - clampedScore / 100)

  const fontSize = size === 'sm' ? 14 : 28
  const labelSize = size === 'sm' ? 7 : 13

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox={`0 0 ${viewBoxSize} ${cy + strokeWidth / 2 + 4}`}
        width={size === 'sm' ? 100 : 200}
        style={{ overflow: 'visible' }}
      >
        {/* Background track */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Score arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={size === 'sm' ? smOffset : offset}
          style={{ transition: 'stroke-dashoffset 0.8s ease, stroke 0.4s ease' }}
        />
        {/* Score text */}
        <text
          x={cx}
          y={cy - (size === 'sm' ? 6 : 12)}
          textAnchor="middle"
          fontSize={fontSize}
          fontWeight="700"
          fill={color}
        >
          {Math.round(clampedScore)}
        </text>
        {showLabel && (
          <text
            x={cx}
            y={cy - (size === 'sm' ? 6 : 12) + fontSize * 0.85}
            textAnchor="middle"
            fontSize={labelSize}
            fill="#6b7280"
          >
            {scoreLabel(clampedScore)}
          </text>
        )}
      </svg>
      {size === 'lg' && (
        <div className="flex justify-between w-full px-2 text-xs text-gray-400 -mt-1">
          <span>0</span>
          <span>100</span>
        </div>
      )}
    </div>
  )
}
