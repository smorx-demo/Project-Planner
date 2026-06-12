import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Download, RefreshCw, Users, Plus, TrendingUp, ChevronDown, ChevronUp, Palette, BarChart3, Sparkles } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { projectsApi } from '../api/projects'
import { activitiesApi } from '../api/activities'
import { personsApi } from '../api/persons'
import { evmApi } from '../api/evm'
import { wbsApi } from '../api/wbs'
import { useAuthStore } from '../store/authStore'
import { Button } from '../components/UI/Button'
import { TableSkeleton } from '../components/UI/Skeleton'
import { GanttChart } from '../components/GanttChart/GanttChart'
import { EditActivityModal } from '../components/GanttChart/EditActivityModal'
import { AddActivityModal } from '../components/GanttChart/AddActivityModal'
import { AddChildActivityModal } from '../components/WBS/AddChildActivityModal'
import { WBSColorSettings } from '../components/WBS/WBSColorSettings'
import { ConflictPanel } from '../components/Resources/ConflictPanel'
import { AIPredictionCard } from '../components/AI/AIPredictionCard'
import { EVMCards } from '../components/EVM/EVMCards'
import { SCurveChart } from '../components/EVM/SCurveChart'
import { PMSTable } from '../components/EVM/PMSTable'
import { ProjectHealthGauge } from '../components/Charts/ProjectHealthGauge'
import { AIInsightsPanel } from '../components/AI/AIInsightsPanel'
import type { ActivityWithStatus, Person, WBSColor } from '../types'

export function ProjectPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const navigate           = useNavigate()
  const queryClient        = useQueryClient()

  const [editingActivity, setEditingActivity] = useState<ActivityWithStatus | null>(null)
  const [showAddActivity, setShowAddActivity] = useState(false)
  const [addChildParent, setAddChildParent] = useState<ActivityWithStatus | null>(null)
  const [showWBSColors, setShowWBSColors] = useState(false)
  const [showEVM, setShowEVM] = useState(false)
  const [showAIInsights, setShowAIInsights] = useState(false)
  const user = useAuthStore((s) => s.user)
  const canEdit = user?.role === 'ADMIN' || user?.role === 'MANAGER' || user?.role === 'OPERATOR'

  // ── Data fetching ────────────────────────────────────────────────────────
  const { data: project, isLoading: projLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn:  () => projectsApi.get(projectId!),
    enabled:  !!projectId,
  })

  const { data: activities = [], isLoading: actLoading, refetch: refetchActivities } = useQuery({
    queryKey: ['activities', projectId],
    queryFn:  () => activitiesApi.listByProject(projectId!),
    enabled:  !!projectId,
  })

  const { data: persons = [] } = useQuery({
    queryKey: ['persons'],
    queryFn:  () => personsApi.list(),
    staleTime: 5 * 60_000,
  })

  const { data: projectEVM, isLoading: evmLoading } = useQuery({
    queryKey: ['projectEVM', projectId],
    queryFn:  () => evmApi.getProjectEVM(projectId!),
    enabled:  !!projectId && showEVM,
    staleTime: 60_000,
  })

  const { data: pmsRows = [] } = useQuery({
    queryKey: ['pms', projectId],
    queryFn:  () => evmApi.getPMS(projectId!),
    enabled:  !!projectId && showEVM,
    staleTime: 60_000,
  })

  const { data: wbsColorsList = [] } = useQuery({
    queryKey: ['wbs-colors', projectId],
    queryFn:  () => wbsApi.getColors(projectId!),
    enabled:  !!projectId,
    staleTime: 5 * 60_000,
  })

  const wbsColors = useMemo(() => {
    const m: Record<number, WBSColor> = {}
    wbsColorsList.forEach((c) => { m[c.level] = c })
    return m
  }, [wbsColorsList])

  // ── When editing activity changes in the list, sync to modal ────────────
  useEffect(() => {
    if (editingActivity) {
      const fresh = activities.find((a) => a.id === editingActivity.id)
      if (fresh) setEditingActivity(fresh)
    }
  }, [activities])

  // ── Handlers ─────────────────────────────────────────────────────────────
  const personsMap = useCallback(() => {
    const m: Record<string, Person> = {}
    persons.forEach((p) => { m[p.id] = p })
    return m
  }, [persons])

  const handleEditActivity = useCallback((a: ActivityWithStatus) => {
    setEditingActivity(a)
  }, [])

  const handleSaved = useCallback((updated: ActivityWithStatus) => {
    queryClient.setQueryData<ActivityWithStatus[]>(
      ['activities', projectId],
      (old = []) => old.map((a) => (a.id === updated.id ? updated : a))
    )
    setEditingActivity(null)
  }, [projectId, queryClient])

  const handleAssignmentChange = useCallback(() => {
    refetchActivities()
  }, [refetchActivities])

  const handleExport = async () => {
    try {
      const blob = await projectsApi.exportExcel(projectId!)
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = `project_${projectId}.xlsx`; a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error('Export failed') }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (projLoading) return <div className="p-6"><TableSkeleton rows={8} cols={6} /></div>
  if (!project)   return (
    <div className="p-6 text-center text-gray-500">
      Project not found.{' '}
      <button onClick={() => navigate(-1)} className="text-blue-600 hover:underline">Go back</button>
    </div>
  )

  const STATUS_STYLE: Record<string, string> = {
    ACTIVE:    'bg-green-100 text-green-800',
    COMPLETED: 'bg-purple-100 text-purple-800',
    ON_HOLD:   'bg-amber-100 text-amber-800',
    CANCELLED: 'bg-red-100 text-red-800',
  }

  return (
    <div className="p-4 lg:p-6 max-w-full mx-auto">
      {/* Page header */}
      <div className="flex items-start gap-3 mb-5">
        <button onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 mt-0.5 shrink-0">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold text-gray-900 truncate">{project.name}</h1>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[project.status]}`}>
              {project.status.replace('_', ' ')}
            </span>
          </div>
          <div className="flex items-center gap-4 mt-1 text-xs text-gray-500 flex-wrap">
            {project.customer_name && <span>Customer: <strong>{project.customer_name}</strong></span>}
            {project.po_number     && <span>PO: <strong className="font-mono">{project.po_number}</strong></span>}
            {project.part_number   && <span>Part: <strong className="font-mono">{project.part_number}</strong></span>}
          </div>
        </div>
        {/* Health gauge */}
        {activities.length > 0 && (
          <div className="shrink-0 self-center">
            <ProjectHealthGauge activities={activities} />
          </div>
        )}

        <div className="flex gap-2 shrink-0">
          <Button variant="secondary" size="sm" onClick={() => refetchActivities()}>
            <RefreshCw size={13} />
          </Button>
          <button
            onClick={() => setShowAIInsights(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium
              text-purple-700 bg-purple-50 border border-purple-200 rounded-lg
              hover:bg-purple-100 transition-colors"
          >
            <Sparkles size={13} /> AI Insights
          </button>
          <Link
            to={`/projects/${projectId}/histogram`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium
              text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <BarChart3 size={13} /> Histogram
          </Link>
          <Link
            to={`/resources?project_id=${projectId}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium
              text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Users size={13} /> Resources
          </Link>
          <Button variant="secondary" size="sm" onClick={handleExport}>
            <Download size={13} /> Export
          </Button>
          {canEdit && (
            <Button
              variant="secondary" size="sm"
              onClick={() => setShowWBSColors(true)}
              title="WBS Level Colors"
            >
              <Palette size={13} />
            </Button>
          )}
          {canEdit && (
            <Button size="sm" onClick={() => setShowAddActivity(true)}>
              <Plus size={13} /> Add Activity
            </Button>
          )}
        </div>
      </div>

      {/* AI health card */}
      <AIPredictionCard projectId={projectId!} />

      {/* Conflict panel */}
      <ConflictPanel
        projectId={projectId!}
        onResolve={(act) => {
          const found = activities.find((a) => a.id === act.id)
          if (found) handleEditActivity(found)
        }}
      />

      {/* Gantt */}
      {actLoading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <TableSkeleton rows={6} cols={10} />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <GanttChart
            activities={activities}
            personsMap={personsMap()}
            projectName={project.name}
            poNumber={project.po_number}
            partNumber={project.part_number}
            customerName={project.customer_name}
            wbsColors={wbsColors}
            onEditActivity={handleEditActivity}
            onAddChild={canEdit ? (parent) => setAddChildParent(parent) : undefined}
          />
        </div>
      )}

      {/* EVM section */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
          onClick={() => setShowEVM((v) => !v)}
        >
          <div className="flex items-center gap-2">
            <TrendingUp size={15} className="text-indigo-500" />
            <span className="text-sm font-semibold text-gray-800">Earned Value Management</span>
            {projectEVM && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                (projectEVM.spi ?? 1) >= 1 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
                SPI {projectEVM.spi?.toFixed(2) ?? '—'}
              </span>
            )}
          </div>
          {showEVM ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
        </button>

        {showEVM && (
          <div className="px-5 pb-5 space-y-6 border-t border-gray-100">
            {evmLoading ? (
              <div className="pt-4"><TableSkeleton rows={3} cols={6} /></div>
            ) : projectEVM ? (
              <>
                <div className="pt-4">
                  <EVMCards evm={projectEVM} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">S-Curve (Planned vs Actual)</h3>
                  <SCurveChart data={projectEVM.s_curve} totalBac={projectEVM.total_bac} />
                </div>
                <PMSTable projectId={projectId!} rows={pmsRows} />
              </>
            ) : (
              <p className="text-sm text-gray-400 pt-4 text-center">
                Could not load EVM data. Add BAC values to activities to get started.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editingActivity && (
        <EditActivityModal
          activity={editingActivity}
          persons={persons}
          projectId={projectId!}
          onClose={() => setEditingActivity(null)}
          onSaved={handleSaved}
          onAssignmentChange={handleAssignmentChange}
        />
      )}

      {/* Add activity modal */}
      {showAddActivity && (
        <AddActivityModal
          projectId={projectId!}
          nextSequence={activities.length + 1}
          onClose={() => setShowAddActivity(false)}
          onCreated={(newActivity) => {
            queryClient.setQueryData<ActivityWithStatus[]>(
              ['activities', projectId],
              (old = []) => [...old, newActivity]
            )
          }}
        />
      )}

      {/* WBS Color Settings modal */}
      {showWBSColors && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowWBSColors(false)} />
          <div className="relative w-full max-w-lg">
            <WBSColorSettings projectId={projectId!} />
            <div className="flex justify-end mt-3">
              <button
                onClick={() => setShowWBSColors(false)}
                className="px-4 py-2 text-sm font-medium text-white bg-gray-800 rounded-lg hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add child activity modal */}
      {addChildParent && (
        <AddChildActivityModal
          parent={addChildParent}
          projectId={projectId!}
          onClose={() => setAddChildParent(null)}
          onCreated={(newActivity) => {
            queryClient.invalidateQueries({ queryKey: ['activities', projectId] })
          }}
        />
      )}

      {/* AI Insights slide-over panel */}
      {showAIInsights && (
        <AIInsightsPanel
          projectId={projectId!}
          projectName={project.name}
          onClose={() => setShowAIInsights(false)}
        />
      )}
    </div>
  )
}
