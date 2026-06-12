import apiClient from './client'
import type {
  PersonPerformance,
  PerformanceSnapshot,
  DepartmentPerformance,
  LeaderboardEntry,
  ProjectPerformance,
} from '../types'

export const performanceApi = {
  getPerson: (personId: string) =>
    apiClient.get<PersonPerformance>(`/performance/person/${personId}`).then((r) => r.data),

  getPersonHistory: (personId: string, days = 90) =>
    apiClient
      .get<PerformanceSnapshot[]>(`/performance/person/${personId}/history`, {
        params: { days },
      })
      .then((r) => r.data),

  getDepartment: (department: string) =>
    apiClient
      .get<DepartmentPerformance>(`/performance/department/${encodeURIComponent(department)}`)
      .then((r) => r.data),

  getLeaderboard: (department?: string, limit = 10) =>
    apiClient
      .get<LeaderboardEntry[]>('/performance/leaderboard', {
        params: { department, limit },
      })
      .then((r) => r.data),

  getProject: (projectId: string) =>
    apiClient.get<ProjectPerformance>(`/performance/project/${projectId}`).then((r) => r.data),
}
