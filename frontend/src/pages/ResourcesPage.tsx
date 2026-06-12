import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, AlertTriangle, Users, UserPlus, Pencil, UserX, UserCheck } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { personsApi } from '../api/persons'
import { projectsApi } from '../api/projects'
import { TableSkeleton } from '../components/UI/Skeleton'
import { PersonDetailDrawer } from '../components/Resources/PersonDetailDrawer'
import { AddPersonModal } from '../components/Resources/AddPersonModal'
import { EditPersonModal } from '../components/Resources/EditPersonModal'
import { useAuthStore } from '../store/authStore'
import type { Person, PersonConflicts } from '../types'

// ── Avatar helpers ─────────────────────────────────────────────────────────
const AVATAR_COLORS = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#ec4899','#14b8a6','#f97316']
function nameColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) { h = ((h << 5) - h) + name.charCodeAt(i); h |= 0 }
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}
function initials(name: string) {
  const p = name.trim().split(/\s+/)
  return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase()
}

// ── PersonCard ─────────────────────────────────────────────────────────────
interface PersonCardProps {
  person: Person
  taskCount: number
  hasConflict: boolean
  canManage: boolean
  onClick: () => void
  onEdit: () => void
  onToggleActive: () => void
}

function PersonCard({ person, taskCount, hasConflict, canManage, onClick, onEdit, onToggleActive }: PersonCardProps) {
  const color = nameColor(person.name)
  const utilPct = Math.min(100, Math.round((taskCount / (person.max_concurrent_tasks || 3)) * 100))

  return (
    <div className="relative border border-gray-100 rounded-xl p-4 hover:border-blue-200
      hover:shadow-sm transition-all bg-white group">

      {/* Management actions */}
      {canManage && (
        <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit() }}
            className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600"
            title="Edit"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onToggleActive() }}
            className={`p-1.5 rounded-lg ${
              person.is_active
                ? 'hover:bg-red-50 text-gray-400 hover:text-red-500'
                : 'hover:bg-green-50 text-gray-400 hover:text-green-600'
            }`}
            title={person.is_active ? 'Deactivate' : 'Activate'}
          >
            {person.is_active ? <UserX size={13} /> : <UserCheck size={13} />}
          </button>
        </div>
      )}

      <button onClick={onClick} className="w-full text-left">
        <div className="flex items-start gap-3">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
            style={{ backgroundColor: color }}
          >
            {initials(person.name)}
          </div>

          <div className="flex-1 min-w-0 pr-10">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium text-gray-900 truncate">{person.name}</p>
              {hasConflict && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700
                  text-[10px] font-medium rounded-full">
                  <AlertTriangle size={9} /> Conflict
                </span>
              )}
              {!person.is_active && (
                <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[10px] font-medium rounded-full">
                  Inactive
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 truncate mt-0.5">{person.role}</p>
            <span className="inline-block mt-1 px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] rounded-full">
              {person.department}
            </span>
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1">
            <span>{taskCount} active task{taskCount !== 1 ? 's' : ''}</span>
            <span>{utilPct}% utilised</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                utilPct >= 100 ? 'bg-red-500' : utilPct >= 75 ? 'bg-amber-400' : 'bg-green-500'
              }`}
              style={{ width: `${utilPct}%` }}
            />
          </div>
        </div>
      </button>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────
export function ResourcesPage() {
  const [searchParams] = useSearchParams()
  const projectId = searchParams.get('project_id') ?? undefined
  const { user } = useAuthStore()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [conflictOnly, setConflictOnly] = useState(false)
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editPerson, setEditPerson] = useState<Person | null>(null)

  const canManage = user?.role === 'ADMIN' || user?.role === 'MANAGER'

  const { data: persons = [], isLoading } = useQuery({
    queryKey: ['persons', false],
    queryFn: () => personsApi.list(false),
  })

  const toggleActiveMut = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      personsApi.update(id, { is_active }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['persons'] })
      toast.success(vars.is_active ? 'Person activated' : 'Person deactivated')
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update'),
  })

  const { data: conflicts = [] } = useQuery<PersonConflicts[]>({
    queryKey: ['project-conflicts', projectId],
    queryFn: () => projectsApi.getConflicts(projectId!),
    enabled: !!projectId,
  })

  // Build conflict set for fast lookup
  const conflictPersonIds = useMemo(
    () => new Set(conflicts.map((c) => c.person_id)),
    [conflicts]
  )

  // Departments for filter dropdown
  const departments = useMemo(
    () => Array.from(new Set(persons.map((p) => p.department))).sort(),
    [persons]
  )

  // Task count per person from project conflicts data (assignments in project status)
  // For simplicity, count conflicts as proxy; real count would need workload fetch
  const activeCounts = useMemo(() => {
    const m: Record<string, number> = {}
    conflicts.forEach((pc) => {
      // count = number of conflicting activities (approximate)
      m[pc.person_id] = pc.conflicts.length
    })
    return m
  }, [conflicts])

  const filtered = useMemo(() => {
    let list = persons.filter((p) => p.is_active)
    if (deptFilter) list = list.filter((p) => p.department === deptFilter)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.role.toLowerCase().includes(q) ||
          p.employee_id.toLowerCase().includes(q)
      )
    }
    if (conflictOnly) list = list.filter((p) => conflictPersonIds.has(p.id))
    return list
  }, [persons, deptFilter, search, conflictOnly, conflictPersonIds])

  const totalConflicts = conflicts.reduce((s, c) => s + c.conflicts.length, 0)

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Resource Management</h1>
        <p className="text-sm text-gray-500 mt-1">
          {projectId ? 'Project-specific resource view' : 'All active team members'}
        </p>
      </div>

      {/* Conflict banner */}
      {totalConflicts > 0 && (
        <div className="flex items-center gap-3 mb-5 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertTriangle size={16} className="text-amber-500 shrink-0" />
          <span className="text-sm text-amber-800 font-medium flex-1">
            {totalConflicts} resource conflict{totalConflicts > 1 ? 's' : ''} detected in this project
          </span>
          <button
            onClick={() => setConflictOnly((v) => !v)}
            className="text-xs text-amber-700 font-semibold hover:underline"
          >
            {conflictOnly ? 'Show all' : 'View conflicts'}
          </button>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, role, ID…"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm
              focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700
            focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>

        {projectId && (
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={conflictOnly}
              onChange={(e) => setConflictOnly(e.target.checked)}
              className="rounded accent-amber-500"
            />
            Show conflicts only
          </label>
        )}

        {canManage && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium
              rounded-lg hover:bg-blue-700 transition-colors"
          >
            <UserPlus size={15} />
            Add Person
          </button>
        )}
      </div>

      {/* Person grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="border border-gray-100 rounded-xl p-4 bg-white">
              <TableSkeleton rows={3} cols={2} />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center text-gray-400">
          <Users size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No persons found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((p: Person) => (
            <PersonCard
              key={p.id}
              person={p}
              taskCount={activeCounts[p.id] ?? 0}
              hasConflict={conflictPersonIds.has(p.id)}
              canManage={canManage}
              onClick={() => setSelectedPersonId(p.id)}
              onEdit={() => setEditPerson(p)}
              onToggleActive={() =>
                toggleActiveMut.mutate({ id: p.id, is_active: !p.is_active })
              }
            />
          ))}
        </div>
      )}

      {/* Drawer */}
      <PersonDetailDrawer
        personId={selectedPersonId}
        projectId={projectId}
        onClose={() => setSelectedPersonId(null)}
      />

      {showAddModal && <AddPersonModal onClose={() => setShowAddModal(false)} />}
      {editPerson && <EditPersonModal person={editPerson} onClose={() => setEditPerson(null)} />}
    </div>
  )
}
