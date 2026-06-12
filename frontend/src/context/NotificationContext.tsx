import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { notificationsApi } from '../api/notifications'
import { useAuthStore } from '../store/authStore'
import type { AppNotification } from '../types'

interface NotificationContextValue {
  notifications: AppNotification[]
  unreadCount: number
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
  refetch: () => void
}

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  unreadCount: 0,
  markRead: async () => {},
  markAllRead: async () => {},
  refetch: () => {},
})

export function useNotifications() {
  return useContext(NotificationContext)
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetch = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const data = await notificationsApi.list()
      setNotifications(data.notifications)
      setUnreadCount(data.unread_count)
    } catch (err: any) {
      // On 401 just stop polling quietly — the axios interceptor handles forced logout
      // only when the user explicitly triggers an action, not background polls
      if (err?.response?.status === 401) {
        if (intervalRef.current) clearInterval(intervalRef.current)
      }
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated) {
      setNotifications([])
      setUnreadCount(0)
      return
    }
    fetch()
    intervalRef.current = setInterval(fetch, 30_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isAuthenticated, fetch])

  const markRead = useCallback(async (id: string) => {
    await notificationsApi.markRead(id)
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    )
    setUnreadCount((c) => Math.max(0, c - 1))
  }, [])

  const markAllRead = useCallback(async () => {
    await notificationsApi.markAllRead()
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    setUnreadCount(0)
  }, [])

  return (
    <NotificationContext.Provider
      value={{ notifications, unreadCount, markRead, markAllRead, refetch: fetch }}
    >
      {children}
    </NotificationContext.Provider>
  )
}
