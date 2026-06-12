import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Sparkles, RefreshCw, ChevronDown, ChevronUp, MessageCircle } from 'lucide-react'
import { aiApi } from '../../api/ai'
import { useAIAssistantStore } from '../../store/aiAssistantStore'
import { Skeleton } from '../UI/Skeleton'

interface AIPredictionCardProps {
  projectId: string
}

export function AIPredictionCard({ projectId }: AIPredictionCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const { open } = useAIAssistantStore()

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['ai-quick-summary', projectId, refreshKey],
    queryFn: () => aiApi.quickSummary(projectId),
    staleTime: Infinity,
    retry: false,
  })

  const summary = data?.summary ?? ''
  const firstSentence = summary.split(/(?<=[.!?])\s/)[0] ?? ''

  if (isLoading) {
    return (
      <div className="bg-white border border-gray-100 rounded-xl p-4 mb-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={14} className="text-purple-500" />
          <span className="text-xs font-semibold text-gray-700">AI Project Health</span>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      </div>
    )
  }

  if (!summary) return null

  return (
    <div className="bg-white border border-purple-100 rounded-xl mb-4 shadow-sm overflow-hidden">
      {/* Header row */}
      <button
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-purple-50 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
          <Sparkles size={12} className="text-purple-600" />
        </div>
        <span className="text-xs font-semibold text-purple-800 flex-1">AI Project Health</span>
        {!expanded && (
          <span className="text-[11px] text-gray-500 truncate max-w-[220px] mr-2">
            {firstSentence}
          </span>
        )}
        {expanded ? (
          <ChevronUp size={14} className="text-gray-400 shrink-0" />
        ) : (
          <ChevronDown size={14} className="text-gray-400 shrink-0" />
        )}
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-purple-50">
          <p className="text-xs text-gray-700 leading-relaxed mt-3 whitespace-pre-wrap">{summary}</p>
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => {
                setRefreshKey((k) => k + 1)
              }}
              disabled={isFetching}
              className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={11} className={isFetching ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button
              onClick={() => open('Give me more detail on this project health summary and what I should do next.')}
              className="flex items-center gap-1.5 text-[11px] text-purple-600 hover:text-purple-800 transition-colors ml-auto"
            >
              <MessageCircle size={11} />
              Ask AI about this
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
