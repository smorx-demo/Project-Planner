import apiClient from './client'
import type { Project, CreateProjectPayload, ProjectStatusResult, PersonConflicts } from '../types'

export interface ProjectMember {
  user_id: string
  name: string
  email: string
  role: string
  is_active: boolean
  added_at: string
}

export const projectsApi = {
  list: () =>
    apiClient.get<Project[]>('/projects/').then((r) => r.data),

  get: (id: string) =>
    apiClient.get<Project>(`/projects/${id}`).then((r) => r.data),

  getStatus: (id: string) =>
    apiClient.get<ProjectStatusResult>(`/projects/${id}/status`).then((r) => r.data),

  create: (payload: CreateProjectPayload) =>
    apiClient.post<Project>('/projects/', payload).then((r) => r.data),

  update: (id: string, payload: Partial<CreateProjectPayload>) =>
    apiClient.patch<Project>(`/projects/${id}`, payload).then((r) => r.data),

  delete: (id: string) =>
    apiClient.delete(`/projects/${id}`).then((r) => r.data),

  exportExcel: (id: string) =>
    apiClient.get(`/projects/${id}/export/excel`, { responseType: 'blob' }).then((r) => r.data),

  getConflicts: (id: string) =>
    apiClient.get<PersonConflicts[]>(`/projects/${id}/conflicts`).then((r) => r.data),

  importExcel: (file: File, projectName?: string) => {
    const form = new FormData()
    form.append('file', file)
    if (projectName) form.append('project_name', projectName)
    return apiClient
      .post<{ project: { id: string; name: string }; activities_imported: number }>(
        '/projects/import',
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      )
      .then((r) => r.data)
  },

  getMembers: (id: string) =>
    apiClient.get<ProjectMember[]>(`/projects/${id}/members`).then((r) => r.data),

  addMember: (id: string, user_id: string) =>
    apiClient.post(`/projects/${id}/members`, { user_id }).then((r) => r.data),

  removeMember: (id: string, user_id: string) =>
    apiClient.delete(`/projects/${id}/members/${user_id}`).then((r) => r.data),
}
