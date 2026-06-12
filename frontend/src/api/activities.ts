import apiClient from './client'
import type { ActivityWithStatus, CreateActivityPayload, UpdateActivityPayload } from '../types'

export const activitiesApi = {
  listByProject: (projectId: string) =>
    apiClient.get<ActivityWithStatus[]>(`/activities/project/${projectId}`).then((r) => r.data),

  get: (id: string) =>
    apiClient.get<ActivityWithStatus>(`/activities/${id}`).then((r) => r.data),

  create: (payload: CreateActivityPayload) =>
    apiClient.post<ActivityWithStatus>('/activities/', payload).then((r) => r.data),

  update: (id: string, payload: UpdateActivityPayload) =>
    apiClient.patch<ActivityWithStatus>(`/activities/${id}`, payload).then((r) => r.data),

  delete: (id: string) =>
    apiClient.delete(`/activities/${id}`).then((r) => r.data),
}
