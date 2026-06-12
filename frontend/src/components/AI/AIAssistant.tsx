import { useEffect, useRef, useState, useCallback } from 'react'
import ReactDOM from 'react-dom'
import { MarkdownMessage } from './MarkdownMessage'
import {
  Sparkles,
  ChevronDown,
  Send,
  Copy,
  Check,
  RotateCcw,
  X,
} from 'lucide-react'
import { useLocation, useMatch } from 'react-router-dom'
import { useAIChat } from '../../hooks/useAIChat'
import { useAIAssistantStore } from '../../store/aiAssistantStore'

// ── Quick actions per route ────────────────────────────────────────────────

interface QuickAction {
  label: string
  message: string
}

const PROJECT_ACTIONS: QuickAction[] = [
  { label: 'Delay risks', message: 'Which activities are at risk of delay or already delayed? Give details.' },
  { label: 'Recovery plan', message: 'The project has delays. Create a practical recovery plan with days that could be saved.' },
  { label: 'Critical path', message: 'Identify the critical path activities and their float in days.' },
  { label: 'Health summary', message: 'Write a brief management summary of this project\'s current health.' },
  { label: 'Forecast dispatch', message: 'What is the forecast dispatch date based on current actual progress?' },
]

const PERFORMANCE_ACTIONS: QuickAction[] = [
  { label: 'Top performers', message: 'Who are the top performers and what makes them successful?' },
  { label: 'Coaching tips', message: 'Which team members need coaching and what specific tips would help?' },
  { label: 'Who is overloaded?', message: 'Which team members are currently overloaded or have too many concurrent tasks?' },
]

const RESOURCE_ACTIONS: QuickAction[] = [
  { label: 'Conflict check', message: 'Are there any resource conflicts or double-bookings?' },
  { label: 'Optimal allocation', message: 'How should resources be optimally reallocated to reduce conflicts?' },
]

const DASHBOARD_ACTIONS: QuickAction[] = [
  { label: 'All projects health', message: 'Summarise the health status of all active projects.' },
  { label: 'Most critical project', message: 'Which project is most at risk and needs immediate attention?' },
]

// ── Loading dots ──────────────────────────────────────────────────────────

function LoadingDots() {
  return (
    <div className="flex gap-1 items-center px-3 py-2.5 bg-gray-50 rounded-2xl rounded-tl-sm w-fit">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────

interface AIAssistantProps {
  projectId?: string | null
  projectName?: string | null
}

export function AIAssistant({ projectId, projectName }: AIAssistantProps) {
  const { isOpen, preloadedMessage, hasUnseenInsight, open, close, clearPreloaded } =
    useAIAssistantStore()

  const { messages, isStreaming, streamingContent, error, sendMessage, clearHistory } =
    useAIChat({ projectId })

  const [input, setInput] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Route-based quick actions
  const location = useLocation()
  const projectMatch = useMatch('/projects/:id')
  const quickActions: QuickAction[] = projectMatch
    ? PROJECT_ACTIONS
    : location.pathname.includes('/performance')
    ? PERFORMANCE_ACTIONS
    : location.pathname.includes('/resources')
    ? RESOURCE_ACTIONS
    : DASHBOARD_ACTIONS

  // Auto-scroll on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, streamingContent])

  // Handle preloaded message when panel opens
  useEffect(() => {
    if (isOpen && preloadedMessage) {
      sendMessage(preloadedMessage)
      clearPreloaded()
    }
  }, [isOpen]) // only on open, intentionally not including preloadedMessage

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 120)
      return () => clearTimeout(t)
    }
  }, [isOpen])

  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text || isStreaming) return
    sendMessage(text)
    setInput('')
  }, [input, isStreaming, sendMessage])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  const handleCopy = useCallback(async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // clipboard not available
    }
  }, [])

  const panel = isOpen ? (
    // Expanded panel
    <div
      style={{ pointerEvents: 'auto' }}
      className="fixed bottom-6 right-6 w-[380px] h-[540px]
        bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800
        rounded-2xl shadow-2xl dark:shadow-black/50 flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="h-11 flex items-center gap-2 px-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <Sparkles size={14} className="text-purple-500 shrink-0" />
        <span className="text-[13px] font-medium text-gray-800 dark:text-gray-200">AI Assistant</span>
        <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 text-[10px] rounded-full">
          claude-sonnet
        </span>

        {projectName && (
          <span className="ml-auto mr-1 px-2 py-0.5 bg-purple-50 text-purple-600 text-[10px] rounded-full truncate max-w-[120px]">
            {projectName}
          </span>
        )}

        <button
          onClick={close}
          className={`${projectName ? '' : 'ml-auto'} p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0`}
        >
          <ChevronDown size={16} />
        </button>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && !isStreaming && (
          <p className="text-[11px] text-gray-400 text-center pt-4">
            Ask anything about{' '}
            {projectName ? <strong>{projectName}</strong> : 'your projects'}.
          </p>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} group`}
          >
            {msg.role === 'user' ? (
              <div className="max-w-[85%] px-3 py-2 bg-blue-500 text-white text-xs rounded-2xl rounded-tr-sm leading-relaxed">
                {msg.content}
              </div>
            ) : (
              <div className="max-w-[88%] relative">
                <div className="px-3 py-2.5 bg-gray-50 dark:bg-gray-800 rounded-2xl rounded-tl-sm">
                  <MarkdownMessage content={msg.content} /></div>
                <button
                  onClick={() => handleCopy(msg.id, msg.content)}
                  className="absolute -bottom-5 right-0 opacity-0 group-hover:opacity-100 transition-opacity
                    flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600"
                >
                  {copiedId === msg.id ? (
                    <><Check size={10} className="text-green-500" /> Copied!</>
                  ) : (
                    <><Copy size={10} /> Copy</>
                  )}
                </button>
              </div>
            )}
          </div>
        ))}

        {/* Streaming message */}
        {isStreaming && streamingContent && (
          <div className="flex justify-start">
            <div className="max-w-[88%] px-3 py-2.5 bg-gray-50 dark:bg-gray-800 rounded-2xl rounded-tl-sm">
              <MarkdownMessage content={streamingContent} />
              <span className="animate-pulse text-purple-400 ml-0.5 font-bold text-xs">|</span>
            </div>
          </div>
        )}

        {/* Loading dots (before first token) */}
        {isStreaming && !streamingContent && (
          <div className="flex justify-start">
            <LoadingDots />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex justify-start">
            <div className="max-w-[88%] px-3 py-2 bg-red-50 text-red-600 text-xs rounded-2xl rounded-tl-sm flex items-center gap-2">
              {error}
              <button
                onClick={() => {
                  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
                  if (lastUser) sendMessage(lastUser.content)
                }}
                className="ml-1 p-0.5 hover:bg-red-100 rounded"
              >
                <RotateCcw size={11} />
              </button>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Quick actions */}
      {messages.length === 0 && !isStreaming && (
        <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-800">
          <p className="text-[10px] text-gray-400 dark:text-gray-600 mb-1.5 uppercase tracking-widest font-semibold">
            Quick actions
          </p>
          <div className="flex flex-wrap gap-1.5">
            {quickActions.map((action) => (
              <button
                key={action.label}
                onClick={() => { sendMessage(action.message) }}
                className="px-2.5 py-1 text-[11px]
                  bg-violet-50 dark:bg-violet-900/20
                  text-violet-700 dark:text-violet-400
                  rounded-full hover:bg-violet-100 dark:hover:bg-violet-900/40
                  transition-colors border border-violet-100 dark:border-violet-800"
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="h-[52px] border-t border-gray-100 dark:border-gray-800 flex items-end gap-2 px-3 py-2 shrink-0">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isStreaming}
          placeholder="Ask anything about this project..."
          rows={1}
          className="flex-1 resize-none text-xs text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 bg-transparent
            outline-none leading-relaxed disabled:opacity-50 self-center"
          style={{ maxHeight: 80 }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isStreaming}
          className={`p-1.5 rounded-lg shrink-0 transition-colors ${
            input.trim() && !isStreaming
              ? 'bg-violet-600 text-white hover:bg-violet-700'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-300 dark:text-gray-600'
          }`}
        >
          <Send size={13} />
        </button>
      </div>

      {/* Footer */}
      <div className="px-3 pb-2.5 flex items-center shrink-0">
        {messages.length > 0 && (
          <button
            onClick={clearHistory}
            className="text-[11px] text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 transition-colors"
          >
            Clear conversation
          </button>
        )}
      </div>
    </div>
  ) : (
    // Collapsed button
    <div
      style={{ pointerEvents: 'auto' }}
      className="fixed bottom-6 right-6 flex flex-col items-center gap-1"
    >
      <div className="relative">
        <button
          onClick={() => open()}
          className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg
            hover:scale-105 active:scale-95 transition-transform"
          style={{ background: '#7F77DD' }}
          aria-label="Open AI Assistant"
        >
          <Sparkles size={22} color="white" />
        </button>
        {hasUnseenInsight && (
          <div className="absolute top-0.5 right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-white" />
        )}
      </div>
      <span className="text-[11px] text-gray-500 font-medium">AI</span>
    </div>
  )

  return ReactDOM.createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'none' }}
      aria-hidden={!isOpen}
    >
      {panel}
    </div>,
    document.body
  )
}
