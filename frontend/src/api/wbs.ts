import apiClient from './client'
import type { WBSColor, ActivityWithStatus, CreateChildActivityPayload } from '../types'

export const wbsApi = {
  getColors: (projectId: string) =>
    apiClient.get<WBSColor[]>(`/projects/${projectId}/wbs/colors`).then(r => r.data),

  setColors: (projectId: string, colors: WBSColor[]) =>
    apiClient.put<WBSColor[]>(`/projects/${projectId}/wbs/colors`, { colors }).then(r => r.data),

  reorder: (projectId: string) =>
    apiClient.patch<{ reordered: number }>(`/projects/${projectId}/wbs/reorder`).then(r => r.data),

  createChild: (parentId: string, payload: CreateChildActivityPayload) =>
    apiClient.post<ActivityWithStatus>(`/activities/${parentId}/children`, payload).then(r => r.data),
}
