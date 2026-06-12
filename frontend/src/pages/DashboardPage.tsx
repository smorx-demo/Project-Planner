import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import {
  FolderKanban, Plus, Clock, AlertTriangle, Users2, MoreVertical, Pencil, Trash2, TrendingUp, Sparkles, ArrowRight,
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import { projectsApi } from '../api/projects'
import { evmApi } from '../api/evm'
import { useAuthStore } from '../store/authStore'
import { TableSkeleton } from '../components/UI/Skeleton'
import { ImportExcelButton } from '../components/ImportExcel/ImportExcelButton'
import { CreateProjectModal } from '../components/Projects/CreateProjectModal'
import { EditProjectModal } from '../components/Projects/EditProjectModal'
import { ActivityStatusChart } from '../components/Charts/ActivityStatusChart'
import { CostBreakdownChart } from '../components/Charts/CostBreakdownChart'
import type { Project, ProjectStatus, ProjectStatusResult } from '../types'

const STATUS_STYLE: Record<ProjectStatus, string> = {
  ACTIVE:    'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  COMPLETED: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  ON_HOLD:   'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  CANCELLED: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[status]}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

function StatCard({ label, value, icon: Icon, color, textColor }: {
  label: string; value: number | string; icon: React.ElementType; color: string; textColor: string
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl p-5
      border border-gray-200 dark:border-gray-800
      shadow-sm hover:shadow-md dark:hover:shadow-black/20
      flex items-center justify-between transition-all duration-150">
      <div>
        <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">{label}</p>
        <p className="text-3xl font-bold text-gray-900 dark:text-gray-50 leading-none">{value}</p>
      </div>
      <div className={`w-12 h-12 rounded-2xl ${color} flex items-center justify-center shrink-0`}>
        <Icon size={22} className={textColor} />
      </div>
    </div>
  )
}

function MiniProgress({ pct, counts }: { pct: number; counts: { DELAYED: number; SLOW: number; DONE: number } }) {
  const health = counts.DELAYED > 0 ? 'red' : counts.SLOW > 0 ? 'amber' : 'green'
  const barColor = health === 'red' ? 'bg-red-500' : health === 'amber' ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Progress</span>
        <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {counts.DONE    > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md
            bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 font-medium">
            ✓ {counts.DONE} done
          </span>
        )}
        {counts.SLOW    > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md
            bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-medium">
            ⚠ {counts.SLOW} slow
          </span>
        )}
        {counts.DELAYED > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md
            bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400 font-medium">
            ✕ {counts.DELAYED} delayed
          </span>
        )}
      </div>
    </div>
  )
}

// ── Project card kebab menu ────────────────────────────────────────────────

function ProjectCardMenu({
  project,
  onEdit,
  onDelete,
}: {
  project: Project
  onEdit: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
      >
        <MoreVertical size={15} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-36 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-10">
          <button
            onClick={() => { setOpen(false); onEdit() }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Pencil size={13} /> Edit
          </button>
          <button
            onClick={() => { setOpen(false); onDelete() }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            <Trash2 size={13} /> Delete
          </button>
        </div>
      )}
    </div>
  )
}

// ── Delete confirmation ────────────────────────────────────────────────────

function DeleteConfirmModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const deleteMut = useMutation({
    mutationFn: () => projectsApi.delete(project.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast.success('Project deleted')
      onClose()
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to delete project'),
  })

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-50 mx-auto mb-4">
            <Trash2 size={20} className="text-red-500" />
          </div>
          <h2 className="text-base font-semibold text-gray-900 text-center mb-1">Delete Project?</h2>
          <p className="text-sm text-gray-500 text-center mb-6">
            <strong>{project.name}</strong> and all its activities will be permanently deleted.
            This cannot be undone.
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => deleteMut.mutate()}
              disabled={deleteMut.isPending}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {deleteMut.isPending ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────

export function DashboardPage() {
  const user    = useAuthStore((s) => s.user)
  const canEdit = user?.role === 'ADMIN' || user?.role === 'MANAGER'

  const [showCreate, setShowCreate]       = useState(false)
  const [editProject, setEditProject]     = useState<Project | null>(null)
  const [deleteProject, setDeleteProject] = useState<Project | null>(null)

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list(),
  })

  const statusQueries = useQueries({
    queries: projects.map((p) => ({
      queryKey: ['project-status', p.id],
      queryFn: () => projectsApi.getStatus(p.id),
      staleTime: 60_000,
    })),
  })

  const evmQueries = useQueries({
    queries: projects.map((p) => ({
      queryKey: ['projectEVM', p.id],
      queryFn: () => evmApi.getProjectEVM(p.id),
      staleTime: 5 * 60_000,
      retry: false,
    })),
  })

  const statusMap: Record<string, ProjectStatusResult> = {}
  statusQueries.forEach((q, i) => {
    if (q.data && projects[i]) statusMap[projects[i].id] = q.data
  })

  const evmMap: Record<string, { spi: number | null; cpi: number | null }> = {}
  evmQueries.forEach((q, i) => {
    if (q.data && projects[i]) {
      evmMap[projects[i].id] = { spi: q.data.spi, cpi: q.data.cpi }
    }
  })

  const totalActivities = Object.values(statusMap).reduce((s, r) => s + r.summary.total, 0)
  const delayedCount    = Object.values(statusMap).reduce((s, r) => s + r.summary.counts.DELAYED, 0)
  const onTrackCount    = Object.values(statusMap).reduce((s, r) => s + r.summary.counts.ON_TRACK, 0)
  const slowCount       = Object.values(statusMap).reduce((s, r) => s + r.summary.counts.SLOW, 0)
  const doneCount       = Object.values(statusMap).reduce((s, r) => s + r.summary.counts.DONE, 0)
  const pendingCount    = Object.values(statusMap).reduce((s, r) => s + r.summary.counts.PENDING, 0)
  const assignedPeople  = new Set(
    projects.flatMap((p) => (statusMap[p.id]?.activities ?? []).flatMap((a) => a.assignments.map((x) => x.person_id)))
  ).size

  // Cost breakdown per group_type
  const costByGroup: Record<string, { pv: number; ev: number }> = {}
  Object.values(statusMap).forEach(sr => {
    sr.activities.forEach(a => {
      if (a.bac == null) return
      const group = a.group_type || 'Other'
      if (!costByGroup[group]) costByGroup[group] = { pv: 0, ev: 0 }
      costByGroup[group].pv += a.bac * (a.planned_pct ?? 0) / 100
      costByGroup[group].ev += a.bac * (a.actual_pct  ?? 0) / 100
    })
  })
  const costData = Object.entries(costByGroup).map(([group, vals]) => ({ group, ...vals }))
  const hasBac   = costData.length > 0

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="flex items-start justify-between mb-7">
        <div>
          <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">{today}</p>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50 leading-tight">Welcome back, {user?.name.split(' ')[0]}</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">Ingenious Engineering — Manufacturing Operations</p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2 shrink-0">
            <ImportExcelButton />
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700
                text-white text-sm font-semibold rounded-xl transition-colors
                shadow-sm shadow-blue-500/20"
            >
              <Plus size={15} /> New Project
            </button>
          </div>
        )}
      </div>

      {/* AI Intelligence banner */}
      <Link to="/ai-insights" className="block mb-6 rounded-2xl overflow-hidden group">
        <div className="bg-gradient-to-r from-[#1e1b4b] via-[#312e81] to-[#4c1d95] px-6 py-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
            <Sparkles size={22} className="text-violet-200" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-base leading-tight">AI Project Intelligence</p>
            <p className="text-violet-300 text-sm mt-0.5">
              Delay risks · Recovery plans · Critical path · Resource conflicts · Dispatch forecast
            </p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2
            bg-white/10 group-hover:bg-violet-500 rounded-xl
            text-white text-sm font-medium border border-white/20 shrink-0 transition-all">
            Explore <ArrowRight size={14} />
          </div>
        </div>
      </Link>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
        <StatCard label="Active Projects"  value={projects.filter((p) => p.status === 'ACTIVE').length} icon={FolderKanban} color="bg-blue-50 dark:bg-blue-900/20"    textColor="text-blue-600 dark:text-blue-400" />
        <StatCard label="Total Activities" value={totalActivities} icon={Clock}         color="bg-violet-50 dark:bg-violet-900/20"  textColor="text-violet-600 dark:text-violet-400" />
        <StatCard label="Delayed Tasks"    value={delayedCount}    icon={AlertTriangle} color="bg-red-50 dark:bg-red-900/20"         textColor="text-red-600 dark:text-red-400" />
        <StatCard label="People Assigned"  value={assignedPeople}  icon={Users2}        color="bg-emerald-50 dark:bg-emerald-900/20" textColor="text-emerald-600 dark:text-emerald-400" />
      </div>

      {/* Charts row */}
      {totalActivities > 0 && (
        <div className={`grid grid-cols-1 ${hasBac ? 'lg:grid-cols-2' : ''} gap-4 mb-6`}>
          <ActivityStatusChart
            counts={{ DONE: doneCount, ON_TRACK: onTrackCount, SLOW: slowCount, DELAYED: delayedCount, PENDING: pendingCount }}
            total={totalActivities}
          />
          {hasBac && <CostBreakdownChart data={costData} />}
        </div>
      )}

      {/* Projects section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest">All Projects</p>
          <span className="text-xs text-gray-400 dark:text-gray-600">{projects.length} total</span>
        </div>

        {isLoading ? (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
            <TableSkeleton rows={4} cols={5} />
          </div>
        ) : projects.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
              <FolderKanban size={24} className="text-gray-400 dark:text-gray-600" />
            </div>
            <p className="font-semibold text-gray-700 dark:text-gray-300">No projects yet</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Create your first project to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {projects.map((p: Project) => {
              const stat    = statusMap[p.id]
              const evm     = evmMap[p.id]
              const delayed = stat?.summary.counts.DELAYED ?? 0
              const accentColor = delayed > 0 ? 'bg-red-500' : p.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-gray-400'

              return (
                <div
                  key={p.id}
                  className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm hover:shadow-md dark:hover:shadow-black/30 hover:border-gray-300 dark:hover:border-gray-700 transition-all flex flex-col overflow-hidden"
                >
                  {/* Top accent strip */}
                  <div className={`h-1 ${accentColor}`} />

                  {/* Card body */}
                  <div className="p-5 flex-1 flex flex-col">
                    {/* Header row */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm leading-snug">{p.name}</h3>
                      <div className="flex items-center gap-1 shrink-0">
                        <StatusBadge status={p.status} />
                        {canEdit && (
                          <ProjectCardMenu
                            project={p}
                            onEdit={() => setEditProject(p)}
                            onDelete={() => setDeleteProject(p)}
                          />
                        )}
                      </div>
                    </div>

                    {/* Metadata */}
                    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs mb-1">
                      {p.customer_name && (
                        <>
                          <span className="text-gray-400 dark:text-gray-500 font-medium">Customer</span>
                          <span className="text-gray-700 dark:text-gray-300 font-medium truncate">{p.customer_name}</span>
                        </>
                      )}
                      {p.po_number && (
                        <>
                          <span className="text-gray-400 dark:text-gray-500 font-medium">PO</span>
                          <span className="text-gray-700 dark:text-gray-300 font-mono truncate">{p.po_number}</span>
                        </>
                      )}
                      {p.part_number && (
                        <>
                          <span className="text-gray-400 dark:text-gray-500 font-medium">Part</span>
                          <span className="text-gray-700 dark:text-gray-300 font-mono truncate">{p.part_number}</span>
                        </>
                      )}
                    </div>

                    {/* Progress */}
                    {stat ? (
                      <MiniProgress pct={stat.summary.pct_complete} counts={stat.summary.counts} />
                    ) : (
                      <div className="mt-4 space-y-1.5">
                        <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 animate-pulse" />
                        <div className="h-3 w-1/3 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
                      </div>
                    )}

                    {/* EVM chips */}
                    {evm && (evm.spi != null || evm.cpi != null) && (
                      <div className="flex items-center gap-2 mt-3">
                        <TrendingUp size={11} className="text-gray-400 dark:text-gray-600 shrink-0" />
                        {evm.spi != null && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-md font-semibold ${
                            evm.spi >= 1
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                              : evm.spi >= 0.9
                              ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                              : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          }`}>SPI {evm.spi.toFixed(2)}</span>
                        )}
                        {evm.cpi != null && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-md font-semibold ${
                            evm.cpi >= 1
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                              : evm.cpi >= 0.9
                              ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                              : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          }`}>CPI {evm.cpi.toFixed(2)}</span>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 flex gap-2">
                      <Link
                        to={`/projects/${p.id}`}
                        className="flex-1 inline-flex justify-center items-center gap-1.5 px-3 py-2
                          bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-colors"
                      >
                        Open Gantt
                      </Link>
                      <Link
                        to={`/projects/${p.id}/evm`}
                        className="inline-flex justify-center items-center px-3 py-2
                          border border-gray-200 dark:border-gray-700
                          text-gray-600 dark:text-gray-400
                          hover:bg-gray-50 dark:hover:bg-gray-800
                          text-xs font-medium rounded-xl transition-colors"
                        title="EVM Dashboard"
                      >
                        <TrendingUp size={13} />
                      </Link>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showCreate    && <CreateProjectModal onClose={() => setShowCreate(false)} />}
      {editProject   && <EditProjectModal   project={editProject}   onClose={() => setEditProject(null)} />}
      {deleteProject && <DeleteConfirmModal project={deleteProject} onClose={() => setDeleteProject(null)} />}
    </div>
  )
}
