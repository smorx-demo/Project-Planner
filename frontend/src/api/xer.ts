import apiClient from './client'
import type { XERImportResult, XERAuditResult, AuditIssue, AuditCounts } from '../types'

export const xerApi = {
  importXER: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return apiClient.post<XERImportResult>('/projects/xer/import', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60_000,
    }).then(r => r.data)
  },

  exportXER: async (projectId: string): Promise<Blob> => {
    const r = await apiClient.get(`/projects/${projectId}/xer/export`, {
      responseType: 'blob',
      timeout: 30_000,
    })
    return r.data as Blob
  },

  auditXER: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return apiClient.post<XERAuditResult>('/projects/xer/audit', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60_000,
    }).then(r => r.data)
  },

  exportAuditReport: async (
    projectName: string,
    totalTasks:  number,
    issues:      AuditIssue[],
    counts:      AuditCounts,
  ): Promise<Blob> => {
    const r = await apiClient.post(
      '/projects/xer/audit/export',
      { project_name: projectName, total_tasks: totalTasks, issues, counts },
      { responseType: 'blob', timeout: 30_000 },
    )
    return r.data as Blob
  },
}
