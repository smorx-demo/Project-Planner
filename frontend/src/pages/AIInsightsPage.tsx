import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Sparkles, AlertTriangle, RotateCcw, Link2, Users, Truck, Heart,
  Zap, Copy, Check, MessageCircle, RefreshCw, ChevronDown, ChevronUp,
} from 'lucide-react'
import { projectsApi } from '../api/projects'
import { aiApi } from '../api/ai'
import { useAIAssistantStore } from '../store/aiAssistantStore'
import { MarkdownMessage } from '../components/AI/MarkdownMessage'
import type { Project } from '../types'

// ── Prediction definitions ────────────────────────────────────────────────────

type PredictionType =
  | 'delay_risk' | 'recovery_plan' | 'critical_path'
  | 'resource_conflicts' | 'dispatch_forecast' | 'health_summary'

interface CardDef {
  type: PredictionType
  label: string
  tagline: string
  description: string
  Icon: React.ElementType
  accent: string       // bg accent bar
  iconBg: string
  iconColor: string
  btnBg: string
}

const CARDS: CardDef[] = [
  {
    type: 'health_summary',
    label: 'Health Summary',
    tagline: 'Executive overview',
    description: 'Overall project health score, EVM metrics, and a plain-language summary for management.',
    Icon: Heart,
    accent: 'bg-violet-500',
    iconBg: 'bg-violet-100',
    iconColor: 'text-violet-600',
    btnBg: 'bg-violet-600 hover:bg-violet-700',
  },
  {
    type: 'delay_risk',
    label: 'Delay Risks',
    tagline: 'Schedule threats',
    description: 'Identify every activity at risk of missing its planned finish and the downstream impact.',
    Icon: AlertTriangle,
    accent: 'bg-red-500',
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600',
    btnBg: 'bg-red-600 hover:bg-red-700',
  },
  {
    type: 'recovery_plan',
    label: 'Recovery Plan',
    tagline: 'Get back on track',
    description: 'Specific corrective actions per delayed activity — with named owners and days saved.',
    Icon: RotateCcw,
    accent: 'bg-amber-500',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    btnBg: 'bg-amber-600 hover:bg-amber-700',
  },
  {
    type: 'critical_path',
    label: 'Critical Path',
    tagline: 'Zero-float chain',
    description: 'The longest dependency chain from start to dispatch — with float values for each activity.',
    Icon: Link2,
    accent: 'bg-blue-500',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    btnBg: 'bg-blue-600 hover:bg-blue-700',
  },
  {
    type: 'resource_conflicts',
    label: 'Resource Conflicts',
    tagline: 'People & capacity',
    description: 'Detect over-allocated staff, double-bookings, and department overloads with reallocation ideas.',
    Icon: Users,
    accent: 'bg-orange-500',
    iconBg: 'bg-orange-100',
    iconColor: 'text-orange-600',
    btnBg: 'bg-orange-600 hover:bg-orange-700',
  },
  {
    type: 'dispatch_forecast',
    label: 'Dispatch Forecast',
    tagline: 'Revised delivery date',
    description: 'Cascade current delays through the activity chain and calculate the revised dispatch date.',
    Icon: Truck,
    accent: 'bg-emerald-500',
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
    btnBg: 'bg-emerald-600 hover:bg-emerald-700',
  },
]

// ── State ─────────────────────────────────────────────────────────────────────

interface PredState {
  loading: boolean
  result: string | null
  error: string | null
  copied: boolean
  expanded: boolean
}

function initStates(): Record<PredictionType, PredState> {
  const s = {} as Record<PredictionType, PredState>
  for (const c of CARDS) s[c.type] = { loading: false, result: null, error: null, copied: false, expanded: true }
  return s
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AIInsightsPage() {
  const [selectedId, setSelectedId] = useState<string>('')
  const [states, setStates] = useState<Record<PredictionType, PredState>>(initStates)
  const [runningAll, setRunningAll] = useState(false)
  const { open: openChat } = useAIAssistantStore()

  const { data: projects = [], isLoading: projLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list(),
    staleTime: 60_000,
  })

  const activeProjects = projects.filter((p: Project) => p.status === 'ACTIVE')
  const selected = projects.find((p: Project) => p.id === selectedId)

  const patch = useCallback((type: PredictionType, patch: Partial<PredState>) => {
    setStates((prev) => ({ ...prev, [type]: { ...prev[type], ...patch } }))
  }, [])

  const runPrediction = useCallback(async (type: PredictionType) => {
    if (!selectedId) return
    patch(type, { loading: true, error: null, expanded: true })
    try {
      const res = await aiApi.predict(selectedId, type)
      patch(type, { loading: false, result: res.prediction })
    } catch (e: unknown) {
      patch(type, { loading: false, error: e instanceof Error ? e.message : 'AI request failed' })
    }
  }, [selectedId, patch])

  const runAll = useCallback(async () => {
    if (!selectedId) return
    setRunningAll(true)
    await Promise.allSettled(CARDS.map((c) => runPrediction(c.type)))
    setRunningAll(false)
  }, [selectedId, runPrediction])

  const copyResult = useCallback(async (type: PredictionType, text: string) => {
    await navigator.clipboard.writeText(text)
    patch(type, { copied: true })
    setTimeout(() => patch(type, { copied: false }), 1500)
  }, [patch])

  const anyResult = CARDS.some((c) => states[c.type].result)
  const anyLoading = CARDS.some((c) => states[c.type].loading)

  return (
    <div className="min-h-full bg-gray-50 dark:bg-gray-950 transition-colors">

      {/* ── Hero banner ──────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-[#1e1b4b] via-[#312e81] to-[#4c1d95] px-6 lg:px-8 py-10">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center">
              <Sparkles size={20} className="text-violet-200" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">AI Project Intelligence</h1>
              <p className="text-violet-300 text-sm">Powered by Claude Sonnet — instant analysis, no guesswork</p>
            </div>
          </div>

          {/* Project selector + Run All */}
          <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex-1 max-w-xs">
              <label className="block text-xs text-violet-300 font-medium mb-1.5">Select project to analyse</label>
              <select
                value={selectedId}
                onChange={(e) => {
                  setSelectedId(e.target.value)
                  setStates(initStates())
                }}
                className="w-full px-3 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white text-sm
                  focus:outline-none focus:ring-2 focus:ring-violet-400 placeholder-violet-300
                  [&>option]:text-gray-900 [&>option]:bg-white"
              >
                <option value="">— Choose a project —</option>
                {projLoading && <option disabled>Loading…</option>}
                {activeProjects.map((p: Project) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 sm:mt-5">
              <button
                onClick={runAll}
                disabled={!selectedId || anyLoading || runningAll}
                className="flex items-center gap-2 px-5 py-2.5 bg-violet-500 hover:bg-violet-400
                  text-white text-sm font-semibold rounded-xl transition-all
                  disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-violet-900/30
                  active:scale-95"
              >
                <Zap size={15} className={runningAll ? 'animate-pulse' : ''} />
                {runningAll ? 'Analysing all…' : 'Run All 6 Insights'}
              </button>

              {anyResult && (
                <button
                  onClick={() => {
                    openChat(`Give me a comprehensive analysis of project "${selected?.name}" covering all risks, resources, and recommended actions.`)
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20
                    text-white text-sm font-medium rounded-xl transition-all border border-white/20"
                >
                  <MessageCircle size={14} />
                  Deep-dive chat
                </button>
              )}
            </div>
          </div>

          {/* Status chips */}
          {selectedId && (
            <div className="flex flex-wrap gap-2 mt-4">
              {CARDS.map((c) => {
                const s = states[c.type]
                return (
                  <span
                    key={c.type}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors
                      ${s.result
                        ? 'bg-emerald-500/20 border-emerald-400/30 text-emerald-200'
                        : s.loading
                        ? 'bg-violet-500/20 border-violet-400/30 text-violet-200'
                        : s.error
                        ? 'bg-red-500/20 border-red-400/30 text-red-200'
                        : 'bg-white/5 border-white/10 text-violet-300'
                      }`}
                  >
                    {s.loading ? '⟳ ' : s.result ? '✓ ' : s.error ? '✕ ' : '○ '}{c.label}
                  </span>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Cards grid ───────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-6 lg:px-8 py-8">
        {!selectedId && (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mx-auto mb-4">
              <Sparkles size={28} className="text-violet-500 dark:text-violet-400" />
            </div>
            <p className="text-gray-800 dark:text-gray-200 font-semibold text-lg">Select a project above to begin</p>
            <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Choose any active project and run one or all six AI analyses</p>
          </div>
        )}

        {selectedId && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {CARDS.map((card) => {
              const { type, label, tagline, description, Icon, accent, iconBg, iconColor, btnBg } = card
              const s = states[type]

              return (
                <div
                  key={type}
                  className={`bg-white dark:bg-gray-900 rounded-2xl shadow-sm flex flex-col overflow-hidden transition-all duration-200
                    border ${s.loading
                      ? 'border-violet-200 dark:border-violet-800'
                      : 'border-gray-200 dark:border-gray-800'}
                    hover:shadow-md dark:hover:shadow-black/30 hover:border-gray-300 dark:hover:border-gray-700`}
                >
                  {/* Accent top bar */}
                  <div className={`h-1 ${accent}`} />

                  {/* Card header */}
                  <div className="p-5 flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
                      <Icon size={18} className={iconColor} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm leading-tight">{label}</p>
                      <p className={`text-[11px] font-medium mt-0.5 ${iconColor}`}>{tagline}</p>
                    </div>
                  </div>

                  <p className="px-5 text-xs text-gray-500 dark:text-gray-400 leading-relaxed -mt-1">{description}</p>

                  {/* Action button */}
                  <div className="px-5 pt-4 pb-4">
                    <button
                      onClick={() => runPrediction(type)}
                      disabled={s.loading}
                      className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
                        text-white text-xs font-semibold transition-all active:scale-[.98]
                        disabled:opacity-60 disabled:cursor-not-allowed ${btnBg}`}
                    >
                      {s.loading ? (
                        <>
                          <RefreshCw size={13} className="animate-spin" />
                          Analysing…
                        </>
                      ) : s.result ? (
                        <>
                          <RefreshCw size={13} />
                          Refresh
                        </>
                      ) : (
                        <>
                          <Sparkles size={13} />
                          Generate Insight
                        </>
                      )}
                    </button>
                  </div>

                  {/* Loading shimmer */}
                  {s.loading && (
                    <div className="px-5 pb-5 space-y-2">
                      {[100, 80, 90, 70].map((w, i) => (
                        <div
                          key={i}
                          className="h-2.5 bg-gray-100 rounded-full animate-pulse"
                          style={{ width: `${w}%`, animationDelay: `${i * 100}ms` }}
                        />
                      ))}
                    </div>
                  )}

                  {/* Error */}
                  {!s.loading && s.error && (
                    <div className="mx-5 mb-5 px-3 py-2.5 bg-red-50 border border-red-100 rounded-xl">
                      <p className="text-xs text-red-600">{s.error}</p>
                    </div>
                  )}

                  {/* Result */}
                  {!s.loading && s.result && (
                    <div className="border-t border-gray-50 flex-1 flex flex-col">
                      {/* Collapse toggle */}
                      <button
                        onClick={() => patch(type, { expanded: !s.expanded })}
                        className="flex items-center justify-between px-5 py-2.5 text-[11px]
                          text-gray-400 dark:text-gray-500
                          hover:text-gray-600 dark:hover:text-gray-300
                          hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        <span className="font-medium text-gray-600 dark:text-gray-400">Analysis result</span>
                        {s.expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>

                      {s.expanded && (
                        <div className="px-5 pb-4">
                          <div className="max-h-64 overflow-y-auto">
                            <MarkdownMessage content={s.result} />
                          </div>
                          {/* Actions */}
                          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                            <button
                              onClick={() => copyResult(type, s.result!)}
                              className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-700 transition-colors"
                            >
                              {s.copied
                                ? <><Check size={11} className="text-emerald-500" /> Copied</>
                                : <><Copy size={11} /> Copy</>
                              }
                            </button>
                            <button
                              onClick={() => openChat(`I ran the "${label}" analysis for "${selected?.name}":\n\n${s.result}\n\nGive me more detail and specific next steps.`)}
                              className="flex items-center gap-1.5 text-[11px] text-violet-600 hover:text-violet-800 transition-colors ml-auto font-medium"
                            >
                              <MessageCircle size={11} />
                              Ask AI follow-up
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Bottom CTA */}
        {anyResult && (
          <div className="mt-8 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-2xl p-6 text-center shadow-lg">
            <Sparkles size={24} className="text-white/70 mx-auto mb-2" />
            <p className="text-white font-semibold mb-1">Want to go deeper?</p>
            <p className="text-violet-200 text-sm mb-4">Open the AI assistant to ask follow-up questions, compare projects, or get step-by-step recovery guidance.</p>
            <button
              onClick={() => openChat(`I've reviewed the AI insights for project "${selected?.name}". Give me a prioritised action plan for the next 7 days.`)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-violet-700
                font-semibold text-sm rounded-xl hover:bg-violet-50 transition-colors"
            >
              <MessageCircle size={15} />
              Open AI Chat
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
