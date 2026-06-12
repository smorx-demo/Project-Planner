import { useState, useCallback, useRef } from 'react'
import { useAuthStore } from '../store/authStore'

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || '/api/v1'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface UseAIChatOptions {
  projectId?: string | null
}

export function useAIChat({ projectId }: UseAIChatOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Refs to avoid stale closures in async operations
  const messagesRef = useRef<ChatMessage[]>([])
  const isStreamingRef = useRef(false)

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreamingRef.current) return

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text.trim(),
        timestamp: new Date(),
      }

      const apiMessages = [
        ...messagesRef.current.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: text.trim() },
      ]

      messagesRef.current = [...messagesRef.current, userMsg]
      setMessages([...messagesRef.current])

      isStreamingRef.current = true
      setIsStreaming(true)
      setStreamingContent('')
      setError(null)

      const token = useAuthStore.getState().token

      try {
        const response = await fetch(`${API_BASE}/ai/chat/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            message: text.trim(),
            project_id: projectId ?? null,
            messages: apiMessages,
          }),
        })

        if (!response.ok || !response.body) {
          throw new Error(`Request failed (${response.status})`)
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let accumulated = ''
        let buffer = ''
        let done = false

        while (!done) {
          const { done: streamDone, value } = await reader.read()
          if (streamDone) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const token = line.slice(6)
            if (token === '[DONE]') { done = true; break }
            if (token.startsWith('[ERROR]')) throw new Error(token.slice(7).trim())
            if (token) {
              accumulated += token
              setStreamingContent(accumulated)
            }
          }
        }

        if (accumulated) {
          const aiMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: accumulated,
            timestamp: new Date(),
          }
          messagesRef.current = [...messagesRef.current, aiMsg]
          setMessages([...messagesRef.current])
        }
        setStreamingContent('')
      } catch (err) {
        const msg = (err as Error).message || 'AI request failed'
        setError(msg)
        setStreamingContent('')
      } finally {
        isStreamingRef.current = false
        setIsStreaming(false)
      }
    },
    [projectId]
  )

  const clearHistory = useCallback(() => {
    messagesRef.current = []
    setMessages([])
    setStreamingContent('')
    setError(null)
  }, [])

  const retryLast = useCallback(() => {
    const msgs = messagesRef.current
    const lastUser = [...msgs].reverse().find((m) => m.role === 'user')
    if (!lastUser || isStreamingRef.current) return

    const lastMsg = msgs[msgs.length - 1]
    if (lastMsg?.role === 'assistant') {
      messagesRef.current = msgs.slice(0, -1)
      setMessages([...messagesRef.current])
    }

    sendMessage(lastUser.content)
  }, [sendMessage])

  return { messages, isStreaming, streamingContent, error, sendMessage, clearHistory, retryLast }
}
