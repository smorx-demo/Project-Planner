import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import type { AuditIssue } from '../../types'

const SEV_STYLE: Record<string, string> = {
  HIGH:   'bg-red-100 text-red-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  LOW:    'bg-gray-100 text-gray-600',
}

interface XERAuditBadgeProps {
  issues: AuditIssue[]
}

export function XERAuditBadge({ issues }: XERAuditBadgeProps) {
  const [expanded, setExpanded] = useState(false)

  if (issues.length === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        No issues found
      </span>
    )
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => setExpanded(v => !v)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
          bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors"
      >
        <AlertTriangle size={12} />
        {issues.length} issue{issues.length !== 1 ? 's' : ''} found
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {expanded && (
        <div className="rounded-xl border border-amber-200 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-amber-50 text-left">
                <th className="px-3 py-2 font-semibold text-amber-800">Severity</th>
                <th className="px-3 py-2 font-semibold text-amber-800">Type</th>
                <th className="px-3 py-2 font-semibold text-amber-800">Activity</th>
                <th className="px-3 py-2 font-semibold text-amber-800">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-100">
              {issues.map((issue, i) => (
                <tr key={i} className="bg-white hover:bg-amber-50">
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full font-medium ${SEV_STYLE[issue.severity]}`}>
                      {issue.severity}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-700">{issue.type}</td>
                  <td className="px-3 py-2 text-gray-700 font-medium">{issue.activity}</td>
                  <td className="px-3 py-2 text-gray-500">{issue.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
