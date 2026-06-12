import apiClient from './client'
import type { Person, PersonWorkload, PreAddConflict } from '../types'

export const personsApi = {
  list: (activeOnly = true) =>
    apiClient
      .get<Person[]>('/persons/', { params: { active_only: activeOnly } })
      .then((r) => r.data),

  available: (colStart?: number, colEnd?: number, projectId?: string) =>
    apiClient
      .get<Person[]>('/persons/available', {
        params: { col_start: colStart, col_end: colEnd, project_id: projectId },
      })
      .then((r) => r.data),

  get: (id: string) =>
    apiClient.get<Person>(`/persons/${id}`).then((r) => r.data),

  getActivities: (id: string) =>
    apiClient.get(`/persons/${id}/activities`).then((r) => r.data),

  getWorkload: (id: string, projectId?: string) =>
    apiClient
      .get<PersonWorkload>(`/persons/${id}/workload`, {
        params: projectId ? { project_id: projectId } : {},
      })
      .then((r) => r.data),

  checkConflict: (personId: string, activityId: string) =>
    apiClient
      .get<PreAddConflict | null>(`/persons/${personId}/check-conflict`, {
        params: { activity_id: activityId },
      })
      .then((r) => r.data),

  addLeave: (id: string, entry: { start_col: number; end_col: number; reason: string }) =>
    apiClient.post<Person>(`/persons/${id}/leave`, entry).then((r) => r.data),

  deleteLeave: (id: string, index: number) =>
    apiClient.delete<Person>(`/persons/${id}/leave/${index}`).then((r) => r.data),

  create: (payload: Omit<Person, 'id' | 'created_at' | 'updated_at'>) =>
    apiClient.post<Person>('/persons/', payload).then((r) => r.data),

  update: (id: string, payload: Partial<Person>) =>
    apiClient.patch<Person>(`/persons/${id}`, payload).then((r) => r.data),

  delete: (id: string) =>
    apiClient.delete(`/persons/${id}`).then((r) => r.data),
}
