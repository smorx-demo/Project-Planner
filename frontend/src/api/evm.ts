import apiClient from './client'
import type {
  ProjectEVM, ActivityEVM, EVMHistoryPoint, PMSRow, UpdateActivityEVMPayload,
} from '../types'

export const evmApi = {
  getProjectEVM: (projectId: string) =>
    apiClient.get<ProjectEVM>(`/projects/${projectId}/evm`).then((r) => r.data),

  getProjectEVMHistory: (projectId: string, days = 90) =>
    apiClient.get<EVMHistoryPoint[]>(`/projects/${projectId}/evm/history`, { params: { days } }).then((r) => r.data),

  getActivityEVM: (activityId: string) =>
    apiClient.get<ActivityEVM>(`/activities/${activityId}/evm`).then((r) => r.data),

  updateActivityEVM: (activityId: string, payload: UpdateActivityEVMPayload) =>
    apiClient.put<ActivityEVM>(`/activities/${activityId}/evm`, payload).then((r) => r.data),

  getPMS: (projectId: string) =>
    apiClient.get<PMSRow[]>(`/projects/${projectId}/pms`).then((r) => r.data),

  exportPMS: (projectId: string) =>
    apiClient.get(`/projects/${projectId}/pms/export`, { responseType: 'blob' }).then((r) => r.data as Blob),
}
