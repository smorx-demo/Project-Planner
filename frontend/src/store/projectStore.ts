import { create } from 'zustand'
import { activitiesApi } from '../api/activities'
import { projectsApi } from '../api/projects'
import { personsApi } from '../api/persons'
import { assignmentsApi } from '../api/assignments'
import { wbsApi } from '../api/wbs'
import type {
  Project,
  ActivityWithStatus,
  Person,
  AssignmentRole,
  ActivityStatusOverride,
  WBSColor,
} from '../types'

// Date mapping: col 0 = March 25, 2026, each col = 1 day
const EPOCH = new Date(2026, 2, 25)
export const DAYS_PER_COL = 1

export function colToDate(col: number): Date {
  const d = new Date(EPOCH)
  d.setDate(d.getDate() + col)
  return d
}

// Calculated fresh each session so it's always accurate
const _todayDate = new Date()
_todayDate.setHours(0, 0, 0, 0)
export const TODAY_COL = Math.round((_todayDate.getTime() - EPOCH.getTime()) / (24 * 60 * 60 * 1000))

export function computeStatus(a: ActivityWithStatus | { status_override: ActivityStatusOverride | null; actual_start_col: number | null; actual_end_col: number | null; plan_start_col: number; plan_end_col: number }): ActivityStatusOverride {
  // 1. Manual override always wins
  if (a.status_override) return a.status_override

  // 2. Actual end set — done on time or late
  if (a.actual_end_col != null) {
    return a.actual_end_col > a.plan_end_col ? 'DELAYED' : 'DONE'
  }

  const midpoint = (a.plan_start_col + a.plan_end_col) / 2

  // 3. Not started yet
  if (a.actual_start_col == null) {
    if (TODAY_COL > a.plan_end_col) return 'DELAYED'
    if (TODAY_COL > midpoint)       return 'SLOW'
    return 'PENDING'
  }

  // 4. In progress
  if (TODAY_COL > a.plan_end_col || a.actual_start_col > a.plan_end_col) return 'DELAYED'
  if (TODAY_COL > midpoint || a.actual_start_col > midpoint)              return 'SLOW'
  return 'ON_TRACK'
}

interface ProjectState {
  currentProject: Project | null
  activities: ActivityWithStatus[]
  persons: Person[]
  isLoadingProject: boolean
  isLoadingPersons: boolean
  wbsColors: Record<number, WBSColor>

  fetchProject: (id: string) => Promise<void>
  fetchPersons: () => Promise<void>
  fetchWBSColors: (projectId: string) => Promise<void>
  updateActivityLocal: (id: string, data: Partial<ActivityWithStatus>) => void
  addAssignment: (activityId: string, personId: string, role: AssignmentRole) => Promise<void>
  removeAssignment: (assignmentId: string, activityId: string) => Promise<void>

  // Derived
  personsMap: () => Record<string, Person>
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  currentProject: null,
  activities: [],
  persons: [],
  isLoadingProject: false,
  isLoadingPersons: false,
  wbsColors: {},

  fetchProject: async (id) => {
    set({ isLoadingProject: true })
    try {
      const [project, activities] = await Promise.all([
        projectsApi.get(id),
        activitiesApi.listByProject(id),
      ])
      set({ currentProject: project, activities, isLoadingProject: false })
    } catch {
      set({ isLoadingProject: false })
    }
  },

  fetchPersons: async () => {
    set({ isLoadingPersons: true })
    try {
      const persons = await personsApi.list()
      set({ persons, isLoadingPersons: false })
    } catch {
      set({ isLoadingPersons: false })
    }
  },

  fetchWBSColors: async (projectId) => {
    try {
      const colors = await wbsApi.getColors(projectId)
      const map: Record<number, WBSColor> = {}
      colors.forEach(c => { map[c.level] = c })
      set({ wbsColors: map })
    } catch {
      // non-fatal; GanttChart falls back to default colors
    }
  },

  updateActivityLocal: (id, data) =>
    set((state) => ({
      activities: state.activities.map((a) =>
        a.id === id ? { ...a, ...data, computed_status: computeStatus({ ...a, ...data } as ActivityWithStatus) } : a
      ),
    })),

  addAssignment: async (activityId, personId, role) => {
    const assignment = await assignmentsApi.create({ activity_id: activityId, person_id: personId, role })
    set((state) => ({
      activities: state.activities.map((a) =>
        a.id === activityId
          ? { ...a, assignments: [...a.assignments, assignment] }
          : a
      ),
    }))
  },

  removeAssignment: async (assignmentId, activityId) => {
    await assignmentsApi.delete(assignmentId)
    set((state) => ({
      activities: state.activities.map((a) =>
        a.id === activityId
          ? { ...a, assignments: a.assignments.filter((x) => x.id !== assignmentId) }
          : a
      ),
    }))
  },

  personsMap: () => {
    const map: Record<string, Person> = {}
    for (const p of get().persons) map[p.id] = p
    return map
  },
}))
