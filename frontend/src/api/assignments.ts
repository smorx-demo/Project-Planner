import apiClient from './client'
import type { Assignment, CreateAssignmentPayload, AssignmentRole } from '../types'

export const assignmentsApi = {
  listByActivity: (activityId: string) =>
    apiClient.get<Assignment[]>(`/assignments/activity/${activityId}`).then((r) => r.data),

  create: (payload: CreateAssignmentPayload) =>
    apiClient.post<Assignment>('/assignments/', payload).then((r) => r.data),

  updateRole: (id: string, role: AssignmentRole) =>
    apiClient.patch<Assignment>(`/assignments/${id}`, { role }).then((r) => r.data),

  delete: (id: string) =>
    apiClient.delete(`/assignments/${id}`).then((r) => r.data),
}
