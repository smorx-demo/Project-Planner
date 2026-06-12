import { useState, useCallback } from 'react'
import { MarkdownMessage } from './MarkdownMessage'
import {
  X, Sparkles, AlertTriangle, RefreshCw, Link2, Users, Truck, Heart,
  RotateCcw, Copy, Check, MessageCircle, Zap,
} from 'lucide-react'
import { aiApi } from '../../api/ai'
import { useAIAssistantStore } from '../../store/aiAssistantStore'

interface Props {
  projectId: string
  projectName: string
  onClose: () => void
}

type PredictionType =
  | 'delay_risk'
  | 'recovery_plan'
  | 'critical_path'
  | 'resource_conflicts'
  | 'dispatch_forecast'
  | 'health_summary'

interface PredCard {
  type: PredictionType
  label: string
  description: string
  Icon: React.ElementType
  color: string          // text color
  bg: string             // bg color
  border: string         // border color
}

const CARDS: PredCard[] = [
  {
    type: 'delay_risk',
    label: 'Delay Risks',
    description: 'Identify activities at risk of missing their planned finish dates.',
    Icon: AlertTriangle,
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-100',
  },
  {
    type: 'recovery_plan',
    label: 'Recovery Plan',
    description: 'Suggest corrective actions to bring delayed activities back on track.',
    Icon: RotateCcw,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-100',
  },
  {
    type: 'critical_path',
    label: 'Critical Path',
    description: 'Analyse the longest dependency chain and float values across the schedule.',
    Icon: Link2,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-100',
  },
  {
    type: 'resource_conflicts',
    label: 'Resource Conflicts',
    description: 'Detect over-allocated resources and scheduling clashes between activities.',
    Icon: Users,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    border: 'border-orange-100',
  },
  {
    type: 'dispatch_forecast',
    label: 'Dispatch Forecast',
    description: 'Forecast upcoming activity dispatch dates based on current progress.',
    Icon: Truck,
    color: 'text-green-600',
    bg: 'bg-green-50',
    border: 'border-green-100',
  },
  {
    type: 'health_summary',
    label: 'Health Summary',
    description: 'Overall project health score, EVM metrics, and executive summary.',
    Icon: Heart,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    border: 'border-purple-100',
  },
]

interface PredState {
  loading: boolean
  result: string | null
  error: string | null
  copied: boolean
}

function initStates(): Record<PredictionType, PredState> {
  const s = {} as Record<PredictionType, PredState>
  for (const c of CARDS) s[c.type] = { loading: false, result: null, error: null, copied: false }
  return s
}

export function AIInsightsPanel({ projectId, projectName, onClose }: Props) {
  const [states, setStates] = useState<Record<PredictionType, PredState>>(initStates)
  const [runningAll, setRunningAll] = useState(false)
  const { open: openChat } = useAIAssistantStore()

  const patch = useCallback((type: PredictionType, patch: Partial<PredState>) => {
    setStates((prev) => ({ ...prev, [type]: { ...prev[type], ...patch } }))
  }, [])

  const runPrediction = useCallback(async (type: PredictionType) => {
    patch(type, { loading: true, error: null })
    try {
      const res = await aiApi.predict(projectId, type)
      patch(type, { loading: false, result: res.prediction })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'AI request failed'
      patch(type, { loading: false, error: msg })
    }
  }, [projectId, patch])

  const runAll = useCallback(async () => {
    setRunningAll(true)
    await Promise.allSettled(CARDS.map((c) => runPrediction(c.type)))
    setRunningAll(false)
  }, [runPrediction])

  const copyResult = useCallback(async (type: PredictionType, text: string) => {
    await navigator.clipboard.writeText(text)
    patch(type, { copied: true })
    setTimeout(() => patch(type, { copied: false }), 1500)
  }, [patch])

  const anyLoading = CARDS.some((c) => states[c.type].loading)

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-[480px] bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="w-8 h-8 rounded-xl bg-purple-100 flex items-center justify-center">
            <Sparkles size={16} className="text-purple-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">AI Insights</p>
            <p className="text-[11px] text-gray-400 truncate">{projectName}</p>
          </div>
          <button
            onClick={runAll}
            disabled={anyLoading || runningAll}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
              bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Zap size={12} className={runningAll ? 'animate-pulse' : ''} />
            {runningAll ? 'Running…' : 'Run All'}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Cards scroll area */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {CARDS.map(({ type, label, description, Icon, color, bg, border }) => {
            const s = states[type]
            const hasResult = !!s.result

            return (
              <div
                key={type}
                className={`rounded-xl border ${border} overflow-hidden`}
              >
                {/* Card header */}
                <div className={`flex items-start gap-3 px-4 py-3 ${bg}`}>
                  <div className={`mt-0.5 shrink-0 ${color}`}>
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold ${color}`}>{label}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{description}</p>
                  </div>
                  <button
                    onClick={() => runPrediction(type)}
                    disabled={s.loading}
                    className={`shrink-0 flex items-center gap-1 text-[11px] font-medium px-2.5 py-1
                      rounded-lg border transition-colors disabled:opacity-50
                      ${hasResult
                        ? 'border-gray-200 text-gray-600 bg-white hover:bg-gray-50'
                        : `border-current ${color} bg-white hover:opacity-80`
                      }`}
                  >
                    {s.loading ? (
                      <RefreshCw size={11} className="animate-spin" />
                    ) : hasResult ? (
                      <RefreshCw size={11} />
                    ) : (
                      <Sparkles size={11} />
                    )}
                    {s.loading ? 'Running' : hasResult ? 'Refresh' : 'Generate'}
                  </button>
                </div>

                {/* Loading dots */}
                {s.loading && (
                  <div className="px-4 py-3 flex items-center gap-1.5">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce"
                        style={{ animationDelay: `${i * 120}ms` }}
                      />
                    ))}
                    <span className="text-[11px] text-gray-400 ml-1">Analysing…</span>
                  </div>
                )}

                {/* Error */}
                {!s.loading && s.error && (
                  <div className="px-4 py-3">
                    <p className="text-[11px] text-red-500">{s.error}</p>
                  </div>
                )}

                {/* Result */}
                {!s.loading && s.result && (
                  <div className="px-4 py-3 border-t border-gray-100">
                    <div className="max-h-48 overflow-y-auto">
                      <MarkdownMessage content={s.result} />
                    </div>
                    <div className="flex items-center gap-3 mt-2.5 pt-2 border-t border-gray-50">
                      <button
                        onClick={() => copyResult(type, s.result!)}
                        className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        {s.copied ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
                        {s.copied ? 'Copied' : 'Copy'}
                      </button>
                      <button
                        onClick={() => {
                          openChat(`I just ran the "${label}" AI prediction for project "${projectName}". Here's the result:\n\n${s.result}\n\nCan you give me more detail and specific next steps?`)
                          onClose()
                        }}
                        className="flex items-center gap-1 text-[11px] text-purple-600 hover:text-purple-800 transition-colors ml-auto"
                      >
                        <MessageCircle size={11} />
                        Ask AI follow-up
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-100 shrink-0">
          <button
            onClick={() => {
              openChat(`Give me a comprehensive analysis of project "${projectName}" covering schedule risks, resource utilisation, and recommended actions.`)
              onClose()
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-medium
              text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-xl transition-colors border border-purple-100"
          >
            <MessageCircle size={13} />
            Open AI Chat for deeper analysis
          </button>
        </div>
      </div>
    </>
  )
}
