import apiClient from './client'
import type {
  AppNotification,
  NotificationRule,
  NotificationsResponse,
  NotificationType,
} from '../types'

export const notificationsApi = {
  list: (unreadOnly = false) =>
    apiClient
      .get<NotificationsResponse>('/notifications', {
        params: { unread_only: unreadOnly },
        skipAuthRedirect: true,
      })
      .then((r) => r.data),

  markRead: (id: string) =>
    apiClient.patch<AppNotification>(`/notifications/${id}/read`).then((r) => r.data),

  markAllRead: () =>
    apiClient.patch('/notifications/read-all').then((r) => r.data),

  listRules: () =>
    apiClient.get<NotificationRule[]>('/notifications/rules').then((r) => r.data),

  createRule: (payload: {
    trigger_type: NotificationType
    project_id?: string
    threshold_days?: number
    channels: string[]
  }) => apiClient.post<NotificationRule>('/notifications/rules', payload).then((r) => r.data),

  updateRule: (
    id: string,
    payload: { is_active?: boolean; threshold_days?: number; channels?: string[] },
  ) => apiClient.put<NotificationRule>(`/notifications/rules/${id}`, payload).then((r) => r.data),

  deleteRule: (id: string) =>
    apiClient.delete(`/notifications/rules/${id}`).then((r) => r.data),

  sendTestEmail: () =>
    apiClient.post<{ sent_to: string }>('/notifications/test-email').then((r) => r.data),
}
