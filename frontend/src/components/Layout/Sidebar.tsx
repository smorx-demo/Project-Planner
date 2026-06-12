import { NavLink, useMatch, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FolderKanban, Users, BarChart2,
  Bell, Settings, LogOut, ChevronLeft, ChevronRight, UserCog,
  TrendingUp, GitBranch, FileCode, BarChart3, Sparkles,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useNotifications } from '../../context/NotificationContext'

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { to: '/dashboard',   label: 'Dashboard',   icon: LayoutDashboard, adminOnly: false },
      { to: '/ai-insights', label: 'AI Insights', icon: Sparkles,        adminOnly: false },
    ],
  },
  {
    label: 'Work',
    items: [
      { to: '/projects',      label: 'Projects',     icon: FolderKanban, adminOnly: false },
      { to: '/resources',     label: 'Resources',    icon: Users,        adminOnly: false },
      { to: '/performance',   label: 'Performance',  icon: BarChart2,    adminOnly: false },
    ],
  },
  {
    label: 'Tools',
    items: [
      { to: '/notifications', label: 'Notifications', icon: Bell,     adminOnly: false },
      { to: '/xer',           label: 'XER / P6',      icon: FileCode, adminOnly: false },
    ],
  },
  {
    label: 'Admin',
    items: [
      { to: '/settings', label: 'Settings', icon: Settings, adminOnly: false },
      { to: '/users',    label: 'Users',    icon: UserCog,  adminOnly: true  },
    ],
  },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

const subNavCls = (isActive: boolean, collapsed: boolean) =>
  `flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors
   ${collapsed ? 'justify-center' : ''}
   ${isActive
    ? 'bg-blue-500/30 text-white'
    : 'text-blue-200 hover:bg-white/10 hover:text-white'
  }`

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { user, logout } = useAuthStore()
  const { unreadCount } = useNotifications()
  const location = useLocation()

  // Detect project context from any project sub-route
  const projectMainMatch = useMatch('/projects/:id')
  const projectEvmMatch  = useMatch('/projects/:projectId/evm')
  const projectId = projectMainMatch?.params?.id ?? projectEvmMatch?.params?.projectId

  return (
    <aside
      className="relative flex flex-col h-full shrink-0 bg-[#1a3354] dark:bg-gray-950 dark:border-r dark:border-gray-800 text-white transition-all duration-200"
      style={{ width: collapsed ? 64 : 240 }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10 overflow-hidden">
        <div className="w-9 h-9 rounded-xl bg-blue-500 flex items-center justify-center font-bold text-sm shrink-0">
          IE
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="font-bold text-sm leading-tight truncate">Ingenious</p>
            <p className="text-xs text-blue-200 truncate">Engineering</p>
          </div>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-16 w-6 h-6 rounded-full bg-white border border-gray-200
          flex items-center justify-center text-gray-600 hover:bg-gray-50 shadow-sm z-10"
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-4 overflow-y-auto overflow-x-hidden">
        {NAV_GROUPS.map(({ label: groupLabel, items }) => {
          const visible = items.filter(({ adminOnly }) => !adminOnly || user?.role === 'ADMIN')
          if (visible.length === 0) return null
          return (
            <div key={groupLabel}>
              {!collapsed && (
                <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-blue-400/60 select-none">
                  {groupLabel}
                </p>
              )}
              <div className="space-y-0.5">
                {visible.map(({ to, label, icon: Icon }) => {
                  const href = to === '/resources' && projectId ? `/resources?project_id=${projectId}` : to
                  const badge = to === '/notifications' && unreadCount > 0 ? unreadCount : 0
                  const isAI = to === '/ai-insights'
                  return (
                    <NavLink
                      key={to}
                      to={href}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
                         ${collapsed ? 'justify-center' : ''}
                         ${isActive
                          ? isAI
                            ? 'bg-violet-600 text-white shadow-md shadow-violet-900/50'
                            : 'bg-white/15 text-white'
                          : isAI
                            ? 'text-violet-300 hover:bg-violet-500/20 hover:text-white'
                            : 'text-blue-100/80 hover:bg-white/10 hover:text-white'
                        }`
                      }
                      title={collapsed ? label : undefined}
                    >
                      <div className="relative shrink-0">
                        <Icon size={17} />
                        {badge > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] bg-red-500 text-white
                            text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                            {badge > 9 ? '9+' : badge}
                          </span>
                        )}
                      </div>
                      {!collapsed && <span className="truncate flex-1">{label}</span>}
                      {!collapsed && badge > 0 && (
                        <span className="ml-auto min-w-[18px] h-[18px] bg-red-500 text-white text-[10px]
                          font-bold rounded-full flex items-center justify-center px-1">
                          {badge > 99 ? '99+' : badge}
                        </span>
                      )}
                    </NavLink>
                  )
                })}
              </div>
            </div>
          )
        })}

        {/* Project sub-nav (shown when on any project route) */}
        {projectId && (
          <div className={`mt-2 ${collapsed ? 'space-y-0.5' : 'ml-3 pl-2 border-l border-white/20 space-y-0.5'}`}>
            {!collapsed && (
              <p className="text-[10px] uppercase text-blue-300/60 font-semibold tracking-wider px-2 pb-1">
                This Project
              </p>
            )}

            <NavLink
              to={`/projects/${projectId}`}
              end
              title={collapsed ? 'Gantt' : undefined}
              className={({ isActive }) => subNavCls(isActive, collapsed)}
            >
              <GitBranch size={collapsed ? 18 : 14} className="shrink-0" />
              {!collapsed && <span>Gantt</span>}
            </NavLink>

            <NavLink
              to={`/resources?project_id=${projectId}`}
              title={collapsed ? 'Resources' : undefined}
              className={() => {
                const isActive = location.pathname === '/resources' &&
                  location.search.includes(projectId)
                return subNavCls(isActive, collapsed)
              }}
            >
              <Users size={collapsed ? 18 : 14} className="shrink-0" />
              {!collapsed && <span>Resources</span>}
            </NavLink>

            <NavLink
              to={`/projects/${projectId}/evm`}
              title={collapsed ? 'EVM' : undefined}
              className={({ isActive }) => subNavCls(isActive, collapsed)}
            >
              <TrendingUp size={collapsed ? 18 : 14} className="shrink-0" />
              {!collapsed && <span>EVM</span>}
            </NavLink>

            <NavLink
              to={`/projects/${projectId}/histogram`}
              title={collapsed ? 'Histogram' : undefined}
              className={({ isActive }) => subNavCls(isActive, collapsed)}
            >
              <BarChart3 size={collapsed ? 18 : 14} className="shrink-0" />
              {!collapsed && <span>Histogram</span>}
            </NavLink>
          </div>
        )}
      </nav>

      {/* User / logout */}
      <div className="px-2 py-4 border-t border-white/10 overflow-hidden">
        {!collapsed ? (
          <div className="flex items-center gap-3 px-3 py-2 mb-1">
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-sm font-bold shrink-0">
              {user?.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-xs text-blue-300 truncate">{user?.role}</p>
            </div>
          </div>
        ) : (
          <div className="flex justify-center mb-1">
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-sm font-bold">
              {user?.name.charAt(0)}
            </div>
          </div>
        )}
        <button
          onClick={logout}
          title={collapsed ? 'Sign Out' : undefined}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-blue-100
            hover:bg-white/10 hover:text-white transition-colors"
        >
          <LogOut size={18} className="shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  )
}
