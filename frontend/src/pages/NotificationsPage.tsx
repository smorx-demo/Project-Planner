import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, isToday, isYesterday, isThisWeek } from 'date-fns'
import {
  Bell, AlertTriangle, Clock, Users, TrendingDown, BookOpen, GitBranch,
  CheckCircle2,
} from 'lucide-react'
import { useNotifications } from '../context/NotificationContext'
import type { AppNotification, NotificationType } from '../types'

type FilterTab = 'all' | 'unread' | 'delays' | 'conflicts' | 'digest'

const TYPE_ICONS: Record<NotificationType, React.ReactNode> = {
  ACTIVITY_DELAYED:  <AlertTriangle size={16} className="text-red-500" />,
  ACTIVITY_SLOW:     <Clock size={16} className="text-orange-400" />,
  PERSON_OVERLOADED: <Users size={16} className="text-purple-500" />,
  PROJECT_BEHIND:    <TrendingDown size={16} className="text-red-400" />,
  DAILY_DIGEST:      <BookOpen size={16} className="text-blue-500" />,
  CONFLICT_DETECTED: <GitBranch size={16} className="text-amber-500" />,
}

const TYPE_BORDER: Record<NotificationType, string> = {
  ACTIVITY_DELAYED:  'border-l-red-500',
  ACTIVITY_SLOW:     'border-l-orange-400',
  PERSON_OVERLOADED: 'border-l-purple-400',
  PROJECT_BEHIND:    'border-l-red-400',
  DAILY_DIGEST:      'border-l-blue-400',
  CONFLICT_DETECTED: 'border-l-amber-400',
}

function dateGroup(iso: string): string {
  const d = new Date(iso)
  if (isToday(d)) return 'Today'
  if (isYesterday(d)) return 'Yesterday'
  if (isThisWeek(d)) return 'Last week'
  return format(d, 'MMMM yyyy')
}

function groupByDate(items: AppNotification[]): { group: string; items: AppNotification[] }[] {
  const map = new Map<string, AppNotification[]>()
  for (const n of items) {
    const g = dateGroup(n.created_at)
    if (!map.has(g)) map.set(g, [])
    map.get(g)!.push(n)
  }
  return Array.from(map.entries()).map(([group, items]) => ({ group, items }))
}

const TAB_FILTERS: Record<FilterTab, (n: AppNotification) => boolean> = {
  all:       () => true,
  unread:    (n) => !n.is_read,
  delays:    (n) => n.type === 'ACTIVITY_DELAYED' || n.type === 'ACTIVITY_SLOW' || n.type === 'PROJECT_BEHIND',
  conflicts: (n) => n.type === 'CONFLICT_DETECTED' || n.type === 'PERSON_OVERLOADED',
  digest:    (n) => n.type === 'DAILY_DIGEST',
}

export function NotificationsPage() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications()
  const [tab, setTab] = useState<FilterTab>('all')
  const navigate = useNavigate()

  const filtered = notifications.filter(TAB_FILTERS[tab])
  const groups = groupByDate(filtered)

  const tabs: { id: FilterTab; label: string; count?: number }[] = [
    { id: 'all',       label: 'All',       count: notifications.length },
    { id: 'unread',    label: 'Unread',    count: unreadCount || undefined },
    { id: 'delays',    label: 'Delays' },
    { id: 'conflicts', label: 'Conflicts' },
    { id: 'digest',    label: 'Digest' },
  ]

  async function handleClick(n: AppNotification) {
    if (!n.is_read) await markRead(n.id)
    if (n.project_id) navigate(`/projects/${n.project_id}`)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
            <p className="text-sm text-gray-500 mt-0.5">{unreadCount} unread</p>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead()}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <CheckCircle2 size={15} /> Mark all read
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 mb-6">
          {tabs.map(({ id, label, count }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === id ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {label}
              {count !== undefined && count > 0 && (
                <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-bold ${
                  tab === id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                }`}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Groups */}
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Bell size={40} className="mb-3 opacity-30" />
            <p>No notifications</p>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map(({ group, items }) => (
              <div key={group}>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
                  {group}
                </p>
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
                  {items.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => handleClick(n)}
                      className={`w-full text-left flex items-start gap-4 px-5 py-4 border-l-4 hover:bg-gray-50 transition-colors ${TYPE_BORDER[n.type]} ${!n.is_read ? 'bg-blue-50/30' : ''}`}
                    >
                      <div className="mt-0.5 shrink-0">{TYPE_ICONS[n.type]}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <p className={`text-sm font-semibold leading-tight ${!n.is_read ? 'text-gray-900' : 'text-gray-600'}`}>
                            {n.title}
                          </p>
                          {!n.is_read && (
                            <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1" />
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mt-0.5">{n.message}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {format(new Date(n.created_at), 'dd MMM yyyy, HH:mm')}
                          {n.project_id && (
                            <span className="ml-2 text-blue-500">· click to view project</span>
                          )}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
