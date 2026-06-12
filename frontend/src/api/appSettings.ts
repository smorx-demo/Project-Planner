import apiClient from './client'

export const appSettingsApi = {
  getAll: () =>
    apiClient.get<Record<string, string[]>>('/settings/').then((r) => r.data),

  get: (key: string) =>
    apiClient.get<string[]>(`/settings/${key}`).then((r) => r.data),

  update: (key: string, value: string[]) =>
    apiClient.put<string[]>(`/settings/${key}`, { value }).then((r) => r.data),
}
