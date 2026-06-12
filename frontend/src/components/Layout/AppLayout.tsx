import { useEffect, useState } from 'react'
import { Outlet, useLocation, useMatch } from 'react-router-dom'
import { ChevronDown, LogOut, User, Sun, Moon } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { NotificationBell } from '../Notifications/NotificationBell'
import { AIAssistant } from '../AI/AIAssistant'
import { ErrorBoundary } from '../UI/ErrorBoundary'
import { useAuthStore } from '../../store/authStore'
import { useProjectStore } from '../../store/projectStore'
import { useNotifications } from '../../context/NotificationContext'
import { useThemeStore } from '../../store/themeStore'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':     'Dashboard',
  '/projects':      'Projects',
  '/resources':     'Resources',
  '/performance':   'Performance',
  '/notifications': 'Notifications',
  '/xer':           'XER / P6',
  '/ai-insights':   'AI Insights',
  '/settings':      'Settings',
  '/users':         'User Management',
}

function TopBar() {
  const location        = useLocation()
  const projectMatch    = useMatch('/projects/:id')
  const evmMatch        = useMatch('/projects/:projectId/evm')
  const histogramMatch  = useMatch('/projects/:projectId/histogram')
  const { user, logout } = useAuthStore()
  const currentProject  = useProjectStore((s) => s.currentProject)
  const { unreadCount } = useNotifications()
  const { theme, toggleTheme } = useThemeStore()
  const [open, setOpen] = useState(false)

  const pageName = (projectMatch || evmMatch || histogramMatch) && currentProject
    ? currentProject.name
    : PAGE_TITLES[location.pathname] ?? 'Planner'

  const title = evmMatch
    ? 'Earned Value Management'
    : histogramMatch
      ? 'Resource Histogram'
      : projectMatch
        ? 'Project Details'
        : PAGE_TITLES[location.pathname] ?? 'Planner'

  useEffect(() => {
    const base = `${pageName} — IE Planner`
    document.title = unreadCount > 0 ? `(${unreadCount}) ${base}` : base
  }, [pageName, unreadCount])

  return (
    <header className="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center px-6 gap-3 shrink-0 transition-colors">
      {/* Page title */}
      <div className="flex items-center gap-2.5 min-w-0">
        <h1 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{title}</h1>
        {(projectMatch || evmMatch || histogramMatch) && currentProject && (
          <span className="hidden sm:inline-flex items-center px-2.5 py-1
            bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800
            rounded-lg text-xs font-medium text-blue-700 dark:text-blue-300 truncate max-w-[200px]">
            {currentProject.name}
          </span>
        )}
      </div>

      <div className="flex-1" />

      <NotificationBell />

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className="p-2 rounded-xl text-gray-500 dark:text-gray-400
          hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark'
          ? <Sun size={16} className="text-amber-400" />
          : <Moon size={16} />
        }
      </button>

      {/* User dropdown */}
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-xl transition-colors
            hover:bg-gray-100 dark:hover:bg-gray-800 border border-transparent
            hover:border-gray-200 dark:hover:border-gray-700"
        >
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700
            flex items-center justify-center text-white text-xs font-bold shrink-0 select-none">
            {user?.name.charAt(0).toUpperCase()}
          </div>
          <div className="hidden sm:block text-left min-w-0">
            <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 leading-tight truncate max-w-[120px]">
              {user?.name}
            </p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-tight capitalize">
              {user?.role?.toLowerCase()}
            </p>
          </div>
          <ChevronDown size={13} className="text-gray-400 dark:text-gray-500 shrink-0" />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-full mt-2 w-52 bg-white dark:bg-gray-900
              rounded-2xl shadow-xl dark:shadow-2xl dark:shadow-black/40
              border border-gray-100 dark:border-gray-800 py-1.5 z-20 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 mb-1">
                <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">{user?.name}</p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{user?.email}</p>
              </div>
              <button
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm
                  text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                onClick={() => setOpen(false)}
              >
                <User size={14} className="text-gray-400 dark:text-gray-500" /> My Profile
              </button>
              <div className="border-t border-gray-100 dark:border-gray-800 mt-1 pt-1">
                <button
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm
                    text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  onClick={logout}
                >
                  <LogOut size={14} /> Sign Out
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  )
}

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const projectMatch    = useMatch('/projects/:id')
  const evmMatch        = useMatch('/projects/:projectId/evm')
  const histogramMatch  = useMatch('/projects/:projectId/histogram')
  const currentProject  = useProjectStore((s) => s.currentProject)

  const projectId = projectMatch?.params.id
    ?? evmMatch?.params.projectId
    ?? histogramMatch?.params.projectId
    ?? null

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden transition-colors">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <TopBar />
        <main className="flex-1 overflow-auto">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
      <AIAssistant
        projectId={projectId}
        projectName={(projectMatch || evmMatch || histogramMatch) && currentProject ? currentProject.name : null}
      />
    </div>
  )
}
