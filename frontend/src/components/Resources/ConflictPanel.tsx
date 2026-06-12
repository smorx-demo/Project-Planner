import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import { projectsApi } from '../../api/projects'
import { colToDate } from '../../store/projectStore'
import { format } from 'date-fns'
import type { ActivityWithStatus } from '../../types'

interface ConflictPanelProps {
  projectId: string
  onResolve?: (activity: Pick<ActivityWithStatus, 'id' | 'name'>) => void
}

export function ConflictPanel({ projectId, onResolve }: ConflictPanelProps) {
  const [expanded, setExpanded] = useState(true)

  const { data: conflicts = [] } = useQuery({
    queryKey: ['project-conflicts', projectId],
    queryFn: () => projectsApi.getConflicts(projectId),
    staleTime: 30_000,
  })

  const totalConflicts = conflicts.reduce((s, p) => s + p.conflicts.length, 0)
  if (totalConflicts === 0) return null

  return (
    <div className="mb-4 border border-amber-200 rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-amber-50 text-left hover:bg-amber-100 transition-colors"
      >
        <AlertTriangle size={16} className="text-amber-500 shrink-0" />
        <span className="text-sm font-semibold text-amber-800 flex-1">
          {totalConflicts} resource conflict{totalConflicts > 1 ? 's' : ''} detected in this project
        </span>
        {expanded ? (
          <ChevronUp size={14} className="text-amber-500" />
        ) : (
          <ChevronDown size={14} className="text-amber-500" />
        )}
      </button>

      {/* Conflict rows */}
      {expanded && (
        <div className="divide-y divide-amber-100">
          {conflicts.map((pc) =>
            pc.conflicts.map((c, ci) => (
              <div
                key={`${pc.person_id}-${ci}`}
                className="flex items-center gap-3 px-4 py-2.5 bg-white hover:bg-amber-50/50"
              >
                {/* Person avatar */}
                <div className="w-6 h-6 rounded-full bg-amber-400 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                  {pc.person_name.charAt(0)}
                </div>

                <div className="flex-1 min-w-0 text-xs">
                  <span className="font-semibold text-gray-800">{pc.person_name}</span>
                  <span className="text-gray-500"> is double-booked on </span>
                  <span className="font-medium text-gray-800">{c.activity_a.name}</span>
                  <span className="text-gray-500"> and </span>
                  <span className="font-medium text-gray-800">{c.activity_b.name}</span>
                  <span className="text-gray-500">
                    {' '}(overlap: {format(colToDate(c.overlap_start), 'dd MMM')}
                    {' – '}
                    {format(colToDate(c.overlap_end), 'dd MMM')})
                  </span>
                </div>

                {onResolve && (
                  <button
                    onClick={() =>
                      onResolve({ id: c.activity_b.id, name: c.activity_b.name })
                    }
                    className="shrink-0 flex items-center gap-1 px-2 py-1 text-[11px] font-medium
                      text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                  >
                    <ExternalLink size={10} /> Resolve
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
