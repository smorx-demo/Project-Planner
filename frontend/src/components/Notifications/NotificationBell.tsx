import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useNotifications } from '../../context/NotificationContext'
import type { AppNotification, NotificationType } from '../../types'

const TYPE_COLORS: Record<NotificationType, string> = {
  ACTIVITY_DELAYED:  'border-red-500 bg-red-50',
  ACTIVITY_SLOW:     'border-orange-400 bg-orange-50',
  PERSON_OVERLOADED: 'border-purple-400 bg-purple-50',
  PROJECT_BEHIND:    'border-red-400 bg-red-50',
  DAILY_DIGEST:      'border-blue-400 bg-blue-50',
  CONFLICT_DETECTED: 'border-amber-400 bg-amber-50',
}

const TYPE_BORDER: Record<NotificationType, string> = {
  ACTIVITY_DELAYED:  'border-l-red-500',
  ACTIVITY_SLOW:     'border-l-orange-400',
  PERSON_OVERLOADED: 'border-l-purple-400',
  PROJECT_BEHIND:    'border-l-red-400',
  DAILY_DIGEST:      'border-l-blue-400',
  CONFLICT_DETECTED: 'border-l-amber-400',
}

export function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  // Update document title
  useEffect(() => {
    document.title = unreadCount > 0 ? `(${unreadCount}) Project Planner` : 'Project Planner'
  }, [unreadCount])

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function handleItemClick(n: AppNotification) {
    if (!n.is_read) await markRead(n.id)
    setOpen(false)
    if (n.project_id) navigate(`/projects/${n.project_id}`)
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
        aria-label="Notifications"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[360px] max-h-[480px] bg-white rounded-2xl shadow-xl border border-gray-100 flex flex-col z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-sm text-gray-900">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead()}
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                <CheckCheck size={13} /> Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <Bell size={32} className="mb-2 opacity-30" />
                <p className="text-sm">All caught up ✓</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleItemClick(n)}
                    className={`w-full text-left px-4 py-3 border-l-4 hover:bg-gray-50 transition-colors ${TYPE_BORDER[n.type]} ${!n.is_read ? 'bg-blue-50/40' : 'bg-white'}`}
                  >
                    <p className={`text-[13px] font-semibold leading-tight mb-0.5 ${!n.is_read ? 'text-gray-900' : 'text-gray-600'}`}>
                      {n.title}
                    </p>
                    <p className="text-xs text-gray-500 line-clamp-2 mb-1">{n.message}</p>
                    <p className="text-[11px] text-gray-400">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-100 px-4 py-2.5">
            <button
              onClick={() => { setOpen(false); navigate('/notifications') }}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium w-full text-center"
            >
              View all notifications →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
